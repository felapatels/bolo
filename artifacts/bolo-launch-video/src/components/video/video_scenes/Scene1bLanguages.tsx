import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { springSnappy, springBouncy, springSmooth } from './Scene1Intro';

const LANGUAGES = [
  { script: 'नमस्ते', roman: 'Namaste', name: 'Hindi', font: 'font-devanagari', color: 'text-primary' },
  { script: 'કેમ છો', roman: 'Kem chho', name: 'Gujarati', font: 'font-gujarati', color: 'text-success' },
  { script: 'নমস্কার', roman: 'Nomoshkar', name: 'Bengali', font: 'font-bengali', color: 'text-secondary' },
  { script: 'வணக்கம்', roman: 'Vanakkam', name: 'Tamil', font: 'font-tamil', color: 'text-accent' },
  { script: 'నమస్కారం', roman: 'Namaskaram', name: 'Telugu', font: 'font-telugu', color: 'text-gold' },
  { script: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', roman: 'Sat sri akaal', name: 'Punjabi', font: 'font-gurmukhi', color: 'text-primary' },
  { script: 'ನಮಸ್ಕಾರ', roman: 'Namaskara', name: 'Kannada', font: 'font-kannada', color: 'text-success' },
  { script: 'നമസ്കാരം', roman: 'Namaskaram', name: 'Malayalam', font: 'font-malayalam', color: 'text-secondary' },
];

export default function Scene1bLanguages() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Title in
      setTimeout(() => setPhase(2), 1500), // Row 1 in
      setTimeout(() => setPhase(3), 2000), // Row 2 in
      setTimeout(() => setPhase(4), 5000), // Subtitle banner in
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background"
      initial={{ opacity: 0, y: '5vh' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0" style={{ 
        backgroundImage: 'radial-gradient(hsl(var(--primary) / 0.04) 2px, transparent 2px)',
        backgroundSize: '3vw 3vw'
      }} />

      {/* Title */}
      <motion.div 
        className="absolute top-[12vh] text-center z-20 w-full"
        initial={{ y: '-5vh', opacity: 0 }}
        animate={{ y: phase >= 1 ? 0 : '-5vh', opacity: phase >= 1 ? 1 : 0 }}
        transition={{ ...springSmooth }}
      >
        <h2 className="text-[3.5vw] font-bold text-foreground mb-[1vh]">All 22 Eighth Schedule Languages</h2>
        <p className="text-[1.8vw] text-muted-foreground">Beautiful native scripts. Authentic voices.</p>
      </motion.div>

      {/* Flowing Typography Wall */}
      <div className="relative w-full h-[60vh] mt-[15vh] flex flex-col justify-center items-center gap-[6vh] perspective-[1000px]">
        {/* Row 1 (Moves Left to Right) */}
        <motion.div 
          className="flex whitespace-nowrap gap-[4vw] items-center"
          initial={{ x: '-50%' }}
          animate={{ x: '10%' }}
          transition={{ duration: 25, ease: 'linear' }}
        >
          {[...LANGUAGES, ...LANGUAGES].map((lang, i) => (
            <motion.div 
              key={`row1-${i}`}
              className="flex flex-col items-center glass-card px-[3vw] py-[2vh] rounded-[2vw] min-w-[20vw]"
              initial={{ opacity: 0, rotateX: 45, y: '5vh' }}
              animate={{ 
                opacity: phase >= 2 ? 1 : 0, 
                rotateX: phase >= 2 ? 0 : 45,
                y: phase >= 2 ? 0 : '5vh'
              }}
              transition={{ delay: i * 0.08, ...springBouncy }}
            >
              <div className={`text-[3vw] font-bold mb-[1vh] ${lang.font} ${lang.color}`}>{lang.script}</div>
              <div className="text-[1.5vw] text-foreground font-medium">{lang.roman}</div>
              <div className="text-[1.1vw] text-muted-foreground">{lang.name}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Row 2 (Moves Right to Left) */}
        <motion.div 
          className="flex whitespace-nowrap gap-[4vw] items-center"
          initial={{ x: '0%' }}
          animate={{ x: '-50%' }}
          transition={{ duration: 30, ease: 'linear' }}
        >
          {[...LANGUAGES.slice().reverse(), ...LANGUAGES.slice().reverse()].map((lang, i) => (
            <motion.div 
              key={`row2-${i}`}
              className="flex flex-col items-center glass-card px-[3vw] py-[2vh] rounded-[2vw] min-w-[20vw]"
              initial={{ opacity: 0, rotateX: -45, y: '-5vh' }}
              animate={{ 
                opacity: phase >= 3 ? 1 : 0, 
                rotateX: phase >= 3 ? 0 : -45,
                y: phase >= 3 ? 0 : '-5vh'
              }}
              transition={{ delay: i * 0.08, ...springBouncy }}
            >
              <div className={`text-[3vw] font-bold mb-[1vh] ${lang.font} ${lang.color}`}>{lang.script}</div>
              <div className="text-[1.5vw] text-foreground font-medium">{lang.roman}</div>
              <div className="text-[1.1vw] text-muted-foreground">{lang.name}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Subtitle Banner overlay at the end */}
      <motion.div
        className="absolute bottom-[10vh] bg-foreground text-background px-[3vw] py-[1.5vh] rounded-full shadow-2xl flex items-center gap-[1vw] z-30"
        initial={{ y: '10vh', opacity: 0, scale: 0.9 }}
        animate={{ 
          y: phase >= 4 ? 0 : '10vh', 
          opacity: phase >= 4 ? 1 : 0,
          scale: phase >= 4 ? 1 : 0.9
        }}
        transition={springBouncy}
      >
        <span className="text-[2vw]">🌍</span>
        <span className="text-[1.6vw] font-bold">Every script. Every dialect. Fully covered.</span>
      </motion.div>
    </motion.div>
  );
}
