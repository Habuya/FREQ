import React, { useEffect, useState, useRef } from 'react';
import { logger, LogEntry } from '../services/logger';
import { X, Pause, Play, Trash2, Download, Terminal, Activity, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface DebugConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(logger.getHistory());
    const unsubscribe = logger.subscribe((entry) => {
      if (!isPaused) {
        setLogs(prev => [entry, ...prev]);
      }
    });
    return unsubscribe;
  }, [isPaused]);

  if (!isOpen) return null;

  const getLevelStyles = (level: string) => {
    switch (level) {
      case 'error': return { color: 'text-rose-500', icon: AlertTriangle };
      case 'warn': return { color: 'text-amber-400', icon: Activity };
      case 'success': return { color: 'text-emerald-400', icon: CheckCircle };
      case 'debug': return { color: 'text-slate-500', icon: Terminal };
      default: return { color: 'text-blue-300', icon: Info };
    }
  };

  const handleExport = () => {
      const text = logs.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${l.code ? `[${l.code}]` : ''} ${l.message}`).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zentuner_debug_dump_${Date.now()}.log`;
      a.click();
      logger.success('Logs exported to local filesystem', 'IO_WRITE');
  };

  const formatTimestamp = (ts: number) => {
      const d = new Date(ts);
      return `${d.toLocaleTimeString('en-US', { hour12: false })}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 h-64 bg-[#030405] border-t border-slate-800 z-[100] font-mono flex flex-col shadow-[0_-10px_50px_rgba(0,0,0,0.9)] animate-in slide-in-from-bottom duration-300">
      
      {/* Dense Grid Background */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{ 
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', 
            backgroundSize: '20px 20px' 
        }}
      ></div>

      {/* Header Toolbar - Ultra Minimal */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-[#08090b] relative z-10">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-blue-500" />
          <span className="text-[10px] font-bold text-slate-300 tracking-widest uppercase">KERNEL_LOG</span>
          <span className="text-[9px] text-slate-600 tracking-wider">:: STREAMING</span>
        </div>

        <div className="flex items-center gap-px bg-slate-900 border border-slate-800 rounded-sm overflow-hidden">
          <button 
            onClick={() => setIsPaused(!isPaused)} 
            className={`p-1 w-8 flex items-center justify-center hover:bg-slate-800 transition-colors ${isPaused ? 'text-amber-400' : 'text-slate-400'}`} 
            title={isPaused ? "Resume" : "Pause"}
          >
             {isPaused ? <Play size={10} /> : <Pause size={10} />}
          </button>
          <div className="w-px h-3 bg-slate-800"></div>
          <button onClick={() => { logger.clear(); setLogs([]); }} className="p-1 w-8 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Clear">
             <Trash2 size={10} />
          </button>
          <div className="w-px h-3 bg-slate-800"></div>
          <button onClick={handleExport} className="p-1 w-8 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Export">
             <Download size={10} />
          </button>
        </div>
        
        <button onClick={onClose} className="ml-4 text-slate-600 hover:text-rose-400 transition-colors">
             <X size={12} />
        </button>
      </div>

      {/* Log Stream Area - Denser Typography */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[10px] relative z-10 scroll-smooth bg-black/40">
         {logs.map((log) => {
           const style = getLevelStyles(log.level);
           const Icon = style.icon;
           
           return (
             <div key={log.id} className="flex items-baseline gap-2 hover:bg-white/[0.03] px-1 py-[1px] group">
                {/* Timestamp */}
                <span className="text-slate-700 shrink-0 font-light w-16 tabular-nums opacity-60">
                  {formatTimestamp(log.timestamp)}
                </span>
                
                {/* Level */}
                <span className={`w-3 shrink-0 ${style.color}`}>
                   <Icon size={8} />
                </span>

                {/* Code */}
                <span className="w-20 shrink-0 text-slate-500 font-bold uppercase tracking-wider text-[9px] opacity-70">
                   {log.code || 'SYS'}
                </span>

                {/* Message */}
                <span className="text-slate-400 break-all leading-tight">
                   {log.message}
                </span>
             </div>
           );
         })}
         
         {logs.length === 0 && (
             <div className="h-full flex items-center justify-center opacity-20">
                 <span className="text-[40px] font-bold text-slate-800 select-none tracking-tighter">NO_SIGNAL</span>
             </div>
         )}
      </div>
      
      {/* Footer Status Line */}
      <div className="h-5 bg-[#050608] border-t border-slate-900 flex items-center px-3 text-[9px] text-slate-600 justify-between font-mono">
          <span>BUFFER: {logs.length} / 200</span>
          <span>HEAP: {(((performance as any).memory?.usedJSHeapSize || 0) / 1024 / 1024).toFixed(1)} MB</span>
      </div>
    </div>
  );
};

export default DebugConsole;