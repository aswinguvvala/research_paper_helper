import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

import {
  EducationLevel,
  DocumentChunk,
  ChatRequest,
  ChatResponse,
  HighlightedContent
} from '../../types';
import { ragService, RAGContext } from '../langchain/rag-service';
import { contextManager, ConversationContext } from '../langchain/context-manager';
import { vectorStore, SearchStrategy } from '../document/vector-store';
import config from '../../config';
import logger from '../../utils/logger';

// Workflow State Schemas
const AssessmentState = z.object({
  documentId: z.string(),
  sessionId: z.string(),
  query: z.string(),
  educationLevel: z.string(),
  highlightedContent: z.optional(z.any()),
  complexity: z.number(),
  requiredBackground: z.array(z.string()),
  userKnowledge: z.number(),
  adaptationStrategy: z.string()
});

const ExplanationState = z.object({
  documentId: z.string(),
  sessionId: z.string(),
  query: z.string(),
  educationLevel: z.string(),
  context: z.array(z.any()),
  explanation: z.string(),
  analogies: z.array(z.string()),
  examples: z.array(z.string()),
  confidence: z.number(),
  followUpQuestions: z.array(z.string())
});

const ValidationState = z.object({
  explanation: z.string(),
  educationLevel: z.string(),
  isAccurate: z.boolean(),
  isAppropriate: z.boolean(),
  improvements: z.array(z.string()),
  finalExplanation: z.string()
});

type WorkflowState = {
  documentId: string;
  sessionId: string;
  query: string;
  educationLevel: EducationLevel;
  highlightedContent?: HighlightedContent;
  context?: DocumentChunk[];
  explanation?: string;
  analogies?: string[];
  examples?: string[];
  confidence?: number;
  followUpQuestions?: string[];
  complexity?: number;
  requiredBackground?: string[];
  userKnowledge?: number;
  adaptationStrategy?: string;
  isAccurate?: boolean;
  isAppropriate?: boolean;
  improvements?: string[];
  finalExplanation?: string;
  messages: BaseMessage[];
};

export class WorkflowService {
  private llm: ChatOpenAI;
  private assessmentWorkflow: StateGraph<WorkflowState>;
  private researchAnalysisWorkflow: StateGraph<WorkflowState>;

  constructor() {
    if (!config.ai?.openai?.apiKey) {
      logger.warn('OpenAI API key not configured. LangGraph workflow service will have limited functionality.');
      this.llm = null as any;
    } else {
      this.llm = new ChatOpenAI({
        modelName: config.ai.openai.model,
        temperature: config.ai.langchain.temperature,
        maxTokens: config.ai.langchain.maxTokens,
        openAIApiKey: config.ai.openai.apiKey,
      });
    }

    this.setupAssessmentWorkflow();
    this.setupResearchAnalysisWorkflow();
  }

  private setupAssessmentWorkflow(): void {
    this.assessmentWorkflow = new StateGraph({
      channels: {
        documentId: 'string',
        sessionId: 'string',
        query: 'string',
        educationLevel: 'string',
        highlightedContent: 'optional',
        context: 'array',
        explanation: 'string',
        analogies: 'array',
        examples: 'array',
        confidence: 'number',
        followUpQuestions: 'array',
        complexity: 'number',
        requiredBackground: 'array',
        userKnowledge: 'number',
        adaptationStrategy: 'string',
        isAccurate: 'boolean',
        isAppropriate: 'boolean',
        improvements: 'array',
        finalExplanation: 'string',
        messages: 'array'
      }
    });

    // Define workflow nodes
    this.assessmentWorkflow.addNode('assess_complexity', this.assessComplexity.bind(this));
    this.assessmentWorkflow.addNode('retrieve_context', this.retrieveContext.bind(this));
    this.assessmentWorkflow.addNode('generate_explanation', this.generateExplanation.bind(this));
    this.assessmentWorkflow.addNode('validate_explanation', this.validateExplanation.bind(this));
    this.assessmentWorkflow.addNode('refine_explanation', this.refineExplanation.bind(this));

    // Define workflow edges
    this.assessmentWorkflow.addEdge(START, 'assess_complexity');
    this.assessmentWorkflow.addEdge('assess_complexity', 'retrieve_context');
    this.assessmentWorkflow.addEdge('retrieve_context', 'generate_explanation');
    this.assessmentWorkflow.addEdge('generate_explanation', 'validate_explanation');
    
    // Conditional edge based on validation
    this.assessmentWorkflow.addConditionalEdges(
      'validate_explanation',
      this.shouldRefine.bind(this),
      {
        refine: 'refine_explanation',
        end: END
      }
    );
    
    this.assessmentWorkflow.addEdge('refine_explanation', END);
  }

  private setupResearchAnalysisWorkflow(): void {
    this.researchAnalysisWorkflow = new StateGraph({
      channels: {
        documentId: 'string',
        sessionId: 'string',
        query: 'string',
        educationLevel: 'string',
        analysisType: 'string',
        methodology: 'object',
        findings: 'array',
        limitations: 'array',
        implications: 'array',
        critiques: 'array',
        futureDirections: 'array',
        messages: 'array'
      }
    });

    // Research analysis nodes
    this.researchAnalysisWorkflow.addNode('analyze_methodology', this.analyzeMethodology.bind(this));
    this.researchAnalysisWorkflow.addNode('evaluate_findings', this.evaluateFindings.bind(this));
    this.researchAnalysisWorkflow.addNode('identify_limitations', this.identifyLimitations.bind(this));
    this.researchAnalysisWorkflow.addNode('assess_implications', this.assessImplications.bind(this));
    this.researchAnalysisWorkflow.addNode('generate_critique', this.generateCritique.bind(this));
    this.researchAnalysisWorkflow.addNode('suggest_future_work', this.suggestFutureWork.bind(this));

    // Define workflow edges
    this.researchAnalysisWorkflow.addEdge(START, 'analyze_methodology');
    this.researchAnalysisWorkflow.addEdge('analyze_methodology', 'evaluate_findings');
    this.researchAnalysisWorkflow.addEdge('evaluate_findings', 'identify_limitations');
    this.researchAnalysisWorkflow.addEdge('identify_limitations', 'assess_implications');
    this.researchAnalysisWorkflow.addEdge('assess_implications', 'generate_critique');
    this.researchAnalysisWorkflow.addEdge('generate_critique', 'suggest_future_work');
    this.researchAnalysisWorkflow.addEdge('suggest_future_work', END);
  }

  // Adaptive Explanation Workflow Methods
  async processAdaptiveExplanation(request: ChatRequest, context: RAGContext): Promise<ChatResponse> {
    const startTime = Date.now();
    
    logger.info('🚀 Processing adaptive explanation workflow', {
      sessionId: context.sessionId,
      documentId: context.documentId,
      educationLevel: context.educationLevel,
      query: request.message.substring(0, 100) + '...',
      hasHighlightedText: !!request.highlightedText,
      highlightedTextLength: request.highlightedText?.text?.length || 0
    });

    // Log highlighted text details for debugging
    if (request.highlightedText?.text) {
      logger.info('📝 Highlighted text detected', {
        highlightedText: request.highlightedText.text.substring(0, 200) + '...',
        keyTermsExtracted: this.extractKeyTerms(request.highlightedText.text).slice(0, 5),
        sessionId: context.sessionId
      });
    }

    const initialState: WorkflowState = {
      documentId: context.documentId,
      sessionId: context.sessionId,
      query: request.message,
      educationLevel: context.educationLevel,
      highlightedContent: request.highlightedText,
      messages: []
    };

    try {
      const workflow = this.assessmentWorkflow.compile();
      const result = await workflow.invoke(initialState);

      const finalContent = result.finalExplanation || result.explanation || 'I apologize, but I could not generate an explanation.';

      // Validate final response for debugging
      if (request.highlightedText?.text) {
        const isContextual = this.validateContextualRelevance(request.highlightedText.text, finalContent);
        logger.info('🔍 Final response contextual analysis', {
          isContextual,
          responseLength: finalContent.length,
          containsHighlightedTerms: this.extractKeyTerms(request.highlightedText.text)
            .some(term => finalContent.toLowerCase().includes(term.toLowerCase())),
          sessionId: context.sessionId
        });
      }

      const response: ChatResponse = {
        message: {
          id: `msg_${Date.now()}`,
          role: 'assistant' as any,
          content: finalContent,
          timestamp: new Date(),
          metadata: {
            educationLevel: context.educationLevel,
            confidence: result.confidence || 0.5,
            tokens: this.estimateTokens(finalContent),
            highlightedText: request.highlightedText,
            workflowSteps: {
              complexity: result.complexity,
              contextRetrieved: result.context?.length || 0,
              wasRefined: !!result.finalExplanation,
              validationPassed: result.isAccurate && result.isAppropriate
            }
          }
        },
        citations: [],
        suggestedQuestions: result.followUpQuestions || [],
        processingTime: Date.now() - startTime
      };

      logger.info('✅ Adaptive explanation workflow completed', {
        sessionId: context.sessionId,
        processingTime: Date.now() - startTime,
        responseLength: finalContent.length,
        confidence: result.confidence,
        wasRefined: !!result.finalExplanation
      });

      return response;
    } catch (error) {
      logger.error('❌ Adaptive explanation workflow failed', { 
        error: error.message, 
        stack: error.stack,
        sessionId: context.sessionId,
        hasHighlightedText: !!request.highlightedText
      });
      throw error;
    }
  }

  private async assessComplexity(state: WorkflowState): Promise<Partial<WorkflowState>> {
    const complexityPrompt = `Analyze the complexity of this question about a research paper:

Question: "${state.query}"
Education Level: ${state.educationLevel}

Rate the complexity on a scale of 1-10 and identify required background knowledge:
- 1-3: Basic concepts, minimal background needed
- 4-6: Intermediate concepts, some domain knowledge needed  
- 7-10: Advanced concepts, significant expertise needed

Respond in this format:
Complexity: [number]
Background: [list of required concepts]
Strategy: [explanation approach]`;

    const response = await this.llm.invoke(complexityPrompt);
    const content = response.content as string;

    // Parse the response (simple parsing - in production, use more robust parsing)
    const complexityMatch = content.match(/Complexity:\s*(\d+)/);
    const backgroundMatch = content.match(/Background:\s*(.+)/);
    const strategyMatch = content.match(/Strategy:\s*(.+)/);

    return {
      complexity: complexityMatch ? parseInt(complexityMatch[1]) : 5,
      requiredBackground: backgroundMatch ? backgroundMatch[1].split(',').map(s => s.trim()) : [],
      adaptationStrategy: strategyMatch ? strategyMatch[1].trim() : 'balanced explanation',
      userKnowledge: this.mapEducationToKnowledge(state.educationLevel)
    };
  }

  private async retrieveContext(state: WorkflowState): Promise<Partial<WorkflowState>> {
    let searchQuery: string;
    let searchOptions: any;

    if (state.highlightedContent?.text) {
      // When highlighted text is provided, prioritize it in the search
      const highlightedText = state.highlightedContent.text;
      
      // Extract key technical terms from highlighted text for better search
      const keyTerms = this.extractKeyTerms(highlightedText);
      
      // Use highlighted text as primary search query with original question as secondary
      searchQuery = `${highlightedText} ${keyTerms.join(' ')} ${state.query}`;
      
      searchOptions = {
        strategy: SearchStrategy.CONTEXTUAL,
        limit: 8, // Get more context when highlighted text is available
        similarityThreshold: 0.5, // Lower threshold to get more relevant context
        boostFactors: {
          highlightedContent: 2.0 // Boost relevance of highlighted content
        }
      };
      
      logger.info('Retrieving context with highlighted text priority', {
        highlightedLength: highlightedText.length,
        keyTerms: keyTerms.slice(0, 3),
        sessionId: state.sessionId
      });
    } else {
      searchQuery = state.query;
      searchOptions = {
        strategy: SearchStrategy.CONTEXTUAL,
        limit: 6,
        similarityThreshold: 0.6
      };
      
      logger.info('Retrieving context without highlighted text', {
        queryLength: state.query.length,
        sessionId: state.sessionId
      });
    }

    const searchResults = await vectorStore.advancedSearch(
      searchQuery,
      state.documentId,
      searchOptions
    );

    logger.info('Context retrieval results', {
      resultsCount: searchResults.length,
      avgSimilarity: searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length,
      sessionId: state.sessionId
    });

    return {
      context: searchResults.map(result => result.chunk)
    };
  }

  private extractKeyTerms(text: string): string[] {
    // Extract important technical terms from highlighted text
    const technicalTerms = text
      .toLowerCase()
      .match(/\b(?:neural networks?|lstm|deep learning|sequence|model|algorithm|training|data|performance|analysis|method|approach|results?|findings?|study|research)\b/g) || [];
    
    // Extract capitalized terms (likely important concepts)
    const capitalizedTerms = text
      .match(/\b[A-Z][A-Za-z]{2,}\b/g) || [];
    
    // Extract acronyms
    const acronyms = text
      .match(/\b[A-Z]{2,}\b/g) || [];
    
    // Combine and deduplicate
    return [...new Set([...technicalTerms, ...capitalizedTerms.map(t => t.toLowerCase()), ...acronyms])];
  }

  private async generateExplanation(state: WorkflowState): Promise<Partial<WorkflowState>> {
    const explanationPrompt = this.buildExplanationPrompt(state);
    const response = await this.llm.invoke(explanationPrompt);
    
    // Parse response to extract different components
    const content = response.content as string;
    const sections = this.parseExplanationResponse(content);

    return {
      explanation: sections.explanation,
      analogies: sections.analogies,
      examples: sections.examples,
      followUpQuestions: sections.followUpQuestions,
      confidence: 0.8 // Initial confidence
    };
  }

  private async validateExplanation(state: WorkflowState): Promise<Partial<WorkflowState>> {
    // Build highlighted text validation section
    const highlightedTextValidation = state.highlightedContent 
      ? `
Highlighted Text: "${state.highlightedContent.text}"
CRITICAL: Check if the explanation specifically addresses the highlighted text and mentions the key concepts from it.` 
      : '';

    const validationPrompt = `Evaluate this explanation for accuracy and appropriateness:

Original Question: ${state.query}
Education Level: ${state.educationLevel}
Explanation: ${state.explanation}
${highlightedTextValidation}

Check for:
1. Scientific accuracy
2. Appropriate complexity for education level
3. Clear and understandable language
4. Logical flow and coherence
${state.highlightedContent ? '5. SPECIFIC RELEVANCE: Does the explanation directly address the highlighted text and its concepts?' : ''}
${state.highlightedContent ? '6. CONTEXTUAL ACCURACY: Does the explanation avoid generic examples and focus on the actual content?' : ''}

Respond with:
Accurate: [yes/no]
Appropriate: [yes/no]
${state.highlightedContent ? 'Contextual: [yes/no - does it address the highlighted text specifically?]' : ''}
Improvements: [list of suggested improvements]`;

    const response = await this.llm.invoke(validationPrompt);
    const content = response.content as string;

    const accurateMatch = content.match(/Accurate:\s*(yes|no)/i);
    const appropriateMatch = content.match(/Appropriate:\s*(yes|no)/i);
    const contextualMatch = content.match(/Contextual:\s*(yes|no)/i);
    const improvementsMatch = content.match(/Improvements:\s*(.+)/);

    // Additional validation for highlighted text relevance
    let isContextual = true;
    if (state.highlightedContent && state.explanation) {
      isContextual = this.validateContextualRelevance(state.highlightedContent.text, state.explanation);
      
      if (!isContextual) {
        logger.warn('AI response failed contextual relevance check', {
          highlightedText: state.highlightedContent.text.substring(0, 100),
          responseLength: state.explanation.length,
          sessionId: state.sessionId
        });
      }
    }

    const validationResult = {
      isAccurate: accurateMatch ? accurateMatch[1].toLowerCase() === 'yes' : true,
      isAppropriate: appropriateMatch ? appropriateMatch[1].toLowerCase() === 'yes' : true,
      improvements: improvementsMatch ? improvementsMatch[1].split(',').map(s => s.trim()) : []
    };

    // If we have highlighted text, also check contextual relevance
    if (state.highlightedContent) {
      const aiSaysContextual = contextualMatch ? contextualMatch[1].toLowerCase() === 'yes' : false;
      const actuallyContextual = isContextual;
      
      // If either validation method says it's not contextual, flag for refinement
      if (!aiSaysContextual || !actuallyContextual) {
        validationResult.improvements.push('Make the explanation more specific to the highlighted text');
        validationResult.improvements.push('Remove generic examples and focus on the actual research content');
        
        logger.info('Validation flagged response for contextual improvement', {
          aiSaysContextual,
          actuallyContextual,
          sessionId: state.sessionId
        });
      }
    }

    return validationResult;
  }

  private validateContextualRelevance(highlightedText: string, explanation: string): boolean {
    // Extract key terms from highlighted text
    const keyTerms = this.extractKeyTerms(highlightedText);
    
    // Check if explanation mentions key terms from highlighted text
    const explanationLower = explanation.toLowerCase();
    const mentionedTerms = keyTerms.filter(term => explanationLower.includes(term.toLowerCase()));
    
    // Check for generic phrases that indicate non-contextual response
    const genericPhrases = [
      'cellular signaling pathways',
      'for instance, if',
      'for example, if the highlighted text discusses',
      'let\'s say the highlighted text',
      'suppose the text mentions'
    ];
    
    const hasGenericPhrases = genericPhrases.some(phrase => 
      explanationLower.includes(phrase.toLowerCase())
    );
    
    // Response is contextual if:
    // 1. It mentions at least 25% of key terms from highlighted text, AND
    // 2. It doesn't contain generic placeholder phrases
    const termRelevanceRatio = keyTerms.length > 0 ? mentionedTerms.length / keyTerms.length : 0;
    
    logger.debug('Contextual relevance analysis', {
      keyTermsCount: keyTerms.length,
      mentionedTermsCount: mentionedTerms.length,
      termRelevanceRatio,
      hasGenericPhrases,
      isContextual: termRelevanceRatio >= 0.25 && !hasGenericPhrases
    });
    
    return termRelevanceRatio >= 0.25 && !hasGenericPhrases;
  }

  private async refineExplanation(state: WorkflowState): Promise<Partial<WorkflowState>> {
    // Build specific guidance for highlighted text refinement
    const highlightedTextGuidance = state.highlightedContent 
      ? `
🎯 HIGHLIGHTED TEXT THAT MUST BE ADDRESSED:
"${state.highlightedContent.text}"

KEY REQUIREMENTS FOR REFINEMENT:
- Analyze the specific technical terms and concepts in the highlighted text
- Do NOT use generic examples like "cellular signaling pathways"  
- Reference actual terms from the highlighted text like: ${this.extractKeyTerms(state.highlightedContent.text).slice(0, 5).join(', ')}
- Connect your explanation directly to the research content provided` 
      : '';

    const refinementPrompt = `Improve this explanation based on the feedback:

Original Explanation: ${state.explanation}
Issues to Address: ${state.improvements?.join(', ')}
Education Level: ${state.educationLevel}
${highlightedTextGuidance}

CRITICAL INSTRUCTIONS FOR REFINEMENT:
1. If highlighted text is provided, your refined explanation MUST specifically analyze that text
2. Use the exact technical terms and concepts from the highlighted content
3. Remove any generic examples or template phrases
4. Ensure the explanation is directly relevant to the research paper content
5. Maintain appropriate complexity for the education level

Provide a refined explanation that addresses these issues while maintaining accuracy and appropriate complexity.

REFINED EXPLANATION:`;

    const response = await this.llm.invoke(refinementPrompt);
    
    const refinedContent = response.content as string;
    
    // Log refinement details for debugging
    logger.info('Explanation refined', {
      originalLength: state.explanation?.length || 0,
      refinedLength: refinedContent.length,
      improvementsCount: state.improvements?.length || 0,
      hasHighlightedText: !!state.highlightedContent,
      sessionId: state.sessionId
    });
    
    return {
      finalExplanation: refinedContent,
      confidence: 0.9 // Higher confidence after refinement
    };
  }

  private shouldRefine(state: WorkflowState): string {
    const needsRefinement = !state.isAccurate || !state.isAppropriate || 
                           (state.improvements && state.improvements.length > 0);
    return needsRefinement ? 'refine' : 'end';
  }

  // Research Analysis Workflow Methods
  async processResearchAnalysis(
    documentId: string,
    analysisType: 'methodology' | 'findings' | 'critique' | 'implications',
    educationLevel: EducationLevel
  ): Promise<any> {
    const initialState: any = {
      documentId,
      sessionId: `analysis_${Date.now()}`,
      query: `Analyze the ${analysisType} of this research paper`,
      educationLevel,
      analysisType,
      messages: []
    };

    const workflow = this.researchAnalysisWorkflow.compile();
    return await workflow.invoke(initialState);
  }

  private async analyzeMethodology(state: any): Promise<Partial<any>> {
    // Get methodology sections
    const methodologyResults = await vectorStore.advancedSearch(
      'methodology methods approach experimental design',
      state.documentId,
      {
        strategy: SearchStrategy.SEMANTIC_ONLY,
        sectionTypes: ['methodology'],
        limit: 5
      }
    );

    const methodologyContent = methodologyResults
      .map(result => result.chunk.content)
      .join('\n\n');

    const analysisPrompt = `Analyze the methodology described in this research paper:

${methodologyContent}

Provide a comprehensive analysis covering:
1. Research design and approach
2. Data collection methods
3. Sample size and selection criteria
4. Control variables and experimental conditions
5. Statistical analysis methods
6. Validity and reliability considerations

Education Level: ${state.educationLevel}`;

    const response = await this.llm.invoke(analysisPrompt);
    
    return {
      methodology: {
        analysis: response.content,
        strengths: [],
        weaknesses: [],
        suggestions: []
      }
    };
  }

  private async evaluateFindings(state: any): Promise<Partial<any>> {
    const findingsResults = await vectorStore.advancedSearch(
      'results findings data analysis outcomes',
      state.documentId,
      {
        strategy: SearchStrategy.SEMANTIC_ONLY,
        sectionTypes: ['results'],
        limit: 5
      }
    );

    const findingsContent = findingsResults
      .map(result => result.chunk.content)
      .join('\n\n');

    const evaluationPrompt = `Evaluate the findings presented in this research:

${findingsContent}

Assess:
1. Statistical significance and effect sizes
2. Practical significance and real-world impact
3. Consistency with hypotheses
4. Quality of data presentation
5. Interpretation accuracy

Education Level: ${state.educationLevel}`;

    const response = await this.llm.invoke(evaluationPrompt);
    
    return {
      findings: [{
        evaluation: response.content,
        significance: 'high',
        reliability: 'good'
      }]
    };
  }

  private async identifyLimitations(state: any): Promise<Partial<any>> {
    const limitationsPrompt = `Based on the methodology and findings, identify potential limitations of this research:

Consider:
1. Sample limitations (size, representativeness, selection bias)
2. Methodological constraints
3. Data collection limitations
4. Analytical limitations
5. Generalizability concerns
6. Temporal limitations

Provide specific, constructive identification of limitations.`;

    const response = await this.llm.invoke(limitationsPrompt);
    
    return {
      limitations: [response.content]
    };
  }

  private async assessImplications(state: any): Promise<Partial<any>> {
    const implicationsPrompt = `Analyze the broader implications of this research:

Consider implications for:
1. Theory development
2. Practice and applications
3. Policy recommendations
4. Future research directions
5. Societal impact

Education Level: ${state.educationLevel}`;

    const response = await this.llm.invoke(implicationsPrompt);
    
    return {
      implications: [response.content]
    };
  }

  private async generateCritique(state: any): Promise<Partial<any>> {
    const critiquePrompt = `Provide a balanced, constructive critique of this research:

Methodology Analysis: ${state.methodology?.analysis}
Key Findings: ${state.findings?.[0]?.evaluation}
Identified Limitations: ${state.limitations?.[0]}

Provide:
1. Strengths of the research
2. Areas for improvement
3. Alternative approaches that could have been considered
4. Overall assessment of contribution to the field

Education Level: ${state.educationLevel}`;

    const response = await this.llm.invoke(critiquePrompt);
    
    return {
      critiques: [response.content]
    };
  }

  private async suggestFutureWork(state: any): Promise<Partial<any>> {
    const futureWorkPrompt = `Based on this research analysis, suggest future research directions:

Current Research: ${state.methodology?.analysis}
Limitations: ${state.limitations?.[0]}
Implications: ${state.implications?.[0]}

Suggest:
1. Direct extensions of this work
2. Related research questions that emerged
3. Methodological improvements for future studies
4. Cross-disciplinary opportunities
5. Long-term research programs

Education Level: ${state.educationLevel}`;

    const response = await this.llm.invoke(futureWorkPrompt);
    
    return {
      futureDirections: [response.content]
    };
  }

  // Utility Methods
  private buildExplanationPrompt(state: WorkflowState): string {
    const contextStr = state.context
      ?.map((chunk, index) => `[${index + 1}] ${chunk.content}`)
      .join('\n\n') || '';

    const educationGuidance = this.getEducationGuidance(state.educationLevel);
    const complexityGuidance = this.getComplexityGuidance(state.complexity || 5);

    // Build highlighted text section with strong emphasis
    const highlightedTextSection = state.highlightedContent 
      ? `
🎯 CRITICAL: The user has highlighted this specific text from the research paper:
"${state.highlightedContent.text}"

YOU MUST analyze this exact highlighted text. Do NOT provide generic examples or talk about unrelated topics like "cellular signaling pathways" or other placeholder content. Focus specifically on the concepts, terms, and ideas mentioned in the highlighted text above.` 
      : '';

    return `You are an AI research paper tutor providing explanations adapted for ${state.educationLevel} level understanding.

${highlightedTextSection}

Context from research paper:
${contextStr}

Question: ${state.query}

${educationGuidance}
${complexityGuidance}

IMPORTANT INSTRUCTIONS:
1. If highlighted text is provided, your explanation MUST focus specifically on that highlighted content
2. Analyze the actual technical terms, concepts, and ideas mentioned in the highlighted text
3. Do NOT use generic examples or templates - respond to the specific content provided
4. Connect your explanation directly to the highlighted text and research context
5. If you don't understand the highlighted text, ask for clarification rather than providing generic content

Provide a comprehensive response with:
EXPLANATION: [Detailed analysis of the highlighted text and/or question, using specific terms from the content]
ANALOGIES: [Analogies that relate specifically to the highlighted concepts, not generic ones]
EXAMPLES: [Concrete examples that relate to the actual research content]
FOLLOW_UP: [3 relevant follow-up questions about the specific highlighted content]

Response:`;
  }

  private getEducationGuidance(educationLevel: EducationLevel): string {
    const guidanceMap = {
      [EducationLevel.HIGH_SCHOOL]: 'Use simple language, avoid jargon, provide concrete examples from everyday life.',
      [EducationLevel.NO_TECHNICAL]: 'Use plain language, focus on practical implications, avoid technical details.',
      [EducationLevel.UNDERGRADUATE]: 'Use appropriate academic language, connect to foundational concepts, explain technical terms.',
      [EducationLevel.MASTERS]: 'Use advanced academic language, discuss implications for current research.',
      [EducationLevel.PHD]: 'Use expert-level language, provide methodological critique and research implications.'
    };

    return guidanceMap[educationLevel] || guidanceMap[EducationLevel.UNDERGRADUATE];
  }

  private getComplexityGuidance(complexity: number): string {
    if (complexity <= 3) {
      return 'Keep the explanation simple and straightforward with minimal background assumptions.';
    } else if (complexity <= 6) {
      return 'Provide moderate detail with some background context as needed.';
    } else {
      return 'Provide comprehensive explanation with full context and technical detail.';
    }
  }

  private parseExplanationResponse(content: string): {
    explanation: string;
    analogies: string[];
    examples: string[];
    followUpQuestions: string[];
  } {
    const explanationMatch = content.match(/EXPLANATION:\s*([\s\S]*?)(?=ANALOGIES:|EXAMPLES:|FOLLOW_UP:|$)/);
    const analogiesMatch = content.match(/ANALOGIES:\s*([\s\S]*?)(?=EXAMPLES:|FOLLOW_UP:|$)/);
    const examplesMatch = content.match(/EXAMPLES:\s*([\s\S]*?)(?=FOLLOW_UP:|$)/);
    const followUpMatch = content.match(/FOLLOW_UP:\s*([\s\S]*?)$/);

    return {
      explanation: explanationMatch ? explanationMatch[1].trim() : content,
      analogies: analogiesMatch ? this.parseListItems(analogiesMatch[1]) : [],
      examples: examplesMatch ? this.parseListItems(examplesMatch[1]) : [],
      followUpQuestions: followUpMatch ? this.parseListItems(followUpMatch[1]) : []
    };
  }

  private parseListItems(text: string): string[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^[-*•]\s*/, ''))
      .slice(0, 5); // Limit to 5 items
  }

  private mapEducationToKnowledge(educationLevel: EducationLevel): number {
    const knowledgeMap = {
      [EducationLevel.HIGH_SCHOOL]: 3,
      [EducationLevel.NO_TECHNICAL]: 2,
      [EducationLevel.UNDERGRADUATE]: 5,
      [EducationLevel.MASTERS]: 7,
      [EducationLevel.PHD]: 9
    };

    return knowledgeMap[educationLevel] || 5;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export const workflowService = new WorkflowService();