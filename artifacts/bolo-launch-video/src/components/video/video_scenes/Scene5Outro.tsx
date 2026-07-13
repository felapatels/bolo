import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { springSnappy, springBouncy, springSmooth } from './Scene1Intro';

export default function Scene5Outro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000), // Logo in
      setTimeout(() => setPhase(2), 2500), // Tagline in
      setTimeout(() => setPhase(3), 4000), // CTA in
      setTimeout(() => setPhase(4), 5000), // Ratings in
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-foreground"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }} // Dramatic wipe
    >
      
      {/* Background Effects */}
      <motion.div 
        className="absolute w-[60vw] h-[60vw] rounded-full bg-primary/20 blur-[10vw]"
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5]
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-accent/20 blur-[10vw]"
        animate={{ 
          scale: [1.2, 1, 1.2],
          opacity: [0.3, 0.6, 0.3]
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 flex flex-col items-center w-full">
        
        {/* Logo Lockup */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: '5vh' }}
          animate={{ 
            scale: phase >= 1 ? 1 : 0.8, 
            opacity: phase >= 1 ? 1 : 0, 
            y: phase >= 1 ? 0 : '5vh' 
          }}
          transition={{ ...springBouncy }}
          className="mb-[4vh]"
        >
          <h1 className="text-[8vw] font-black text-white tracking-tight leading-none">
            Bolo<span className="text-primary">!</span>
          </h1>
        </motion.div>

        {/* Tagline */}
        <motion.div className="overflow-hidden mb-[8vh]">
          <motion.p 
            className="text-[2.5vw] font-medium text-slate-300"
            initial={{ y: '100%' }}
            animate={{ y: phase >= 2 ? 0 : '100%' }}
            transition={springSmooth}
          >
            Find your voice in your mother tongue.
          </motion.p>
        </motion.div>

        {/* CTA (Visual only, no interactivity) */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ 
            scale: phase >= 3 ? 1 : 0.9, 
            opacity: phase >= 3 ? 1 : 0 
          }}
          transition={springSnappy}
          className="mb-[6vh]"
        >
          <div className="bg-white text-foreground px-[4vw] py-[2vh] rounded-[1.5vw] text-[1.8vw] font-bold shadow-2xl shadow-primary/20 flex items-center gap-[1vw]">
            <span>Download on the App Store</span>
            <span className="text-[2.5vw]">📱</span>
          </div>
        </motion.div>

        {/* Ratings / Social Proof */}
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: '2vh' }}
          animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : '2vh' }}
          transition={springSmooth}
        >
          <div className="flex gap-[0.5vw] text-gold text-[2vw] mb-[1vh]">
            ★★★★★
          </div>
          <p className="text-muted-foreground text-[1.2vw] font-semibold tracking-wide uppercase">
            #1 Indian Language Learning App
          </p>
        </motion.div>

      </div>
    </motion.div>
  );
}
