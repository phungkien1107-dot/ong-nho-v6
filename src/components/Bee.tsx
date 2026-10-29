/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LINH VẬT CHÚ ONG NHỎ (SVG NGUYÊN BẢN)
 * 4 trạng thái: "thuong", "quet", "vui", "buon"
 */

import React from 'react';

export type BeeStatus = 'thuong' | 'quet' | 'vui' | 'buon' | 'normal' | 'scanning' | 'happy' | 'sad';

interface BeeProps {
  status?: BeeStatus;
  className?: string;
  size?: number;
}

export const Bee: React.FC<BeeProps> = ({ status = 'thuong', className = '', size = 56 }) => {
  // Chuẩn hóa tên trạng thái
  const normalizedStatus =
    status === 'normal'
      ? 'thuong'
      : status === 'scanning'
      ? 'quet'
      : status === 'happy'
      ? 'vui'
      : status === 'sad'
      ? 'buon'
      : status;

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      title={
        normalizedStatus === 'quet'
          ? 'Ong Nhỏ đang chăm chỉ quét trang web...'
          : normalizedStatus === 'vui'
          ? 'Ong Nhỏ rất vui mừng vì website đạt điểm xuất sắc!'
          : normalizedStatus === 'buon'
          ? 'Ong Nhỏ hơi buồn vì website cần sửa thêm nhiều lỗi.'
          : 'Chú Ong Nhỏ thân thiện'
      }
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={`w-full h-full transition-transform duration-300 ${
          normalizedStatus === 'quet' ? 'motion-safe:animate-pulse' : ''
        }`}
      >
        <defs>
          {/* Thân ong: vàng mật #FFB400 */}
          <linearGradient id="beeGoldGrad" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFCF40" />
            <stop offset="0.65" stopColor="#FFB400" />
            <stop offset="1" stopColor="#E8890C" />
          </linearGradient>

          {/* Cánh trong suốt mờ ảo */}
          <linearGradient id="beeWingGrad" x1="0" y1="0" x2="25" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="1" stopColor="#E0F2FE" stopOpacity="0.6" />
          </linearGradient>

          <filter id="beeSoftShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#2B1B0E" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* Cánh sau (trái) */}
        <g
          className={`origin-[45px_35px] transition-transform duration-300 ${
            normalizedStatus === 'quet'
              ? 'animate-pulse'
              : normalizedStatus === 'buon'
              ? 'rotate-[18deg] translate-y-1.5'
              : ''
          }`}
        >
          <ellipse
            cx="37"
            cy="24"
            rx="11"
            ry="18"
            transform="rotate(-26 37 24)"
            fill="url(#beeWingGrad)"
            stroke="#BAE6FD"
            strokeWidth="1.5"
          />
        </g>

        {/* Cánh trước (phải) */}
        <g
          className={`origin-[55px_35px] transition-transform duration-300 ${
            normalizedStatus === 'quet'
              ? 'animate-pulse'
              : normalizedStatus === 'buon'
              ? 'rotate-[-18deg] translate-y-1.5'
              : ''
          }`}
        >
          <ellipse
            cx="57"
            cy="22"
            rx="12"
            ry="19"
            transform="rotate(22 57 22)"
            fill="url(#beeWingGrad)"
            stroke="#BAE6FD"
            strokeWidth="1.5"
          />
        </g>

        {/* Ngòi ong nhỏ xinh màu nâu đen */}
        <path d="M 18 56 Q 9 57 12 52 Q 17 52 20 54 Z" fill="#2B1B0E" />

        {/* Thân ong tròn trịa mập mạp */}
        <ellipse
          cx="52"
          cy="56"
          rx="32"
          ry="26"
          fill="url(#beeGoldGrad)"
          stroke="#2B1B0E"
          strokeWidth="3"
          filter="url(#beeSoftShadow)"
        />

        {/* 2 Sọc nâu đen #2B1B0E */}
        <path
          d="M 43 31 C 41 47 41 65 43 81 C 47 81 48 80.5 49 80 C 47 64 47 48 49 32 C 48 31.5 46 31 43 31 Z"
          fill="#2B1B0E"
        />
        <path
          d="M 57 32 C 55 48 55 64 57 80 C 61 79 63 78 64 76.5 C 62 62 62 50 64 35.5 C 62 34 60 33 57 32 Z"
          fill="#2B1B0E"
        />

        {/* Râu ong ngắn kiên định */}
        <path
          d="M 66 33 Q 66 19 62 15"
          stroke="#2B1B0E"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="61" cy="14" r="3" fill="#2B1B0E" />

        <path
          d="M 74 35 Q 77 21 75 16"
          stroke="#2B1B0E"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="76" cy="15" r="3" fill="#2B1B0E" />

        {/* BIỂU CẢM THEO 4 TRẠNG THÁI */}

        {/* 1. TRẠNG THÁI VUI (Điểm >= 80): Mắt cười cong, má hồng, lấp lánh nhẹ */}
        {normalizedStatus === 'vui' && (
          <g>
            <path
              d="M 64 50 Q 69 44 74 50"
              stroke="#2B1B0E"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 77 52 Q 81 47 85 52"
              stroke="#2B1B0E"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="68" cy="57" r="4.5" fill="#F87171" opacity="0.65" />
            <circle cx="82" cy="58" r="4" fill="#F87171" opacity="0.65" />
            <path
              d="M 71 58 Q 76 65 80 59"
              stroke="#2B1B0E"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Tia lấp lánh nhẹ */}
            <g className="animate-spin origin-[88px_25px]" style={{ animationDuration: '6s' }}>
              <path
                d="M 88 18 L 89.5 23 L 95 24.5 L 89.5 26 L 88 31 L 86.5 26 L 81 24.5 L 86.5 23 Z"
                fill="#FFB400"
              />
              <path
                d="M 22 28 L 23 31 L 26 32 L 23 33 L 22 36 L 21 33 L 18 32 L 21 31 Z"
                fill="#FFB400"
              />
            </g>
          </g>
        )}

        {/* 2. TRẠNG THÁI BUỒN NHẸ (Điểm < 50): Mắt rũ, cánh rũ, một giọt mồ hôi nhỏ */}
        {normalizedStatus === 'buon' && (
          <g>
            <circle cx="69" cy="52" r="4.5" fill="#2B1B0E" />
            <circle cx="70.5" cy="50.5" r="1.5" fill="#FFFFFF" />
            <circle cx="81" cy="53" r="4" fill="#2B1B0E" />
            <circle cx="82.5" cy="51.5" r="1.3" fill="#FFFFFF" />
            <path
              d="M 72 63 Q 76 59 80 62"
              stroke="#2B1B0E"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Giọt mồ hôi nhỏ trên trán */}
            <path
              d="M 62 40 C 60 44 60 47 63 47 C 66 47 66 44 64 40 Z"
              fill="#38BDF8"
              stroke="#0284C7"
              strokeWidth="1"
            />
          </g>
        )}

        {/* 3. TRẠNG THÁI QUÉT (Đang kiểm tra): Mắt kiên định quyết tâm */}
        {normalizedStatus === 'quet' && (
          <g>
            <circle cx="70" cy="51" r="5" fill="#2B1B0E" />
            <circle cx="71.5" cy="49" r="2" fill="#FFFFFF" />
            <circle cx="82" cy="52" r="4.5" fill="#2B1B0E" />
            <circle cx="83.5" cy="50.5" r="1.8" fill="#FFFFFF" />
            <path d="M 65 44 L 74 46" stroke="#2B1B0E" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 78 46 L 85 46" stroke="#2B1B0E" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="73" y1="60" x2="79" y2="60" stroke="#2B1B0E" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {/* 4. TRẠNG THÁI THƯỜNG: Đôi mắt tròn kiên định, nụ cười mỉm nhẹ */}
        {normalizedStatus === 'thuong' && (
          <g>
            <circle cx="69" cy="51" r="5" fill="#2B1B0E" />
            <circle cx="70.5" cy="49" r="2" fill="#FFFFFF" />
            <circle cx="81" cy="52" r="4.2" fill="#2B1B0E" />
            <circle cx="82.5" cy="50.5" r="1.6" fill="#FFFFFF" />
            <circle cx="67" cy="58" r="3.5" fill="#F87171" opacity="0.4" />
            <circle cx="81" cy="59" r="3" fill="#F87171" opacity="0.4" />
            <path
              d="M 72 58 Q 76 63 80 59"
              stroke="#2B1B0E"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        )}
      </svg>
    </div>
  );
};

// Xuất đồng thời Bee và BeeMascot
export const BeeMascot = Bee;
export default Bee;
