#!/bin/bash

# Research Paper Helper - AWS EC2 Deployment Script
# This script automates the deployment of the full-stack application on AWS EC2 Free Tier

set -e

echo "🚀 Starting Research Paper Helper deployment on AWS EC2..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="research-paper-helper"
GIT_REPO="https://github.com/aswinguvvala/research_paper_helper.git"
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
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Update system packages
update_system() {
    print_status "Updating system packages..."
    apt update && apt upgrade -y
    apt install -y curl wget git unzip software-properties-common
}

# Install Docker
install_docker() {
    print_status "Installing Docker..."
    
    # Remove old versions
    apt remove -y docker docker-engine docker.io containerd runc || true
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    
    # Add current user to docker group
    usermod -aG docker ubuntu || usermod -aG docker ec2-user || true
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    print_status "Docker installed successfully"
}

# Install Docker Compose
install_docker_compose() {
    print_status "Installing Docker Compose..."
    
    # Install Docker Compose v2
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    
    # Create symlink for backward compatibility
    ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    
    print_status "Docker Compose installed successfully"
}

# Clone or update repository
setup_application() {
    print_status "Setting up application..."
    
    # Create deployment directory
    mkdir -p $DEPLOY_DIR
    cd $DEPLOY_DIR
    
    # Clone or pull latest code
    if [ -d ".git" ]; then
        print_status "Updating existing repository..."
        git pull origin main
    else
        print_status "Cloning repository..."
        git clone $GIT_REPO .
    fi
    
    # Set proper permissions
    chown -R ubuntu:ubuntu $DEPLOY_DIR || chown -R ec2-user:ec2-user $DEPLOY_DIR || true
    chmod +x deployment/aws/*.sh
}

# Configure environment
setup_environment() {
    print_status "Setting up environment configuration..."
    
    # Create production environment files
    cat > .env.production << EOL
# Production Environment Configuration
NODE_ENV=production
PORT=8000
REACT_APP_API_URL=http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000

# AI Service Configuration
AI_SERVICE_URL=http://ai-service:5000
ENVIRONMENT=production

# Upload Configuration
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE=100MB

# Security
CORS_ORIGIN=http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# Logging
LOG_LEVEL=info
EOL

    print_status "Environment configured for AWS EC2"
}

# Setup firewall and security
setup_security() {
    print_status "Configuring security settings..."
    
    # Configure UFW firewall
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow ssh
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow our application ports (for direct access if needed)
    ufw allow 8000/tcp comment "Backend API"
    ufw allow 5000/tcp comment "AI Service"
    
    # Enable firewall
    ufw --force enable
    
    print_status "Firewall configured successfully"
}

# Build and start services
deploy_services() {
    print_status "Building and starting services..."
    
    cd $DEPLOY_DIR
    
    # Stop existing services
    docker-compose -f $DOCKER_COMPOSE_FILE down || true
    
    # Remove old images to free space
    docker system prune -f
    
    # Build and start services
    docker-compose -f $DOCKER_COMPOSE_FILE build --no-cache
    docker-compose -f $DOCKER_COMPOSE_FILE up -d
    
    print_status "Services started successfully"
}

# Setup monitoring and logs
setup_monitoring() {
    print_status "Setting up monitoring and logging..."
    
    # Create log directories
    mkdir -p /var/log/$APP_NAME
    
    # Setup log rotation
    cat > /etc/logrotate.d/$APP_NAME << EOL
/var/log/$APP_NAME/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    sharedscripts
    postrotate
        docker-compose -f $DEPLOY_DIR/$DOCKER_COMPOSE_FILE restart
    endscript
}
EOL

    # Create monitoring script
    cat > /usr/local/bin/monitor-$APP_NAME << EOL
#!/bin/bash
cd $DEPLOY_DIR
docker-compose -f $DOCKER_COMPOSE_FILE ps
echo "=== System Resources ==="
free -h
df -h
echo "=== Docker Stats ==="
docker stats --no-stream
EOL

    chmod +x /usr/local/bin/monitor-$APP_NAME
    
    print_status "Monitoring setup completed"
}

# Create systemd service for auto-start
setup_systemd() {
    print_status "Setting up systemd service..."
    
    cat > /etc/systemd/system/$APP_NAME.service << EOL
[Unit]
Description=Research Paper Helper Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/local/bin/docker-compose -f $DOCKER_COMPOSE_FILE up -d
ExecStop=/usr/local/bin/docker-compose -f $DOCKER_COMPOSE_FILE down
TimeoutStartSec=0
Restart=on-failure
RestartSec=30s

[Install]
WantedBy=multi-user.target
EOL

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable $APP_NAME.service
    systemctl start $APP_NAME.service
    
    print_status "Systemd service configured"
}

# Health check
health_check() {
    print_status "Performing health check..."
    
    sleep 30  # Wait for services to start
    
    local public_ip=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
    
    # Check if services are running
    if curl -f -s "http://localhost/health" > /dev/null; then
        print_status "✅ Application is healthy and running!"
        echo ""
        echo "🌐 Application URLs:"
        echo "   Frontend: http://$public_ip"
        echo "   API: http://$public_ip/api"
        echo "   Health Check: http://$public_ip/health"
        echo ""
        echo "📊 Monitoring:"
        echo "   Run: monitor-$APP_NAME"
        echo "   Logs: docker-compose -f $DEPLOY_DIR/$DOCKER_COMPOSE_FILE logs -f"
        echo ""
    else
        print_error "Health check failed. Check logs with:"
        echo "docker-compose -f $DEPLOY_DIR/$DOCKER_COMPOSE_FILE logs"
        exit 1
    fi
}

# Cleanup function
cleanup() {
    print_status "Cleaning up temporary files..."
    rm -f get-docker.sh
}

# Main deployment function
main() {
    print_status "Starting deployment process..."
    
    check_root
    update_system
    install_docker
    install_docker_compose
    setup_application
    setup_environment
    setup_security
    deploy_services
    setup_monitoring
    setup_systemd
    health_check
    cleanup
    
    print_status "🎉 Deployment completed successfully!"
    print_warning "Note: Make sure to configure AWS Security Groups to allow ports 80, 443, and 22"
}

# Run main function
main "$@"