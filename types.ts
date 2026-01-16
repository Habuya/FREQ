
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
}

export type ProcessState = 'idle' | 'decoding' | 'analyzing' | 'ready' | 'retuning';
