/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * HỌA TIẾT TỔ ONG LỤC GIÁC (HONEYCOMB BACKGROUND)
 * Nền tổ ong mờ ảo (opacity ~0.04), trôi rất chậm, có parallax nhẹ theo cuộn chuột.
 * Tự động tắt hoặc chuyển bản tĩnh siêu nhẹ khi prefers-reduced-motion,
 * máy yếu (hardwareConcurrency <= 4), màn hình < 640px, hoặc người dùng chọn "Giảm hiệu ứng".
 */

import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

interface HoneycombBackgroundProps {
  reducedMotion?: boolean;
}

export const HoneycombBackground: React.FC<HoneycombBackgroundProps> = ({ reducedMotion = false }) => {
  const [isLowPower, setIsLowPower] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Kiểm tra máy yếu
    const concurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8;
    if (concurrency && concurrency <= 4) {
      setIsLowPower(true);
    }

    // Kiểm tra màn hình nhỏ
    const checkSize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkSize();
    window.addEventListener('resize', checkSize, { passive: true });
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  const shouldDisableMotion = reducedMotion || isLowPower || isMobile;

  const { scrollY } = useScroll();
  // Parallax nhẹ theo cuộn chuột (chỉ transform Y tối đa 40px trên cả trang)
  const parallaxY = useTransform(scrollY, [0, 2000], [0, shouldDisableMotion ? 0 : 35]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
      style={{ opacity: 0.045 }}
    >
      <motion.div
        style={{ y: parallaxY }}
        animate={
          shouldDisableMotion
            ? undefined
            : {
                x: [0, 8, -4, 0],
              }
        }
        transition={
          shouldDisableMotion
            ? undefined
            : {
                duration: 25,
                repeat: Infinity,
                ease: 'easeInOut',
              }
        }
        className="w-full h-[120%] -top-[10%] relative"
      >
        <svg
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
        >
          <defs>
            <pattern
              id="honeycomb-pattern"
              width="56"
              height="96"
              patternUnits="userSpaceOnUse"
              patternTransform="scale(1)"
            >
              {/* Lục giác tổ ong đối xứng toán học sắc nét */}
              <path
                d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z M28 64 L56 80 L56 112 L28 128 L0 112 L0 80 Z"
                fill="none"
                stroke="#8A4B00"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M0 48 L28 64 M56 48 L28 64 M28 0 L28 -16 M0 16 L-28 0 M56 16 L84 0"
                fill="none"
                stroke="#8A4B00"
                strokeWidth="1.6"
              />
              {/* Vài tâm lục giác có giọt mật vàng nhạt điểm xuyết */}
              <circle cx="28" cy="32" r="3" fill="#FFB400" opacity="0.4" />
              <circle cx="28" cy="96" r="3" fill="#FFB400" opacity="0.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#honeycomb-pattern)" />
        </svg>
      </motion.div>
    </div>
  );
};
