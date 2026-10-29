/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TRANG CẤP QUYỀN GOOGLE SEARCH CONSOLE DÀNH CHO KHÁCH HÀNG & NHÂN VIÊN (/cap-quyen)
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Lock,
  Globe,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { Bee } from './Bee';

interface CapQuyenPageProps {
  onBackToApp?: () => void;
}

export function CapQuyenPage({ onBackToApp }: CapQuyenPageProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  // Kiểm tra param ?success=1 trên URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('success') === '1') {
        setSuccessEmail('Tài khoản Google của bạn');
      }
    }
  }, []);

  // Lắng nghe postMessage từ cửa sổ popup OAuth
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GSC_AUTH_SUCCESS') {
        setSuccessEmail(event.data.email || 'Tài khoản Google');
        setIsAuthorizing(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCopyClientLink = () => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${currentOrigin}/cap-quyen`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleStartOAuth = async () => {
    setIsAuthorizing(true);
    setAuthError(null);
    try {
      const res = await fetch('/auth/google/url');
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Chưa cấu hình GOOGLE_CLIENT_ID trên server.');
      }

      // Mở popup đăng nhập Google
      const width = 550;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.url,
        'OngNhoGoogleAuth',
        `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
      );

      if (!popup || popup.closed) {
        // Nếu bị chặn popup, chuyển hướng trực tiếp
        window.location.href = data.url;
      }
    } catch (err: any) {
      setAuthError(err.message || 'Không thể bắt đầu luồng xác thực Google.');
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] text-[#2B1B0E] font-['Be_Vietnam_Pro',sans-serif] py-8 sm:py-14 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Nút quay lại ứng dụng chính */}
        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="inline-flex items-center gap-2 text-sm font-bold text-[#E8890C] hover:text-[#2B1B0E] transition-colors cursor-pointer"
          >
            ← Quay lại ứng dụng Kiểm tra website
          </button>
        )}

        {/* Khung tiêu đề & Ong Nhỏ */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#2B1B0E]/15 shadow-sm text-center space-y-4">
          <div className="flex justify-center">
            <Bee status="vui" size={64} />
          </div>

          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-[#FFF3C4] text-[#E8890C] text-xs font-extrabold uppercase tracking-wider mb-2">
              Liên kết an toàn & bảo mật
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#2B1B0E] tracking-tight">
              Cấp quyền xem số liệu Google Search Console cho Ong Nhỏ
            </h1>
            <p className="text-sm text-[#2B1B0E]/75 font-medium mt-2 max-w-lg mx-auto leading-relaxed">
              Giúp đội ngũ kỹ thuật Ong Nhỏ đồng hành theo dõi số lượt hiển thị, lượt nhấp và thứ hạng từ khóa thực tế của website bạn trên Google.
            </p>
          </div>

          {/* Cam kết bảo mật 100% */}
          <div className="bg-[#EAF7EE] border border-[#A7E3BE] rounded-2xl p-4 sm:p-5 text-left text-xs text-[#164E2A] space-y-2">
            <div className="flex items-center gap-2 font-black text-sm text-[#1B6A3B]">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-[#2E9E5B]" />
              Cam kết bảo mật & quyền hạn minh bạch
            </div>
            <ul className="space-y-1.5 list-disc pl-5 font-medium text-xs leading-relaxed">
              <li>
                <strong>Ong Nhỏ chỉ XEM số liệu báo cáo</strong> (quyền <code>webmasters.readonly</code>), hoàn toàn <strong>KHÔNG THỂ chỉnh sửa, thay đổi hay xóa</strong> bất kỳ cài đặt nào trên website của bạn.
              </li>
              <li>
                Bạn có thể tự do <strong>thu hồi quyền xem bất cứ lúc nào</strong> trong phần Bảo mật tài khoản Google của bạn (myaccount.google.com/permissions).
              </li>
              <li>
                Mã liên kết được <strong>mã hóa cấp độ ngân hàng (AES-256)</strong> trực tiếp trên máy chủ, an toàn tuyệt đối.
              </li>
            </ul>
          </div>

          {/* Hướng dẫn vượt cảnh báo ứng dụng chưa xác minh của Google */}
          <div className="bg-[#FFF7E6] border border-[#FCD89C] rounded-2xl p-4 sm:p-5 text-left text-xs text-[#78350F] space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#92400E]">
              <HelpCircle className="w-5 h-5 flex-shrink-0 text-[#E8A100]" />
              Hướng dẫn nếu Google hiện cảnh báo "Ứng dụng chưa xác minh":
            </div>
            <p className="leading-relaxed">
              Do công cụ Ong Nhỏ là ứng dụng nội bộ hỗ trợ khách hàng, khi đăng nhập Google có thể hiện màn hình cảnh báo. Quý khách vui lòng thực hiện 2 thao tác đơn giản:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-semibold">
              <div className="bg-white/80 p-2.5 rounded-xl border border-[#FCD89C]">
                <strong>Bước 1:</strong> Bấm vào dòng chữ nhỏ <u>"Nâng cao"</u> (hoặc <u>"Advanced"</u>) ở góc dưới màn hình Google.
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-[#FCD89C]">
                <strong>Bước 2:</strong> Bấm chọn <u>"Đi tới Ong Nhỏ (không an toàn)"</u> hoặc <u>"Go to Ong Nhỏ"</u> để hoàn tất.
              </div>
            </div>
          </div>

          {/* Trạng thái thành công */}
          {successEmail ? (
            <div className="bg-[#EAF7EE] border-2 border-[#2E9E5B] rounded-2xl p-5 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-[#2E9E5B] mx-auto" />
              <div className="font-extrabold text-base text-[#166534]">
                Đã kết nối thành công với Google!
              </div>
              <p className="text-xs text-[#164E2A]">
                Tài khoản: <strong>{successEmail}</strong> đã được đồng bộ với Ong Nhỏ. Bạn có thể đóng tab này hoặc quay về tab "Thống kê".
              </p>
              {onBackToApp && (
                <button
                  onClick={onBackToApp}
                  className="px-6 py-2.5 rounded-xl bg-[#2E9E5B] text-white font-extrabold text-xs hover:bg-[#1B6A3B] transition-colors cursor-pointer"
                >
                  Mở Bảng thống kê ngay
                </button>
              )}
            </div>
          ) : (
            <div className="pt-2 space-y-3">
              {authError && (
                <div className="bg-red-50 border border-red-200 text-[#D64545] p-3 rounded-xl text-xs font-semibold">
                  {authError}
                </div>
              )}

              {/* Nút đăng nhập Google */}
              <button
                onClick={handleStartOAuth}
                disabled={isAuthorizing}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] hover:text-white font-black text-base shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60"
              >
                {isAuthorizing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Đang kết nối Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Cho phép Ong Nhỏ xem số liệu</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Dành cho nhân viên: Nút sao chép link gửi khách */}
          <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
            <span>Dành cho nhân viên Ong Nhỏ:</span>
            <button
              onClick={handleCopyClientLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-[#2B1B0E] font-bold transition-colors cursor-pointer"
            >
              {copiedLink ? <CheckCircle2 className="w-4 h-4 text-[#2E9E5B]" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Đã sao chép link!' : 'Sao chép link gửi khách'}</span>
            </button>
          </div>
        </div>

        {/* Chân trang */}
        <div className="text-center text-xs text-stone-500">
          <div>Ứng dụng Ong Nhỏ • Dành riêng cho doanh nghiệp SME Việt Nam</div>
          <div>Bảo mật tài khoản tuân thủ nghiêm ngặt theo chính sách nhà phát triển Google API.</div>
        </div>
      </div>
    </div>
  );
}
