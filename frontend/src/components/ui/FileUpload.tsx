import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: Record<string, string[]>;
  isUploading?: boolean;
  progress?: number;
  helperText?: string;
}

export function FileUpload({ onFileSelect, accept = { 'application/pdf': ['.pdf'] }, isUploading, progress = 0, helperText = 'Supports PDF documents up to 10MB' }: FileUploadProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    accept,
    disabled: isUploading,
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
        isDragActive ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary',
        isUploading && 'opacity-50 pointer-events-none'
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary">
          <UploadCloud className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-on-surface">
            {isDragActive ? 'Drop PDF file here' : 'Drag & drop a client LPO PDF file here, or click to select'}
          </p>
          <p className="text-xs text-on-surface-variant mt-1 font-semibold">
            {helperText}
          </p>
        </div>
      </div>

      {isUploading && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-surface-container overflow-hidden rounded-b-xl">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
