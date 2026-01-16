


import React, { useEffect, useRef, useState } from 'react';
import { audioService } from '../services/audioService';
import { Info, X } from 'lucide-react';

interface VisualizerProps {
  isPlaying: boolean;
  fundamentalHz?: number; // Tuning Reference (A4)
  bassHz?: number;        // Kick/Sub Fundamental
  cymaticsMode?: boolean; // Toggle for Particle Mode
  phaseLockEnabled?: boolean; // New: Toggle for Coherence Geometry
  deepZenBass?: number;   // New: Psychoacoustic Bass Level (0-1)
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  
  constructor(w: number, h: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = 0;
    this.vy = 0;
  }
  
  update(w: number, h: number, forceX: number, forceY: number) {
    this.vx = (this.vx * 0.9) + forceX;
    this.vy = (this.vy * 0.9) + forceY;
    this.x += this.vx;
    this.y += this.vy;
    
    // Bounce
    if(this.x < 0) { this.x = 0; this.vx *= -1; }
    if(this.x > w) { this.x = w; this.vx *= -1; }
    if(this.y < 0) { this.y = 0; this.vy *= -1; }
    if(this.y < 0) { this.y = 0; this.vy *= -1; }
    if(this.y > h) { this.y = h; this.vy *= -1; }
  }
}

// Separate class for the Phase-Lock startup animation
class GenesisParticle {
  originX: number;
  originY: number;
  targetOffsetT: number; // The 't' value on the Lissajous curve this particle aims for
  
  constructor(w: number, h: number) {
    this.originX = (Math.random() - 0.5) * w * 1.5; // Spread wider than screen initially
    this.originY = (Math.random() - 0.5) * h * 1.5;
    this.targetOffsetT = Math.random() * Math.PI * 2;
  }
}

const Visualizer: React.FC<VisualizerProps> = ({ 
  isPlaying, 
  fundamentalHz = 440, 
  bassHz, 
  cymaticsMode = false,
  phaseLockEnabled = false,
  deepZenBass = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  
  // Animation State Refs
  const deltaRef = useRef<number>(0); // Persistent phase state
  const activationTimeRef = useRef<number>(0); // Timestamp when lock was engaged
  const genesisParticlesRef = useRef<GenesisParticle[]>([]);
  const prevLockStateRef = useRef<boolean>(false);

  // UI State
  const [showInfo, setShowInfo] = useState(false);

  // Initialize Standard Particles once
  useEffect(() => {
     particlesRef.current = Array.from({ length: 1500 }, () => new Particle(300, 150));
  }, []);

  // Handle Phase Lock Toggle / Genesis Trigger
  useEffect(() => {
    if (phaseLockEnabled && !prevLockStateRef.current) {
        // Trigger Genesis
        activationTimeRef.current = performance.now();
        // Create 100 chaos particles
        const w = canvasRef.current?.width || 300;
        const h = canvasRef.current?.height || 150;
        genesisParticlesRef.current = Array.from({ length: 100 }, () => new GenesisParticle(w, h));
        
        // Auto-show info briefly on first activation if desired, or just let user discover
    }
    prevLockStateRef.current = phaseLockEnabled;
  }, [phaseLockEnabled]);

  // --- Lissajous Coherence Geometry (Refined with Snap Animation) ---
  const drawLissajous = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const now = performance.now();
      const time = now / 1000;
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Canvas Setup
      const PHI = 1.61803398875;
      const baseRadius = Math.min(width, height) * 0.35;
      
      // Calculate Breathing Pulse for Geometry Size
      // Matches the LFO logic in AudioService
      const breathingCycle = (audioService.getCurrentTime() / PHI) % 1;
      const breathingPulse = Math.pow(Math.sin(breathingCycle * Math.PI * 2) * 0.5 + 0.5, 1.5);
      
      // Fibonacci Frequency Mapping
      const fibFractions = [
          { n: 1, d: 1, val: 1.0 },
          { n: 2, d: 1, val: 2.0 },
          { n: 3, d: 2, val: 1.5 },
          { n: 5, d: 3, val: 1.666 },
          { n: 8, d: 5, val: 1.6 }
      ];

      // Calculate Ratio
      let f1 = bassHz || 60;
      let f2 = fundamentalHz || 440;
      
      let rawRatio = f1 / f2;
      if (rawRatio < 1.0) {
          while (rawRatio < 1.0) rawRatio *= 2; 
      }
      while (rawRatio > 2.5) rawRatio /= 2;

      let fibA = 5;
      let fibB = 3;
      let speed = 1.0;

      // Animation Lifecycle Vars
      let animationProgress = 0; // 0 to 1 (Genesis), >1 (Stable)
      let snapFlash = 0; // 0 to 1 intensity
      
      if (phaseLockEnabled) {
          // Calculate time since activation
          const elapsed = now - activationTimeRef.current;
          const genesisDuration = 1200; // ms to reach center
          
          animationProgress = Math.min(elapsed / genesisDuration, 1.0);
          
          // "The Snap" Flash Logic
          // Trigger a flash right as particles merge (at 1.0)
          if (elapsed > genesisDuration && elapsed < genesisDuration + 300) {
             const flashTime = (elapsed - genesisDuration) / 300;
             snapFlash = 1.0 - flashTime; // Fade out
          }

          const isStable = elapsed > genesisDuration;

          // Snap to nearest Fibonacci fraction
          const closest = fibFractions.reduce((prev, curr) => 
              Math.abs(curr.val - rawRatio) < Math.abs(prev.val - rawRatio) ? curr : prev
          );
          fibA = closest.n;
          fibB = closest.d;
          
          // Smooth Lock Interpolation for Delta
          const targetDelta = Math.PI / 2;
          deltaRef.current += (targetDelta - deltaRef.current) * 0.03;
          
          // Rotation: Slow down massively when stable
          // During genesis, spin faster, then brake.
          const spinBrake = isStable ? 0.02 : 0.5 * (1 - animationProgress);
          speed = spinBrake; 
      } else {
          // Unlock: Drift and Instability
          fibA = 5 + Math.sin(time * 0.5) * 0.2;
          fibB = 3 + Math.cos(time * 0.3) * 0.2;
          deltaRef.current += 0.01;
          speed = 1.2;
      }

      // Phi Scaling for Amplitudes + Breath Modulation
      // The breathing pulse slightly expands/contracts the geometry
      const breathMod = 1 + (breathingPulse * 0.05 * (deepZenBass > 0 ? 1 : 0.5)); // Subtle scale mod
      
      const ampA = baseRadius * breathMod;
      const ampB = (baseRadius / PHI) * breathMod;

      ctx.save();
      ctx.translate(centerX, centerY);
      
      // Global Rotation
      if (phaseLockEnabled) {
          // Smooth, slow rotation in stable mode
          ctx.rotate(time * 0.05); 
      } else {
          ctx.rotate(time * 0.1);
      }

      // --- 1. DRAW GENESIS PARTICLES (Chaos State) ---
      if (phaseLockEnabled && animationProgress < 1.0) {
          // Ease In Cubic
          const t = animationProgress;
          const ease = t * t * t; 
          
          ctx.fillStyle = `rgba(168, 85, 247, ${1 - ease})`; // Fade out as they merge
          
          genesisParticlesRef.current.forEach(p => {
             // Calculate where on the curve this particle belongs
             const lx = ampA * Math.sin(fibA * p.targetOffsetT + deltaRef.current);
             const ly = ampB * Math.sin(fibB * p.targetOffsetT);
             
             // Interpolate from random origin to curve
             const currX = p.originX + (lx - p.originX) * ease;
             const currY = p.originY + (ly - p.originY) * ease;
             
             ctx.beginPath();
             ctx.arc(currX, currY, 2, 0, Math.PI * 2);
             ctx.fill();
          });
      }

      // --- 2. DRAW MAIN LISSAJOUS FIGURE ---
      
      // Determine Style based on state
      let strokeColor, shadowColor, blurAmt, lineWidth;

      if (phaseLockEnabled) {
          if (snapFlash > 0) {
              // THE SNAP: Blinding Flash
              strokeColor = `rgba(236, 254, 255, ${0.8 + snapFlash * 0.2})`; // White-Cyan
              shadowColor = `rgba(34, 211, 238, ${0.8 + snapFlash * 0.2})`;
              blurAmt = 15 + (snapFlash * 35); // Max 50px blur
              lineWidth = 2 + (snapFlash * 3);
          } else {
              // STABLE: Breathing Mode (Color Modulated by Breath Cycle too)
              strokeColor = `rgba(52, 211, 153, ${0.4 + breathingPulse * 0.3})`; // Emerald breathing
              shadowColor = `rgba(52, 211, 153, ${0.3 + breathingPulse * 0.2})`;
              blurAmt = 10 + (breathingPulse * 10); // Breathe blur 10-20
              lineWidth = 1.5 + (breathingPulse * 0.5);
          }
      } else {
          // SEARCHING / UNLOCKED
          strokeColor = "rgba(99, 102, 241, 0.5)"; // Indigo
          shadowColor = "rgba(99, 102, 241, 0.3)";
          blurAmt = 5;
          lineWidth = 1.5;
      }

      // Create Gradient if not flashing
      let strokeStyle: string | CanvasGradient = strokeColor;
      if (!snapFlash && phaseLockEnabled) {
        const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, baseRadius);
        gradient.addColorStop(0, "rgba(34, 211, 238, 1)");   // Center Cyan
        gradient.addColorStop(0.5, strokeColor);              // Mid Emerald
        gradient.addColorStop(1, "rgba(52, 211, 153, 0)");    // Edge Fade
        strokeStyle = gradient;
      }

      // Draw the Loop
      // Multi-pass for glow strength
      const passes = snapFlash > 0 ? 2 : 1;

      for (let p = 0; p < passes; p++) {
          ctx.beginPath();
          ctx.lineWidth = lineWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          
          const steps = phaseLockEnabled ? 400 : 200; // Higher res for math mode
          
          for (let i = 0; i <= steps; i++) {
              const t = (i / steps) * Math.PI * 2;
              
              // Formula
              const x = ampA * Math.sin(fibA * t + deltaRef.current);
              const y = ampB * Math.sin(fibB * t);
              
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          
          if (phaseLockEnabled) ctx.closePath();

          ctx.strokeStyle = strokeStyle;
          ctx.shadowBlur = blurAmt;
          ctx.shadowColor = shadowColor;
          ctx.stroke();
      }

      ctx.restore();

      // Text Overlay (Only draw if Info is closed, to avoid clutter)
      if (phaseLockEnabled && animationProgress >= 1.0 && !showInfo) {
          ctx.font = '10px "Inter", monospace';
          ctx.textAlign = 'center';
          // Pulsing text opacity
          const textAlpha = 0.6 + Math.sin(time * 3) * 0.4;
          ctx.fillStyle = `rgba(52, 211, 153, ${textAlpha})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#34d399";
          ctx.fillText("COHERENCE GEOMETRY: STABLE (PHI-LOCKED)", width / 2, height - 30);
      }
  };

  const drawCymatics = (ctx: CanvasRenderingContext2D, width: number, height: number, analyser: AnalyserNode) => {
    // Cymatics / Chladni Physics Simulation
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)'; // Heavier trails
    ctx.fillRect(0, 0, width, height);
    
    // Analyze Tesla Harmonics (3, 6, 9 relative to Fundamental)
    const sampleRate = audioService.getContextSampleRate();
    const binWidth = sampleRate / (bufferLength * 2);
    
    const root = bassHz || 60;
    const h3 = Math.floor((root * 3) / binWidth);
    const h6 = Math.floor((root * 6) / binWidth);
    const h9 = Math.floor((root * 9) / binWidth);
    
    const energy3 = dataArray[h3] || 0;
    const energy6 = dataArray[h6] || 0;
    const energy9 = dataArray[h9] || 0;
    
    const m = 3 + (energy3 / 255) * 5;
    const n = 3 + (energy6 / 255) * 5;
    
    const intensity = (energy3 + energy6 + energy9) / (255 * 3); // 0 to 1
    
    // Draw Particles
    ctx.fillStyle = `hsla(${200 + intensity * 60}, 100%, 70%, 0.8)`;
    
    for(const p of particlesRef.current) {
        const nx = p.x / width;
        const ny = p.y / height;
        
        // Chladni Function Value at this point
        const val = Math.sin(n * Math.PI * nx) * Math.sin(m * Math.PI * ny);
        
        const vibration = intensity * 4.0;
        let fx = 0;
        let fy = 0;
        
        if (Math.abs(val) > 0.1) {
            fx = (Math.random() - 0.5) * vibration * Math.abs(val);
            fy = (Math.random() - 0.5) * vibration * Math.abs(val);
        } else {
            p.vx *= 0.9;
            p.vy *= 0.9;
        }
        
        p.update(width, height, fx, fy);
        ctx.fillRect(p.x, p.y, 2, 2);
    }
  };

  const drawPhaseLockPulse = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      // Golden Cycle Pulse (Ring only)
      const time = audioService.getCurrentTime();
      const PHI = 1.61803398875;
      const cycle = time % PHI;
      
      // Flash on downbeat
      if (cycle < 0.15 && phaseLockEnabled) {
          const intensity = 1 - (cycle / 0.15);
          
          ctx.beginPath();
          ctx.arc(width - 40, 40, 20 + (intensity * 10), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(52, 211, 153, ${intensity})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          
          ctx.fillStyle = `rgba(52, 211, 153, ${intensity * 0.5})`;
          ctx.fill();
      }
  };

  const drawSpectrum = (ctx: CanvasRenderingContext2D, width: number, height: number, analyser: AnalyserNode) => {
    const bufferLength = analyser.frequencyBinCount; // 4096 bins
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const sampleRate = audioService.getContextSampleRate();
    const binWidth = sampleRate / (bufferLength * 2);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)'; 
    ctx.fillRect(0, 0, width, height);

    // --- DEEP ZEN BASS "GHOST AURA" VISUALIZATION ---
    // Render this BEFORE bars so it sits behind them
    if (deepZenBass > 0) {
       // 1. Analyze Harmonic Energy (approx 100Hz - 300Hz)
       // This drives the visual of the missing fundamental
       const fStart = 100;
       const fEnd = 300;
       const startBin = Math.floor(fStart / binWidth);
       const endBin = Math.floor(fEnd / binWidth);
       
       let harmonicEnergySum = 0;
       let count = 0;
       for(let i=startBin; i<endBin; i++) {
           harmonicEnergySum += dataArray[i];
           count++;
       }
       const harmonicAvg = count > 0 ? harmonicEnergySum / count : 0;
       const normalizedEnergy = harmonicAvg / 255;
       
       // Only draw if there's significant energy to "feel"
       if (normalizedEnergy > 0.1) {
           ctx.save();
           
           // We map the 20Hz-80Hz region (Log Scale) for the glow position
           const logMin = Math.log(20);
           const logMax = Math.log(sampleRate / 2); // reuse existing scale logic if possible
           const scale = logMax - logMin;
           
           const glowStartFreq = 20;
           const glowEndFreq = 80;
           
           const x1 = ((Math.log(glowStartFreq) - logMin) / scale) * width;
           const x2 = ((Math.log(glowEndFreq) - logMin) / scale) * width;
           const glowWidth = x2 - x1;
           
           // Visual Parameters
           const intensity = normalizedEnergy * deepZenBass; 
           const pulse = Math.sin(performance.now() / 200) * 0.2 + 0.8; // Fast subtle pulse
           
           // Blur for "Ghost" effect
           ctx.filter = 'blur(15px)';
           ctx.globalCompositeOperation = 'screen'; // Additive light
           
           const gradient = ctx.createLinearGradient(x1, height, x1, height - (height * 0.4));
           gradient.addColorStop(0, `rgba(88, 28, 135, ${intensity * pulse * 0.8})`); // Deep Purple
           gradient.addColorStop(1, `rgba(88, 28, 135, 0)`);
           
           ctx.fillStyle = gradient;
           ctx.fillRect(x1 - 10, height - (height * 0.5 * intensity), glowWidth + 20, height * 0.5 * intensity);
           
           ctx.restore(); // Removes blur and composite op
           
           // UI Text Feedback
           if (intensity > 0.4) {
               ctx.save();
               ctx.font = '10px "Inter", monospace';
               ctx.fillStyle = `rgba(168, 85, 247, ${intensity})`; // Purple-400
               ctx.textAlign = 'center';
               ctx.shadowColor = '#a855f7';
               ctx.shadowBlur = 5;
               ctx.fillText("PSYCHOACOUSTIC RESONANCE ACTIVE", x1 + (glowWidth/2), height - 40);
               ctx.restore();
           }
       }
    }

    // Render Lissajous in background
    drawLissajous(ctx, width, height);

    // Dynamic resolution based on width
    const barWidth = 6; 
    const barGap = 2;
    const barCount = Math.floor(width / (barWidth + barGap));
    
    const minFreq = 20; 
    const maxFreq = sampleRate / 2;
    const logMin = Math.log(minFreq);
    const logMax = Math.log(maxFreq);
    const scale = logMax - logMin;

    let hasAirContent = false;

    // Draw Frequency Bars
    for (let i = 0; i < barCount; i++) {
      const percent = i / barCount;
      const nextPercent = (i + 1) / barCount;
      
      const startFreq = Math.exp(logMin + scale * percent);
      const endFreq = Math.exp(logMin + scale * nextPercent);
      
      const startBin = Math.floor(startFreq / binWidth);
      const endBin = Math.floor(endFreq / binWidth);
      
      // Bin Grouping: Find Max or Average in this range
      let maxVal = 0;
      let sum = 0;
      let count = 0;
      
      // Ensure we hit at least one bin
      const effectiveEndBin = Math.max(endBin, startBin + 1);
      
      for(let j = startBin; j < effectiveEndBin && j < bufferLength; j++) {
        const val = dataArray[j];
        if (val > maxVal) maxVal = val;
        sum += val;
        count++;
      }
      
      // Hybrid approach: Use Max for peaks, Average for body
      const average = count > 0 ? sum / count : 0;
      const displayValue = (maxVal * 0.7) + (average * 0.3); // Bias towards peaks

      const barHeight = Math.pow(displayValue / 255, 1.2) * (height * 0.85);

      const x = i * (barWidth + barGap);
      const y = height - barHeight;

      // --- Color Logic ---
      const isAirBand = startFreq > 20000;
      const isFundamental = fundamentalHz >= startFreq && fundamentalHz <= endFreq;
      const isBassFundamental = bassHz ? (bassHz >= startFreq && bassHz <= endFreq) : false;

      if (isAirBand && average > 10) hasAirContent = true;

      if (isAirBand) {
        ctx.fillStyle = `hsla(180, 100%, ${60 + (average/255)*40}%, ${0.6 + (average/255)*0.4})`;
        ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
        ctx.shadowBlur = average * 0.2;
      } else if (isBassFundamental) {
        ctx.fillStyle = `hsla(84, 100%, 60%, 1)`; 
        ctx.shadowColor = 'rgba(163, 230, 53, 0.9)';
        ctx.shadowBlur = 30;
      } else if (isFundamental) {
        ctx.fillStyle = `hsla(150, 100%, 60%, 1)`;
        ctx.shadowColor = 'rgba(52, 211, 153, 0.9)';
        ctx.shadowBlur = 25;
      } else {
        const hue = 240 + (percent * 60); // Indigo -> Magenta
        const lightness = 50 + (displayValue/255) * 20;
        ctx.fillStyle = `hsla(${hue}, 80%, ${lightness}%, 0.85)`;
        ctx.shadowColor = `hsla(${hue}, 80%, 50%, 0.5)`;
        ctx.shadowBlur = displayValue * 0.1;
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 4);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;

    // --- Overlays (20kHz, Ref, Sub) ---
    const drawOverlay = (hz: number, label: string, color: string) => {
        if (hz < minFreq || hz > maxFreq) return;
        const p = (Math.log(hz) - logMin) / scale;
        if (p < 0 || p > 1) return;
        const xPos = p * width;
        
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        
        // Marker
        ctx.beginPath();
        ctx.arc(xPos, height - 10, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        if (isPlaying) {
            ctx.font = '10px "Inter", monospace';
            ctx.fillStyle = color;
            // Ensure text doesn't go off screen
            const textWidth = ctx.measureText(label).width;
            const textX = Math.min(Math.max(xPos - textWidth/2, 4), width - textWidth - 4);
            
            ctx.fillText(label, textX, height - 20);
        }
    };

    drawOverlay(20000, '20kHz', hasAirContent ? '#22d3ee' : 'rgba(255,255,255,0.3)');
    if (fundamentalHz > 200) drawOverlay(fundamentalHz, `REF ${fundamentalHz.toFixed(0)}`, '#34d399');
    if (bassHz && bassHz > 20) drawOverlay(bassHz, `SUB ${bassHz.toFixed(0)}`, '#a3e635');

    drawPhaseLockPulse(ctx, width, height);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const analyser = audioService.getAnalyser();

    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (cymaticsMode) {
        drawCymatics(ctx, canvas.width, canvas.height, analyser);
        // Also draw Lissajous in Cymatics mode as overlay
        drawLissajous(ctx, canvas.width, canvas.height);
    } else {
        drawSpectrum(ctx, canvas.width, canvas.height, analyser);
    }

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(draw);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(draw);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      requestAnimationFrame(draw);
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, fundamentalHz, bassHz, cymaticsMode, phaseLockEnabled, deepZenBass]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        canvasRef.current.width = canvasRef.current.parentElement.offsetWidth;
        canvasRef.current.height = canvasRef.current.parentElement.offsetHeight;
        draw();
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-full h-64 md:h-80 bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700 relative group">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
      />
      
      {/* Overlay Text for Aesthetic */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-mono text-indigo-400 tracking-[0.2em] uppercase">
          {cymaticsMode ? "CYMATICS PARTICLE SIMULATION" : "Logarithmic Analysis"}
        </span>
        <span className="text-[10px] font-mono text-slate-600 tracking-widest">
          {cymaticsMode ? "TESLA HARMONIC GEOMETRY" : "HARMONIC OVERTONE DETECTOR"}
        </span>
      </div>

       {/* Phase Lock Info Button & Overlay */}
       {phaseLockEnabled && (
        <>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className={`
                absolute top-4 right-4 z-20 transition-all duration-300
                ${showInfo ? 'text-slate-400 rotate-90' : 'text-emerald-400 hover:text-emerald-300'}
            `}
            title="Explain Coherence Geometry"
          >
            {showInfo ? <X size={20} /> : <Info size={20} />}
          </button>

          {showInfo && (
            <div className="absolute top-12 right-4 w-72 p-5 bg-slate-900/95 backdrop-blur-xl border border-emerald-500/30 rounded-xl shadow-2xl z-20 animate-in fade-in slide-in-from-top-2">
              <h4 className="text-emerald-400 text-sm font-bold mb-3 flex items-center gap-2">
                 🌀 Mathematische Kohärenz aktiviert
              </h4>
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-sans">
                <p>
                  <strong className="text-white block mb-0.5">Vom Chaos zur Harmonie</strong>
                  Die anfänglich ungeordneten Partikel repräsentieren die zufälligen Phasenlagen herkömmlicher Aufnahmen.
                </p>
                <div className="h-px bg-emerald-900/50" />
                <p>
                  <strong className="text-white block mb-0.5">Der 'Snap'-Effekt</strong>
                  Sobald die Geometrie einrastet, synchronisiert ZenTuner die Wellenberge deiner Musik exakt mit dem Fibonacci-BPM-Raster.
                </p>
                <div className="h-px bg-emerald-900/50" />
                <p>
                  <strong className="text-white block mb-0.5">Lissajous-Mathematik</strong>
                  Die entstehende Figur ist ein direkter Beweis für die Phasenstabilität. Ein stabiles Verhältnis (z. B. 3:2 oder Φ) bedeutet, dass destruktive Interferenzen eliminiert wurden.
                </p>
                <div className="p-2 bg-emerald-900/20 rounded border border-emerald-500/10 italic text-emerald-300/90 mt-2">
                  Das Ergebnis: Ein physisch spürbarer, druckvollerer Klang und eine kristallklare Trennung der Instrumente.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Visualizer;