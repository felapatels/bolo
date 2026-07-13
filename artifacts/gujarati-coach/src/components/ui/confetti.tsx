import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export function Confetti({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; rotation: number; scale: number }>>([]);

  useEffect(() => {
    if (active && !reduceMotion) {
      // Calm & Modern celebration palette: indigo + teal, with light tints and
      // a warm amber pop to keep wins feeling joyful, not clashing.
      const colors = ['#4F46E5', '#0D9488', '#818CF8', '#2DD4BF', '#FBBF24'];
      const newParticles = Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100 - 50, // -50vw to 50vw
        y: -Math.random() * 100 - 20, // shoot upwards
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        scale: Math.random() * 0.5 + 0.5,
      }));
      setParticles(newParticles);
    } else {
      setParticles([]);
    }
  }, [active, reduceMotion]);

  // Learners who opt out of motion get the win without particles flying across
  // the screen; the surrounding celebration still names the badge and score.
  if (!active || reduceMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: p.scale }}
          animate={{
            opacity: [1, 1, 0],
            x: `${p.x}vw`,
            y: `${p.y}vh`,
            rotate: p.rotation + Math.random() * 360,
          }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="absolute h-3 w-3 rounded-full md:h-4 md:w-4"
          style={{ backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}
