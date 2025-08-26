import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, ArrowRight } from 'lucide-react';
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


  const educationLevels = Object.entries(EDUCATION_LEVEL_CONFIG);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative gradient-hero py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-secondary-900 dark:text-white mb-6">
              Upload, Analyze, Learn
            </h1>
            
            <p className="text-lg sm:text-xl text-secondary-600 dark:text-secondary-300 mb-8 max-w-2xl mx-auto">
              Upload any research paper to get AI-powered explanations at your education level. 
              Chat with your documents and get contextual insights adapted to your background.
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

          </motion.div>
        </div>
      </section>


      {/* Education Levels Section */}
      <section className="py-20 bg-secondary-50/50 dark:bg-secondary-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-secondary-900 dark:text-white mb-4">
              Choose Your Learning Level
            </h2>
            <p className="text-lg text-secondary-600 dark:text-secondary-300 max-w-2xl mx-auto">
              Get explanations tailored to your educational background, from general concepts to advanced research.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {educationLevels.map(([level, config], index) => (
              <motion.div
                key={level}
                className={`card transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-primary-500/10 hover:-translate-y-1 ${
                  selectedLevel === level ? 'ring-2 ring-primary-500 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20' : 'hover:bg-white/90 dark:hover:bg-secondary-700/50'
                }`}
                onClick={() => setSelectedLevel(level as EducationLevel)}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <div className="card-body">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                      {config.label}
                    </h3>
                    <div className={`w-3 h-3 rounded-full ${
                      selectedLevel === level ? 'bg-primary-500' : 'bg-secondary-300 dark:bg-secondary-600'
                    }`} />
                  </div>
                  <p className="text-secondary-600 dark:text-secondary-300 text-sm">
                    {config.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary-600 via-primary-700 to-purple-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute bottom-20 right-20 w-32 h-32 bg-purple-300/20 rounded-full blur-2xl"></div>
          <div className="absolute top-1/2 left-1/3 w-16 h-16 bg-blue-300/20 rounded-full blur-lg"></div>
        </div>
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-primary-100 mb-8">
              Upload your research paper and start getting intelligent explanations right away.
            </p>
            <button 
              onClick={() => document.getElementById('document-upload')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn bg-white text-primary-600 hover:bg-primary-50 focus-visible:ring-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
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