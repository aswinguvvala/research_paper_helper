import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

import { EducationLevel, ProcessingStatus } from '@/types';

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

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus(ProcessingStatus.PROCESSING);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);
      formData.append('preserveStructure', 'true');
      formData.append('extractMetadata', 'true');
      formData.append('generateEmbeddings', 'true');

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 5, 95));
      }, 300);

      console.log('Starting upload request...', {
        url: '/api/documents/upload',
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type
      });

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);

      console.log('Upload response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorData = await response.json().catch((parseError) => {
          console.error('Failed to parse error response:', parseError);
          return {};
        });
        
        console.error('Upload failed with error data:', errorData);
        
        let errorMessage = 'Upload failed. Please try again.';
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
          if (errorData.error?.details) {
            errorMessage += ` (${errorData.error.details})`;
          }
        } else if (response.status === 413) {
          errorMessage = 'File too large. Maximum size is 50MB.';
        } else if (response.status === 415) {
          errorMessage = 'Unsupported file type. Only PDF files are allowed.';
        } else if (response.status === 0 || !response.status) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = `Upload failed with status ${response.status}: ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      setUploadProgress(100);
      setUploadStatus(ProcessingStatus.COMPLETED);
      
      toast.success('Document uploaded successfully!');
      
      setTimeout(() => {
        onUploadSuccess(result.document.id);
      }, 500);
      
    } catch (error) {
      setUploadStatus(ProcessingStatus.FAILED);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed. Please try again.';
      
      console.error('Upload error details:', {
        error: error,
        message: errorMessage,
        fileName: selectedFile?.name,
        fileSize: selectedFile?.size,
        fileType: selectedFile?.type,
        timestamp: new Date().toISOString()
      });
      
      toast.error(errorMessage);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      validateFileUpload(file);
      setSelectedFile(file);
      setUploadStatus(null);
    } catch (error: any) {
      toast.error(error.message || 'Invalid file. Please upload a PDF.');
    }
  }, []);

  const removeFile = () => {
    setSelectedFile(null);
    setUploadStatus(null);
    setUploadProgress(0);
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize,
    multiple: false,
    disabled: uploadStatus === ProcessingStatus.PROCESSING
  });

  return (
    <div className={clsx('w-full', className)} id="document-upload">
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={clsx(
            'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
            'bg-white/90 backdrop-blur-sm dark:bg-secondary-800/90',
            isDragActive ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/30' : 'border-secondary-300 hover:border-secondary-400 dark:border-secondary-600 dark:hover:border-secondary-500'
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center space-y-4">
            <Upload className="w-8 h-8 text-secondary-400 dark:text-secondary-300" />
            <div>
              <p className="text-lg font-medium text-secondary-900 dark:text-white">
                Drop a PDF here, or click to select
              </p>
              <p className="text-sm text-secondary-600 dark:text-secondary-300 mt-2">
                Maximum file size: 50MB
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-secondary-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-secondary-900">{selectedFile.name}</p>
                <p className="text-xs text-secondary-600">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
            </div>
            <button onClick={removeFile} className="text-secondary-500 hover:text-secondary-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {uploadStatus === ProcessingStatus.PROCESSING && (
            <div className="mt-4">
              <div className="bg-secondary-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-secondary-600 mt-1 text-center">{uploadProgress}% complete</p>
            </div>
          )}

          {uploadStatus === ProcessingStatus.FAILED && (
            <div className="mt-4 text-center">
                <p className="text-sm text-error-600">Upload failed. Please try again.</p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button 
              onClick={handleUpload} 
              disabled={uploadStatus === ProcessingStatus.PROCESSING}
              className="btn btn-primary"
            >
              {uploadStatus === ProcessingStatus.PROCESSING ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
              ) : 'Upload & Analyze'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default DocumentUpload;