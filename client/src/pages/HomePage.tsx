import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Brain, Zap, Users, BookOpen, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { EducationLevel } from '@/types';

// Education level configuration
const EDUCATION_LEVEL_CONFIG = {
  [EducationLevel.NO_TECHNICAL]: {
    label: 'General Reader',
    description: 'No technical background'
  },
  [EducationLevel.HIGH_SCHOOL]: {
    label: 'High School',
    description: 'High school level'
  },
  [EducationLevel.UNDERGRADUATE]: {
    label: 'Undergraduate',
    description: 'Bachelor\'s degree level'
  },
  [EducationLevel.MASTERS]: {
    label: 'Graduate',
    description: 'Master\'s degree level'
  },
  [EducationLevel.PHD]: {
    label: 'PhD/Research',
    description: 'Doctoral level'
  }
};
import DocumentUpload from '@/components/DocumentUpload';
import EducationLevelSelector from '@/components/EducationLevelSelector';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>(EducationLevel.UNDERGRADUATE);

  const handleDocumentUpload = async (documentId: string) => {
    toast.success('Document uploaded successfully!');
    // Navigate to document viewer with selected education level
    navigate(`/document/${documentId}?level=${selectedLevel}`);
  };

  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Explanations',
      description: 'Get contextual explanations adapted to your education level for any highlighted text.'
    },
    {
      icon: Zap,
      title: 'Local Embeddings',
      description: 'Fast, cost-effective processing using local sentence transformers for document analysis.'
    },
    {
      icon: Users,
      title: 'Education Level Adaptation',
      description: 'Explanations tailored from high school to PhD level, ensuring optimal comprehension.'
    },
    {
      icon: BookOpen,
      title: 'Interactive Chat',
      description: 'Have natural conversations about research papers with proper citations and follow-ups.'
    }
  ];

  const educationLevels = Object.entries(EDUCATION_LEVEL_CONFIG);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary-50 to-secondary-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-secondary-900 mb-6">
              Transform{' '}
              <span className="text-primary-600">Research Papers</span>
              <br />
              into Interactive Learning
            </h1>
            
            <p className="text-lg sm:text-xl text-secondary-600 mb-8 max-w-2xl mx-auto">
              Upload any research paper and get AI-powered explanations, contextual chat, 
              and insights adapted to your educational background.
            </p>

            {/* Education Level Selector */}
            <motion.div
              className="mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <EducationLevelSelector
                value={selectedLevel}
                onChange={setSelectedLevel}
                className="max-w-md mx-auto"
              />
            </motion.div>

            {/* Upload Component */}
            <motion.div
              className="max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <DocumentUpload
                educationLevel={selectedLevel}
                onUploadSuccess={handleDocumentUpload}
                className="mb-8"
              />
            </motion.div>

            {/* Demo Link */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <button className="btn btn-outline btn-sm">
                <FileText className="w-4 h-4 mr-2" />
                Try with Sample Paper
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-secondary-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-secondary-600 max-w-2xl mx-auto">
              Advanced AI technology meets intuitive design to make research papers accessible to everyone.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <feature.icon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold text-secondary-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-secondary-600">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Education Levels Section */}
      <section className="py-20 bg-secondary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-secondary-900 mb-4">
              Explanations for Every Level
            </h2>
            <p className="text-lg text-secondary-600 max-w-2xl mx-auto">
              Our AI adapts its explanations to match your educational background and learning preferences.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {educationLevels.map(([level, config], index) => (
              <motion.div
                key={level}
                className={`card transition-all duration-200 cursor-pointer hover:shadow-popup ${
                  selectedLevel === level ? 'ring-2 ring-primary-500 bg-primary-50' : 'hover:bg-secondary-50'
                }`}
                onClick={() => setSelectedLevel(level as EducationLevel)}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <div className="card-body">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-secondary-900">
                      {config.label}
                    </h3>
                    <div className={`w-3 h-3 rounded-full ${
                      selectedLevel === level ? 'bg-primary-500' : 'bg-secondary-300'
                    }`} />
                  </div>
                  <p className="text-secondary-600 text-sm">
                    {config.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              Ready to Start Learning?
            </h2>
            <p className="text-xl text-primary-100 mb-8">
              Upload your first research paper and experience the future of academic reading.
            </p>
            <button 
              onClick={() => document.getElementById('document-upload')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn bg-white text-primary-600 hover:bg-primary-50 focus-visible:ring-white"
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload Document
            </button>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;