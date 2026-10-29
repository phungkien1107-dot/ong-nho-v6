/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * KHUNG KIỂM TRA CHÍNH TẢ & NGỮ PHÁP TIẾNG VIỆT
 * Chạy độc lập, không làm chậm kết quả kiểm tra chính.
 */

import React, { useState } from 'react';
import {
  SpellCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';

interface SpellError {
  original: string;
  suggestion: string;
  reason: string;
}

interface SpellCheckCardProps {
  visibleText: string;
  wordCount: number;
  isJsRendered?: boolean;
}

export function SpellCheckCard({ visibleText, wordCount, isJsRendered }: SpellCheckCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [errors, setErrors] = useState<SpellError[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const handleRunCheck = async () => {
    setIsLoading(true);
    setNote(null);

    try {
      const res = await fetch('/api/spellcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleText }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setErrors(json.data.errors || []);
        if (json.data.note) {
          setNote(json.data.note);
        }
      } else {
        setNote('Tạm thời không thể kiểm tra chính tả lúc này.');
      }
    } catch {
      setNote('Lỗi kết nối khi gửi yêu cầu kiểm tra chính tả.');
    } finally {
      setIsLoading(false);
      setChecked(true);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-[#2B1B0E]/15 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-[#FFF3C4] text-[#E8890C]">
              <SpellCheck className="w-5 h-5" />
            </span>
            <h3 className="font-extrabold text-lg text-[#2B1B0E]">
              Kiểm tra chính tả & câu chữ tiếng Việt
            </h3>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Rà soát dấu thanh hỏi/ngã, s/x, tr/ch, d/gi, lỗi gõ telex bằng AI chuyên ngữ (bỏ qua tên thương hiệu).
          </p>
        </div>

        <button
          onClick={handleRunCheck}
          disabled={isLoading || wordCount < 20}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] hover:text-white font-extrabold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex-shrink-0"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Đang rà soát...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{checked ? 'Rà soát lại' : 'Kiểm tra chính tả ngay'}</span>
            </>
          )}
        </button>
      </div>

      {/* Cảnh báo trang dùng JS hoặc quá ít chữ */}
      {isJsRendered && (
        <div className="bg-[#FFF7E6] border border-[#FCD89C] rounded-2xl p-3 text-xs text-[#92400E] flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Trang web này tải nội dung bằng JavaScript nên có thể một số đoạn văn bản chưa được nạp đầy đủ vào bộ rà soát.
          </span>
        </div>
      )}

      {/* Trạng thái chưa bấm kiểm tra */}
      {!checked && !isLoading && (
        <div className="bg-[#FFFBF0] border border-[#2B1B0E]/10 rounded-2xl p-4 text-center text-xs text-stone-600">
          Trang web có khoảng <strong>{wordCount} từ</strong>. Bấm nút <strong>"Kiểm tra chính tả ngay"</strong> để chú Ong Nhỏ rà soát các câu văn trên trang.
        </div>
      )}

      {/* Kết quả sau khi kiểm tra */}
      {checked && (
        <div className="space-y-3">
          {note && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-600">
              {note}
            </div>
          )}

          {errors.length === 0 ? (
            <div className="bg-[#EAF7EE] border border-[#A7E3BE] rounded-2xl p-4 text-xs text-[#164E2A] flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[#2E9E5B]" />
              <div>
                <strong>Rất tốt!</strong> Không phát hiện lỗi chính tả hoặc dùng sai dấu thanh phổ biến nào trong các đoạn văn bản hiển thị.
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-[#D64545] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Phát hiện {errors.length} điểm có thể là lỗi chính tả hoặc gõ nhầm:
              </div>

              <div className="space-y-2">
                {errors.map((err, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#FFFBF0] border border-[#2B1B0E]/15 rounded-2xl text-xs space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="line-through text-[#D64545] font-semibold bg-red-50 px-2 py-0.5 rounded">
                        "{err.original}"
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                      <span className="text-[#2E9E5B] font-extrabold bg-emerald-50 px-2 py-0.5 rounded">
                        "{err.suggestion}"
                      </span>
                    </div>
                    {err.reason && (
                      <div className="text-stone-500 text-xs">
                        Lý do: {err.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="text-xs text-stone-500 italic pt-1">
                * Ghi chú: Đây là gợi ý tự động từ AI, bạn nên kiểm tra lại ngữ cảnh trước khi sửa trên bài viết thực tế.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
