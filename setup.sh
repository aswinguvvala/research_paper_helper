#!/bin/bash

# Research Paper Assistant - Development Setup Script
echo "🚀 Setting up Research Paper Assistant development environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if required tools are installed
check_requirements() {
    echo "Checking system requirements..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node -v)"
        exit 1
    fi
    print_status "Node.js $(node -v) found"
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed. Please install Python 3.8+ from https://python.org/"
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 -c "import sys; print('.'.join(map(str, sys.version_info[:2])))")
    print_status "Python $PYTHON_VERSION found"
    
    # Check pip
    if ! command -v pip3 &> /dev/null; then
        print_error "pip3 is not installed. Please install pip3"
        exit 1
    fi
    print_status "pip3 found"
    
    # Check git
    if ! command -v git &> /dev/null; then
        print_warning "Git is not installed. Some features may not work properly."
    else
        print_status "Git found"
    fi
}

# Create necessary directories
create_directories() {
    echo "Creating necessary directories..."
    
    mkdir -p server/data
    mkdir -p server/logs
    mkdir -p server/uploads
    mkdir -p client/public
    
    # Add .gitkeep files to maintain directory structure
    touch server/data/.gitkeep
    touch server/logs/.gitkeep
    touch server/uploads/.gitkeep
    
    print_status "Directories created"
}

# Setup environment files
setup_environment() {
    echo "Setting up environment files..."
    
    # Copy example environment files if they don't exist
    if [ ! -f server/.env ]; then
        cp server/.env.example server/.env
        print_status "Server .env created from example"
        print_warning "Please add your OpenAI API key to server/.env"
    fi
    
    if [ ! -f client/.env ]; then
        cp client/.env.example client/.env
        print_status "Client .env created from example"
    fi
    
    if [ ! -f ai-service/.env ]; then
        cp ai-service/.env.example ai-service/.env
        print_status "AI service .env created from example"
    fi
}

# Install dependencies
install_dependencies() {
    echo "Installing dependencies..."
    
    # Root dependencies
    print_status "Installing root dependencies..."
    npm install
    
    # Shared dependencies
    if [ -d "shared" ]; then
        print_status "Building shared package..."
        cd shared && npm install && npm run build && cd ..
    fi
    
    # Server dependencies
    if [ -d "server" ]; then
        print_status "Installing server dependencies..."
        cd server && npm install && cd ..
    fi
    
    # Client dependencies
    if [ -d "client" ]; then
        print_status "Installing client dependencies..."
        cd client && npm install && cd ..
    fi
    
    # AI service dependencies
    if [ -d "ai-service" ]; then
        print_status "Installing AI service dependencies..."
        cd ai-service
        if command -v python3 &> /dev/null; then
            python3 -m pip install --upgrade pip
            python3 -m pip install -r requirements.txt
        fi
        cd ..
    fi
}

# Test AI service
test_ai_service() {
    echo "Testing AI service setup..."
    
    cd ai-service
    if python3 -c "import sentence_transformers; print('✓ sentence-transformers imported successfully')" 2>/dev/null; then
        print_status "AI service dependencies verified"
    else
        print_warning "AI service dependencies may not be properly installed"
        print_warning "You may need to run: cd ai-service && pip3 install -r requirements.txt"
    fi
    cd ..
}

# Create launch scripts
create_launch_scripts() {
    echo "Creating launch scripts..."
    
    # Create dev script for quick startup
cat > dev.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting Research Paper Assistant..."

# Start all services in parallel
echo "Starting AI service..."
cd ai-service && python3 app.py &
AI_PID=$!

echo "Starting server..."
cd ../server && npm run dev &
SERVER_PID=$!

echo "Starting client..."
cd ../client && npm run dev &
CLIENT_PID=$!

echo "All services started!"
echo "🌐 Client: http://localhost:3000"
echo "🖥️  Server: http://localhost:8000"
echo "🤖 AI Service: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap 'echo "Stopping all services..."; kill $AI_PID $SERVER_PID $CLIENT_PID; exit' INT
wait
EOF

    chmod +x dev.sh
    print_status "Development launch script created (dev.sh)"
}

# Verify setup
verify_setup() {
    echo "Verifying setup..."
    
    # Check if all package.json files exist
    local packages=("package.json" "shared/package.json" "server/package.json" "client/package.json")
    for package in "${packages[@]}"; do
        if [ -f "$package" ]; then
            print_status "Found $package"
        else
            print_error "Missing $package"
        fi
    done
    
    # Check Python dependencies
    if [ -f "ai-service/requirements.txt" ]; then
        print_status "Found ai-service/requirements.txt"
    else
        print_error "Missing ai-service/requirements.txt"
    fi
}

# Main execution
main() {
    echo "=============================================="
    echo "Research Paper Assistant - Setup Script"
    echo "=============================================="
    echo ""
    
    check_requirements
    echo ""
    
    create_directories
    echo ""
    
    setup_environment
    echo ""
    
    install_dependencies
    echo ""
    
    test_ai_service
    echo ""
    
    create_launch_scripts
    echo ""
    
    verify_setup
    echo ""
    
    echo "=============================================="
    print_status "Setup completed successfully!"
    echo "=============================================="
    echo ""
    echo "Next steps:"
    echo "1. Add your OpenAI API key to server/.env"
    echo "2. Run './dev.sh' to start all services"
    echo "3. Open http://localhost:3000 in your browser"
    echo ""
    echo "For manual startup:"
    echo "• AI Service: cd ai-service && python3 app.py"
    echo "• Server: cd server && npm run dev"
    echo "• Client: cd client && npm run dev"
    echo ""
    print_warning "Don't forget to add your OpenAI API key to server/.env!"
}

# Run main function
main