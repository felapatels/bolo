// Scene 3: Breadth + CTA (fast-paced language showcase)
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const SPRING = { type: 'spring', stiffness: 300, damping: 25 } as const;

// Expanded list for an infinite cascade over the 11-second opening phase
const LANGUAGES = [
  { text: "नमस्ते", font: "font-devanagari", label: "Hindi" },
  { text: "নমস্কার", font: "font-bengali", label: "Bengali" },
  { text: "வணக்கம்", font: "font-tamil", label: "Tamil" },
  { text: "నమస్కారం", font: "font-telugu", label: "Telugu" },
  { text: "કેમ છો", font: "font-gujarati", label: "Gujarati" },
  { text: "ನಮಸ್ಕಾರ", font: "font-kannada", label: "Kannada" },
  { text: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", font: "font-gurmukhi", label: "Punjabi" },
  { text: "നമസ്കാരം", font: "font-malayalam", label: "Malayalam" },
  { text: "ନମସ୍କାର", font: "font-oriya", label: "Odia" },
  { text: "آداب", font: "font-nastaliq", label: "Urdu" },
  { text: "नमस्कार", font: "font-devanagari", label: "Marathi" },
  { text: "নমস্কাৰ", font: "font-bengali", label: "Assamese" }
];

export function Scene3() {
  const [phase, setPhase] = useState(0);
  const [langIndex, setLangIndex] = useState(0);

  useEffect(() => {
    // Continually cycle languages at a moderate rapid pace
    const langInterval = setInterval(() => {
      setLangIndex(prev => (prev + 1) % LANGUAGES.length);
    }, 700);

    const timers = [
      setTimeout(() => setPhase(1), 1000),   // Start showing languages
      setTimeout(() => setPhase(2), 12500),  // Clear for CTA
      setTimeout(() => setPhase(3), 13500),  // Show "All 22 Official Languages"
      setTimeout(() => setPhase(4), 15000),  // Show Final CTA & App Name
      setTimeout(() => setPhase(5), 16000),  // Mascot cheers & holds
    ];

    return () => {
      timers.forEach(t => clearTimeout(t));
      clearInterval(langInterval);
    };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-primary z-10"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} // Cinematic wipe
    >
      {/* Dynamic continuous background */}
      <motion.div 
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500 via-primary to-indigo-950 opacity-90"
        animate={{ scale: [1, 1.1, 1], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      {/* Floating accent particles in continuous motion */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white/20"
          style={{
            width: Math.random() * 8 + 4,
            height: Math.random() * 8 + 4,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -150],
            x: [0, Math.random() * 50 - 25],
            opacity: [0, 0.8, 0]
          }}
          transition={{
            duration: Math.random() * 3 + 3,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "linear"
          }}
        />
      ))}

      <div className="relative w-full h-full flex flex-col items-center justify-center px-8 z-20">

        {/* Phase 1: Continuous Language Cascade */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: (phase >= 1 && phase < 2) ? 1 : 0,
            scale: phase >= 2 ? 1.5 : 1
          }}
          transition={{ duration: 0.6 }}
        >
          {phase >= 1 && phase < 2 && (
            <motion.div 
              key={langIndex}
              className="text-center"
              initial={{ opacity: 0, y: 30, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 1.2 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className={`${LANGUAGES[langIndex].font} text-[5rem] leading-none font-bold text-white mb-6 drop-shadow-xl`}>
                {LANGUAGES[langIndex].text}
              </h2>
              <p className="text-white/80 font-bold tracking-[0.3em] uppercase text-lg">
                {LANGUAGES[langIndex].label}
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Phase 3 & 4: Final CTA Build-up */}
        <motion.div
          className="flex flex-col items-center text-center mt-12 w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
        >
          {/* Pill text */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: -20 }}
            animate={phase >= 3 ? { scale: 1, opacity: 1, y: 0 } : {}}
            transition={SPRING}
            className="bg-white/10 backdrop-blur-md px-6 py-2.5 rounded-full border border-white/20 mb-10"
          >
            <span className="text-white font-bold tracking-[0.2em] text-sm uppercase">ALL 22 OFFICIAL LANGUAGES</span>
          </motion.div>

          {/* Main Hook */}
          <motion.h1 
            className="text-6xl font-black text-white mb-8 leading-[1.1] drop-shadow-md"
            initial={{ y: 40, opacity: 0 }}
            animate={phase >= 4 ? { y: 0, opacity: 1 } : {}}
            transition={{ ...SPRING, delay: 0.1 }}
          >
            Start<br/>speaking<br/>today.
          </motion.h1>

          {/* App Lockup */}
          <motion.div
            className="flex items-center gap-4 bg-white px-10 py-5 rounded-3xl shadow-2xl"
            initial={{ y: 50, opacity: 0, scale: 0.8 }}
            animate={phase >= 4 ? { y: 0, opacity: 1, scale: 1 } : {}}
            transition={{ ...SPRING, delay: 0.3 }}
          >
            <span className="text-4xl font-black text-primary tracking-tight">Bolo!</span>
          </motion.div>
        </motion.div>

        {/* Final Mascot Reveal */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[400px] pointer-events-none overflow-hidden z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 5 ? 1 : 0 }}
        >
           <motion.img 
            src={`${import.meta.env.BASE_URL}images/mascot-cheer.png`}
            alt="Bolo Mascot Cheering"
            className="absolute bottom-[-5%] right-[-15%] w-80 h-80 object-contain origin-bottom-right"
            initial={{ rotate: 45, scale: 0.5, y: 100 }}
            animate={phase >= 5 ? { rotate: 0, scale: 1, y: 0 } : {}}
            transition={{ type: "spring", stiffness: 150, damping: 15 }}
          />
        </motion.div>

      </div>
    </motion.div>
  );
}