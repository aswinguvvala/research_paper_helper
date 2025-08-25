"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowService = exports.WorkflowService = void 0;
const langgraph_1 = require("@langchain/langgraph");
const openai_1 = require("@langchain/openai");
const zod_1 = require("zod");
const types_1 = require("../types");
const vector_store_1 = require("../document/vector-store");
const config_1 = __importDefault(require("../../config"));
const logger_1 = __importDefault(require("../../utils/logger"));
// Workflow State Schemas
const AssessmentState = zod_1.z.object({
    documentId: zod_1.z.string(),
    sessionId: zod_1.z.string(),
    query: zod_1.z.string(),
    educationLevel: zod_1.z.string(),
    highlightedContent: zod_1.z.optional(zod_1.z.any()),
    complexity: zod_1.z.number(),
    requiredBackground: zod_1.z.array(zod_1.z.string()),
    userKnowledge: zod_1.z.number(),
    adaptationStrategy: zod_1.z.string()
});
const ExplanationState = zod_1.z.object({
    documentId: zod_1.z.string(),
    sessionId: zod_1.z.string(),
    query: zod_1.z.string(),
    educationLevel: zod_1.z.string(),
    context: zod_1.z.array(zod_1.z.any()),
    explanation: zod_1.z.string(),
    analogies: zod_1.z.array(zod_1.z.string()),
    examples: zod_1.z.array(zod_1.z.string()),
    confidence: zod_1.z.number(),
    followUpQuestions: zod_1.z.array(zod_1.z.string())
});
const ValidationState = zod_1.z.object({
    explanation: zod_1.z.string(),
    educationLevel: zod_1.z.string(),
    isAccurate: zod_1.z.boolean(),
    isAppropriate: zod_1.z.boolean(),
    improvements: zod_1.z.array(zod_1.z.string()),
    finalExplanation: zod_1.z.string()
});
class WorkflowService {
    constructor() {
        this.llm = new openai_1.ChatOpenAI({
            modelName: config_1.default.ai.openai.model,
            temperature: config_1.default.ai.langchain.temperature,
            maxTokens: config_1.default.ai.langchain.maxTokens,
            openAIApiKey: config_1.default.ai.openai.apiKey,
        });
        this.setupAssessmentWorkflow();
        this.setupResearchAnalysisWorkflow();
    }
    setupAssessmentWorkflow() {
        this.assessmentWorkflow = new langgraph_1.StateGraph({
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
        this.assessmentWorkflow.addEdge(langgraph_1.START, 'assess_complexity');
        this.assessmentWorkflow.addEdge('assess_complexity', 'retrieve_context');
        this.assessmentWorkflow.addEdge('retrieve_context', 'generate_explanation');
        this.assessmentWorkflow.addEdge('generate_explanation', 'validate_explanation');
        // Conditional edge based on validation
        this.assessmentWorkflow.addConditionalEdges('validate_explanation', this.shouldRefine.bind(this), {
            refine: 'refine_explanation',
            end: langgraph_1.END
        });
        this.assessmentWorkflow.addEdge('refine_explanation', langgraph_1.END);
    }
    setupResearchAnalysisWorkflow() {
        this.researchAnalysisWorkflow = new langgraph_1.StateGraph({
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
        this.researchAnalysisWorkflow.addEdge(langgraph_1.START, 'analyze_methodology');
        this.researchAnalysisWorkflow.addEdge('analyze_methodology', 'evaluate_findings');
        this.researchAnalysisWorkflow.addEdge('evaluate_findings', 'identify_limitations');
        this.researchAnalysisWorkflow.addEdge('identify_limitations', 'assess_implications');
        this.researchAnalysisWorkflow.addEdge('assess_implications', 'generate_critique');
        this.researchAnalysisWorkflow.addEdge('generate_critique', 'suggest_future_work');
        this.researchAnalysisWorkflow.addEdge('suggest_future_work', langgraph_1.END);
    }
    // Adaptive Explanation Workflow Methods
    async processAdaptiveExplanation(request, context) {
        const startTime = Date.now();
        logger_1.default.info('Processing adaptive explanation workflow', {
            sessionId: context.sessionId,
            documentId: context.documentId,
            educationLevel: context.educationLevel
        });
        const initialState = {
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
            const response = {
                message: {
                    id: `msg_${Date.now()}`,
                    role: 'assistant',
                    content: result.finalExplanation || result.explanation || 'I apologize, but I could not generate an explanation.',
                    timestamp: new Date(),
                    metadata: {
                        educationLevel: context.educationLevel,
                        confidence: result.confidence || 0.5,
                        tokens: this.estimateTokens(result.finalExplanation || result.explanation || '')
                    }
                },
                citations: [],
                suggestedQuestions: result.followUpQuestions || [],
                processingTime: Date.now() - startTime
            };
            return response;
        }
        catch (error) {
            logger_1.default.error('Adaptive explanation workflow failed', { error, sessionId: context.sessionId });
            throw error;
        }
    }
    async assessComplexity(state) {
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
        const content = response.content;
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
    async retrieveContext(state) {
        const searchQuery = state.highlightedContent?.text
            ? `${state.query} ${state.highlightedContent.text}`
            : state.query;
        const searchResults = await vector_store_1.vectorStore.advancedSearch(searchQuery, state.documentId, {
            strategy: vector_store_1.SearchStrategy.CONTEXTUAL,
            limit: 6,
            similarityThreshold: 0.6
        });
        return {
            context: searchResults.map(result => result.chunk)
        };
    }
    async generateExplanation(state) {
        const explanationPrompt = this.buildExplanationPrompt(state);
        const response = await this.llm.invoke(explanationPrompt);
        // Parse response to extract different components
        const content = response.content;
        const sections = this.parseExplanationResponse(content);
        return {
            explanation: sections.explanation,
            analogies: sections.analogies,
            examples: sections.examples,
            followUpQuestions: sections.followUpQuestions,
            confidence: 0.8 // Initial confidence
        };
    }
    async validateExplanation(state) {
        const validationPrompt = `Evaluate this explanation for accuracy and appropriateness:

Original Question: ${state.query}
Education Level: ${state.educationLevel}
Explanation: ${state.explanation}

Check for:
1. Scientific accuracy
2. Appropriate complexity for education level
3. Clear and understandable language
4. Logical flow and coherence

Respond with:
Accurate: [yes/no]
Appropriate: [yes/no]
Improvements: [list of suggested improvements]`;
        const response = await this.llm.invoke(validationPrompt);
        const content = response.content;
        const accurateMatch = content.match(/Accurate:\s*(yes|no)/i);
        const appropriateMatch = content.match(/Appropriate:\s*(yes|no)/i);
        const improvementsMatch = content.match(/Improvements:\s*(.+)/);
        return {
            isAccurate: accurateMatch ? accurateMatch[1].toLowerCase() === 'yes' : true,
            isAppropriate: appropriateMatch ? appropriateMatch[1].toLowerCase() === 'yes' : true,
            improvements: improvementsMatch ? improvementsMatch[1].split(',').map(s => s.trim()) : []
        };
    }
    async refineExplanation(state) {
        const refinementPrompt = `Improve this explanation based on the feedback:

Original Explanation: ${state.explanation}
Issues to Address: ${state.improvements?.join(', ')}
Education Level: ${state.educationLevel}

Provide a refined explanation that addresses these issues while maintaining accuracy and appropriate complexity.`;
        const response = await this.llm.invoke(refinementPrompt);
        return {
            finalExplanation: response.content,
            confidence: 0.9 // Higher confidence after refinement
        };
    }
    shouldRefine(state) {
        const needsRefinement = !state.isAccurate || !state.isAppropriate ||
            (state.improvements && state.improvements.length > 0);
        return needsRefinement ? 'refine' : 'end';
    }
    // Research Analysis Workflow Methods
    async processResearchAnalysis(documentId, analysisType, educationLevel) {
        const initialState = {
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
    async analyzeMethodology(state) {
        // Get methodology sections
        const methodologyResults = await vector_store_1.vectorStore.advancedSearch('methodology methods approach experimental design', state.documentId, {
            strategy: vector_store_1.SearchStrategy.SEMANTIC_ONLY,
            sectionTypes: ['methodology'],
            limit: 5
        });
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
    async evaluateFindings(state) {
        const findingsResults = await vector_store_1.vectorStore.advancedSearch('results findings data analysis outcomes', state.documentId, {
            strategy: vector_store_1.SearchStrategy.SEMANTIC_ONLY,
            sectionTypes: ['results'],
            limit: 5
        });
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
    async identifyLimitations(state) {
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
    async assessImplications(state) {
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
    async generateCritique(state) {
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
    async suggestFutureWork(state) {
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
    buildExplanationPrompt(state) {
        const contextStr = state.context
            ?.map((chunk, index) => `[${index + 1}] ${chunk.content}`)
            .join('\n\n') || '';
        const educationGuidance = this.getEducationGuidance(state.educationLevel);
        const complexityGuidance = this.getComplexityGuidance(state.complexity || 5);
        return `You are an AI tutor providing explanations adapted for ${state.educationLevel} level understanding.

Context from research paper:
${contextStr}

Question: ${state.query}
${state.highlightedContent ? `Highlighted text: "${state.highlightedContent.text}"` : ''}

${educationGuidance}
${complexityGuidance}

Provide a comprehensive response with:
EXPLANATION: [Main explanation]
ANALOGIES: [Helpful analogies if appropriate]
EXAMPLES: [Concrete examples]
FOLLOW_UP: [3 relevant follow-up questions]

Response:`;
    }
    getEducationGuidance(educationLevel) {
        const guidanceMap = {
            [types_1.EducationLevel.HIGH_SCHOOL]: 'Use simple language, avoid jargon, provide concrete examples from everyday life.',
            [types_1.EducationLevel.NO_TECHNICAL]: 'Use plain language, focus on practical implications, avoid technical details.',
            [types_1.EducationLevel.UNDERGRADUATE]: 'Use appropriate academic language, connect to foundational concepts, explain technical terms.',
            [types_1.EducationLevel.MASTERS]: 'Use advanced academic language, discuss implications for current research.',
            [types_1.EducationLevel.PHD]: 'Use expert-level language, provide methodological critique and research implications.'
        };
        return guidanceMap[educationLevel] || guidanceMap[types_1.EducationLevel.UNDERGRADUATE];
    }
    getComplexityGuidance(complexity) {
        if (complexity <= 3) {
            return 'Keep the explanation simple and straightforward with minimal background assumptions.';
        }
        else if (complexity <= 6) {
            return 'Provide moderate detail with some background context as needed.';
        }
        else {
            return 'Provide comprehensive explanation with full context and technical detail.';
        }
    }
    parseExplanationResponse(content) {
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
    parseListItems(text) {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.replace(/^[-*•]\s*/, ''))
            .slice(0, 5); // Limit to 5 items
    }
    mapEducationToKnowledge(educationLevel) {
        const knowledgeMap = {
            [types_1.EducationLevel.HIGH_SCHOOL]: 3,
            [types_1.EducationLevel.NO_TECHNICAL]: 2,
            [types_1.EducationLevel.UNDERGRADUATE]: 5,
            [types_1.EducationLevel.MASTERS]: 7,
            [types_1.EducationLevel.PHD]: 9
        };
        return knowledgeMap[educationLevel] || 5;
    }
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
}
exports.WorkflowService = WorkflowService;
exports.workflowService = new WorkflowService();
