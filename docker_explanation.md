# Docker Containerization Guide - Research Paper Helper

## Table of Contents
1. [What is Docker?](#what-is-docker)
2. [Why Containerization?](#why-containerization)
3. [Your Project Architecture](#your-project-architecture)
4. [Understanding Dockerfiles](#understanding-dockerfiles)
5. [Docker Compose Deep Dive](#docker-compose-deep-dive)
6. [Container Orchestration](#container-orchestration)
7. [Best Practices](#best-practices)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Topics](#advanced-topics)

## What is Docker?

Docker is a containerization platform that packages applications and their dependencies into lightweight, portable containers. Think of it as a shipping container for your software.

### Key Concepts

**Container**: A lightweight, standalone package that includes everything needed to run an application:
- Code
- Runtime
- System tools
- Libraries
- Settings

**Image**: A read-only template used to create containers. Like a blueprint.

**Dockerfile**: A text file containing instructions to build a Docker image.

**Docker Compose**: A tool for defining and managing multi-container applications.

## Why Containerization?

### Problems Docker Solves
1. **"Works on my machine"** - Consistent environments across development, testing, and production
2. **Dependency conflicts** - Each container has its own isolated environment
3. **Deployment complexity** - Single deployment artifact (container image)
4. **Scalability issues** - Easy to scale individual services
5. **Resource efficiency** - Containers share the OS kernel, unlike VMs

### Benefits for Your Project
- **Microservices Architecture**: Your React frontend, Node.js backend, and Python AI service run independently
- **Easy Development Setup**: New team members run `docker-compose up` 
- **Production Parity**: Same containers in dev and production
- **Isolated Dependencies**: Python ML libraries don't conflict with Node.js packages

## Your Project Architecture

Your research paper helper uses a modern 3-tier architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   AI Service    │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (Python)      │
│   Port: 3000    │    │   Port: 8000    │    │   Port: 5000    │
│   nginx         │    │   Express       │    │   Flask         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Database      │
                    │   (SQLite)      │
                    │   Volume        │
                    └─────────────────┘
```

### Service Communication
- **Frontend → Backend**: HTTP requests to API endpoints
- **Backend → AI Service**: Internal HTTP calls for ML processing
- **Backend → Database**: File-based SQLite operations
- **All services**: Connected via Docker network `research-assistant-network`

## Understanding Dockerfiles

### 1. Frontend Dockerfile (Multi-stage Build)

```dockerfile
# Stage 1: Build the React application
FROM node:18-alpine as builder

WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

# Install dependencies
RUN npm ci

# Copy source and build
COPY src ./src
COPY public ./public
COPY index.html ./
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files from stage 1
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

**Key Features**:
- **Multi-stage build**: Reduces final image size by excluding build tools
- **Alpine Linux**: Minimal base image (~5MB vs ~900MB for full Ubuntu)
- **Non-root user**: Security best practice
- **nginx**: Production-ready web server for serving static files

### 2. Backend Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache python3 make g++ sqlite

# Copy package files first (better caching)
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy and build source
COPY src ./src
RUN npm run build

# Create directories and set permissions
RUN mkdir -p data uploads logs && chown -R node:node /app
USER node

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 8000, path: '/api/health', timeout: 5000 }; \
    const req = http.request(options, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); \
    req.on('error', () => process.exit(1)); req.end();"

CMD ["node", "dist/index.js"]
```

**Key Features**:
- **Layer optimization**: Package files copied first for better Docker layer caching
- **Production-only dependencies**: `--only=production` flag
- **Health checks**: Docker can monitor service health
- **Proper permissions**: Creates necessary directories with correct ownership

### 3. AI Service Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health', timeout=5)"

CMD ["python", "app.py"]
```

**Key Features**:
- **Slim base image**: python:3.11-slim vs full python image
- **Build dependencies**: gcc, g++ for compiling native extensions
- **Cache optimization**: requirements.txt copied first
- **Cleanup**: Remove package lists to reduce image size

## Docker Compose Deep Dive

Your `docker-compose.yml` orchestrates all services:

### Service Definitions

```yaml
version: '3.8'

services:
  # AI Service (Python Flask)
  ai-service:
    build:
      context: ./ai-service
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - EMBEDDING_MODEL=all-MiniLM-L6-v2
      - MAX_BATCH_SIZE=32
    volumes:
      - ./ai-service:/app                    # Development hot-reload
      - ai_models:/root/.cache/torch/sentence_transformers  # Model caching
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s                      # Extra time for model loading
    restart: unless-stopped

  # Backend Server (Node.js)
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
      - AI_SERVICE_URL=http://ai-service:5000  # Internal network communication
    volumes:
      - ./server/data:/app/data               # Database persistence
      - ./server/uploads:/app/uploads         # File uploads persistence
      - ./server/logs:/app/logs              # Log persistence
    depends_on:
      ai-service:
        condition: service_healthy           # Wait for AI service to be healthy
    restart: unless-stopped

  # Frontend Client (React)
  client:
    build:
      context: ./client
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:8000   # External API URL for browser
    depends_on:
      - server
    restart: unless-stopped

volumes:
  ai_models:                                 # Named volume for ML models
    driver: local

networks:
  default:
    name: research-assistant-network         # Custom network name
```

### Key Concepts Explained

**Service Dependencies**:
- `client` depends on `server`
- `server` depends on `ai-service` with health condition
- Services start in proper order

**Networking**:
- All services communicate via `research-assistant-network`
- Internal URLs use service names: `http://ai-service:5000`
- External URLs use localhost: `http://localhost:8000`

**Volume Management**:
- **Bind mounts**: `./server/data:/app/data` maps host directory
- **Named volumes**: `ai_models` for Docker-managed storage
- **Persistence**: Data survives container restarts

**Environment Variables**:
- Configure services without code changes
- Different values for dev/staging/production
- Secure way to pass configuration

## Container Orchestration

### Starting Your Application

```bash
# Build and start all services
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Development Workflow

```bash
# Rebuild specific service
docker-compose build server

# Restart specific service
docker-compose restart server

# Execute command in running container
docker-compose exec server npm run dev

# View container status
docker-compose ps

# Monitor resource usage
docker stats
```

### Service Scaling

```bash
# Scale backend service
docker-compose up --scale server=3

# Load balancer needed for multiple instances
docker-compose up --scale server=3 -d
```

## Best Practices

### 1. Image Optimization

```dockerfile
# ❌ Bad: Large base image
FROM ubuntu:latest

# ✅ Good: Minimal base image
FROM node:18-alpine

# ❌ Bad: Installing everything
RUN apt-get update && apt-get install -y *

# ✅ Good: Only necessary packages
RUN apk add --no-cache python3 make g++
```

### 2. Layer Caching

```dockerfile
# ❌ Bad: Changes invalidate all layers
COPY . .
RUN npm install

# ✅ Good: Dependencies cached separately
COPY package*.json ./
RUN npm install
COPY . .
```

### 3. Security

```dockerfile
# ❌ Bad: Running as root
USER root

# ✅ Good: Non-root user
RUN useradd -m appuser
USER appuser

# ❌ Bad: Secrets in Dockerfile
ENV API_KEY=secret123

# ✅ Good: Runtime secrets
# Pass via environment or mounted secrets
```

### 4. Multi-stage Builds

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

### 5. Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

## Production Deployment

### 1. Environment Configuration

Create environment-specific compose files:

**docker-compose.prod.yml**:
```yaml
version: '3.8'
services:
  server:
    image: your-registry/research-assistant-server:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/research
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

### 2. Registry and CI/CD

```bash
# Build and tag for production
docker build -t your-registry/research-assistant-server:v1.0.0 ./server

# Push to registry
docker push your-registry/research-assistant-server:v1.0.0

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 3. Monitoring and Logging

```yaml
services:
  server:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    labels:
      - "prometheus.io/scrape=true"
      - "prometheus.io/port=8000"
```

### 4. Load Balancing

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - server
```

**nginx.conf**:
```nginx
upstream backend {
    server server_1:8000;
    server server_2:8000;
    server server_3:8000;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
    }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Build Failures

```bash
# Check build context
docker build --no-cache -t my-app .

# Debug build steps
docker build --target builder -t my-app-debug .
docker run -it my-app-debug /bin/sh
```

#### 2. Permission Issues

```bash
# Fix volume permissions
docker-compose exec server chown -R node:node /app/data

# Check user in container
docker-compose exec server whoami
docker-compose exec server ls -la /app
```

#### 3. Network Issues

```bash
# Test service connectivity
docker-compose exec server curl http://ai-service:5000/health

# Check network configuration
docker network ls
docker network inspect research-assistant-network
```

#### 4. Performance Issues

```bash
# Monitor resource usage
docker stats

# Check logs for errors
docker-compose logs --tail=100 server

# Analyze container size
docker images
docker image inspect my-app:latest
```

#### 5. Development Hot Reload

```yaml
# docker-compose.dev.yml
services:
  server:
    volumes:
      - ./server/src:/app/src
    command: npm run dev
    environment:
      - NODE_ENV=development
```

### Debugging Commands

```bash
# Enter running container
docker-compose exec server /bin/sh

# Check container processes
docker-compose exec server ps aux

# View environment variables
docker-compose exec server env

# Check disk usage
docker system df
docker system prune

# Inspect container details
docker inspect research-paper-helper_server_1
```

## Advanced Topics

### 1. Multi-Architecture Builds

```dockerfile
# Support ARM64 and AMD64
FROM --platform=$BUILDPLATFORM node:18-alpine
```

```bash
# Build for multiple architectures
docker buildx build --platform linux/amd64,linux/arm64 -t my-app .
```

### 2. Docker Secrets

```yaml
services:
  server:
    secrets:
      - db_password
      - api_key

secrets:
  db_password:
    file: ./secrets/db_password.txt
  api_key:
    external: true
```

### 3. Custom Networks

```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

services:
  client:
    networks:
      - frontend
  server:
    networks:
      - frontend
      - backend
  ai-service:
    networks:
      - backend
```

### 4. Resource Constraints

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

### 5. Container Orchestration with Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: research-assistant-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: server
  template:
    metadata:
      labels:
        app: server
    spec:
      containers:
      - name: server
        image: research-assistant-server:latest
        ports:
        - containerPort: 8000
        env:
        - name: NODE_ENV
          value: "production"
```

## Next Steps

1. **Learn Kubernetes**: Container orchestration at scale
2. **CI/CD Integration**: Automate builds and deployments
3. **Security Scanning**: Vulnerability assessment tools
4. **Monitoring**: Prometheus, Grafana, ELK stack
5. **Service Mesh**: Istio, Linkerd for microservices communication

## Resources

- [Docker Official Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Best Practices Guide](https://docs.docker.com/develop/dev-best-practices/)
- [Production Checklist](https://docs.docker.com/engine/userguide/eng-image/dockerfile_best-practices/)

Your research paper helper project is an excellent example of modern containerized application architecture. It demonstrates key Docker concepts and production-ready practices that are highly valuable in today's development landscape.