# Research Paper Assistant

An AI-powered research paper reading assistant that transforms dense academic papers into accessible, interactive learning experiences. Built with local embeddings and cloud-based language models for cost-effective, sophisticated document analysis.

## Features

- 🎯 **Intelligent Highlighting**: Select any text in a PDF and get contextual explanations adapted to your education level
- 🧠 **Local AI Processing**: Uses sentence-transformers for efficient, cost-effective embedding generation
- 💬 **Contextual Chat**: Have natural conversations about research papers with proper citations
- 📚 **Education Level Adaptation**: Explanations tailored from high school to PhD level
- 🔍 **Advanced RAG**: Sophisticated retrieval-augmented generation using LangChain and LangGraph
- 📱 **Professional UI**: Responsive split-pane interface with PDF viewer and chat

## Architecture

- **Frontend**: React 18+ with TypeScript, Tailwind CSS
- **Backend**: Node.js with Express, TypeScript
- **AI Service**: Python Flask microservice with sentence-transformers
- **Vector Storage**: Local SQLite with vector extensions
- **AI Orchestration**: LangChain + LangGraph workflows
- **Language Model**: OpenAI GPT-4o-mini (cost-optimized)

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+
- Git

### Installation

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd research-paper-assistant
\`\`\`

2. Install all dependencies:
\`\`\`bash
npm run install:all
\`\`\`

3. Set up environment variables:
\`\`\`bash
# Copy example environment files
cp server/.env.example server/.env
cp client/.env.example client/.env
\`\`\`

4. Add your OpenAI API key to \`server/.env\`:
\`\`\`
OPENAI_API_KEY=your_openai_api_key_here
\`\`\`

### Development

Start all services:
\`\`\`bash
npm run dev
\`\`\`

This starts:
- Client (React): http://localhost:3000
- Server (Node.js): http://localhost:8000
- AI Service (Python): http://localhost:5000

## Project Structure

\`\`\`
research-paper-assistant/
├── client/          # React TypeScript frontend
├── server/          # Node.js Express backend
├── ai-service/      # Python Flask embedding service
├── shared/          # Shared TypeScript interfaces
└── docs/           # Documentation
\`\`\`

## Usage

1. **Upload PDF**: Upload a research paper through the web interface
2. **Select Education Level**: Choose your background level for appropriate explanations
3. **Highlight Text**: Select any text in the PDF to get contextual explanations
4. **Chat**: Ask questions about the paper content
5. **Explore**: Use follow-up suggestions to dive deeper into concepts

## Technologies

### Frontend Stack
- **React 18+** with TypeScript for type-safe development
- **Tailwind CSS** for rapid, responsive styling
- **react-pdf** for PDF rendering and text extraction
- **Custom highlighting** using DOM Range API

### Backend Stack
- **Node.js** with Express and TypeScript
- **LangChain.js** for AI workflow orchestration
- **LangGraph** for complex reasoning workflows
- **SQLite** with vector extensions for local storage

### AI Stack
- **sentence-transformers** (Python) for local embedding generation
- **OpenAI GPT-4o-mini** for cost-effective text generation
- **Custom vector search** with cosine similarity
- **Advanced retrieval strategies** (semantic, structural, contextual)

## Development Principles

- **Cost-Effective**: Local embeddings + strategic cloud API usage
- **Production-Ready**: Comprehensive error handling, logging, monitoring
- **Type-Safe**: TypeScript throughout the entire stack
- **Scalable**: Microservice architecture with clear separation of concerns
- **User-Focused**: Education level adaptation and intuitive UX

## Contributing

1. Fork the repository
2. Create a feature branch: \`git checkout -b feature/amazing-feature\`
3. Commit your changes: \`git commit -m 'Add amazing feature'\`
4. Push to the branch: \`git push origin feature/amazing-feature\`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with modern AI/ML engineering best practices
- Designed for data science and ML engineering portfolio demonstration
- Optimized for cost-effective deployment and scaling