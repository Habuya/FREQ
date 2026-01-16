



// Web Worker for Audio Analysis
// Handles FFT and Pitch Detection off the main thread

// Polyfill definitions for Worker scope
const OfflineContextClass = self.OfflineAudioContext || (self as any).webkitOfflineAudioContext;

interface AnalysisMessage {
  id: number;
  type: 'DETECT_TUNING' | 'DETECT_BASS' | 'DETECT_PHASE';
  payload: any;
}

self.onmessage = async (e: MessageEvent<AnalysisMessage>) => {
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
    self.postMessage({ id, success: false, error: (error as Error).message });
  }
};

// --- Core Analysis Logic ---

/**
 * Detects the tuning reference (e.g. A4=440Hz vs 432Hz) using Autocorrelation.
 * This is more robust than FFT for finding the fundamental period of complex signals.
 */
async function detectInherentTuning(inputData: Float32Array, sampleRate: number, sensitivity: number): Promise<number> {
  const bufferSize = inputData.length;
  
  // 1. Root Mean Square (RMS) to check if signal is loud enough
  let rms = 0;
  for (let i = 0; i < bufferSize; i++) {
    rms += inputData[i] * inputData[i];
  }
  rms = Math.sqrt(rms / bufferSize);
  if (rms < 0.01) return 440; // Too quiet

  // 2. Autocorrelation Function (ACF)
  // We only calculate lags corresponding to our frequency range of interest (e.g., 200Hz to 1000Hz)
  // But to be safe and find the true fundamental, we scan a wider range then map to A4.
  
  // Downsampling optimization could happen here, but for < 1 sec clips, full res is fine.
  
  const minFreq = 200;
  const maxFreq = 1000;
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.floor(sampleRate / minFreq);

  let bestCorrelation = -1;
  let bestPeriod = 0;

  // We simply look for the first major peak in the ACF
  for (let lag = minPeriod; lag <= maxPeriod; lag++) {
    let sum = 0;
    // Calculate correlation for this lag
    // Optimization: Don't need to iterate whole buffer, just enough to get stable average
    const limit = Math.min(bufferSize - lag, 2048); 
    
    for (let i = 0; i < limit; i++) {
      sum += inputData[i] * inputData[i + lag];
    }
    
    // Normalize (optional, but good for thresholding)
    if (sum > bestCorrelation) {
      bestCorrelation = sum;
      bestPeriod = lag;
    }
  }

  // 3. Parabolic Interpolation for Sub-sample precision
  // The 'bestPeriod' is an integer, but the true peak is likely between samples.
  let shift = 0;
  if (bestPeriod > minPeriod && bestPeriod < maxPeriod) {
     const limit = Math.min(bufferSize - bestPeriod, 2048);
     
     // Recalculate neighbors
     let prevSum = 0;
     for(let i=0; i<limit; i++) prevSum += inputData[i] * inputData[i + bestPeriod - 1];
     
     let nextSum = 0;
     for(let i=0; i<limit; i++) nextSum += inputData[i] * inputData[i + bestPeriod + 1];

     const center = bestCorrelation;
     
     // Parabolic peak location formula
     shift = 0.5 * (prevSum - nextSum) / (prevSum - 2 * center + nextSum);
  }

  const exactPeriod = bestPeriod + shift;
  const fundamentalFreq = sampleRate / exactPeriod;

  // 4. Map Fundamental to A4 Reference
  // We assume the music is based on 12TET. We find the nearest note, calculate the deviation,
  // and apply that deviation to 440Hz.
  
  const semitonesFromA4 = 12 * Math.log2(fundamentalFreq / 440);
  const roundedSemitones = Math.round(semitonesFromA4);
  const deviationInSemitones = semitonesFromA4 - roundedSemitones;
  
  // Calculate the "Inherent A4" of this tuning system
  const inherentA4 = 440 * Math.pow(2, deviationInSemitones / 12);

  // Clamping to realistic ranges (e.g. 420Hz - 460Hz)
  return Math.max(415, Math.min(460, inherentA4));
}

/**
 * Detects Bass Root using FFT + Harmonic Product Spectrum (HPS) concept simplified
 * or weighted peak detection.
 */
async function detectBassRoot(pcmData: Float32Array, sampleRate: number, sensitivity: number): Promise<number> {
    // 1. Energy Scan to find the beat/loudest part
    const windowSize = 8192; // Larger window for Bass resolution
    let bestOffset = 0;
    let maxEnergy = 0;
    
    // Hop size 2048
    for (let i = 0; i < pcmData.length - windowSize; i += 2048) {
        let energy = 0;
        for (let j = 0; j < windowSize; j += 32) {
            energy += Math.abs(pcmData[i+j]);
        }
        if (energy > maxEnergy) {
            maxEnergy = energy;
            bestOffset = i;
        }
    }
    
    if (maxEnergy < 1.0) return 0; // Silence check

    const bestChunk = pcmData.subarray(bestOffset, bestOffset + windowSize);
    
    // Dynamic Range based on Sensitivity
    let minFreq = 30;
    let maxFreq = 150; // Bass/Kick range
    
    if (sensitivity < 50) {
        minFreq = 30; 
        maxFreq = 150 - (50 - sensitivity);
    } else {
        minFreq = 20;
        maxFreq = 150 + (sensitivity - 50);
    }
    
    return await findDominantFrequency(bestChunk, sampleRate, minFreq, maxFreq);
}

async function findDominantFrequency(signal: Float32Array, sampleRate: number, minFreq: number, maxFreq: number): Promise<number> {
    const targetSize = 32768; // High res FFT for bass
    const padded = new Float32Array(targetSize);
    
    // Centering and Blackman Window (better than Hann for separation)
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
    
    // Quadratic Interpolation for better peak accuracy
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

/**
 * Calculates the phase offset needed to align the detected frequency to a zero-crossing.
 */
async function detectPhaseOffset(pcmData: Float32Array, sampleRate: number, frequency: number): Promise<number> {
    // Basic Discrete Fourier Transform for a single frequency (Goertzel-ish)
    // We want the phase at t=0 of the pcmData
    
    if (frequency <= 0) return 0;

    let real = 0;
    let imag = 0;
    
    // Analyze first 2048 samples (enough for bass freq phase)
    const limit = Math.min(pcmData.length, 2048);
    
    // Angular frequency per sample
    const omega = 2 * Math.PI * frequency / sampleRate;

    for(let i=0; i<limit; i++) {
        const s = pcmData[i];
        real += s * Math.cos(omega * i);
        imag += -s * Math.sin(omega * i); // Negative for FFT sign convention usually
    }

    // Phase angle in radians
    const phase = Math.atan2(imag, real);
    
    // We want to shift so phase becomes 0 (or aligned).
    // Time shift dt = -phase / omega (in seconds, not normalized samples)
    const omegaSec = 2 * Math.PI * frequency;
    const timeShift = -phase / omegaSec;
    
    // Normalize to positive delay if needed, though DelayNode handles positive only.
    // If shift is negative (ahead), we delay by Period - |shift|
    const period = 1 / frequency;
    let normalizedShift = timeShift;
    
    while(normalizedShift < 0) normalizedShift += period;
    while(normalizedShift > period) normalizedShift -= period;
    
    return normalizedShift;
}

// Native Web Audio FFT in Worker using OfflineAudioContext
async function computeFFT(inputReal: Float32Array, sampleRate: number): Promise<Float32Array> {
    if (!OfflineContextClass) {
        throw new Error("OfflineAudioContext not supported in this browser's Worker");
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

    // suspend/resume pattern to grab FFT data
    await ctx.suspend(duration * 0.5).then(() => { // Measure halfway
        analyser.getFloatFrequencyData(freqs);
        return ctx.resume();
    });

    await ctx.startRendering();

    // Convert dB to Linear
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