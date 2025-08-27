# Streamlit Research Paper Helper Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 streamlituser && chown -R streamlituser:streamlituser /app
USER streamlituser

# Create .streamlit directory and config
RUN mkdir -p /home/streamlituser/.streamlit

# Create Streamlit config file
RUN echo "[general]" > /home/streamlituser/.streamlit/config.toml && \
    echo "dataFrameSerialization = \"legacy\"" >> /home/streamlituser/.streamlit/config.toml && \
    echo "[server]" >> /home/streamlituser/.streamlit/config.toml && \
    echo "runOnSave = true" >> /home/streamlituser/.streamlit/config.toml && \
    echo "allowRunOnSave = true" >> /home/streamlituser/.streamlit/config.toml && \
    echo "port = 8501" >> /home/streamlituser/.streamlit/config.toml && \
    echo "address = \"0.0.0.0\"" >> /home/streamlituser/.streamlit/config.toml && \
    echo "baseUrlPath = \"\"" >> /home/streamlituser/.streamlit/config.toml && \
    echo "enableCORS = false" >> /home/streamlituser/.streamlit/config.toml && \
    echo "enableXsrfProtection = false" >> /home/streamlituser/.streamlit/config.toml && \
    echo "[browser]" >> /home/streamlituser/.streamlit/config.toml && \
    echo "gatherUsageStats = false" >> /home/streamlituser/.streamlit/config.toml

# Expose port
EXPOSE 8501

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8501/_stcore/health || exit 1

# Run the Streamlit application
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]