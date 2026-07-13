import { motion, type Transition } from 'framer-motion';
import { useEffect, useState } from 'react';

// Common spring configs
export const springSnappy: Transition = { type: 'spring', stiffness: 400, damping: 30 };
export const springBouncy: Transition = { type: 'spring', stiffness: 300, damping: 15 };
export const springSmooth: Transition = { type: 'spring', stiffness: 120, damping: 25 };

// A varied spread of native scripts hinting at the full 22-language set from the
// very first frame. Positioned around the perimeter so they frame — never cover —
// the mascot and title in the center. Each floats gently with its own rhythm.
type ScriptChip = {
  script: string;
  font: string;
  color: string;
  position: string;
  rotate: string;
  floatY: number;
  duration: number;
  delay: number;
  rtl?: boolean;
};

const SCRIPT_CHIPS: ScriptChip[] = [
  // Hindi (Devanagari)
  { script: 'नमस्ते', font: 'font-devanagari', color: 'text-primary', position: 'top-[18%] left-[8%]', rotate: '-rotate-12', floatY: -10, duration: 3, delay: 0 },
  // Bengali
  { script: 'নমস্কার', font: 'font-bengali', color: 'text-secondary', position: 'bottom-[18%] right-[8%]', rotate: 'rotate-6', floatY: 10, duration: 3.5, delay: 0.5 },
  // Tamil
  { script: 'வணக்கம்', font: 'font-tamil', color: 'text-accent', position: 'top-[28%] right-[12%]', rotate: 'rotate-12', floatY: -8, duration: 3.2, delay: 1 },
  // Gujarati
  { script: 'કેમ છો', font: 'font-gujarati', color: 'text-success', position: 'bottom-[28%] left-[12%]', rotate: '-rotate-6', floatY: 12, duration: 3.8, delay: 0.2 },
  // Urdu (Perso-Arabic, Nastaliq)
  { script: 'آداب', font: 'font-nastaliq', color: 'text-primary', position: 'top-[10%] left-[42%]', rotate: 'rotate-3', floatY: -12, duration: 4, delay: 0.7, rtl: true },
  // Odia
  { script: 'ନମସ୍କାର', font: 'font-oriya', color: 'text-secondary', position: 'bottom-[10%] left-[38%]', rotate: '-rotate-3', floatY: 9, duration: 3.6, delay: 0.9 },
  // Manipuri (Meetei Mayek)
  { script: 'ꯈꯨꯔꯨꯝꯖꯔꯤ', font: 'font-meetei', color: 'text-success', position: 'top-[46%] left-[3%]', rotate: 'rotate-6', floatY: -11, duration: 3.4, delay: 0.4 },
  // Santali (Ol Chiki)
  { script: 'ᱡᱚᱦᱟᱨ', font: 'font-olchiki', color: 'text-gold', position: 'top-[48%] right-[4%]', rotate: '-rotate-6', floatY: 11, duration: 4.1, delay: 1.2 },
  // Telugu
  { script: 'నమస్కారం', font: 'font-telugu', color: 'text-gold', position: 'bottom-[36%] right-[20%]', rotate: 'rotate-8', floatY: -9, duration: 3.7, delay: 0.6 },
  // Kannada
  { script: 'ನಮಸ್ಕಾರ', font: 'font-kannada', color: 'text-accent', position: 'top-[36%] left-[20%]', rotate: '-rotate-8', floatY: 10, duration: 3.3, delay: 1.1 },
];

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
          {SCRIPT_CHIPS.map((chip, i) => (
            <motion.div
              key={i}
              dir={chip.rtl ? 'rtl' : 'ltr'}
              className={`absolute ${chip.position} glass-card px-[1.5vw] py-[0.8vw] text-[1.8vw] font-bold shadow-xl ${chip.font} ${chip.color} ${chip.rotate}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: phase >= 4 ? 1 : 0,
                opacity: phase >= 4 ? 1 : 0,
                y: phase >= 4 ? [0, chip.floatY, 0] : 0
              }}
              transition={{
                scale: springBouncy,
                opacity: { duration: 0.2 },
                delay: i * 0.08,
                y: { duration: chip.duration, repeat: Infinity, ease: "easeInOut", delay: chip.delay }
              }}
            >
              {chip.script}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
