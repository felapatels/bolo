import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type ConfettiVariant = "default" | "perfect";
type ParticleShape = "circle" | "star" | "triangle" | "rect";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
  shape: ParticleShape;
  /** When set, the particle renders this letterform instead of a shape. */
  glyph?: string;
}

const DEFAULT_COLORS = ['#4F46E5', '#0D9488', '#818CF8', '#2DD4BF', '#FBBF24'];
const PERFECT_COLORS = ['#F59E0B', '#D97706', '#FBBF24', '#FCD34D', '#FFFBEB', '#F97316'];

const SHAPES: ParticleShape[] = ["circle", "star", "triangle", "rect"];

function getShapeStyle(shape: ParticleShape, color: string): React.CSSProperties {
  switch (shape) {
    case "circle":
      return { backgroundColor: color, borderRadius: "50%" };
    case "rect":
      return { backgroundColor: color, borderRadius: "2px", width: "14px", height: "6px" };
    case "triangle":
      return {
        width: 0,
        height: 0,
        backgroundColor: "transparent",
        borderLeft: "7px solid transparent",
        borderRight: "7px solid transparent",
        borderBottom: `14px solid ${color}`,
      };
    case "star":
      return { backgroundColor: color, clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" };
  }
}

export function Confetti({
  active,
  variant = "default",
  glyphs,
}: {
  active: boolean;
  variant?: ConfettiVariant;
  /**
   * Script letterforms to rain instead of shapes (Spec 1 glyph confetti).
   * Empty/undefined falls back to the classic shape confetti. Glyph mode is
   * capped at 40 pieces on web.
   */
  glyphs?: string[];
}) {
  const reduceMotion = useReducedMotion();
  const [particles, setParticles] = useState<Particle[]>([]);
  const glyphMode = !!glyphs && glyphs.length > 0;

  useEffect(() => {
    if (active && !reduceMotion) {
      const colors = variant === "perfect" ? PERFECT_COLORS : DEFAULT_COLORS;
      const count = glyphMode ? 40 : 70;
      const newParticles: Particle[] = Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100 - 50,
        y: -Math.random() * 100 - 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        scale: Math.random() * 0.5 + 0.5,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        glyph: glyphMode ? glyphs![i % glyphs!.length] : undefined,
      }));
      setParticles(newParticles);
    } else {
      setParticles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduceMotion, variant, glyphMode]);

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
          className="absolute"
          style={
            p.glyph
              ? {
                  color: p.color,
                  fontSize: "20px",
                  fontWeight: 700,
                  lineHeight: 1,
                  userSelect: "none",
                }
              : {
                  width: p.shape === "rect" ? "14px" : "12px",
                  height: p.shape === "rect" ? "6px" : "12px",
                  ...getShapeStyle(p.shape, p.color),
                }
          }
        >
          {p.glyph ?? null}
        </motion.div>
      ))}
    </div>
  );
}
