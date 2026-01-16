import React, { useState } from 'react';
import { X, RotateCcw, Activity, Mic2, Cpu, Sliders, MoveHorizontal, Pyramid, Waves, Eye, Clock, Zap, Info, Magnet, Speaker, Save, Trash2, ChevronDown, Bookmark, Fingerprint, Globe, Gauge, Wind, RefreshCw, AlertTriangle } from 'lucide-react';
import { AudioSettings, SaturationType, MasteringPreset } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AudioSettings;
  onUpdate: (newSettings: AudioSettings) => void;
  detectedBass?: number;
  isBassEstimated?: boolean; // New prop
  onReanalyze?: () => void; // New prop for Retry
  presets: {
      list: MasteringPreset[];
      currentId: string;
      load: (id: string) => void;
      save: (name: string) => Promise<void>;
      delete: (id: string) => Promise<void>;
  };
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdate, detectedBass = 0, isBassEstimated = false, onReanalyze, presets }) => {
  if (!isOpen) return null;

  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const activePreset = presets.list.find(p => p.id === presets.currentId);
  
  // Basic deep compare to check if modified
  const isModified = activePreset 
     ? JSON.stringify(activePreset.data) !== JSON.stringify(settings)
     : true;

  const handleSaveClick = () => {
      setIsSaving(true);
      setNewPresetName(`Custom Preset ${presets.list.filter(p => !p.isFactory).length + 1}`);
  };

  const confirmSave = async () => {
      if (newPresetName.trim()) {
          await presets.save(newPresetName);
          setIsSaving(false);
      }
  };
  
  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.confirm("Delete this preset?")) {
          await presets.delete(id);
      }
  };

  const handleReset = () => {
    onUpdate({
      fftSize: 8192,
      smoothingTimeConstant: 0.8,
      saturationType: 'tube',
      bypassBody: false,
      bypassResonance: false,
      bypassAir: false,
      stereoWidth: 1.0,
      sacredGeometryMode: false,
      fibonacciAlignment: false,
      phaseLockEnabled: false,
      cymaticsMode: false,
      binauralMode: false,
      binauralBeatFreq: 8,
      harmonicWarmth: 0.0,
      harmonicClarity: 0.0,
      timbreMorph: 1.0,
      deepZenBass: 0.0,
      spaceResonance: 0.0,
      roomScale: 0.5,
      breathingEnabled: false,
      breathingIntensity: 0.0,
      autoEqEnabled: false,
      autoEqIntensity: 0.5
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
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh] flex flex-col">
        
        {/* Header: Preset Command Center */}
        <div className="bg-slate-800/80 backdrop-blur border-b border-slate-700 p-4 sticky top-0 z-20">
            <div className="flex justify-between items-start mb-3">
                 <div className="flex flex-col">
                    <span className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase mb-1 flex items-center gap-1">
                        <Cpu size={10} /> Mastering Preset
                    </span>
                    
                    {isSaving ? (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                            <input 
                                type="text"
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                className="bg-slate-900 border border-slate-600 text-white text-sm px-2 py-1 rounded focus:border-indigo-500 outline-none w-40"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && confirmSave()}
                            />
                            <button onClick={confirmSave} className="bg-indigo-600 text-white p-1 rounded hover:bg-indigo-500"><Save size={14}/></button>
                            <button onClick={() => setIsSaving(false)} className="bg-slate-700 text-slate-300 p-1 rounded hover:bg-slate-600"><X size={14}/></button>
                        </div>
                    ) : (
                        <div className="relative">
                            <button 
                                onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
                                className="flex items-center gap-2 text-white font-bold text-lg hover:text-indigo-300 transition-colors"
                            >
                                {activePreset ? activePreset.name : "Custom Configuration"}
                                {isModified && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-normal ml-1">Modified</span>}
                                <ChevronDown size={16} className={`text-slate-500 transition-transform ${isPresetMenuOpen ? 'rotate-180' : ''}`}/>
                            </button>

                            {isPresetMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsPresetMenuOpen(false)}/>
                                    <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-20 max-h-60 overflow-y-auto">
                                        {presets.list.map(preset => (
                                            <div 
                                                key={preset.id}
                                                onClick={() => { presets.load(preset.id); setIsPresetMenuOpen(false); }}
                                                className={`
                                                    px-4 py-3 text-sm flex items-center justify-between cursor-pointer border-b border-slate-700/50 last:border-0
                                                    ${preset.id === presets.currentId ? 'bg-indigo-900/30 text-indigo-300' : 'text-slate-300 hover:bg-slate-700'}
                                                `}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{preset.name}</span>
                                                    {preset.isFactory && <span className="text-[9px] text-slate-500 uppercase tracking-wider">Factory</span>}
                                                </div>
                                                {!preset.isFactory && (
                                                    <button 
                                                        onClick={(e) => handleDelete(preset.id, e)}
                                                        className="text-slate-600 hover:text-rose-500 p-1 rounded"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                 </div>

                 <div className="flex gap-2">
                     <button 
                        onClick={handleSaveClick}
                        className="p-2 text-slate-400 hover:text-indigo-400 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                        title="Save as Preset"
                     >
                         <Save size={18} />
                     </button>
                     <button 
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                     >
                         <X size={18} />
                     </button>
                 </div>
            </div>
            
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar">
                 {/* Quick Chips for Factory Presets */}
                 {presets.list.filter(p => p.isFactory).slice(0, 3).map(p => (
                     <button
                        key={p.id}
                        onClick={() => presets.load(p.id)}
                        className={`
                           flex-shrink-0 text-[10px] px-2 py-1 rounded-full border transition-all
                           ${presets.currentId === p.id 
                              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
                              : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'}
                        `}
                     >
                         {p.name}
                     </button>
                 ))}
            </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-8 flex-1">
          
          {/* Section: Esoteric Features (Phase 2) */}
           <div className="space-y-4">
            <h3 className="text-xs font-mono text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <Pyramid size={12} /> Esoteric Labs
            </h3>
            
            <div className="bg-indigo-900/10 rounded-xl p-4 space-y-4 border border-indigo-500/20">
                <Toggle 
                    label="Fibonacci Breath (Time-Align)" 
                    checked={settings.fibonacciAlignment} 
                    onChange={(v) => onUpdate({...settings, fibonacciAlignment: v})}
                    icon={<Clock size={14} className="text-amber-400" />}
                />
                <p className="text-[10px] text-slate-500 pl-6 -mt-2">
                    Applies a micro-LFO locked to Φ (1.618s) to align audio tempo with the Golden Ratio.
                </p>

                <Toggle 
                    label="Dynamic Phase-Lock" 
                    checked={settings.phaseLockEnabled} 
                    onChange={(v) => onUpdate({...settings, phaseLockEnabled: v})}
                    icon={<Magnet size={14} className="text-emerald-400" />}
                />
                <p className="text-[10px] text-slate-500 pl-6 -mt-2">
                    Micro-nudges the playback rate to synchronize phase zero-crossings with the Golden Grid. Eliminates transient smearing.
                </p>

                <Toggle 
                    label="Cymatics Visualizer" 
                    checked={settings.cymaticsMode} 
                    onChange={(v) => onUpdate({...settings, cymaticsMode: v})}
                    icon={<Eye size={14} className="text-cyan-400" />}
                />
                
                <div className="pt-2 border-t border-indigo-500/20">
                    <Toggle 
                        label="Binaural Zen-Beats" 
                        checked={settings.binauralMode} 
                        onChange={(v) => onUpdate({...settings, binauralMode: v})}
                        icon={<Waves size={14} className="text-pink-400" />}
                    />
                    {settings.binauralMode && (
                        <div className="mt-3 pl-6 space-y-2 animate-in fade-in slide-in-from-top-1">
                            <div className="flex justify-between text-xs text-slate-400">
                                <span>Beat Frequency (Alpha)</span>
                                <span>{settings.binauralBeatFreq} Hz</span>
                            </div>
                            <input 
                                type="range" min="4" max="14" step="1" 
                                value={settings.binauralBeatFreq} 
                                onChange={(e) => onUpdate({...settings, binauralBeatFreq: Number(e.target.value)})}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                            />
                            <p className="text-[10px] text-slate-500 italic">
                                Requires Headphones. Left: {detectedBass > 0 ? detectedBass.toFixed(1) : '60'}Hz | Right: {((detectedBass > 0 ? detectedBass : 60) + settings.binauralBeatFreq).toFixed(1)}Hz
                            </p>
                        </div>
                    )}
                </div>
            </div>
           </div>

           <div className="h-px bg-slate-800" />

           {/* Section: Organic Automation */}
           <div className="space-y-4">
              <h3 className="text-xs font-mono text-blue-400 uppercase tracking-widest flex items-center gap-2">
                  <Wind size={12} /> Organic Automation
              </h3>
              <div className="bg-blue-900/10 rounded-xl p-4 space-y-4 border border-blue-500/20">
                  <Toggle 
                    label="Fibonacci Breathing (ϕ-Cycles)" 
                    checked={settings.breathingEnabled} 
                    onChange={(v) => onUpdate({...settings, breathingEnabled: v})}
                    icon={<Activity size={14} className="text-blue-400" />}
                  />
                  
                  {settings.breathingEnabled && (
                    <div className="space-y-1 pl-6 animate-in fade-in slide-in-from-top-1">
                        <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Breath Intensity</span>
                        <span>{(settings.breathingIntensity * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                        type="range" min="0" max="1" step="0.05"
                        value={settings.breathingIntensity}
                        onChange={(e) => onUpdate({...settings, breathingIntensity: Number(e.target.value)})}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <p className="text-[10px] text-slate-500 italic pt-1">
                            Modulates stereo width and resonance drift at 0.618 Hz to simulate biological respiration.
                        </p>
                    </div>
                  )}
              </div>
           </div>
           
           <div className="h-px bg-slate-800" />

          {/* Section: Harmonic Timbre Shaping (New) */}
          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Zap size={12} className="text-yellow-500" /> Harmonic Timbre Shaping
                </h3>
                <div className="group relative">
                   <Info size={14} className="text-slate-500 cursor-help" />
                   <div className="absolute right-0 bottom-full mb-2 w-48 p-2 bg-slate-800 text-[10px] text-slate-300 rounded border border-slate-600 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Even harmonics (2, 4, 6...) add warmth and fullness. Odd harmonics (3, 5, 7...) add clarity, edge, and presence.
                   </div>
                </div>
             </div>

             <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
                 {/* Visualizer */}
                 <div className="flex items-end justify-between h-16 px-2 mb-4 gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
                       const isEven = n % 2 === 0;
                       let intensity = 0;
                       
                       if (n === 1) intensity = 0.2; // Fundamental static
                       else if (isEven) {
                          // Decay logic from AudioService: 1 - (index * 0.1)
                          const decay = 1 - ((n-1) * 0.1); 
                          intensity = settings.harmonicWarmth * Math.max(0.2, decay);
                       } else {
                          intensity = settings.harmonicClarity;
                       }
                       
                       // Apply Morph to visual position (approx)
                       const shift = (settings.timbreMorph - 1.0) * 10;
                       
                       const height = 10 + (intensity * 90);
                       const colorClass = n===1 ? 'bg-slate-600' : isEven ? 'bg-amber-500' : 'bg-cyan-500';
                       
                       return (
                          <div key={n} className="w-full flex flex-col items-center gap-1 group/bar" style={{ transform: `translateY(${shift}px)` }}>
                              <div 
                                className={`w-full rounded-t-sm transition-all duration-300 ${colorClass}`} 
                                style={{ height: `${height}%`, opacity: 0.3 + (intensity * 0.7) }}
                              />
                              <span className="text-[9px] font-mono text-slate-500">f{n}</span>
                          </div>
                       );
                    })}
                 </div>

                 <div className="space-y-4">
                     {/* Timbre Morph Slider */}
                     <div className="space-y-2 pb-4 border-b border-slate-700/50">
                         <div className="flex justify-between items-center text-xs">
                             <span className="text-pink-300 flex items-center gap-1.5"><Fingerprint size={12}/> Timbre Morph</span>
                             <span className="font-mono text-pink-400">
                                {settings.timbreMorph < 1 ? "Darker" : settings.timbreMorph > 1 ? "Aetheric" : "Neutral"} ({settings.timbreMorph.toFixed(2)}x)
                             </span>
                         </div>
                         <div className="relative flex items-center">
                            <input 
                                type="range" min="0.5" max="1.5" step="0.01"
                                value={settings.timbreMorph}
                                onChange={(e) => onUpdate({...settings, timbreMorph: Number(e.target.value)})}
                                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500 relative z-10"
                            />
                            {/* Center Marker */}
                            <div className="absolute left-1/2 w-0.5 h-3 bg-slate-500 -translate-x-1/2 rounded-full"></div>
                         </div>
                         <p className="text-[9px] text-slate-500 text-center">
                            Shifts spectral formant envelope. Use &lt; 1.0 to preserve body when pitching down.
                         </p>
                     </div>

                     {/* Warmth Control */}
                     <div className="space-y-1">
                         <div className="flex justify-between text-xs">
                             <span className="text-amber-200">Warmth (Even)</span>
                             <span className="font-mono text-amber-500">{(settings.harmonicWarmth * 100).toFixed(0)}%</span>
                         </div>
                         <input 
                            type="range" min="0" max="1" step="0.05"
                            value={settings.harmonicWarmth}
                            onChange={(e) => onUpdate({...settings, harmonicWarmth: Number(e.target.value)})}
                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                         />
                     </div>

                     {/* Clarity Control */}
                     <div className="space-y-1">
                         <div className="flex justify-between text-xs">
                             <span className="text-cyan-200">Clarity (Odd)</span>
                             <span className="font-mono text-cyan-500">{(settings.harmonicClarity * 100).toFixed(0)}%</span>
                         </div>
                         <input 
                            type="range" min="0" max="1" step="0.05"
                            value={settings.harmonicClarity}
                            onChange={(e) => onUpdate({...settings, harmonicClarity: Number(e.target.value)})}
                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                         />
                     </div>
                 </div>
                 
                 {/* Deep Zen Bass (Psychoacoustic) */}
                 <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
                     <div className="flex items-center justify-between">
                         <h4 className="text-xs text-purple-300 font-medium flex items-center gap-2">
                             <Speaker size={12} /> Deep Zen Bass
                         </h4>
                         <span className="text-xs font-mono text-purple-400">{(settings.deepZenBass * 100).toFixed(0)}%</span>
                     </div>
                     <input 
                        type="range" min="0" max="1" step="0.05"
                        value={settings.deepZenBass}
                        onChange={(e) => onUpdate({...settings, deepZenBass: Number(e.target.value)})}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                     />
                     <div className="p-2 bg-purple-900/10 rounded border border-purple-500/10 text-[9px] text-purple-300/80 leading-relaxed">
                         <span className="font-bold text-purple-300">Psychoacoustic Principle:</span> Utilizes the "Missing Fundamental" effect. Generates upper harmonics of sub-frequencies so your brain perceives bass that small speakers cannot reproduce.
                     </div>
                 </div>
             </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* Section 1: ZenSpace M/S Control & SPATIAL ENVIRONMENT */}
          <div className="space-y-4">
             <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <MoveHorizontal size={12} /> ZenSpace Imaging & Environment
            </h3>
            
            <div className="space-y-4">
                {/* Stereo Width */}
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
                </div>

                {/* Spatial Environment (Harmonic Reverb) */}
                <div className="space-y-3 pt-3 border-t border-slate-800/50">
                    <div className="flex items-center justify-between">
                       <span className="text-blue-300 flex items-center gap-2 text-sm"><Globe size={14}/> Spatial Environment</span>
                       <div className="group relative">
                           <Info size={12} className="text-slate-500 cursor-help" />
                           <div className="absolute right-0 bottom-full mb-2 w-56 p-2 bg-slate-800 text-[10px] text-slate-300 rounded border border-slate-600 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                              Harmonic Reverb: Erzeugt einen virtuellen Raum, der mathematisch mit der gewählten Frequenz mitschwingt. Verhindert disharmonische Überlagerungen im Nachhall.
                           </div>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        {/* Wet Level */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Space Resonance</span>
                                <span className="text-blue-400 font-mono">{(settings.spaceResonance * 100).toFixed(0)}%</span>
                            </div>
                            <input 
                                type="range"
                                min="0"
                                max="1.0"
                                step="0.05"
                                value={settings.spaceResonance}
                                onChange={(e) => onUpdate({ ...settings, spaceResonance: parseFloat(e.target.value) })}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                        
                        {/* Decay/Feedback */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Room Scale (Decay)</span>
                                <span className="text-blue-400 font-mono">{(settings.roomScale * 100).toFixed(0)}%</span>
                            </div>
                            <input 
                                type="range"
                                min="0"
                                max="1.0"
                                step="0.05"
                                value={settings.roomScale || 0.5}
                                onChange={(e) => onUpdate({ ...settings, roomScale: parseFloat(e.target.value) })}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* Section 2: Audio Processing */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Mic2 size={12} /> Harmonic Saturation
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
                  {settings.sacredGeometryMode && (
                     <div className={`mt-2 p-2 rounded border animate-in fade-in slide-in-from-top-1 ${isBassEstimated ? 'bg-amber-900/10 border-amber-500/10' : 'bg-amber-900/20 border-amber-500/20'}`}>
                        <div className="flex justify-between items-center text-[10px] font-mono text-amber-300/80 mb-1">
                           <span className="flex items-center gap-1.5">
                               {isBassEstimated ? (
                                   <span className="text-amber-500 font-bold flex items-center gap-1">
                                       <AlertTriangle size={10} /> AUTO-MODE (Estimated Bass)
                                   </span>
                               ) : (
                                   <span className="text-emerald-400 flex items-center gap-1">
                                       <Activity size={10} /> Live Bass Alignment
                                   </span>
                               )}
                           </span>
                           {isBassEstimated && onReanalyze && (
                               <button 
                                onClick={onReanalyze}
                                className="text-[9px] bg-slate-700 hover:bg-slate-600 text-white px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                               >
                                   <RefreshCw size={8} /> Retry Scan
                               </button>
                           )}
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-mono text-amber-300/60 pt-1 border-t border-amber-500/10">
                           <span>Sub {(detectedBass).toFixed(0)}Hz</span>
                           <span>|</span>
                           <span>Mid {(detectedBass * Math.pow(PHI, 3)).toFixed(0)}Hz</span>
                           <span>|</span>
                           <span>Air {((detectedBass * Math.pow(PHI, 7)) / 1000).toFixed(1)}kHz</span>
                        </div>
                     </div>
                  )}
               </div>
               
               {/* Adaptive Auto-EQ Toggle */}
               <div className="pb-3 border-b border-slate-700/50 pt-1">
                  <Toggle 
                    label={<span className="font-medium text-teal-200">Adaptive Spectral Balance</span>}
                    icon={<Gauge size={14} className="text-teal-400" />}
                    checked={settings.autoEqEnabled} 
                    onChange={(v) => onUpdate({...settings, autoEqEnabled: v})}
                  />
                  {settings.autoEqEnabled && (
                      <div className="mt-3 pl-6 space-y-2 animate-in fade-in slide-in-from-top-1">
                          <div className="flex justify-between text-xs text-teal-400/80">
                            <span>Correction Strength</span>
                            <span>{(settings.autoEqIntensity * 100).toFixed(0)}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="1" step="0.05"
                            value={settings.autoEqIntensity}
                            onChange={(e) => onUpdate({...settings, autoEqIntensity: Number(e.target.value)})}
                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                          />
                          <p className="text-[10px] text-teal-500/60 italic">
                            Matches energy profile to Pink Noise (-3dB/oct). Adjust lower for transparency, higher for polish.
                          </p>
                      </div>
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
        <div className="p-4 bg-slate-800/50 rounded-b-2xl border-t border-slate-800 flex justify-between items-center sticky bottom-0 z-10 backdrop-blur">
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