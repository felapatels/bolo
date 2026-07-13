import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { springSnappy, springBouncy, springSmooth } from './Scene1Intro';

export default function Scene3Speak() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Mic button scales up
      setTimeout(() => setPhase(2), 1500), // Recording active (waves)
      setTimeout(() => setPhase(3), 4000), // Processing...
      setTimeout(() => setPhase(4), 5500), // Score reveal
      setTimeout(() => setPhase(5), 7000), // Specific highlight
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ x: '100vw' }}
      animate={{ x: 0 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-background" />

      {/* Large background typography */}
      <motion.div 
        className="absolute -left-[10vw] top-1/2 -translate-y-1/2 text-[25vw] font-bold text-muted whitespace-nowrap opacity-50"
        initial={{ x: '-10%' }}
        animate={{ x: '10%' }}
        transition={{ duration: 10, ease: 'linear' }}
      >
        SPEAK
      </motion.div>

      <div className="relative z-10 w-full flex flex-col items-center">
        
        {/* Header */}
        <motion.div 
          className="text-center mb-[8vh]"
          initial={{ y: '-5vh', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, ...springSmooth }}
        >
          <h2 className="text-[4vw] font-bold text-foreground mb-[1vh]">Now, Your Turn</h2>
          <p className="text-[1.8vw] text-muted-foreground">Speak to get instant pronunciation feedback</p>
        </motion.div>

        {/* Interaction Area */}
        <div className="relative flex flex-col items-center w-full">
          
          {/* Target Phrase */}
          <motion.div 
            className="text-center mb-[8vh] flex items-center justify-center gap-[1vw]"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, ...springSnappy }}
          >
            <h3 className="text-[5vw] font-gujarati font-bold text-foreground">
              કેમ 
            </h3>
            <h3 className={`text-[5vw] font-gujarati font-bold transition-colors duration-500 ${phase >= 5 ? 'text-success relative' : 'text-foreground'}`}>
              છો
              {phase >= 5 && (
                <motion.div 
                  className="absolute -top-[3vh] left-1/2 -translate-x-1/2 bg-success text-white text-[1vw] px-[1vw] py-[0.5vh] rounded-full whitespace-nowrap"
                  initial={{ opacity: 0, y: '1vh' }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springBouncy}
                >
                  Perfect aspiration!
                </motion.div>
              )}
            </h3>
          </motion.div>

          {/* Mic Button & Waves */}
          <div className="relative flex justify-center items-center h-[20vh] w-full">
            
            {/* Audio Visualizer Waves (when recording) */}
            {phase >= 2 && phase < 3 && (
              <div className="absolute flex items-center justify-center gap-[0.5vw] h-full w-[30vw]">
                {[...Array(15)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-[0.8vw] bg-primary rounded-full"
                    initial={{ height: '2vh' }}
                    animate={{ 
                      height: ['2vh', `${Math.random() * 12 + 4}vh`, '2vh']
                    }}
                    transition={{
                      duration: 0.5 + Math.random() * 0.5,
                      repeat: Infinity,
                      repeatType: "reverse",
                      delay: Math.random() * 0.5
                    }}
                  />
                ))}
              </div>
            )}

            {/* Processing State */}
            {phase === 3 && (
              <motion.div 
                className="absolute flex items-center justify-center gap-[1vw]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="text-[1.8vw] font-bold text-primary mr-[1vw]">Analyzing pitch & phonemes...</div>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={`dot-${i}`}
                    className="w-[1vw] h-[1vw] bg-primary rounded-full"
                    animate={{ y: ['-1vh', '1vh', '-1vh'] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </motion.div>
            )}

            {/* Score Reveal */}
            {phase >= 4 && (
              <motion.div 
                className="absolute flex flex-col items-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springBouncy}
              >
                <div className="text-[6vw] font-black text-success mb-[1vh] leading-none">98%</div>
                <div className="px-[2vw] py-[1vh] bg-success/10 text-success rounded-full font-bold text-[1.5vw]">
                  Excellent Pronunciation!
                </div>
              </motion.div>
            )}

            {/* The Mic Button itself */}
            <motion.div
              className={`absolute w-[10vw] h-[10vw] rounded-full flex items-center justify-center text-[4vw] z-20 ${
                phase >= 2 && phase < 3 ? 'bg-primary text-white shadow-xl shadow-primary/40' : 
                phase >= 4 ? 'opacity-0 scale-0' : 'bg-white border-[0.4vw] border-primary text-primary'
              }`}
              initial={{ scale: 0 }}
              animate={{ 
                scale: phase === 1 ? 1 : phase >= 2 && phase < 3 ? 1.2 : phase >= 4 ? 0 : 1,
                y: phase >= 3 && phase < 4 ? '15vh' : 0, // Drop down while processing
                opacity: phase >= 3 && phase < 4 ? 0 : 1
              }}
              transition={springSnappy}
            >
              🎤
            </motion.div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
