import React, { useEffect, useRef, useState } from 'react';
import { audioService } from '../services/audioService';
import { Info, X } from 'lucide-react';

interface VisualizerProps {
  isPlaying: boolean;
  fundamentalHz?: number;
  bassHz?: number;
  cymaticsMode?: boolean;
  phaseLockEnabled?: boolean;
  deepZenBass?: number;
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
    if(this.y > h) { this.y = h; this.vy *= -1; }
  }
}

class GenesisParticle {
  originX: number;
  originY: number;
  targetOffsetT: number;
  
  constructor(w: number, h: number) {
    this.originX = (Math.random() - 0.5) * w * 1.5;
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
  
  const deltaRef = useRef<number>(0);
  const activationTimeRef = useRef<number>(0);
  const genesisParticlesRef = useRef<GenesisParticle[]>([]);
  const prevLockStateRef = useRef<boolean>(false);

  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
     particlesRef.current = Array.from({ length: 1500 }, () => new Particle(300, 150));
  }, []);

  useEffect(() => {
    if (phaseLockEnabled && !prevLockStateRef.current) {
        activationTimeRef.current = performance.now();
        const w = canvasRef.current?.width || 300;
        const h = canvasRef.current?.height || 150;
        genesisParticlesRef.current = Array.from({ length: 100 }, () => new GenesisParticle(w, h));
    }
    prevLockStateRef.current = phaseLockEnabled;
  }, [phaseLockEnabled]);

  const drawLissajous = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const now = performance.now();
      const time = now / 1000;
      const centerX = width / 2;
      const centerY = height / 2;
      
      const PHI = 1.61803398875;
      const baseRadius = Math.min(width, height) * 0.35;
      
      const breathingCycle = (audioService.getCurrentTime() / PHI) % 1;
      const breathingPulse = Math.pow(Math.sin(breathingCycle * Math.PI * 2) * 0.5 + 0.5, 1.5);
      
      const fibFractions = [
          { n: 1, d: 1, val: 1.0 },
          { n: 2, d: 1, val: 2.0 },
          { n: 3, d: 2, val: 1.5 },
          { n: 5, d: 3, val: 1.666 },
          { n: 8, d: 5, val: 1.6 }
      ];

      let f1 = bassHz || 60;
      let f2 = fundamentalHz || 440;
      let rawRatio = f1 / f2;
      
      if (rawRatio < 1.0) while (rawRatio < 1.0) rawRatio *= 2; 
      while (rawRatio > 2.5) rawRatio /= 2;

      let fibA = 5;
      let fibB = 3;
      let animationProgress = 0; 
      let snapFlash = 0; 
      
      if (phaseLockEnabled) {
          const elapsed = now - activationTimeRef.current;
          const genesisDuration = 1200;
          animationProgress = Math.min(elapsed / genesisDuration, 1.0);
          
          if (elapsed > genesisDuration && elapsed < genesisDuration + 300) {
             const flashTime = (elapsed - genesisDuration) / 300;
             snapFlash = 1.0 - flashTime; 
          }

          const closest = fibFractions.reduce((prev, curr) => 
              Math.abs(curr.val - rawRatio) < Math.abs(prev.val - rawRatio) ? curr : prev
          );
          fibA = closest.n;
          fibB = closest.d;
          
          const targetDelta = Math.PI / 2;
          deltaRef.current += (targetDelta - deltaRef.current) * 0.03;
      } else {
          fibA = 5 + Math.sin(time * 0.5) * 0.2;
          fibB = 3 + Math.cos(time * 0.3) * 0.2;
          deltaRef.current += 0.01;
      }

      const breathMod = 1 + (breathingPulse * 0.05 * (deepZenBass > 0 ? 1 : 0.5)); 
      const ampA = baseRadius * breathMod;
      const ampB = (baseRadius / PHI) * breathMod;

      ctx.save();
      ctx.translate(centerX, centerY);
      
      if (phaseLockEnabled) ctx.rotate(time * 0.05); 
      else ctx.rotate(time * 0.1);

      if (phaseLockEnabled && animationProgress < 1.0) {
          const t = animationProgress;
          const ease = t * t * t; 
          ctx.fillStyle = `rgba(59, 130, 246, ${1 - ease})`; // Electric Blue
          genesisParticlesRef.current.forEach(p => {
             const lx = ampA * Math.sin(fibA * p.targetOffsetT + deltaRef.current);
             const ly = ampB * Math.sin(fibB * p.targetOffsetT);
             const currX = p.originX + (lx - p.originX) * ease;
             const currY = p.originY + (ly - p.originY) * ease;
             ctx.beginPath();
             ctx.arc(currX, currY, 2, 0, Math.PI * 2);
             ctx.fill();
          });
      }

      let strokeColor, shadowColor, blurAmt, lineWidth;

      if (phaseLockEnabled) {
          if (snapFlash > 0) {
              strokeColor = `rgba(255, 255, 255, ${0.9 + snapFlash * 0.1})`;
              shadowColor = `rgba(59, 130, 246, 1)`;
              blurAmt = 30 + (snapFlash * 50);
              lineWidth = 2 + (snapFlash * 4);
          } else {
              // Electric Blue Stable
              strokeColor = `rgba(59, 130, 246, ${0.8 + breathingPulse * 0.2})`;
              shadowColor = `rgba(59, 130, 246, 0.8)`;
              blurAmt = 15 + (breathingPulse * 15);
              lineWidth = 1.5 + (breathingPulse * 0.5);
          }
      } else {
          // Search Mode (Darker Blue)
          strokeColor = "rgba(100, 116, 139, 0.6)"; 
          shadowColor = "rgba(59, 130, 246, 0.3)";
          blurAmt = 5;
          lineWidth = 1.5;
      }

      let strokeStyle: string | CanvasGradient = strokeColor;
      
      const passes = snapFlash > 0 ? 3 : 2; 

      for (let p = 0; p < passes; p++) {
          ctx.beginPath();
          ctx.lineWidth = lineWidth * (1 - (p * 0.3));
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          const steps = phaseLockEnabled ? 400 : 200;
          
          for (let i = 0; i <= steps; i++) {
              const t = (i / steps) * Math.PI * 2;
              const x = ampA * Math.sin(fibA * t + deltaRef.current);
              const y = ampB * Math.sin(fibB * t);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          if (phaseLockEnabled) ctx.closePath();

          ctx.strokeStyle = strokeStyle;
          ctx.shadowBlur = p === 0 ? blurAmt * 1.5 : blurAmt * 0.2;
          ctx.shadowColor = shadowColor;
          ctx.stroke();
      }
      ctx.restore();
  };

  const drawCymatics = (ctx: CanvasRenderingContext2D, width: number, height: number, analyser: AnalyserNode) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = 'rgba(8, 9, 11, 0.2)'; // Deep Space Black trail
    ctx.fillRect(0, 0, width, height);
    
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
    const intensity = (energy3 + energy6 + energy9) / (255 * 3);
    
    // Electric Blue Particles
    const hue = 210; 
    ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.9)`;
    ctx.shadowColor = `hsla(${hue}, 100%, 50%, 0.8)`;
    ctx.shadowBlur = 4;
    
    for(const p of particlesRef.current) {
        const nx = p.x / width;
        const ny = p.y / height;
        const val = Math.sin(n * Math.PI * nx) * Math.sin(m * Math.PI * ny);
        const vibration = intensity * 4.0;
        let fx = 0, fy = 0;
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
    ctx.shadowBlur = 0;
  };

  const drawPhaseLockPulse = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const time = audioService.getCurrentTime();
      const PHI = 1.61803398875;
      const cycle = time % PHI;
      
      if (cycle < 0.15 && phaseLockEnabled) {
          const intensity = 1 - (cycle / 0.15);
          ctx.beginPath();
          ctx.arc(width - 40, 40, 20 + (intensity * 10), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(59, 130, 246, ${intensity})`;
          ctx.lineWidth = 1;
          ctx.stroke();
      }
  };

  const drawSpectrum = (ctx: CanvasRenderingContext2D, width: number, height: number, analyser: AnalyserNode) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const sampleRate = audioService.getContextSampleRate();
    const binWidth = sampleRate / (bufferLength * 2);

    ctx.clearRect(0, 0, width, height);

    if (deepZenBass > 0) {
       // Minimalist Bass Aura
       const fStart = 100; const fEnd = 300;
       const startBin = Math.floor(fStart / binWidth);
       const endBin = Math.floor(fEnd / binWidth);
       let sum = 0, count = 0;
       for(let i=startBin; i<endBin; i++) { sum += dataArray[i]; count++; }
       const normEnergy = count > 0 ? (sum/count)/255 : 0;
       
       if (normEnergy > 0.1) {
           const intensity = normEnergy * deepZenBass;
           ctx.save();
           ctx.filter = 'blur(40px)';
           ctx.globalCompositeOperation = 'screen';
           const grad = ctx.createLinearGradient(0, height, 0, height/2);
           grad.addColorStop(0, `rgba(59, 130, 246, ${intensity * 0.4})`);
           grad.addColorStop(1, "transparent");
           ctx.fillStyle = grad;
           ctx.fillRect(0, height/2, width, height/2);
           ctx.restore();
       }
    }

    drawLissajous(ctx, width, height);

    const barWidth = 4; 
    const barGap = 1;
    const barCount = Math.floor(width / (barWidth + barGap));
    const minFreq = 20; 
    const maxFreq = sampleRate / 2;
    const logMin = Math.log(minFreq);
    const logMax = Math.log(maxFreq);
    const scale = logMax - logMin;
    let hasAirContent = false;

    for (let i = 0; i < barCount; i++) {
      const percent = i / barCount;
      const nextPercent = (i + 1) / barCount;
      const startFreq = Math.exp(logMin + scale * percent);
      const endFreq = Math.exp(logMin + scale * nextPercent);
      const startBin = Math.floor(startFreq / binWidth);
      const endBin = Math.floor(endFreq / binWidth);
      
      let maxVal = 0;
      let sum = 0;
      let count = 0;
      const effectiveEndBin = Math.max(endBin, startBin + 1);
      
      for(let j = startBin; j < effectiveEndBin && j < bufferLength; j++) {
        const val = dataArray[j];
        if (val > maxVal) maxVal = val;
        sum += val;
        count++;
      }
      const average = count > 0 ? sum / count : 0;
      const displayValue = (maxVal * 0.7) + (average * 0.3); 
      const barHeight = Math.pow(displayValue / 255, 1.2) * (height * 0.85);
      const x = i * (barWidth + barGap);
      const y = height - barHeight;

      const isAirBand = startFreq > 20000;
      if (isAirBand && average > 10) hasAirContent = true;
      const isFundamental = fundamentalHz >= startFreq && fundamentalHz <= endFreq;
      
      // Technical Blue Palette
      if (isAirBand) {
         ctx.fillStyle = `rgba(147, 197, 253, ${0.5 + (average/255)*0.5})`;
      } else if (isFundamental) {
         ctx.fillStyle = '#3b82f6';
         ctx.shadowColor = '#3b82f6';
         ctx.shadowBlur = 20;
      } else {
         const lightness = 20 + (displayValue/255) * 60;
         ctx.fillStyle = `hsla(220, 90%, ${lightness}%, 0.9)`;
      }

      ctx.fillRect(x, y, barWidth, barHeight);
    }
    ctx.shadowBlur = 0;

    const drawOverlay = (hz: number, label: string, color: string) => {
        if (hz < minFreq || hz > maxFreq) return;
        const p = (Math.log(hz) - logMin) / scale;
        if (p < 0 || p > 1) return;
        const xPos = p * width;
        
        ctx.fillStyle = color;
        ctx.fillRect(xPos - 1, height - 15, 2, 15);
        
        if (isPlaying) {
            ctx.font = '10px "JetBrains Mono"';
            ctx.fillStyle = color;
            const textWidth = ctx.measureText(label).width;
            const textX = Math.min(Math.max(xPos - textWidth/2, 4), width - textWidth - 4);
            ctx.fillText(label, textX, height - 20);
        }
    };

    drawOverlay(20000, '20kHz', hasAirContent ? '#93c5fd' : 'rgba(255,255,255,0.2)');
    if (fundamentalHz > 200) drawOverlay(fundamentalHz, `[${fundamentalHz.toFixed(0)}]`, '#3b82f6');
    
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
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestAnimationFrame(draw);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
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
    // Pi 23 Tech Container
    <div className="tech-panel w-full h-64 md:h-80 group relative overflow-hidden">
      <div className="scanlines absolute inset-0 z-20 pointer-events-none opacity-20"></div>
      
      <canvas ref={canvasRef} className="w-full h-full block relative z-10" />
      
      {/* Overlay UI */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none z-30 opacity-70">
        <span className="text-[10px] font-mono text-blue-500 tracking-[0.2em] uppercase bg-black/50 px-2 py-0.5 border border-blue-500/20">
          {cymaticsMode ? "VISUAL: CYMATICS_FIELD" : "VISUAL: HARMONIC_FFT"}
        </span>
      </div>
      
      {/* Decorative Corners */}
      <div className="absolute top-0 right-0 p-2 opacity-50">
        <div className="w-2 h-2 border-t border-r border-blue-400"></div>
      </div>
      <div className="absolute bottom-0 left-0 p-2 opacity-50">
        <div className="w-2 h-2 border-b border-l border-blue-400"></div>
      </div>

       {phaseLockEnabled && (
        <>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className={`
                absolute top-4 right-4 z-40 tech-interact p-1 bg-black/50 border border-blue-500/30
                ${showInfo ? 'text-white' : 'text-blue-500'}
            `}
          >
            {showInfo ? <X size={16} /> : <Info size={16} />}
          </button>

          {showInfo && (
            <div className="absolute top-12 right-4 w-64 p-4 tech-panel bg-black/90 z-50">
              <h4 className="text-blue-400 text-[10px] font-bold mb-2 uppercase tracking-widest border-b border-white/10 pb-1">
                 COHERENCE_MATRIX
              </h4>
              <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
                LISSAJOUS FIGURE INDICATES PHASE ALIGNMENT. STABLE GEOMETRY CONFIRMS ZERO-POINT CROSSING SYNC.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Visualizer;