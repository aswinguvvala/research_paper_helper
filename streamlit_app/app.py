"""
Streamlit Research Paper Helper - Cloud-Ready Demo Application
A Streamlit version that works standalone with simulated AI responses
Optimized for Streamlit Cloud deployment without backend dependencies
"""

import streamlit as st
import time
import os
from typing import Optional, List
from enum import Enum
import uuid
import PyPDF2
from io import BytesIO
from datetime import datetime

# Configuration - Demo mode for cloud deployment
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# Page config
st.set_page_config(
    page_title="Research Paper AI Assistant",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded"
)

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

class Document:
    def __init__(self, id: str, filename: str, title: str, authors: List[str], 
                 total_pages: int, uploaded_at: datetime, processed_at: Optional[datetime] = None):
        self.id = id
        self.filename = filename
        self.title = title
        self.authors = authors
        self.total_pages = total_pages
        self.uploaded_at = uploaded_at
        self.processed_at = processed_at

class ChatMessage:
    def __init__(self, role: str, content: str, timestamp: datetime, highlighted_text: Optional[str] = None):
        self.role = role
        self.content = content
        self.timestamp = timestamp
        self.highlighted_text = highlighted_text

class Highlight:
    def __init__(self, id: str, document_id: str, page_number: int, selected_text: str,
                 color: str, notes: Optional[str], created_at: datetime):
        self.id = id
        self.document_id = document_id
        self.page_number = page_number
        self.selected_text = selected_text
        self.color = color
        self.notes = notes
        self.created_at = created_at

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
        
    if "pdf_text" not in st.session_state:
        st.session_state.pdf_text = ""

# PDF Processing Functions
def extract_text_from_pdf(pdf_file) -> str:
    """Extract text from uploaded PDF using PyPDF2"""
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_file.read()))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n\n"
        return text
    except Exception as e:
        st.error(f"Error extracting text: {str(e)}")
        return ""

def generate_mock_response(message: str, education_level: EducationLevel, selected_text: str = "") -> str:
    """Generate mock AI responses based on education level"""
    
    # Sample responses based on common research paper topics
    if selected_text:
        text_preview = selected_text[:100] + "..." if len(selected_text) > 100 else selected_text
    else:
        text_preview = "the research content"
    
    responses_by_level = {
        EducationLevel.NO_TECHNICAL: {
            "explain": f"Let me break down {text_preview} in simple terms: This research is like solving a puzzle. The scientists had a question, they did experiments to find answers, and they discovered something new that helps us understand the world better. Think of it like when you're curious about something and you investigate to find out more!",
            
            "simplify": f"Here's what this means in everyday language: The researchers were trying to figure something out, just like when you're trying to solve a problem at home. They used special methods (like following a recipe) to find their answer. The results they found are important because they help us understand things better.",
            
            "followup": "Great questions to ask: What does this mean for people like me? How will this help in everyday life? Can you give me a real-world example? Why should I care about this research?",
            
            "general": "I see you're interested in learning about this research! I'll explain everything in simple terms without using confusing scientific words. What would you like to understand better?"
        },
        
        EducationLevel.HIGH_SCHOOL: {
            "explain": f"Looking at {text_preview}: This research follows the scientific method you've learned about. The researchers started with a hypothesis (educated guess), designed experiments to test it, collected data, and drew conclusions. The methodology they used is more advanced than typical high school experiments, but the basic principles are the same.",
            
            "simplify": f"Breaking this down: Think of this like the science projects you do in class, but much more complex. The researchers used advanced tools and statistics to make sure their results were accurate. They had to consider many variables that might affect their findings.",
            
            "followup": "Consider these questions: What was their hypothesis? How did they control for other factors? What do their results mean? How does this connect to what you've learned in science class?",
            
            "general": "This research uses advanced versions of scientific concepts you're familiar with. I'll connect it to what you've learned in your science classes and explain the more complex parts step by step."
        },
        
        EducationLevel.UNDERGRADUATE: {
            "explain": f"Analyzing {text_preview}: This represents systematic academic research using established methodological frameworks. The researchers employed quantitative/qualitative analysis techniques that you've encountered in your coursework. Notice how they structure their argument, present evidence, and acknowledge limitations.",
            
            "simplify": f"At the undergraduate level: This research demonstrates rigorous academic methodology. The authors follow standard research protocols, use appropriate statistical analysis, and situate their work within existing literature - all practices you're learning in your major.",
            
            "followup": "Critical thinking questions: What's the research question? How robust is their methodology? What are the implications for the field? How does this compare to other studies you've read?",
            
            "general": "This research exemplifies the kind of academic work you're learning to understand and eventually produce. I'll help you analyze the methodology, findings, and significance within your field of study."
        },
        
        EducationLevel.MASTERS: {
            "explain": f"Examining {text_preview}: This work demonstrates sophisticated research design with clear theoretical grounding. The authors navigate complex methodological considerations and present nuanced findings that contribute meaningfully to the academic discourse. Note the integration of multiple analytical frameworks.",
            
            "simplify": f"At the graduate level: This research represents advanced scholarly contribution with methodological rigor and theoretical sophistication. The work bridges existing knowledge gaps and opens new avenues for investigation in the field.",
            
            "followup": "Advanced analysis questions: How does the theoretical framework inform the methodology? What are the epistemological assumptions? How might you build upon this research? What are the policy or practical implications?",
            
            "general": "This research represents the caliber of work you're developing expertise in. I'll help you critically evaluate the theoretical contributions, methodological choices, and broader significance for your field."
        },
        
        EducationLevel.PHD: {
            "explain": f"Regarding {text_preview}: This work presents sophisticated theoretical contributions with methodological innovation. Consider the ontological foundations, the interplay between theory and method, and the potential paradigmatic implications. The research demonstrates both rigor and creativity in addressing complex phenomena.",
            
            "simplify": f"At the doctoral level: This scholarship exemplifies advanced research praxis, integrating theoretical sophistication with methodological innovation. The work's contribution to knowledge production and its potential influence on future research directions merit careful consideration.",
            
            "followup": "Doctoral-level considerations: What are the epistemological and ontological commitments? How does this advance theory? What are the methodological innovations? How might this influence your own research agenda?",
            
            "general": "This research represents the kind of scholarly contribution you're trained to produce and critique. I'll engage with the complex theoretical, methodological, and paradigmatic dimensions of the work."
        }
    }
    
    level_responses = responses_by_level.get(education_level, responses_by_level[EducationLevel.UNDERGRADUATE])
    
    if "explain" in message.lower() and selected_text:
        return level_responses["explain"]
    elif "simplify" in message.lower() and selected_text:
        return level_responses["simplify"]
    elif "follow-up" in message.lower() or "followup" in message.lower():
        return level_responses["followup"]
    else:
        return level_responses["general"]

# Demo API Client - Simulates backend functionality
class APIClient:
    """Helper class for simulated API communications"""
    
    @staticmethod
    def upload_document(file_bytes: bytes, filename: str, education_level: EducationLevel) -> Optional[str]:
        """Simulate document upload by processing PDF locally"""
        try:
            # Extract text using PyPDF2
            pdf_text = extract_text_from_pdf(BytesIO(file_bytes))
            
            if pdf_text.strip():
                document_id = str(uuid.uuid4())
                
                # Store document info in session state
                st.session_state.current_document = Document(
                    id=document_id,
                    filename=filename,
                    title=filename.replace('.pdf', '').replace('_', ' ').title(),
                    authors=[],
                    total_pages=len(pdf_text.split('\n\n')) // 10,  # Rough estimate
                    uploaded_at=datetime.now()
                )
                st.session_state.pdf_text = pdf_text
                return document_id
            else:
                st.error("❌ Could not extract text from this PDF. Please try a different file.")
                return None
                
        except Exception as e:
            st.error(f"Upload error: {str(e)}")
            return None
    
    @staticmethod
    def get_document(document_id: str) -> Optional[Document]:
        """Get document from session state (demo mode)"""
        # In demo mode, document is stored in session state
        return st.session_state.get("current_document", None)
    
    @staticmethod
    def send_chat_message(document_id: str, message: str, education_level: EducationLevel, 
                         session_id: str, highlighted_text: str = "") -> Optional[str]:
        """Generate simulated AI chat response"""
        try:
            # Use the mock response generator
            response = generate_mock_response(message, education_level, highlighted_text)
            return response
        except Exception as e:
            st.error(f"Chat error: {str(e)}")
            return None
    
    @staticmethod 
    def create_highlight(document_id: str, page_number: int, selected_text: str, 
                        color: str, notes: str = "") -> Optional[Highlight]:
        """Create highlight in session state (demo mode)"""
        try:
            highlight = Highlight(
                id=str(uuid.uuid4()),
                document_id=document_id,
                page_number=page_number,
                selected_text=selected_text,
                color=color,
                notes=notes,
                created_at=datetime.now()
            )
            
            # Store in session state
            if "highlights" not in st.session_state:
                st.session_state.highlights = []
            st.session_state.highlights.append(highlight)
            
            return highlight
        except Exception as e:
            st.error(f"Failed to create highlight: {str(e)}")
            return None
    
    @staticmethod
    def get_highlights(document_id: str) -> List[Highlight]:
        """Get highlights from session state (demo mode)"""
        return st.session_state.get("highlights", [])

# UI Components
def render_hero_section():
    """Render the hero/landing section"""
    st.markdown("""
    <div style="text-align: center; padding: 2rem 0;">
        <h1 style="font-size: 3rem; font-weight: bold; color: #1f2937; margin-bottom: 1rem;">
            📚 Research Paper AI Assistant
        </h1>
        <p style="font-size: 1.25rem; color: #6b7280; margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto;">
            Transform how you understand research papers with AI-powered explanations 
            adapted to your education level. Upload, analyze, and learn with confidence.
        </p>
    </div>
    """, unsafe_allow_html=True)
    
    # Demo banner for cloud deployment
    if DEMO_MODE:
        st.markdown("""
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 2px solid #f59e0b; border-radius: 12px; padding: 16px; margin: 16px auto; max-width: 800px; text-align: center;">
            <h3 style="margin: 0 0 8px 0; color: #92400e;">🚀 Interactive Demo Version</h3>
            <p style="margin: 0; color: #92400e; font-size: 0.9rem;">
                This demo showcases our AI-powered research paper analysis interface with simulated responses. 
                Upload a PDF to see text extraction and education-level adapted explanations in action!
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
                
                # Reset file pointer for processing
                uploaded_file.seek(0)
                
                document_id = APIClient.upload_document(
                    file_bytes, 
                    uploaded_file.name, 
                    st.session_state.education_level
                )
                
                if document_id:
                    st.success("✅ Document uploaded successfully!")
                    time.sleep(1.5)
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
    
    # Display extracted text in demo mode
    if st.session_state.pdf_text:
        char_count = len(st.session_state.pdf_text)
        word_count = len(st.session_state.pdf_text.split())
        
        st.info(f"📊 **Document Stats**: {char_count:,} characters • {word_count:,} words")
        
        # Truncate very long text for display
        display_text = st.session_state.pdf_text
        if len(display_text) > 8000:
            display_text = display_text[:8000] + f"\n\n... [Content truncated for display. Full text ({char_count:,} chars) available for analysis]"
        
        st.text_area("Extracted Text", display_text, height=400, disabled=True)
    else:
        st.info("📄 Upload a PDF to see extracted content here")
    
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
                # Reset all document-related state
                for key in ["current_document", "chat_messages", "highlights", "selected_text", "pdf_text"]:
                    if key in ["chat_messages", "highlights"]:
                        st.session_state[key] = []
                    elif key in ["selected_text", "pdf_text"]:
                        st.session_state[key] = ""
                    else:
                        st.session_state[key] = None
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
        if DEMO_MODE:
            st.subheader("ℹ️ About This Demo")
            st.markdown("""
            **🚀 Demo Features:**
            - 📄 PDF text extraction
            - 🎓 Education-level adaptation
            - 🤖 Simulated AI responses
            - 🎨 Text highlighting
            - 💬 Interactive chat
            
            **🔧 Technology:**
            - Streamlit framework
            - PyPDF2 for PDF processing
            - Python-based UI
            
            **💡 Full Version:**
            - Real AI integration
            - Advanced PDF viewer
            - Database persistence
            - Backend API
            """)
        else:
            st.subheader("ℹ️ About")
            st.write("Research Paper AI Assistant helps you understand complex research papers through AI-powered explanations tailored to your education level.")
            
            st.write("**Features:**")
            st.write("• AI-powered explanations")
            st.write("• Text highlighting")
            st.write("• Interactive chat")
            st.write("• Multi-level adaptation")

def main():
    """Main application function"""
    
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