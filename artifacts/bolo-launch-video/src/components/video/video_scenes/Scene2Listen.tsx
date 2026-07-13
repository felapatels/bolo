import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { springSnappy, springBouncy, springSmooth } from './Scene1Intro';

export default function Scene2Listen() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Show card & coach
      setTimeout(() => setPhase(2), 1500), // Play audio animation
      setTimeout(() => setPhase(3), 3000), // Translation drop
      setTimeout(() => setPhase(4), 4500), // Slow mode toggle
      setTimeout(() => setPhase(5), 6000), // Native badge float up
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: '-10vw' }}
      transition={{ duration: 0.6 }}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      
      {/* Large background typography */}
      <motion.div 
        className="absolute -right-[10vw] top-1/2 -translate-y-1/2 text-[25vw] font-bold text-muted whitespace-nowrap opacity-50"
        initial={{ x: '10%' }}
        animate={{ x: '-10%' }}
        transition={{ duration: 10, ease: 'linear' }}
      >
        LISTEN
      </motion.div>

      <div className="flex w-full px-[10vw] items-center justify-between z-10 gap-[5vw]">
        
        {/* Left Side: Mascot & Coach */}
        <div className="flex-1 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0, rotate: 90 }}
            animate={{ scale: phase >= 1 ? 1 : 0, rotate: phase >= 1 ? 0 : 90 }}
            transition={springBouncy}
            className="mb-[4vh]"
          >
            <div className="w-[18vw] h-[18vw] rounded-full bg-secondary/10 flex items-center justify-center relative">
              <div className="w-[14vw] h-[14vw] rounded-full bg-secondary flex items-center justify-center text-[5vw] shadow-xl shadow-secondary/20 z-10">
                🎧
              </div>
              <motion.img 
                src={`${import.meta.env.BASE_URL}images/mascot-listen.png`} 
                className="absolute inset-0 w-full h-full object-cover rounded-full z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                onError={(e) => (e.currentTarget.style.opacity = '0')}
              />
              
              {/* Sound waves behind mascot */}
              <motion.div 
                className="absolute inset-[-2vw] rounded-full border-[0.4vw] border-secondary/30"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ 
                  scale: phase >= 2 ? (phase >= 4 ? [0.8, 1.2, 0.8] : [0.8, 1.5, 0.8]) : 0.8, 
                  opacity: phase >= 2 ? [0, 1, 0] : 0 
                }}
                transition={{ duration: phase >= 4 ? 2.5 : 1.5, repeat: phase >= 2 ? Infinity : 0 }}
              />
              <motion.div 
                className="absolute inset-[-4vw] rounded-full border-[0.4vw] border-secondary/10"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ 
                  scale: phase >= 2 ? (phase >= 4 ? [0.8, 1.4, 0.8] : [0.8, 1.8, 0.8]) : 0.8, 
                  opacity: phase >= 2 ? [0, 1, 0] : 0 
                }}
                transition={{ duration: phase >= 4 ? 2.5 : 1.5, repeat: phase >= 2 ? Infinity : 0, delay: 0.2 }}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ y: '4vh', opacity: 0 }}
            animate={{ y: phase >= 1 ? 0 : '4vh', opacity: phase >= 1 ? 1 : 0 }}
            transition={{ delay: 0.3, ...springSmooth }}
            className="text-center"
          >
            <h2 className="text-[3vw] font-bold text-foreground mb-[1vh]">Listen to Native Speakers</h2>
            <p className="text-[1.5vw] text-muted-foreground">Train your ear with AI voice coaches</p>
          </motion.div>
        </div>

        {/* Right Side: UI Card */}
        <div className="flex-1 flex justify-center relative">
          
          <motion.div 
            className="glass-card w-[28vw] p-[3vw] relative z-20"
            initial={{ x: '10vw', opacity: 0, rotateY: -20, perspective: 1000 }}
            animate={{ 
              x: phase >= 1 ? 0 : '10vw', 
              opacity: phase >= 1 ? 1 : 0,
              rotateY: phase >= 1 ? 0 : -20 
            }}
            transition={springSnappy}
          >
            {/* Top Bar */}
            <div className="flex justify-between items-center mb-[4vh]">
              <div className="flex items-center gap-[1vw]">
                <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-600 text-[1vw]">A</div>
                <div className="w-[8vw] h-[0.8vh] bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success w-1/3"></div>
                </div>
              </div>
              <div className="text-muted-foreground font-semibold text-[1vw]">1 / 5</div>
            </div>

            {/* Content Area */}
            <div className="flex flex-col items-center mb-[3vh]">
              {/* Speaker Button */}
              <motion.button 
                className={`w-[6vw] h-[6vw] rounded-full flex items-center justify-center text-[2.5vw] mb-[3vh] shadow-lg shadow-primary/20 ${phase >= 2 ? 'bg-primary text-white' : 'bg-muted text-primary'}`}
                animate={phase >= 2 ? {
                  scale: phase >= 4 ? [1, 1.05, 1] : [1, 1.1, 1],
                  boxShadow: ['0 0 0 0 rgba(79, 70, 229, 0)', '0 0 0 1vw rgba(79, 70, 229, 0.2)', '0 0 0 0 rgba(79, 70, 229, 0)']
                } : {}}
                transition={{ duration: phase >= 4 ? 2 : 1, repeat: phase >= 2 ? Infinity : 0 }}
              >
                🔊
              </motion.button>
              
              {/* Phrase */}
              <div className="text-center overflow-hidden">
                <motion.h3 
                  className="text-[4vw] font-gujarati font-bold text-foreground mb-[1vh]"
                  initial={{ y: '2vh', opacity: 0 }}
                  animate={{ y: phase >= 1 ? 0 : '2vh', opacity: phase >= 1 ? 1 : 0 }}
                  transition={{ delay: 0.2, ...springSmooth }}
                >
                  કેમ છો
                </motion.h3>
                <motion.p 
                  className="text-[1.5vw] text-muted-foreground"
                  initial={{ y: '2vh', opacity: 0 }}
                  animate={{ y: phase >= 1 ? 0 : '2vh', opacity: phase >= 1 ? 1 : 0 }}
                  transition={{ delay: 0.3, ...springSmooth }}
                >
                  Kem chho
                </motion.p>
              </div>
            </div>

            {/* Translation (reveals later) */}
            <motion.div 
              className="bg-muted rounded-xl p-[1.5vw] text-center mb-[2vh]"
              initial={{ height: 0, opacity: 0, scale: 0.9 }}
              animate={{ 
                height: phase >= 3 ? 'auto' : 0,
                scale: phase >= 3 ? 1 : 0.9, 
                opacity: phase >= 3 ? 1 : 0 
              }}
              transition={springBouncy}
            >
              <p className="text-[1.2vw] font-medium text-foreground">How are you</p>
            </motion.div>

            {/* Slow Mode Toggle */}
            <motion.div
              className="flex items-center justify-center gap-[1vw] text-[1.1vw] font-semibold mt-[2vh]"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase >= 4 ? 1 : 0 }}
              transition={springSmooth}
            >
              <span className={phase >= 4 ? 'text-primary' : 'text-muted-foreground'}>🐢 Slow Mode</span>
              <div className={`w-[3vw] h-[1.5vw] rounded-full p-[0.2vw] flex transition-colors duration-300 ${phase >= 4 ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}>
                <motion.div className="w-[1.1vw] h-[1.1vw] bg-white rounded-full shadow-sm" layout />
              </div>
            </motion.div>
            
          </motion.div>

          {/* Native Accent Badge */}
          <motion.div
            className="absolute -bottom-[2vh] -right-[4vw] bg-success text-white px-[2vw] py-[1vh] rounded-[1vw] shadow-2xl z-30 flex items-center gap-[1vw] -rotate-6"
            initial={{ scale: 0, opacity: 0, y: '5vh' }}
            animate={{ 
              scale: phase >= 5 ? 1 : 0, 
              opacity: phase >= 5 ? 1 : 0,
              y: phase >= 5 ? 0 : '5vh'
            }}
            transition={springBouncy}
          >
            <span className="text-[1.5vw]">🎙️</span>
            <span className="text-[1.2vw] font-bold leading-tight">100% Native<br/>Studio Audio</span>
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}
