import { motion, type Transition } from 'framer-motion';
import { useEffect, useState } from 'react';

// Common spring configs
export const springSnappy: Transition = { type: 'spring', stiffness: 400, damping: 30 };
export const springBouncy: Transition = { type: 'spring', stiffness: 300, damping: 15 };
export const springSmooth: Transition = { type: 'spring', stiffness: 120, damping: 25 };

export default function Scene1Intro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Mascot in
      setTimeout(() => setPhase(2), 1200), // Title in
      setTimeout(() => setPhase(3), 2000), // Subtitle in
      setTimeout(() => setPhase(4), 3000), // Floating tags
      setTimeout(() => setPhase(5), 4500), // Start badge
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8 }}
    >
      {/* Dynamic Background */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-br from-background via-muted to-[#E0E7FF]"
        animate={{ 
          backgroundPosition: phase > 1 ? "100% 100%" : "0% 0%",
        }}
        transition={{ duration: 4, ease: "linear" }}
      />
      
      {/* Decorative Grid */}
      <div className="absolute inset-0" style={{ 
        backgroundImage: 'radial-gradient(hsl(var(--primary) / 0.06) 1px, transparent 1px)',
        backgroundSize: '2vw 2vw'
      }} />

      {/* Floating Accent Shapes */}
      <motion.div 
        className="absolute top-[20%] left-[20%] w-[15vw] h-[15vw] rounded-full bg-accent/20 blur-3xl"
        animate={{ 
          x: [0, 50, 0], 
          y: [0, -30, 0],
          scale: [1, 1.2, 1] 
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute bottom-[20%] right-[20%] w-[20vw] h-[20vw] rounded-full bg-primary/20 blur-3xl"
        animate={{ 
          x: [0, -40, 0], 
          y: [0, 40, 0],
          scale: [1, 1.3, 1] 
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Mascot */}
        <motion.div
          initial={{ scale: 0, y: '5vh', rotate: -20 }}
          animate={{ scale: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : '5vh', rotate: phase >= 1 ? 0 : -20 }}
          transition={springBouncy}
          className="mb-[4vh] relative"
        >
          <div className="w-[12vw] h-[12vw] rounded-full bg-primary flex items-center justify-center text-[4vw] shadow-xl shadow-primary/20">
            <span className="text-white">👋</span>
          </div>
          <motion.img 
            src={`${import.meta.env.BASE_URL}images/mascot-wave.png`} 
            className="absolute inset-0 w-full h-full object-cover rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onError={(e) => (e.currentTarget.style.opacity = '0')}
          />
          
          {/* Start Badge */}
          <motion.div
            className="absolute -right-[2vw] -bottom-[1vw] bg-success text-white px-[1.5vw] py-[0.5vw] rounded-full font-bold shadow-lg text-[1.2vw] whitespace-nowrap"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: phase >= 5 ? 1 : 0, opacity: phase >= 5 ? 1 : 0 }}
            transition={springBouncy}
          >
            Start Learning
          </motion.div>
        </motion.div>

        {/* Text Container */}
        <div className="text-center overflow-hidden flex flex-col items-center">
          <motion.div
            initial={{ y: '10vh' }}
            animate={{ y: phase >= 2 ? 0 : '10vh' }}
            transition={springSnappy}
          >
            <h1 className="text-[6vw] leading-none font-extrabold text-foreground tracking-tight mb-[2vh]">
              Bolo<span className="text-primary">!</span>
            </h1>
          </motion.div>
          
          <div className="overflow-hidden mt-[1vh]">
            <motion.p 
              className="text-[2.2vw] font-medium text-muted-foreground"
              initial={{ y: '5vh', opacity: 0 }}
              animate={{ 
                y: phase >= 3 ? 0 : '5vh', 
                opacity: phase >= 3 ? 1 : 0 
              }}
              transition={springSmooth}
            >
              Learn <span className="text-foreground font-bold">22</span> Indian Languages
            </motion.p>
          </div>
        </div>

        {/* Floating Language Tags */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center w-[80vw] h-[80vh] left-[10vw] top-[10vh]">
          {/* Hindi */}
          <motion.div 
            className="absolute top-[20%] left-[10%] glass-card px-[1.5vw] py-[0.8vw] text-[1.8vw] font-devanagari font-bold text-primary -rotate-12 shadow-xl"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: phase >= 4 ? 1 : 0, 
              opacity: phase >= 4 ? 1 : 0,
              y: phase >= 4 ? [0, -10, 0] : 0
            }}
            transition={{ 
              scale: springBouncy, 
              opacity: { duration: 0.2 },
              y: { duration: 3, repeat: Infinity, ease: "easeInOut" }
            }}
          >
            नमस्ते
          </motion.div>

          {/* Bengali */}
          <motion.div 
            className="absolute bottom-[20%] right-[10%] glass-card px-[1.5vw] py-[0.8vw] text-[1.8vw] font-bengali font-bold text-secondary rotate-6 shadow-xl"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: phase >= 4 ? 1 : 0, 
              opacity: phase >= 4 ? 1 : 0,
              y: phase >= 4 ? [0, 10, 0] : 0
            }}
            transition={{ 
              scale: springBouncy, 
              opacity: { duration: 0.2 },
              delay: 0.1,
              y: { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }
            }}
          >
            নমস্কার
          </motion.div>

          {/* Tamil */}
          <motion.div 
            className="absolute top-[30%] right-[15%] glass-card px-[1.5vw] py-[0.8vw] text-[1.8vw] font-tamil font-bold text-accent rotate-12 shadow-xl"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: phase >= 4 ? 1 : 0, 
              opacity: phase >= 4 ? 1 : 0,
              y: phase >= 4 ? [0, -8, 0] : 0
            }}
            transition={{ 
              scale: springBouncy, 
              opacity: { duration: 0.2 },
              delay: 0.2,
              y: { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 1 }
            }}
          >
            வணக்கம்
          </motion.div>

          {/* Gujarati */}
          <motion.div 
            className="absolute bottom-[30%] left-[15%] glass-card px-[1.5vw] py-[0.8vw] text-[1.8vw] font-gujarati font-bold text-success -rotate-6 shadow-xl"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: phase >= 4 ? 1 : 0, 
              opacity: phase >= 4 ? 1 : 0,
              y: phase >= 4 ? [0, 12, 0] : 0
            }}
            transition={{ 
              scale: springBouncy, 
              opacity: { duration: 0.2 },
              delay: 0.3,
              y: { duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }
            }}
          >
            કેમ છો
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
