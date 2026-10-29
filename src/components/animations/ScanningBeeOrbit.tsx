/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ONG BAY THEO QUỸ ĐẠO & TIẾN TRÌNH KIỂM TRA MƯỢT MÀ
 * Khi đang kiểm tra:
 * - Ong bay nhịp nhàng theo quỹ đạo cong
 * - 3 bước (1. Tải trang → 2. Chấm điểm → 3. AI nhận xét) hiện lần lượt
 * - Tích xanh bật nảy nhẹ khi từng bước hoàn tất
 * - Thanh tiến trình chạy mượt
 * - Skeleton shimmer cho khối chờ AI
 */

import React from 'react';
import { motion } from 'motion/react';
import { Bee } from '../Bee';
import { CheckCircle2, CircleDashed } from 'lucide-react';

interface ScanningBeeOrbitProps {
  loadingStep: string;
  reducedMotion?: boolean;
}

export const ScanningBeeOrbit: React.FC<ScanningBeeOrbitProps> = ({
  loadingStep,
  reducedMotion = false,
}) => {
  // Xác định trạng thái của 3 bước:
  // Step 1: Đang tải trang
  // Step 2: Đang chấm điểm
  // Step 3: AI viết nhận xét
  const isStep1Done = loadingStep.includes('chấm điểm') || loadingStep.includes('AI') || loadingStep.includes('hoàn tất');
  const isStep2Done = loadingStep.includes('AI') || loadingStep.includes('hoàn tất');
  const isStep3Done = loadingStep.includes('hoàn tất');

  const step1Active = loadingStep.includes('tải trang') || !loadingStep;
  const step2Active = loadingStep.includes('chấm điểm');
  const step3Active = loadingStep.includes('AI');

  // Tiến trình phần trăm
  const progressPercent = isStep2Done ? 85 : isStep1Done ? 55 : 25;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#FFB400] shadow-md relative overflow-hidden"
    >
      {/* Vệt ánh sáng mờ quét qua nền */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FFF3C4]/30 to-transparent -translate-x-full animate-[shimmer_2.5s_infinite] pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
        {/* Ong bay theo quỹ đạo */}
        <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
          {/* Vòng quỹ đạo đứt nét mờ */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            <ellipse
              cx="50"
              cy="50"
              rx="44"
              ry="40"
              fill="none"
              stroke="#FFB400"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.35"
            />
          </svg>

          {/* Ong lượn theo hình số 8 / elip mượt */}
          <motion.div
            animate={
              reducedMotion
                ? undefined
                : {
                    x: [0, 8, -6, 4, 0],
                    y: [0, -6, 5, -3, 0],
                    rotate: [0, 6, -8, 4, 0],
                  }
            }
            transition={
              reducedMotion
                ? undefined
                : {
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
            }
          >
            <Bee status="quet" size={76} />
          </motion.div>
        </div>

        {/* Nội dung tiến trình & 3 bước */}
        <div className="flex-1 space-y-4 w-full">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF3C4] text-[#8A4B00] text-xs font-extrabold uppercase tracking-wide">
              <CircleDashed className="w-3.5 h-3.5 animate-spin" />
              Đang phân tích website
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-[#2B1B0E] mt-1 tracking-tight">
              {loadingStep || 'Đang tải trang...'}
            </h3>
          </div>

          {/* Thanh tiến trình chạy mượt */}
          <div className="space-y-1.5">
            <div className="w-full bg-[#FFF3C4] rounded-full h-3 overflow-hidden p-0.5 border border-[#FFB400]/40">
              <motion.div
                className="bg-gradient-to-r from-[#FFB400] to-[#E8890C] h-full rounded-full"
                initial={{ width: '15%' }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
              />
            </div>
            <div className="flex justify-between text-xs font-bold text-[#8A4B00]">
              <span>Khởi động</span>
              <span>{progressPercent}% hoàn thành</span>
            </div>
          </div>

          {/* Danh sách 3 bước có dấu tích xanh bật lên */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* Bước 1 */}
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-colors ${
                isStep1Done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : step1Active
                  ? 'bg-[#FFF3C4] border-[#FFB400] text-[#8A4B00] shadow-xs'
                  : 'bg-stone-50 border-stone-200 text-stone-400'
              }`}
            >
              {isStep1Done ? (
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                >
                  <CheckCircle2 className="w-4 h-4 text-[#2E9E5B] flex-shrink-0" />
                </motion.div>
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] flex-shrink-0">
                  1
                </span>
              )}
              <span className="truncate">1. Tải trang</span>
            </div>

            {/* Bước 2 */}
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-colors ${
                isStep2Done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : step2Active
                  ? 'bg-[#FFF3C4] border-[#FFB400] text-[#8A4B00] shadow-xs'
                  : 'bg-stone-50 border-stone-200 text-stone-400'
              }`}
            >
              {isStep2Done ? (
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                >
                  <CheckCircle2 className="w-4 h-4 text-[#2E9E5B] flex-shrink-0" />
                </motion.div>
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] flex-shrink-0">
                  2
                </span>
              )}
              <span className="truncate">2. Chấm điểm</span>
            </div>

            {/* Bước 3 */}
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-colors ${
                isStep3Done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : step3Active
                  ? 'bg-[#FFF3C4] border-[#FFB400] text-[#8A4B00] shadow-xs'
                  : 'bg-stone-50 border-stone-200 text-stone-400'
              }`}
            >
              {isStep3Done ? (
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                >
                  <CheckCircle2 className="w-4 h-4 text-[#2E9E5B] flex-shrink-0" />
                </motion.div>
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] flex-shrink-0">
                  3
                </span>
              )}
              <span className="truncate">3. AI nhận xét</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
