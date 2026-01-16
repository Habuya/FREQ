
import React, { useRef, useState } from 'react';
import { UploadCloud, FileAudio, Layers, Link as LinkIcon, Youtube, Music, ArrowRight, Search } from 'lucide-react';

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

  const handleUrlSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (url.trim()) {
          onUrlImport(url);
      }
  };

  // Detect platform for styling
  const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
  const isSpotify = url.includes('spotify.com');

  return (
    <div className="w-full max-w-xl mx-auto">
        {/* Tabs */}
        <div className="flex p-1 bg-slate-800/50 rounded-xl mb-4 border border-slate-700/50 w-fit mx-auto backdrop-blur-sm">
            <button 
                onClick={() => setMode('file')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'file' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white'}`}
            >
                <UploadCloud size={16} /> Upload
            </button>
            <button 
                onClick={() => setMode('url')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'url' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white'}`}
            >
                <LinkIcon size={16} /> Link
            </button>
        </div>

        {mode === 'file' ? (
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
                multiple 
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
        ) : (
            <div className={`
                relative border-2 border-slate-700 rounded-2xl p-10 
                flex flex-col items-center justify-center
                h-64 bg-slate-800/20 backdrop-blur-sm
                ${isLoading ? 'opacity-50 pointer-events-none' : ''}
            `}>
                <div className={`
                    w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-colors duration-300
                    ${isYoutube ? 'bg-red-600/20 text-red-500' : isSpotify ? 'bg-green-500/20 text-green-500' : 'bg-slate-700 text-slate-400'}
                `}>
                    {isYoutube ? <Youtube size={32} /> : isSpotify ? <Music size={32} /> : <LinkIcon size={32} />}
                </div>

                <form onSubmit={handleUrlSubmit} className="w-full max-w-sm relative">
                    <input 
                        type="text" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="Paste YouTube or Spotify link..."
                        className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        disabled={isLoading}
                    />
                    <button 
                        type="submit"
                        disabled={!url.trim() || isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight size={16} />}
                    </button>
                </form>
                
                <div className="mt-4 flex gap-4 text-[10px] text-slate-500 font-mono uppercase tracking-wide">
                    <span className={`flex items-center gap-1 transition-colors ${isYoutube ? 'text-red-400' : ''}`}>
                        <Youtube size={12} /> YouTube
                    </span>
                    <span className={`flex items-center gap-1 transition-colors ${isSpotify ? 'text-green-400' : ''}`}>
                        <Music size={12} /> Spotify
                    </span>
                </div>
            </div>
        )}
    </div>
  );
};

export default FileUpload;
