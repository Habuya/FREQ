

import { TuningPreset, SaturationType } from '../types';

// Inlined Worker Code to avoid file resolution issues in different environments
const WORKER_CODE = `
const OfflineContextClass = self.OfflineAudioContext || self.webkitOfflineAudioContext;

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    let result;
    if (type === 'DETECT_TUNING') {
      result = await detectInherentTuning(payload.data, payload.sampleRate, payload.sensitivity);
    } else if (type === 'DETECT_BASS') {
      result = await detectBassRoot(payload.data, payload.sampleRate, payload.sensitivity);
    }
    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({ id, success: false, error: error.message });
  }
};

async function detectInherentTuning(inputData, sampleRate, sensitivity) {
  const fftSize = 4096;
  const binWidth = sampleRate / fftSize;
  let totalWeightedDeviation = 0;
  let totalWeight = 0;
  const segments = 5;
  const segmentStep = Math.floor(inputData.length / segments);
  let threshold = 1.0;
  
  if (sensitivity < 50) {
      threshold = 5.0 - (sensitivity / 50) * 4.0; 
  } else {
      threshold = 1.0 - ((sensitivity - 50) / 50) * 0.9;
  }

  for(let s=0; s<segments; s++) {
    const offset = s * segmentStep;
    if(offset + fftSize > inputData.length) break;
    const chunk = inputData.subarray(offset, offset + fftSize);
    
    const windowed = new Float32Array(fftSize);
    for(let i=0; i<fftSize; i++) {
       windowed[i] = chunk[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    for (let bin = Math.floor(200 / binWidth); bin < Math.ceil(1000 / binWidth); bin++) {
       let real = 0;
       let imag = 0;
       const freq = bin * binWidth;
       for(let n=0; n<fftSize; n++) {
          const angle = (2 * Math.PI * bin * n) / fftSize;
          real += windowed[n] * Math.cos(angle);
          imag += windowed[n] * -Math.sin(angle);
       }
       const magnitude = Math.sqrt(real*real + imag*imag);
       if (magnitude > threshold) { 
         const n = 12 * Math.log2(freq / 440);
         const roundedN = Math.round(n);
         const deviation = n - roundedN; 
         if (Math.abs(deviation) < 0.4) { 
           totalWeightedDeviation += deviation * magnitude;
           totalWeight += magnitude;
         }
       }
    }
  }

  if (totalWeight === 0) return 440; 
  const avgDeviation = totalWeightedDeviation / totalWeight;
  const inferredA4 = 440 * Math.pow(2, avgDeviation / 12);
  return Math.max(420, Math.min(450, inferredA4));
}

async function detectBassRoot(pcmData, sampleRate, sensitivity) {
    const windowSize = 4096;
    let bestOffset = 0;
    let maxEnergy = 0;
    for (let i = 0; i < pcmData.length - windowSize; i += 1024) {
        let energy = 0;
        for (let j = 0; j < windowSize; j += 16) {
            energy += Math.abs(pcmData[i+j]);
        }
        if (energy > maxEnergy) {
            maxEnergy = energy;
            bestOffset = i;
        }
    }
    if (maxEnergy < 1.0) return 0;
    const bestChunk = pcmData.subarray(bestOffset, bestOffset + windowSize);
    let minFreq = 20;
    let maxFreq = 120;
    if (sensitivity < 50) {
        minFreq = 20 + (50 - sensitivity) * 0.2; 
        maxFreq = 120 - (50 - sensitivity) * 0.8;
    } else {
        minFreq = 20;
        maxFreq = 120 + (sensitivity - 50) * 1.2;
    }
    return await findDominantFrequency(bestChunk, sampleRate, minFreq, maxFreq);
}

async function findDominantFrequency(signal, sampleRate, minFreq, maxFreq) {
    const targetSize = 16384; 
    const padded = new Float32Array(targetSize);
    const len = Math.min(signal.length, targetSize);
    const startOffset = Math.floor((targetSize - len) / 2);
    for(let i=0; i<len; i++) {
        const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
        padded[startOffset + i] = signal[i] * window;
    }
    const magnitudes = await computeFFT(padded, sampleRate);
    let maxMag = 0;
    let peakBin = 0;
    const binWidth = sampleRate / targetSize;
    const minBin = Math.floor(minFreq / binWidth);
    const maxBin = Math.ceil(maxFreq / binWidth);
    for(let i = minBin; i <= maxBin && i < magnitudes.length; i++) {
        if (magnitudes[i] > maxMag) {
            maxMag = magnitudes[i];
            peakBin = i;
        }
    }
    if (peakBin > 0 && peakBin < magnitudes.length - 1) {
        const alpha = magnitudes[peakBin - 1];
        const beta = magnitudes[peakBin];
        const gamma = magnitudes[peakBin + 1];
        const denominator = alpha - 2 * beta + gamma;
        if (denominator !== 0) {
            const p = 0.5 * (alpha - gamma) / denominator;
            return (peakBin + p) * binWidth;
        }
    }
    return peakBin * binWidth;
}

async function computeFFT(inputReal, sampleRate) {
    if (!OfflineContextClass) {
        throw new Error("OfflineAudioContext not supported in this browser");
    }
    const fftSize = inputReal.length;
    const duration = fftSize / sampleRate;
    const ctx = new OfflineContextClass(1, fftSize, sampleRate);
    const source = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, fftSize, sampleRate);
    buffer.copyToChannel(inputReal, 0);
    source.buffer = buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    source.start(0);
    const freqs = new Float32Array(analyser.frequencyBinCount);
    await ctx.suspend(duration).then(() => {
        analyser.getFloatFrequencyData(freqs);
        return ctx.resume();
    });
    await ctx.startRendering();
    const linear = new Float32Array(freqs.length);
    for (let i = 0; i < freqs.length; i++) {
        const db = freqs[i];
        if (db <= -1000) {
            linear[i] = 0;
        } else {
            linear[i] = Math.pow(10, db / 20);
        }
    }
    return linear;
}
`;

export interface AudioFormatInfo {
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
  bitRateEstimate?: string; 
}

class AudioService {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  
  // --- Sacred Geometry Constants & State ---
  private readonly PHI = 1.61803398875;
  private sacredGeometryMode: boolean = false;
  private lastDetectedBass: number = 0;
  
  // --- Worker for Heavy DSP ---
  private worker: Worker | null = null;
  private workerCallbacks: Map<number, { resolve: (val: any) => void, reject: (err: any) => void }> = new Map();
  private workerMsgIdCounter: number = 0;

  // --- High-End Mastering Chain ---
  // 0. Pre-Gain (Headroom Management)
  private preGainNode: GainNode | null = null;

  // 1. Body EQ (Low Shelf - Refined for Sub-Bass)
  private bodyFilter: BiquadFilterNode | null = null;
  // 2. Presence EQ (Peaking - Adaptive Frequency)
  private resonanceFilter: BiquadFilterNode | null = null;
  
  // --- ZenSpace M/S Matrix Nodes ---
  private msSplitter: ChannelSplitterNode | null = null;
  private msMerger: ChannelMergerNode | null = null;
  private sideGainNode: GainNode | null = null; // "Space" Control

  // 3. Air EQ (High Shelf - MOVED TO SIDE CHAIN)
  private airFilter: BiquadFilterNode | null = null;
  
  // 4. Harmonic Exciter Stage
  private driveNode: GainNode | null = null;
  private saturator: WaveShaperNode | null = null;

  // 5. Mastering Compressor
  private compressor: DynamicsCompressorNode | null = null;

  private audioBuffer: AudioBuffer | null = null;
  
  // Precise Time Tracking
  private isPlaying: boolean = false;
  private accumulatedBufferTime: number = 0;
  private lastTimestamp: number = 0; 
  private currentTargetFrequency: number = 440; 
  
  // Dynamic Tuning State
  private sourceReferencePitch: number = 440; 

  // Settings State
  private currentSaturationType: SaturationType = 'tube';
  private currentStereoWidth: number = 1.0; 
  private eqBypass = {
    body: false,
    resonance: false,
    air: false
  };

  // THD Analysis State
  private lastTHDCalcTime: number = 0;
  private thdBuffer: Float32Array | null = null;

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.context = new AudioContextClass({ latencyHint: 'playback' }); 
    
    // Initialize Web Worker with Blob
    if (window.Worker) {
        try {
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            
            this.worker = new Worker(workerUrl);
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = (e) => {
                console.warn("Worker error:", e);
            };
        } catch (e) {
            console.error("Failed to initialize audio worker:", e);
        }
    }
    
    // --- DSP INIT ---

    // 0. Pre-Gain
    this.preGainNode = this.context.createGain();
    this.preGainNode.gain.value = 0.707; // -3dB Headroom

    // 1. Body Filter
    this.bodyFilter = this.context.createBiquadFilter();
    this.bodyFilter.type = 'lowshelf';
    this.bodyFilter.frequency.value = 60; 
    this.bodyFilter.gain.value = 0; 

    // 2. Resonance Filter
    this.resonanceFilter = this.context.createBiquadFilter();
    this.resonanceFilter.type = 'peaking';
    this.resonanceFilter.frequency.value = 432; 
    this.resonanceFilter.Q.value = 0.8; 
    this.resonanceFilter.gain.value = 0;

    // --- ZENSPACE M/S STAGE INIT ---
    this.msSplitter = this.context.createChannelSplitter(2);
    this.msMerger = this.context.createChannelMerger(2);

    // 3. Air Filter (Now on Side Chain)
    this.airFilter = this.context.createBiquadFilter();
    this.airFilter.type = 'highshelf';
    this.airFilter.frequency.value = 16000;
    this.airFilter.gain.value = 0;

    // Width Control
    this.sideGainNode = this.context.createGain();
    this.sideGainNode.gain.value = 1.0; 

    // 4. Harmonic Exciter
    this.driveNode = this.context.createGain();
    this.driveNode.gain.value = 1.0; 

    this.saturator = this.context.createWaveShaper();
    this.saturator.curve = this.makeSaturationCurve('tube', 8192);
    this.saturator.oversample = '4x'; 

    // 5. Compressor
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -12; 
    this.compressor.knee.value = 30;       
    this.compressor.ratio.value = 1.5;     
    this.compressor.attack.value = 0.03;   
    this.compressor.release.value = 0.25;   

    // 6. Output Gain (Makeup)
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 1.4; 

    // 7. Analyser
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 8192; 
    this.analyser.smoothingTimeConstant = 0.8;

    // --- ROUTING / WIRING ---
    
    // Linear Part
    this.preGainNode.connect(this.bodyFilter);
    this.bodyFilter.connect(this.resonanceFilter);

    // --- M/S MATRIX ---
    this.resonanceFilter.connect(this.msSplitter);

    // Mid/Side Calculation Nodes
    const midSum = this.context.createGain();
    midSum.gain.value = 0.5;
    
    const sideDiff = this.context.createGain();
    sideDiff.gain.value = 0.5;
    
    const sideInvert = this.context.createGain();
    sideInvert.gain.value = -0.5;

    // Encoding:
    // Mid = (L + R) / 2
    this.msSplitter.connect(midSum, 0); // L -> Mid
    this.msSplitter.connect(midSum, 1); // R -> Mid

    // Side = (L - R) / 2
    this.msSplitter.connect(sideDiff, 0);   // L -> Side
    this.msSplitter.connect(sideInvert, 1); // R -> SideInvert
    sideInvert.connect(sideDiff);           // SideInvert -> SideDiff

    // Processing:
    // Side -> Air Filter -> Width Control
    sideDiff.connect(this.airFilter);
    this.airFilter.connect(this.sideGainNode);

    // Decoding:
    const outL = this.context.createGain();
    const outR = this.context.createGain();
    const sideOutInvert = this.context.createGain();
    sideOutInvert.gain.value = -1;

    // L = Mid + Side
    midSum.connect(outL);
    this.sideGainNode.connect(outL);

    // R = Mid - Side
    midSum.connect(outR);
    this.sideGainNode.connect(sideOutInvert);
    sideOutInvert.connect(outR);

    // Merge back to Stereo
    outL.connect(this.msMerger, 0, 0);
    outR.connect(this.msMerger, 0, 1);

    // --- REST OF CHAIN ---
    this.msMerger.connect(this.driveNode);
    this.driveNode.connect(this.saturator);
    this.saturator.connect(this.compressor);
    this.compressor.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }

  // --- Worker Message Handling ---

  private handleWorkerMessage(e: MessageEvent) {
    const { id, success, result, error } = e.data;
    if (this.workerCallbacks.has(id)) {
      const callback = this.workerCallbacks.get(id)!;
      if (success) {
        callback.resolve(result);
      } else {
        callback.reject(new Error(error));
      }
      this.workerCallbacks.delete(id);
    }
  }

  private runWorkerTask<T>(type: string, payload: any, transferables: Transferable[] = []): Promise<T> {
    if (!this.worker) return Promise.reject(new Error("Worker not initialized"));

    return new Promise((resolve, reject) => {
      const id = ++this.workerMsgIdCounter;
      this.workerCallbacks.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, payload }, transferables);
    });
  }

  // --- Dynamic Settings Updates ---
  
  /**
   * Enables or disables the Sacred Geometry DSP mode.
   * Uses PHI (Golden Ratio) to calculate harmonic EQ frequencies based on the root bass note.
   */
  public setSacredGeometryMode(active: boolean) {
    this.sacredGeometryMode = active;
    this.applyGoldenRatioEQ(this.lastDetectedBass);
  }

  /**
   * Applies the Golden Ratio calculations to the EQ filters.
   * Body = Bass Freq
   * Resonance = Bass * PHI^3
   * Air = Bass * PHI^7
   */
  private applyGoldenRatioEQ(bassFreq: number) {
    if (!this.context || !this.bodyFilter || !this.resonanceFilter || !this.airFilter) return;

    const now = this.context.currentTime;
    let targetBody = 60;
    let targetRes = 432;
    let targetAir = 16000;

    // Apply Sacred Geometry Logic if mode is active and bass frequency is valid
    if (this.sacredGeometryMode && bassFreq >= 20) {
        targetBody = bassFreq;
        targetRes = bassFreq * Math.pow(this.PHI, 3);
        targetAir = bassFreq * Math.pow(this.PHI, 7);

        // Safety Clamping for Audio Stability
        const maxFreq = (this.context.sampleRate / 2) * 0.95; // Slightly under Nyquist
        targetAir = Math.min(targetAir, 20000, maxFreq);
        targetRes = Math.min(targetRes, maxFreq);
    }

    // Smooth transition
    this.bodyFilter.frequency.setTargetAtTime(targetBody, now, 0.1);
    this.resonanceFilter.frequency.setTargetAtTime(targetRes, now, 0.1);
    this.airFilter.frequency.setTargetAtTime(targetAir, now, 0.1);
  }

  public setStereoWidth(width: number) {
    if (this.sideGainNode && this.context) {
        // Safe Range 0.0 (Mono) to 2.0 (200%)
        this.currentStereoWidth = width;
        this.sideGainNode.gain.setTargetAtTime(width, this.context.currentTime, 0.1);
    }
  }

  public setSourceReferencePitch(hz: number) {
    if (hz > 400 && hz < 480) {
        this.sourceReferencePitch = hz;
    } else {
        this.sourceReferencePitch = 440;
    }
    
    if (this.isPlaying) {
        this.applyTuning(this.currentTargetFrequency, false);
    }
  }

  public getSourceReferencePitch(): number {
    return this.sourceReferencePitch;
  }

  public getCurrentTargetFrequency(): number {
    return this.currentTargetFrequency;
  }

  public updateVisualizerSettings(fftSize: number, smoothing: number) {
    if (!this.analyser) return;
    try {
      this.analyser.fftSize = fftSize;
      this.analyser.smoothingTimeConstant = smoothing;
    } catch (e) {
      console.warn("Invalid analyser settings", e);
    }
  }

  public setSaturationType(type: SaturationType) {
    if (!this.saturator) return;
    this.currentSaturationType = type;
    this.saturator.curve = this.makeSaturationCurve(type, 8192);
  }

  public setEQBypass(bypass: { body: boolean, resonance: boolean, air: boolean }) {
    this.eqBypass = bypass;
    this.applyTuning(this.currentTargetFrequency, false);
  }

  // --- Analysis Helpers (THD) ---
  
  public calculateTHD(): number {
    if (!this.analyser || !this.context) return 0;
    
    // Throttling (calculate max every 100ms)
    const now = Date.now();
    if (now - this.lastTHDCalcTime < 100) return -1; // -1 indicates "no update"
    this.lastTHDCalcTime = now;

    const fftSize = this.analyser.fftSize;
    const binCount = this.analyser.frequencyBinCount;
    
    // Resize buffer if needed (avoid allocation every frame)
    if (!this.thdBuffer || this.thdBuffer.length !== binCount) {
      this.thdBuffer = new Float32Array(binCount);
    }
    
    this.analyser.getFloatFrequencyData(this.thdBuffer);
    
    const sampleRate = this.context.sampleRate;
    const binWidth = sampleRate / fftSize;
    
    // 1. Find Fundamental (f0) - Scan relevant range (20Hz - 5000Hz)
    // We assume the loudest peak in this range is the fundamental for THD purposes
    const minBin = Math.floor(20 / binWidth);
    const maxBin = Math.floor(5000 / binWidth);
    
    let maxAmp = 0;
    let fundBin = 0;
    
    // Helper to get linear energy of a bin + neighbors (Spectral Leakage Handling)
    // Sums squares of linear amplitude for bin-2 to bin+2
    const getEnergyAroundBin = (centerBin: number): number => {
        let energySum = 0;
        const width = 2; // +/- 2 bins
        for (let b = centerBin - width; b <= centerBin + width; b++) {
            if (b >= 0 && b < binCount) {
                const db = this.thdBuffer![b];
                // Noise Gate: Ignore anything below -90dB
                if (db > -90) {
                    const linear = Math.pow(10, db / 20);
                    energySum += linear * linear;
                }
            }
        }
        return energySum; // Returns Squared Sum
    };

    // Find Peak (Fundamental)
    for (let i = minBin; i < maxBin; i++) {
        const db = this.thdBuffer[i];
        if (db > -70) { // optimization
            const linear = Math.pow(10, db / 20);
            if (linear > maxAmp) {
                maxAmp = linear;
                fundBin = i;
            }
        }
    }
    
    // If signal is too quiet, return 0
    if (maxAmp < 0.001 || fundBin === 0) return 0;

    // Energy of Fundamental (V1^2)
    const v1_sq = getEnergyAroundBin(fundBin);
    if (v1_sq === 0) return 0;

    // 2. Sum Harmonics (V2, V3...)
    let harmonicsSumSq = 0;
    const nyquistBin = binCount - 1;
    let harmonicNum = 2;
    
    while (true) {
        const harmonicBin = fundBin * harmonicNum;
        if (harmonicBin >= nyquistBin) break;
        
        const h_sq = getEnergyAroundBin(harmonicBin);
        harmonicsSumSq += h_sq;
        
        harmonicNum++;
    }

    // 3. Calculate THD %
    // THD = sqrt(Sum(Vn^2)) / V1 * 100
    const thd = (Math.sqrt(harmonicsSumSq) / Math.sqrt(v1_sq)) * 100;
    
    return thd;
  }

  // --- Helpers ---
  
  public getNoteName(frequency: number): string {
    if (frequency <= 0) return "--";
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
    const n = 12 * Math.log2(frequency / 440) + 69;
    const noteIndex = Math.round(n);
    const octave = Math.floor(noteIndex / 12) - 1;
    
    const noteNameIndex = ((noteIndex % 12) + 12) % 12;
    const note = noteStrings[noteNameIndex];
    
    const cents = Math.round((n - noteIndex) * 100);
    const sign = cents >= 0 ? "+" : "";
    
    return `${note}${octave} ${sign}${cents}ct`;
  }

  // --- Saturation Generators ---

  private makeSaturationCurve(type: SaturationType, samples: number): Float32Array {
    const curve = new Float32Array(samples);
    
    if (type === 'clean') {
      for (let i = 0; i < samples; ++i) {
        const x = (i * 2) / samples - 1;
        curve[i] = x;
      }
      return curve;
    }

    if (type === 'tape') {
      for (let i = 0; i < samples; ++i) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2);
      }
      return curve;
    }

    // Default 'tube'
    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      
      if (x < -1) curve[i] = -1;
      else if (x > 1) curve[i] = 1;
      else {
        const even = 0.1 * x * x; 
        const odd = 0.08 * x * x * x;
        const val = x + even - odd;
        
        curve[i] = Math.tanh(val); 
      }
      curve[i] /= 0.77;
    }
    return curve;
  }

  public getContextSampleRate(): number {
    return this.context?.sampleRate || 44100;
  }

  public async loadFile(file: File): Promise<AudioBuffer> {
    if (!this.context) throw new Error("AudioContext not initialized");
    
    this.stop();
    this.accumulatedBufferTime = 0;
    this.sourceReferencePitch = 440;
    this.lastDetectedBass = 0;
    
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await this.context.decodeAudioData(arrayBuffer);
    this.audioBuffer = decodedBuffer;
    return decodedBuffer;
  }
  
  public getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  public setAudioBuffer(buffer: AudioBuffer) {
    if (!this.context) throw new Error("Context not initialized");
    this.stop();
    this.accumulatedBufferTime = 0;
    this.sourceReferencePitch = 440;
    this.lastDetectedBass = 0;
    this.audioBuffer = buffer;
  }

  public createBufferFromData(data: { sampleRate: number, channels: Float32Array[] }): AudioBuffer {
    if (!this.context) throw new Error("Context not initialized");
    const channels = data.channels.length;
    const length = data.channels[0].length;
    const buffer = this.context.createBuffer(channels, length, data.sampleRate);
    
    for(let i=0; i<channels; i++) {
        buffer.copyToChannel(data.channels[i], i);
    }
    return buffer;
  }

  public getFormatInfo(): AudioFormatInfo | null {
    if (!this.audioBuffer) return null;
    return {
      sampleRate: this.audioBuffer.sampleRate,
      duration: this.audioBuffer.duration,
      numberOfChannels: this.audioBuffer.numberOfChannels
    };
  }

  public async detectHighFrequencies(): Promise<boolean> {
    if (!this.audioBuffer) return false;
    if (this.audioBuffer.sampleRate < 40000) return false; 

    try {
      const startFrame = Math.floor(this.audioBuffer.length * 0.3);
      const length = Math.min(this.audioBuffer.sampleRate, this.audioBuffer.length - startFrame); 
      
      const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      const offlineCtx = new OfflineContextClass(1, length, this.audioBuffer.sampleRate);
      
      const source = offlineCtx.createBufferSource();
      const fragmentBuffer = offlineCtx.createBuffer(1, length, this.audioBuffer.sampleRate);
      fragmentBuffer.copyToChannel(this.audioBuffer.getChannelData(0).subarray(startFrame, startFrame + length), 0);
      source.buffer = fragmentBuffer;
      
      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 20000;
      filter.Q.value = 1; 
      
      source.connect(filter);
      filter.connect(offlineCtx.destination);
      
      source.start();
      const renderedBuffer = await offlineCtx.startRendering();
      
      const data = renderedBuffer.getChannelData(0);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
      }
      const rms = Math.sqrt(sumSquares / data.length);
      
      return rms > 0.0001;
      
    } catch (e) {
      console.warn("HF Detection failed", e);
      return false; 
    }
  }

  public async detectBassRoot(sensitivity: number = 50): Promise<number> {
    if (!this.audioBuffer || !this.worker) return 0;

    try {
        const scanDuration = 6;
        const startOffsetTime = Math.min(this.audioBuffer.duration * 0.2, 10);
        const startSample = Math.floor(startOffsetTime * this.audioBuffer.sampleRate);
        const lengthSamples = Math.min(
            Math.floor(scanDuration * this.audioBuffer.sampleRate), 
            this.audioBuffer.length - startSample
        );
        
        if (lengthSamples <= 0) return 0;
        const slice = this.audioBuffer.getChannelData(0).slice(startSample, startSample + lengthSamples);
        
        const detectedFreq = await this.runWorkerTask<number>(
            'DETECT_BASS', 
            { 
                data: slice, 
                sampleRate: this.audioBuffer.sampleRate, 
                sensitivity 
            },
            [slice.buffer]
        );
        
        // Store the result and trigger the EQ update
        this.lastDetectedBass = detectedFreq;
        this.applyGoldenRatioEQ(detectedFreq);
        
        return detectedFreq;

    } catch(e) {
        console.warn("Bass detection failed", e);
        return 0;
    }
  }

  public async detectInherentTuning(sensitivity: number = 50): Promise<number> {
    if (!this.audioBuffer || !this.worker) return 440;

    try {
      const sampleRate = this.audioBuffer.sampleRate;
      const startFrame = Math.floor(this.audioBuffer.length / 2);
      const length = Math.min(sampleRate * 4, this.audioBuffer.length - startFrame);
      
      if (length <= 0) return 440;
      const slice = this.audioBuffer.getChannelData(0).slice(startFrame, startFrame + length);

      return await this.runWorkerTask<number>(
          'DETECT_TUNING',
          {
              data: slice,
              sampleRate: sampleRate,
              sensitivity: sensitivity
          },
          [slice.buffer]
      );

    } catch (e) {
      console.warn("Tuning detection failed", e);
      return 440;
    }
  }

  public play(onEnded?: () => void) {
    if (!this.context || !this.audioBuffer) return;

    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    this.source = this.context.createBufferSource();
    this.source.buffer = this.audioBuffer;
    
    if (this.preGainNode) {
      this.source.connect(this.preGainNode);
    }

    const startOffset = this.accumulatedBufferTime % this.audioBuffer.duration;

    this.applyTuning(this.currentTargetFrequency, true);

    this.source.start(0, startOffset);
    
    this.lastTimestamp = this.context.currentTime;
    this.isPlaying = true;

    this.source.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.accumulatedBufferTime = 0; 
        if (onEnded) onEnded();
      }
    };
  }

  public pause() {
    if (!this.source || !this.context) return;
    
    this.updateBufferPosition(); 
    this.source.stop();
    this.source.disconnect();
    this.source = null;
    this.isPlaying = false;
  }

  public stop() {
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    this.accumulatedBufferTime = 0;
    this.isPlaying = false;
  }

  public setVolume(value: number) {
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(1.4 * value, this.context!.currentTime);
    }
  }

  public setTargetFrequency(targetFreq: number) {
    if (this.isPlaying) {
      this.updateBufferPosition();
    }
    
    this.currentTargetFrequency = targetFreq;
    this.applyTuning(targetFreq);
  }

  private updateBufferPosition() {
    if (!this.context || !this.isPlaying) return;
    
    const now = this.context.currentTime;
    const dt = now - this.lastTimestamp;
    
    const srcPitch = this.sourceReferencePitch || 440;
    const ratio = this.currentTargetFrequency / srcPitch;
    
    this.accumulatedBufferTime += dt * ratio;
    this.lastTimestamp = now;
  }

  private applyTuning(targetFreq: number, instant = false) {
    if (!this.source || !this.context || !this.bodyFilter || !this.resonanceFilter || !this.airFilter || !this.driveNode) return;
    
    const now = this.context.currentTime;
    const srcPitch = this.sourceReferencePitch || 440;
    
    const ratio = targetFreq / srcPitch;
    
    const isStandard = targetFreq === 440;
    
    const bodyGain = (!isStandard && !this.eqBypass.body) ? 0.6 : 0;       
    const resonanceGain = (!isStandard && !this.eqBypass.resonance) ? 0.3 : 0;  
    
    // Air Gain now applies to Side Channel -> More width for high freqs in Zen mode
    const airGain = (!isStandard && !this.eqBypass.air) ? 0.5 : 0;       
    
    const driveGain = !isStandard ? 0.95 : 1.0; 

    this.source.playbackRate.cancelScheduledValues(now);
    this.bodyFilter.gain.cancelScheduledValues(now);
    this.resonanceFilter.gain.cancelScheduledValues(now);
    this.airFilter.gain.cancelScheduledValues(now);
    this.driveNode.gain.cancelScheduledValues(now);

    if (instant) {
      this.source.playbackRate.value = ratio;
      this.bodyFilter.gain.value = bodyGain;
      this.resonanceFilter.gain.value = resonanceGain;
      this.airFilter.gain.value = airGain;
      this.driveNode.gain.value = driveGain;
    } else {
      const rampTime = 0.15; 
      this.source.playbackRate.setValueAtTime(this.source.playbackRate.value, now);
      this.source.playbackRate.linearRampToValueAtTime(ratio, now + rampTime);
      
      this.bodyFilter.gain.setValueAtTime(this.bodyFilter.gain.value, now);
      this.bodyFilter.gain.linearRampToValueAtTime(bodyGain, now + rampTime);
      
      this.resonanceFilter.gain.setValueAtTime(this.resonanceFilter.gain.value, now);
      this.resonanceFilter.gain.linearRampToValueAtTime(resonanceGain, now + rampTime);
      
      this.airFilter.gain.setValueAtTime(this.airFilter.gain.value, now);
      this.airFilter.gain.linearRampToValueAtTime(airGain, now + rampTime);
      
      this.driveNode.gain.setValueAtTime(this.driveNode.gain.value, now);
      this.driveNode.gain.linearRampToValueAtTime(driveGain, now + rampTime);
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
  
  public getDuration(): number {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  public async exportAudio(targetFreq: number): Promise<Blob> {
    if (!this.audioBuffer) throw new Error("No audio loaded");

    const srcPitch = this.sourceReferencePitch || 440;
    const ratio = targetFreq / srcPitch;
    const outputDuration = this.audioBuffer.duration / ratio;
    const sampleRate = this.audioBuffer.sampleRate;

    const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    
    const offlineCtx = new OfflineContextClass(
      this.audioBuffer.numberOfChannels,
      Math.ceil(outputDuration * sampleRate),
      sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.playbackRate.value = ratio;

    // --- Export Chain with M/S Processing ---
    
    const preGain = offlineCtx.createGain();
    preGain.gain.value = 0.707;

    // Determine frequencies based on Sacred Geometry Mode
    let expBody = 60;
    let expRes = 432;
    let expAir = 16000;

    if (this.sacredGeometryMode && this.lastDetectedBass >= 20) {
       expBody = this.lastDetectedBass;
       expRes = this.lastDetectedBass * Math.pow(this.PHI, 3);
       expAir = this.lastDetectedBass * Math.pow(this.PHI, 7);
       
       const maxFreq = (sampleRate / 2) * 0.95;
       expAir = Math.min(expAir, 20000, maxFreq);
       expRes = Math.min(expRes, maxFreq);
    }

    const bodyFilter = offlineCtx.createBiquadFilter();
    bodyFilter.type = 'lowshelf';
    bodyFilter.frequency.value = expBody;
    
    const isStandard = targetFreq === 440;
    
    bodyFilter.gain.value = (!isStandard && !this.eqBypass.body) ? 0.6 : 0;

    const resonanceFilter = offlineCtx.createBiquadFilter();
    resonanceFilter.type = 'peaking';
    resonanceFilter.frequency.value = expRes;
    resonanceFilter.Q.value = 0.8;
    resonanceFilter.gain.value = (!isStandard && !this.eqBypass.resonance) ? 0.3 : 0;

    // --- M/S Matrix Offline ---
    const msSplitter = offlineCtx.createChannelSplitter(2);
    const msMerger = offlineCtx.createChannelMerger(2);
    
    const midSum = offlineCtx.createGain(); midSum.gain.value = 0.5;
    const sideDiff = offlineCtx.createGain(); sideDiff.gain.value = 0.5;
    const sideInvert = offlineCtx.createGain(); sideInvert.gain.value = -0.5;

    // Air Filter (High Shelf) on Side Channel
    const airFilter = offlineCtx.createBiquadFilter();
    airFilter.type = 'highshelf';
    airFilter.frequency.value = expAir;
    airFilter.gain.value = (!isStandard && !this.eqBypass.air) ? 0.5 : 0;

    // Width Control
    const sideGainNode = offlineCtx.createGain();
    sideGainNode.gain.value = this.currentStereoWidth;

    const driveNode = offlineCtx.createGain();
    driveNode.gain.value = !isStandard ? 0.95 : 1.0;

    const saturator = offlineCtx.createWaveShaper();
    saturator.curve = this.makeSaturationCurve(this.currentSaturationType, 8192);
    saturator.oversample = '4x';

    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 30;
    compressor.ratio.value = 1.5;
    compressor.attack.value = 0.03;
    compressor.release.value = 0.25;
    
    const makeupGain = offlineCtx.createGain();
    makeupGain.gain.value = 1.4;

    // Wiring Export Graph
    source.connect(preGain);
    preGain.connect(bodyFilter);
    bodyFilter.connect(resonanceFilter);
    resonanceFilter.connect(msSplitter);

    // M/S Encoding
    msSplitter.connect(midSum, 0); // L -> Mid
    msSplitter.connect(midSum, 1); // R -> Mid
    
    msSplitter.connect(sideDiff, 0);   // L -> Side
    msSplitter.connect(sideInvert, 1); // R -> Invert
    sideInvert.connect(sideDiff);      // Invert -> Side

    // Processing Side
    sideDiff.connect(airFilter);
    airFilter.connect(sideGainNode);

    // Decoding
    const outL = offlineCtx.createGain();
    const outR = offlineCtx.createGain();
    const sideOutInvert = offlineCtx.createGain(); sideOutInvert.gain.value = -1;

    midSum.connect(outL);
    sideGainNode.connect(outL);

    midSum.connect(outR);
    sideGainNode.connect(sideOutInvert);
    sideOutInvert.connect(outR);

    outL.connect(msMerger, 0, 0);
    outR.connect(msMerger, 0, 1);

    // End of M/S -> Output Chain
    msMerger.connect(driveNode);
    driveNode.connect(saturator);
    saturator.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(offlineCtx.destination);

    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    return this.bufferToWav(renderedBuffer);
  }

  private bufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * numOfChan * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); 
    view.setUint16(22, numOfChan, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2 * numOfChan, true);
    view.setUint16(32, numOfChan * 2, true);
    view.setUint16(34, 16, true); 
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * numOfChan * 2, true);

    for (i = 0; i < buffer.numberOfChannels; i++)
      channels.push(buffer.getChannelData(i));

    offset = 44;
    while (pos < buffer.length) {
      for (i = 0; i < numOfChan; i++) {
        const input = channels[i][pos];
        const dither = (Math.random() - Math.random()) * (0.5 / 32768); 
        let sampleWithDither = Math.max(-1, Math.min(1, input + dither));
        sampleWithDither = (0.5 + sampleWithDither < 0 ? sampleWithDither * 32768 : sampleWithDither * 32767) | 0;
        view.setInt16(offset, sampleWithDither, true);
        offset += 2;
      }
      pos++;
    }

    function writeString(view: DataView, offset: number, string: string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
    return new Blob([bufferArr], { type: 'audio/wav' });
  }
}

export const audioService = new AudioService();
