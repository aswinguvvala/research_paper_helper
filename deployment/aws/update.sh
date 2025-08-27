#!/bin/bash

# Research Paper Helper - Update Script for AWS Deployment
# This script updates the running application to the latest version

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
APP_NAME="research-paper-helper"
DEPLOY_DIR="/opt/$APP_NAME"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

print_status "🔄 Starting application update..."

# Navigate to deployment directory
cd $DEPLOY_DIR

# Create backup of current version
print_status "Creating backup..."
BACKUP_DIR="/tmp/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR
cp -r server/uploads $BACKUP_DIR/ 2>/dev/null || true

# Stop services gracefully
print_status "Stopping services..."
docker-compose -f $DOCKER_COMPOSE_FILE down

# Pull latest code
print_status "Pulling latest code..."
git fetch origin
git reset --hard origin/main
git pull origin main

# Rebuild and restart services
print_status "Rebuilding and restarting services..."
docker-compose -f $DOCKER_COMPOSE_FILE build --no-cache
docker-compose -f $DOCKER_COMPOSE_FILE up -d

# Wait for services to start
print_status "Waiting for services to start..."
sleep 30

# Health check
print_status "Performing health check..."
if curl -f -s "http://localhost/health" > /dev/null; then
    print_status "✅ Update completed successfully!"
    
    # Clean up old Docker images
    print_status "Cleaning up old Docker images..."
    docker image prune -f
    
    print_status "🎉 Application is running the latest version!"
else
    print_error "❌ Health check failed after update"
    print_warning "Attempting to restore from backup..."
    
    # Restore backup if available
    if [ -d "$BACKUP_DIR" ]; then
        cp -r $BACKUP_DIR/uploads server/ 2>/dev/null || true
    fi
    
    exit 1
fi

# Display status
print_status "Current status:"
docker-compose -f $DOCKER_COMPOSE_FILE ps