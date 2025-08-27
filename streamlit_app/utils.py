"""
Utility functions for the Streamlit Research Paper Helper
"""

import streamlit as st
import requests
from typing import Optional, Dict, Any
import base64
from io import BytesIO
import time

def get_api_client():
    """Get configured API client"""
    return {
        "base_url": st.secrets.get("API_BASE_URL", "http://localhost:8000"),
        "timeout": 30
    }

def make_api_request(endpoint: str, method: str = "GET", data: Dict[Any, Any] = None, files: Dict[str, Any] = None) -> Optional[Dict[Any, Any]]:
    """Make API request with error handling"""
    try:
        config = get_api_client()
        url = f"{config['base_url']}{endpoint}"
        
        kwargs = {"timeout": config["timeout"]}
        if data:
            kwargs["json"] = data
        if files:
            kwargs["files"] = files
            
        response = requests.request(method, url, **kwargs)
        
        if response.status_code in [200, 201]:
            return response.json()
        else:
            st.error(f"API Error ({response.status_code}): {response.text}")
            return None
            
    except requests.exceptions.ConnectionError:
        st.error("🔌 Cannot connect to the backend API. Please ensure the server is running.")
        return None
    except requests.exceptions.Timeout:
        st.error("⏰ Request timed out. Please try again.")
        return None
    except Exception as e:
        st.error(f"❌ API request failed: {str(e)}")
        return None

def encode_file_to_base64(file_bytes: bytes) -> str:
    """Encode file bytes to base64 string"""
    return base64.b64encode(file_bytes).decode()

def format_file_size(size_bytes: int) -> str:
    """Format file size in human readable format"""
    if size_bytes == 0:
        return "0 B"
    
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    
    return f"{size_bytes:.1f} TB"

def validate_pdf_file(uploaded_file) -> bool:
    """Validate uploaded PDF file"""
    if not uploaded_file:
        return False
    
    if not uploaded_file.name.lower().endswith('.pdf'):
        st.error("❌ Please upload a PDF file.")
        return False
    
    if uploaded_file.size > 100 * 1024 * 1024:  # 100MB limit
        st.error("❌ File size must be less than 100MB.")
        return False
    
    return True

def show_loading_animation(text: str = "Loading..."):
    """Show loading animation"""
    with st.spinner(text):
        time.sleep(0.1)  # Small delay for better UX

def create_download_link(file_content: bytes, filename: str, link_text: str) -> str:
    """Create download link for file content"""
    b64_content = base64.b64encode(file_content).decode()
    return f'<a href="data:application/octet-stream;base64,{b64_content}" download="{filename}">{link_text}</a>'

def truncate_text(text: str, max_length: int = 100) -> str:
    """Truncate text with ellipsis"""
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."

def format_highlight_text(text: str, max_length: int = 150) -> str:
    """Format highlight text for display"""
    # Clean and truncate text
    clean_text = text.strip().replace('\n', ' ').replace('\r', '')
    return truncate_text(clean_text, max_length)

def get_color_style(color_name: str) -> Dict[str, str]:
    """Get CSS styles for highlight color"""
    colors = {
        "yellow": {"bg": "#FEF08A", "text": "#A16207", "border": "#F59E0B"},
        "blue": {"bg": "#BFDBFE", "text": "#1D4ED8", "border": "#3B82F6"},
        "green": {"bg": "#BBF7D0", "text": "#059669", "border": "#10B981"},
        "pink": {"bg": "#FBCFE8", "text": "#BE185D", "border": "#EC4899"},
        "orange": {"bg": "#FED7AA", "text": "#C2410C", "border": "#F97316"},
        "purple": {"bg": "#DDD6FE", "text": "#7C3AED", "border": "#8B5CF6"},
        "red": {"bg": "#FECACA", "text": "#DC2626", "border": "#EF4444"}
    }
    return colors.get(color_name, colors["yellow"])

def check_api_health() -> bool:
    """Check if API is accessible"""
    try:
        config = get_api_client()
        response = requests.get(f"{config['base_url']}/api/health", timeout=5)
        return response.status_code == 200
    except:
        return False

@st.cache_data(ttl=300)  # Cache for 5 minutes
def get_cached_document_data(document_id: str) -> Optional[Dict[Any, Any]]:
    """Get cached document data"""
    return make_api_request(f"/api/documents/{document_id}")

def display_api_status():
    """Display API connection status in sidebar"""
    if check_api_health():
        st.sidebar.success("🟢 API Connected")
    else:
        st.sidebar.error("🔴 API Disconnected")
        st.sidebar.info("Please ensure the backend server is running on http://localhost:8000")

def reset_app_state():
    """Reset all app session state"""
    keys_to_reset = [
        'current_document', 'chat_messages', 'highlights', 
        'selected_text', 'current_page', 'chat_session_id'
    ]
    
    for key in keys_to_reset:
        if key in st.session_state:
            del st.session_state[key]
            
def export_highlights_to_json(highlights) -> str:
    """Export highlights to JSON format"""
    import json
    from datetime import datetime
    
    export_data = {
        "exported_at": datetime.now().isoformat(),
        "highlights": []
    }
    
    for highlight in highlights:
        export_data["highlights"].append({
            "id": highlight.id,
            "page_number": highlight.page_number,
            "selected_text": highlight.selected_text,
            "color": highlight.color,
            "notes": highlight.notes,
            "created_at": highlight.created_at.isoformat()
        })
    
    return json.dumps(export_data, indent=2)

def create_markdown_table(data: list, headers: list) -> str:
    """Create markdown table from data"""
    if not data or not headers:
        return ""
    
    # Create header row
    table = "| " + " | ".join(headers) + " |\n"
    table += "| " + " | ".join(["---"] * len(headers)) + " |\n"
    
    # Create data rows
    for row in data:
        table += "| " + " | ".join(str(cell) for cell in row) + " |\n"
    
    return table