import os
import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
import torch
import numpy as np
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'http://localhost:8000'])

# Global model instance
embedding_model: Optional[SentenceTransformer] = None

# Configuration
class Config:
    MODEL_NAME = os.getenv('EMBEDDING_MODEL', 'all-MiniLM-L6-v2')
    MAX_BATCH_SIZE = int(os.getenv('MAX_BATCH_SIZE', '32'))
    MAX_TEXT_LENGTH = int(os.getenv('MAX_TEXT_LENGTH', '8192'))
    DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
    PORT = int(os.getenv('AI_SERVICE_PORT', '5000'))
    HOST = os.getenv('AI_SERVICE_HOST', '0.0.0.0')
    DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# Request/Response models
class EmbeddingRequest(BaseModel):
    texts: List[str]
    normalize: bool = True
    batch_size: Optional[int] = None

class EmbeddingResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
    processing_time: float
    total_tokens: int
    dimensions: int

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    model_loaded: bool
    model_name: str
    device: str
    torch_version: str
    memory_usage: Dict[str, Any]

class ErrorResponse(BaseModel):
    error: str
    message: str
    timestamp: str

def load_embedding_model() -> SentenceTransformer:
    """Load the sentence transformer model with error handling."""
    try:
        logger.info(f"Loading embedding model: {Config.MODEL_NAME}")
        model = SentenceTransformer(Config.MODEL_NAME, device=Config.DEVICE)
        logger.info(f"Model loaded successfully on device: {Config.DEVICE}")
        logger.info(f"Model dimensions: {model.get_sentence_embedding_dimension()}")
        return model
    except Exception as e:
        logger.error(f"Failed to load embedding model: {str(e)}")
        raise

def get_memory_usage() -> Dict[str, Any]:
    """Get current memory usage information."""
    memory_info = {}
    
    if torch.cuda.is_available():
        memory_info['gpu'] = {
            'allocated': torch.cuda.memory_allocated(),
            'cached': torch.cuda.memory_reserved(),
            'max_allocated': torch.cuda.max_memory_allocated()
        }
    
    # Get CPU memory usage (simplified)
    import psutil
    process = psutil.Process()
    memory_info['cpu'] = {
        'rss': process.memory_info().rss,
        'vms': process.memory_info().vms,
        'percent': process.memory_percent()
    }
    
    return memory_info

def validate_texts(texts: List[str]) -> None:
    """Validate input texts."""
    if not texts:
        raise ValueError("Texts list cannot be empty")
    
    if len(texts) > Config.MAX_BATCH_SIZE:
        raise ValueError(f"Batch size {len(texts)} exceeds maximum {Config.MAX_BATCH_SIZE}")
    
    for i, text in enumerate(texts):
        if not isinstance(text, str):
            raise ValueError(f"Text at index {i} must be a string")
        
        if len(text) > Config.MAX_TEXT_LENGTH:
            raise ValueError(f"Text at index {i} exceeds maximum length {Config.MAX_TEXT_LENGTH}")
        
        if not text.strip():
            logger.warning(f"Empty text at index {i}")

def preprocess_texts(texts: List[str]) -> List[str]:
    """Preprocess texts for better embedding quality."""
    processed_texts = []
    
    for text in texts:
        # Remove excessive whitespace
        cleaned = ' '.join(text.split())
        
        # Truncate if too long (safety check)
        if len(cleaned) > Config.MAX_TEXT_LENGTH:
            cleaned = cleaned[:Config.MAX_TEXT_LENGTH-3] + "..."
        
        processed_texts.append(cleaned)
    
    return processed_texts

@app.before_first_request
def initialize_model():
    """Initialize the embedding model before handling requests."""
    global embedding_model
    if embedding_model is None:
        embedding_model = load_embedding_model()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    try:
        memory_usage = get_memory_usage()
        
        response = HealthResponse(
            status='healthy' if embedding_model is not None else 'initializing',
            timestamp=datetime.now().isoformat(),
            model_loaded=embedding_model is not None,
            model_name=Config.MODEL_NAME,
            device=Config.DEVICE,
            torch_version=torch.__version__,
            memory_usage=memory_usage
        )
        
        return jsonify(response.dict()), 200
    
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        error_response = ErrorResponse(
            error='health_check_failed',
            message=str(e),
            timestamp=datetime.now().isoformat()
        )
        return jsonify(error_response.dict()), 500

@app.route('/model', methods=['GET'])
def get_model_info():
    """Get model information endpoint."""
    try:
        if embedding_model is None:
            return jsonify({'error': 'Model not loaded'}), 503
        
        return jsonify({
            'model_name': Config.MODEL_NAME,
            'dimensions': embedding_model.get_sentence_embedding_dimension(),
            'max_seq_length': getattr(embedding_model[0], 'max_seq_length', 'unknown'),
            'device': Config.DEVICE,
            'batch_size': Config.MAX_BATCH_SIZE
        }), 200
    
    except Exception as e:
        logger.error(f"Model info retrieval failed: {str(e)}")
        error_response = ErrorResponse(
            error='model_info_failed',
            message=str(e),
            timestamp=datetime.now().isoformat()
        )
        return jsonify(error_response.dict()), 500

@app.route('/embeddings', methods=['POST'])
def generate_embeddings():
    """Generate embeddings for given texts."""
    start_time = time.time()
    
    try:
        # Check if model is loaded
        if embedding_model is None:
            return jsonify({
                'error': 'model_not_loaded',
                'message': 'Embedding model is not loaded. Please wait for initialization.'
            }), 503
        
        # Parse request data
        try:
            request_data = EmbeddingRequest(**request.json)
        except ValidationError as e:
            return jsonify({
                'error': 'validation_error',
                'message': str(e),
                'timestamp': datetime.now().isoformat()
            }), 400
        
        # Validate and preprocess texts
        validate_texts(request_data.texts)
        processed_texts = preprocess_texts(request_data.texts)
        
        logger.info(f"Generating embeddings for {len(processed_texts)} texts")
        
        # Configure batch size
        batch_size = min(
            request_data.batch_size or Config.MAX_BATCH_SIZE,
            Config.MAX_BATCH_SIZE,
            len(processed_texts)
        )
        
        # Generate embeddings in batches
        all_embeddings = []
        total_tokens = 0
        
        for i in range(0, len(processed_texts), batch_size):
            batch_texts = processed_texts[i:i + batch_size]
            
            # Generate embeddings for this batch
            batch_embeddings = embedding_model.encode(
                batch_texts,
                convert_to_numpy=True,
                normalize_embeddings=request_data.normalize,
                batch_size=len(batch_texts),
                show_progress_bar=False
            )
            
            # Convert to list for JSON serialization
            batch_embeddings_list = batch_embeddings.tolist()
            all_embeddings.extend(batch_embeddings_list)
            
            # Rough token count estimation (word-based)
            total_tokens += sum(len(text.split()) for text in batch_texts)
        
        processing_time = time.time() - start_time
        
        response = EmbeddingResponse(
            embeddings=all_embeddings,
            model=Config.MODEL_NAME,
            processing_time=processing_time,
            total_tokens=total_tokens,
            dimensions=len(all_embeddings[0]) if all_embeddings else 0
        )
        
        logger.info(f"Generated {len(all_embeddings)} embeddings in {processing_time:.2f}s")
        
        return jsonify(response.dict()), 200
    
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        error_response = ErrorResponse(
            error='validation_error',
            message=str(e),
            timestamp=datetime.now().isoformat()
        )
        return jsonify(error_response.dict()), 400
    
    except Exception as e:
        logger.error(f"Embedding generation failed: {str(e)}")
        error_response = ErrorResponse(
            error='embedding_generation_failed',
            message=str(e),
            timestamp=datetime.now().isoformat()
        )
        return jsonify(error_response.dict()), 500

@app.route('/similarity', methods=['POST'])
def compute_similarity():
    """Compute similarity between embeddings."""
    try:
        data = request.json
        
        if 'embedding1' not in data or 'embedding2' not in data:
            return jsonify({'error': 'Both embedding1 and embedding2 are required'}), 400
        
        embedding1 = np.array(data['embedding1'])
        embedding2 = np.array(data['embedding2'])
        
        if embedding1.shape != embedding2.shape:
            return jsonify({'error': 'Embeddings must have the same dimensions'}), 400
        
        # Compute cosine similarity
        similarity = np.dot(embedding1, embedding2) / (
            np.linalg.norm(embedding1) * np.linalg.norm(embedding2)
        )
        
        return jsonify({
            'similarity': float(similarity),
            'method': 'cosine',
            'dimensions': len(embedding1)
        }), 200
    
    except Exception as e:
        logger.error(f"Similarity computation failed: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({
        'error': 'not_found',
        'message': 'Endpoint not found',
        'available_endpoints': ['/health', '/model', '/embeddings', '/similarity']
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({
        'error': 'internal_server_error',
        'message': 'An internal server error occurred'
    }), 500

if __name__ == '__main__':
    # Initialize model on startup
    try:
        embedding_model = load_embedding_model()
        logger.info("AI service starting up...")
        logger.info(f"Config: {Config.MODEL_NAME} on {Config.DEVICE}")
        logger.info(f"Max batch size: {Config.MAX_BATCH_SIZE}")
        
        # Start the Flask app
        app.run(
            host=Config.HOST,
            port=Config.PORT,
            debug=Config.DEBUG,
            threaded=True
        )
    
    except Exception as e:
        logger.error(f"Failed to start AI service: {str(e)}")
        exit(1)