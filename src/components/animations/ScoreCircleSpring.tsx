/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * VÒNG ĐIỂM TRÒN SVG & SỐ ĐẾM TỪ 0 (SPRING)
 * - Vòng tròn SVG chạy đầy dần với motion
 * - Số đếm tăng mượt mà từ 0 lên điểm đích
 * - Đồng bộ âm thanh "ting" ngay khi số điểm chạm đích
 * - Điểm >= 90: Ong vui nhảy múa
 * - Điểm thấp (< 50): Ong buồn lắc nhẹ, không ồn ào
 */

import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { Bee } from '../Bee';

interface ScoreCircleSpringProps {
  score: number;
  maxScoreAvailable?: number;
  actualScore?: number;
  reducedMotion?: boolean;
  onScoreReached?: () => void;
}

export const ScoreCircleSpring: React.FC<ScoreCircleSpringProps> = ({
  score,
  maxScoreAvailable = 100,
  actualScore = 100,
  reducedMotion = false,
  onScoreReached,
}) => {
  const [displayNumber, setDisplayNumber] = useState(reducedMotion ? score : 0);

  // Motion spring cho điểm số
  const springValue = useSpring(0, {
    stiffness: 45,
    damping: 14,
    mass: 0.9,
  });

  useEffect(() => {
    if (reducedMotion) {
      setDisplayNumber(score);
      onScoreReached?.();
      return;
    }

    springValue.set(0);
    const timeout = setTimeout(() => {
      springValue.set(score);
    }, 150);

    const unsubscribe = springValue.on('change', (latest) => {
      const rounded = Math.round(latest);
      setDisplayNumber(rounded);
      if (rounded >= score) {
        onScoreReached?.();
      }
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [score, reducedMotion]);

  // Màu sắc theo thang điểm
  const getScoreColor = (sc: number) => {
    if (sc >= 80) return '#2E9E5B'; // Xanh
    if (sc >= 50) return '#E8A100'; // Cam
    return '#D64545'; // Đỏ
  };

  const scoreColor = getScoreColor(score);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (displayNumber / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {/* Vòng tròn SVG & Điểm số */}
      <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="#E5E7EB"
            strokeWidth="10"
          />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={scoreColor}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            transition={{
              duration: reducedMotion ? 0 : 0.9,
              ease: [0.34, 1.56, 0.64, 1],
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
          <motion.span
            key={displayNumber}
            initial={reducedMotion ? undefined : { scale: 0.96 }}
            animate={{ scale: 1 }}
            className="text-4xl font-black tracking-tight"
            style={{ color: scoreColor }}
          >
            {displayNumber}
          </motion.span>
          <span className="text-xs font-bold text-[#2B1B0E]/70 uppercase">
            / 100 điểm
          </span>
          {maxScoreAvailable < 100 && (
            <span className="text-xs font-bold text-stone-600 mt-0.5">
              (từ {actualScore}/{maxScoreAvailable})
            </span>
          )}
        </div>
      </div>

      {/* Ong linh vật tương ứng với điểm số kèm chuyển động đặc trưng */}
      <div className="relative flex items-center justify-center">
        {score >= 90 ? (
          // Điểm >= 90: Ong vui nhảy múa (nhún nhẹ vui sướng)
          <motion.div
            animate={
              reducedMotion
                ? undefined
                : {
                    y: [0, -8, 2, -6, 0],
                    rotate: [0, -6, 8, -4, 0],
                    scale: [1, 1.05, 1, 1.03, 1],
                  }
            }
            transition={
              reducedMotion
                ? undefined
                : {
                    duration: 1.8,
                    repeat: Infinity,
                    repeatDelay: 0.8,
                    ease: 'easeInOut',
                  }
            }
          >
            <Bee status="vui" size={64} />
          </motion.div>
        ) : score < 50 ? (
          // Điểm thấp: Ong buồn lắc nhẹ, không ồn ào
          <motion.div
            animate={
              reducedMotion
                ? undefined
                : {
                    rotate: [0, -4, 4, -3, 0],
                  }
            }
            transition={
              reducedMotion
                ? undefined
                : {
                    duration: 2.2,
                    repeat: Infinity,
                    repeatDelay: 1.5,
                    ease: 'easeInOut',
                  }
            }
          >
            <Bee status="buon" size={60} />
          </motion.div>
        ) : (
          <Bee status="thuong" size={60} />
        )}
      </div>
    </div>
  );
};
