#!/bin/bash

# Research Paper Helper - Monitoring Script
# This script provides system and application monitoring

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_NAME="research-paper-helper"
DEPLOY_DIR="/opt/$APP_NAME"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"

print_header() {
    echo -e "${BLUE}==== $1 ====${NC}"
}

print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check service health
check_service_health() {
    local service_name=$1
    local port=$2
    
    if curl -f -s "http://localhost:$port/health" > /dev/null 2>&1 || curl -f -s "http://localhost:$port" > /dev/null 2>&1; then
        print_status "$service_name is healthy"
        return 0
    else
        print_error "$service_name is not responding"
        return 1
    fi
}

# Main monitoring function
monitor_system() {
    clear
    echo -e "${BLUE}🔍 Research Paper Helper - System Monitor${NC}"
    echo "Last updated: $(date)"
    echo ""

    # System Resources
    print_header "System Resources"
    
    # Memory usage
    echo "Memory Usage:"
    free -h | grep -E "(Mem|Swap)"
    
    # Disk usage
    echo ""
    echo "Disk Usage:"
    df -h / | tail -1 | awk '{print "Root: " $3 "/" $2 " (" $5 " used)"}'
    
    # Load average
    echo ""
    echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
    
    echo ""
    
    # Docker Status
    print_header "Docker Services"
    
    if command -v docker > /dev/null 2>&1; then
        if [ -f "$DEPLOY_DIR/$DOCKER_COMPOSE_FILE" ]; then
            cd $DEPLOY_DIR
            docker-compose -f $DOCKER_COMPOSE_FILE ps
        else
            print_warning "Docker Compose file not found"
        fi
        
        echo ""
        echo "Docker Resource Usage:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
    else
        print_error "Docker not installed"
    fi
    
    echo ""
    
    # Application Health
    print_header "Application Health"
    
    # Check main application
    if check_service_health "Frontend" "80"; then
        echo "✅ Frontend accessible"
    fi
    
    if check_service_health "Backend API" "8000"; then
        echo "✅ Backend API accessible"
    fi
    
    # Check individual services via docker
    if command -v docker > /dev/null 2>&1; then
        echo ""
        echo "Container Health:"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(frontend|backend|ai-service|nginx)" || echo "No application containers found"
    fi
    
    echo ""
    
    # Network Status
    print_header "Network Status"
    
    # Check listening ports
    echo "Listening Ports:"
    ss -tuln | grep -E ":(80|443|8000|5000)\s" || echo "No application ports found"
    
    echo ""
    
    # Log Summary
    print_header "Recent Log Summary"
    
    if [ -f "$DEPLOY_DIR/$DOCKER_COMPOSE_FILE" ]; then
        cd $DEPLOY_DIR
        echo "Recent errors (last 10):"
        docker-compose -f $DOCKER_COMPOSE_FILE logs --tail=50 2>/dev/null | grep -i error | tail -10 || echo "No recent errors found"
    fi
    
    echo ""
    
    # System Warnings
    print_header "System Warnings"
    
    # Check disk space (warn if > 80%)
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 80 ]; then
        print_warning "Disk usage is ${disk_usage}% - consider cleanup"
    fi
    
    # Check memory usage (warn if > 80%)
    memory_usage=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100)}')
    if [ "$memory_usage" -gt 80 ]; then
        print_warning "Memory usage is ${memory_usage}% - consider optimization"
    fi
    
    # Check Docker space
    if command -v docker > /dev/null 2>&1; then
        docker_size=$(docker system df --format "{{.Size}}" | head -1)
        print_status "Docker system usage: $docker_size"
    fi
    
    echo ""
    print_status "Monitoring complete. Run 'sudo $0 --watch' for continuous monitoring"
}

# Continuous monitoring mode
watch_mode() {
    while true; do
        monitor_system
        echo ""
        echo "Press Ctrl+C to exit continuous monitoring..."
        sleep 30
    done
}

# Usage information
show_usage() {
    echo "Research Paper Helper - System Monitor"
    echo ""
    echo "Usage: $0 [option]"
    echo ""
    echo "Options:"
    echo "  --watch    Continuous monitoring (updates every 30 seconds)"
    echo "  --logs     Show recent application logs"
    echo "  --help     Show this help message"
    echo ""
}

# Show logs
show_logs() {
    if [ -f "$DEPLOY_DIR/$DOCKER_COMPOSE_FILE" ]; then
        cd $DEPLOY_DIR
        echo "Recent application logs (last 100 lines):"
        docker-compose -f $DOCKER_COMPOSE_FILE logs --tail=100
    else
        print_error "Application not found or not deployed with Docker Compose"
    fi
}

# Main script logic
case "$1" in
    --watch)
        watch_mode
        ;;
    --logs)
        show_logs
        ;;
    --help)
        show_usage
        ;;
    *)
        monitor_system
        ;;
esac