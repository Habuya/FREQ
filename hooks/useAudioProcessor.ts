









import { useState, useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';
import { cacheService } from '../services/cacheService';
import { TuningPreset, AudioSettings, ProcessState } from '../types';
import JSZip from 'jszip';

export const useAudioProcessor = () => {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [processState, setProcessState] = useState<ProcessState>('idle');
  const [isDownloading, setIsDownloading] = useState(false);
  const [tuningPreset, setTuningPreset] = useState<TuningPreset>(TuningPreset.STANDARD_440);
  const [duration, setDuration] = useState<number>(0);
  
  // Batch Processing State
  const [batchQueue, setBatchQueue] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);

  // Analysis State
  const [hasHiResContent, setHasHiResContent] = useState<boolean>(false);
  const [detectedPitch, setDetectedPitch] = useState<number>(440);
  const [detectedBass, setDetectedBass] = useState<number>(0);
  const [isCachedResult, setIsCachedResult] = useState<boolean>(false);
  const [isBufferCached, setIsBufferCached] = useState<boolean>(false);
  
  // A/B Compare State
  const [isComparing, setIsComparing] = useState<boolean>(false);

  // Real-time Metrics
  const [currentTHD, setCurrentTHD] = useState<number>(0);
  const thdIntervalRef = useRef<number | null>(null);

  // Settings State
  const [sensitivity, setSensitivity] = useState<number>(50);
  const [bassSensitivity, setBassSensitivity] = useState<number>(50);
  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false);
  
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    fftSize: 8192,
    smoothingTimeConstant: 0.8,
    saturationType: 'tube',
    bypassBody: false,
    bypassResonance: false,
    bypassAir: false,
    stereoWidth: 1.0,
    sacredGeometryMode: false,
    // Phase 2 Defaults
    fibonacciAlignment: false,
    phaseLockEnabled: false,
    cymaticsMode: false,
    binauralMode: false,
    binauralBeatFreq: 8,
    // Phase 3 Defaults
    harmonicWarmth: 0.0,
    harmonicClarity: 0.0,
    // Phase 4 Defaults
    deepZenBass: 0.0
  });

  // Actions
  const updateSettings = (newSettings: AudioSettings) => {
    setAudioSettings(newSettings);
    audioService.updateVisualizerSettings(newSettings.fftSize, newSettings.smoothingTimeConstant);
    
    if (newSettings.saturationType !== audioSettings.saturationType) {
        audioService.setSaturationType(newSettings.saturationType);
    }
    
    // ZenSpace Width Control
    audioService.setStereoWidth(newSettings.stereoWidth);
    
    // Sacred Geometry Mode
    audioService.setSacredGeometryMode(newSettings.sacredGeometryMode);
    
    // Phase 2 Settings
    audioService.setFibonacciAlignment(newSettings.fibonacciAlignment);
    audioService.setPhaseLockEnabled(newSettings.phaseLockEnabled);
    audioService.setBinauralMode(newSettings.binauralMode, newSettings.binauralBeatFreq);
    
    // Phase 3: Harmonic Shaping
    audioService.setHarmonicShaping(newSettings.harmonicWarmth, newSettings.harmonicClarity);
    
    // Phase 4: Psychoacoustic Bass
    audioService.setDeepZenBass(newSettings.deepZenBass);

    audioService.setEQBypass({
      body: newSettings.bypassBody,
      resonance: newSettings.bypassResonance,
      air: newSettings.bypassAir
    });
  };

  const loadFile = async (files: File[]) => {
    if (!files || files.length === 0) return;
    
    // Store full batch for later processing
    setBatchQueue(files);

    const selectedFile = files[0]; // Currently handling single file from the batch for preview

    try {
      setProcessState('decoding');
      audioService.stop();
      setIsPlaying(false);
      setSensitivity(50);
      setBassSensitivity(50);
      setIsCachedResult(false);
      setIsBufferCached(false);
      setDetectedBass(0);
      setCurrentTHD(0);
      setIsComparing(false); // Reset comparison mode
      
      // 1. Buffer Cache Handling
      const cachedBufferData = await cacheService.loadBuffer(selectedFile);
      
      if (cachedBufferData) {
         console.log("Audio Buffer loaded from IndexedDB cache");
         const buffer = audioService.createBufferFromData(cachedBufferData);
         audioService.setAudioBuffer(buffer);
         setIsBufferCached(true);
      } else {
         await audioService.loadFile(selectedFile);
         const buffer = audioService.getAudioBuffer();
         if (buffer) {
             const channels: Float32Array[] = [];
             for(let i=0; i<buffer.numberOfChannels; i++) {
                 channels.push(buffer.getChannelData(i));
             }
             cacheService.saveBuffer(selectedFile, {
                 sampleRate: buffer.sampleRate,
                 channels
             }).catch(err => console.warn("Background cache save failed", err));
         }
      }
      
      setFile(selectedFile);
      setDuration(audioService.getDuration());

      // Apply settings to new context
      updateSettings(audioSettings);

      // 2. Analysis Cache Handling
      const cachedAnalysis = await cacheService.loadAnalysis(selectedFile, 50);

      if (cachedAnalysis) {
        console.log("Analysis loaded from cache");
        setHasHiResContent(cachedAnalysis.isHiRes);
        setDetectedPitch(cachedAnalysis.pitch);
        audioService.setSourceReferencePitch(cachedAnalysis.pitch);
        
        if (cachedAnalysis.bassPitch) setDetectedBass(cachedAnalysis.bassPitch);
        if (cachedAnalysis.bassSensitivity !== undefined) setBassSensitivity(cachedAnalysis.bassSensitivity);

        setIsCachedResult(true);
        setTuningPreset(TuningPreset.STANDARD_440);
        setProcessState('ready');
      } else {
        setProcessState('analyzing');
        await new Promise(resolve => setTimeout(resolve, 1200));

        const isHiRes = await audioService.detectHighFrequencies();
        setHasHiResContent(isHiRes);

        const detected = await audioService.detectInherentTuning(50);
        audioService.setSourceReferencePitch(detected);
        setDetectedPitch(detected);

        const bassFreq = await audioService.detectBassRoot(50);
        setDetectedBass(bassFreq);

        await cacheService.saveAnalysis(selectedFile, {
          pitch: detected,
          bassPitch: bassFreq,
          isHiRes: isHiRes,
          sensitivity: 50,
          bassSensitivity: 50
        });

        setTuningPreset(TuningPreset.STANDARD_440); 
        setProcessState('ready');
      }
      
    } catch (error) {
      console.error("Error loading file:", error);
      alert("Could not load audio file.");
      setProcessState('idle');
    }
  };

  const reanalyze = async () => {
    if (!audioService.getDuration() || !file) return;
    
    setIsReanalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const detected = await audioService.detectInherentTuning(sensitivity);
    audioService.setSourceReferencePitch(detected);
    
    const bassFreq = await audioService.detectBassRoot(bassSensitivity);
    
    setDetectedPitch(detected);
    setDetectedBass(bassFreq);
    setIsCachedResult(false);
    
    await cacheService.saveAnalysis(file, {
        pitch: detected,
        bassPitch: bassFreq,
        isHiRes: hasHiResContent,
        sensitivity: sensitivity,
        bassSensitivity: bassSensitivity
    });
    
    setIsReanalyzing(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioService.pause();
      setIsPlaying(false);
    } else {
      audioService.play(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  // Toggle A/B Comparison
  const toggleCompare = (active: boolean) => {
      setIsComparing(active);
      audioService.toggleBypass(active);
  };

  // THD Polling Loop
  useEffect(() => {
    if (isPlaying) {
        thdIntervalRef.current = window.setInterval(() => {
            const val = audioService.calculateTHD();
            if (val !== -1) { // -1 means throttled
                // Smooth interpolation for visual stability
                setCurrentTHD(prev => prev + (val - prev) * 0.2);
            }
        }, 150);
    } else {
        if (thdIntervalRef.current) clearInterval(thdIntervalRef.current);
        setCurrentTHD(0);
    }

    return () => {
        if (thdIntervalRef.current) clearInterval(thdIntervalRef.current);
    };
  }, [isPlaying]);

  const changeTuningPreset = (preset: TuningPreset) => {
    if (preset === tuningPreset) return;
    setTuningPreset(preset);
    audioService.setTargetFrequency(preset);
  };

  const download = async () => {
    if (!file && batchQueue.length === 0) return;

    try {
      setIsDownloading(true);
      
      // Check if Batch Mode
      if (batchQueue.length > 1) {
          const zip = new JSZip();
          setBatchProgress({ current: 0, total: batchQueue.length });
          
          for (let i = 0; i < batchQueue.length; i++) {
              const currentFile = batchQueue[i];
              setBatchProgress({ current: i + 1, total: batchQueue.length });
              
              // We need to determine the Pitch/Bass for each file if not already analyzed
              // This is a simplified batch flow that analyzes on fly or uses default
              
              // 1. Decode Offline
              const buffer = await audioService.decodeFileOffline(currentFile);
              
              // 2. Quick Analyze (or load cache)
              // Note: For true batching, we might skip deep analysis for speed and assume 440 or use standard detect
              // Here we try to load cache first
              let filePitch = 440;
              let fileBass = 0;
              
              const cached = await cacheService.loadAnalysis(currentFile, 50);
              if (cached) {
                  filePitch = cached.pitch;
                  fileBass = cached.bassPitch || 0;
              } else {
                  // Fallback: If not analyzing every file, we assume standard A440 for batch speed
                  // or we could run the worker. For now, assume 440 to avoid massive wait times on main thread
                  // unless we implement full queue worker logic.
                  filePitch = 440; 
              }

              // 3. Process
              const blob = await audioService.processOffline(
                  buffer, 
                  tuningPreset, 
                  fileBass, 
                  filePitch,
                  audioSettings // Pass current settings for harmonic shaping & deep zen bass
              );
              
              const originalName = currentFile.name.replace(/\.[^/.]+$/, "");
              const suffix = `_${tuningPreset}Hz_ZenTuner.wav`;
              zip.file(`${originalName}${suffix}`, blob);
          }
          
          const content = await zip.generateAsync({type: "blob"});
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ZenTuner_Batch_${tuningPreset}Hz.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
      } else {
          // Single File Export (Previous Logic)
          await new Promise(resolve => setTimeout(resolve, 50));
          const blob = await audioService.exportAudio(tuningPreset, audioSettings);
          
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
          const originalName = file!.name.replace(/\.[^/.]+$/, "");
          const suffix = `_${tuningPreset}Hz_ZenMaster.wav`;
          a.download = `${originalName}${suffix}`;
          
          document.body.appendChild(a);
          a.click();
          
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }

    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export audio.");
    } finally {
      setIsDownloading(false);
      setBatchProgress(null);
    }
  };

  const reset = () => {
    setFile(null);
    setBatchQueue([]);
    setProcessState('idle');
    setSensitivity(50);
    audioService.stop();
  };

  // Helpers
  const getAddedTime = () => {
    if (!duration) return "0.00s";
    const ratio = tuningPreset / (detectedPitch || 440);
    const newDuration = duration / ratio;
    const diff = newDuration - duration;
    const sign = diff >= 0 ? "+" : "";
    return sign + diff.toFixed(2) + "s";
  };
  
  const getShiftPercentage = () => {
      const ratio = tuningPreset / (detectedPitch || 440);
      const percent = (1 - ratio) * 100;
      const sign = percent >= 0 ? "-" : "+";
      return sign + Math.abs(percent).toFixed(2) + "%";
  };

  return {
    file,
    isPlaying,
    processState,
    isDownloading,
    batchQueue,
    batchProgress,
    tuningPreset,
    audioSettings,
    analysis: {
      hasHiResContent,
      detectedPitch,
      detectedBass,
      isCachedResult,
      isBufferCached,
      currentTHD
    },
    isComparing,
    toggleCompare,
    sensitivity,
    setSensitivity,
    bassSensitivity,
    setBassSensitivity,
    isReanalyzing,
    loadFile,
    reanalyze,
    togglePlay,
    setTuningPreset: changeTuningPreset,
    download,
    updateSettings,
    reset,
    helpers: {
      getAddedTime,
      getShiftPercentage,
      getNoteName: audioService.getNoteName.bind(audioService),
      sampleRate: audioService.getFormatInfo()?.sampleRate
    }
  };
};