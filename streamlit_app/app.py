"""
Streamlit Research Paper Helper - Main Application
A Streamlit version of the React research paper analysis application
"""

import streamlit as st
import requests
import json
import base64
import time
import os
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from enum import Enum
import uuid
import PyPDF2
from io import BytesIO
import fitz  # PyMuPDF for better PDF handling
import pandas as pd
from datetime import datetime

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
STREAMLIT_SERVER_PORT = int(os.getenv("STREAMLIT_SERVER_PORT", 8501))

# Education levels matching the React app
class EducationLevel(str, Enum):
    NO_TECHNICAL = "no_technical"
    HIGH_SCHOOL = "high_school" 
    UNDERGRADUATE = "undergraduate"
    MASTERS = "masters"
    PHD = "phd"

EDUCATION_LEVEL_CONFIG = {
    EducationLevel.NO_TECHNICAL: {
        "label": "General Reader",
        "description": "No technical background",
        "icon": "👤"
    },
    EducationLevel.HIGH_SCHOOL: {
        "label": "High School",
        "description": "High school level",
        "icon": "🎓"
    },
    EducationLevel.UNDERGRADUATE: {
        "label": "Undergraduate", 
        "description": "Bachelor's degree level",
        "icon": "📚"
    },
    EducationLevel.MASTERS: {
        "label": "Graduate",
        "description": "Master's degree level", 
        "icon": "🎯"
    },
    EducationLevel.PHD: {
        "label": "PhD/Research",
        "description": "Doctoral level",
        "icon": "🔬"
    }
}

# Highlight colors matching React app
HIGHLIGHT_COLORS = {
    "yellow": {"name": "Classic Yellow", "color": "#FEF08A", "text": "#A16207"},
    "blue": {"name": "Ocean Blue", "color": "#BFDBFE", "text": "#1D4ED8"}, 
    "green": {"name": "Nature Green", "color": "#BBF7D0", "text": "#059669"},
    "pink": {"name": "Soft Pink", "color": "#FBCFE8", "text": "#BE185D"},
    "orange": {"name": "Vibrant Orange", "color": "#FED7AA", "text": "#C2410C"},
    "purple": {"name": "Royal Purple", "color": "#DDD6FE", "text": "#7C3AED"},
    "red": {"name": "Alert Red", "color": "#FECACA", "text": "#DC2626"}
}

@dataclass
class Document:
    id: str
    filename: str
    title: str
    authors: List[str]
    total_pages: int
    uploaded_at: datetime
    processed_at: Optional[datetime] = None

@dataclass 
class ChatMessage:
    role: str  # 'user', 'assistant', 'system'
    content: str
    timestamp: datetime
    highlighted_text: Optional[str] = None

@dataclass
class Highlight:
    id: str
    document_id: str
    page_number: int
    selected_text: str
    color: str
    notes: Optional[str]
    created_at: datetime

# Initialize session state
def initialize_session_state():
    """Initialize Streamlit session state variables"""
    if "education_level" not in st.session_state:
        st.session_state.education_level = EducationLevel.UNDERGRADUATE
    
    if "current_document" not in st.session_state:
        st.session_state.current_document = None
        
    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = []
        
    if "highlights" not in st.session_state:
        st.session_state.highlights = []
        
    if "selected_text" not in st.session_state:
        st.session_state.selected_text = ""
        
    if "current_page" not in st.session_state:
        st.session_state.current_page = 1
        
    if "chat_session_id" not in st.session_state:
        st.session_state.chat_session_id = str(uuid.uuid4())

# API Helper functions
class APIClient:
    """Helper class for API communications"""
    
    @staticmethod
    def upload_document(file_bytes: bytes, filename: str, education_level: EducationLevel) -> Optional[str]:
        """Upload document to backend API"""
        try:
            files = {"file": (filename, file_bytes, "application/pdf")}
            data = {"educationLevel": education_level.value}
            
            response = requests.post(f"{API_BASE_URL}/api/documents/upload", files=files, data=data)
            
            if response.status_code == 201:
                result = response.json()
                return result.get("document", {}).get("id")
            else:
                st.error(f"Upload failed: {response.text}")
                return None
                
        except Exception as e:
            st.error(f"Upload error: {str(e)}")
            return None
    
    @staticmethod
    def get_document(document_id: str) -> Optional[Document]:
        """Get document metadata from API"""
        try:
            response = requests.get(f"{API_BASE_URL}/api/documents/{document_id}")
            
            if response.status_code == 200:
                data = response.json()["document"]
                return Document(
                    id=data["id"],
                    filename=data["filename"], 
                    title=data.get("title", ""),
                    authors=data.get("authors", []),
                    total_pages=data["total_pages"],
                    uploaded_at=datetime.fromisoformat(data["uploaded_at"].replace('Z', '+00:00'))
                )
            return None
        except Exception as e:
            st.error(f"Failed to fetch document: {str(e)}")
            return None
    
    @staticmethod
    def send_chat_message(document_id: str, message: str, education_level: EducationLevel, 
                         session_id: str, highlighted_text: str = "") -> Optional[str]:
        """Send chat message to API"""
        try:
            payload = {
                "message": message,
                "educationLevel": education_level.value,
                "sessionId": session_id,
                "contextData": {
                    "highlightedText": highlighted_text,
                    "currentPage": st.session_state.get("current_page", 1)
                }
            }
            
            response = requests.post(f"{API_BASE_URL}/api/chat", json=payload)
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "")
            else:
                st.error(f"Chat error: {response.text}")
                return None
                
        except Exception as e:
            st.error(f"Chat error: {str(e)}")
            return None
    
    @staticmethod 
    def create_highlight(document_id: str, page_number: int, selected_text: str, 
                        color: str, notes: str = "") -> Optional[Highlight]:
        """Create highlight via API"""
        try:
            payload = {
                "documentId": document_id,
                "pageNumber": page_number, 
                "selectedText": selected_text,
                "startPosition": 0,
                "endPosition": len(selected_text),
                "color": color,
                "notes": notes
            }
            
            response = requests.post(f"{API_BASE_URL}/api/documents/{document_id}/highlights", 
                                   json=payload)
            
            if response.status_code == 201:
                data = response.json()["highlight"]
                return Highlight(
                    id=data["id"],
                    document_id=data["documentId"],
                    page_number=data["pageNumber"], 
                    selected_text=data["selectedText"],
                    color=data["color"],
                    notes=data.get("notes", ""),
                    created_at=datetime.fromisoformat(data["createdAt"].replace('Z', '+00:00'))
                )
            return None
        except Exception as e:
            st.error(f"Failed to create highlight: {str(e)}")
            return None
    
    @staticmethod
    def get_highlights(document_id: str) -> List[Highlight]:
        """Get all highlights for document"""
        try:
            response = requests.get(f"{API_BASE_URL}/api/documents/{document_id}/highlights")
            
            if response.status_code == 200:
                highlights_data = response.json()["highlights"]
                return [
                    Highlight(
                        id=h["id"],
                        document_id=h["documentId"],
                        page_number=h["pageNumber"],
                        selected_text=h["selectedText"], 
                        color=h["color"],
                        notes=h.get("notes", ""),
                        created_at=datetime.fromisoformat(h["createdAt"].replace('Z', '+00:00'))
                    ) for h in highlights_data
                ]
            return []
        except Exception as e:
            st.error(f"Failed to get highlights: {str(e)}")
            return []

# UI Components
def render_hero_section():
    """Render the hero/landing section"""
    st.markdown("""
    <div style="text-align: center; padding: 2rem 0;">
        <h1 style="font-size: 3rem; font-weight: bold; color: #1f2937; margin-bottom: 1rem;">
            📚 Upload, Analyze, Learn
        </h1>
        <p style="font-size: 1.25rem; color: #6b7280; margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto;">
            Upload any research paper to get AI-powered explanations at your education level. 
            Chat with your documents and get contextual insights adapted to your background.
        </p>
    </div>
    """, unsafe_allow_html=True)

def render_education_level_selector():
    """Render education level selection"""
    st.subheader("🎓 Choose Your Learning Level")
    st.write("Get explanations tailored to your educational background, from general concepts to advanced research.")
    
    # Create columns for education level cards
    cols = st.columns(len(EDUCATION_LEVEL_CONFIG))
    
    for idx, (level, config) in enumerate(EDUCATION_LEVEL_CONFIG.items()):
        with cols[idx]:
            # Create a card-like button
            is_selected = st.session_state.education_level == level
            
            button_style = """
            background-color: #3b82f6; color: white; border: 2px solid #3b82f6;
            """ if is_selected else """
            background-color: white; color: #374151; border: 2px solid #e5e7eb;
            """
            
            st.markdown(f"""
            <div style="
                border-radius: 0.5rem; 
                padding: 1rem; 
                text-align: center; 
                cursor: pointer;
                {button_style}
                margin-bottom: 1rem;
            ">
                <div style="font-size: 2rem;">{config['icon']}</div>
                <div style="font-weight: bold; margin: 0.5rem 0;">{config['label']}</div>
                <div style="font-size: 0.875rem; opacity: 0.8;">{config['description']}</div>
            </div>
            """, unsafe_allow_html=True)
            
            if st.button(f"Select {config['label']}", key=f"select_{level}"):
                st.session_state.education_level = level
                st.rerun()

def render_document_upload():
    """Render document upload interface"""
    st.subheader("📄 Upload Your Research Paper")
    
    uploaded_file = st.file_uploader(
        "Choose a PDF file",
        type=['pdf'],
        help="Upload a PDF research paper to get started with AI-powered analysis"
    )
    
    if uploaded_file is not None:
        # Show file info
        col1, col2 = st.columns([1, 1])
        
        with col1:
            st.write(f"**Filename:** {uploaded_file.name}")
            st.write(f"**Size:** {uploaded_file.size / 1024:.1f} KB")
        
        with col2:
            st.write(f"**Education Level:** {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}")
        
        if st.button("🚀 Upload and Analyze", type="primary"):
            with st.spinner("Uploading and processing document..."):
                file_bytes = uploaded_file.read()
                document_id = APIClient.upload_document(
                    file_bytes, 
                    uploaded_file.name, 
                    st.session_state.education_level
                )
                
                if document_id:
                    st.session_state.current_document = APIClient.get_document(document_id)
                    st.success("✅ Document uploaded successfully!")
                    time.sleep(1)
                    st.rerun()

def render_document_viewer():
    """Render document viewer and chat interface"""
    if not st.session_state.current_document:
        return
        
    doc = st.session_state.current_document
    
    # Document header
    st.markdown(f"""
    <div style="background-color: white; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0; color: #1f2937;">{doc.title or doc.filename}</h2>
        {f'<p style="margin: 0.5rem 0 0 0; color: #6b7280;">by {", ".join(doc.authors)}</p>' if doc.authors else ''}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
            <span style="color: #6b7280;">Pages: {doc.total_pages}</span>
            <span style="color: #6b7280;">Level: {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Create two columns for PDF viewer and chat
    col1, col2 = st.columns([2, 1])
    
    with col1:
        render_pdf_viewer()
    
    with col2:
        render_chat_interface()

def render_pdf_viewer():
    """Render PDF viewer with highlighting capabilities"""
    if not st.session_state.current_document:
        return
        
    st.subheader("📖 PDF Viewer")
    
    # Page navigation
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col1:
        if st.button("⬅️ Previous", disabled=st.session_state.current_page <= 1):
            st.session_state.current_page = max(1, st.session_state.current_page - 1)
            st.rerun()
    
    with col2:
        page = st.number_input(
            "Page", 
            min_value=1, 
            max_value=st.session_state.current_document.total_pages,
            value=st.session_state.current_page,
            key="page_input"
        )
        if page != st.session_state.current_page:
            st.session_state.current_page = page
            st.rerun()
    
    with col3:
        if st.button("Next ➡️", disabled=st.session_state.current_page >= st.session_state.current_document.total_pages):
            st.session_state.current_page = min(st.session_state.current_document.total_pages, st.session_state.current_page + 1)
            st.rerun()
    
    # PDF display (using iframe for now - in production you'd use st_pdf_viewer or similar)
    pdf_url = f"{API_BASE_URL}/api/documents/{st.session_state.current_document.id}/pdf"
    
    st.markdown(f"""
    <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; height: 600px; overflow: hidden;">
        <iframe src="{pdf_url}#page={st.session_state.current_page}" 
                width="100%" height="100%" 
                style="border: none;">
        </iframe>
    </div>
    """, unsafe_allow_html=True)
    
    # Text selection and highlighting
    render_text_selection_tools()

def render_text_selection_tools():
    """Render text selection and highlighting tools"""
    st.subheader("✏️ Text Analysis Tools")
    
    # Text input for selection
    selected_text = st.text_area(
        "Selected Text",
        value=st.session_state.selected_text,
        height=100,
        help="Paste text from the PDF here for analysis",
        key="text_selection_input"
    )
    
    if selected_text != st.session_state.selected_text:
        st.session_state.selected_text = selected_text
    
    if selected_text:
        # Action buttons
        col1, col2 = st.columns([1, 1])
        
        with col1:
            if st.button("🧠 Explain", use_container_width=True):
                message = f'Can you explain this selected text: "{selected_text}"'
                add_chat_message("user", message, selected_text)
                
            if st.button("📚 Simplify", use_container_width=True):
                message = f'Can you simplify and break down this text in simple terms: "{selected_text}"'
                add_chat_message("user", message, selected_text)
        
        with col2:
            if st.button("❓ Follow-up", use_container_width=True):
                message = f'What follow-up questions should I ask about this text: "{selected_text}"'
                add_chat_message("user", message, selected_text)
            
            # Highlight button with color picker
            highlight_color = st.selectbox(
                "Highlight Color",
                options=list(HIGHLIGHT_COLORS.keys()),
                format_func=lambda x: f"{HIGHLIGHT_COLORS[x]['name']}"
            )
            
            if st.button("🎨 Highlight", use_container_width=True):
                create_highlight(selected_text, highlight_color)

def create_highlight(text: str, color: str, notes: str = ""):
    """Create a new highlight"""
    if not st.session_state.current_document or not text:
        return
        
    highlight = APIClient.create_highlight(
        st.session_state.current_document.id,
        st.session_state.current_page,
        text,
        color,
        notes
    )
    
    if highlight:
        st.session_state.highlights.append(highlight)
        st.success("✅ Highlight created!")
        time.sleep(1)
        st.rerun()

def render_highlights_panel():
    """Render highlights management panel"""
    if not st.session_state.current_document:
        return
        
    st.subheader("🎨 Highlights")
    
    # Load highlights if not loaded
    if not st.session_state.highlights:
        st.session_state.highlights = APIClient.get_highlights(st.session_state.current_document.id)
    
    if not st.session_state.highlights:
        st.info("No highlights yet. Select text and create your first highlight!")
        return
    
    # Group highlights by page
    highlights_by_page = {}
    for highlight in st.session_state.highlights:
        page = highlight.page_number
        if page not in highlights_by_page:
            highlights_by_page[page] = []
        highlights_by_page[page].append(highlight)
    
    # Display highlights
    for page in sorted(highlights_by_page.keys()):
        with st.expander(f"Page {page} ({len(highlights_by_page[page])} highlights)"):
            for highlight in highlights_by_page[page]:
                color_config = HIGHLIGHT_COLORS[highlight.color]
                
                st.markdown(f"""
                <div style="
                    background-color: {color_config['color']}; 
                    color: {color_config['text']}; 
                    padding: 0.75rem; 
                    border-radius: 0.375rem; 
                    margin-bottom: 0.5rem;
                    border-left: 4px solid {color_config['text']};
                ">
                    <div style="font-weight: bold; margin-bottom: 0.25rem;">{color_config['name']}</div>
                    <div style="font-size: 0.875rem;">{highlight.selected_text[:100]}{'...' if len(highlight.selected_text) > 100 else ''}</div>
                    {f'<div style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.8;"><strong>Notes:</strong> {highlight.notes}</div>' if highlight.notes else ''}
                    <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.6;">
                        Created: {highlight.created_at.strftime('%Y-%m-%d %H:%M')}
                    </div>
                </div>
                """, unsafe_allow_html=True)

def render_chat_interface():
    """Render chat interface"""
    st.subheader("💬 AI Assistant")
    
    # Chat messages container
    chat_container = st.container()
    
    with chat_container:
        # Display chat messages
        for message in st.session_state.chat_messages:
            if message.role == "user":
                st.markdown(f"""
                <div style="
                    background-color: #3b82f6; 
                    color: white; 
                    padding: 0.75rem; 
                    border-radius: 0.5rem; 
                    margin-bottom: 0.5rem;
                    margin-left: 2rem;
                ">
                    {message.content}
                    {f'<div style="font-size: 0.75rem; opacity: 0.8; margin-top: 0.5rem;">Selected: "{message.highlighted_text[:50]}..."</div>' if message.highlighted_text else ''}
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div style="
                    background-color: #f3f4f6; 
                    color: #374151; 
                    padding: 0.75rem; 
                    border-radius: 0.5rem; 
                    margin-bottom: 0.5rem;
                    margin-right: 2rem;
                ">
                    {message.content}
                </div>
                """, unsafe_allow_html=True)
    
    # Chat input
    with st.form("chat_form", clear_on_submit=True):
        user_message = st.text_area(
            "Ask a question about the document...", 
            height=80,
            key="chat_input"
        )
        
        col1, col2 = st.columns([1, 1])
        with col1:
            submit_button = st.form_submit_button("Send 💬", use_container_width=True)
        with col2:
            clear_button = st.form_submit_button("Clear Chat 🗑️", use_container_width=True)
        
        if submit_button and user_message:
            add_chat_message("user", user_message)
        
        if clear_button:
            st.session_state.chat_messages = []
            st.rerun()

def add_chat_message(role: str, content: str, highlighted_text: str = ""):
    """Add a message to chat and get AI response"""
    # Add user message
    message = ChatMessage(
        role=role,
        content=content,
        timestamp=datetime.now(),
        highlighted_text=highlighted_text
    )
    st.session_state.chat_messages.append(message)
    
    # Get AI response if user message
    if role == "user" and st.session_state.current_document:
        with st.spinner("AI is thinking..."):
            response = APIClient.send_chat_message(
                st.session_state.current_document.id,
                content,
                st.session_state.education_level,
                st.session_state.chat_session_id,
                highlighted_text
            )
            
            if response:
                ai_message = ChatMessage(
                    role="assistant",
                    content=response,
                    timestamp=datetime.now()
                )
                st.session_state.chat_messages.append(ai_message)
    
    st.rerun()

def render_sidebar():
    """Render sidebar with navigation and tools"""
    with st.sidebar:
        st.image("https://via.placeholder.com/200x60/3b82f6/white?text=Research+AI", width=200)
        
        st.markdown("---")
        
        # Document info
        if st.session_state.current_document:
            st.subheader("📄 Current Document")
            st.write(f"**{st.session_state.current_document.title or st.session_state.current_document.filename}**")
            st.write(f"Pages: {st.session_state.current_document.total_pages}")
            st.write(f"Level: {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}")
            
            if st.button("🏠 Upload New Document"):
                st.session_state.current_document = None
                st.session_state.chat_messages = []
                st.session_state.highlights = []
                st.session_state.selected_text = ""
                st.session_state.current_page = 1
                st.rerun()
            
            st.markdown("---")
            render_highlights_panel()
        
        else:
            st.subheader("🚀 Getting Started")
            st.write("1. Select your education level")
            st.write("2. Upload a PDF research paper") 
            st.write("3. Chat with your document")
            st.write("4. Highlight important text")
        
        st.markdown("---")
        
        # App info
        st.subheader("ℹ️ About")
        st.write("Research Paper AI Assistant helps you understand complex research papers through AI-powered explanations tailored to your education level.")
        
        st.write("**Features:**")
        st.write("• AI-powered explanations")
        st.write("• Text highlighting")
        st.write("• Interactive chat")
        st.write("• Multi-level adaptation")

def main():
    """Main application function"""
    # Page config
    st.set_page_config(
        page_title="Research Paper AI Assistant",
        page_icon="📚",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Custom CSS
    st.markdown("""
    <style>
        .main > div {
            padding-top: 2rem;
        }
        .stButton > button {
            border-radius: 0.5rem;
            border: 2px solid transparent;
            font-weight: 500;
            transition: all 0.2s;
        }
        .stButton > button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .stSelectbox > div > div {
            border-radius: 0.5rem;
        }
        .stTextArea > div > div > textarea {
            border-radius: 0.5rem;
        }
    </style>
    """, unsafe_allow_html=True)
    
    # Initialize session state
    initialize_session_state()
    
    # Render sidebar
    render_sidebar()
    
    # Main content area
    if st.session_state.current_document:
        render_document_viewer()
    else:
        render_hero_section()
        render_education_level_selector()
        st.markdown("---")
        render_document_upload()

if __name__ == "__main__":
    main()