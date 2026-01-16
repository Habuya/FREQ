
import { TuningPreset, SaturationType, AudioSettings } from '../types';
import { logger } from './logger';

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
    // Graceful fallback if OfflineAudioContext is not available in Worker
    if (!OfflineContextClass) return 0;

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
  
  // --- Parallel DJ Crossfader System ---
  private crossfadeDry: GainNode | null = null; // Path A (Original/440Hz)
  private crossfadeWet: GainNode | null = null; // Path B (Pi 23 Tuning)

  // --- Sacred Geometry Constants & State ---
  private readonly PHI = 1.61803398875;
  private sacredGeometryMode: boolean = false;
  private fibonacciAlignmentMode: boolean = false;
  private phaseLockEnabled: boolean = false;
  private detectedPhaseOffset: number = 0;

  private lastDetectedBass: number = 0;
  private _isBassEstimated: boolean = false;
  
  // --- Organic Automation (Breathing) ---
  private breathingEnabled: boolean = false;
  private breathingIntensity: number = 0;
  private breathingInterval: number | null = null;
  private baseResonanceFreq: number = 432;
  
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
  
  // --- Formant / Timbre Control ---
  private timbreMorph: number = 1.0; // 1.0 = Neutral

  // --- Space Resonance (Harmonic Reverb) ---
  private spaceResonance: number = 0; // 0.0 - 1.0
  private roomScale: number = 0.5; // 0.0 - 1.0
  private reverbInput: GainNode | null = null;
  private reverbOutput: GainNode | null = null;
  private reverbDelay: DelayNode | null = null;
  private reverbFeedback: GainNode | null = null;
  private reverbFilters: BiquadFilterNode[] = []; // Filters in the feedback loop
  
  // --- Adaptive Auto-EQ (Pink Noise Matching) ---
  private autoEqEnabled: boolean = false;
  private autoEqIntensity: number = 0.5; // Default intensity
  private autoEqLow: BiquadFilterNode | null = null; // 250Hz Peak
  private autoEqMid: BiquadFilterNode | null = null; // 1kHz Peak
  private autoEqHigh: BiquadFilterNode | null = null; // 4kHz Peak
  private autoTilt: BiquadFilterNode | null = null; // 2.5kHz Shelf (Tilt simulator)
  private spectralBalanceScore: number = 100; // 0-100%
  private autoEqInterval: number | null = null;
  
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
  private resonanceFilter: BiquadFilterNode | null = null; // Also acts as Spectral Envelope Follower
  
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
    logger.info('Audio Context Constructed', 'DSP_INIT');

    // Initialize Web Worker with Blob
    if (window.Worker) {
        try {
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            
            this.worker = new Worker(workerUrl);
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = (e) => {
                console.warn("Worker error:", e);
                logger.error('DSP Worker encountered an error', 'WORKER_ERR');
            };
            logger.info('DSP Analysis Worker Thread Spawned', 'WORKER_OK');
        } catch (e) {
            console.error("Failed to initialize audio worker:", e);
            logger.error('Failed to spawn DSP Worker', 'WORKER_FAIL');
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
    
    // --- Adaptive Auto-EQ Init ---
    this.autoEqLow = this.context.createBiquadFilter();
    this.autoEqLow.type = 'peaking';
    this.autoEqLow.frequency.value = 250;
    this.autoEqLow.Q.value = 1.0;
    this.autoEqLow.gain.value = 0;

    this.autoEqMid = this.context.createBiquadFilter();
    this.autoEqMid.type = 'peaking';
    this.autoEqMid.frequency.value = 1000;
    this.autoEqMid.Q.value = 1.0;
    this.autoEqMid.gain.value = 0;

    this.autoEqHigh = this.context.createBiquadFilter();
    this.autoEqHigh.type = 'peaking';
    this.autoEqHigh.frequency.value = 4000;
    this.autoEqHigh.Q.value = 1.0;
    this.autoEqHigh.gain.value = 0;
    
    this.autoTilt = this.context.createBiquadFilter();
    this.autoTilt.type = 'highshelf';
    this.autoTilt.frequency.value = 2500;
    this.autoTilt.gain.value = 0;

    // --- Harmonic Filters Init (8 Bands) ---
    for(let i=0; i<8; i++) {
        const f = this.context.createBiquadFilter();
        f.type = 'peaking';
        f.Q.value = 4.0; 
        f.gain.value = 0;
        this.harmonicFilters.push(f);
    }
    
    // --- Space Resonance (Harmonic Reverb) Init ---
    this.reverbInput = this.context.createGain();
    this.reverbOutput = this.context.createGain();
    this.reverbOutput.gain.value = 0;
    
    this.reverbDelay = this.context.createDelay(2.0); // Allow up to 2s
    this.reverbDelay.delayTime.value = 0.05; // Default, updated on tuning
    
    this.reverbFeedback = this.context.createGain();
    this.reverbFeedback.gain.value = 0.45; // Controlled feedback
    
    // Create 3 parallel filters for the feedback loop (Harmonics 2, 3, 5)
    // Note: We use 'peaking' to allow broad spectrum decay but resonate specific harmonics
    for(let i=0; i<3; i++) {
        const f = this.context.createBiquadFilter();
        f.type = 'peaking'; 
        f.Q.value = 4.0; // Sharp resonance
        f.gain.value = 6.0; // Boost harmonics in the feedback loop
        this.reverbFilters.push(f);
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
    
    // --- CROSSFADE INIT (DJ-Feel) ---
    this.crossfadeDry = this.context.createGain();
    this.crossfadeWet = this.context.createGain();
    
    // Set default to Wet (Processed)
    this.crossfadeDry.gain.value = 0;
    this.crossfadeWet.gain.value = 1;

    // --- ROUTING / WIRING ---
    // Chain: PhaseDelay -> PreGain -> Body -> Resonance
    this.phaseDelayNode.connect(this.preGainNode);
    this.preGainNode.connect(this.bodyFilter);
    this.bodyFilter.connect(this.resonanceFilter);
    
    // NEW: Insert Auto-EQ Chain after Resonance
    this.resonanceFilter.connect(this.autoEqLow);
    this.autoEqLow.connect(this.autoEqMid);
    this.autoEqMid.connect(this.autoEqHigh);
    this.autoEqHigh.connect(this.autoTilt);

    // Connect AutoEQ -> Harmonic Chain
    let currentNode: AudioNode = this.autoTilt;
    
    for (const hFilter of this.harmonicFilters) {
        currentNode.connect(hFilter);
        currentNode = hFilter;
    }
    
    // --- Harmonic Reverb (Space Resonance) Tap ---
    // Tap signal AFTER AutoEQ/Resonance but before Harmonics/MS
    this.autoTilt.connect(this.reverbInput);
    this.reverbInput.connect(this.reverbDelay);
    
    // Reverb Loop: Delay -> Filters -> Feedback Gain -> Delay
    this.reverbFilters.forEach(filter => {
        this.reverbDelay!.connect(filter);
        filter.connect(this.reverbFeedback!);
        // Also sum to output
        filter.connect(this.reverbOutput!);
    });
    
    // Close the loop
    this.reverbFeedback.connect(this.reverbDelay);
    
    // --- Deep Zen Bass Tap ---
    // Tap off after EQ
    this.autoTilt.connect(this.subLowpass);
    this.subLowpass.connect(this.subShaper);
    this.subShaper.connect(this.subHarmonicFilter);
    this.subHarmonicFilter.connect(this.subGain);
    
    // Mix Harmonics Chain + Sub Chain + Reverb into MS Splitter
    currentNode.connect(this.msSplitter);
    this.subGain.connect(this.msSplitter); 
    this.reverbOutput.connect(this.msSplitter); 

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
    
    // --- CROSSFADE FINAL STAGE ---
    // Wet Path (Processed)
    this.compressor.connect(this.crossfadeWet);
    this.binauralGain.connect(this.crossfadeWet); // Binaural is part of FX
    
    // Dry Path is connected dynamically in play() from source -> crossfadeDry
    
    // Sum to Master Gain
    this.crossfadeWet.connect(this.gainNode);
    this.crossfadeDry.connect(this.gainNode);
    
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    
    logger.info('Audio Graph Build Complete', 'DSP_BUILD');
  }
  
  public getContext(): AudioContext | null {
      return this.context;
  }

  public async resumeContext() {
      if (this.context && this.context.state === 'suspended') {
          await this.context.resume();
          logger.info('Audio Context Resumed', 'CTX_RESUME');
      }
  }

  // ... (Worker Handling and other methods remain the same) ...

  private handleWorkerMessage(e: MessageEvent) {
    const { id, success, result, error } = e.data;
    if (this.workerCallbacks.has(id)) {
      const callback = this.workerCallbacks.get(id)!;
      if (success) {
        callback.resolve(result);
      } else {
        logger.warn(`DSP Worker Job ${id} Failed: ${error}`, 'WORKER_JOB_FAIL');
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
  
  // --- DJ CROSSFADER LOGIC ---
  public setCrossfade(value: number) {
      if (!this.crossfadeDry || !this.crossfadeWet || !this.context) return;
      
      const clamped = Math.max(0, Math.min(1, value));
      const now = this.context.currentTime;
      
      // Constant Power Curve
      const gainA = Math.cos(clamped * 0.5 * Math.PI); // Dry
      const gainB = Math.sin(clamped * 0.5 * Math.PI); // Wet (Pi 23)
      
      this.crossfadeDry.gain.setTargetAtTime(gainA, now, 0.05);
      this.crossfadeWet.gain.setTargetAtTime(gainB, now, 0.05);
  }

  // Getter for the estimation flag
  public get isBassEstimated(): boolean {
      return this._isBassEstimated;
  }

  public async detectInherentTuning(sensitivity: number, buffer: AudioBuffer | null = null): Promise<number> {
    const targetBuffer = buffer || this.audioBuffer;
    if (!targetBuffer || !this.worker) return 440;

    logger.info(`Starting tuning detection (Sensitivity: ${sensitivity})`, 'TUNE_SCAN_START');

    try {
        const startOffsetTime = Math.min(targetBuffer.duration * 0.2, 10);
        const startSample = Math.floor(startOffsetTime * targetBuffer.sampleRate);
        const lengthSamples = Math.min(
            Math.floor(5 * targetBuffer.sampleRate), 
            targetBuffer.length - startSample
        );
        
        if (lengthSamples <= 0) return 440;
        
        const slice = targetBuffer.getChannelData(0).slice(startSample, startSample + lengthSamples);

        const result = await this.runWorkerTask<number>(
            'DETECT_TUNING', 
            { 
                data: slice, 
                sampleRate: targetBuffer.sampleRate, 
                sensitivity 
            },
            [slice.buffer] 
        );
        logger.success(`Tuning detected: ${result.toFixed(2)}Hz`, 'TUNE_SCAN_OK');
        return result;

    } catch(e) {
        console.warn("Tuning detection failed", e);
        logger.error('Tuning detection failed', 'TUNE_SCAN_ERR');
        return 440;
    }
  }

  public async detectBassRoot(sensitivity: number = 50, buffer: AudioBuffer | null = null, updateState: boolean = true): Promise<number> {
    const targetBuffer = buffer || this.audioBuffer;
    if (!targetBuffer || !this.worker) return 0;
    
    logger.info(`Starting bass root detection`, 'BASS_SCAN_START');

    try {
        const scanDuration = 6;
        const startOffsetTime = Math.min(targetBuffer.duration * 0.2, 10);
        const startSample = Math.floor(startOffsetTime * targetBuffer.sampleRate);
        const lengthSamples = Math.min(
            Math.floor(scanDuration * targetBuffer.sampleRate), 
            targetBuffer.length - startSample
        );
        
        if (lengthSamples <= 0) return 0;
        const slice = targetBuffer.getChannelData(0).slice(startSample, startSample + lengthSamples);
        
        let maxAmp = 0;
        for(let i=0; i<slice.length; i++) {
            const abs = Math.abs(slice[i]);
            if(abs > maxAmp) maxAmp = abs;
        }
        
        if(maxAmp > 0.001) {
             const scaler = 0.8 / maxAmp;
             for(let i=0; i<slice.length; i++) slice[i] *= scaler;
        }

        let detectedFreq = await this.runWorkerTask<number>(
            'DETECT_BASS', 
            { 
                data: slice, 
                sampleRate: targetBuffer.sampleRate, 
                sensitivity 
            },
            [slice.buffer] 
        );
        
        // --- Fallback & Estimation Logic ---
        if (detectedFreq < 20) {
            detectedFreq = 60; 
            this._isBassEstimated = true;
            logger.warn('Bass detection low confidence, using 60Hz fallback', 'BASS_FALLBACK');
        } else {
            this._isBassEstimated = false;
            logger.success(`Bass root found: ${detectedFreq.toFixed(2)}Hz`, 'BASS_SCAN_OK');
        }
        
        if (updateState) {
            this.lastDetectedBass = detectedFreq;
            this.applyGoldenRatioEQ(detectedFreq);
            this.updateHarmonicFilters(detectedFreq); 
            
            if (!this._isBassEstimated && detectedFreq > 20) {
                const phaseSlice = targetBuffer.getChannelData(0).slice(0, 4096);
                this.detectedPhaseOffset = await this.runWorkerTask<number>('DETECT_PHASE', {
                    data: phaseSlice,
                    sampleRate: targetBuffer.sampleRate,
                    frequency: detectedFreq
                }, [phaseSlice.buffer]);
                logger.info(`Phase lock offset calculated: ${this.detectedPhaseOffset.toFixed(4)}s`, 'PHASE_CALC');
            } else {
                this.detectedPhaseOffset = 0;
            }
        }

        return detectedFreq;

    } catch(e) {
        console.warn("Bass detection failed, using fallback", e);
        if (updateState) {
             this.lastDetectedBass = 60;
             this._isBassEstimated = true;
             this.applyGoldenRatioEQ(60);
        }
        return 60;
    }
  }

  public setBreathingEnabled(enabled: boolean, intensity: number) {
    this.breathingEnabled = enabled;
    this.breathingIntensity = intensity;
    
    if (this.isPlaying) {
        if (enabled && !this.breathingInterval) {
            this.startBreathingLoop();
        } else if (!enabled && this.breathingInterval) {
            this.stopBreathingLoop();
            if (this.sideGainNode && this.context) {
                this.sideGainNode.gain.setTargetAtTime(this.currentStereoWidth, this.context.currentTime, 0.5);
            }
            if (this.resonanceFilter && this.context) {
                this.resonanceFilter.frequency.setTargetAtTime(this.baseResonanceFreq, this.context.currentTime, 0.5);
            }
        }
    }
  }
  
  private startBreathingLoop() {
      if (this.breathingInterval) clearInterval(this.breathingInterval);
      this.breathingInterval = window.setInterval(() => this.applyPhiAutomation(), 50);
  }
  
  private stopBreathingLoop() {
      if (this.breathingInterval) {
          clearInterval(this.breathingInterval);
          this.breathingInterval = null;
      }
  }

  private applyPhiAutomation() {
    if (!this.breathingEnabled || !this.context) return;
    
    const currentTime = this.context.currentTime;
    const cycle = (currentTime / this.PHI) % 1;
    const lfo = Math.pow(Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5, 1.5);
    const modulation = lfo * this.breathingIntensity;

    if (this.sideGainNode) {
        const currentWidth = this.currentStereoWidth; 
        const modulatedWidth = currentWidth + (modulation * 0.5); 
        this.sideGainNode.gain.setTargetAtTime(modulatedWidth, currentTime, 0.1);
    }

    if (this.resonanceFilter && !this.eqBypass.resonance) {
        const baseFreq = this.baseResonanceFreq;
        const drift = baseFreq * (0.02 * modulation);
        this.resonanceFilter.frequency.setTargetAtTime(baseFreq + drift, currentTime, 0.2);
    }
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
  }

  public setSpaceResonance(amount: number) {
      if (!this.context || !this.reverbOutput) return;
      this.spaceResonance = amount;
      this.reverbOutput.gain.setTargetAtTime(amount * 0.8, this.context.currentTime, 0.1);
  }

  public setRoomScale(amount: number) {
      if (!this.context || !this.reverbFeedback) return;
      this.roomScale = amount;
      const fb = Math.min(amount * 0.9, 0.9);
      this.reverbFeedback.gain.setTargetAtTime(fb, this.context.currentTime, 0.1);
  }
  
  public setAutoEqEnabled(enabled: boolean) {
      this.autoEqEnabled = enabled;
      
      if (enabled) {
          if (!this.autoEqInterval) {
              this.autoEqInterval = window.setInterval(() => this.updateAutoEq(), 200);
          }
      } else {
          if (this.autoEqInterval) {
              clearInterval(this.autoEqInterval);
              this.autoEqInterval = null;
          }
          const now = this.context?.currentTime || 0;
          this.autoEqLow?.gain.setTargetAtTime(0, now, 0.5);
          this.autoEqMid?.gain.setTargetAtTime(0, now, 0.5);
          this.autoEqHigh?.gain.setTargetAtTime(0, now, 0.5);
          this.autoTilt?.gain.setTargetAtTime(0, now, 0.5);
          this.spectralBalanceScore = 100;
      }
  }
  
  public setAutoEqIntensity(intensity: number) {
      this.autoEqIntensity = intensity;
  }
  
  private updateAutoEq() {
      if (!this.analyser || !this.context) return;
      
      const fftSize = this.analyser.fftSize;
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);
      
      const sampleRate = this.context.sampleRate;
      const binWidth = sampleRate / fftSize;
      
      const b1 = this.getBandEnergy(dataArray, 60, 250, binWidth);
      const b2 = this.getBandEnergy(dataArray, 250, 1000, binWidth);
      const b3 = this.getBandEnergy(dataArray, 1000, 4000, binWidth);
      const b4 = this.getBandEnergy(dataArray, 4000, 16000, binWidth);
      
      const maxVal = Math.max(b1, b2, b3, b4, 1);
      const n1 = b1 / maxVal;
      const n2 = b2 / maxVal;
      const n3 = b3 / maxVal;
      const n4 = b4 / maxVal;
      
      const t1 = 1.0;
      const t2 = 0.95;
      const t3 = 0.85;
      const t4 = 0.7;
      
      const diff1 = n1 - t1;
      const diff2 = n2 - t2;
      const diff3 = n3 - t3;
      const diff4 = n4 - t4;
      
      const variance = Math.sqrt((diff1*diff1 + diff2*diff2 + diff3*diff3 + diff4*diff4) / 4);
      this.spectralBalanceScore = Math.max(0, 100 - (variance * 200)); 
      
      if (!this.autoEqEnabled) return;
      
      const now = this.context.currentTime;
      const smooth = 0.8; 
      
      const intensity = this.autoEqIntensity;

      let gLow = 0;
      if (n1 < n2 * 0.85) gLow = 2.5; 
      else if (n1 > n2 * 1.25) gLow = -2.5;
      this.autoEqLow?.gain.setTargetAtTime(gLow * intensity, now, smooth);
      
      let gMid = 0;
      if (n2 < n3 * 0.9) gMid = 1.5;
      else if (n2 > n3 * 1.3) gMid = -1.5;
      this.autoEqMid?.gain.setTargetAtTime(gMid * intensity, now, smooth);
      
      let gHigh = 0;
      if (n3 < n4) gHigh = -2; 
      else if (n3 > n4 * 2) gHigh = 2; 
      this.autoEqHigh?.gain.setTargetAtTime(gHigh * intensity, now, smooth);
      
      let gTilt = 0;
      if (n4 < 0.4) gTilt = 2.0; 
      else if (n4 > 0.85) gTilt = -2.0; 
      this.autoTilt?.gain.setTargetAtTime(gTilt * intensity, now, smooth);
  }
  
  private getBandEnergy(data: Uint8Array, fStart: number, fEnd: number, binWidth: number): number {
      const startBin = Math.floor(fStart / binWidth);
      const endBin = Math.floor(fEnd / binWidth);
      let sum = 0;
      let count = 0;
      
      for(let i=startBin; i<endBin && i<data.length; i++) {
          sum += data[i];
          count++;
      }
      return count > 0 ? sum / count : 0;
  }
  
  public getSpectralBalanceScore(): number {
      return this.spectralBalanceScore;
  }

  public setPhaseLockEnabled(active: boolean) {
      this.phaseLockEnabled = active;
      if (this.phaseDelayNode && this.context) {
          const now = this.context.currentTime;
          if (active) {
              this.phaseDelayNode.delayTime.setTargetAtTime(this.detectedPhaseOffset, now, 0.2);
              logger.info('Phase lock engaged', 'PHASE_LOCK_ON');
          } else {
              this.phaseDelayNode.delayTime.setTargetAtTime(0, now, 0.2);
              logger.info('Phase lock disengaged', 'PHASE_LOCK_OFF');
          }
      }
  }
  
  public setHarmonicShaping(warmth: number, clarity: number, timbreMorph: number) {
      this.harmonicWarmth = warmth;
      this.harmonicClarity = clarity;
      this.timbreMorph = timbreMorph;
      
      const root = this.lastDetectedBass > 20 ? this.lastDetectedBass : 60;
      this.updateHarmonicFilters(root);
      
      if (this.isPlaying) {
          this.applyTuning(this.currentTargetFrequency, false);
      }
  }

  private calculateFormantCorrection(targetFreq: number, sourcePitch: number): number {
      const ratio = targetFreq / (sourcePitch || 440);
      const preservationFactor = 1 / ratio;
      return this.timbreMorph;
  }

  private updateHarmonicFilters(rootFreq: number) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const nyquist = this.context.sampleRate / 2;
      
      const morph = this.timbreMorph;

      this.harmonicFilters.forEach((filter, index) => {
          const harmonicOrder = index + 1; 
          
          const targetFreq = (rootFreq * harmonicOrder) * morph;
          
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

  private updateHarmonicReverb(targetFreq: number) {
    if (!this.context || !this.reverbDelay) return;
    const now = this.context.currentTime;

    const period = 1 / targetFreq;
    const delayTime = period * 21; 

    this.reverbDelay.delayTime.setTargetAtTime(delayTime, now, 0.2);

    const harmonics = [2, 3, 5];
    
    this.reverbFilters.forEach((filter, i) => {
        if (harmonics[i]) {
             const freq = (targetFreq * harmonics[i]) * this.timbreMorph;
             const safeFreq = Math.min(freq, this.context!.sampleRate / 2 - 1000);
             filter.frequency.setTargetAtTime(safeFreq, now, 0.2);
        }
    });
  }

  public setBinauralMode(active: boolean, beatFreq: number = 8) {
      const wasActive = this.binauralActive;
      this.binauralActive = active;
      this.binauralBeatFreq = beatFreq;
      
      if (this.isPlaying) {
          if (active) {
              if (wasActive && this.binauralOscRight && this.context) {
                  const now = this.context.currentTime;
                  const rootFreq = this.lastDetectedBass > 30 ? this.lastDetectedBass : 60; 
                  const targetFreq = rootFreq + this.binauralBeatFreq;
                  this.binauralOscRight.frequency.setTargetAtTime(targetFreq, now, 0.1);
              } else {
                  this.startBinauralOscillators();
              }
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
    
    targetRes = targetRes * this.timbreMorph;
    
    this.baseResonanceFreq = targetRes;

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
        let y = x;
        if (Math.abs(x) > 0.1) {
            y = x + (0.2 * x * x); 
        }
        
        curve[i] = Math.tanh(y * 2.0) * 0.8; 
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
    
    await this.resumeContext(); // Ensure context is awake on user interaction

    this.stop();
    this.accumulatedBufferTime = 0;
    this.sourceReferencePitch = 440;
    this.lastDetectedBass = 0;
    this.detectedPhaseOffset = 0;
    this._isBassEstimated = false; 
    
    logger.info(`Loading file: ${file.name} (${(file.size/1024/1024).toFixed(2)}MB)`, 'FILE_LOAD');
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await this.context.decodeAudioData(arrayBuffer);
        this.audioBuffer = decodedBuffer;
        logger.success('File decoded successfully', 'FILE_DECODE_OK');
        return decodedBuffer;
    } catch (e) {
        logger.error(`File load failed: ${e.message}`, 'FILE_LOAD_ERR');
        throw e;
    }
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
    this._isBassEstimated = false;
    this.audioBuffer = buffer;
    logger.info('Audio buffer set from cache', 'BUFFER_SET');
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

  public setTargetFrequency(freq: number) {
    this.currentTargetFrequency = freq;
    if (this.isPlaying) {
      this.applyTuning(freq, false);
    }
    logger.info(`Target frequency set: ${freq}Hz`, 'TARGET_SET');
  }

  public applyTuning(targetFreq: number, restart: boolean = false) {
    if (!this.context) return;
    const ratio = targetFreq / (this.sourceReferencePitch || 440);
    if (this.source && this.isPlaying) {
      this.source.playbackRate.setTargetAtTime(ratio, this.context.currentTime, 0.1);
    }
    if (this.sacredGeometryMode) {
      this.applyGoldenRatioEQ(this.lastDetectedBass);
    }
    this.updateHarmonicReverb(targetFreq);
  }

  public play(onEnded?: () => void) {
    if (!this.context || !this.audioBuffer) return;
    if (this.context.state === 'suspended') this.context.resume();
    
    this.stop(true); 
    
    const source = this.context.createBufferSource();
    this.source = source;
    this.source.buffer = this.audioBuffer;
    
    const ratio = this.currentTargetFrequency / (this.sourceReferencePitch || 440);
    this.source.playbackRate.value = ratio;
    
    if (this.phaseDelayNode) {
      this.source.connect(this.phaseDelayNode); 
    }
    if (this.crossfadeDry) {
        this.source.connect(this.crossfadeDry); 
    }
    
    // CRITICAL FIX: Identity check to prevent race conditions with rapid play/stop
    this.source.onended = () => {
      if (this.source === source && this.isPlaying) {
        this.isPlaying = false;
        this.accumulatedBufferTime = 0;
        if (onEnded) onEnded();
      }
    };
    
    const startTime = 0; 
    const offset = Math.min(this.accumulatedBufferTime, this.audioBuffer.duration);
    
    this.source.start(startTime, offset);
    
    this.isPlaying = true;
    this.lastTimestamp = this.context.currentTime;
    
    if (this.breathingEnabled) this.setBreathingEnabled(true, this.breathingIntensity);
    if (this.autoEqEnabled) this.setAutoEqEnabled(true);
    
    this.updateHarmonicReverb(this.currentTargetFrequency);
    logger.info('Playback started', 'PLAY');
  }

  public pause() {
    if (!this.isPlaying || !this.context) return;
    
    const now = this.context.currentTime;
    const ratio = this.currentTargetFrequency / (this.sourceReferencePitch || 440);
    const elapsed = now - this.lastTimestamp;
    
    this.accumulatedBufferTime += (elapsed * ratio);
    this.stop(true);
    logger.info('Playback paused', 'PAUSE');
  }

  public stop(retainPosition: boolean = false) {
    if (this.source) {
      try { this.source.stop(); } catch(e) {}
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
    
    if (!retainPosition) {
      this.accumulatedBufferTime = 0;
    }
    
    this.stopBreathingLoop();
    if(this.autoEqInterval) {
      clearInterval(this.autoEqInterval);
      this.autoEqInterval = null;
    }
  }

  public getDuration(): number {
    return this.audioBuffer?.duration || 0;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public toggleBypass(bypass: boolean) {
      this.setCrossfade(bypass ? 0 : 1);
  }

  public async detectPhase(buffer: AudioBuffer, freq: number): Promise<number> {
     if (!this.worker) return 0;
     const slice = buffer.getChannelData(0).slice(0, 4096);
     return await this.runWorkerTask<number>('DETECT_PHASE', {
        data: slice,
        sampleRate: buffer.sampleRate,
        frequency: freq
     }, [slice.buffer]);
  }

  private async analyzeBufferSpectrum(buffer: AudioBuffer): Promise<{ low: number, mid: number, high: number, tilt: number }> {
      const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      const scanDuration = 4.0;
      const start = Math.min(buffer.duration * 0.4, buffer.duration - scanDuration);
      
      const ctx = new OfflineContextClass(1, scanDuration * buffer.sampleRate, buffer.sampleRate);
      const source = ctx.createBufferSource();
      
      const channelData = buffer.getChannelData(0).subarray(
          Math.floor(start * buffer.sampleRate), 
          Math.floor((start + scanDuration) * buffer.sampleRate)
      );
      
      const tempBuf = ctx.createBuffer(1, channelData.length, buffer.sampleRate);
      tempBuf.copyToChannel(channelData, 0);
      source.buffer = tempBuf;
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      
      source.connect(analyser);
      analyser.connect(ctx.destination);
      source.start(0);
      
      await ctx.startRendering();
      
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const binWidth = buffer.sampleRate / analyser.fftSize;
      
      const b1 = this.getBandEnergy(data, 60, 250, binWidth);
      const b2 = this.getBandEnergy(data, 250, 1000, binWidth);
      const b3 = this.getBandEnergy(data, 1000, 4000, binWidth);
      const b4 = this.getBandEnergy(data, 4000, 16000, binWidth);
      
      const maxVal = Math.max(b1, b2, b3, b4, 1);
      const n1 = b1 / maxVal;
      const n2 = b2 / maxVal;
      const n3 = b3 / maxVal;
      const n4 = b4 / maxVal;
      
      const intensity = this.autoEqIntensity;
      
      let gLow = 0;
      if (n1 < n2 * 0.85) gLow = 2.5; else if (n1 > n2 * 1.25) gLow = -2.5;

      let gMid = 0;
      if (n2 < n3 * 0.9) gMid = 1.5; else if (n2 > n3 * 1.3) gMid = -1.5;

      let gHigh = 0;
      if (n3 < n4) gHigh = -2; else if (n3 > n4 * 2) gHigh = 2;

      let gTilt = 0;
      if (n4 < 0.4) gTilt = 2.0; else if (n4 > 0.85) gTilt = -2.0;
      
      return { 
          low: gLow * intensity, 
          mid: gMid * intensity, 
          high: gHigh * intensity, 
          tilt: gTilt * intensity 
      };
  }

  public async processOffline(
      buffer: AudioBuffer,
      targetFreq: number,
      bassFreq: number,
      sourcePitch: number,
      settings: AudioSettings,
      phaseOffset: number
  ): Promise<Blob> {
       const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
       if (!OfflineContextClass) throw new Error("Offline Audio not supported");
       
       logger.info(`Starting offline processing for ${targetFreq}Hz target`, 'RENDER_START');
       
       const ratio = targetFreq / (sourcePitch || 440);
       const newLength = Math.ceil(buffer.length / ratio);
       const ctx = new OfflineContextClass(2, newLength, buffer.sampleRate); 
       
       let autoEqGains = { low: 0, mid: 0, high: 0, tilt: 0 };
       if (settings.autoEqEnabled) {
           autoEqGains = await this.analyzeBufferSpectrum(buffer);
       }

       const source = ctx.createBufferSource();
       source.buffer = buffer;
       source.playbackRate.value = ratio;
       
       const phaseDelay = ctx.createDelay(1.0);
       phaseDelay.delayTime.value = settings.phaseLockEnabled ? phaseOffset : 0;
       
       const preGain = ctx.createGain();
       preGain.gain.value = 0.707;
       
       const bodyFilter = ctx.createBiquadFilter();
       bodyFilter.type = 'lowshelf';
       bodyFilter.frequency.value = settings.sacredGeometryMode && bassFreq > 20 ? bassFreq : 60;
       bodyFilter.gain.value = settings.bypassBody ? 0 : 0; 
       
       const resFilter = ctx.createBiquadFilter();
       resFilter.type = 'peaking';
       let resFreq = 432;
       if (settings.sacredGeometryMode && bassFreq > 20) {
           resFreq = bassFreq * Math.pow(this.PHI, 3);
       }
       resFreq = resFreq * settings.timbreMorph; 
       resFilter.frequency.value = resFreq;
       resFilter.Q.value = 0.8;
       resFilter.gain.value = settings.bypassResonance ? 0 : 0;

       const eqLow = ctx.createBiquadFilter(); eqLow.type = 'peaking'; eqLow.frequency.value = 250; eqLow.Q.value = 1.0;
       eqLow.gain.value = autoEqGains.low;

       const eqMid = ctx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1.0;
       eqMid.gain.value = autoEqGains.mid;
       
       const eqHigh = ctx.createBiquadFilter(); eqHigh.type = 'peaking'; eqHigh.frequency.value = 4000; eqHigh.Q.value = 1.0;
       eqHigh.gain.value = autoEqGains.high;

       const eqTilt = ctx.createBiquadFilter(); eqTilt.type = 'highshelf'; eqTilt.frequency.value = 2500;
       eqTilt.gain.value = autoEqGains.tilt;

       const harmonicFilters: BiquadFilterNode[] = [];
       const nyquist = ctx.sampleRate / 2;
       
       let currentChainNode: AudioNode = eqTilt;
       
       source.connect(phaseDelay);
       phaseDelay.connect(preGain);
       preGain.connect(bodyFilter);
       bodyFilter.connect(resFilter);
       resFilter.connect(eqLow);
       eqLow.connect(eqMid);
       eqMid.connect(eqHigh);
       eqHigh.connect(eqTilt);
       
       const root = bassFreq > 20 ? bassFreq : 60;
       
       for(let i=0; i<8; i++) {
           const f = ctx.createBiquadFilter();
           f.type = 'peaking';
           f.Q.value = 4.0;
           
           const order = i + 1;
           const freq = (root * order) * settings.timbreMorph;
           
           if (freq < nyquist) {
               f.frequency.value = freq;
               const isEven = order % 2 === 0;
               if (isEven) {
                   const decay = 1 - (i * 0.1); 
                   f.gain.value = settings.harmonicWarmth * 9 * Math.max(0.2, decay);
               } else if (order > 1) {
                   f.gain.value = settings.harmonicClarity * 8;
               } else {
                   f.gain.value = 0;
               }
           } else {
               f.gain.value = 0;
           }
           
           currentChainNode.connect(f);
           harmonicFilters.push(f);
           currentChainNode = f;
       }

       const dryPath = currentChainNode;
       
       const subLowpass = ctx.createBiquadFilter(); subLowpass.type = 'lowpass'; subLowpass.frequency.value = 90;
       const subShaper = ctx.createWaveShaper(); subShaper.curve = this.makeSubHarmonicCurve(4096); subShaper.oversample = '4x';
       const subFilter = ctx.createBiquadFilter(); subFilter.type = 'bandpass'; subFilter.frequency.value = 180; subFilter.Q.value = 1.5;
       const subGain = ctx.createGain(); subGain.gain.value = settings.deepZenBass * 2.0;
       
       eqTilt.connect(subLowpass);
       subLowpass.connect(subShaper);
       subShaper.connect(subFilter);
       subFilter.connect(subGain);

       const reverbInput = ctx.createGain();
       const reverbDelay = ctx.createDelay(2.0);
       const period = 1 / targetFreq;
       reverbDelay.delayTime.value = period * 21; 
       
       const reverbOutput = ctx.createGain();
       reverbOutput.gain.value = settings.spaceResonance * 0.8;
       
       const verbFilter1 = ctx.createBiquadFilter(); verbFilter1.type = 'peaking'; verbFilter1.frequency.value = (targetFreq * 2) * settings.timbreMorph; verbFilter1.Q.value = 4.0; verbFilter1.gain.value = 6;
       const verbFilter2 = ctx.createBiquadFilter(); verbFilter2.type = 'peaking'; verbFilter2.frequency.value = (targetFreq * 3) * settings.timbreMorph; verbFilter2.Q.value = 4.0; verbFilter2.gain.value = 6;
       
       eqTilt.connect(reverbInput);
       reverbInput.connect(reverbDelay);
       reverbDelay.connect(verbFilter1);
       verbFilter1.connect(verbFilter2);
       verbFilter2.connect(reverbOutput);
       
       const fbGain = ctx.createGain();
       fbGain.gain.value = Math.min(settings.roomScale * 0.5, 0.5); 
       verbFilter2.connect(fbGain);
       fbGain.connect(reverbDelay);

       const msSplitter = ctx.createChannelSplitter(2);
       const msMerger = ctx.createChannelMerger(2);
       
       dryPath.connect(msSplitter);
       subGain.connect(msSplitter);
       reverbOutput.connect(msSplitter);
       
       const midSum = ctx.createGain(); midSum.gain.value = 0.5;
       const sideDiff = ctx.createGain(); sideDiff.gain.value = 0.5;
       const sideInvert = ctx.createGain(); sideInvert.gain.value = -0.5;
       
       msSplitter.connect(midSum, 0); msSplitter.connect(midSum, 1);
       msSplitter.connect(sideDiff, 0); msSplitter.connect(sideInvert, 1); sideInvert.connect(sideDiff);
       
       const sideGain = ctx.createGain();
       sideGain.gain.value = settings.stereoWidth;
       
       const airFilter = ctx.createBiquadFilter(); 
       airFilter.type = 'highshelf'; 
       airFilter.frequency.value = settings.sacredGeometryMode && bassFreq > 20 ? bassFreq * Math.pow(this.PHI, 7) : 16000;
       airFilter.gain.value = settings.bypassAir ? 0 : 0; 
       
       sideDiff.connect(airFilter);
       airFilter.connect(sideGain);
       
       const outL = ctx.createGain();
       const outR = ctx.createGain();
       const sideOutInvert = ctx.createGain(); sideOutInvert.gain.value = -1;
       
       midSum.connect(outL);
       sideGain.connect(outL);
       
       midSum.connect(outR);
       sideGain.connect(sideOutInvert);
       sideOutInvert.connect(outR);
       
       outL.connect(msMerger, 0, 0);
       outR.connect(msMerger, 0, 1);
       
       const driveNode = ctx.createGain(); driveNode.gain.value = 1.0;
       const saturation = ctx.createWaveShaper(); 
       saturation.curve = this.makeSaturationCurve(settings.saturationType, 8192);
       saturation.oversample = '4x';
       
       const compressor = ctx.createDynamicsCompressor();
       compressor.threshold.value = -12;
       compressor.ratio.value = 1.5;
       compressor.attack.value = 0.03;
       compressor.release.value = 0.25;
       
       const finalGain = ctx.createGain();
       finalGain.gain.value = 1.4; 
       
       msMerger.connect(driveNode);
       driveNode.connect(saturation);
       saturation.connect(compressor);
       compressor.connect(finalGain);
       
       finalGain.connect(ctx.destination);
       
       source.start(0);
       const rendered = await ctx.startRendering();
       logger.success('Offline render complete', 'RENDER_DONE');
       
       return this.bufferToWave(rendered);
  }

  public async exportAudio(targetFreq: number, settings: AudioSettings): Promise<Blob> {
    if (!this.audioBuffer) throw new Error("No buffer");
    return this.processOffline(
        this.audioBuffer, 
        targetFreq, 
        this.lastDetectedBass, 
        this.sourceReferencePitch, 
        settings, 
        this.detectedPhaseOffset
    );
  }

  private bufferToWave(abuffer: AudioBuffer): Blob {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this encoder)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    for(i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while(pos < length) {
        for(i = 0; i < numOfChan; i++) {             // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true);          // write 16-bit sample
            pos += 2;
        }
        offset++;                                     // next source sample
    }

    function setUint16(data: any) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: any) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    return new Blob([buffer], {type: "audio/wav"});
  }

}

export const audioService = new AudioService();
