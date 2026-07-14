// Scene 2: How it works (product demo)
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const SPRING = { type: 'spring', stiffness: 300, damping: 25 } as const;
const SLOW_SPRING = { type: 'spring', stiffness: 120, damping: 20 } as const;

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),   // Show UI card & phrase settles
      setTimeout(() => setPhase(2), 3500),   // Mic active (waveforms 1)
      setTimeout(() => setPhase(3), 7500),   // Analyzing beat 1
      setTimeout(() => setPhase(4), 10500),  // Try again beat
      setTimeout(() => setPhase(5), 14000),  // Mic active (waveforms 2)
      setTimeout(() => setPhase(6), 18000),  // Analyzing beat 2
      setTimeout(() => setPhase(7), 21000),  // Success score
      setTimeout(() => setPhase(8), 23500),  // Progress bar fill + Streak +1
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  // Determine which mascot to show based on phase
  const getMascot = () => {
    if (phase >= 7) return 'mascot-thumbsup.png';
    if (phase === 4) return 'mascot-tryagain.png';
    if (phase === 3 || phase === 6) return 'mascot-thinking.png';
    return 'mascot-listen.png';
  };

  return (
    <motion.div 
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(5px)" }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
    >
      {/* Background drift for continuous motion */}
      <motion.div 
        className="absolute inset-0 bg-background/50 backdrop-blur-sm pointer-events-none origin-center"
        animate={{ scale: [1, 1.05, 1], rotate: [0, 1, -1, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative w-full h-full flex flex-col items-center justify-center px-6 pb-16 pt-10">

        {/* Mascot Area */}
        <motion.div 
          className="relative h-56 w-56 mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          {/* Animated Mascot Backdrop */}
          <motion.div 
            className="absolute inset-0 rounded-full bg-accent/20 blur-2xl"
            animate={{ 
              scale: (phase === 3 || phase === 6) ? [1, 1.3, 1] : 1,
              opacity: (phase === 3 || phase === 6) ? 0.8 : 0.4
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          
          <motion.img 
            key={phase} // Forces re-animation on source change
            src={`${import.meta.env.BASE_URL}images/${getMascot()}`}
            alt="Bolo Mascot"
            className="w-full h-full object-contain relative z-10 drop-shadow-2xl"
            initial={{ scale: 0.8, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={SPRING}
          />
          
          {/* Continuous gentle float for Mascot */}
          <motion.div
            className="absolute inset-0 z-20 pointer-events-none"
            animate={{ y: [-5, 5, -5] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        {/* App UI Card */}
        <motion.div 
          className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl border border-border overflow-hidden relative"
          initial={{ y: 50, opacity: 0 }}
          animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
          transition={SLOW_SPRING}
        >
          {/* Progress Bar Header */}
          <div className="h-3 bg-muted w-full relative overflow-hidden">
            <motion.div 
              className="absolute left-0 top-0 bottom-0 bg-success"
              initial={{ width: "30%" }}
              animate={{ width: phase >= 8 ? "60%" : "30%" }}
              transition={{ duration: 1, ease: "circOut" }}
            />
          </div>

          <div className="p-8 flex flex-col items-center text-center min-h-[340px]">
            <p className="text-xs font-bold text-muted mb-4 tracking-widest uppercase">Speak this phrase</p>
            
            {/* Target Phrase Container */}
            <motion.div 
              animate={{ y: [-2, 2, -2] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <h3 className="font-gujarati text-5xl font-bold text-foreground mb-3 leading-tight drop-shadow-sm">કેમ છો?</h3>
              <p className="text-muted font-medium mb-10 text-xl tracking-wide">Kem cho?</p>
            </motion.div>

            {/* Interaction Area Box */}
            <div className="relative w-full flex-grow flex items-center justify-center">
              
              {/* Idle Mic State */}
              <motion.div 
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 1, scale: 1 }}
                animate={{ 
                  opacity: (phase === 1) ? 1 : 0,
                  scale: (phase === 1) ? 1 : 0.8
                }}
                transition={{ duration: 0.3 }}
              >
                <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
                   <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </motion.div>

              {/* Recording Waveforms */}
              <motion.div 
                className="absolute inset-0 flex items-center justify-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: (phase === 2 || phase === 5) ? 1 : 0 }}
              >
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-3 bg-primary rounded-full"
                    animate={(phase === 2 || phase === 5) ? {
                      height: ["20%", "90%", "30%", "100%", "40%", "20%"],
                    } : { height: "20%" }}
                    transition={{
                      duration: 0.7,
                      repeat: Infinity,
                      ease: "linear",
                      delay: i * 0.1
                    }}
                  />
                ))}
              </motion.div>

              {/* Analyzing Spinner */}
              <motion.div 
                className="absolute inset-0 flex flex-col items-center justify-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ 
                  opacity: (phase === 3 || phase === 6) ? 1 : 0,
                  scale: (phase === 3 || phase === 6) ? 1 : 0.9
                }}
              >
                <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mb-3 shadow-sm" />
                <p className="text-primary font-bold text-sm tracking-widest uppercase">Analyzing...</p>
              </motion.div>

              {/* Try Again Beat */}
              <motion.div 
                className="absolute inset-0 flex flex-col items-center justify-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: phase === 4 ? 1 : 0,
                  y: phase === 4 ? 0 : 20
                }}
                transition={SPRING}
              >
                <div className="bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-sm font-bold mb-3">
                  Almost!
                </div>
                <p className="text-muted text-base font-medium">Try emphasizing the 'ch'</p>
              </motion.div>

              {/* Success Score Reveal */}
              <motion.div 
                className="absolute inset-0 flex flex-col items-center justify-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ 
                  opacity: phase >= 7 ? 1 : 0,
                  scale: phase >= 7 ? 1 : 0.5
                }}
                transition={SPRING}
              >
                <div className="bg-success text-white px-5 py-1.5 rounded-full text-sm font-bold mb-3 flex items-center gap-1.5 shadow-md shadow-success/30">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  Perfect!
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-6xl font-extrabold text-success drop-shadow-sm">96</span>
                  <span className="text-2xl font-bold text-success/70">%</span>
                </div>
              </motion.div>

            </div>
          </div>
        </motion.div>

        {/* Streak Popup Over the card */}
        <motion.div
          className="absolute top-[20%] right-8 z-30"
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={phase >= 8 ? { opacity: 1, scale: 1, y: 0, rotate: [0, -10, 5, 0] } : {}}
          transition={{ ...SPRING, delay: 0.3 }}
        >
          <div className="bg-gold text-white px-4 py-2 rounded-2xl shadow-xl font-bold flex items-center gap-2 border-2 border-white/50 transform rotate-12">
            <span className="text-2xl">🔥</span>
            <span className="text-xl">+1</span>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}