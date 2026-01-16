



import { TuningPreset, SaturationType, AudioSettings } from '../types';

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
    } else if (type === 'DETECT_PHASE') {
      result = await detectPhaseOffset(payload.data, payload.sampleRate, payload.frequency);
    }
    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({ id, success: false, error: error.message });
  }
};

// --- YIN-based Pitch Detection (Difference Function) ---
async function detectInherentTuning(inputData, sampleRate, sensitivity) {
  const bufferSize = inputData.length;
  
  // RMS check
  let rms = 0;
  for (let i = 0; i < bufferSize; i++) rms += inputData[i] * inputData[i];
  rms = Math.sqrt(rms / bufferSize);
  if (rms < 0.01) return 440; 

  const minFreq = 200;
  const maxFreq = 1000;
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.floor(sampleRate / minFreq);

  // Difference Function d(tau)
  // We look for the minimum difference, not maximum correlation
  let bestDiff = Infinity;
  let bestPeriod = 0;

  for (let lag = minPeriod; lag <= maxPeriod; lag++) {
    let diffSum = 0;
    const limit = Math.min(bufferSize - lag, 2048); 
    
    // YIN Step 1: Squared Difference
    for (let i = 0; i < limit; i++) {
      const delta = inputData[i] - inputData[i + lag];
      diffSum += delta * delta;
    }
    
    if (diffSum < bestDiff) {
      bestDiff = diffSum;
      bestPeriod = lag;
    }
  }

  // Parabolic Interpolation for Minima
  let shift = 0;
  if (bestPeriod > minPeriod && bestPeriod < maxPeriod) {
     const limit = Math.min(bufferSize - bestPeriod, 2048);
     
     let prevDiff = 0;
     for(let i=0; i<limit; i++) { const d = inputData[i] - inputData[i+bestPeriod-1]; prevDiff += d*d; }
     
     let nextDiff = 0;
     for(let i=0; i<limit; i++) { const d = inputData[i] - inputData[i+bestPeriod+1]; nextDiff += d*d; }

     const center = bestDiff;
     
     // Peak location for minimum: 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma)
     // Here alpha=prev, beta=center, gamma=next
     const denominator = prevDiff - 2 * center + nextDiff;
     if (denominator !== 0) {
        shift = 0.5 * (prevDiff - nextDiff) / denominator;
     }
  }

  const exactPeriod = bestPeriod + shift;
  // Safety check for div by zero
  if (exactPeriod === 0) return 440;
  
  const fundamentalFreq = sampleRate / exactPeriod;

  // Map to A4
  const semitonesFromA4 = 12 * Math.log2(fundamentalFreq / 440);
  const roundedSemitones = Math.round(semitonesFromA4);
  const deviationInSemitones = semitonesFromA4 - roundedSemitones;
  const inherentA4 = 440 * Math.pow(2, deviationInSemitones / 12);

  return Math.max(415, Math.min(460, inherentA4));
}

// --- Bass Detection ---
async function detectBassRoot(pcmData, sampleRate, sensitivity) {
    const windowSize = 8192;
    let bestOffset = 0;
    let maxEnergy = 0;
    
    for (let i = 0; i < pcmData.length - windowSize; i += 2048) {
        let energy = 0;
        for (let j = 0; j < windowSize; j += 32) energy += Math.abs(pcmData[i+j]);
        if (energy > maxEnergy) {
            maxEnergy = energy;
            bestOffset = i;
        }
    }
    
    if (maxEnergy < 1.0) return 0;

    const bestChunk = pcmData.subarray(bestOffset, bestOffset + windowSize);
    let minFreq = 30;
    let maxFreq = 150;
    if (sensitivity < 50) {
        maxFreq = 150 - (50 - sensitivity);
    } else {
        maxFreq = 150 + (sensitivity - 50);
    }
    return await findDominantFrequency(bestChunk, sampleRate, minFreq, maxFreq);
}

async function findDominantFrequency(signal, sampleRate, minFreq, maxFreq) {
    const targetSize = 32768; 
    const padded = new Float32Array(targetSize);
    const len = Math.min(signal.length, targetSize);
    const startOffset = Math.floor((targetSize - len) / 2);
    for(let i=0; i<len; i++) {
        // Blackman window
        const a0 = 0.42, a1 = 0.5, a2 = 0.08;
        const w = a0 - a1 * Math.cos((2 * Math.PI * i) / (len - 1)) + a2 * Math.cos((4 * Math.PI * i) / (len - 1));
        padded[startOffset + i] = signal[i] * w;
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

// --- Phase Offset Detection ---
async function detectPhaseOffset(pcmData, sampleRate, frequency) {
    if (frequency <= 0) return 0;
    let real = 0;
    let imag = 0;
    const limit = Math.min(pcmData.length, 2048);
    const omega = 2 * Math.PI * frequency / sampleRate;

    for(let i=0; i<limit; i++) {
        const s = pcmData[i];
        real += s * Math.cos(omega * i);
        imag += -s * Math.sin(omega * i);
    }

    const phase = Math.atan2(imag, real);
    const omegaSec = 2 * Math.PI * frequency;
    const timeShift = -phase / omegaSec;
    const period = 1 / frequency;
    let normalizedShift = timeShift;
    
    while(normalizedShift < 0) normalizedShift += period;
    while(normalizedShift > period) normalizedShift -= period;
    
    return normalizedShift;
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
    await ctx.suspend(duration * 0.5).then(() => {
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
  private fibonacciAlignmentMode: boolean = false;
  private phaseLockEnabled: boolean = false;
  private detectedPhaseOffset: number = 0;

  private lastDetectedBass: number = 0;
  
  // --- Binaural Zen-Beats State ---
  private binauralOscLeft: OscillatorNode | null = null;
  private binauralOscRight: OscillatorNode | null = null;
  private binauralGain: GainNode | null = null;
  private binauralActive: boolean = false;
  private binauralBeatFreq: number = 8; // Alpha by default

  // --- Harmonic Series Enhancement System ---
  private harmonicFilters: BiquadFilterNode[] = [];
  private harmonicWarmth: number = 0;  // 0-1
  private harmonicClarity: number = 0; // 0-1
  
  // --- Deep Zen Bass (Psychoacoustic) ---
  private subLowpass: BiquadFilterNode | null = null;
  private subShaper: WaveShaperNode | null = null;
  private subHarmonicFilter: BiquadFilterNode | null = null;
  private subGain: GainNode | null = null;
  
  // --- Worker for Heavy DSP ---
  private worker: Worker | null = null;
  private workerCallbacks: Map<number, { resolve: (val: any) => void, reject: (err: any) => void }> = new Map();
  private workerMsgIdCounter: number = 0;

  // --- High-End Mastering Chain ---
  private phaseDelayNode: DelayNode | null = null;
  private preGainNode: GainNode | null = null;
  private bodyFilter: BiquadFilterNode | null = null;
  private resonanceFilter: BiquadFilterNode | null = null;
  
  // --- ZenSpace M/S Matrix Nodes ---
  private msSplitter: ChannelSplitterNode | null = null;
  private msMerger: ChannelMergerNode | null = null;
  private sideGainNode: GainNode | null = null; 

  private airFilter: BiquadFilterNode | null = null;
  
  private driveNode: GainNode | null = null;
  private saturator: WaveShaperNode | null = null;

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
    this.phaseDelayNode = this.context.createDelay(1.0); // Up to 1 sec delay
    this.phaseDelayNode.delayTime.value = 0;

    this.preGainNode = this.context.createGain();
    this.preGainNode.gain.value = 0.707; 

    this.bodyFilter = this.context.createBiquadFilter();
    this.bodyFilter.type = 'lowshelf';
    this.bodyFilter.frequency.value = 60; 
    this.bodyFilter.gain.value = 0; 

    this.resonanceFilter = this.context.createBiquadFilter();
    this.resonanceFilter.type = 'peaking';
    this.resonanceFilter.frequency.value = 432; 
    this.resonanceFilter.Q.value = 0.8; 
    this.resonanceFilter.gain.value = 0;

    // --- Harmonic Filters Init (8 Bands) ---
    for(let i=0; i<8; i++) {
        const f = this.context.createBiquadFilter();
        f.type = 'peaking';
        f.Q.value = 4.0; 
        f.gain.value = 0;
        this.harmonicFilters.push(f);
    }
    
    // --- Deep Zen Bass Init (Psychoacoustic Chain) ---
    this.subLowpass = this.context.createBiquadFilter();
    this.subLowpass.type = 'lowpass';
    this.subLowpass.frequency.value = 90; // Isolate Sub Bass
    
    this.subShaper = this.context.createWaveShaper();
    this.subShaper.curve = this.makeSubHarmonicCurve(4096);
    this.subShaper.oversample = '4x';
    
    this.subHarmonicFilter = this.context.createBiquadFilter();
    this.subHarmonicFilter.type = 'bandpass';
    this.subHarmonicFilter.frequency.value = 180; // Focus on generated harmonics (f2, f3)
    this.subHarmonicFilter.Q.value = 1.5; 
    
    this.subGain = this.context.createGain();
    this.subGain.gain.value = 0;

    // --- ZENSPACE M/S STAGE INIT ---
    this.msSplitter = this.context.createChannelSplitter(2);
    this.msMerger = this.context.createChannelMerger(2);

    this.airFilter = this.context.createBiquadFilter();
    this.airFilter.type = 'highshelf';
    this.airFilter.frequency.value = 16000;
    this.airFilter.gain.value = 0;

    this.sideGainNode = this.context.createGain();
    this.sideGainNode.gain.value = 1.0; 

    this.driveNode = this.context.createGain();
    this.driveNode.gain.value = 1.0; 

    this.saturator = this.context.createWaveShaper();
    this.saturator.curve = this.makeSaturationCurve('tube', 8192);
    this.saturator.oversample = '4x'; 

    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -12; 
    this.compressor.knee.value = 30;       
    this.compressor.ratio.value = 1.5;     
    this.compressor.attack.value = 0.03;   
    this.compressor.release.value = 0.25;   

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 1.4; 

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 8192; 
    this.analyser.smoothingTimeConstant = 0.8;
    
    this.binauralGain = this.context.createGain();
    this.binauralGain.gain.value = 0; 

    // --- ROUTING / WIRING ---
    // New: Source -> PhaseDelay -> PreGain
    this.phaseDelayNode.connect(this.preGainNode);
    this.preGainNode.connect(this.bodyFilter);
    this.bodyFilter.connect(this.resonanceFilter);

    // Connect Resonance -> Harmonic Chain -> MS Splitter
    let currentNode: AudioNode = this.resonanceFilter;
    
    for (const hFilter of this.harmonicFilters) {
        currentNode.connect(hFilter);
        currentNode = hFilter;
    }
    
    // --- Deep Zen Bass Tap ---
    // We tap off the Resonance Filter (after main EQ) to feed the bass generator
    // but mix it back in before the M/S processing
    this.resonanceFilter.connect(this.subLowpass);
    this.subLowpass.connect(this.subShaper);
    this.subShaper.connect(this.subHarmonicFilter);
    this.subHarmonicFilter.connect(this.subGain);
    
    // Mix Harmonics Chain + Sub Chain into MS Splitter
    currentNode.connect(this.msSplitter);
    this.subGain.connect(this.msSplitter); // Mixing parallel signal

    const midSum = this.context.createGain(); midSum.gain.value = 0.5;
    const sideDiff = this.context.createGain(); sideDiff.gain.value = 0.5;
    const sideInvert = this.context.createGain(); sideInvert.gain.value = -0.5;

    this.msSplitter.connect(midSum, 0); 
    this.msSplitter.connect(midSum, 1); 

    this.msSplitter.connect(sideDiff, 0);   
    this.msSplitter.connect(sideInvert, 1); 
    sideInvert.connect(sideDiff);           

    sideDiff.connect(this.airFilter);
    this.airFilter.connect(this.sideGainNode);

    const outL = this.context.createGain();
    const outR = this.context.createGain();
    const sideOutInvert = this.context.createGain(); sideOutInvert.gain.value = -1;

    midSum.connect(outL);
    this.sideGainNode.connect(outL);

    midSum.connect(outR);
    this.sideGainNode.connect(sideOutInvert);
    sideOutInvert.connect(outR);

    outL.connect(this.msMerger, 0, 0);
    outR.connect(this.msMerger, 0, 1);

    this.msMerger.connect(this.driveNode);
    this.driveNode.connect(this.saturator);
    this.saturator.connect(this.compressor);
    this.compressor.connect(this.gainNode);
    
    this.binauralGain.connect(this.gainNode);
    
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }

  // ... (Worker Handling and other methods remain the same) ...

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

  public setSacredGeometryMode(active: boolean) {
    this.sacredGeometryMode = active;
    this.applyGoldenRatioEQ(this.lastDetectedBass);
  }

  public setFibonacciAlignment(active: boolean) {
    this.fibonacciAlignmentMode = active;
    if (this.isPlaying) {
      this.applyTuning(this.currentTargetFrequency, false);
    }
  }
  
  public setDeepZenBass(amount: number) {
      if (!this.context || !this.subGain) return;
      this.subGain.gain.setTargetAtTime(amount * 2.0, this.context.currentTime, 0.1); 
      // Multiplier 2.0 to give enough headroom as filtering reduces gain
  }

  public setPhaseLockEnabled(active: boolean) {
      this.phaseLockEnabled = active;
      if (this.phaseDelayNode && this.context) {
          const now = this.context.currentTime;
          if (active) {
              this.phaseDelayNode.delayTime.setTargetAtTime(this.detectedPhaseOffset, now, 0.2);
          } else {
              this.phaseDelayNode.delayTime.setTargetAtTime(0, now, 0.2);
          }
      }
  }
  
  public setHarmonicShaping(warmth: number, clarity: number) {
      this.harmonicWarmth = warmth;
      this.harmonicClarity = clarity;
      
      // Update logic based on current bass or fallback
      const root = this.lastDetectedBass > 20 ? this.lastDetectedBass : 60;
      this.updateHarmonicFilters(root);
  }

  private updateHarmonicFilters(rootFreq: number) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const nyquist = this.context.sampleRate / 2;

      this.harmonicFilters.forEach((filter, index) => {
          const harmonicOrder = index + 1; // 1st to 8th
          const targetFreq = rootFreq * harmonicOrder;
          
          if (targetFreq > nyquist) {
              filter.gain.setTargetAtTime(0, now, 0.1);
              return;
          }

          filter.frequency.setTargetAtTime(targetFreq, now, 0.1);
          
          let targetGain = 0;
          
          const isEven = harmonicOrder % 2 === 0;
          
          if (isEven) {
             const decay = 1 - (index * 0.1); 
             targetGain = this.harmonicWarmth * 9 * Math.max(0.2, decay);
          } else if (harmonicOrder > 1) {
             targetGain = this.harmonicClarity * 8;
          }
          
          filter.gain.setTargetAtTime(targetGain, now, 0.1);
      });
  }

  public setBinauralMode(active: boolean, beatFreq: number = 8) {
      this.binauralActive = active;
      this.binauralBeatFreq = beatFreq;
      
      if (this.isPlaying) {
          if (active) {
              this.startBinauralOscillators();
          } else {
              this.stopBinauralOscillators();
          }
      }
  }

  private startBinauralOscillators() {
      if (!this.context || !this.binauralGain) return;
      
      this.stopBinauralOscillators();
      
      const rootFreq = this.lastDetectedBass > 30 ? this.lastDetectedBass : 60; 
      const targetFreq = rootFreq + this.binauralBeatFreq;
      
      this.binauralOscLeft = this.context.createOscillator();
      this.binauralOscLeft.type = 'sine';
      this.binauralOscLeft.frequency.value = rootFreq;
      
      this.binauralOscRight = this.context.createOscillator();
      this.binauralOscRight.type = 'sine';
      this.binauralOscRight.frequency.value = targetFreq;
      
      const merger = this.context.createChannelMerger(2);
      
      this.binauralOscLeft.connect(merger, 0, 0);
      this.binauralOscRight.connect(merger, 0, 1);
      merger.connect(this.binauralGain);
      
      const now = this.context.currentTime;
      this.binauralGain.gain.cancelScheduledValues(now);
      this.binauralGain.gain.setValueAtTime(0, now);
      this.binauralGain.gain.linearRampToValueAtTime(0.05, now + 2); 
      
      this.binauralOscLeft.start();
      this.binauralOscRight.start();
  }

  private stopBinauralOscillators() {
      if (this.binauralOscLeft) {
          try { this.binauralOscLeft.stop(); } catch(e) {}
          this.binauralOscLeft.disconnect();
          this.binauralOscLeft = null;
      }
      if (this.binauralOscRight) {
          try { this.binauralOscRight.stop(); } catch(e) {}
          this.binauralOscRight.disconnect();
          this.binauralOscRight = null;
      }
  }

  private applyGoldenRatioEQ(bassFreq: number) {
    if (!this.context || !this.bodyFilter || !this.resonanceFilter || !this.airFilter) return;

    const now = this.context.currentTime;
    let targetBody = 60;
    let targetRes = 432;
    let targetAir = 16000;

    if (this.sacredGeometryMode && bassFreq >= 20) {
        targetBody = bassFreq;
        targetRes = bassFreq * Math.pow(this.PHI, 3);
        targetAir = bassFreq * Math.pow(this.PHI, 7);

        const maxFreq = (this.context.sampleRate / 2) * 0.95; 
        targetAir = Math.min(targetAir, 20000, maxFreq);
        targetRes = Math.min(targetRes, maxFreq);
    }

    this.bodyFilter.frequency.setTargetAtTime(targetBody, now, 0.1);
    this.resonanceFilter.frequency.setTargetAtTime(targetRes, now, 0.1);
    this.airFilter.frequency.setTargetAtTime(targetAir, now, 0.1);
  }

  public setStereoWidth(width: number) {
    if (this.sideGainNode && this.context) {
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

  public calculateTHD(): number {
    if (!this.analyser || !this.context) return 0;
    
    const now = Date.now();
    if (now - this.lastTHDCalcTime < 100) return -1; 
    this.lastTHDCalcTime = now;

    const fftSize = this.analyser.fftSize;
    const binCount = this.analyser.frequencyBinCount;
    
    if (!this.thdBuffer || this.thdBuffer.length !== binCount) {
      this.thdBuffer = new Float32Array(binCount);
    }
    
    this.analyser.getFloatFrequencyData(this.thdBuffer);
    
    const sampleRate = this.context.sampleRate;
    const binWidth = sampleRate / fftSize;
    
    const minBin = Math.floor(20 / binWidth);
    const maxBin = Math.floor(5000 / binWidth);
    
    let maxAmp = 0;
    let fundBin = 0;
    
    const getEnergyAroundBin = (centerBin: number): number => {
        let energySum = 0;
        const width = 2; 
        for (let b = centerBin - width; b <= centerBin + width; b++) {
            if (b >= 0 && b < binCount) {
                const db = this.thdBuffer![b];
                if (db > -90) {
                    const linear = Math.pow(10, db / 20);
                    energySum += linear * linear;
                }
            }
        }
        return energySum; 
    };

    for (let i = minBin; i < maxBin; i++) {
        const db = this.thdBuffer[i];
        if (db > -70) { 
            const linear = Math.pow(10, db / 20);
            if (linear > maxAmp) {
                maxAmp = linear;
                fundBin = i;
            }
        }
    }
    
    if (maxAmp < 0.001 || fundBin === 0) return 0;

    const v1_sq = getEnergyAroundBin(fundBin);
    if (v1_sq === 0) return 0;

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

    const thd = (Math.sqrt(harmonicsSumSq) / Math.sqrt(v1_sq)) * 100;
    return thd;
  }

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
  
  private makeSubHarmonicCurve(samples: number): Float32Array {
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; ++i) {
        const x = (i * 2) / samples - 1;
        // Asymmetric transfer function to create strong 2nd harmonic
        // y = 0.5 * (x + abs(x)) + tanh(x) roughly
        // We use a simpler approach for controllable distortion
        
        let y = x;
        if (Math.abs(x) > 0.1) {
            y = x + (0.2 * x * x); // Even harmonic bias
        }
        
        curve[i] = Math.tanh(y * 2.0) * 0.8; // Soft clip
      }
      return curve;
  }

  public getContextSampleRate(): number {
    return this.context?.sampleRate || 44100;
  }

  public getCurrentTime(): number {
      return this.context?.currentTime || 0;
  }

  public async loadFile(file: File): Promise<AudioBuffer> {
    if (!this.context) throw new Error("AudioContext not initialized");
    
    this.stop();
    this.accumulatedBufferTime = 0;
    this.sourceReferencePitch = 440;
    this.lastDetectedBass = 0;
    this.detectedPhaseOffset = 0;
    
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await this.context.decodeAudioData(arrayBuffer);
    this.audioBuffer = decodedBuffer;
    return decodedBuffer;
  }

  public async decodeFileOffline(file: File): Promise<AudioBuffer> {
    if (!this.context) throw new Error("AudioContext not initialized");
    const arrayBuffer = await file.arrayBuffer();
    return await this.context.decodeAudioData(arrayBuffer);
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
    this.detectedPhaseOffset = 0;
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
            [slice.buffer] // slice buffer transfer might be reused
        );
        
        this.lastDetectedBass = detectedFreq;
        this.applyGoldenRatioEQ(detectedFreq);
        this.updateHarmonicFilters(detectedFreq); 
        
        // Trigger Phase Detection
        if (detectedFreq > 20) {
            // Need a fresh slice copy since previous buffer was transferred
            const phaseSlice = this.audioBuffer.getChannelData(0).slice(0, 4096);
            this.detectedPhaseOffset = await this.runWorkerTask<number>('DETECT_PHASE', {
                data: phaseSlice,
                sampleRate: this.audioBuffer.sampleRate,
                frequency: detectedFreq
            }, [phaseSlice.buffer]);
        }

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
    
    // Connect Source -> Phase Delay -> PreGain
    if (this.phaseDelayNode) {
        this.source.connect(this.phaseDelayNode);
    }

    const startOffset = this.accumulatedBufferTime % this.audioBuffer.duration;

    this.applyTuning(this.currentTargetFrequency, true);
    
    // Apply initial Phase Lock if enabled
    if (this.phaseLockEnabled && this.phaseDelayNode) {
        this.phaseDelayNode.delayTime.setValueAtTime(this.detectedPhaseOffset, this.context.currentTime);
    }
    
    if (this.binauralActive) {
        this.startBinauralOscillators();
    }

    this.source.start(0, startOffset);
    
    this.lastTimestamp = this.context.currentTime;
    this.isPlaying = true;

    this.source.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.accumulatedBufferTime = 0; 
        this.stopBinauralOscillators();
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
    this.stopBinauralOscillators();
  }

  public stop() {
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    this.accumulatedBufferTime = 0;
    this.isPlaying = false;
    this.stopBinauralOscillators();
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

  public toggleBypass(active: boolean) {
      if (!this.source || !this.context) return;
      
      const now = this.context.currentTime;
      
      if (active) {
          this.source.playbackRate.cancelScheduledValues(now);
          this.source.playbackRate.setValueAtTime(1.0, now);
          
          this.bodyFilter!.gain.setTargetAtTime(0, now, 0.05);
          this.resonanceFilter!.gain.setTargetAtTime(0, now, 0.05);
          // Bypass Harmonics
          this.harmonicFilters.forEach(f => f.gain.setTargetAtTime(0, now, 0.05));
          // Bypass Sub Bass
          if (this.subGain) this.subGain.gain.setTargetAtTime(0, now, 0.05);

          this.airFilter!.gain.setTargetAtTime(0, now, 0.05);
          this.driveNode!.gain.setTargetAtTime(1.0, now, 0.05);
          
          // Disable Phase Lock in Bypass
          if (this.phaseDelayNode) this.phaseDelayNode.delayTime.setTargetAtTime(0, now, 0.05);
      } else {
          this.applyTuning(this.currentTargetFrequency, false);
      }
  }

  private updateBufferPosition() {
    if (!this.context || !this.isPlaying) return;
    
    const now = this.context.currentTime;
    const dt = now - this.lastTimestamp;
    const currentRate = this.source?.playbackRate.value || 1;
    this.accumulatedBufferTime += dt * currentRate;
    this.lastTimestamp = now;

    // Dynamic Phase Soft-Lock Logic
    if (this.phaseLockEnabled && this.source) {
        // Golden Cycle Length (s)
        const T = this.PHI; 
        const cyclePos = this.accumulatedBufferTime % T;
        
        const targetRate = this.currentTargetFrequency / (this.sourceReferencePitch || 440);
        let nudge = 0;

        if (cyclePos < 0.1) {
            nudge = -0.002;
        } else if (cyclePos > T - 0.1) {
            nudge = 0.002;
        }

        this.source.playbackRate.setTargetAtTime(targetRate + nudge, now, 0.5);
    }
  }

  private applyTuning(targetFreq: number, instant = false) {
    if (!this.source || !this.context || !this.bodyFilter || !this.resonanceFilter || !this.airFilter || !this.driveNode) return;
    
    const now = this.context.currentTime;
    const srcPitch = this.sourceReferencePitch || 440;
    
    let ratio = targetFreq / srcPitch;
    
    if (this.fibonacciAlignmentMode && !instant) {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.frequency.value = 1 / this.PHI; 
        gain.gain.value = 0.001; 
        
        osc.connect(gain);
        gain.connect(this.source.playbackRate);
        osc.start();
    }
    
    const isStandard = targetFreq === 440;
    
    const bodyGain = (!isStandard && !this.eqBypass.body) ? 0.6 : 0;       
    const resonanceGain = (!isStandard && !this.eqBypass.resonance) ? 0.3 : 0;  
    const airGain = (!isStandard && !this.eqBypass.air) ? 0.5 : 0;       
    const driveGain = !isStandard ? 0.95 : 1.0; 
    const phaseOffset = (this.phaseLockEnabled && !isStandard) ? this.detectedPhaseOffset : 0;

    try {
        const currentRate = this.source.playbackRate.value;
        this.source.playbackRate.cancelScheduledValues(now);
        this.source.playbackRate.setValueAtTime(currentRate, now);
        
        const currentBody = this.bodyFilter.gain.value;
        this.bodyFilter.gain.cancelScheduledValues(now);
        this.bodyFilter.gain.setValueAtTime(currentBody, now);
        
        const currentRes = this.resonanceFilter.gain.value;
        this.resonanceFilter.gain.cancelScheduledValues(now);
        this.resonanceFilter.gain.setValueAtTime(currentRes, now);
        
        const currentAir = this.airFilter.gain.value;
        this.airFilter.gain.cancelScheduledValues(now);
        this.airFilter.gain.setValueAtTime(currentAir, now);
        
        const currentDrive = this.driveNode.gain.value;
        this.driveNode.gain.cancelScheduledValues(now);
        this.driveNode.gain.setValueAtTime(currentDrive, now);

        if (this.phaseDelayNode) {
            this.phaseDelayNode.delayTime.setTargetAtTime(phaseOffset, now, 0.2);
        }

    } catch(e) {
        // Fallback if nodes are not ready
        console.warn("Error setting automation anchors", e);
    }
    
    // Update Harmonics based on current bass or target if no bass (less ideal but needed fallback)
    const root = this.lastDetectedBass > 20 ? this.lastDetectedBass : 60;
    this.updateHarmonicFilters(root);

    if (instant) {
      this.source.playbackRate.value = ratio;
      this.bodyFilter.gain.value = bodyGain;
      this.resonanceFilter.gain.value = resonanceGain;
      this.airFilter.gain.value = airGain;
      this.driveNode.gain.value = driveGain;
    } else {
      const rampTime = 0.15; 
      this.source.playbackRate.linearRampToValueAtTime(ratio, now + rampTime);
      this.bodyFilter.gain.linearRampToValueAtTime(bodyGain, now + rampTime);
      this.resonanceFilter.gain.linearRampToValueAtTime(resonanceGain, now + rampTime);
      this.airFilter.gain.linearRampToValueAtTime(airGain, now + rampTime);
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

  public async exportAudio(targetFreq: number, settings?: AudioSettings): Promise<Blob> {
    if (!this.audioBuffer) throw new Error("No audio buffer loaded");
    
    return this.processOffline(
      this.audioBuffer,
      targetFreq,
      this.lastDetectedBass,
      this.sourceReferencePitch,
      settings
    );
  }

  // --- Offline Rendering for Batch Support ---
  
  public async processOffline(
      buffer: AudioBuffer, 
      targetFreq: number, 
      detectedBass: number = 0, 
      sourcePitch: number = 440,
      settings?: AudioSettings
  ): Promise<Blob> {
    const srcPitch = sourcePitch;
    const ratio = targetFreq / srcPitch;
    const outputDuration = buffer.duration / ratio;
    const sampleRate = buffer.sampleRate;

    const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    
    const offlineCtx = new OfflineContextClass(
      buffer.numberOfChannels,
      Math.ceil(outputDuration * sampleRate),
      sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = ratio;

    const phaseDelay = offlineCtx.createDelay(1.0);
    // Use the stored detected phase offset if available, otherwise 0
    // Note: In a real batch scenario, we would need to re-detect phase per file.
    // For now, if we are exporting the *current* file, this works.
    const phaseOffset = (settings?.phaseLockEnabled && targetFreq !== 440) ? this.detectedPhaseOffset : 0;
    phaseDelay.delayTime.value = phaseOffset;

    const preGain = offlineCtx.createGain();
    preGain.gain.value = 0.707;

    let expBody = 60;
    let expRes = 432;
    let expAir = 16000;

    if (this.sacredGeometryMode && detectedBass >= 20) {
       expBody = detectedBass;
       expRes = detectedBass * Math.pow(this.PHI, 3);
       expAir = detectedBass * Math.pow(this.PHI, 7);
       
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
    
    // --- Offline Harmonic Chain ---
    const offlineHarmonicFilters: BiquadFilterNode[] = [];
    let root = detectedBass > 20 ? detectedBass : 60;
    
    // Use settings from arg or instance defaults
    const warmth = settings ? settings.harmonicWarmth : this.harmonicWarmth;
    const clarity = settings ? settings.harmonicClarity : this.harmonicClarity;

    for(let i=0; i<8; i++) {
        const f = offlineCtx.createBiquadFilter();
        f.type = 'peaking';
        f.Q.value = 4.0;
        
        const order = i + 1;
        const targetF = root * order;
        
        f.frequency.value = Math.min(targetF, sampleRate / 2);
        
        let targetGain = 0;
        const isEven = order % 2 === 0;
        if (isEven) {
             const decay = 1 - (i * 0.1); 
             targetGain = warmth * 9 * Math.max(0.2, decay);
        } else if (order > 1) {
             targetGain = clarity * 8;
        }
        
        f.gain.value = targetGain;
        offlineHarmonicFilters.push(f);
    }
    
    // --- Offline Deep Zen Bass ---
    const subLowpass = offlineCtx.createBiquadFilter();
    subLowpass.type = 'lowpass';
    subLowpass.frequency.value = 90;
    
    const subShaper = offlineCtx.createWaveShaper();
    subShaper.curve = this.makeSubHarmonicCurve(4096);
    subShaper.oversample = '4x';
    
    const subHarmonicFilter = offlineCtx.createBiquadFilter();
    subHarmonicFilter.type = 'bandpass';
    subHarmonicFilter.frequency.value = 180;
    subHarmonicFilter.Q.value = 1.5;
    
    const subGain = offlineCtx.createGain();
    const subAmount = settings ? settings.deepZenBass : 0;
    subGain.gain.value = subAmount * 2.0;

    const msSplitter = offlineCtx.createChannelSplitter(2);
    const msMerger = offlineCtx.createChannelMerger(2);
    
    const midSum = offlineCtx.createGain(); midSum.gain.value = 0.5;
    const sideDiff = offlineCtx.createGain(); sideDiff.gain.value = 0.5;
    const sideInvert = offlineCtx.createGain(); sideInvert.gain.value = -0.5;

    const airFilter = offlineCtx.createBiquadFilter();
    airFilter.type = 'highshelf';
    airFilter.frequency.value = expAir;
    airFilter.gain.value = (!isStandard && !this.eqBypass.air) ? 0.5 : 0;

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

    // --- Wire up Offline Chain ---
    source.connect(phaseDelay);
    phaseDelay.connect(preGain); 
    preGain.connect(bodyFilter);
    bodyFilter.connect(resonanceFilter);
    
    // Inject Harmonics
    let currentNode: AudioNode = resonanceFilter;
    for(const hf of offlineHarmonicFilters) {
        currentNode.connect(hf);
        currentNode = hf;
    }
    
    // Wire Deep Zen Bass (Parallel)
    // Tap from resonanceFilter (post EQ)
    resonanceFilter.connect(subLowpass);
    subLowpass.connect(subShaper);
    subShaper.connect(subHarmonicFilter);
    subHarmonicFilter.connect(subGain);
    
    // Mix both chains into MS Splitter
    currentNode.connect(msSplitter);
    subGain.connect(msSplitter);

    msSplitter.connect(midSum, 0); 
    msSplitter.connect(midSum, 1); 
    
    msSplitter.connect(sideDiff, 0);   
    msSplitter.connect(sideInvert, 1); 
    sideInvert.connect(sideDiff);      

    sideDiff.connect(airFilter);
    airFilter.connect(sideGainNode);

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

    msMerger.connect(driveNode);
    driveNode.connect(saturator);
    saturator.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(offlineCtx.destination);

    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    return this.bufferToWav(renderedBuffer);
  }

  // --- Psychoacoustic Shaped Dithering ---
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
    
    const errors = new Float32Array(numOfChan).fill(0);

    while (pos < buffer.length) {
      for (i = 0; i < numOfChan; i++) {
        const input = channels[i][pos];
        const dither = (Math.random() - Math.random()) * (0.5 / 32768); 
        const shapedInput = input + dither + (errors[i] * 0.5); 
        
        let sampleClamped = Math.max(-1, Math.min(1, shapedInput));
        let sampleInt = sampleClamped < 0 ? sampleClamped * 32768 : sampleClamped * 32767;
        let outputInt = Math.round(sampleInt);

        const quantizedFloat = outputInt / (outputInt < 0 ? 32768 : 32767);
        errors[i] = sampleClamped - quantizedFloat;

        view.setInt16(offset, outputInt, true);
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