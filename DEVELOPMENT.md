# Development Guide

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+
- Git

### Automated Setup
```bash
# Clone and setup
git clone <repository-url>
cd research-paper-assistant
chmod +x setup.sh
./setup.sh
```

### Manual Setup
```bash
# Install dependencies
npm run install:all

# Setup environment files
cp server/.env.example server/.env
cp client/.env.example client/.env
cp ai-service/.env.example ai-service/.env

# Add your OpenAI API key to server/.env
```

### Running the Application
```bash
# Start all services
./dev.sh

# Or manually:
npm run dev
```

Access the application:
- **Client**: http://localhost:3000
- **Server API**: http://localhost:8000
- **AI Service**: http://localhost:5000

## Architecture Overview

### Services
1. **AI Service** (Python Flask) - Local embedding generation
2. **Server** (Node.js/Express) - API backend with OpenAI integration
3. **Client** (React/TypeScript) - Frontend with PDF viewer and chat
4. **Shared** (TypeScript) - Common types and utilities

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, TypeScript, LangChain
- **AI Service**: Python, Flask, sentence-transformers
- **Database**: SQLite with vector extensions
- **Deployment**: Docker, Docker Compose

## Project Structure

```
research-paper-assistant/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Route pages
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API services
│   │   └── utils/         # Utilities
│   ├── public/            # Static assets
│   └── package.json
├── server/                # Node.js backend
│   ├── src/
│   │   ├── config/        # Configuration
│   │   ├── middleware/    # Express middleware
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── database/      # Database layer
│   │   └── utils/         # Utilities
│   ├── data/              # SQLite database
│   ├── uploads/           # File uploads
│   └── package.json
├── ai-service/            # Python AI service
│   ├── app.py            # Flask application
│   ├── requirements.txt   # Python dependencies
│   └── test_service.py   # Service tests
├── shared/                # Shared TypeScript
│   └── src/
│       ├── types.ts      # Type definitions
│       ├── constants.ts  # Constants
│       └── utils.ts      # Utilities
└── package.json          # Root package.json
```

## Development Workflow

### Branch Strategy
- `main` - Production ready code
- `develop` - Development integration
- `feature/*` - Feature branches
- `hotfix/*` - Production fixes

### Code Standards
- **TypeScript** - Strict mode enabled
- **ESLint** - Airbnb config with custom rules
- **Prettier** - Code formatting
- **Conventional Commits** - Commit message format

### Testing
```bash
# Run all tests
npm test

# Run specific service tests
npm run test:server
npm run test:client

# AI service tests
cd ai-service && python test_service.py
```

### Building
```bash
# Build all services
npm run build

# Build specific services
npm run build:server
npm run build:client
```

## API Documentation

### Server Endpoints
- `GET /api/health` - Health check
- `POST /api/documents` - Upload document
- `GET /api/documents/:id` - Get document info
- `POST /api/chat` - Chat with document
- `POST /api/search` - Search document content

### AI Service Endpoints
- `GET /health` - Health check
- `GET /model` - Model information
- `POST /embeddings` - Generate embeddings
- `POST /similarity` - Compute similarity

## Environment Variables

### Server (.env)
```bash
NODE_ENV=development
PORT=8000
OPENAI_API_KEY=your_api_key_here
AI_SERVICE_URL=http://localhost:5000
DATABASE_URL=./data/research_assistant.sqlite
```

### Client (.env)
```bash
VITE_API_URL=http://localhost:8000
VITE_DEFAULT_EDUCATION_LEVEL=undergraduate
```

### AI Service (.env)
```bash
EMBEDDING_MODEL=all-MiniLM-L6-v2
MAX_BATCH_SIZE=32
AI_SERVICE_PORT=5000
```

## Database Schema

### Documents
- id, filename, title, authors, abstract
- uploaded_at, processed_at, total_pages
- file_size, mime_type, file_path

### Document Chunks
- id, document_id, content, embedding
- page_number, section_type, position
- confidence, bounding_box

### Conversation Sessions
- id, document_id, education_level
- created_at, updated_at, metadata

### Chat Messages
- id, session_id, role, content
- timestamp, citations, confidence

## Docker Development

### Build and Run
```bash
# Development with hot reload
docker-compose up --build

# Production build
docker-compose -f docker-compose.prod.yml up --build
```

### Service URLs (Docker)
- Client: http://localhost:3000
- Server: http://localhost:8000
- AI Service: http://localhost:5000

## Troubleshooting

### Common Issues

**AI Service fails to start**
```bash
cd ai-service
pip3 install -r requirements.txt
python3 app.py
```

**Server database errors**
```bash
rm server/data/research_assistant.sqlite
# Database will be recreated on next start
```

**Client build fails**
```bash
cd client
rm -rf node_modules
npm install
npm run build
```

**Port already in use**
```bash
# Kill processes on ports
lsof -ti:3000,8000,5000 | xargs kill -9
```

### Performance Optimization

**AI Service**
- Use GPU if available (CUDA_VISIBLE_DEVICES=0)
- Adjust batch size based on memory
- Cache embeddings for repeated queries

**Server**
- Enable compression middleware
- Use connection pooling for database
- Implement request caching

**Client**
- Use code splitting for large bundles
- Implement virtual scrolling for long documents
- Optimize PDF rendering performance

## Production Deployment

### Docker Compose Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Setup
- Set production environment variables
- Configure reverse proxy (nginx)
- Set up SSL certificates
- Configure monitoring and logging

### Scaling Considerations
- AI Service: Scale horizontally with load balancer
- Server: Use PM2 or similar for clustering
- Database: Consider PostgreSQL for production
- Static Assets: Use CDN for client files

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Pull Request Guidelines
- Include tests for new features
- Update documentation
- Follow conventional commit format
- Ensure all checks pass

## Security

### Best Practices
- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all inputs on server
- Sanitize file uploads
- Implement rate limiting
- Use HTTPS in production

### API Key Management
- Store OpenAI API key securely
- Rotate keys regularly
- Monitor usage and costs
- Implement usage limits

## Monitoring

### Development
- Console logs for debugging
- Error boundaries in React
- Health check endpoints

### Production
- Application performance monitoring
- Error tracking (Sentry)
- Log aggregation
- Resource monitoring

## Cost Optimization

### OpenAI API Usage
- Use GPT-4o-mini for cost effectiveness
- Implement response caching
- Optimize context length
- Monitor token usage

### Infrastructure
- Use local embeddings to reduce API calls
- Implement efficient caching strategies
- Optimize Docker images
- Use appropriate instance sizes

## Roadmap

### Phase 2: Document Processing (Current)
- PDF text extraction and chunking
- Vector database implementation
- Search and retrieval system

### Phase 3: LangChain Integration
- RAG pipeline implementation
- Context management
- Citation tracking

### Phase 4: Advanced Features
- LangGraph workflows
- Education-level adaptation
- UI/UX polish

### Future Enhancements
- Multi-document support
- Collaborative features
- Mobile application
- Advanced analytics