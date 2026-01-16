
// Web Worker for Audio Analysis
// Handles FFT and Pitch Detection off the main thread

// Polyfill definitions for Worker scope
const OfflineContextClass = self.OfflineAudioContext || (self as any).webkitOfflineAudioContext;

interface AnalysisMessage {
  id: number;
  type: 'DETECT_TUNING' | 'DETECT_BASS';
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
    }

    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({ id, success: false, error: (error as Error).message });
  }
};

// --- Core Analysis Logic (Moved from AudioService) ---

async function detectInherentTuning(inputData: Float32Array, sampleRate: number, sensitivity: number): Promise<number> {
  // Logic identical to previous AudioService implementation, adapted for Worker
  // Since we receive a mono slice, we don't need to extract from a full buffer here.
  
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
    
    // Apply Hann Window manually
    const windowed = new Float32Array(fftSize);
    for(let i=0; i<fftSize; i++) {
       windowed[i] = chunk[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    // FFT Range 200Hz - 1000Hz (Scanning for A4 reference)
    for (let bin = Math.floor(200 / binWidth); bin < Math.ceil(1000 / binWidth); bin++) {
       let real = 0;
       let imag = 0;
       const freq = bin * binWidth;
       
       // Correlation DFT (Discrete Fourier Transform) for specific bins
       // We use direct DFT here for precision on specific frequencies rather than full FFT
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

async function detectBassRoot(pcmData: Float32Array, sampleRate: number, sensitivity: number): Promise<number> {
    // 1. Energy Scan to find the beat/loudest part
    const windowSize = 4096;
    let bestOffset = 0;
    let maxEnergy = 0;
    
    // Hop size 1024
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
    
    if (maxEnergy < 1.0) return 0; // Silence check

    const bestChunk = pcmData.subarray(bestOffset, bestOffset + windowSize);
    
    // Dynamic Range based on Sensitivity
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

async function findDominantFrequency(signal: Float32Array, sampleRate: number, minFreq: number, maxFreq: number): Promise<number> {
    const targetSize = 16384; 
    const padded = new Float32Array(targetSize);
    
    // Centering and Windowing
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
    
    // Quadratic Interpolation
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
    await ctx.suspend(duration).then(() => {
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
