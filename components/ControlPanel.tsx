

import React, { useState } from 'react';
import { Play, Pause, Music, Download, Loader2, ChevronDown, Check, Split, Layers, Sparkles } from 'lucide-react';
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
  onToggleCompare?: (active: boolean) => void;
  batchCount?: number;
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
  isComparing = false,
  onToggleCompare,
  batchCount = 0
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // THD Color Logic
  const getTHDColor = (val: number) => {
     if (val < 1.0) return 'text-emerald-400'; // Clean
     if (val < 5.0) return 'text-amber-400';   // Warm
     return 'text-rose-500';                   // Driven
  };

  const getTHDBarColor = (val: number) => {
    if (val < 1.0) return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
    if (val < 5.0) return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]';
    return 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.7)]';
  };

  // Numerology: Recursive Digital Root
  const getDigitalRoot = (n: number) => {
    const root = (n - 1) % 9 + 1;
    return root;
  };

  const digitalRoot = getDigitalRoot(Math.round(targetFrequency));
  const isTeslaAligned = [3, 6, 9].includes(digitalRoot);

  return (
    <div className="mt-8 bg-slate-800/50 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl">
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* File Info */}
        <div className="flex items-center gap-3 w-full md:w-auto overflow-hidden">
          <div className="w-12 h-12 flex-shrink-0 rounded-full bg-slate-700 flex items-center justify-center text-indigo-400 relative">
            <Music size={24} />
            {batchCount > 1 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold border-2 border-slate-800">
                    {batchCount}
                </div>
            )}
          </div>
          <div className="overflow-hidden min-w-0">
            <h3 className="text-slate-200 font-semibold truncate max-w-[150px] md:max-w-[200px]">
              {fileName || "No Audio Loaded"}
            </h3>
            <p className="text-slate-400 text-xs uppercase tracking-wider flex items-center gap-1">
              {batchCount > 1 ? (
                  <><Layers size={10} /> Batch Ready ({batchCount} tracks)</>
              ) : (
                  fileName ? "Ready to Zen" : "Waiting for Upload"
              )}
            </p>
          </div>
        </div>

        {/* Playback Control */}
        <div className="flex items-center gap-6">
           {/* A/B Compare Toggle - Seamless */}
           {onToggleCompare && fileName && (
              <button
                onMouseDown={() => onToggleCompare(true)}
                onMouseUp={() => onToggleCompare(false)}
                onMouseLeave={() => onToggleCompare(false)}
                onTouchStart={() => onToggleCompare(true)}
                onTouchEnd={() => onToggleCompare(false)}
                className={`
                   w-10 h-10 rounded-full flex items-center justify-center transition-all border
                   ${isComparing 
                     ? 'bg-amber-500 border-amber-400 text-white scale-95 shadow-[0_0_15px_rgba(245,158,11,0.5)]' 
                     : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500'}
                `}
                title="Hold to Compare (Bypass)"
              >
                 <Split size={18} />
              </button>
           )}

          <button
            onClick={onPlayPause}
            disabled={!fileName}
            className={`
              flex items-center justify-center w-16 h-16 rounded-full 
              bg-gradient-to-r from-indigo-500 to-purple-600 
              hover:from-indigo-400 hover:to-purple-500
              transition-all shadow-lg hover:shadow-indigo-500/30 active:scale-95
              disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
            `}
          >
            {isPlaying ? (
              <Pause fill="white" className="text-white" size={32} />
            ) : (
              <Play fill="white" className="ml-1 text-white" size={32} />
            )}
          </button>
        </div>

        {/* Right Actions - Multi-Target Selector */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto z-20">
          
          <div className="flex flex-col items-center gap-1 w-full sm:w-auto">
            <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">TARGET FREQUENCY</span>
            
            <div className="relative w-full sm:w-48">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`
                  w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium transition-all
                  ${targetFrequency !== 440 
                    ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/50' 
                    : 'bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-800'}
                `}
              >
                <span className="truncate mr-2">
                   {/* Reverse Lookup Label or Frequency */}
                   {Object.entries(TUNING_LABELS).find(([k, v]) => Number(k) === targetFrequency)?.[1] || `${targetFrequency} Hz`}
                </span>
                <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="py-1">
                      {(Object.keys(TUNING_LABELS) as unknown as TuningPreset[]).map((presetKey) => {
                        const freq = Number(presetKey);
                        if (isNaN(freq)) return null; // Safety check
                        const label = TUNING_LABELS[freq as TuningPreset];
                        const isActive = targetFrequency === freq;
                        
                        return (
                          <button
                            key={freq}
                            onClick={() => {
                              onTuningChange(freq);
                              setIsDropdownOpen(false);
                            }}
                            className={`
                              w-full text-left px-4 py-3 text-xs sm:text-sm flex items-center justify-between
                              hover:bg-slate-700 transition-colors
                              ${isActive ? 'bg-slate-700/50 text-emerald-400' : 'text-slate-300'}
                            `}
                          >
                            <span>{label}</span>
                            {isActive && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Numerology Badge */}
            {isTeslaAligned && (
                <div className="absolute top-full mt-1 flex items-center gap-1 text-[9px] font-mono text-cyan-400 bg-cyan-900/20 px-1.5 py-0.5 rounded border border-cyan-500/30 animate-pulse">
                    <Sparkles size={8} /> 3-6-9 ALIGNMENT ({digitalRoot})
                </div>
            )}
          </div>

          {/* Download Button */}
          <button
            onClick={onDownload}
            disabled={isDownloading || !fileName}
            title={batchCount > 1 ? "Download Batch ZIP" : "Download processed High-Quality WAV"}
            className={`
              mt-auto w-full sm:w-auto h-[42px] px-4 rounded-xl border border-slate-600 
              flex items-center justify-center gap-2 text-slate-300 hover:text-white hover:bg-slate-700
              transition-all disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isDownloading ? (
              <Loader2 size={18} className="animate-spin text-indigo-400" />
            ) : (
              <Download size={18} />
            )}
            <span className="text-sm font-medium hidden lg:inline">
                {batchCount > 1 ? `Export All (${batchCount})` : "Export"}
            </span>
          </button>
        </div>

      </div>
      
      {/* THD / Saturation Visualization (Only when playing or active) */}
      {isPlaying && (
         <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
             <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase flex items-center gap-2">
                Harmonic Coloration
                <span className={`font-bold transition-colors ${getTHDColor(thdValue)}`}>
                    {thdValue.toFixed(2)}%
                </span>
             </span>
             
             <div className="w-1/2 md:w-64 h-1.5 bg-slate-700 rounded-full overflow-hidden relative">
                 {/* Background tick marks */}
                 <div className="absolute inset-0 flex justify-between px-1">
                     {[...Array(5)].map((_, i) => <div key={i} className="w-px h-full bg-slate-900/50" />)}
                 </div>
                 <div 
                    className={`h-full rounded-full transition-all duration-300 ease-out ${getTHDBarColor(thdValue)}`}
                    style={{ width: `${Math.min(100, thdValue * 15)}%` }} // Scaling factor for visual
                 />
             </div>
         </div>
      )}
    </div>
  );
};

export default ControlPanel;
