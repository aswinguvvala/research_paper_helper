# Streamlit Research Paper Helper

A Streamlit-based web application that provides the same functionality as the React version of the Research Paper Helper, allowing users to upload, analyze, and interact with research papers using AI-powered explanations.

## 🚀 Features

- **📚 Document Upload & Processing**: Upload PDF research papers for AI analysis
- **🎓 Education Level Adaptation**: Get explanations tailored to your educational background
- **💬 Interactive Chat**: Ask questions about the document and get contextual responses
- **🎨 Text Highlighting**: Highlight important text with different colors and add notes
- **📖 PDF Viewer**: Integrated PDF viewing with page navigation
- **🧠 AI-Powered Analysis**: Text explanation, simplification, and follow-up questions

## 🏗️ Architecture

The Streamlit app communicates with the same backend API used by the React application:

```
┌─────────────────┐    HTTP/JSON     ┌─────────────────┐    HTTP      ┌─────────────────┐
│  Streamlit UI   │◄──────────────► │   Node.js API   │◄───────────► │   Python AI     │
│  (Port 8501)    │                 │   (Port 8000)   │              │   (Port 5000)   │
└─────────────────┘                 └─────────────────┘              └─────────────────┘
```

## 📦 Installation

### Method 1: Local Installation

1. **Clone and navigate to the Streamlit app directory**:
   ```bash
   cd streamlit_app
   ```

2. **Create a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Ensure the backend API is running**:
   ```bash
   # In the root directory
   docker-compose up server ai-service
   ```

6. **Run the Streamlit app**:
   ```bash
   streamlit run app.py
   ```

### Method 2: Docker

1. **Build the Docker image**:
   ```bash
   docker build -t research-assistant-streamlit .
   ```

2. **Run the container**:
   ```bash
   docker run -p 8501:8501 -e API_BASE_URL=http://localhost:8000 research-assistant-streamlit
   ```

### Method 3: Docker Compose (Recommended)

Add to your main `docker-compose.yml`:

```yaml
services:
  # ... existing services ...
  
  streamlit-app:
    build:
      context: ./streamlit_app
      dockerfile: Dockerfile
    ports:
      - "8501:8501"
    environment:
      - API_BASE_URL=http://server:8000
    depends_on:
      - server
    restart: unless-stopped
```

Then run:
```bash
docker-compose up streamlit-app
```

## 🎯 Usage

1. **Open the application** in your browser at `http://localhost:8501`

2. **Select your education level** from the available options:
   - General Reader (No technical background)
   - High School 
   - Undergraduate
   - Graduate (Master's level)
   - PhD/Research

3. **Upload a PDF research paper** using the file uploader

4. **Interact with your document**:
   - Navigate through PDF pages
   - Select text for analysis
   - Use AI tools (Explain, Simplify, Follow-up)
   - Create highlights with different colors
   - Chat with the document

5. **View and manage highlights** in the sidebar panel

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `http://localhost:8000` | Backend API URL |
| `STREAMLIT_SERVER_PORT` | `8501` | Streamlit server port |
| `MAX_UPLOAD_SIZE_MB` | `100` | Maximum upload file size |
| `DEBUG` | `false` | Enable debug mode |

### Streamlit Configuration

The app includes a pre-configured `.streamlit/config.toml` file with optimized settings:

- **Server Configuration**: Port, address, CORS settings
- **Theme**: Custom color scheme matching the React app
- **Upload Settings**: Increased file size limits
- **Performance**: Caching and optimization settings

## 🎨 UI Components

### Main Components

1. **Hero Section**: Welcome screen with education level selection
2. **Document Upload**: Drag-and-drop PDF upload interface
3. **PDF Viewer**: Integrated PDF display with navigation
4. **Text Selection Tools**: AI analysis buttons and highlighting
5. **Chat Interface**: Interactive conversation with the document
6. **Highlights Panel**: Management of saved highlights
7. **Sidebar**: Navigation and document information

### Styling

The app uses custom CSS to match the React application's design:
- **Colors**: Primary blue (#3b82f6), secondary grays
- **Typography**: Sans-serif fonts with proper hierarchy
- **Layout**: Responsive design with proper spacing
- **Interactions**: Hover effects and smooth transitions

## 🔌 API Integration

### Endpoints Used

- `POST /api/documents/upload` - Upload PDF documents
- `GET /api/documents/{id}` - Get document metadata
- `POST /api/chat` - Send chat messages
- `POST /api/documents/{id}/highlights` - Create highlights
- `GET /api/documents/{id}/highlights` - Get document highlights
- `GET /api/health` - Health check

### Error Handling

The app includes comprehensive error handling:
- API connection errors with user-friendly messages
- File upload validation and error reporting
- Graceful fallbacks when services are unavailable
- Loading states and progress indicators

## 🐳 Docker Configuration

### Dockerfile Features

- **Multi-stage build** for optimized image size
- **Non-root user** for security
- **Health checks** for monitoring
- **Proper caching** of Python dependencies
- **Streamlit configuration** built into the image

### Docker Compose Integration

The Streamlit service integrates seamlessly with the existing Docker Compose setup:
- **Service dependencies** ensuring proper startup order
- **Network connectivity** to backend services
- **Environment configuration** for different deployment stages
- **Volume mounts** for development hot-reload

## 🚀 Deployment

### Local Development
```bash
streamlit run app.py --server.port 8501 --server.address 0.0.0.0
```

### Production Deployment
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up streamlit-app
```

### Cloud Deployment

The app is ready for deployment on:
- **Streamlit Cloud** - Direct deployment from GitHub
- **Heroku** - Using the included Docker configuration
- **AWS/GCP/Azure** - Container-based deployment
- **DigitalOcean** - App Platform or Droplet deployment

## 📊 Features Comparison

| Feature | React App | Streamlit App | Notes |
|---------|-----------|---------------|--------|
| PDF Upload | ✅ | ✅ | Same functionality |
| Education Levels | ✅ | ✅ | Identical options |
| PDF Viewer | ✅ | ✅ | Browser-based iframe |
| Text Highlighting | ✅ | ✅ | Same color options |
| Chat Interface | ✅ | ✅ | Real-time messaging |
| Responsive Design | ✅ | ✅ | Mobile-friendly |
| Dark Mode | ✅ | 🔄 | In development |
| Animations | ✅ | ⚠️ | Limited in Streamlit |

## 🔮 Future Enhancements

- **Enhanced PDF Viewer**: Better text selection and annotation tools
- **Real-time Collaboration**: Share documents and highlights with others
- **Export Options**: PDF reports, Word documents, presentations
- **Advanced Analytics**: Reading patterns and comprehension metrics
- **Mobile App**: Native mobile application using Streamlit
- **Offline Mode**: Local processing capabilities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/streamlit-enhancement`
3. Make your changes in the `streamlit_app/` directory
4. Test thoroughly with the backend API
5. Submit a pull request

## 📝 License

This project is part of the Research Paper Helper suite and follows the same licensing terms as the main project.

## 🆘 Troubleshooting

### Common Issues

1. **API Connection Failed**:
   - Ensure the backend server is running on port 8000
   - Check the `API_BASE_URL` environment variable
   - Verify network connectivity between containers

2. **PDF Upload Fails**:
   - Check file size limits (max 100MB)
   - Ensure file is a valid PDF
   - Verify backend storage configuration

3. **Chat Not Working**:
   - Confirm AI service is running on port 5000
   - Check education level selection
   - Verify document is properly processed

4. **Highlights Not Saving**:
   - Ensure database is properly configured
   - Check API endpoints are responding
   - Verify document ID is correct

### Debug Mode

Enable debug mode by setting environment variables:
```bash
export DEBUG=true
export LOG_LEVEL=DEBUG
streamlit run app.py
```

## 📞 Support

For support and questions:
- Check the main project README
- Review the Docker documentation
- Test API endpoints directly
- Check browser developer console for errors

---

**Ready to deploy your Streamlit Research Paper Helper!** 🚀