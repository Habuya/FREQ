
import { useState, useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';
import { cacheService } from '../services/cacheService';
import { TuningPreset, AudioSettings, ProcessState, MasteringPreset } from '../types';
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
  const [isBassEstimated, setIsBassEstimated] = useState<boolean>(false);
  const [isCachedResult, setIsCachedResult] = useState<boolean>(false);
  const [isBufferCached, setIsBufferCached] = useState<boolean>(false);
  
  // DJ Crossfade State
  const [crossfadeValue, setCrossfadeValue] = useState<number>(1.0); // 1.0 = Fully Processed (Pi 23)

  // Real-time Metrics
  const [currentTHD, setCurrentTHD] = useState<number>(0);
  const [spectralBalanceScore, setSpectralBalanceScore] = useState<number>(100);
  const thdIntervalRef = useRef<number | null>(null);

  // Mount tracking
  const isMounted = useRef(true);

  // Settings State
  const [sensitivity, setSensitivity] = useState<number>(50);
  const [bassSensitivity, setBassSensitivity] = useState<number>(50);
  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false);
  
  // Presets State
  const [presets, setPresets] = useState<MasteringPreset[]>([]);
  const [currentPresetId, setCurrentPresetId] = useState<string>('factory_clean');
  
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
    timbreMorph: 1.0,
    // Phase 4 Defaults
    deepZenBass: 0.0,
    spaceResonance: 0.0,
    roomScale: 0.5,
    breathingEnabled: false,
    breathingIntensity: 0.0,
    // Phase 5 Defaults
    autoEqEnabled: false,
    autoEqIntensity: 0.5
  });

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
        isMounted.current = false;
        audioService.stop();
    };
  }, []);

  // Load presets on mount
  useEffect(() => {
    cacheService.getAllPresets().then(loadedPresets => {
        if (isMounted.current) {
            setPresets(loadedPresets);
        }
    });
  }, []);

  // Actions
  const updateSettings = (newSettings: AudioSettings) => {
    setAudioSettings(newSettings);
    // If settings change manually, we are technically no longer on the preset "cleanly"
    // but we keep the ID for reference unless logic dictates setting it to null
    
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
    
    // Phase 3: Harmonic Shaping & Timbre Morph
    audioService.setHarmonicShaping(newSettings.harmonicWarmth, newSettings.harmonicClarity, newSettings.timbreMorph);
    
    // Phase 4: Psychoacoustic Bass & Harmonic Reverb & Breathing
    audioService.setDeepZenBass(newSettings.deepZenBass);
    audioService.setSpaceResonance(newSettings.spaceResonance);
    audioService.setRoomScale(newSettings.roomScale);
    audioService.setBreathingEnabled(newSettings.breathingEnabled, newSettings.breathingIntensity);
    
    // Phase 5: Auto-EQ
    audioService.setAutoEqEnabled(newSettings.autoEqEnabled);

    audioService.setEQBypass({
      body: newSettings.bypassBody,
      resonance: newSettings.bypassResonance,
      air: newSettings.bypassAir
    });
  };

  const savePreset = async (name: string) => {
      const newPreset: MasteringPreset = {
          id: `custom_${Date.now()}`,
          name: name,
          isFactory: false,
          data: { ...audioSettings }, // Snapshot
          createdAt: Date.now()
      };
      
      await cacheService.savePreset(newPreset);
      const updatedList = await cacheService.getAllPresets();
      if (isMounted.current) {
        setPresets(updatedList);
        setCurrentPresetId(newPreset.id);
      }
  };

  const deletePreset = async (id: string) => {
      await cacheService.deletePreset(id);
      const updatedList = await cacheService.getAllPresets();
      if (isMounted.current) {
        setPresets(updatedList);
        if (currentPresetId === id) {
            setCurrentPresetId(updatedList[0]?.id || '');
            if (updatedList[0]) updateSettings(updatedList[0].data);
        }
      }
  };

  const loadPreset = (id: string) => {
      const preset = presets.find(p => p.id === id);
      if (preset) {
          setCurrentPresetId(id);
          updateSettings(preset.data);
      }
  };

  // --- URL IMPORT LOGIC (New) ---
  const loadFromUrl = async (url: string) => {
      try {
          setProcessState('decoding');
          
          // Simulated extraction delay
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Check if it's a supported direct audio link (basic check)
          const isDirectAudio = url.match(/\.(mp3|wav|ogg|m4a)$/i);
          
          if (isDirectAudio) {
              try {
                  const response = await fetch(url);
                  if (!response.ok) throw new Error("Fetch failed");
                  const blob = await response.blob();
                  const filename = url.split('/').pop() || "imported_track.mp3";
                  const file = new File([blob], filename, { type: blob.type });
                  await loadFile([file]);
                  return;
              } catch (e) {
                  // Fall through to error
                  console.warn("Direct fetch failed, likely CORS", e);
              }
          }

          // If we reach here, it's either a streaming link (YouTube/Spotify) or CORS blocked
          // Since we don't have a backend proxy, we must inform the user.
          if (isMounted.current) setProcessState('idle');
          alert("Backend Service Unavailable: \n\nDirect import from YouTube/Spotify requires a server-side extraction proxy to bypass CORS and DRM. \n\nThis feature is implemented in the UI for demonstration purposes. Please use the 'Upload' tab with local files.");
          
      } catch (e) {
          console.error("URL Import Error", e);
          if (isMounted.current) setProcessState('idle');
          alert("Failed to import from URL.");
      }
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
      setIsBassEstimated(false);
      setCurrentTHD(0);
      setSpectralBalanceScore(100);
      setCrossfadeValue(1.0); // Reset to Wet (Processed)
      audioService.setCrossfade(1.0);
      
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
        
        if (cachedAnalysis.bassPitch) {
            setDetectedBass(cachedAnalysis.bassPitch);
            // Restore estimation flag from cache if available
            if (cachedAnalysis.isBassEstimated !== undefined) {
                setIsBassEstimated(cachedAnalysis.isBassEstimated);
            } else {
                // Heuristic: if exactly 60, assume estimated for safety if undefined
                setIsBassEstimated(cachedAnalysis.bassPitch === 60); 
            }
        }
        
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
        setIsBassEstimated(audioService.isBassEstimated);

        await cacheService.saveAnalysis(selectedFile, {
          pitch: detected,
          bassPitch: bassFreq,
          isHiRes: isHiRes,
          sensitivity: 50,
          bassSensitivity: 50,
          isBassEstimated: audioService.isBassEstimated
        });

        setTuningPreset(TuningPreset.STANDARD_440); 
        setProcessState('ready');
      }
      
    } catch (error) {
      console.error("Error loading file:", error);
      alert("Could not load audio file.");
      if (isMounted.current) setProcessState('idle');
    }
  };

  const reanalyze = async () => {
    if (!audioService.getDuration() || !file) return;
    
    setIsReanalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const detected = await audioService.detectInherentTuning(sensitivity);
    audioService.setSourceReferencePitch(detected);
    
    const bassFreq = await audioService.detectBassRoot(bassSensitivity);
    
    if (isMounted.current) {
        setDetectedPitch(detected);
        setDetectedBass(bassFreq);
        setIsBassEstimated(audioService.isBassEstimated);
        setIsCachedResult(false);
    }
    
    await cacheService.saveAnalysis(file, {
        pitch: detected,
        bassPitch: bassFreq,
        isHiRes: hasHiResContent,
        sensitivity: sensitivity,
        bassSensitivity: bassSensitivity,
        isBassEstimated: audioService.isBassEstimated
    });
    
    if (isMounted.current) setIsReanalyzing(false);
  };

  const togglePlay = async () => {
    // Explicitly resume on user interaction to satisfy browser policies
    await audioService.resumeContext();

    if (isPlaying) {
      audioService.pause();
      setIsPlaying(false);
    } else {
      audioService.play(() => {
          // Guard state update
          if (isMounted.current) setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  };

  // Metrics Polling Loop
  useEffect(() => {
    if (isPlaying) {
        thdIntervalRef.current = window.setInterval(() => {
            // THD
            const thd = audioService.calculateTHD();
            if (thd !== -1 && isMounted.current) { 
                setCurrentTHD(prev => prev + (thd - prev) * 0.2);
            }
            
            // Spectral Balance Score (only if active or just visualization)
            const score = audioService.getSpectralBalanceScore();
            if (isMounted.current) {
                setSpectralBalanceScore(prev => prev + (score - prev) * 0.1); 
            }

        }, 150);
    } else {
        if (thdIntervalRef.current) clearInterval(thdIntervalRef.current);
        if (isMounted.current) setCurrentTHD(0);
        // Don't reset score to 0 on pause, keep last known or default 100
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

  // Crossfade Handler
  const handleCrossfade = (val: number) => {
      // Magnetic Snap Logic
      let newVal = val;
      if (Math.abs(val - 0.5) < 0.05) newVal = 0.5;
      if (val < 0.02) newVal = 0;
      if (val > 0.98) newVal = 1.0;
      
      setCrossfadeValue(newVal);
      audioService.setCrossfade(newVal);
      
      // Haptic on Snap
      if (newVal !== val && navigator.vibrate) {
          navigator.vibrate(10);
      }
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
              if (!isMounted.current) break;
              const currentFile = batchQueue[i];
              setBatchProgress({ current: i + 1, total: batchQueue.length });
              
              // 1. Decode Offline
              const buffer = await audioService.decodeFileOffline(currentFile);
              
              // 2. Smart Analysis (Cache -> On-Fly Fallback)
              let filePitch = 440;
              let fileBass = 0;
              let phaseOffset = 0;
              
              const cached = await cacheService.loadAnalysis(currentFile, sensitivity); // Use current sensitivity settings

              if (cached) {
                  filePitch = cached.pitch;
                  fileBass = cached.bassPitch || 0;
                  // Note: Phase offset isn't cached in DB currently, so we might re-detect if needed for perfection
                  if (audioSettings.phaseLockEnabled && fileBass > 20) {
                      phaseOffset = await audioService.detectPhase(buffer, fileBass);
                  }
              } else {
                  // Fallback: Analyze On-Fly (Batch Quality Assurance)
                  // Passing 'false' to updateState so we don't disrupt the main UI/Visualizer
                  filePitch = await audioService.detectInherentTuning(sensitivity, buffer);
                  fileBass = await audioService.detectBassRoot(bassSensitivity, buffer, false);
                  
                  if (audioSettings.phaseLockEnabled && fileBass > 20) {
                      phaseOffset = await audioService.detectPhase(buffer, fileBass);
                  }
              }

              // 3. Process with per-file harmonics
              const blob = await audioService.processOffline(
                  buffer, 
                  tuningPreset, 
                  fileBass, 
                  filePitch,
                  audioSettings,
                  phaseOffset
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
      if (isMounted.current) {
        setIsDownloading(false);
        setBatchProgress(null);
      }
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
    presets: {
        list: presets,
        currentId: currentPresetId,
        load: loadPreset,
        save: savePreset,
        delete: deletePreset
    },
    analysis: {
      hasHiResContent,
      detectedPitch,
      detectedBass,
      isBassEstimated, // Exposed state
      isCachedResult,
      isBufferCached,
      currentTHD,
      spectralBalanceScore
    },
    // Crossfade (was isComparing)
    crossfadeValue,
    setCrossfadeValue: handleCrossfade,
    isComparing: crossfadeValue < 0.5, // Derived state for visualizer bypass labels
    
    sensitivity,
    setSensitivity,
    bassSensitivity,
    setBassSensitivity,
    isReanalyzing,
    loadFile,
    loadFromUrl, // Export the new function
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
