import React, { useState, useEffect, useRef } from 'react';
import Visualizer from './components/Visualizer';
import ControlPanel from './components/ControlPanel';
import FileUpload from './components/FileUpload';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import DebugConsole from './components/DebugConsole';
import { TuningPreset } from './types';
import { useAudioProcessor } from './hooks/useAudioProcessor';
import { Activity, Waves, RefreshCw, Maximize2, Terminal, RotateCcw, Pi } from 'lucide-react';
import { logger } from './services/logger';

type ViewMode = 'dashboard' | 'settings';

const App: React.FC = () => {
  const processor = useAudioProcessor();
  const [activeView, setActiveView] = useState<ViewMode>('dashboard');
  const [showLocalSettings, setShowLocalSettings] = useState<boolean>(false);
  const [showDebug, setShowDebug] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // Mouse Tracking Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (mainRef.current) {
        const x = e.clientX;
        const y = e.clientY;
        mainRef.current.style.setProperty('--mouse-x', `${x}px`);
        mainRef.current.style.setProperty('--mouse-y', `${y}px`);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const displayedPitch = processor.isComparing 
     ? processor.analysis.detectedPitch 
     : (processor.tuningPreset === TuningPreset.STANDARD_440 
        ? processor.analysis.detectedPitch
        : processor.analysis.detectedPitch * (processor.tuningPreset / (processor.analysis.detectedPitch || 440)));
    
  const displayedBass = processor.isComparing
    ? processor.analysis.detectedBass
    : (processor.tuningPreset === TuningPreset.STANDARD_440
        ? processor.analysis.detectedBass
        : processor.analysis.detectedBass * (processor.tuningPreset / (processor.analysis.detectedPitch || 440)));
  
  const activePresetName = processor.presets.list.find(p => p.id === processor.presets.currentId)?.name;

  // Determine if UI should be interactive
  const isProcessing = processor.processState === 'decoding' || processor.processState === 'analyzing';

  const handleReset = () => {
      processor.reset();
      setActiveView('dashboard');
  };

  return (
    <div 
      ref={mainRef}
      className="flex h-screen w-screen overflow-hidden bg-[#141417] text-slate-400 selection:bg-blue-500/30 selection:text-blue-200"
      style={{
        background: `radial-gradient(circle 800px at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(30, 32, 40, 0.4), #141417 100%)`
      }}
    >
      
      {/* Batch Processing Overlay - High Z-Index */}
      {processor.batchProgress && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in">
             <div className="tech-panel p-8 flex flex-col items-center max-w-sm w-full border border-blue-500/20">
                 <RefreshCw size={48} className="text-blue-500 animate-spin mb-4" />
                 <h2 className="text-xl font-bold text-white mb-2 tracking-widest uppercase">Batch Processing</h2>
                 <p className="text-slate-500 text-xs mb-6 font-mono tracking-widest">OPTIMIZING HARMONICS...</p>
                 
                 <div className="w-full bg-slate-900 h-1 mb-2 overflow-hidden">
                     <div 
                        className="bg-blue-500 h-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                        style={{ width: `${(processor.batchProgress.current / processor.batchProgress.total) * 100}%` }}
                     />
                 </div>
                 <div className="flex justify-between w-full text-[10px] font-mono text-slate-500">
                     <span>TRACK {processor.batchProgress.current} / {processor.batchProgress.total}</span>
                     <span>{Math.round((processor.batchProgress.current / processor.batchProgress.total) * 100)}%</span>
                 </div>
             </div>
          </div>
      )}

      {/* LEFT: Industrial Sidebar (Desktop Only) */}
      <Sidebar 
        hasFile={!!processor.file} 
        onReset={handleReset}
        activeView={activeView}
        onNavigate={setActiveView}
        processState={processor.processState}
        onToggleDebug={() => setShowDebug(!showDebug)}
      />

      {/* RIGHT: Main Content */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Top Bar (Breadcrumbs / Context) */}
        <div className="h-14 md:h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-black/20 backdrop-blur-sm z-30 shrink-0">
           <div className="flex items-center gap-2">
              {/* Mobile Branding (Visible only when Sidebar is hidden) */}
              <div className="md:hidden flex items-center gap-2 mr-2 border-r border-white/10 pr-4">
                 <div className="flex items-center text-blue-500 gap-0.5">
                    <Pi size={18} strokeWidth={2.5} />
                    <span className="font-bold font-mono text-sm">23</span>
                 </div>
                 <span className="font-bold text-white tracking-widest font-mono text-xs">ZEN</span>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                 <Terminal size={12} className="hidden sm:block" />
                 <span className="hidden sm:inline">SYSTEM</span>
                 <span className="text-slate-700 hidden sm:inline">/</span>
                 <span className={processor.file ? "text-white" : "text-slate-500"}>
                   {activeView === 'settings' ? "CONFIG_MATRIX" : (processor.file ? "ANALYZER" : "INPUT")}
                 </span>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              {processor.file && (
                <>
                  <button 
                    onClick={handleReset}
                    className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 text-slate-400 text-[9px] font-mono tracking-widest hover:bg-white/10 hover:text-white transition-colors"
                    title="Close File"
                  >
                    <RotateCcw size={12} />
                    <span>RESET</span>
                  </button>

                  <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-mono tracking-widest flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-blue-500 animate-pulse"></div>
                     <span className="hidden sm:inline">DSP_ACTIVE</span>
                     <span className="sm:hidden">ON</span>
                  </div>
                </>
              )}
           </div>
        </div>

        {/* Scrollable Workspace */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 relative pb-24 md:pb-12">
          
          {activeView === 'settings' ? (
             <div className="max-w-3xl mx-auto h-full min-h-[600px] animate-in slide-in-from-right-4 fade-in duration-300">
                 <SettingsModal 
                    isOpen={true} 
                    onClose={() => setActiveView('dashboard')}
                    settings={processor.audioSettings}
                    onUpdate={processor.updateSettings}
                    detectedBass={processor.analysis.detectedBass}
                    isBassEstimated={processor.analysis.isBassEstimated}
                    onReanalyze={processor.reanalyze}
                    presets={processor.presets}
                    variant="embedded"
                 />
             </div>
          ) : (
            /* DASHBOARD VIEW */
            <div className={`max-w-[1600px] mx-auto space-y-6 md:space-y-8 transition-all duration-300`}>

              {/* Visualizer Section */}
              <div className="relative">
                 {processor.processState === 'idle' && !processor.file && (
                   <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                     <div className="flex flex-col items-center gap-3 opacity-60">
                       <div className="w-3 h-3 bg-blue-500 animate-ping rounded-full"></div>
                       <p className="text-blue-500 font-mono text-xs tracking-[0.5em] uppercase">System Ready</p>
                     </div>
                   </div>
                 )}
                 
                 {processor.isComparing && (
                     <div className="absolute top-0 right-0 z-40 bg-amber-500 text-black text-[10px] font-bold px-2 py-1 tracking-widest shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse border-l-2 border-black">
                         BYPASS
                     </div>
                 )}

                 {processor.processState === 'analyzing' && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm border border-blue-500/30">
                      <Activity className="text-blue-500 animate-pulse mb-6 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]" size={48} />
                      <h3 className="text-xl font-bold text-white mb-2 tracking-[0.2em] uppercase text-center">Scanning</h3>
                      <div className="w-48 md:w-64 h-px bg-slate-800 mb-4 overflow-hidden relative">
                        <div className="absolute top-0 bottom-0 w-20 bg-blue-500 animate-[shimmer_1s_infinite] shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                      </div>
                      <div className="font-mono text-blue-400 text-[10px] tracking-widest flex gap-4">
                         <span>CALC_PHASE</span>
                      </div>
                    </div>
                 )}

                <Visualizer 
                  isPlaying={processor.isPlaying || processor.processState === 'analyzing'} 
                  fundamentalHz={displayedPitch} 
                  bassHz={displayedBass}
                  cymaticsMode={processor.audioSettings.cymaticsMode}
                  phaseLockEnabled={processor.audioSettings.phaseLockEnabled}
                  deepZenBass={processor.audioSettings.deepZenBass}
                />
              </div>

              {/* Controls or Upload */}
              {!processor.file ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <FileUpload 
                     onFileSelect={processor.loadFile} 
                     onUrlImport={processor.loadFromUrl}
                     isLoading={processor.processState === 'decoding'} 
                   />
                </div>
              ) : (
                <div className={`space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-30 ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}>
                  <ControlPanel 
                    isPlaying={processor.isPlaying}
                    targetFrequency={processor.tuningPreset}
                    onPlayPause={processor.togglePlay}
                    onTuningChange={processor.setTuningPreset}
                    onDownload={processor.download}
                    isDownloading={processor.isDownloading}
                    fileName={processor.file.name}
                    thdValue={processor.analysis.currentTHD}
                    isComparing={processor.isComparing}
                    crossfadeValue={processor.crossfadeValue}
                    onCrossfadeChange={processor.setCrossfadeValue}
                    batchCount={processor.batchQueue.length}
                    activePresetName={activePresetName}
                    spectralBalanceScore={processor.analysis.spectralBalanceScore}
                  />

                  {/* Info Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Source Analysis Card */}
                      <div className={`
                        tech-panel p-6 flex flex-col transition-all duration-300 group
                        ${processor.tuningPreset === TuningPreset.STANDARD_440 ? 'border-blue-500/30' : ''}
                      `}>
                        <div className="flex justify-between items-start mb-4 pb-2 border-b border-white/5">
                          <h4 className="text-blue-400 text-[10px] flex items-center gap-2 uppercase tracking-[0.2em]">
                            [INPUT_ANALYSIS]
                          </h4>
                          <button 
                            onClick={() => setShowLocalSettings(!showLocalSettings)}
                            className={`p-1 transition-colors ${showLocalSettings ? 'text-blue-400' : 'text-slate-600 hover:text-white'}`}
                          >
                            <Maximize2 size={14} />
                          </button>
                        </div>

                        <div className="flex flex-col gap-4 mb-4">
                          <div className="flex justify-between items-end">
                            <span className="text-slate-500 text-[10px] uppercase tracking-wider">Inherent Pitch</span>
                            <span className="text-white font-bold text-xl font-mono leading-none tracking-tighter">
                                {processor.analysis.detectedPitch.toFixed(2)} <span className="text-[10px] text-slate-500">HZ</span>
                            </span>
                          </div>
                          
                          {processor.analysis.detectedBass > 0 && (
                            <div className="flex justify-between items-end">
                              <span className="text-slate-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                  Fund. {processor.analysis.isBassEstimated && <span className="text-amber-500">*</span>}
                              </span>
                              <div className="text-right flex items-baseline gap-2">
                                  <span className="text-[10px] text-slate-600 font-mono">
                                    {processor.helpers.getNoteName(processor.analysis.detectedBass)}
                                  </span>
                                  <span className="text-slate-300 font-bold text-xl font-mono leading-none tracking-tighter">
                                    {processor.analysis.detectedBass.toFixed(1)} <span className="text-[10px] text-slate-500">HZ</span>
                                  </span>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Mini Re-Analyze Panel Inline */}
                        {showLocalSettings && (
                          <div className="mt-2 mb-4 pt-4 border-t border-dashed border-white/10 animate-in slide-in-from-top-2 fade-in space-y-4">
                              <div>
                                  <div className="flex items-center justify-between mb-2">
                                      <label className="text-[9px] text-slate-500 font-mono uppercase">Detect.Sensitivity</label>
                                      <span className="text-[9px] text-blue-400 font-mono">VAL:{processor.sensitivity}</span>
                                  </div>
                                  <input 
                                      type="range" min="0" max="100" value={processor.sensitivity} 
                                      onChange={(e) => processor.setSensitivity(Number(e.target.value))}
                                      className="tech-slider"
                                  />
                              </div>
                              <button 
                                  onClick={processor.reanalyze}
                                  disabled={processor.isReanalyzing}
                                  className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] uppercase tracking-widest py-2 border border-blue-500/20 transition-colors flex items-center justify-center gap-2"
                              >
                                  <RefreshCw size={10} className={processor.isReanalyzing ? "animate-spin" : ""} />
                                  Re-Scan Buffer
                              </button>
                          </div>
                        )}
                        
                        <div className="flex gap-2 mt-auto pt-4 border-t border-white/5">
                          <span className="text-[9px] bg-white/5 px-2 py-1 text-slate-500 font-mono border border-white/5">
                              SR:{processor.helpers.sampleRate}
                          </span>
                          {processor.analysis.hasHiResContent ? (
                            <span className="text-[9px] flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-1 border border-blue-500/20 font-mono">
                                <Waves size={10} /> HI-RES
                            </span>
                          ) : (
                            <span className="text-[9px] flex items-center gap-1 bg-white/5 text-slate-500 px-2 py-1 border border-white/5 font-mono">
                                STD_RES
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Target Output Card */}
                      <div className={`
                        tech-panel p-6 flex flex-col justify-between transition-all duration-300
                        ${processor.tuningPreset !== TuningPreset.STANDARD_440 ? 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : ''}
                      `}>
                        <div>
                          <h4 className="text-blue-400 font-medium mb-4 pb-2 border-b border-white/5 text-[10px] flex justify-between items-center uppercase tracking-[0.2em] opacity-80">
                            [OUTPUT_TARGET]
                            {processor.tuningPreset !== TuningPreset.STANDARD_440 && <div className="w-1.5 h-1.5 bg-blue-500 animate-pulse" />}
                          </h4>
                          
                          <div className="mb-6 flex justify-between items-end">
                              <div className="flex flex-col">
                                  <div className="text-[10px] text-slate-500 font-mono mb-1">TARGET_FREQ</div>
                                  <div className={`text-3xl font-bold font-mono tracking-tighter ${processor.isComparing ? 'text-slate-600 line-through' : 'text-white text-glow'}`}>
                                      {processor.isComparing ? processor.analysis.detectedPitch.toFixed(1) : processor.tuningPreset} <span className="text-lg opacity-50 font-sans">Hz</span>
                                  </div>
                              </div>
                              <div className="text-[10px] text-blue-500 font-mono tracking-widest uppercase border border-blue-500/20 px-2 py-1 bg-blue-500/5">
                                  {processor.isComparing ? "BYPASS" : `MODE:${TuningPreset[processor.tuningPreset]}`}
                              </div>
                          </div>
                          
                          <div className="space-y-3 font-mono">
                              <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-600 uppercase">Pitch Delta</span>
                                  <span className="text-blue-300">{processor.isComparing ? "0.00%" : processor.helpers.getShiftPercentage()}</span>
                              </div>
                              <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-600 uppercase">Time Dilation</span>
                                  <span className="text-blue-300">{processor.isComparing ? "0.00s" : processor.helpers.getAddedTime()}</span>
                              </div>
                              <div className="w-full h-px bg-white/5 my-2"></div>
                              <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-600 uppercase">DSP Status</span>
                                  <span className="text-emerald-500">ACTIVE</span>
                              </div>
                          </div>
                        </div>
                      </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
      </div>

      {/* BOTTOM MOBILE NAVIGATION (Only on < md) */}
      <MobileNav 
        hasFile={!!processor.file} 
        activeView={activeView}
        onNavigate={setActiveView}
        onReset={handleReset}
      />

      {/* SYSTEM LOG CONSOLE */}
      <DebugConsole 
        isOpen={showDebug} 
        onClose={() => setShowDebug(false)} 
      />

    </div>
  );
};

export default App;