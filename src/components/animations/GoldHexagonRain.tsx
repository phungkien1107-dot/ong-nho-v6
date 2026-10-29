/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MƯA LỤC GIÁC VÀNG (GOLD HEXAGON RAIN)
 * Hiệu ứng ăn mừng điểm xuất sắc (>= 90 điểm).
 * Tự vẽ thuần bằng Motion/CSS (không dùng thư viện ngoài).
 * Tự hủy sau 3 giây, không gây nghẽn hiệu năng, tắt khi reducedMotion.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface GoldHexagonRainProps {
  active: boolean;
  reducedMotion?: boolean;
}

interface Particle {
  id: number;
  x: number; // %
  size: number;
  duration: number;
  delay: number;
  rotateEnd: number;
  color: string;
  opacity: number;
}

export const GoldHexagonRain: React.FC<GoldHexagonRainProps> = ({ active, reducedMotion = false }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active && !reducedMotion) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 3200);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [active, reducedMotion]);

  const particles: Particle[] = useMemo(() => {
    const goldTones = ['#FFB400', '#FFCF40', '#E8890C', '#FFE082', '#F59E0B'];
    const list: Particle[] = [];
    for (let i = 0; i < 28; i++) {
      list.push({
        id: i,
        x: Math.floor(Math.random() * 96) + 2,
        size: Math.floor(Math.random() * 12) + 12, // 12px - 24px
        duration: 1.8 + Math.random() * 1.2,
        delay: Math.random() * 0.8,
        rotateEnd: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
        color: goldTones[i % goldTones.length],
        opacity: 0.7 + Math.random() * 0.3,
      });
    }
    return list;
  }, [active]);

  if (reducedMotion || !visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden select-none"
    >
      <AnimatePresence>
        {visible &&
          particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                x: `${p.x}vw`,
                y: -30,
                opacity: 0,
                rotate: 0,
                scale: 0.6,
              }}
              animate={{
                y: '105vh',
                opacity: [0, p.opacity, p.opacity, 0],
                rotate: p.rotateEnd,
                scale: [0.6, 1, 1, 0.8],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: p.size,
                height: p.size,
              }}
            >
              <svg viewBox="0 0 24 24" fill={p.color} width="100%" height="100%">
                {/* Lục giác vàng sáng */}
                <polygon
                  points="12,2 21,7 21,17 12,22 3,17 3,7"
                  stroke="#8A4B00"
                  strokeWidth="1"
                  strokeOpacity="0.3"
                />
              </svg>
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
};
