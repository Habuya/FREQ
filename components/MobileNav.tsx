import React from 'react';
import { Activity, Settings, Upload, Plus } from 'lucide-react';

interface MobileNavProps {
  hasFile: boolean;
  activeView: 'dashboard' | 'settings';
  onNavigate: (view: 'dashboard' | 'settings') => void;
  onReset: () => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ hasFile, activeView, onNavigate, onReset }) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#141417] border-t border-white/10 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
      <div className="grid grid-cols-3 h-16 relative">
        
        {/* Module 1: Monitor */}
        <button 
            onClick={() => onNavigate('dashboard')} 
            className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition-all ${activeView === 'dashboard' ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
            <Activity size={20} strokeWidth={activeView === 'dashboard' ? 2 : 1.5} />
            <span className="text-[9px] font-mono uppercase tracking-widest opacity-80">Monitor</span>
        </button>

        {/* Module 2: Initiate Upload (Center) */}
        <div className="flex items-center justify-center -mt-6">
            <button 
                onClick={onReset}
                className={`
                    w-14 h-14 rounded-full flex items-center justify-center 
                    bg-[#1a1c23] border border-blue-500/30 
                    shadow-[0_0_20px_rgba(0,0,0,0.5)] 
                    active:scale-90 transition-all duration-200 group relative overflow-hidden
                    ${!hasFile ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : ''}
                `}
            >
                {/* Inner Glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent opacity-50"></div>
                
                {/* Icon */}
                <div className={`relative z-10 p-3 rounded-full bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg group-hover:from-blue-500 group-hover:to-blue-600 transition-colors`}>
                    <Upload size={20} className="text-white" strokeWidth={2} />
                </div>
                
                {/* Tech Rings */}
                <div className="absolute inset-0 border-2 border-white/5 rounded-full"></div>
                <div className="absolute inset-1 border border-white/5 rounded-full"></div>
            </button>
        </div>

        {/* Module 3: Config */}
        <button 
            onClick={() => onNavigate('settings')}
            className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition-all ${activeView === 'settings' ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
             <Settings size={20} strokeWidth={activeView === 'settings' ? 2 : 1.5} />
             <span className="text-[9px] font-mono uppercase tracking-widest opacity-80">Config</span>
        </button>
      </div>
    </div>
  );
};

export default MobileNav;