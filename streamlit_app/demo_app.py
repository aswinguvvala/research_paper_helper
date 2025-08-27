"""
Streamlit Research Paper Helper - Demo Version
A standalone demo version that works without the backend API for Streamlit Cloud deployment
"""

import streamlit as st
import PyPDF2
from io import BytesIO
import fitz  # PyMuPDF
import time
from datetime import datetime
from enum import Enum
import uuid
import json

# Page config
st.set_page_config(
    page_title="Research Paper AI Assistant - Demo",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Education levels
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

# Highlight colors
HIGHLIGHT_COLORS = {
    "yellow": {"name": "Classic Yellow", "color": "#FEF08A", "text": "#A16207"},
    "blue": {"name": "Ocean Blue", "color": "#BFDBFE", "text": "#1D4ED8"}, 
    "green": {"name": "Nature Green", "color": "#BBF7D0", "text": "#059669"},
    "pink": {"name": "Soft Pink", "color": "#FBCFE8", "text": "#BE185D"},
    "orange": {"name": "Vibrant Orange", "color": "#FED7AA", "text": "#C2410C"},
    "purple": {"name": "Royal Purple", "color": "#DDD6FE", "text": "#7C3AED"},
    "red": {"name": "Alert Red", "color": "#FECACA", "text": "#DC2626"}
}

# Initialize session state
def initialize_session_state():
    if "education_level" not in st.session_state:
        st.session_state.education_level = EducationLevel.UNDERGRADUATE
    if "current_document" not in st.session_state:
        st.session_state.current_document = None
    if "pdf_text" not in st.session_state:
        st.session_state.pdf_text = ""
    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = []
    if "highlights" not in st.session_state:
        st.session_state.highlights = []
    if "selected_text" not in st.session_state:
        st.session_state.selected_text = ""

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
        width: 100%;
    }
    .stButton > button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .highlight-card {
        padding: 12px;
        border-radius: 8px;
        margin: 8px 0;
        border-left: 4px solid;
    }
    .chat-message {
        padding: 12px;
        border-radius: 8px;
        margin: 8px 0;
    }
    .user-message {
        background-color: #3b82f6;
        color: white;
        margin-left: 20px;
    }
    .assistant-message {
        background-color: #f3f4f6;
        color: #374151;
        margin-right: 20px;
    }
</style>
""", unsafe_allow_html=True)

def extract_text_from_pdf(pdf_file):
    """Extract text from uploaded PDF"""
    try:
        pdf_document = fitz.open(stream=pdf_file.read(), filetype="pdf")
        text = ""
        for page_num in range(pdf_document.page_count):
            page = pdf_document[page_num]
            text += page.get_text()
        pdf_document.close()
        return text
    except Exception as e:
        st.error(f"Error extracting text: {str(e)}")
        return ""

def generate_mock_response(message: str, education_level: str, selected_text: str = "") -> str:
    """Generate mock AI responses based on education level"""
    
    responses_by_level = {
        EducationLevel.NO_TECHNICAL: {
            "explain": f"Let me break this down in simple terms: {selected_text[:100]}... This concept means that researchers found something important. Think of it like discovering a new piece of a puzzle that helps us understand a bigger picture.",
            "simplify": f"Here's what this means in everyday language: The text you selected talks about research findings. Imagine you're trying to solve a mystery - this is like finding an important clue.",
            "followup": "Great questions to ask next: What does this mean for everyday people? How was this discovered? Why is this important? Can you give me a real-world example?",
            "general": "I understand you want to learn about this research paper. As a general reader, I'll explain things without using too much technical language. What specific part would you like me to help you understand?"
        },
        EducationLevel.HIGH_SCHOOL: {
            "explain": f"Looking at your selected text: {selected_text[:100]}... This is discussing research methodology and findings. At your level, think of this like a science experiment you might do in class, but much more detailed and complex.",
            "simplify": f"Here's a simpler version: The researchers conducted a study and found some results. It's like when you do a project for science class, but with more advanced methods and analysis.",
            "followup": "Good follow-up questions: What methods did they use? What were the main results? How does this compare to what you learned in science class? What are the practical applications?",
            "general": "This research paper covers some advanced topics, but I can explain them at a high school level. Think of scientific concepts you've learned and I'll connect them to this research."
        },
        EducationLevel.UNDERGRADUATE: {
            "explain": f"Analyzing your selection: {selected_text[:100]}... This section discusses the methodology and theoretical framework. At the undergraduate level, you should focus on understanding the research design, hypothesis testing, and how this fits into the broader field of study.",
            "simplify": f"Breaking this down: The authors are presenting their research approach and findings. This involves statistical analysis, peer review processes, and building on previous research - concepts you've encountered in your coursework.",
            "followup": "Consider these analytical questions: What is the research question? What methodology was used? How do the results compare to existing literature? What are the limitations? How does this advance the field?",
            "general": "This research paper requires understanding of academic methodology and statistical analysis. I'll explain concepts using examples from undergraduate coursework and relate them to theories you've studied."
        },
        EducationLevel.MASTERS: {
            "explain": f"Examining your selected text: {selected_text[:100]}... This demonstrates advanced research methodology with implications for both theoretical understanding and practical application. The authors employ sophisticated analytical techniques that you should evaluate critically.",
            "simplify": f"At the graduate level: This research contributes to ongoing academic discourse through rigorous methodology and novel insights. The work builds upon established theoretical frameworks while introducing new perspectives.",
            "followup": "Critical analysis questions: How does this methodology compare to alternatives? What are the theoretical implications? How robust is the statistical analysis? What are the policy or practical implications? How does this advance current understanding?",
            "general": "This research represents advanced academic work that requires critical analysis and deep understanding of the field. I'll help you engage with the complex theoretical and methodological aspects."
        },
        EducationLevel.PHD: {
            "explain": f"Your selected text: {selected_text[:100]}... represents sophisticated research with methodological rigor and theoretical contributions. Consider the epistemological assumptions, statistical power, and potential for replication. The work's position within current paradigms and potential paradigm shifts should be evaluated.",
            "simplify": f"At the doctoral level: This research demonstrates methodological innovation and theoretical advancement. The statistical approaches, sample considerations, and generalizability require careful evaluation within the broader research ecosystem.",
            "followup": "Doctoral-level considerations: What are the ontological and epistemological assumptions? How does the methodology address validity and reliability concerns? What are the theoretical contributions? How might this influence future research directions? What are the potential citations and impact?",
            "general": "This research requires doctoral-level analysis including evaluation of theoretical frameworks, methodological rigor, and contribution to knowledge. I'll engage with the sophisticated aspects of the work and help you critically evaluate its position in the field."
        }
    }
    
    level_responses = responses_by_level.get(education_level, responses_by_level[EducationLevel.UNDERGRADUATE])
    
    if "explain" in message.lower():
        return level_responses["explain"]
    elif "simplify" in message.lower():
        return level_responses["simplify"]
    elif "follow-up" in message.lower() or "followup" in message.lower():
        return level_responses["followup"]
    else:
        return level_responses["general"]

def render_hero_section():
    """Render hero section"""
    st.markdown("""
    <div style="text-align: center; padding: 2rem 0;">
        <h1 style="font-size: 3rem; font-weight: bold; color: #1f2937; margin-bottom: 1rem;">
            📚 Research Paper AI Assistant - Demo
        </h1>
        <p style="font-size: 1.25rem; color: #6b7280; margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto;">
            This is a demo version of our AI-powered research paper analysis tool. 
            Upload a PDF to extract text and simulate AI interactions adapted to your education level.
        </p>
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 0.5rem; padding: 1rem; margin: 1rem auto; max-width: 600px;">
            <p style="color: #92400e; margin: 0; font-size: 0.9rem;">
                <strong>Demo Mode:</strong> This version simulates AI responses and doesn't connect to a real backend. 
                For full functionality with real AI analysis, use the complete application.
            </p>
        </div>
    </div>
    """, unsafe_allow_html=True)

def render_education_selector():
    """Render education level selector"""
    st.subheader("🎓 Choose Your Learning Level")
    
    cols = st.columns(len(EDUCATION_LEVEL_CONFIG))
    
    for idx, (level, config) in enumerate(EDUCATION_LEVEL_CONFIG.items()):
        with cols[idx]:
            is_selected = st.session_state.education_level == level
            
            button_style = "background-color: #3b82f6; color: white;" if is_selected else "background-color: white; color: #374151;"
            
            st.markdown(f"""
            <div style="
                border: 2px solid {'#3b82f6' if is_selected else '#e5e7eb'};
                border-radius: 0.5rem; 
                padding: 1rem; 
                text-align: center; 
                margin-bottom: 1rem;
                {button_style}
            ">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">{config['icon']}</div>
                <div style="font-weight: bold; margin-bottom: 0.25rem;">{config['label']}</div>
                <div style="font-size: 0.875rem; opacity: 0.8;">{config['description']}</div>
            </div>
            """, unsafe_allow_html=True)
            
            if st.button(f"Select {config['label']}", key=f"select_{level}"):
                st.session_state.education_level = level
                st.rerun()

def render_pdf_upload():
    """Render PDF upload interface"""
    st.subheader("📄 Upload Your Research Paper")
    
    uploaded_file = st.file_uploader(
        "Choose a PDF file", 
        type=['pdf'],
        help="Upload a PDF research paper for analysis"
    )
    
    if uploaded_file is not None:
        col1, col2 = st.columns([1, 1])
        
        with col1:
            st.write(f"**Filename:** {uploaded_file.name}")
            st.write(f"**Size:** {uploaded_file.size / 1024:.1f} KB")
        
        with col2:
            st.write(f"**Education Level:** {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}")
        
        if st.button("🚀 Process Document", type="primary"):
            with st.spinner("Processing document..."):
                # Extract text from PDF
                pdf_text = extract_text_from_pdf(uploaded_file)
                
                # Store document info
                st.session_state.current_document = {
                    "id": str(uuid.uuid4()),
                    "filename": uploaded_file.name,
                    "title": uploaded_file.name.replace('.pdf', '').replace('_', ' ').title(),
                    "text": pdf_text,
                    "total_pages": len(pdf_text.split('\n\n')) // 10,  # Rough estimate
                    "uploaded_at": datetime.now()
                }
                st.session_state.pdf_text = pdf_text
                
                st.success("✅ Document processed successfully!")
                time.sleep(1)
                st.rerun()

def render_document_viewer():
    """Render document viewer"""
    if not st.session_state.current_document:
        return
    
    doc = st.session_state.current_document
    
    # Document header
    st.markdown(f"""
    <div style="background-color: white; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0; color: #1f2937;">{doc['title']}</h2>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; color: #6b7280;">
            <span>Estimated Pages: {doc['total_pages']}</span>
            <span>Level: {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Two column layout
    col1, col2 = st.columns([2, 1])
    
    with col1:
        render_text_viewer()
    
    with col2:
        render_chat_interface()

def render_text_viewer():
    """Render text viewer and analysis tools"""
    st.subheader("📖 Document Text")
    
    # Display text in a scrollable container
    if st.session_state.pdf_text:
        # Truncate very long text for demo
        display_text = st.session_state.pdf_text[:5000]
        if len(st.session_state.pdf_text) > 5000:
            display_text += "\n\n... [Text truncated for demo. Full version shows complete document]"
        
        st.text_area("Document Content", display_text, height=300, disabled=True)
    
    st.subheader("✏️ Text Analysis Tools")
    
    # Text selection input
    selected_text = st.text_area(
        "Select text to analyze:",
        st.session_state.selected_text,
        height=100,
        help="Copy and paste text from the document above for AI analysis"
    )
    
    if selected_text != st.session_state.selected_text:
        st.session_state.selected_text = selected_text
    
    if selected_text:
        # Action buttons
        col1, col2 = st.columns([1, 1])
        
        with col1:
            if st.button("🧠 Explain", use_container_width=True):
                add_chat_message("user", f'Can you explain this selected text: "{selected_text}"')
            
            if st.button("📚 Simplify", use_container_width=True):
                add_chat_message("user", f'Can you simplify and break down this text: "{selected_text}"')
        
        with col2:
            if st.button("❓ Follow-up", use_container_width=True):
                add_chat_message("user", f'What follow-up questions should I ask about this text: "{selected_text}"')
            
            # Highlight simulation
            highlight_color = st.selectbox(
                "Highlight Color",
                options=list(HIGHLIGHT_COLORS.keys()),
                format_func=lambda x: HIGHLIGHT_COLORS[x]['name']
            )
            
            if st.button("🎨 Add Highlight", use_container_width=True):
                create_highlight(selected_text, highlight_color)

def create_highlight(text: str, color: str):
    """Create a simulated highlight"""
    highlight = {
        "id": str(uuid.uuid4()),
        "text": text,
        "color": color,
        "created_at": datetime.now(),
        "notes": ""
    }
    st.session_state.highlights.append(highlight)
    st.success("✅ Highlight added!")

def render_chat_interface():
    """Render chat interface"""
    st.subheader("💬 AI Assistant")
    
    # Display chat messages
    chat_container = st.container()
    
    with chat_container:
        for message in st.session_state.chat_messages:
            if message["role"] == "user":
                st.markdown(f"""
                <div class="chat-message user-message">
                    <strong>You:</strong> {message["content"]}
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div class="chat-message assistant-message">
                    <strong>AI Assistant:</strong> {message["content"]}
                </div>
                """, unsafe_allow_html=True)
    
    # Chat input
    with st.form("chat_form", clear_on_submit=True):
        user_message = st.text_area("Ask about the document:", height=80)
        
        col1, col2 = st.columns([1, 1])
        with col1:
            submit_button = st.form_submit_button("Send 💬", use_container_width=True)
        with col2:
            clear_button = st.form_submit_button("Clear Chat", use_container_width=True)
        
        if submit_button and user_message:
            add_chat_message("user", user_message)
        
        if clear_button:
            st.session_state.chat_messages = []
            st.rerun()

def add_chat_message(role: str, content: str):
    """Add message and generate AI response"""
    # Add user message
    st.session_state.chat_messages.append({
        "role": role,
        "content": content,
        "timestamp": datetime.now()
    })
    
    # Generate AI response
    if role == "user":
        with st.spinner("AI is thinking..."):
            time.sleep(1)  # Simulate thinking time
            response = generate_mock_response(
                content, 
                st.session_state.education_level, 
                st.session_state.selected_text
            )
            
            st.session_state.chat_messages.append({
                "role": "assistant",
                "content": response,
                "timestamp": datetime.now()
            })
    
    st.rerun()

def render_sidebar():
    """Render sidebar"""
    with st.sidebar:
        st.image("https://via.placeholder.com/200x60/3b82f6/white?text=Research+AI", width=200)
        
        st.markdown("---")
        
        # Document info
        if st.session_state.current_document:
            st.subheader("📄 Current Document")
            doc = st.session_state.current_document
            st.write(f"**{doc['title']}**")
            st.write(f"Pages: ~{doc['total_pages']}")
            st.write(f"Level: {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}")
            
            if st.button("🏠 Upload New Document"):
                st.session_state.current_document = None
                st.session_state.chat_messages = []
                st.session_state.highlights = []
                st.session_state.selected_text = ""
                st.session_state.pdf_text = ""
                st.rerun()
            
            st.markdown("---")
            
            # Highlights
            if st.session_state.highlights:
                st.subheader("🎨 Highlights")
                for highlight in st.session_state.highlights:
                    color_config = HIGHLIGHT_COLORS[highlight["color"]]
                    st.markdown(f"""
                    <div style="
                        background-color: {color_config['color']}; 
                        color: {color_config['text']}; 
                        padding: 0.75rem; 
                        border-radius: 0.375rem; 
                        margin-bottom: 0.5rem;
                        border-left: 4px solid {color_config['text']};
                    ">
                        <div style="font-weight: bold; font-size: 0.75rem;">{color_config['name']}</div>
                        <div style="font-size: 0.875rem;">{highlight['text'][:100]}...</div>
                    </div>
                    """, unsafe_allow_html=True)
        
        st.markdown("---")
        
        # App info
        st.subheader("ℹ️ About This Demo")
        st.write("""
        This demo shows the Streamlit interface for our Research Paper AI Assistant.
        
        **Demo Features:**
        • PDF text extraction
        • Education level adaptation
        • Simulated AI responses
        • Text highlighting
        • Chat interface
        
        **Full Version Features:**
        • Real AI-powered analysis
        • Advanced PDF viewing
        • Persistent highlights
        • Backend API integration
        """)
        
        st.markdown("---")
        st.write("**Tech Stack:**")
        st.write("• Streamlit")
        st.write("• PyMuPDF") 
        st.write("• Python")

def main():
    """Main app function"""
    initialize_session_state()
    render_sidebar()
    
    if st.session_state.current_document:
        render_document_viewer()
    else:
        render_hero_section()
        render_education_selector()
        st.markdown("---")
        render_pdf_upload()

if __name__ == "__main__":
    main()