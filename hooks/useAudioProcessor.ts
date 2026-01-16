
import { useState, useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';
import { cacheService } from '../services/cacheService';
import { TuningPreset, AudioSettings, ProcessState } from '../types';

export const useAudioProcessor = () => {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [processState, setProcessState] = useState<ProcessState>('idle');
  const [isDownloading, setIsDownloading] = useState(false);
  const [tuningPreset, setTuningPreset] = useState<TuningPreset>(TuningPreset.STANDARD_440);
  const [duration, setDuration] = useState<number>(0);
  
  // Analysis State
  const [hasHiResContent, setHasHiResContent] = useState<boolean>(false);
  const [detectedPitch, setDetectedPitch] = useState<number>(440);
  const [detectedBass, setDetectedBass] = useState<number>(0);
  const [isCachedResult, setIsCachedResult] = useState<boolean>(false);
  const [isBufferCached, setIsBufferCached] = useState<boolean>(false);
  
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
    sacredGeometryMode: false
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
    
    audioService.setEQBypass({
      body: newSettings.bypassBody,
      resonance: newSettings.bypassResonance,
      air: newSettings.bypassAir
    });
  };

  const loadFile = async (files: File[]) => {
    if (!files || files.length === 0) return;
    const selectedFile = files[0]; // Currently handling single file from the batch

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
    // Updated to use the new method name in AudioService
    audioService.setTargetFrequency(preset);
  };

  const download = async () => {
    if (!file) return;
    try {
      setIsDownloading(true);
      await new Promise(resolve => setTimeout(resolve, 50));

      const blob = await audioService.exportAudio(tuningPreset);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const originalName = file.name.replace(/\.[^/.]+$/, "");
      const suffix = `_${tuningPreset}Hz_Mastered`;
      a.download = `${originalName}${suffix}.wav`;
      
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export audio.");
    } finally {
      setIsDownloading(false);
    }
  };

  const reset = () => {
    setFile(null);
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
