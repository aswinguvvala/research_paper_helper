#!/usr/bin/env python3
"""
Test script for the AI embedding service.
Run this to verify the service is working correctly.
"""

import requests
import json
import time

# Service configuration
BASE_URL = 'http://localhost:5000'

def test_health_check():
    """Test the health check endpoint."""
    print("Testing health check...")
    
    try:
        response = requests.get(f"{BASE_URL}/health")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed")
            print(f"   Status: {data['status']}")
            print(f"   Model: {data['model_name']}")
            print(f"   Device: {data['device']}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to AI service. Make sure it's running on port 5000.")
        return False
    except Exception as e:
        print(f"❌ Health check error: {str(e)}")
        return False

def test_model_info():
    """Test the model info endpoint."""
    print("\nTesting model info...")
    
    try:
        response = requests.get(f"{BASE_URL}/model")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Model info retrieved")
            print(f"   Model: {data['model_name']}")
            print(f"   Dimensions: {data['dimensions']}")
            print(f"   Device: {data['device']}")
            return True
        else:
            print(f"❌ Model info failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Model info error: {str(e)}")
        return False

def test_embeddings():
    """Test embedding generation."""
    print("\nTesting embedding generation...")
    
    test_texts = [
        "This is a test sentence for embedding generation.",
        "Machine learning models can process natural language text.",
        "Embeddings capture semantic meaning of text."
    ]
    
    try:
        payload = {
            "texts": test_texts,
            "normalize": True
        }
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/embeddings",
            headers={'Content-Type': 'application/json'},
            data=json.dumps(payload)
        )
        processing_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Embedding generation successful")
            print(f"   Texts processed: {len(test_texts)}")
            print(f"   Embeddings generated: {len(data['embeddings'])}")
            print(f"   Dimensions: {data['dimensions']}")
            print(f"   Processing time: {data['processing_time']:.3f}s")
            print(f"   Total time: {processing_time:.3f}s")
            
            # Verify embedding dimensions
            if all(len(emb) == data['dimensions'] for emb in data['embeddings']):
                print(f"✅ All embeddings have correct dimensions")
            else:
                print(f"❌ Embedding dimensions inconsistent")
                return False
                
            return data['embeddings']
        else:
            print(f"❌ Embedding generation failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Embedding generation error: {str(e)}")
        return None

def test_similarity(embeddings):
    """Test similarity computation."""
    if not embeddings or len(embeddings) < 2:
        print("❌ Need at least 2 embeddings to test similarity")
        return False
        
    print("\nTesting similarity computation...")
    
    try:
        payload = {
            "embedding1": embeddings[0],
            "embedding2": embeddings[1]
        }
        
        response = requests.post(
            f"{BASE_URL}/similarity",
            headers={'Content-Type': 'application/json'},
            data=json.dumps(payload)
        )
        
        if response.status_code == 200:
            data = response.json()
            similarity = data['similarity']
            print(f"✅ Similarity computation successful")
            print(f"   Similarity: {similarity:.4f}")
            print(f"   Method: {data['method']}")
            
            if -1.0 <= similarity <= 1.0:
                print(f"✅ Similarity value in valid range")
            else:
                print(f"❌ Similarity value out of range: {similarity}")
                return False
                
            return True
        else:
            print(f"❌ Similarity computation failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Similarity computation error: {str(e)}")
        return False

def test_error_handling():
    """Test error handling with invalid requests."""
    print("\nTesting error handling...")
    
    # Test empty texts
    try:
        payload = {"texts": []}
        response = requests.post(
            f"{BASE_URL}/embeddings",
            headers={'Content-Type': 'application/json'},
            data=json.dumps(payload)
        )
        
        if response.status_code == 400:
            print("✅ Empty texts properly rejected")
        else:
            print(f"❌ Empty texts should return 400, got {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error handling test failed: {str(e)}")
        return False
    
    # Test invalid endpoint
    try:
        response = requests.get(f"{BASE_URL}/invalid-endpoint")
        
        if response.status_code == 404:
            print("✅ Invalid endpoint properly handled")
        else:
            print(f"❌ Invalid endpoint should return 404, got {response.status_code}")
            
    except Exception as e:
        print(f"❌ 404 handling test failed: {str(e)}")
        return False
    
    return True

def main():
    """Run all tests."""
    print("🚀 Starting AI Service Tests\n")
    print("=" * 50)
    
    # Run tests in sequence
    success_count = 0
    total_tests = 5
    
    if test_health_check():
        success_count += 1
    
    if test_model_info():
        success_count += 1
    
    embeddings = test_embeddings()
    if embeddings:
        success_count += 1
        
        if test_similarity(embeddings):
            success_count += 1
    
    if test_error_handling():
        success_count += 1
    
    # Print results
    print("\n" + "=" * 50)
    print("🏁 Test Results")
    print(f"Passed: {success_count}/{total_tests}")
    
    if success_count == total_tests:
        print("🎉 All tests passed! AI service is working correctly.")
        return True
    else:
        print("❌ Some tests failed. Check the output above for details.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)