

import React, { useState } from 'react';
import Visualizer from './components/Visualizer';
import ControlPanel from './components/ControlPanel';
import FileUpload from './components/FileUpload';
import SettingsModal from './components/SettingsModal';
import { TuningPreset, TUNING_LABELS } from './types';
import { useAudioProcessor } from './hooks/useAudioProcessor';
import { Sparkles, Info, Github, Clock, Activity, Settings2, ShieldCheck, Waves, Music2, RefreshCw, Zap, ArrowRight, Settings, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  // Use the new Audio Processor Hook
  const processor = useAudioProcessor();

  // Local UI State (Not related to Audio Logic)
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);

  // Derived Values for UI
  const isAlreadyNatureTuned = processor.analysis.detectedPitch < 435 && processor.analysis.detectedPitch > 410;
  
  // Calculate the displayed frequencies based on active preset
  // If comparing, show Source Pitch, else show Target
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
  
  // Resolve active preset name
  const activePresetName = processor.presets.list.find(p => p.id === processor.presets.currentId)?.name;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white selection:bg-indigo-500 selection:text-white">
      {/* Background Gradient Orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Batch Processing Overlay */}
      {processor.batchProgress && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
             <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm w-full">
                 <Loader2 size={48} className="text-indigo-400 animate-spin mb-4" />
                 <h2 className="text-xl font-bold text-white mb-2">Processing Batch</h2>
                 <p className="text-slate-400 text-sm mb-6">Optimizing harmonics & dithering...</p>
                 
                 <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
                     <div 
                        className="bg-indigo-500 h-full transition-all duration-300"
                        style={{ width: `${(processor.batchProgress.current / processor.batchProgress.total) * 100}%` }}
                     />
                 </div>
                 <div className="flex justify-between w-full text-xs font-mono text-slate-500">
                     <span>Track {processor.batchProgress.current} of {processor.batchProgress.total}</span>
                     <span>{Math.round((processor.batchProgress.current / processor.batchProgress.total) * 100)}%</span>
                 </div>
             </div>
          </div>
      )}

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showGlobalSettings} 
        onClose={() => setShowGlobalSettings(false)}
        settings={processor.audioSettings}
        onUpdate={processor.updateSettings}
        detectedBass={processor.analysis.detectedBass}
        presets={processor.presets}
      />

      <main className="container mx-auto px-4 py-8 relative z-10 max-w-4xl">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Zen<span className="text-indigo-400">Tuner</span>
              </h1>
              <p className="text-xs text-slate-400 font-mono tracking-widest">
                AUDIOPHILE HARMONIZER
              </p>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <button 
                onClick={() => setShowGlobalSettings(true)}
                className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
                title="Global Audio Settings"
            >
              <Settings size={20} />
            </button>
            <div className="w-px h-6 bg-slate-700" />
            <button className="text-slate-400 hover:text-white transition-colors">
              <Github size={20} />
            </button>
            <button className="text-slate-400 hover:text-white transition-colors">
              <Info size={20} />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="space-y-8">
          
          {/* Visualizer Section */}
          <div className="relative">
             {processor.processState === 'idle' && !processor.file && (
               <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700">
                 <p className="text-slate-500 font-mono text-sm">VISUALIZATION STANDBY</p>
               </div>
             )}
             
             {/* Comparison Overlay */}
             {processor.isComparing && (
                 <div className="absolute top-4 right-4 z-40 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg animate-pulse">
                     BYPASS ACTIVE
                 </div>
             )}

             {/* Analysis State Overlay */}
             {processor.processState === 'analyzing' && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md rounded-xl border border-indigo-500/30">
                  <Activity className="text-indigo-400 animate-pulse mb-4" size={48} />
                  <h3 className="text-xl font-semibold text-white mb-2">Scanning Harmonic Content</h3>
                  <div className="w-64 h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 animate-[progress_1.5s_ease-in-out_infinite]"></div>
                  </div>
                  <p className="text-indigo-300 font-mono text-xs mt-3">ANALYZING PITCH REFERENCE...</p>
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
            <FileUpload onFileSelect={processor.loadFile} isLoading={processor.processState === 'decoding'} />
          ) : (
            <div className={`animate-in fade-in slide-in-from-bottom-4 duration-500 ${processor.processState !== 'ready' ? 'pointer-events-none opacity-50' : ''}`}>
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
                onToggleCompare={processor.toggleCompare}
                batchCount={processor.batchQueue.length}
                activePresetName={activePresetName}
              />

              {/* Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                
                {/* Source Analysis Card */}
                <div className={`
                  bg-slate-800/30 p-4 rounded-xl border transition-all duration-300 flex flex-col
                  ${processor.tuningPreset === TuningPreset.STANDARD_440 ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'border-slate-700'}
                `}>
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-indigo-400 font-medium text-sm flex items-center gap-2">
                      Original Source
                      {processor.tuningPreset === TuningPreset.STANDARD_440 && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">RAW</span>}
                    </h4>
                    <button 
                      onClick={() => setShowSettings(!showSettings)}
                      className={`p-1 rounded-md transition-colors ${showSettings ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300'}`}
                      title="Adjust Detection Sensitivity"
                    >
                      <Settings2 size={14} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex justify-between items-center p-2 bg-slate-900/40 rounded-lg border border-slate-700/50">
                      <span className="text-slate-400 text-xs">Detected Ref</span>
                      <span className="text-slate-200 font-bold text-sm font-mono">{processor.analysis.detectedPitch.toFixed(1)} Hz</span>
                    </div>
                    
                    {processor.analysis.detectedBass > 0 && (
                      <div className="flex justify-between items-center p-2 bg-lime-900/10 rounded-lg border border-lime-500/20">
                         <span className="text-slate-400 text-xs">Bass Root</span>
                         <span className="text-lime-400 font-bold text-sm font-mono flex gap-2">
                           {processor.analysis.detectedBass.toFixed(1)} Hz
                           <span className="opacity-50">|</span>
                           {processor.helpers.getNoteName(processor.analysis.detectedBass)}
                         </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Settings Panel Inline */}
                  {showSettings && (
                    <div className="mt-2 mb-3 pt-3 border-t border-slate-700/50 animate-in slide-in-from-top-2 fade-in space-y-3">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] text-slate-400 font-mono uppercase">Pitch Sens</label>
                                <span className="text-[10px] text-indigo-400">{processor.sensitivity}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="100" value={processor.sensitivity} 
                                onChange={(e) => processor.setSensitivity(Number(e.target.value))}
                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:rounded-full"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={processor.reanalyze}
                                disabled={processor.isReanalyzing}
                                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={12} className={processor.isReanalyzing ? "animate-spin" : ""} />
                                Re-Analyze
                            </button>
                        </div>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-2 mt-2 mb-auto">
                     <span className="text-[10px] border border-slate-600 rounded px-1 text-slate-500">
                        {processor.helpers.sampleRate}Hz
                     </span>
                     {processor.analysis.hasHiResContent ? (
                       <span className="text-[10px] flex items-center gap-1 bg-indigo-900/40 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                          <Waves size={10} /> Hi-Res
                       </span>
                     ) : (
                       <span className="text-[10px] flex items-center gap-1 bg-amber-900/30 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/30">
                          <Waves size={10} /> Std
                       </span>
                     )}
                  </div>
                </div>

                {/* Target Output Card */}
                <div className={`
                   bg-slate-800/30 p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between
                   ${processor.tuningPreset !== TuningPreset.STANDARD_440 ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10' : 'border-slate-700'}
                `}>
                  <div>
                    <h4 className="text-emerald-400 font-medium mb-1 text-sm flex justify-between items-center">
                      Processed Output
                      {processor.tuningPreset !== TuningPreset.STANDARD_440 && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">ACTIVE</span>}
                    </h4>
                    
                    <div className="mb-3">
                         <div className={`text-2xl font-bold font-mono tracking-tight ${processor.isComparing ? 'text-amber-500 line-through decoration-slate-500' : 'text-white'}`}>
                             {processor.isComparing ? processor.analysis.detectedPitch.toFixed(1) : processor.tuningPreset} Hz
                         </div>
                         <div className="text-xs text-slate-400">
                             {processor.isComparing ? "BYPASSED (ORIGINAL)" : TUNING_LABELS[processor.tuningPreset]}
                         </div>
                    </div>
                    
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs border-b border-slate-700/50 pb-1 mb-1">
                            <span className="text-slate-500">Pitch Shift</span>
                            <span className="text-emerald-300 font-mono">{processor.isComparing ? "0%" : processor.helpers.getShiftPercentage()}</span>
                        </div>
                        <div className="flex justify-between text-xs border-b border-slate-700/50 pb-1 mb-1">
                            <span className="text-slate-500">Time Dilation</span>
                            <span className="text-emerald-300 font-mono">{processor.isComparing ? "0s" : processor.helpers.getAddedTime()}</span>
                        </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
                    <span className="text-[10px] flex items-center gap-1 text-emerald-400/80 bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          <ShieldCheck size={10} /> DITHERED
                    </span>
                    {processor.tuningPreset !== TuningPreset.STANDARD_440 && (
                        <span className="text-[10px] flex items-center gap-1 text-purple-400/80 bg-purple-900/20 px-1.5 py-0.5 rounded border border-purple-500/20">
                            <Settings2 size={10} /> SATURATED
                        </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                 <button 
                  onClick={processor.reset}
                  className="text-xs text-slate-500 hover:text-slate-300 underline"
                 >
                   Upload different track
                 </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;