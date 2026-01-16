import React, { useState } from 'react';
import { X, RotateCcw, Save, Trash2, ChevronDown, Settings, Check, Power, RefreshCw } from 'lucide-react';
import { AudioSettings, SaturationType, MasteringPreset } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AudioSettings;
  onUpdate: (newSettings: AudioSettings) => void;
  presets: {
      list: MasteringPreset[];
      currentId: string;
      load: (id: string) => void;
      save: (name: string) => Promise<void>;
      delete: (id: string) => Promise<void>;
  };
  detectedBass?: number;
  isBassEstimated?: boolean;
  onReanalyze?: () => Promise<void> | void;
  variant?: 'modal' | 'embedded';
}

// --- High-Fidelity UI Components ---

const Header = ({ title }: { title: string }) => (
    <div className="flex items-center gap-2 px-4 py-3 bg-[#0f1115] border-y border-white/5 mt-4 first:mt-0">
        <div className="w-1 h-3 bg-blue-500 rounded-sm shadow-[0_0_8px_#3b82f6]"></div>
        <span className="text-[10px] font-bold text-slate-200 uppercase tracking-[0.2em]">{title}</span>
        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-2"></div>
    </div>
);

const Row = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="flex items-center group hover:bg-white/[0.02] transition-colors border-b border-white/[0.03] last:border-0 h-12">
        {/* Label Column */}
        <div className="w-1/3 min-w-[140px] px-4 border-r border-white/[0.03] h-full flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">{label}</span>
            {/* Active Indicator Dot */}
            <div className="w-1 h-1 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_5px_#3b82f6]"></div>
        </div>
        
        {/* Control Column */}
        <div className="flex-1 px-4 h-full flex items-center relative">
            {children}
        </div>
    </div>
);

const ToggleSwitch = ({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) => (
    <button 
      onClick={() => onChange(!value)}
      className={`
          relative w-10 h-5 rounded-sm transition-all duration-200 border
          ${value 
              ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
              : 'bg-black border-slate-700'}
      `}
    >
        {/* Sliding Actuator */}
        <div className={`
            absolute top-0.5 bottom-0.5 w-4 bg-gradient-to-b from-slate-400 to-slate-600 rounded-xs shadow-md transition-all duration-200
            ${value ? 'left-5 bg-gradient-to-b from-blue-400 to-blue-600' : 'left-0.5'}
        `}></div>
        
        {/* LED Indicator inside the track */}
        <div className={`
            absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors duration-300
            ${value ? 'bg-blue-400 shadow-[0_0_5px_#60a5fa]' : 'bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,1)]'}
        `}></div>
    </button>
);

const PrecisionSlider = ({ value, min, max, step, unit, onChange }: { value: number, min: number, max: number, step: number, unit?: string, onChange: (v: number) => void }) => (
    <div className="flex items-center gap-3 w-full">
        <input 
           type="range" min={min} max={max} step={step} value={value} 
           onChange={(e) => onChange(Number(e.target.value))}
           className="tech-fader flex-1"
        />
        <div className="tech-inset px-2 py-1 min-w-[50px] text-right font-mono text-[10px] text-cyan-400 border border-white/5">
            {value.toFixed(2)}{unit}
        </div>
    </div>
);

const SegmentedControl = ({ options, current, onChange }: { options: string[], current: string, onChange: (v: any) => void }) => (
    <div className="flex gap-1 bg-black p-1 rounded-sm border border-slate-800 shadow-inner">
        {options.map(opt => (
            <button 
              key={opt}
              onClick={() => onChange(opt)}
              className={`
                  px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-sm transition-all
                  ${current === opt 
                      ? 'bg-gradient-to-b from-slate-600 to-slate-800 text-white shadow-md border border-slate-500' 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}
              `}
            >
                {opt}
            </button>
        ))}
    </div>
);

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, settings, onUpdate, presets, 
    detectedBass, isBassEstimated, onReanalyze,
    variant = 'modal'
}) => {
  if (!isOpen) return null;

  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const activePreset = presets.list.find(p => p.id === presets.currentId);

  const handleSaveClick = () => { setIsSaving(true); setNewPresetName(`CUSTOM_CFG_${presets.list.filter(p => !p.isFactory).length + 1}`); };
  const confirmSave = async () => { if (newPresetName.trim()) { await presets.save(newPresetName); setIsSaving(false); } };
  const handleDelete = async (id: string, e: React.MouseEvent) => { e.stopPropagation(); if (window.confirm("CONFIRM DELETION?")) { await presets.delete(id); } };
  
  const handleReset = () => {
    onUpdate({
      fftSize: 8192, smoothingTimeConstant: 0.8, saturationType: 'tube',
      bypassBody: false, bypassResonance: false, bypassAir: false, stereoWidth: 1.0,
      sacredGeometryMode: false, fibonacciAlignment: false, phaseLockEnabled: false,
      cymaticsMode: false, binauralMode: false, binauralBeatFreq: 8,
      harmonicWarmth: 0.0, harmonicClarity: 0.0, timbreMorph: 1.0,
      deepZenBass: 0.0, spaceResonance: 0.0, roomScale: 0.5,
      breathingEnabled: false, breathingIntensity: 0.0,
      autoEqEnabled: false, autoEqIntensity: 0.5
    });
  };

  const handleReanalyzeClick = async () => {
      if (onReanalyze) {
          setIsReanalyzing(true);
          await onReanalyze();
          setIsReanalyzing(false);
      }
  };

  const content = (
      <div className={`tech-panel flex flex-col relative z-[50] shadow-[0_20px_60px_rgba(0,0,0,0.9)] border border-slate-700 animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-md ${variant === 'modal' ? 'w-full max-w-2xl h-[90vh] z-[201]' : 'w-full h-full min-h-[600px]'}`}>
        
        {/* Header - Industrial Plate */}
        <div className="bg-gradient-to-b from-[#1a1c23] to-[#0f1115] border-b border-white/10 p-4 flex justify-between items-center shrink-0 shadow-lg relative z-10">
            <div className="flex items-center gap-3">
                 <div className="p-1.5 bg-black border border-white/10 rounded shadow-inner">
                    <Settings size={16} className="text-slate-400" />
                 </div>
                 <div className="flex flex-col">
                     <span className="text-xs font-bold text-white tracking-[0.2em] uppercase text-shadow">Config_Matrix</span>
                     <span className="text-[9px] text-slate-500 tracking-widest font-mono">DSP_ENGINE_V2.1 // ROOT_ACCESS</span>
                 </div>
            </div>
            {/* Hide Close button if Embedded view (Navigation handles it) */}
            {variant === 'modal' && (
                <button onClick={onClose} className="tech-button w-8 h-8 flex items-center justify-center rounded">
                    <X size={14} />
                </button>
            )}
        </div>

        {/* Toolbar - Control Deck */}
        <div className="bg-[#0b0c10] border-b border-black p-3 flex justify-between items-center shrink-0 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]">
             {isSaving ? (
                <div className="flex items-center gap-2 w-full bg-black/50 p-1 rounded border border-blue-500/30">
                    <span className="text-[10px] font-mono text-blue-500 animate-pulse px-2">{'>'}</span>
                    <input 
                        type="text" 
                        value={newPresetName} 
                        onChange={(e) => setNewPresetName(e.target.value)}
                        className="bg-transparent text-xs font-mono text-white w-full focus:outline-none"
                        placeholder="ENTER_FILENAME..."
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && confirmSave()}
                    />
                    <button onClick={confirmSave} className="text-emerald-500 hover:text-emerald-400 px-2"><Check size={14}/></button>
                    <button onClick={() => setIsSaving(false)} className="text-rose-500 hover:text-rose-400 px-2"><X size={14}/></button>
                </div>
             ) : (
                <>
                    <div className="relative z-20">
                        <button 
                            onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)} 
                            className="tech-button px-4 py-1.5 flex items-center gap-3 rounded text-[10px] font-bold uppercase tracking-wider"
                        >
                            <span className="text-blue-400">PROFILE:</span>
                            <span className="text-white">{activePreset ? activePreset.name : "UNSAVED_STATE"}</span>
                            <ChevronDown size={10} className="ml-2 opacity-50" />
                        </button>

                        {isPresetMenuOpen && (
                            <>
                                <div className="fixed inset-0" onClick={() => setIsPresetMenuOpen(false)}/>
                                <div className="absolute top-full left-0 mt-2 w-64 bg-[#1a1c23] border border-slate-600 shadow-2xl rounded-sm overflow-hidden py-1">
                                    {presets.list.map(preset => (
                                        <div key={preset.id} onClick={() => { presets.load(preset.id); setIsPresetMenuOpen(false); }} className={`px-4 py-2 text-[10px] font-mono uppercase flex justify-between cursor-pointer hover:bg-blue-600 hover:text-white transition-colors ${preset.id === presets.currentId ? 'text-blue-400 bg-black/20' : 'text-slate-400'}`}>
                                            <span>{preset.name}</span>
                                            {!preset.isFactory && <button onClick={(e) => handleDelete(preset.id, e)} className="hover:text-rose-200"><Trash2 size={12}/></button>}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className="flex gap-2">
                        <button onClick={handleSaveClick} className="tech-button px-3 py-1.5 rounded flex items-center gap-2" title="Save">
                            <Save size={12} className="text-blue-400" />
                            <span className="text-[9px] font-bold uppercase">Save</span>
                        </button>
                        <button onClick={handleReset} className="tech-button px-3 py-1.5 rounded flex items-center gap-2" title="Reset">
                            <RotateCcw size={12} className="text-amber-400" />
                            <span className="text-[9px] font-bold uppercase">Reset</span>
                        </button>
                    </div>
                </>
             )}
        </div>

        {/* Scrollable Content - Structure */}
        <div className="flex-1 overflow-y-auto bg-[#050608] relative">
            {/* Grid Lines Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
                 style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '100% 48px', marginTop: '41px' }}>
            </div>

            <Header title="Phase Alignment" />
            <Row label="Fibonacci Sync">
                <ToggleSwitch value={settings.fibonacciAlignment} onChange={(v) => onUpdate({...settings, fibonacciAlignment: v})} />
            </Row>
            <Row label="Phase Lock Loop">
                <ToggleSwitch value={settings.phaseLockEnabled} onChange={(v) => onUpdate({...settings, phaseLockEnabled: v})} />
            </Row>
            <Row label="Cymatics Field">
                <ToggleSwitch value={settings.cymaticsMode} onChange={(v) => onUpdate({...settings, cymaticsMode: v})} />
            </Row>

            <Header title="Harmonic Series" />
            <Row label="Timbre Morph">
                <PrecisionSlider value={settings.timbreMorph} min={0.5} max={1.5} step={0.01} unit="x" onChange={(v) => onUpdate({...settings, timbreMorph: v})} />
            </Row>
            <Row label="Even Harmonics">
                <PrecisionSlider value={settings.harmonicWarmth} min={0} max={1} step={0.05} onChange={(v) => onUpdate({...settings, harmonicWarmth: v})} />
            </Row>
            <Row label="Odd Harmonics">
                <PrecisionSlider value={settings.harmonicClarity} min={0} max={1} step={0.05} onChange={(v) => onUpdate({...settings, harmonicClarity: v})} />
            </Row>

            <Header title="Spatial Engine" />
            <Row label="Stereo Width">
                <PrecisionSlider value={settings.stereoWidth} min={0} max={2.0} step={0.1} unit="w" onChange={(v) => onUpdate({...settings, stereoWidth: v})} />
            </Row>
            <Row label="Space Resonance">
                <PrecisionSlider value={settings.spaceResonance} min={0} max={1.0} step={0.05} onChange={(v) => onUpdate({...settings, spaceResonance: v})} />
            </Row>
            <Row label="Binaural Beats">
                <div className="flex gap-4 w-full items-center">
                    <ToggleSwitch value={settings.binauralMode} onChange={(v) => onUpdate({...settings, binauralMode: v})} />
                    {settings.binauralMode && (
                        <div className="flex-1 border-l border-white/5 pl-4 ml-2 animate-in fade-in slide-in-from-left-2">
                             <PrecisionSlider value={settings.binauralBeatFreq} min={1} max={40} step={1} unit="Hz" onChange={(v) => onUpdate({...settings, binauralBeatFreq: v})} />
                        </div>
                    )}
                </div>
            </Row>
            
            <Header title="Analog Chain" />
            <Row label="Saturation Model">
                <SegmentedControl 
                    options={['tube', 'tape', 'clean']} 
                    current={settings.saturationType} 
                    onChange={(v) => onUpdate({...settings, saturationType: v})} 
                />
            </Row>

            <Header title="Adaptive EQ" />
            {detectedBass !== undefined && (
                <Row label="Detected Bass">
                    <div className="flex items-center gap-2 justify-end w-full">
                        {isBassEstimated && <span className="text-[9px] text-amber-500 uppercase font-mono tracking-wider">[ESTIMATED]</span>}
                        <span className="text-[10px] text-blue-400 font-mono font-bold">{detectedBass.toFixed(2)} HZ</span>
                        {onReanalyze && (
                            <button 
                                onClick={handleReanalyzeClick}
                                disabled={isReanalyzing}
                                className="ml-2 p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-sm text-slate-400 hover:text-white transition-colors"
                                title="Re-Analyze"
                            >
                                <RefreshCw size={10} className={isReanalyzing ? "animate-spin" : ""} />
                            </button>
                        )}
                    </div>
                </Row>
            )}
            <Row label="Sacred Geometry">
                <ToggleSwitch value={settings.sacredGeometryMode} onChange={(v) => onUpdate({...settings, sacredGeometryMode: v})} />
            </Row>
            <Row label="Auto Balance">
                <div className="flex gap-4 w-full items-center">
                    <ToggleSwitch value={settings.autoEqEnabled} onChange={(v) => onUpdate({...settings, autoEqEnabled: v})} />
                    {settings.autoEqEnabled && (
                        <div className="flex-1 border-l border-white/5 pl-4 ml-2 animate-in fade-in slide-in-from-left-2">
                             <PrecisionSlider value={settings.autoEqIntensity} min={0} max={1} step={0.05} onChange={(v) => onUpdate({...settings, autoEqIntensity: v})} />
                        </div>
                    )}
                </div>
            </Row>

            <div className="h-12 flex items-center justify-center border-t border-white/5 mt-4 bg-black/20">
                <span className="text-[9px] text-slate-700 font-mono">-- END OF CONFIGURATION STREAM --</span>
            </div>
        </div>

        {/* Footer - Status Indicators */}
        <div className="bg-[#0b0c10] border-t border-white/10 p-2 flex justify-between px-4">
             <div className="flex items-center gap-2">
                 <div className="led on"></div>
                 <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">System Online</span>
             </div>
             <div className="flex items-center gap-2">
                 <span className="text-[9px] text-slate-600 font-mono">MEM: 24%</span>
             </div>
        </div>

      </div>
  );

  if (variant === 'embedded') {
    return content;
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer" onClick={onClose} />
      {content}
    </div>
  );
};

export default SettingsModal;