import React, { useState, useEffect } from 'react';
import PongGame from './components/PongGame';

const App: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isMobile) {
    return (
      <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col">
        {/* Mobile: No CRT Frame, just the game */}
        <PongGame isMobile={true} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[#050505] flex items-center justify-center p-4 overflow-hidden">
      
      {/* Retro Monitor Frame (Desktop Only) */}
      <div className="relative z-20 w-full max-w-5xl aspect-[4/3] bg-[#111] rounded-3xl p-4 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] border-4 border-[#222]">
        
        {/* Screen Container */}
        <div className="relative w-full h-full bg-black rounded-xl overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,1)] border-2 border-[#1a1a1a]">
          
          {/* CRT Effects */}
          <div className="scanlines mix-blend-overlay opacity-50 pointer-events-none"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)] pointer-events-none z-10"></div>
          <div className="absolute inset-0 bg-[#33ff33] opacity-[0.03] pointer-events-none z-10 mix-blend-screen"></div>
          
          {/* Game Layer */}
          <div className="relative z-0 w-full h-full crt-flicker">
            <PongGame isMobile={false} />
          </div>
          
        </div>

        {/* Monitor Branding */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[#333] text-xs tracking-widest font-sans font-bold uppercase opacity-50">
          REACT-OS 8-BIT
        </div>
      </div>

    </div>
  );
};

export default App;