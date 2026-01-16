import React, { useState } from 'react';
import { Play, Pause, Music, Download, Loader2, ChevronDown, Check, Layers, Sliders } from 'lucide-react';
import { TuningPreset, TUNING_LABELS } from '../types';

interface ControlPanelProps {
  isPlaying: boolean;
  targetFrequency: number;
  onPlayPause: () => void;
  onTuningChange: (freq: number) => void;
  onDownload: () => void;
  isDownloading: boolean;
  fileName: string | null;
  thdValue?: number;
  isComparing?: boolean;
  crossfadeValue?: number;
  onCrossfadeChange?: (val: number) => void;
  batchCount?: number;
  activePresetName?: string;
  spectralBalanceScore?: number;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  isPlaying, 
  targetFrequency, 
  onPlayPause, 
  onTuningChange,
  onDownload,
  isDownloading,
  fileName,
  thdValue = 0,
  crossfadeValue = 1.0,
  onCrossfadeChange,
  batchCount = 0,
  activePresetName,
  spectralBalanceScore = 100
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const getTHDColor = (val: number) => val < 1.0 ? 'text-blue-400' : val < 5.0 ? 'text-amber-400' : 'text-rose-500';
  const getTHDBarColor = (val: number) => val < 1.0 ? 'bg-blue-500' : val < 5.0 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    // Pi 23 Tech Panel
    <div className="mt-6 tech-panel p-6 backdrop-blur-xl bg-black/40 relative z-50">
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        
        {/* File Info */}
        <div className="flex flex-col gap-2 w-full md:w-auto">
            <div className="flex items-center gap-4 overflow-hidden border-l-2 border-blue-500/50 pl-4">
              <div className="w-10 h-10 flex-shrink-0 bg-blue-900/20 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                <Music size={20} />
              </div>
              <div className="overflow-hidden min-w-0">
                <h3 className="text-white font-mono text-sm truncate max-w-[200px] tracking-tight">
                  {fileName || "NO_SIGNAL"}
                </h3>
                <p className="text-slate-500 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2">
                  {batchCount > 1 ? (
                      <><Layers size={10} /> BATCH_QUEUE [{batchCount}]</>
                  ) : (
                      fileName ? "AUDIO_BUFFER_READY" : "WAITING_FOR_UPLOAD"
                  )}
                </p>
              </div>
            </div>
            
            {/* Active Preset Badge */}
            {activePresetName && (
                <div className="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 self-start ml-4">
                   <div className="w-1 h-1 bg-blue-500 animate-pulse" />
                   <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wide">
                      CFG: <span className="text-white">{activePresetName}</span>
                   </span>
                </div>
            )}
        </div>

        {/* Playback & Crossfader Section */}
        <div className="flex items-center gap-8">
           
           {/* Technical Crossfader (Square Slider Style) */}
           {onCrossfadeChange && fileName && (
             <div className="flex items-center gap-4">
               <span className={`text-[9px] font-mono uppercase tracking-wider transition-colors ${crossfadeValue < 0.5 ? 'text-white' : 'text-slate-600'}`}>
                 RAW [440]
               </span>
               
               <div className="relative w-40 h-8 flex items-center group">
                  {/* Track Line - Sharp */}
                  <div className="absolute w-full h-[2px] bg-slate-800 border-t border-black/50 border-b border-white/10"></div>
                  
                  {/* Ticks */}
                  <div className="absolute left-0 w-px h-2 bg-slate-700 top-3"></div>
                  <div className="absolute left-1/4 w-px h-1 bg-slate-800 top-3.5"></div>
                  <div className="absolute left-1/2 w-px h-3 bg-slate-600 top-2.5"></div>
                  <div className="absolute left-3/4 w-px h-1 bg-slate-800 top-3.5"></div>
                  <div className="absolute right-0 w-px h-2 bg-slate-700 top-3"></div>

                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={crossfadeValue}
                    onChange={(e) => onCrossfadeChange(parseFloat(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer z-20"
                  />

                  {/* Fader Cap - Technical Block */}
                  <div 
                    className="absolute h-6 w-4 bg-[#1e293b] border border-slate-500 z-10 pointer-events-none transition-transform duration-75 ease-out shadow-[0_2px_5px_rgba(0,0,0,0.5)] flex flex-col justify-center items-center gap-[1px]"
                    style={{ 
                        left: `${crossfadeValue * 100}%`, 
                        transform: 'translateX(-50%)',
                        boxShadow: crossfadeValue > 0.5 ? '0 0 10px rgba(59,130,246,0.4)' : 'none',
                        borderColor: crossfadeValue > 0.5 ? '#3b82f6' : '#64748b'
                    }}
                  >
                      {/* Grip Lines */}
                      <div className="w-2 h-px bg-slate-600"></div>
                      <div className="w-2 h-px bg-slate-600"></div>
                      <div className="w-2 h-px bg-slate-600"></div>
                      
                      {/* Indicator Line */}
                      <div className={`absolute -top-1 w-0.5 h-1 ${crossfadeValue > 0.5 ? 'bg-blue-500' : 'bg-slate-500'}`}></div>
                  </div>
               </div>

               <span className={`text-[9px] font-mono uppercase tracking-wider transition-colors ${crossfadeValue > 0.5 ? 'text-blue-400' : 'text-slate-600'}`}>
                 ZEN [{Math.round(targetFrequency)}]
               </span>
             </div>
           )}

          <button
            onClick={(e) => {
                e.stopPropagation();
                onPlayPause();
            }}
            disabled={!fileName}
            className={`
              flex items-center justify-center w-16 h-16 border tech-interact transition-all cursor-pointer relative z-50
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isPlaying 
                 ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)]' 
                 : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30 hover:bg-white/10 hover:text-white'}
            `}
          >
            {isPlaying ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" />
            )}
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto z-20">
          
          <div className="flex flex-col items-start gap-1 w-full sm:w-auto">
            <span className="text-[9px] text-slate-600 font-mono tracking-[0.2em] uppercase">TARGET_FREQ</span>
            
            <div className="relative w-full sm:w-48">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`
                  w-full flex items-center justify-between px-3 py-2 border text-xs font-mono uppercase tracking-wider transition-all tech-interact
                  ${targetFrequency !== 440 
                    ? 'bg-blue-900/20 border-blue-500/50 text-blue-300' 
                    : 'bg-white/5 border-white/10 text-slate-300'}
                `}
              >
                <span className="truncate mr-2">
                   {Object.entries(TUNING_LABELS).find(([k, v]) => Number(k) === targetFrequency)?.[1] || `${targetFrequency} HZ`}
                </span>
                <ChevronDown size={12} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Technical Dropdown */}
              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)}/>
                  <div className="absolute top-full right-0 mt-1 w-64 bg-[#0a0f1e] border border-blue-500/30 z-20 shadow-2xl animate-in fade-in slide-in-from-top-2">
                    {Object.keys(TUNING_LABELS).map((presetKey) => {
                        const freq = Number(presetKey);
                        if (isNaN(freq)) return null;
                        const isActive = targetFrequency === freq;
                        
                        return (
                          <button
                            key={freq}
                            onClick={() => {
                              onTuningChange(freq);
                              setIsDropdownOpen(false);
                            }}
                            className={`
                              w-full text-left px-4 py-2 text-[10px] font-mono uppercase tracking-widest flex items-center justify-between
                              transition-colors border-b border-white/5 last:border-0
                              ${isActive ? 'bg-blue-900/20 text-blue-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}
                            `}
                          >
                            <span>{TUNING_LABELS[freq as TuningPreset]}</span>
                            {isActive && <Check size={12} className="text-blue-400" />}
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            onClick={onDownload}
            disabled={isDownloading || !fileName}
            className={`
              mt-auto w-full sm:w-auto h-[38px] px-6 border 
              flex items-center justify-center gap-2 text-slate-200 tech-interact
              bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isDownloading ? (
              <Loader2 size={14} className="animate-spin text-blue-400" />
            ) : (
              <Download size={14} />
            )}
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
                {batchCount > 1 ? "EXPORT_BATCH" : "EXPORT_WAV"}
            </span>
          </button>
        </div>

      </div>
      
      {/* Meters */}
      {isPlaying && (
         <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-1">
             
             {/* THD Meter */}
             <div className="flex flex-col gap-1">
                 <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono uppercase tracking-widest">
                    <span>Harmonic Distortion</span>
                    <span className={`${getTHDColor(thdValue)}`}>{thdValue.toFixed(2)}%</span>
                 </div>
                 <div className="w-full h-1 bg-slate-900 overflow-hidden relative">
                     <div 
                        className={`h-full transition-all duration-300 ease-out ${getTHDBarColor(thdValue)}`}
                        style={{ width: `${Math.min(100, thdValue * 15)}%` }} 
                     />
                 </div>
             </div>

             {/* Spectral Balance Meter */}
             <div className="flex flex-col gap-1">
                 <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono uppercase tracking-widest">
                    <span>Spectral Balance</span>
                    <span className="text-white">{spectralBalanceScore.toFixed(0)}% MATCH</span>
                 </div>
                 <div className="w-full h-1 bg-slate-900 overflow-hidden relative">
                     <div 
                        className="h-full bg-slate-400 transition-all duration-700 ease-in-out"
                        style={{ 
                            width: `${spectralBalanceScore}%`,
                            opacity: spectralBalanceScore / 100
                        }} 
                     />
                 </div>
             </div>

         </div>
      )}
    </div>
  );
};

export default ControlPanel;