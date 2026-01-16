import React, { useRef, useState } from 'react';
import { UploadCloud, FileAudio, Layers, Link as LinkIcon, Youtube, Music, ArrowRight, CornerDownRight } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  onUrlImport: (url: string) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, onUrlImport, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');

  const handleDragOver = (e: React.DragEvent) => {
    if (mode !== 'file') return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (mode !== 'file') return;
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const audioFiles = Array.from(e.dataTransfer.files).filter((f: File) => f.type.startsWith('audio/'));
      if (audioFiles.length > 0) onFileSelect(audioFiles);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
        {/* Tabs - Tech Style */}
        <div className="flex mb-4">
            <button 
                onClick={() => setMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-mono uppercase tracking-widest border border-white/10 transition-colors ${mode === 'file' ? 'bg-white/5 text-white border-b-blue-500' : 'text-slate-500 hover:text-white'}`}
            >
                LOCAL_FILE
            </button>
            <button 
                onClick={() => setMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-mono uppercase tracking-widest border border-l-0 border-white/10 transition-colors ${mode === 'url' ? 'bg-white/5 text-white border-b-blue-500' : 'text-slate-500 hover:text-white'}`}
            >
                NETWORK_STREAM
            </button>
        </div>

        {mode === 'file' ? (
            <div
              onClick={isLoading ? undefined : () => fileInputRef.current?.click()}
              onDragOver={isLoading ? undefined : handleDragOver}
              onDragLeave={isLoading ? undefined : handleDragLeave}
              onDrop={isLoading ? undefined : handleDrop}
              className={`
                relative cursor-pointer 
                bg-black/20 border-2 border-dashed
                transition-all duration-200 ease-out
                flex flex-col items-center justify-center
                h-64
                ${isDragging 
                  ? 'border-blue-500 bg-blue-900/10' 
                  : 'border-white/10 hover:border-white/30 hover:bg-white/5'}
                ${isLoading ? 'opacity-50 cursor-wait pointer-events-none' : ''}
              `}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files && onFileSelect(Array.from(e.target.files))}
                accept="audio/*"
                multiple 
                className="hidden"
              />

              <div className={`p-4 mb-4 border border-white/5 bg-black/40 text-slate-400`}>
                {isLoading ? (
                  <div className="animate-spin w-8 h-8 border-2 border-slate-700 border-t-blue-500"></div>
                ) : (
                   <UploadCloud size={32} />
                )}
              </div>

              {isLoading && (
                 <>
                    <h3 className="text-sm font-bold text-white mb-1 tracking-widest uppercase font-mono animate-pulse">
                        PROCESSING_DATA...
                    </h3>
                    <p className="text-slate-500 text-[10px] font-mono uppercase">
                        CALCULATING_PHASE_OFFSET...
                    </p>
                 </>
              )}
              
              {/* Decor lines */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-blue-500/50 -translate-x-1 -translate-y-1"></div>
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-blue-500/50 translate-x-1 translate-y-1"></div>
            </div>
        ) : (
            <div className={`
                relative bg-black/20 border border-white/10
                flex flex-col items-center justify-center
                h-64 p-8
                ${isLoading ? 'opacity-50 pointer-events-none' : ''}
            `}>
                <form onSubmit={(e) => { e.preventDefault(); if(url.trim()) onUrlImport(url); }} className="w-full relative">
                    <div className="text-[10px] font-mono text-slate-500 mb-2 flex items-center gap-1 uppercase tracking-wider">
                        <CornerDownRight size={10} /> Enter Stream URL
                    </div>
                    <input 
                        type="text" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-black/50 border border-slate-700 py-3 pl-4 pr-12 text-xs font-mono text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-colors"
                        disabled={isLoading}
                    />
                    <button 
                        type="submit"
                        disabled={!url.trim() || isLoading}
                        className="absolute right-1 top-[25px] p-2 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white animate-spin" /> : <ArrowRight size={14} />}
                    </button>
                    <div className="mt-4 flex gap-4 justify-center text-slate-600">
                        <Youtube size={16} /> <Music size={16} /> <LinkIcon size={16} />
                    </div>
                </form>
            </div>
        )}
    </div>
  );
};

export default FileUpload;