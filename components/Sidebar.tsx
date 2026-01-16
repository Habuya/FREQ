import React from 'react';
import { Activity, Upload, Settings, Github, Radio, Cpu, Layers, Terminal, Pi } from 'lucide-react';

interface SidebarProps {
  hasFile: boolean;
  activeView: 'dashboard' | 'settings';
  onNavigate: (view: 'dashboard' | 'settings') => void;
  onReset: () => void;
  processState: string;
  onToggleDebug: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ hasFile, activeView, onNavigate, onReset, processState, onToggleDebug }) => {
  
  const NavItem = ({ 
    icon: Icon, 
    label, 
    subLabel,
    active = false, 
    onClick,
    danger = false
  }: { 
    icon: any, 
    label: string, 
    subLabel?: string,
    active?: boolean, 
    onClick: () => void,
    danger?: boolean
  }) => (
    <button
      onClick={onClick}
      className={`
        w-full group relative flex items-center gap-4 px-6 py-4 transition-all duration-200
        hover:bg-white/[0.02]
        ${active ? 'bg-white/[0.04]' : 'opacity-60 hover:opacity-100'}
      `}
    >
      {/* Active Indicator Line */}
      {active && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]"></div>
      )}

      {/* Icon Container - Sharp Geometric */}
      <div className={`
        relative p-2 border transition-all duration-300
        ${active 
          ? 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
          : 'border-white/10 bg-black/20 text-slate-400 group-hover:border-white/30 group-hover:text-white'}
      `}>
        <Icon size={18} strokeWidth={1.5} />
        
        {/* Decor Corners */}
        <div className="absolute top-0 right-0 w-1 h-1 border-t border-r border-current opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-1 h-1 border-b border-l border-current opacity-50"></div>
      </div>

      {/* Text Label */}
      <div className="flex flex-col items-start">
        <span className={`
          text-[10px] font-bold font-mono tracking-[0.2em] uppercase
          ${active ? 'text-white text-glow' : 'text-slate-400 group-hover:text-white'}
          ${danger ? 'hover:text-rose-400' : ''}
        `}>
          {label}
        </span>
        {subLabel && (
          <span className="text-[9px] text-slate-600 font-mono tracking-wider mt-0.5">
            {subLabel}
          </span>
        )}
      </div>
    </button>
  );

  return (
    <aside className="hidden md:flex w-[280px] h-full flex-col border-r border-white/5 bg-[#141417]/95 backdrop-blur-2xl relative z-40 shrink-0">
      
      {/* Header / Branding */}
      <div className="p-8 pb-10 border-b border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-20"></div>
        
        <div className="flex items-center gap-3 mb-2">
          {/* Logo Mark: Pi 23 */}
          <div className="h-10 px-3 bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] flex items-center justify-center gap-1">
            <Pi size={24} strokeWidth={2.5} />
            <span className="font-bold text-xl font-mono leading-none tracking-tighter">23</span>
          </div>

          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">
              ZEN_TUNER
            </h1>
            <span className="text-[9px] text-blue-500 tracking-[0.3em] font-mono mt-1 opacity-80">
              QUANTUM.PI.23
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto py-6 space-y-8 no-scrollbar">
        
        {/* Section 1: Modules */}
        <div>
          <div className="px-6 mb-4 flex items-center gap-2 opacity-40">
            <Layers size={10} className="text-blue-400" />
            <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-blue-300">
              Core_Modules
            </span>
          </div>
          
          <div className="space-y-1">
            <NavItem 
              icon={Activity} 
              label="Spectral Analyzer" 
              subLabel="FFT Visualisation"
              active={activeView === 'dashboard' && hasFile} 
              onClick={() => onNavigate('dashboard')}
            />
            <NavItem 
              icon={Upload} 
              label="Signal Input" 
              subLabel="Load / Stream Source"
              active={activeView === 'dashboard' && !hasFile} 
              onClick={onReset}
            />
          </div>
        </div>

        {/* Section 2: Configuration */}
        <div>
          <div className="px-6 mb-4 flex items-center gap-2 opacity-40">
            <Cpu size={10} className="text-blue-400" />
            <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-blue-300">
              System_Config
            </span>
          </div>
          
          <div className="space-y-1">
            <NavItem 
              icon={Settings} 
              label="Global Settings" 
              subLabel="DSP Parameters"
              active={activeView === 'settings'}
              onClick={() => onNavigate('settings')}
            />
            <NavItem 
              icon={Terminal} 
              label="System Logs" 
              subLabel="Debug Console"
              onClick={onToggleDebug}
            />
            <NavItem 
              icon={Github} 
              label="Source Code" 
              subLabel="Repository"
              onClick={() => window.open('https://github.com', '_blank')}
            />
          </div>
        </div>
      </div>

      {/* Footer / Status */}
      <div className="p-6 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-3">
           <div className={`w-2 h-2 rounded-none rotate-45 ${processState === 'analyzing' || processState === 'decoding' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`}></div>
           <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
             STATUS: <span className="text-white">{processState === 'idle' && !hasFile ? 'STANDBY' : processState.toUpperCase()}</span>
           </span>
        </div>
        
        <div className="flex items-center justify-between text-[9px] text-slate-600 font-mono tracking-wider">
           <span>DSP_ENGINE: V.2.1</span>
           <span>LATENCY: 12ms</span>
        </div>
      </div>

      {/* Background Decor */}
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/5 blur-[80px] pointer-events-none"></div>
    </aside>
  );
};

export default Sidebar;