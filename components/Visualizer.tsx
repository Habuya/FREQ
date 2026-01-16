import React, { useEffect, useRef } from 'react';
import { audioService } from '../services/audioService';

interface VisualizerProps {
  isPlaying: boolean;
  fundamentalHz?: number; // Tuning Reference (A4)
  bassHz?: number;        // Kick/Sub Fundamental
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, fundamentalHz = 440, bassHz }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  const draw = () => {
    const canvas = canvasRef.current;
    const analyser = audioService.getAnalyser();

    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount; // 4096 bins
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const width = canvas.width;
    const height = canvas.height;
    const sampleRate = audioService.getContextSampleRate();
    const binWidth = sampleRate / (bufferLength * 2);

    // Fade effect for trails
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)'; 
    ctx.fillRect(0, 0, width, height);

    // Logarithmic scale config
    const barCount = 64; 
    const minFreq = 20; 
    const maxFreq = sampleRate / 2;
    const logMin = Math.log(minFreq);
    const logMax = Math.log(maxFreq);
    const scale = logMax - logMin;

    const barWidth = width / barCount;
    let hasAirContent = false;

    // Draw Frequency Bars
    for (let i = 0; i < barCount; i++) {
      // Calculate frequency range for this logarithmic bin
      const percent = i / barCount;
      const nextPercent = (i + 1) / barCount;
      
      const startFreq = Math.exp(logMin + scale * percent);
      const endFreq = Math.exp(logMin + scale * nextPercent);
      
      const startBin = Math.floor(startFreq / binWidth);
      const endBin = Math.floor(endFreq / binWidth);
      
      let sum = 0;
      let count = 0;
      for(let j = startBin; j < endBin && j < bufferLength; j++) {
        sum += dataArray[j];
        count++;
      }
      
      // Fallback for narrow bins at low freq
      if (count === 0 && startBin < bufferLength) {
         sum = dataArray[startBin];
         count = 1;
      }

      const average = count > 0 ? sum / count : 0;
      const barHeight = Math.pow(average / 255, 1.2) * (height * 0.85);

      const x = i * barWidth;
      const y = height - barHeight;

      // --- Color Logic ---
      const isAirBand = startFreq > 20000;
      const isFundamental = fundamentalHz >= startFreq && fundamentalHz <= endFreq;
      
      // Check for Bass Fundamental (Kick Sub)
      // Usually between 40-100Hz
      const isBassFundamental = bassHz ? (bassHz >= startFreq && bassHz <= endFreq) : false;

      if (isAirBand && average > 10) hasAirContent = true;

      if (isAirBand) {
        // High Freq (Air) - Cyan/White/Gold shimmer
        ctx.fillStyle = `hsla(180, 100%, ${60 + (average/255)*40}%, ${0.6 + (average/255)*0.4})`;
        ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
        ctx.shadowBlur = average * 0.2;
      } else if (isBassFundamental) {
        // Kick/Sub Fundamental - Neon Lime (Requested "Grun")
        ctx.fillStyle = `hsla(84, 100%, 60%, 1)`; // Lime-400 equivalent
        ctx.shadowColor = 'rgba(163, 230, 53, 0.9)';
        ctx.shadowBlur = 30;
      } else if (isFundamental) {
        // Tuning Reference (A4) - Emerald Green
        ctx.fillStyle = `hsla(150, 100%, 60%, 1)`;
        ctx.shadowColor = 'rgba(52, 211, 153, 0.9)';
        ctx.shadowBlur = 25;
      } else {
        // Standard Spectrum - Indigo/Purple Gradient
        const hue = 240 + (percent * 60); // Indigo -> Magenta
        const lightness = 50 + (average/255) * 20;
        ctx.fillStyle = `hsla(${hue}, 80%, ${lightness}%, 0.85)`;
        ctx.shadowColor = `hsla(${hue}, 80%, 50%, 0.5)`;
        ctx.shadowBlur = average * 0.1;
      }

      ctx.beginPath();
      // Round top bars
      ctx.roundRect(x + 1, y, barWidth - 2, barHeight, 4);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;

    // --- Overlays ---

    // 20kHz Limit Line
    const airPercent = (Math.log(20000) - logMin) / scale;
    const airX = airPercent * width;
    
    if (airX < width) {
      // Dashed Line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([4, 4]);
      ctx.moveTo(airX, 0);
      ctx.lineTo(airX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.font = '10px "Inter", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText('20kHz', airX + 4, 20);
      
      // Active Air Indicator
      if (hasAirContent) {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.2)'; // Cyan tint
        ctx.fillRect(airX, 0, width - airX, height);
        
        ctx.fillStyle = '#22d3ee';
        ctx.fillText('AIR BAND ACTIVE', airX + 4, 35);
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(airX, 32, 2, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Reference Fundamental Label (A4)
    if (fundamentalHz > 200) {
       const fundPercent = (Math.log(fundamentalHz) - logMin) / scale;
       if(fundPercent >= 0 && fundPercent <= 1) {
           const fundX = fundPercent * width;
           
           // Simple Marker at bottom
           ctx.fillStyle = '#34d399'; // Emerald 400
           ctx.beginPath();
           ctx.moveTo(fundX, height);
           ctx.lineTo(fundX - 4, height - 6);
           ctx.lineTo(fundX + 4, height - 6);
           ctx.fill();
           
           // Freq Text
           if (isPlaying) {
             ctx.textAlign = 'center';
             ctx.fillStyle = 'rgba(52, 211, 153, 0.8)';
             ctx.fillText('REF ' + fundamentalHz.toFixed(0), fundX, height - 12);
             ctx.textAlign = 'left';
           }
       }
    }

    // Bass Fundamental Label (Sub)
    if (bassHz && bassHz > 20 && bassHz < 150) {
        const bassPercent = (Math.log(bassHz) - logMin) / scale;
        if(bassPercent >= 0 && bassPercent <= 1) {
            const bassX = bassPercent * width;
            
            // Sub Marker (Triangle pointing down from top, maybe?) or just a distinct dot
            // Let's do a glowing dot slightly above the bar
            
            ctx.shadowColor = '#a3e635';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#a3e635'; // Lime 400
            
            ctx.beginPath();
            ctx.arc(bassX + barWidth/2, height - 20, 3, 0, Math.PI*2);
            ctx.fill();
            
            ctx.shadowBlur = 0;
            
            if (isPlaying) {
                ctx.textAlign = 'center';
                ctx.fillStyle = '#bef264'; // Lime 300
                ctx.font = 'bold 10px "Inter", monospace';
                ctx.fillText('SUB ' + bassHz.toFixed(0), bassX + barWidth/2, height - 30);
                ctx.textAlign = 'left';
            }
        }
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
  }, [isPlaying, fundamentalHz, bassHz]);

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
          Logarithmic Analysis
        </span>
        <span className="text-[10px] font-mono text-slate-600 tracking-widest">
          HARMONIC OVERTONE DETECTOR
        </span>
      </div>
    </div>
  );
};

export default Visualizer;