
import React from 'react';
import { X, RotateCcw, Activity, Mic2, Cpu, Sliders, MoveHorizontal, Pyramid } from 'lucide-react';
import { AudioSettings, SaturationType } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AudioSettings;
  onUpdate: (newSettings: AudioSettings) => void;
  detectedBass?: number;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdate, detectedBass = 0 }) => {
  if (!isOpen) return null;

  const handleReset = () => {
    onUpdate({
      fftSize: 8192,
      smoothingTimeConstant: 0.8,
      saturationType: 'tube',
      bypassBody: false,
      bypassResonance: false,
      bypassAir: false,
      stereoWidth: 1.0,
      sacredGeometryMode: false
    });
  };

  const Toggle = ({ label, checked, onChange, icon }: { label: React.ReactNode, checked: boolean, onChange: (v: boolean) => void, icon?: React.ReactNode }) => (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
        {icon}
        {label}
      </span>
      <div className="relative">
        <input 
          type="checkbox" 
          checked={checked} 
          onChange={(e) => onChange(e.target.checked)} 
          className="sr-only peer" 
        />
        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
      </div>
    </label>
  );

  const PHI = 1.61803398875;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu size={18} className="text-indigo-400" />
            DSP Configuration
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-8">
          
          {/* Section 1: ZenSpace M/S Control (Prioritized) */}
          <div className="space-y-4">
             <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <MoveHorizontal size={12} /> ZenSpace Imaging
            </h3>
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Stereo Width (M/S)</span>
                    <span className="text-indigo-400 font-mono">{(settings.stereoWidth * 100).toFixed(0)}%</span>
                </div>
                <input 
                    type="range"
                    min="0"
                    max="2.0"
                    step="0.1"
                    value={settings.stereoWidth}
                    onChange={(e) => onUpdate({ ...settings, stereoWidth: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                 <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                    <span>Mono (0%)</span>
                    <span>Normal (100%)</span>
                    <span>Wide (200%)</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mt-2">
                  Expands the side channel (L-R) for a wider soundstage without affecting the mono bass foundation. "Air" EQ is applied exclusively to the expanded space.
                </p>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* Section 2: Audio Processing */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Mic2 size={12} /> Harmonic Processing
            </h3>

            <div className="space-y-3">
              <label className="text-sm text-slate-300 block">Saturation Model</label>
              <div className="grid grid-cols-3 gap-2">
                {(['tube', 'tape', 'clean'] as SaturationType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => onUpdate({ ...settings, saturationType: type })}
                    className={`
                      py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-all
                      ${settings.saturationType === type 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}
                    `}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {settings.saturationType === 'tube' && "Asymmetric clipping. Adds warm even-order harmonics typical of analog tube preamps."}
                {settings.saturationType === 'tape' && "Symmetric soft-clipping. Punchy odd-order harmonics similar to magnetic tape saturation."}
                {settings.saturationType === 'clean' && "Linear processing. No harmonic distortion added. Pure digital signal path."}
              </p>
            </div>
          </div>

          <div className="h-px bg-slate-800" />
          
          {/* Section 3: EQ Control */}
          <div className="space-y-4">
             <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Sliders size={12} /> EQ Control
            </h3>
            
            <div className="bg-slate-800/30 rounded-xl p-4 space-y-3 border border-slate-800">
               
               {/* Sacred Geometry Toggle */}
               <div className="pb-3 border-b border-slate-700/50">
                  <Toggle 
                    label={<span className="font-medium text-amber-200">Sacred Geometry Mode (ϕ)</span>}
                    icon={<Pyramid size={14} className="text-amber-400" />}
                    checked={settings.sacredGeometryMode} 
                    onChange={(v) => onUpdate({...settings, sacredGeometryMode: v})}
                  />
                  {/* Dynamic Frequency Preview */}
                  {settings.sacredGeometryMode && detectedBass > 20 && (
                     <div className="mt-2 p-2 bg-amber-900/20 rounded border border-amber-500/20 animate-in fade-in slide-in-from-top-1">
                        <div className="flex justify-between items-center text-[10px] font-mono text-amber-300/80">
                           <span>Targeting:</span>
                           <span>Sub {(detectedBass).toFixed(0)}Hz</span>
                           <span>|</span>
                           <span>Mid {(detectedBass * Math.pow(PHI, 3)).toFixed(0)}Hz</span>
                           <span>|</span>
                           <span>Air {((detectedBass * Math.pow(PHI, 7)) / 1000).toFixed(1)}kHz</span>
                        </div>
                     </div>
                  )}
                  {settings.sacredGeometryMode && detectedBass <= 20 && (
                     <p className="mt-2 text-[10px] text-amber-500/50 italic">
                        Waiting for Bass detection...
                     </p>
                  )}
               </div>

               <div className="space-y-3 pt-1">
                 <p className="text-[10px] text-slate-500 font-mono uppercase mb-2">Manual Bypass</p>
                 <Toggle 
                   label="Body Filter (Low Shelf)" 
                   checked={settings.bypassBody} 
                   onChange={(v) => onUpdate({...settings, bypassBody: v})}
                 />
                 <Toggle 
                   label="Presence (Peaking)" 
                   checked={settings.bypassResonance} 
                   onChange={(v) => onUpdate({...settings, bypassResonance: v})}
                 />
                 <Toggle 
                   label="Air Filter (Side Only)" 
                   checked={settings.bypassAir} 
                   onChange={(v) => onUpdate({...settings, bypassAir: v})}
                 />
               </div>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

           {/* Section 4: Visualization */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Activity size={12} /> Analyzer Settings
            </h3>
            
            {/* FFT Size */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">FFT Resolution</span>
                <span className="text-indigo-400 font-mono">{settings.fftSize} bins</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="14" 
                step="1"
                value={Math.log2(settings.fftSize)}
                onChange={(e) => {
                  const size = Math.pow(2, parseInt(e.target.value));
                  onUpdate({ ...settings, fftSize: size });
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Smoothing */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Visual Smoothing</span>
                <span className="text-indigo-400 font-mono">{(settings.smoothingTimeConstant * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" 
                min="0.1" 
                max="0.95" 
                step="0.05"
                value={settings.smoothingTimeConstant}
                onChange={(e) => onUpdate({ ...settings, smoothingTimeConstant: parseFloat(e.target.value) })}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/50 rounded-b-2xl border-t border-slate-800 flex justify-between items-center">
            <button 
                onClick={handleReset}
                className="text-xs text-slate-500 hover:text-white flex items-center gap-1.5 transition-colors"
            >
                <RotateCcw size={12} /> Reset Defaults
            </button>
            <button 
                onClick={onClose}
                className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors"
            >
                Done
            </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
