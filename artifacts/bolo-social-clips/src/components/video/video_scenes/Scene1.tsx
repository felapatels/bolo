// Scene 1: Get back to your roots (emotional heritage hook)
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const SPRING = { type: 'spring', stiffness: 300, damping: 25 } as const;
const SLOW_SPRING = { type: 'spring', stiffness: 120, damping: 20 } as const;

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1500),   // Text "Get back to your roots."
      setTimeout(() => setPhase(2), 4500),   // Native text reveal
      setTimeout(() => setPhase(3), 8000),   // Mascot waving
      setTimeout(() => setPhase(4), 13500),  // Clear for transition
      setTimeout(() => setPhase(5), 14500),  // App logo "Bolo!"
      setTimeout(() => setPhase(6), 16000),  // Mascot cheer
      setTimeout(() => setPhase(7), 17500),  // CTA text
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/10 to-teal-900/20 pointer-events-none" />
      
      {/* Continuous Motion: Decorative floating shapes */}
      <motion.div 
        className="absolute top-20 right-10 w-48 h-48 rounded-full bg-accent/20 blur-3xl"
        animate={{ y: [0, -40, 0], scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute bottom-40 left-10 w-64 h-64 rounded-full bg-primary/20 blur-[60px]"
        animate={{ y: [0, 50, 0], scale: [1, 1.3, 1], x: [0, 30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main Content Container - Safe Zone */}
      <div className="relative w-full h-full flex flex-col items-center justify-center px-8 pb-32">
        
        {/* Intro text */}
        <motion.div
          className="absolute top-1/4 text-center w-full px-8"
          initial={{ y: 30, opacity: 0 }}
          animate={{ 
            y: phase >= 4 ? -100 : (phase >= 1 ? 0 : 30), 
            opacity: phase >= 4 ? 0 : (phase >= 1 ? 1 : 0),
            scale: phase >= 4 ? 0.9 : 1
          }}
          transition={SLOW_SPRING}
        >
          <h2 className="text-4xl font-bold text-foreground mb-4 leading-tight drop-shadow-sm">
            Get back to<br/>your roots.
          </h2>
        </motion.div>

        {/* Native Language Reveal */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 text-center w-full z-20"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ 
            scale: phase >= 2 ? (phase >= 4 ? 1.2 : 1) : 0.8,
            opacity: phase >= 2 ? (phase >= 4 ? 0 : 1) : 0,
            y: phase >= 4 ? -50 : 0
          }}
          transition={SLOW_SPRING}
        >
          <motion.div 
            className="bg-white/90 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-white/40 inline-block"
            animate={{ y: [-5, 5, -5] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.p 
              className="font-devanagari text-7xl text-primary font-bold mb-3 drop-shadow-sm"
              initial={{ rotateX: 90, opacity: 0 }}
              animate={phase >= 2 ? { rotateX: 0, opacity: 1 } : { rotateX: 90, opacity: 0 }}
              transition={{ ...SPRING, delay: 0.2 }}
              style={{ transformOrigin: "bottom" }}
            >
              नमस्ते
            </motion.p>
            <motion.p 
              className="text-muted font-medium tracking-widest uppercase text-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              Namaste (Hindi)
            </motion.p>
          </motion.div>
        </motion.div>

        {/* Mascot Phase 1: Waving */}
        <motion.div
          className="absolute bottom-32 w-64 h-64 z-30"
          initial={{ y: 200, opacity: 0, scale: 0.5 }}
          animate={{ 
            y: phase >= 3 ? (phase >= 4 ? 200 : 0) : 200, 
            opacity: phase >= 3 && phase < 4 ? 1 : 0,
            scale: phase >= 3 ? 1 : 0.5
          }}
          transition={SLOW_SPRING}
        >
          <motion.img 
            src={`${import.meta.env.BASE_URL}images/mascot-wave.png`}
            alt="Bolo Mascot Waving"
            className="w-full h-full object-contain drop-shadow-2xl"
            animate={{ rotate: [-5, 5, -5], y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        {/* Ending / Logo / Final Mascot */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center z-40 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 4 ? 1 : 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Main App Logo */}
          <motion.h1 
            className="text-8xl font-extrabold text-primary drop-shadow-lg mb-12"
            initial={{ scale: 0.5, y: 50, opacity: 0 }}
            animate={phase >= 5 ? { scale: 1, y: 0, opacity: 1 } : { scale: 0.5, y: 50, opacity: 0 }}
            transition={SPRING}
          >
            Bolo!
          </motion.h1>

          {/* Final Cheering Mascot */}
          <motion.div
            className="relative w-64 h-64 mb-8"
            initial={{ scale: 0, opacity: 0 }}
            animate={phase >= 6 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ ...SPRING, delay: 0.2 }}
          >
             <motion.img 
              src={`${import.meta.env.BASE_URL}images/mascot-cheer.png`}
              alt="Bolo Mascot Cheering"
              className="w-full h-full object-contain drop-shadow-2xl"
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          {/* Call To Action */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={phase >= 7 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.9 }}
            transition={SPRING}
            className="bg-primary text-white px-8 py-4 rounded-full font-bold shadow-xl shadow-primary/40 text-xl tracking-wide"
          >
            Speak your language again.
          </motion.div>
        </motion.div>

      </div>
    </motion.div>
  );
}