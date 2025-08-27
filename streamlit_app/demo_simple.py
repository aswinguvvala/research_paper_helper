"""
Streamlit Research Paper Helper - Simple Demo for Cloud Deployment
A lightweight demo version optimized for Streamlit Cloud deployment
Uses only PyPDF2 (no compilation required) and simulates backend functionality
"""

import streamlit as st
import PyPDF2
from io import BytesIO
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
    .demo-banner {
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border: 2px solid #f59e0b;
        border-radius: 12px;
        padding: 16px;
        margin: 16px 0;
        text-align: center;
    }
</style>
""", unsafe_allow_html=True)

def extract_text_from_pdf(pdf_file):
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

def generate_mock_response(message: str, education_level: str, selected_text: str = "") -> str:
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

def render_demo_banner():
    """Render demo notice banner"""
    st.markdown("""
    <div class="demo-banner">
        <h3 style="margin: 0 0 8px 0; color: #92400e;">🚀 Interactive Demo Version</h3>
        <p style="margin: 0; color: #92400e; font-size: 0.9rem;">
            This demo showcases our AI-powered research paper analysis interface with simulated responses. 
            Upload a PDF to see text extraction and education-level adapted explanations in action!
        </p>
    </div>
    """, unsafe_allow_html=True)

def render_hero_section():
    """Render hero section"""
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
    
    render_demo_banner()

def render_education_selector():
    """Render education level selector"""
    st.subheader("🎓 Choose Your Learning Level")
    st.write("Get explanations tailored to your educational background, from general concepts to advanced research.")
    
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
                cursor: pointer;
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
    
    # File size info
    st.info("💡 **Tip**: For best results, upload papers under 10MB. The demo works with any PDF research paper!")
    
    uploaded_file = st.file_uploader(
        "Choose a PDF file", 
        type=['pdf'],
        help="Upload a PDF research paper for AI-powered analysis"
    )
    
    if uploaded_file is not None:
        col1, col2 = st.columns([1, 1])
        
        with col1:
            st.write(f"**📄 File:** {uploaded_file.name}")
            st.write(f"**📊 Size:** {uploaded_file.size / 1024:.1f} KB")
        
        with col2:
            st.write(f"**🎓 Level:** {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}")
            st.write(f"**🔧 Processor:** PyPDF2 Text Extraction")
        
        if st.button("🚀 Process Document", type="primary", use_container_width=True):
            with st.spinner("Extracting text from PDF... This may take a moment for larger files."):
                # Extract text from PDF
                pdf_text = extract_text_from_pdf(uploaded_file)
                
                if pdf_text.strip():
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
                    
                    st.success("✅ Document processed successfully! You can now chat with your document.")
                    time.sleep(1.5)
                    st.rerun()
                else:
                    st.error("❌ Could not extract text from this PDF. Please try a different file or ensure it contains readable text.")

def render_document_viewer():
    """Render document viewer"""
    if not st.session_state.current_document:
        return
    
    doc = st.session_state.current_document
    
    # Document header
    st.markdown(f"""
    <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="margin: 0 0 0.5rem 0; color: #1e293b; display: flex; align-items: center;">
            📄 {doc['title']}
        </h2>
        <div style="display: flex; justify-content: space-between; align-items: center; color: #64748b; font-size: 0.9rem;">
            <div style="display: flex; gap: 2rem;">
                <span>📊 ~{doc['total_pages']} sections</span>
                <span>🎓 {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}</span>
                <span>⏰ {doc['uploaded_at'].strftime('%H:%M')}</span>
            </div>
            <span style="background: #10b981; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.8rem;">Ready for Analysis</span>
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
    st.subheader("📖 Document Content")
    
    # Display text in a scrollable container
    if st.session_state.pdf_text:
        # Show text with character count
        char_count = len(st.session_state.pdf_text)
        word_count = len(st.session_state.pdf_text.split())
        
        st.info(f"📊 **Document Stats**: {char_count:,} characters • {word_count:,} words")
        
        # Truncate very long text for display
        display_text = st.session_state.pdf_text
        if len(display_text) > 8000:
            display_text = display_text[:8000] + f"\n\n... [Content truncated for display. Full text ({char_count:,} chars) available for analysis]"
        
        st.text_area("Extracted Text", display_text, height=300, disabled=True)
    
    st.subheader("✏️ Text Analysis Tools")
    st.write("Select any text from the document above to get AI-powered explanations!")
    
    # Text selection input
    selected_text = st.text_area(
        "Paste text here for analysis:",
        st.session_state.selected_text,
        height=100,
        help="Copy and paste any text from the document above to get explanations adapted to your education level"
    )
    
    if selected_text != st.session_state.selected_text:
        st.session_state.selected_text = selected_text
    
    if selected_text:
        st.success(f"✅ **{len(selected_text)} characters** selected for analysis")
        
        # Action buttons
        col1, col2 = st.columns([1, 1])
        
        with col1:
            if st.button("🧠 Explain This", use_container_width=True, type="primary"):
                add_chat_message("user", f'Can you explain this selected text: "{selected_text[:200]}{"..." if len(selected_text) > 200 else ""}"')
            
            if st.button("📚 Simplify", use_container_width=True):
                add_chat_message("user", f'Can you simplify and break down this text in simple terms: "{selected_text[:200]}{"..." if len(selected_text) > 200 else ""}"')
        
        with col2:
            if st.button("❓ Follow-up Questions", use_container_width=True):
                add_chat_message("user", f'What follow-up questions should I ask about this text: "{selected_text[:200]}{"..." if len(selected_text) > 200 else ""}"')
            
            # Highlight simulation
            highlight_color = st.selectbox(
                "🎨 Highlight Color",
                options=list(HIGHLIGHT_COLORS.keys()),
                format_func=lambda x: f"{HIGHLIGHT_COLORS[x]['name']}",
                key="highlight_color_select"
            )
            
            if st.button("✨ Add Highlight", use_container_width=True):
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
    st.success(f"✅ Highlight added with {HIGHLIGHT_COLORS[color]['name']}!")

def render_chat_interface():
    """Render chat interface"""
    st.subheader("💬 AI Research Assistant")
    st.write("Chat with your document and get explanations adapted to your education level!")
    
    # Display chat messages
    if st.session_state.chat_messages:
        chat_container = st.container(height=400)
        
        with chat_container:
            for message in st.session_state.chat_messages:
                if message["role"] == "user":
                    st.markdown(f"""
                    <div class="chat-message user-message">
                        <strong>🧑 You:</strong><br>{message["content"]}
                    </div>
                    """, unsafe_allow_html=True)
                else:
                    st.markdown(f"""
                    <div class="chat-message assistant-message">
                        <strong>🤖 AI Assistant ({EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['icon']} {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}):</strong><br>{message["content"]}
                    </div>
                    """, unsafe_allow_html=True)
    else:
        st.info("💡 Start a conversation! Ask questions about your document or select text for analysis.")
    
    # Chat input
    with st.form("chat_form", clear_on_submit=True):
        user_message = st.text_area("Ask about your document:", height=80, placeholder="What would you like to know about this research?")
        
        col1, col2 = st.columns([1, 1])
        with col1:
            submit_button = st.form_submit_button("Send 💬", use_container_width=True, type="primary")
        with col2:
            clear_button = st.form_submit_button("Clear Chat 🗑️", use_container_width=True)
        
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
        with st.spinner("🤖 AI is analyzing your question..."):
            time.sleep(1.5)  # Simulate thinking time
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
        st.markdown("""
        <div style="text-align: center; padding: 1rem; background: linear-gradient(135deg, #3b82f6, #1e40af); border-radius: 0.5rem; margin-bottom: 1rem;">
            <h3 style="color: white; margin: 0;">📚 Research AI</h3>
            <p style="color: #bfdbfe; margin: 0.5rem 0 0 0; font-size: 0.8rem;">Demo Version</p>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("---")
        
        # Document info
        if st.session_state.current_document:
            st.subheader("📄 Current Document")
            doc = st.session_state.current_document
            st.write(f"**{doc['title'][:30]}{'...' if len(doc['title']) > 30 else ''}**")
            st.write(f"📊 ~{doc['total_pages']} sections")
            st.write(f"🎓 {EDUCATION_LEVEL_CONFIG[st.session_state.education_level]['label']}")
            
            if st.button("🏠 Upload New Document", use_container_width=True):
                # Reset all states
                for key in ["current_document", "chat_messages", "highlights", "selected_text", "pdf_text"]:
                    st.session_state[key] = [] if key in ["chat_messages", "highlights"] else ("" if key in ["selected_text", "pdf_text"] else None)
                st.rerun()
            
            st.markdown("---")
            
            # Highlights section
            if st.session_state.highlights:
                st.subheader("🎨 Your Highlights")
                for idx, highlight in enumerate(st.session_state.highlights[-5:]):  # Show last 5
                    color_config = HIGHLIGHT_COLORS[highlight["color"]]
                    text_preview = highlight['text'][:80] + '...' if len(highlight['text']) > 80 else highlight['text']
                    
                    st.markdown(f"""
                    <div style="
                        background-color: {color_config['color']}; 
                        color: {color_config['text']}; 
                        padding: 0.75rem; 
                        border-radius: 0.5rem; 
                        margin-bottom: 0.5rem;
                        border-left: 4px solid {color_config['text']};
                        font-size: 0.8rem;
                    ">
                        <div style="font-weight: bold; margin-bottom: 0.25rem;">{color_config['name']}</div>
                        <div>{text_preview}</div>
                        <div style="font-size: 0.7rem; opacity: 0.7; margin-top: 0.25rem;">
                            {highlight['created_at'].strftime('%H:%M')}
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                
                if len(st.session_state.highlights) > 5:
                    st.info(f"📝 Showing recent highlights ({len(st.session_state.highlights)} total)")
            else:
                st.info("🎨 No highlights yet. Select text to create your first highlight!")
        
        st.markdown("---")
        
        # App info
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