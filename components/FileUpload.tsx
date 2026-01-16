import React, { useRef, useState } from 'react';
import { UploadCloud, FileAudio, Layers } from 'lucide-react';

interface FileUploadProps {
  // Update: Akzeptiert nun ein Array von Dateien
  onFileSelect: (files: File[]) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Filter auf Audio-Dateien
      const audioFiles = Array.from(e.dataTransfer.files).filter((f: File) => f.type.startsWith('audio/'));
      if (audioFiles.length > 0) {
        onFileSelect(audioFiles);
      }
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(Array.from(e.target.files));
    }
  };

  return (
    <div
      onClick={isLoading ? undefined : handleClick}
      onDragOver={isLoading ? undefined : handleDragOver}
      onDragLeave={isLoading ? undefined : handleDragLeave}
      onDrop={isLoading ? undefined : handleDrop}
      className={`
        relative group cursor-pointer 
        border-2 border-dashed rounded-2xl p-10 
        transition-all duration-300 ease-in-out
        flex flex-col items-center justify-center
        h-64 bg-slate-800/20 backdrop-blur-sm
        ${isDragging 
          ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
          : 'border-slate-600 hover:border-indigo-400 hover:bg-slate-800/40'}
        ${isLoading ? 'opacity-50 cursor-wait pointer-events-none' : ''}
      `}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        accept="audio/*"
        multiple // WICHTIG: Erlaubt Mehrfachauswahl
        className="hidden"
      />

      <div className={`
        w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-transform duration-300
        ${isDragging ? 'scale-110 bg-indigo-500' : 'bg-slate-700 group-hover:bg-slate-600'}
      `}>
        {isLoading ? (
          <div className="animate-spin w-8 h-8 border-4 border-slate-300 border-t-indigo-500 rounded-full"></div>
        ) : (
          <div className="relative">
             <UploadCloud 
              size={40} 
              className={`text-slate-300 ${isDragging ? 'text-white' : ''}`} 
            />
            {/* Visual Hint for Batch Support */}
            <Layers size={16} className="absolute -bottom-1 -right-2 text-indigo-400 bg-slate-800 rounded-full p-0.5" />
          </div>
        )}
      </div>

      <h3 className="text-xl font-semibold text-slate-200 mb-2">
        {isLoading ? 'Processing Audio...' : 'Upload Tracks'}
      </h3>
      
      <p className="text-slate-400 text-sm text-center max-w-xs">
        {isLoading 
          ? 'Analyzing harmonic content...' 
          : 'Drag & drop single tracks or entire albums (Batch Mode)'}
      </p>

      {!isLoading && (
        <div className="absolute bottom-4 flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-indigo-400 font-mono">
          <span className="flex items-center gap-1"><Layers size={12}/> BATCH PROCESSING READY</span>
        </div>
      )}
    </div>
  );
};

export default FileUpload;