

export interface AudioFile {
  name: string;
  url: string;
  buffer: AudioBuffer;
}

// Defines available target frequencies as numeric values (A4 Reference)
export enum TuningPreset {
  STANDARD_440 = 440,
  VERDI_432 = 432,
  SOLFEGGIO_444 = 444, // Results in C5 = 528Hz in Pythagorean tuning
  TRANSFORMATION_528 = 528, // Direct A=528Hz reference (Experimental high shift)
  RECONNECTION_417 = 417
}

// UI Labels
export const TUNING_LABELS: Record<TuningPreset, string> = {
  [TuningPreset.STANDARD_440]: 'Standard (440 Hz)',
  [TuningPreset.VERDI_432]: 'Natural (432 Hz)',
  [TuningPreset.SOLFEGGIO_444]: 'Solfeggio (444 Hz)',
  [TuningPreset.TRANSFORMATION_528]: 'DNA Repair (528 Hz)',
  [TuningPreset.RECONNECTION_417]: 'Reconnection (417 Hz)'
};

export interface AnalysisResult {
  estimatedFrequency: number;
  isStandardTuning: boolean;
}

export type SaturationType = 'tube' | 'tape' | 'clean';

export interface AudioSettings {
  fftSize: number;
  smoothingTimeConstant: number;
  saturationType: SaturationType;
  bypassBody: boolean;
  bypassResonance: boolean;
  bypassAir: boolean;
  stereoWidth: number; // 0.0 to 2.0
  sacredGeometryMode: boolean;
  
  // Phase 2: Esoteric Extensions
  fibonacciAlignment: boolean; // Time-stretching/Breathing
  phaseLockEnabled: boolean;   // Dynamic Phase Alignment
  cymaticsMode: boolean;       // Particle Visualization
  binauralMode: boolean;       // Alpha Waves
  binauralBeatFreq: number;    // 8-12Hz (Alpha)

  // Phase 3: Harmonic Shaping
  harmonicWarmth: number;  // 0.0 to 1.0 (Even harmonics)
  harmonicClarity: number; // 0.0 to 1.0 (Odd harmonics)
  timbreMorph: number;     // 0.5 to 2.0 (Formant Shifting)
  
  // Phase 4: Psychoacoustics & Organic Automation
  deepZenBass: number;     // 0.0 to 1.0 (Sub-harmonic synthesis)
  spaceResonance: number;  // 0.0 to 1.0 (Harmonic Reverb - Wet Level)
  roomScale: number;       // 0.0 to 1.0 (Reverb Decay/Feedback)
  breathingEnabled: boolean;   // Activates Phi-LFO
  breathingIntensity: number;  // Modulation strength (0.0 to 1.0)
  
  // Phase 5: Adaptive Mastering
  autoEqEnabled: boolean;  // Pink Noise Matching
  autoEqIntensity: number; // 0.0 to 1.0 (Strength of correction)
}

export interface MasteringPreset {
  id: string;
  name: string;
  isFactory: boolean;
  data: AudioSettings;
  createdAt: number;
}

export type ProcessState = 'idle' | 'decoding' | 'analyzing' | 'ready' | 'retuning';