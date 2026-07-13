import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { springSnappy, springBouncy, springSmooth } from './Scene1Intro';

export default function Scene4Reward() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Base elements in
      setTimeout(() => setPhase(2), 1500), // XP + Streak count up
      setTimeout(() => setPhase(3), 3000), // Mascot cheer + confetti
      setTimeout(() => setPhase(4), 5000), // Goal reached banner
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.8 }}
    >
      {/* Celebration Background */}
      <motion.div 
        className="absolute inset-0"
        initial={{ backgroundColor: 'var(--color-background)' }}
        animate={{ 
          backgroundColor: phase >= 3 ? '#FEF3C7' : '#F8FAFC' // transition to amber-50 on cheer
        }}
        transition={{ duration: 1 }}
      />

      {/* Confetti Particles */}
      {phase >= 3 && (
        <div className="absolute inset-0 pointer-events-none z-0">
          {[...Array(40)].map((_, i) => (
            <motion.div
              key={`confetti-${i}`}
              className={`absolute w-[1vw] h-[3vw] rounded-full ${
                ['bg-primary', 'bg-success', 'bg-gold', 'bg-accent'][Math.floor(Math.random() * 4)]
              }`}
              initial={{ 
                x: '50vw', 
                y: '50vh', 
                scale: 0,
                rotate: 0
              }}
              animate={{ 
                x: `${Math.random() * 100}vw`, 
                y: `${100 + Math.random() * 20}vh`,
                scale: Math.random() * 1 + 0.5,
                rotate: Math.random() * 720
              }}
              transition={{ 
                duration: 2 + Math.random() * 2, 
                ease: "easeOut"
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center max-w-[80vw] w-full">
        
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: phase >= 1 ? 1 : 0.8, opacity: phase >= 1 ? 1 : 0 }}
          transition={springSmooth}
          className="text-center mb-[6vh]"
        >
          <h2 className="text-[4vw] font-black text-foreground mb-[1vh]">Lesson Complete!</h2>
          <p className="text-[1.8vw] text-muted-foreground">You're making great progress.</p>
        </motion.div>

        <div className="flex gap-[4vw] items-center justify-center w-full relative">
          
          {/* XP Card */}
          <motion.div 
            className="glass-card flex-1 p-[3vw] flex flex-col items-center relative z-20"
            initial={{ x: '-5vw', opacity: 0 }}
            animate={{ x: phase >= 1 ? 0 : '-5vw', opacity: phase >= 1 ? 1 : 0 }}
            transition={{ delay: 0.2, ...springSnappy }}
          >
            <motion.div 
              className="w-[8vw] h-[8vw] rounded-2xl bg-primary/10 flex items-center justify-center text-[4vw] mb-[2vh] text-primary"
              animate={phase >= 2 ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] } : {}}
              transition={{ duration: 0.5 }}
            >
              ⚡
            </motion.div>
            <div className="text-[1.5vw] font-bold text-muted-foreground mb-[1vh]">Total XP</div>
            
            <motion.div 
              className="text-[5vw] font-black text-primary leading-none"
              initial={{ scale: 1 }}
              animate={phase >= 2 ? { scale: [1, 1.3, 1], color: ['#4F46E5', '#F59E0B', '#4F46E5'] } : {}}
            >
              {phase >= 2 ? "150" : "135"}
            </motion.div>
            {phase >= 2 && (
              <motion.div 
                className="text-success font-bold mt-[1vh] text-[1.5vw]"
                initial={{ opacity: 0, y: '1vh' }}
                animate={{ opacity: 1, y: 0 }}
              >
                +15 XP
              </motion.div>
            )}
          </motion.div>

          {/* Mascot cheering in center */}
          <motion.div
            initial={{ scale: 0, y: '5vh' }}
            animate={{ 
              scale: phase >= 3 ? [1, 1.2, 1] : 1, 
              y: phase >= 3 ? [0, '-4vh', 0] : 0 
            }}
            transition={{ 
              scale: springBouncy, 
              y: { type: 'spring', bounce: 0.6, duration: 0.8 } 
            }}
            className="w-[15vw] relative z-30 flex justify-center"
          >
            <div className="w-[12vw] h-[12vw] rounded-full bg-success flex items-center justify-center text-[5vw] shadow-2xl shadow-success/40">
              🎉
            </div>
            <motion.img 
              src={`${import.meta.env.BASE_URL}images/mascot-cheer.png`} 
              className="absolute inset-0 w-[12vw] h-[12vw] mx-auto object-cover rounded-full z-10 bg-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onError={(e) => (e.currentTarget.style.opacity = '0')}
            />
          </motion.div>

          {/* Streak Card */}
          <motion.div 
            className="glass-card flex-1 p-[3vw] flex flex-col items-center relative z-20"
            initial={{ x: '5vw', opacity: 0 }}
            animate={{ x: phase >= 1 ? 0 : '5vw', opacity: phase >= 1 ? 1 : 0 }}
            transition={{ delay: 0.4, ...springSnappy }}
          >
            <motion.div 
              className="w-[8vw] h-[8vw] rounded-2xl bg-gold/10 flex items-center justify-center text-[4vw] mb-[2vh] text-gold"
              animate={phase >= 2 ? { scale: [1, 1.2, 1], rotate: [0, -10, 10, 0] } : {}}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              🔥
            </motion.div>
            <div className="text-[1.5vw] font-bold text-muted-foreground mb-[1vh]">Day Streak</div>
            
            <motion.div 
              className="text-[5vw] font-black text-gold leading-none"
              initial={{ scale: 1 }}
              animate={phase >= 2 ? { scale: [1, 1.4, 1] } : {}}
              transition={{ delay: 0.1 }}
            >
              {phase >= 2 ? "7" : "6"}
            </motion.div>
            {phase >= 2 && (
              <motion.div 
                className="text-gold font-bold mt-[1vh] text-[1.5vw]"
                initial={{ opacity: 0, y: '1vh' }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                1 Week!
              </motion.div>
            )}
          </motion.div>

        </div>

        {/* Daily Goal Banner */}
        <motion.div
          className="absolute -bottom-[12vh] bg-foreground text-background px-[4vw] py-[2vh] rounded-full shadow-2xl flex items-center gap-[1vw] z-40"
          initial={{ y: '20vh', opacity: 0 }}
          animate={{ y: phase >= 4 ? 0 : '20vh', opacity: phase >= 4 ? 1 : 0 }}
          transition={springBouncy}
        >
          <span className="text-[2.5vw]">🎯</span>
          <span className="text-[1.8vw] font-bold">Daily Goal Reached! Consistency builds fluency.</span>
        </motion.div>

      </div>
    </motion.div>
  );
}
