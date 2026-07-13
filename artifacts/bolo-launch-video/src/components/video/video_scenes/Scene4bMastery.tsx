import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { springSnappy, springBouncy, springSmooth } from './Scene1Intro';

export default function Scene4bMastery() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Badges cascade in
      setTimeout(() => setPhase(2), 1500), // Progress rings fill
      setTimeout(() => setPhase(3), 3500), // New badge unlocks
      setTimeout(() => setPhase(4), 5500), // Milestone bar
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const BADGES = [
    { icon: '🌱', label: 'First Words', color: 'bg-emerald-100 text-emerald-600', active: true },
    { icon: '🔥', label: '7 Day Streak', color: 'bg-amber-100 text-amber-600', active: true },
    { icon: '🗣️', label: 'Confident', color: 'bg-indigo-100 text-indigo-600', active: true },
    { icon: '🏆', label: 'Champion', color: 'bg-amber-100 text-amber-600', active: phase >= 3 },
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%', opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background large grid */}
      <div className="absolute inset-0" style={{ 
        backgroundImage: 'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
        backgroundSize: '8vw 8vw',
        opacity: 0.3
      }} />

      <div className="relative z-10 w-full max-w-[80vw] flex flex-col items-center">
        <motion.div 
          className="text-center mb-[8vh]"
          initial={{ y: '-5vh', opacity: 0 }}
          animate={{ y: phase >= 1 ? 0 : '-5vh', opacity: phase >= 1 ? 1 : 0 }}
          transition={{ delay: 0.3, ...springSmooth }}
        >
          <h2 className="text-[4vw] font-bold text-foreground mb-[1vh]">Master Your Mother Tongue</h2>
          <p className="text-[1.8vw] text-muted-foreground">Earn badges and track your progress over time</p>
        </motion.div>

        <div className="flex gap-[6vw] w-full justify-center items-stretch">
          
          {/* Progress Overview Card */}
          <motion.div 
            className="glass-card w-[35vw] p-[3vw] flex flex-col items-center relative overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: '5vh' }}
            animate={{ scale: phase >= 1 ? 1 : 0.9, opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : '5vh' }}
            transition={{ delay: 0.5, ...springSnappy }}
          >
            <h3 className="text-[2vw] font-bold mb-[4vh] w-full text-center">Fluency Level</h3>
            
            <div className="relative w-[15vw] h-[15vw] flex items-center justify-center mb-[4vh]">
              {/* Background Ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--color-muted)" strokeWidth="8" />
                <motion.circle 
                  cx="50" cy="50" r="40" 
                  fill="transparent" 
                  stroke="var(--color-primary)" 
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="251.2"
                  initial={{ strokeDashoffset: 251.2 }}
                  animate={{ strokeDashoffset: phase >= 2 ? 251.2 - (251.2 * 0.75) : 251.2 }}
                  transition={{ duration: 2, ease: "easeOut" }}
                />
              </svg>
              <div className="text-center">
                <motion.div 
                  className="text-[3vw] font-black text-foreground leading-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {phase >= 2 ? "75%" : "0%"}
                </motion.div>
                <div className="text-[1vw] text-muted-foreground">Mastered</div>
              </div>
            </div>

            <div className="w-full bg-muted rounded-full h-[1.5vh] mb-[1vh] overflow-hidden">
              <motion.div 
                className="bg-success h-full rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: phase >= 2 ? '60%' : '0%' }}
                transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
              />
            </div>
            <div className="w-full flex justify-between text-[1.2vw] font-semibold text-muted-foreground">
              <span>Vocabulary</span>
              <span>150 / 250 Words</span>
            </div>

            {/* Next Milestone */}
            <motion.div
              className="mt-[4vh] w-full bg-indigo-50 rounded-[1vw] p-[1.5vw] flex justify-between items-center"
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ 
                height: phase >= 4 ? 'auto' : 0, 
                opacity: phase >= 4 ? 1 : 0,
                marginTop: phase >= 4 ? '4vh' : 0
              }}
              transition={springBouncy}
            >
              <span className="text-primary font-bold text-[1.2vw]">Next: 100 Day Streak</span>
              <span className="text-primary text-[1.2vw]">🔥 7/100</span>
            </motion.div>
          </motion.div>

          {/* Badges Grid */}
          <div className="grid grid-cols-2 gap-[2vw] w-[35vw]">
            {BADGES.map((badge, i) => (
              <motion.div
                key={`badge-${i}`}
                className={`glass-card p-[2vw] flex flex-col items-center justify-center text-center relative ${badge.active ? '' : 'opacity-50 grayscale'}`}
                initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                animate={{ 
                  opacity: badge.active ? 1 : 0.5, 
                  scale: badge.active ? (phase === 3 && i === 3 ? [1, 1.2, 1] : 1) : 1, 
                  rotate: 0,
                  boxShadow: phase === 3 && i === 3 ? ['0 0 0px rgba(245,158,11,0)', '0 0 40px rgba(245,158,11,0.6)', '0 0 20px rgba(245,158,11,0.2)'] : 'none'
                }}
                transition={{ 
                  delay: phase === 3 && i === 3 ? 0 : 0.8 + i * 0.1, 
                  ...springBouncy 
                }}
              >
                {/* Unlock animation burst */}
                {phase === 3 && i === 3 && (
                  <motion.div 
                    className="absolute inset-0 bg-gold/20 rounded-[2vw]"
                    initial={{ scale: 1, opacity: 1 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1 }}
                  />
                )}
                
                <div className={`w-[5vw] h-[5vw] rounded-full flex items-center justify-center text-[2.5vw] mb-[1vh] ${badge.color}`}>
                  {badge.icon}
                </div>
                <div className="font-bold text-foreground text-[1.2vw]">{badge.label}</div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </motion.div>
  );
}
