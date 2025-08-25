import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

import { EducationLevel, ProcessingStatus } from '@/types';
// Simplified file validation
const validateFileUpload = (file: File) => {
  if (!file) throw new Error('No file provided');
  if (file.type !== 'application/pdf') throw new Error('Only PDF files are allowed');
  if (file.size > 50 * 1024 * 1024) throw new Error('File size must be less than 50MB');
};

interface DocumentUploadProps {
  educationLevel: EducationLevel;
  onUploadSuccess: (documentId: string) => void;
  className?: string;
  maxSize?: number;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({
  educationLevel,
  onUploadSuccess,
  className,
  maxSize = 50 * 1024 * 1024 // 50MB
}) => {
  const [uploadStatus, setUploadStatus] = useState<ProcessingStatus | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Real API upload function
  const uploadDocument = async (file: File) => {
    setUploadStatus(ProcessingStatus.PROCESSING);
    setUploadProgress(0);

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('document', file);
      formData.append('preserveStructure', 'true');
      formData.append('extractMetadata', 'true');
      formData.append('generateEmbeddings', 'true');

      // Start progress simulation
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 5, 80));
      }, 300);

      // Make actual API call
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      setUploadProgress(100);
      setUploadStatus(ProcessingStatus.COMPLETED);
      
      toast.success('Document uploaded successfully!');
      
      // Call success callback with real document ID
      setTimeout(() => {
        onUploadSuccess(result.document.id);
      }, 500);
      
    } catch (error) {
      setUploadStatus(ProcessingStatus.FAILED);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed. Please try again.';
      toast.error(errorMessage);
      console.error('Upload error:', error);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      validateFileUpload(file);
      setSelectedFile(file);
      await uploadDocument(file);
    } catch (error: any) {
      toast.error(error.message || 'Invalid file. Please upload a PDF.');
    }
  }, [educationLevel]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject
  } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize,
    multiple: false,
    disabled: uploadStatus === ProcessingStatus.PROCESSING
  });

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadStatus(null);
    setUploadProgress(0);
  };

  const getStatusIcon = () => {
    switch (uploadStatus) {
      case ProcessingStatus.PROCESSING:
        return <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />;
      case ProcessingStatus.COMPLETED:
        return <CheckCircle className="w-8 h-8 text-success-600" />;
      case ProcessingStatus.FAILED:
        return <AlertCircle className="w-8 h-8 text-error-600" />;
      default:
        return isDragReject ? 
          <AlertCircle className="w-8 h-8 text-error-500" /> :
          <Upload className="w-8 h-8 text-secondary-400" />;
    }
  };

  const getStatusText = () => {
    if (uploadStatus === ProcessingStatus.PROCESSING && selectedFile) {
      return `Processing ${selectedFile.name}...`;
    }
    if (uploadStatus === ProcessingStatus.COMPLETED && selectedFile) {
      return `${selectedFile.name} processed successfully!`;
    }
    if (uploadStatus === ProcessingStatus.FAILED) {
      return 'Upload failed. Click to try again.';
    }
    if (isDragActive) {
      return isDragReject ? 
        'File type not supported' : 
        'Drop your PDF here...';
    }
    return 'Drop a PDF here, or click to select';
  };

  const getBorderColor = () => {
    if (uploadStatus === ProcessingStatus.FAILED || isDragReject) {
      return 'border-error-300 hover:border-error-400';
    }
    if (uploadStatus === ProcessingStatus.COMPLETED) {
      return 'border-success-300';
    }
    if (isDragActive && !isDragReject) {
      return 'border-primary-400 bg-primary-50';
    }
    return 'border-secondary-300 hover:border-secondary-400';
  };

  return (
    <div className={clsx('w-full', className)} id="document-upload">
      <motion.div
        {...getRootProps()}
        className={clsx(
          'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          getBorderColor(),
          uploadStatus === ProcessingStatus.PROCESSING && 'pointer-events-none opacity-75'
        )}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center space-y-4">
          {/* Status Icon */}
          <div className="flex items-center justify-center">
            {getStatusIcon()}
          </div>

          {/* Status Text */}
          <div>
            <p className="text-lg font-medium text-secondary-900">
              {getStatusText()}
            </p>
            
            {!uploadStatus && (
              <p className="text-sm text-secondary-600 mt-2">
                Maximum file size: 50MB • Supported format: PDF
              </p>
            )}
          </div>

          {/* Progress Bar */}
          {uploadStatus === ProcessingStatus.PROCESSING && (
            <div className="w-full max-w-xs">
              <div className="bg-secondary-200 rounded-full h-2">
                <motion.div
                  className="bg-primary-600 h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-secondary-600 mt-1">
                {uploadProgress}% complete
              </p>
            </div>
          )}

          {/* File Info */}
          {selectedFile && uploadStatus !== ProcessingStatus.PROCESSING && (
            <div className="flex items-center space-x-3 bg-secondary-50 rounded-lg px-4 py-2">
              <FileText className="w-5 h-5 text-secondary-600" />
              <div className="text-left">
                <p className="text-sm font-medium text-secondary-900">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-secondary-600">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          {uploadStatus === ProcessingStatus.FAILED && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetUpload();
              }}
              className="btn btn-primary btn-sm"
            >
              Try Again
            </button>
          )}
        </div>
      </motion.div>

      {/* Tips */}
      {!uploadStatus && (
        <div className="mt-4 text-sm text-secondary-600">
          <p className="font-medium mb-2">Tips for best results:</p>
          <ul className="space-y-1 text-xs">
            <li>• Upload research papers, academic articles, or technical documents</li>
            <li>• Ensure text is selectable (not scanned images)</li>
            <li>• Papers with clear section headers work best</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;