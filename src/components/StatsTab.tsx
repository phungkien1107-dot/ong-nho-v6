/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TAB THỐNG KÊ GOOGLE SEARCH CONSOLE (OAuth & Phân Tích Thực Tế)
 * Tuân thủ tuyệt đối:
 * 1. Chỉ đưa ra nhận định và kết luận từ số liệu thật.
 * 2. CẤM các từ: nên, hãy, cần, gợi ý, đề xuất, khuyên, thử.
 * 3. Dùng từ "lượt", không dùng từ "người".
 * 4. Thiếu dữ liệu thì nói rõ "Chưa đủ dữ liệu để kết luận".
 * 5. Bố cục tinh gọn, Xem nâng cao mặc định thu gọn.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Calendar,
  Globe,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Sparkles,
  MousePointer,
  Eye,
  Percent,
  Compass,
  Edit2,
  Check,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Layers,
  Smartphone,
  Monitor,
  Tablet,
  FileText,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { scoreWebsite, FetchMetadata } from '../scoring';

interface GscSite {
  siteUrl: string;
  permissionLevel: string;
  customCustomerName?: string;
}

interface GscAccount {
  email: string;
  linkedAt: string;
  status: 'active' | 'revoked' | 'error';
  lastChecked?: string;
  lastError?: string;
  sites: GscSite[];
}

interface RowItem {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface AnalyticsData {
  siteUrl: string;
  resolvedSiteUrl?: string;
  startDate: string;
  endDate: string;
  originalStartDate?: string;
  originalEndDate?: string;
  shiftedDays?: number;
  siteStatus?: 'ok' | 'no_data' | 'error';
  dimension: string;
  tableRows: RowItem[];
  dailyRows: RowItem[];
  deviceRows?: RowItem[];
  pageRows?: RowItem[];
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  comparison: {
    prevClicks: number;
    prevImpressions: number;
    prevCtr: number;
    prevPosition: number;
    clicksDiff: number;
    clicksDiffPercent: number;
    impressionsDiff: number;
    impressionsDiffPercent: number;
    ctrDiff: number;
    positionDiff: number;
  } | null;
}

interface PageAuditItem {
  url: string;
  path: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  status: 'pending' | 'checking' | 'done' | 'error';
  deductions: string[];
}

interface ConfigStatus {
  isConfigured: boolean;
  isDemo: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
}

interface StatsTabProps {
  onOpenCapQuyen?: () => void;
}

export function StatsTab({ onOpenCapQuyen }: StatsTabProps) {
  // Trạng thái cấu hình khóa Google
  const [configStatus, setConfigStatus] = useState<ConfigStatus>({
    isConfigured: true,
    isDemo: false,
    hasClientId: true,
    hasClientSecret: true,
  });

  // Danh sách tài khoản
  const [accounts, setAccounts] = useState<GscAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Bộ chọn website duy nhất
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string>('');

  // Bộ lọc chu kỳ ngày
  const [dateRange, setDateRange] = useState<'7d' | '28d' | '3m'>('28d');

  // Dữ liệu phân tích chi tiết
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Nhận định AI / code-generated
  const [statements, setStatements] = useState<string[]>([]);

  // Phần 3: Audit SEO các trang có CTR thấp
  const [auditedPages, setAuditedPages] = useState<PageAuditItem[]>([]);

  // Trạng thái mở rộng "Xem nâng cao" (mặc định THU GỌN)
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Bộ lọc dimension trong mục Xem nâng cao
  const [advancedDimension, setAdvancedDimension] = useState<'query' | 'page' | 'country' | 'searchAppearance'>('query');

  // Tìm kiếm trong bảng nâng cao
  const [searchTableQuery, setSearchTableQuery] = useState('');

  // Sửa tên khách hàng nhanh
  const [editingSiteUrl, setEditingSiteUrl] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState('');

  // Trạng thái copy link & lỗi xác thực
  const [copiedLink, setCopiedLink] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);

  // 1. Kiểm tra trạng thái cấu hình máy chủ
  const fetchConfigStatus = async () => {
    try {
      const res = await fetch('/api/gsc/status');
      const json = await res.json();
      if (json.success) {
        setConfigStatus(json);
        if (json.isDemo) setIsDemoMode(true);
      }
    } catch {
      // Bỏ qua lỗi mạng
    }
  };

  // 2. Nạp danh sách tài khoản
  const fetchAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await fetch('/api/gsc/accounts');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAccounts(json.data);
        if (json.isDemo) setIsDemoMode(true);

        // Mặc định chọn website đầu tiên nếu chưa chọn
        if (json.data.length > 0) {
          const firstAccountWithSite = json.data.find((a: GscAccount) => a.sites && a.sites.length > 0);
          if (firstAccountWithSite && firstAccountWithSite.sites.length > 0) {
            setSelectedSiteUrl((prev) => prev || firstAccountWithSite.sites[0].siteUrl);
          }
        }
      }
    } catch (e) {
      console.error('Lỗi khi nạp danh sách tài khoản GSC:', e);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchConfigStatus();
    fetchAccounts();
  }, []);

  // Danh sách phẳng tất cả website để chọn trong dropdown
  const allSitesFlat = useMemo(() => {
    return accounts.flatMap((acc) =>
      (acc.sites || []).map((s) => ({
        ...s,
        email: acc.email,
        accountStatus: acc.status,
      }))
    );
  }, [accounts]);

  // Cập nhật selectedSiteUrl khi danh sách tài khoản tải xong
  useEffect(() => {
    if (!selectedSiteUrl && allSitesFlat.length > 0) {
      setSelectedSiteUrl(allSitesFlat[0].siteUrl);
    }
  }, [allSitesFlat, selectedSiteUrl]);

  // Tính toán khoảng ngày: kết thúc cách hôm nay 3 ngày để bù độ trễ của Google
  const getDateRangeParams = useCallback(() => {
    const end = new Date();
    end.setDate(end.getDate() - 3);

    const start = new Date(end);
    let days = 28;
    if (dateRange === '7d') days = 7;
    else if (dateRange === '3m') days = 90;

    start.setDate(start.getDate() - days);

    // Chu kỳ so sánh
    const compEnd = new Date(start);
    compEnd.setDate(compEnd.getDate() - 1);
    const compStart = new Date(compEnd);
    compStart.setDate(compStart.getDate() - days);

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    return {
      startDate: fmt(start),
      endDate: fmt(end),
      compareStartDate: fmt(compStart),
      compareEndDate: fmt(compEnd),
    };
  }, [dateRange]);

  // 3. Nạp dữ liệu thống kê của website được chọn
  const fetchAnalytics = useCallback(async () => {
    if (!selectedSiteUrl) return;

    setIsLoadingAnalytics(true);
    setAnalyticsError(null);
    setStatements([]);
    setAuditedPages([]);

    const siteObj = allSitesFlat.find((s) => s.siteUrl === selectedSiteUrl);
    const email = siteObj?.email || accounts[0]?.email || 'demo@ongnho.vn';
    const dateParams = getDateRangeParams();

    try {
      const res = await fetch('/api/gsc/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          siteUrl: selectedSiteUrl,
          dimension: advancedDimension,
          ...dateParams,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Không thể lấy số liệu từ Search Console.');
      }

      setAnalytics(json.data);
      if (json.isDemo) setIsDemoMode(true);

      // Gọi endpoint lấy nhận định (statements)
      fetchStatements(json.data, selectedSiteUrl);
    } catch (err: any) {
      setAnalyticsError(err.message || 'Lỗi khi tải số liệu thống kê.');
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [selectedSiteUrl, advancedDimension, getDateRangeParams, allSitesFlat, accounts]);

  // 4. Lấy nhận định từ số liệu thật
  const fetchStatements = async (statsData: any, siteUrl: string) => {
    try {
      const res = await fetch('/api/gsc/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, stats: statsData }),
      });
      const json = await res.json();
      if (json.success && json.data?.statements) {
        setStatements(json.data.statements);
      }
    } catch {
      // Tự sinh câu mặc định
      const clicks = statsData.totals?.clicks || 0;
      const imp = statsData.totals?.impressions || 0;
      const ctr = statsData.totals?.ctr || 0;
      setStatements([
        `Website ghi nhận ${clicks.toLocaleString('vi-VN')} lượt nhấp từ ${imp.toLocaleString('vi-VN')} lượt hiển thị (CTR ${ctr}%).`,
      ]);
    }
  };

  useEffect(() => {
    if (selectedSiteUrl) {
      fetchAnalytics();
    }
  }, [selectedSiteUrl, dateRange, advancedDimension, fetchAnalytics]);

  // Nút Làm mới toàn bộ
  const handleRefreshAll = async () => {
    await fetchConfigStatus();
    await fetchAccounts();
    await fetchAnalytics();
  };

  // Mở popup OAuth Google
  const handleConnectGoogle = async () => {
    setGoogleAuthError(null);
    try {
      const res = await fetch('/auth/google/url');
      const data = await res.json();
      if (!res.ok || !data.url) {
        setGoogleAuthError(data.error || 'Chưa cấu hình GOOGLE_CLIENT_ID trên máy chủ.');
        return;
      }
      const popup = window.open(data.url, 'OngNhoGoogleAuth', 'width=550,height=650');
      if (!popup || popup.closed) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setGoogleAuthError(err.message || 'Lỗi khi mở xác thực Google.');
    }
  };

  // Sao chép link cấp quyền cho khách
  const handleCopyLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/cap-quyen`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Gỡ tài khoản
  const handleDeleteAccount = async (email: string) => {
    if (!window.confirm(`Xác nhận gỡ liên kết tài khoản ${email}?`)) return;
    try {
      await fetch('/api/gsc/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      await fetchAccounts();
      setSelectedSiteUrl('');
    } catch (e) {
      console.error('Lỗi khi xóa tài khoản:', e);
    }
  };

  // Lưu tên khách hàng cho website
  const handleSaveCustomerName = async (email: string, siteUrl: string) => {
    try {
      await fetch('/api/gsc/customer-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, siteUrl, customerName: editNameVal }),
      });
      setEditingSiteUrl(null);
      await fetchAccounts();
    } catch (e) {
      console.error('Lỗi khi lưu tên khách:', e);
    }
  };

  // Lắng nghe postMessage khi xác thực xong
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === 'GSC_AUTH_SUCCESS') {
        fetchAccounts();
        fetchAnalytics();
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [fetchAnalytics]);

  // =========================================================================
  // TÍNH TOÁN CÂU NHẬN ĐỊNH CHÍNH (Code sinh ra theo luật & ngưỡng)
  // =========================================================================
  const mainInsight = useMemo(() => {
    if (!analytics) return '';
    const { clicks, impressions, ctr } = analytics.totals;
    if (impressions < 100) {
      return `Chưa đủ dữ liệu để kết luận (lượt hiển thị hiện tại là ${impressions.toLocaleString('vi-VN')} lượt, dưới ngưỡng 100 lượt).`;
    }
    if (ctr < 2.0) {
      return `Website có ${impressions.toLocaleString('vi-VN')} lượt hiển thị nhưng chỉ ${clicks.toLocaleString('vi-VN')} lượt nhấp (CTR ${ctr}%).`;
    }
    return `Website có ${impressions.toLocaleString('vi-VN')} lượt hiển thị và ${clicks.toLocaleString('vi-VN')} lượt nhấp (CTR ${ctr}%).`;
  }, [analytics]);

  // =========================================================================
  // PHẦN 1: THIẾT BỊ (Tính toán bảng & Câu kết luận theo luật)
  // =========================================================================
  const deviceStats = useMemo(() => {
    if (!analytics || !analytics.deviceRows || analytics.deviceRows.length === 0) {
      return null;
    }
    const rows = analytics.deviceRows;
    const totalImp = rows.reduce((acc, r) => acc + (r.impressions || 0), 0);
    const totalClk = rows.reduce((acc, r) => acc + (r.clicks || 0), 0);

    const mapped = rows.map((r) => {
      const type = (r.keys?.[0] || '').toUpperCase();
      const label = type === 'MOBILE' ? 'Điện thoại' : type === 'DESKTOP' ? 'Máy tính' : 'Máy tính bảng';
      const imp = r.impressions || 0;
      const clk = r.clicks || 0;
      const pct = totalImp > 0 ? Math.round((imp / totalImp) * 1000) / 10 : 0;
      const ctr = imp > 0 ? Math.round((clk / imp) * 1000) / 10 : 0;
      const pos = Math.round((r.position || 0) * 10) / 10;
      return { type, label, imp, clk, pct, ctr, pos };
    });

    // Sắp xếp theo lượt hiển thị giảm dần
    mapped.sort((a, b) => b.imp - a.imp);

    // Sinh câu kết luận theo luật
    let conclusion = '';
    if (totalImp < 100) {
      conclusion = 'Chưa đủ dữ liệu để kết luận về thiết bị (tổng số lượt hiển thị dưới 100 lượt).';
    } else {
      const topDevice = mapped[0];
      conclusion = `${Math.round(topDevice.pct)}% lượt hiển thị đến từ ${topDevice.label.toLowerCase()}.`;

      const mobile = mapped.find((m) => m.type === 'MOBILE');
      const desktop = mapped.find((m) => m.type === 'DESKTOP');

      if (mobile && desktop && mobile.imp >= 100 && desktop.imp >= 100) {
        // So sánh CTR chênh từ 1.5 lần trở lên
        const maxCtr = Math.max(mobile.ctr, desktop.ctr);
        const minCtr = Math.min(mobile.ctr, desktop.ctr);
        if (minCtr > 0 && maxCtr / minCtr >= 1.5) {
          if (mobile.ctr < desktop.ctr) {
            conclusion += ` CTR trên điện thoại (${mobile.ctr}%) thấp hơn máy tính (${desktop.ctr}%).`;
          } else {
            conclusion += ` CTR trên điện thoại (${mobile.ctr}%) cao hơn máy tính (${desktop.ctr}%).`;
          }
        }

        // So sánh vị trí chênh từ 3 bậc trở lên
        const posDiff = Math.abs(mobile.pos - desktop.pos);
        if (posDiff >= 3) {
          if (desktop.pos < mobile.pos) {
            conclusion += ` Vị trí trung bình trên máy tính (${desktop.pos}) đứng cao hơn điện thoại (${mobile.pos}).`;
          } else {
            conclusion += ` Vị trí trung bình trên điện thoại (${mobile.pos}) đứng cao hơn máy tính (${desktop.pos}).`;
          }
        }
      }
    }

    return { rows: mapped, totalImp, totalClk, conclusion };
  }, [analytics]);

  // =========================================================================
  // PHẦN 2: TRANG HIỂN THỊ NHIỀU NHƯNG ÍT LƯỢT NHẤP
  // Thuật toán: median impressions & >= 100, CTR < CTR trung bình website
  // =========================================================================
  const underperformingPages = useMemo(() => {
    if (!analytics || !analytics.pageRows || analytics.pageRows.length === 0) {
      return [];
    }
    const pages = analytics.pageRows.map((r) => {
      const fullUrl = r.keys?.[0] || '';
      let path = fullUrl;
      try {
        const u = new URL(fullUrl);
        path = u.pathname + u.search;
      } catch {
        path = fullUrl.replace(/^https?:\/\/[^/]+/i, '') || '/';
      }
      const imp = r.impressions || 0;
      const clk = r.clicks || 0;
      const ctr = imp > 0 ? Math.round((clk / imp) * 1000) / 10 : 0;
      const pos = Math.round((r.position || 0) * 10) / 10;
      return { url: fullUrl, path: path || '/', imp, clk, ctr, pos };
    });

    if (pages.length === 0) return [];

    // Tính median impressions
    const sortedImp = [...pages.map((p) => p.imp)].sort((a, b) => a - b);
    const mid = Math.floor(sortedImp.length / 2);
    const medianImp = sortedImp.length % 2 !== 0 ? sortedImp[mid] : (sortedImp[mid - 1] + sortedImp[mid]) / 2;

    const siteAvgCtr = analytics.totals.ctr;

    // Lọc: impressions >= median && impressions >= 100 && ctr < siteAvgCtr
    const filtered = pages.filter((p) => p.imp >= medianImp && p.imp >= 100 && p.ctr < siteAvgCtr);

    // Sắp xếp theo lượt hiển thị giảm dần, lấy tối đa 5 trang
    filtered.sort((a, b) => b.imp - a.imp);
    return filtered.slice(0, 5);
  }, [analytics]);

  // =========================================================================
  // PHẦN 3: ĐIỂM RIÊNG CỦA ONG NHỎ
  // Chạy chấm điểm SEO thật từ app trên tối đa 3 trang ở Phần 2
  // =========================================================================
  useEffect(() => {
    if (underperformingPages.length === 0) {
      setAuditedPages([]);
      return;
    }

    const targetPages = underperformingPages.slice(0, 3);
    const initialItems: PageAuditItem[] = targetPages.map((p) => ({
      url: p.url,
      path: p.path,
      impressions: p.imp,
      clicks: p.clk,
      ctr: p.ctr,
      position: p.pos,
      status: 'pending',
      deductions: [],
    }));
    setAuditedPages(initialItems);

    let isMounted = true;

    // Chạy kiểm tra độc lập từng trang
    targetPages.forEach(async (target, idx) => {
      setAuditedPages((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, status: 'checking' } : item))
      );

      try {
        // Nếu là chế độ demo và URL demo, tạo kết luận mẫu theo đúng chuẩn
        if (isDemoMode && target.url.includes('ongnho.vn')) {
          await new Promise((r) => setTimeout(r, 600 + idx * 300));
          if (!isMounted) return;

          let deductions: string[] = [];
          if (target.path.includes('dich-vu')) {
            deductions = [
              `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng tiêu đề chỉ 18 ký tự (chuẩn 30-60), đang bị trừ điểm.`,
            ];
          } else if (target.path.includes('gioi-thieu')) {
            deductions = [
              `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng chưa có thẻ mô tả Meta Description, đang bị trừ điểm.`,
            ];
          } else if (target.path.includes('san-pham')) {
            deductions = [
              `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng có 3 thẻ H1 (chuẩn 1 thẻ H1), đang bị trừ điểm.`,
            ];
          }

          setAuditedPages((prev) =>
            prev.map((item, i) =>
              i === idx ? { ...item, status: 'done', deductions } : item
            )
          );
          return;
        }

        // Gọi API fetch-site thật
        const res = await fetch('/api/fetch-site', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: target.url }),
        });

        if (!res.ok) {
          throw new Error('Không tải được trang');
        }

        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || 'Lỗi quét trang');
        }

        const meta: FetchMetadata = {
          finalUrl: json.data.finalUrl || target.url,
          statusCode: json.data.statusCode || 200,
          responseTimeMs: json.data.responseTimeMs || 0,
          htmlSizeBytes: (json.data.html || '').length,
          redirectChain: json.data.redirectChain || [],
          xRobotsTag: json.data.xRobotsTag || '',
          robotsTxt: json.data.robotsTxt || null,
          robotsTxtFound: Boolean(json.data.robotsTxtFound),
          sitemapFound: Boolean(json.data.sitemapFound),
          isBlocked: Boolean(json.data.isBlocked),
        };

        const scoreRes = scoreWebsite(json.data.html || '', meta);
        const deductions: string[] = [];

        // Duyệt các tiêu chí bị trừ điểm để sinh câu nhận định
        for (const item of scoreRes.allDoneItems) {
          if (item.diem < item.diemToiDa || item.ketQua === 'loi' || item.ketQua === 'nen_sua') {
            if (item.id === 'title') {
              const parser = new DOMParser();
              const doc = parser.parseFromString(json.data.html || '', 'text/html');
              const tLen = (doc.title || '').trim().length;
              deductions.push(
                `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng tiêu đề chỉ ${tLen} ký tự (chuẩn 30-60), đang bị trừ điểm.`
              );
            } else if (item.id === 'meta_desc') {
              deductions.push(
                `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng thiếu thẻ mô tả Meta Description, đang bị trừ điểm.`
              );
            } else if (item.id === 'h1') {
              deductions.push(
                `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng có ${scoreRes.soTheH1} thẻ H1 (chuẩn 1 thẻ H1), đang bị trừ điểm.`
              );
            } else if (item.id === 'https') {
              deductions.push(
                `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng chưa có chứng chỉ bảo mật HTTPS, đang bị trừ điểm.`
              );
            } else if (item.id === 'viewport') {
              deductions.push(
                `Trang ${target.path} có ${target.imp.toLocaleString('vi-VN')} lượt hiển thị nhưng thiếu cấu hình khung nhìn di động (viewport), đang bị trừ điểm.`
              );
            }
          }
        }

        if (isMounted) {
          setAuditedPages((prev) =>
            prev.map((item, i) =>
              i === idx ? { ...item, status: 'done', deductions } : item
            )
          );
        }
      } catch {
        if (isMounted) {
          setAuditedPages((prev) =>
            prev.map((item, i) =>
              i === idx ? { ...item, status: 'error', deductions: ['Không kiểm tra được trang này'] } : item
            )
          );
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [underperformingPages, isDemoMode]);

  // Biểu đồ SVG đường biến thiên theo ngày
  const renderDailyChart = () => {
    if (!analytics || !analytics.dailyRows || analytics.dailyRows.length === 0) return null;
    const rows = analytics.dailyRows;
    const maxClicks = Math.max(...rows.map((r) => r.clicks || 0), 1);
    const maxImpr = Math.max(...rows.map((r) => r.impressions || 0), 1);

    const width = 650;
    const height = 140;
    const padding = 15;

    const pointsClicks = rows.map((r, i) => {
      const x = padding + (i / (rows.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - ((r.clicks || 0) / maxClicks) * (height - 2 * padding);
      return `${x},${y}`;
    });

    const pointsImpr = rows.map((r, i) => {
      const x = padding + (i / (rows.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - ((r.impressions || 0) / maxImpr) * (height - 2 * padding);
      return `${x},${y}`;
    });

    return (
      <div className="bg-[#FFFBF0] p-4 rounded-2xl border border-[#2B1B0E]/15 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4 font-bold">
            <span className="flex items-center gap-1.5 text-[#2E9E5B]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2E9E5B]"></span> Lượt nhấp
            </span>
            <span className="flex items-center gap-1.5 text-[#8A4B00]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFB400]"></span> Lượt hiển thị
            </span>
          </div>
          <span className="text-stone-500 text-xs font-medium">Biến thiên theo ngày</span>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#E5E7EB" strokeDasharray="3 3" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#E5E7EB" />

          <motion.path
            d={`M ${pointsImpr.join(' L ')}`}
            fill="none"
            stroke="#FFB400"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.0, ease: 'easeOut' }}
          />

          <motion.path
            d={`M ${pointsClicks.join(' L ')}`}
            fill="none"
            stroke="#2E9E5B"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.0, delay: 0.15, ease: 'easeOut' }}
          />
        </svg>

        <div className="flex justify-between text-xs text-stone-500 font-medium px-1">
          <span>{rows[0]?.keys?.[0] || 'Bắt đầu'}</span>
          <span>{rows[Math.floor(rows.length / 2)]?.keys?.[0] || ''}</span>
          <span>{rows[rows.length - 1]?.keys?.[0] || 'Kết thúc'}</span>
        </div>
      </div>
    );
  };

  // =========================================================================
  // TRƯỜNG HỢP 0: CHƯA CẤU HÌNH KHÓA GOOGLE
  // =========================================================================
  if (!configStatus.isConfigured && !isDemoMode) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FFF3C4] text-[#E8890C] text-xs font-bold uppercase tracking-wider">
          <Activity className="w-3.5 h-3.5" />
          Google Search Console
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#2B1B0E] tracking-tight">
          Thống kê hiệu quả tìm kiếm Google
        </h1>

        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-6 sm:p-8 space-y-4 max-w-2xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-extrabold text-lg text-amber-950">
                Chưa cấu hình khóa Google
              </h3>
              <p className="text-xs text-stone-700 leading-relaxed font-medium">
                Hệ thống chưa tìm thấy khóa <strong>GOOGLE_CLIENT_SECRET</strong> trong tệp cấu hình máy chủ <code>.env</code>.
              </p>
              <div className="p-3 bg-white/80 rounded-xl border border-amber-200 text-xs font-mono text-stone-800">
                GOOGLE_CLIENT_SECRET=&lt;khóa_bí_mật_từ_google_cloud&gt;
              </div>
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={handleRefreshAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] font-bold text-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Kiểm tra lại cấu hình</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // TRƯỜNG HỢP 1: CHƯA KẾT NỐI GOOGLE (CHỈ HIỆN 1 NÚT LỚN & 1 DÒNG GIẢI THÍCH)
  // =========================================================================
  if (accounts.length === 0 && !isDemoMode && !isLoadingAccounts) {
    return (
      <div className="space-y-8 animate-fadeIn max-w-3xl">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FFF3C4] text-[#E8890C] text-xs font-bold uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5" />
            Google Search Console
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#2B1B0E] tracking-tight">
            Thống kê hiệu quả tìm kiếm Google
          </h1>
          <p className="text-sm text-[#2B1B0E]/75 font-medium">
            Theo dõi lượt hiển thị, lượt nhấp và vị trí từ khóa thực tế của website trên Google.
          </p>
        </div>

        {/* Khung nút lớn kết nối Google */}
        <div className="bg-white rounded-3xl p-8 sm:p-12 border-2 border-[#2B1B0E]/15 shadow-sm text-center space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-[#FFF3C4] flex items-center justify-center mx-auto text-[#E8890C]">
            <Globe className="w-8 h-8" />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-xl sm:text-2xl font-black text-[#2B1B0E]">
              Kết nối Google Search Console
            </h2>
            <p className="text-xs text-stone-600 leading-relaxed font-medium">
              Kết nối tài khoản Google Search Console để xem số liệu tìm kiếm thực tế của website.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleConnectGoogle}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] hover:text-white font-extrabold text-sm shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>Kết nối Google</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#FFFBF0] border border-[#2B1B0E]/15 hover:bg-white text-stone-700 font-bold text-xs transition-colors cursor-pointer"
            >
              {copiedLink ? <CheckCircle2 className="w-4 h-4 text-[#2E9E5B]" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Đã sao chép liên kết' : 'Sao chép liên kết gửi khách'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // BỐ CỤC CHÍNH (KHI ĐÃ CÓ WEBSITE HOẶC ĐANG CHẠY BẢN DEMO)
  // =========================================================================
  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* BANNER ĐỎ CỐ ĐỊNH KHI BẬT GSC_DEMO=true */}
      {isDemoMode && (
        <div className="bg-red-600 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>DỮ LIỆU MẪU - KHÔNG PHẢI SỐ THẬT</span>
          </div>
          <span className="text-[11px] font-normal lowercase tracking-normal opacity-90 hidden sm:inline">
            (Đang kích hoạt biến môi trường GSC_DEMO=true để kiểm thử giao diện)
          </span>
        </div>
      )}

      {/* TIÊU ĐỀ & THANH ĐIỀU HƯỚNG TRÊN CÙNG */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FFF3C4] text-[#E8890C] text-[11px] font-bold uppercase tracking-wider">
            <Activity className="w-3 h-3" />
            Số liệu thật từ Google
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#2B1B0E] tracking-tight mt-1">
            Thống kê hiệu quả tìm kiếm Google
          </h1>
        </div>

        <button
          onClick={handleRefreshAll}
          disabled={isLoadingAnalytics}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#2B1B0E]/15 hover:bg-[#FFFBF0] text-[#2B1B0E] font-bold text-xs shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          title="Làm mới lại toàn bộ số liệu"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAnalytics ? 'animate-spin text-[#E8890C]' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* KHUNG BỘ CHỌN: 1 WEBSITE & KHOẢNG THỜI GIAN */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border-2 border-[#2B1B0E]/15 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Chọn 1 website */}
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-extrabold uppercase text-stone-500 tracking-wider">
              Chọn website
            </label>
            <div className="relative">
              <select
                value={selectedSiteUrl}
                onChange={(e) => setSelectedSiteUrl(e.target.value)}
                className="w-full appearance-none px-3.5 py-2.5 pr-8 rounded-xl bg-[#FFFBF0] border border-[#2B1B0E]/15 text-xs font-bold text-[#2B1B0E] focus:outline-none focus:border-[#FFB400] cursor-pointer"
              >
                {allSitesFlat.map((s, idx) => {
                  const clean = s.siteUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
                  const label = s.customCustomerName ? `${s.customCustomerName} (${clean})` : clean;
                  return (
                    <option key={idx} value={s.siteUrl}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500" />
            </div>
          </div>

          {/* Chọn khoảng thời gian */}
          <div className="space-y-1">
            <label className="text-[11px] font-extrabold uppercase text-stone-500 tracking-wider block">
              Khoảng thời gian
            </label>
            <div className="flex items-center gap-1 bg-[#FFFBF0] p-1 rounded-xl border border-stone-200 text-xs font-bold">
              <button
                onClick={() => setDateRange('7d')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateRange === '7d' ? 'bg-[#FFB400] text-[#2B1B0E] shadow-2xs' : 'text-stone-500 hover:bg-stone-100'
                }`}
              >
                7 ngày
              </button>
              <button
                onClick={() => setDateRange('28d')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateRange === '28d' ? 'bg-[#FFB400] text-[#2B1B0E] shadow-2xs' : 'text-stone-500 hover:bg-stone-100'
                }`}
              >
                28 ngày qua
              </button>
              <button
                onClick={() => setDateRange('3m')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateRange === '3m' ? 'bg-[#FFB400] text-[#2B1B0E] shadow-2xs' : 'text-stone-500 hover:bg-stone-100'
                }`}
              >
                3 tháng
              </button>
            </div>
          </div>
        </div>

        {/* Dòng ghi chú độ trễ Google */}
        <div className="flex items-center justify-between text-xs text-stone-500 pt-2 border-t border-stone-100">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#E8A100]" />
            <span>
              <strong>Ghi chú:</strong> Số liệu Google trễ 2-3 ngày (chu kỳ báo cáo kết thúc cách hôm nay 3 ngày).
            </span>
          </div>
          {analytics && (
            <span className="font-mono text-[11px] text-stone-600">
              {analytics.startDate} → {analytics.endDate}
            </span>
          )}
        </div>
      </div>

      {/* TRẠNG THÁI TẢI */}
      {isLoadingAnalytics && (
        <div className="py-12 bg-white rounded-3xl border-2 border-[#2B1B0E]/15 text-center flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-[#E8890C]" />
          <span className="text-sm font-extrabold text-[#2B1B0E]">
            Đang tải số liệu từ Google Search Console...
          </span>
        </div>
      )}

      {/* BÁO LỖI NẾU CÓ */}
      {analyticsError && (
        <div className="p-5 bg-red-50 border-2 border-red-200 text-[#D64545] rounded-2xl space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[#D64545] mt-0.5" />
            <div>
              <div className="font-extrabold text-sm text-[#991B1B]">
                Không thể lấy số liệu từ Search Console
              </div>
              <div className="text-xs text-stone-700 leading-relaxed font-medium mt-0.5">
                {analyticsError}
              </div>
            </div>
          </div>
          <button
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FFB400] text-[#2B1B0E] font-bold text-xs hover:bg-[#E8890C] hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Tải lại</span>
          </button>
        </div>
      )}

      {/* DỮ LIỆU CHÍNH */}
      {!isLoadingAnalytics && !analyticsError && analytics && (
        <div className="space-y-6">
          {/* =========================================================================
              NHẬN ĐỊNH CHÍNH (Code sinh ra từ số liệu thật)
              ========================================================================= */}
          <div className="bg-[#FFFBF0] border-2 border-[#FFB400] rounded-2xl p-4 sm:p-5 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#8A4B00] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-[11px] font-extrabold text-[#8A4B00] uppercase tracking-wider">
                Nhận định chính
              </div>
              <p className="text-sm sm:text-base font-extrabold text-[#2B1B0E] leading-relaxed">
                {mainInsight}
              </p>
            </div>
          </div>

          {/* =========================================================================
              4 THẺ SỐ: LƯỢT NHẤP, HIỂN THỊ, CTR, VỊ TRÍ TRUNG BÌNH
              ========================================================================= */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Lượt nhấp */}
            <div className="p-4 bg-white rounded-2xl border-2 border-[#2B1B0E]/15 space-y-1">
              <div className="text-xs text-stone-500 font-bold flex items-center gap-1.5">
                <MousePointer className="w-3.5 h-3.5 text-[#2E9E5B]" /> Lượt nhấp
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#2B1B0E]">
                {analytics.totals.clicks.toLocaleString('vi-VN')}
              </div>
              {analytics.comparison && (
                <div className="text-xs font-bold flex items-center gap-1">
                  {analytics.comparison.clicksDiffPercent >= 0 ? (
                    <span className="text-[#2E9E5B] flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" /> +{analytics.comparison.clicksDiffPercent}%
                    </span>
                  ) : (
                    <span className="text-[#D64545] flex items-center">
                      <TrendingDown className="w-3 h-3 mr-0.5" /> {analytics.comparison.clicksDiffPercent}%
                    </span>
                  )}
                  <span className="text-stone-400 font-normal">so với kỳ trước</span>
                </div>
              )}
            </div>

            {/* 2. Lượt hiển thị */}
            <div className="p-4 bg-white rounded-2xl border-2 border-[#2B1B0E]/15 space-y-1">
              <div className="text-xs text-stone-500 font-bold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#8A4B00]" /> Lượt hiển thị
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#2B1B0E]">
                {analytics.totals.impressions.toLocaleString('vi-VN')}
              </div>
              {analytics.comparison && (
                <div className="text-xs font-bold flex items-center gap-1">
                  {analytics.comparison.impressionsDiffPercent >= 0 ? (
                    <span className="text-[#2E9E5B] flex items-center">
                      <TrendingUp className="w-3 h-3 mr-0.5" /> +{analytics.comparison.impressionsDiffPercent}%
                    </span>
                  ) : (
                    <span className="text-[#D64545] flex items-center">
                      <TrendingDown className="w-3 h-3 mr-0.5" /> {analytics.comparison.impressionsDiffPercent}%
                    </span>
                  )}
                  <span className="text-stone-400 font-normal">so với kỳ trước</span>
                </div>
              )}
            </div>

            {/* 3. Tỷ lệ CTR */}
            <div className="p-4 bg-white rounded-2xl border-2 border-[#2B1B0E]/15 space-y-1">
              <div className="text-xs text-stone-500 font-bold flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-blue-600" /> Tỷ lệ CTR
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#2B1B0E]">
                {analytics.totals.ctr}%
              </div>
              {analytics.comparison && (
                <div className="text-xs font-bold flex items-center gap-1">
                  {analytics.comparison.ctrDiff >= 0 ? (
                    <span className="text-[#2E9E5B]">+{analytics.comparison.ctrDiff}%</span>
                  ) : (
                    <span className="text-[#D64545]">{analytics.comparison.ctrDiff}%</span>
                  )}
                  <span className="text-stone-400 font-normal">so với kỳ trước</span>
                </div>
              )}
            </div>

            {/* 4. Vị trí trung bình */}
            <div className="p-4 bg-white rounded-2xl border-2 border-[#2B1B0E]/15 space-y-1">
              <div className="text-xs text-stone-500 font-bold flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-purple-600" /> Vị trí trung bình
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#2B1B0E]">
                {analytics.totals.position}
              </div>
              {analytics.comparison && (
                <div className="text-xs font-bold flex items-center gap-1">
                  {analytics.comparison.positionDiff <= 0 ? (
                    <span className="text-[#2E9E5B]">
                      Tăng hạng ({Math.abs(analytics.comparison.positionDiff)})
                    </span>
                  ) : (
                    <span className="text-[#D64545]">
                      Giảm hạng ({analytics.comparison.positionDiff})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              BIỂU ĐỒ ĐƯỜNG THEO NGÀY
              ========================================================================= */}
          {renderDailyChart()}

          {/* =========================================================================
              PHẦN 1: THIẾT BỊ
              ========================================================================= */}
          {deviceStats && (
            <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-[#2B1B0E]/15 shadow-sm space-y-4">
              <div className="space-y-1">
                <h3 className="font-black text-base text-[#2B1B0E]">
                  Phần 1: Thiết bị truy cập
                </h3>
                <p className="text-xs font-extrabold text-[#8A4B00]">
                  {deviceStats.conclusion}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-stone-200 text-stone-500 font-extrabold uppercase">
                      <th className="py-2.5 px-3">Thiết bị</th>
                      <th className="py-2.5 px-3 text-right">Lượt nhấp</th>
                      <th className="py-2.5 px-3 text-right">Lượt hiển thị</th>
                      <th className="py-2.5 px-3">Tỷ lệ hiển thị</th>
                      <th className="py-2.5 px-3 text-right">CTR</th>
                      <th className="py-2.5 px-3 text-right">Vị trí TB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {deviceStats.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#FFFBF0] transition-colors">
                        <td className="py-3 px-3 font-extrabold text-[#2B1B0E] flex items-center gap-2">
                          {row.type === 'MOBILE' ? (
                            <Smartphone className="w-4 h-4 text-[#E8890C]" />
                          ) : row.type === 'DESKTOP' ? (
                            <Monitor className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Tablet className="w-4 h-4 text-purple-600" />
                          )}
                          <span>{row.label}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#2E9E5B]">
                          {row.clk.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-stone-700">
                          {row.imp.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-3 w-48">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] font-bold text-stone-600">
                              <span>{row.pct}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#FFB400]"
                                style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-stone-600">
                          {row.ctr}%
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-stone-600">
                          {row.pos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              PHẦN 2: "TRANG HIỂN THỊ NHIỀU NHƯNG ÍT LƯỢT NHẤP"
              ========================================================================= */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-[#2B1B0E]/15 shadow-sm space-y-4">
            <div className="space-y-1">
              <h3 className="font-black text-base text-[#2B1B0E]">
                Phần 2: Trang hiển thị nhiều nhưng ít lượt nhấp
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                Các trang có lượt hiển thị từ mức trung vị trở lên (tối thiểu 100 lượt) nhưng tỷ lệ CTR thấp hơn tỷ lệ trung bình ({analytics.totals.ctr}%) của website.
              </p>
            </div>

            {underperformingPages.length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-500 font-medium bg-[#FFFBF0] rounded-2xl border border-stone-200">
                Không có trang nào rơi vào nhóm này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-stone-200 text-stone-500 font-extrabold uppercase">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Địa chỉ trang</th>
                      <th className="py-2.5 px-3 text-right">Lượt hiển thị</th>
                      <th className="py-2.5 px-3 text-right">Lượt nhấp</th>
                      <th className="py-2.5 px-3 text-right">Tỷ lệ CTR</th>
                      <th className="py-2.5 px-3 text-right">Vị trí TB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {underperformingPages.map((page, idx) => (
                      <tr key={idx} className="hover:bg-[#FFFBF0] transition-colors">
                        <td className="py-3 px-3 text-stone-400 font-bold">{idx + 1}</td>
                        <td className="py-3 px-3 font-mono text-stone-800 max-w-xs truncate" title={page.url}>
                          {page.path}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-stone-700">
                          {page.imp.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#2E9E5B]">
                          {page.clk.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#D64545]">
                          {page.ctr}%
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-stone-600">
                          {page.pos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* =========================================================================
              PHẦN 3: ĐIỂM RIÊNG CỦA ONG NHỎ (Audit thật các trang Phần 2)
              ========================================================================= */}
          {underperformingPages.length > 0 && (
            <div className="bg-[#FFFBF0] rounded-3xl p-5 sm:p-6 border-2 border-[#FFB400] shadow-sm space-y-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white border border-[#FFB400]/40 text-[#8A4B00] text-[11px] font-bold uppercase tracking-wider">
                  <FileText className="w-3 h-3" />
                  Điểm riêng của Ong Nhỏ
                </div>
                <h3 className="font-black text-base text-[#2B1B0E]">
                  Phần 3: Đối chiếu điểm kỹ thuật SEO trên từng trang
                </h3>
                <p className="text-xs text-stone-600 font-medium">
                  Kết quả kiểm tra trực tiếp mã HTML của tối đa 3 trang hiển thị nhiều nhưng ít lượt nhấp.
                </p>
              </div>

              <div className="space-y-3">
                {auditedPages.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-white rounded-2xl border border-stone-200/80 space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-[#2B1B0E] truncate max-w-sm">
                        {item.path}
                      </span>
                      {item.status === 'checking' && (
                        <span className="inline-flex items-center gap-1 text-[#E8890C] font-bold">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Đang kiểm tra...</span>
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-[#D64545] font-bold">
                          Không kiểm tra được trang này
                        </span>
                      )}
                    </div>

                    {item.status === 'done' && (
                      <div className="space-y-1.5 pt-1">
                        {item.deductions.length === 0 ? (
                          <p className="text-xs text-[#2E9E5B] font-bold">
                            Trang đạt điểm tối đa ở các mục kiểm tra kỹ thuật.
                          </p>
                        ) : (
                          <ul className="space-y-1 text-xs text-stone-800 font-medium">
                            {item.deductions.map((d, dIdx) => (
                              <li key={dIdx} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#D64545] flex-shrink-0 mt-1.5" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =========================================================================
              MỤC XEM NÂNG CAO (GẬP LẠI, MẶC ĐỊNH THU GỌN)
              ========================================================================= */}
          <div className="border-2 border-[#2B1B0E]/15 rounded-3xl bg-white overflow-hidden shadow-sm">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-4 sm:p-5 flex items-center justify-between bg-[#FFFBF0]/60 hover:bg-[#FFFBF0] transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#E8890C]" />
                <span className="font-black text-sm sm:text-base text-[#2B1B0E]">
                  Xem nâng cao
                </span>
                <span className="text-xs text-stone-500 font-medium hidden sm:inline">
                  (Bảng từ khóa, quốc gia, bảng tổng hợp nhiều website và quản lý tài khoản)
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-stone-600">
                <span>{showAdvanced ? 'Thu gọn' : 'Mở rộng'}</span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showAdvanced && (
              <div className="p-5 sm:p-6 space-y-6 border-t border-stone-200 animate-fadeIn">
                {/* 1. Các câu nhận định từ dữ liệu */}
                {statements.length > 0 && (
                  <div className="p-4 bg-[#FFFBF0] rounded-2xl border border-stone-200 space-y-2">
                    <div className="text-xs font-extrabold text-[#8A4B00] uppercase tracking-wider">
                      Nhận định chi tiết từ số liệu:
                    </div>
                    <ul className="space-y-1.5 text-xs text-stone-700 font-medium">
                      {statements.map((stmt, sIdx) => (
                        <li key={sIdx} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#2E9E5B] flex-shrink-0 mt-0.5" />
                          <span>{stmt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 2. Bảng phân loại đa chiều */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="font-extrabold text-sm text-[#2B1B0E]">
                      Bảng xếp hạng chi tiết
                    </h4>

                    {/* Bộ lọc Dimension */}
                    <div className="flex flex-wrap gap-1 bg-[#FFFBF0] p-1 rounded-xl border border-stone-200 text-xs font-bold">
                      <button
                        onClick={() => setAdvancedDimension('query')}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          advancedDimension === 'query' ? 'bg-[#FFB400] text-[#2B1B0E]' : 'text-stone-500 hover:bg-stone-100'
                        }`}
                      >
                        Từ khóa (Queries)
                      </button>
                      <button
                        onClick={() => setAdvancedDimension('page')}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          advancedDimension === 'page' ? 'bg-[#FFB400] text-[#2B1B0E]' : 'text-stone-500 hover:bg-stone-100'
                        }`}
                      >
                        Trang (Pages)
                      </button>
                      <button
                        onClick={() => setAdvancedDimension('country')}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          advancedDimension === 'country' ? 'bg-[#FFB400] text-[#2B1B0E]' : 'text-stone-500 hover:bg-stone-100'
                        }`}
                      >
                        Quốc gia
                      </button>
                      <button
                        onClick={() => setAdvancedDimension('searchAppearance')}
                        className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          advancedDimension === 'searchAppearance' ? 'bg-[#FFB400] text-[#2B1B0E]' : 'text-stone-500 hover:bg-stone-100'
                        }`}
                      >
                        Hình thức
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b-2 border-stone-200 text-stone-500 font-extrabold uppercase">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">
                            {advancedDimension === 'query'
                              ? 'Từ khóa tìm kiếm'
                              : advancedDimension === 'page'
                              ? 'Đường dẫn trang web'
                              : advancedDimension === 'country'
                              ? 'Quốc gia'
                              : 'Hình thức tìm kiếm'}
                          </th>
                          <th className="py-2.5 px-3 text-right">Lượt nhấp</th>
                          <th className="py-2.5 px-3 text-right">Lượt hiển thị</th>
                          <th className="py-2.5 px-3 text-right">CTR</th>
                          <th className="py-2.5 px-3 text-right">Vị trí TB</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-medium">
                        {analytics.tableRows.map((row, rIdx) => {
                          const name = row.keys?.[0] || 'Khác';
                          return (
                            <tr key={rIdx} className="hover:bg-[#FFFBF0] transition-colors">
                              <td className="py-2.5 px-3 text-stone-400 font-bold">{rIdx + 1}</td>
                              <td className="py-2.5 px-3 font-bold text-[#2B1B0E] max-w-xs truncate" title={name}>
                                {name}
                              </td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-[#2E9E5B]">
                                {row.clicks.toLocaleString('vi-VN')}
                              </td>
                              <td className="py-2.5 px-3 text-right text-stone-600">
                                {row.impressions.toLocaleString('vi-VN')}
                              </td>
                              <td className="py-2.5 px-3 text-right text-stone-600">
                                {Math.round((row.ctr || 0) * 1000) / 10}%
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-stone-700">
                                {Math.round((row.position || 0) * 10) / 10}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Quản lý tài khoản & danh sách website */}
                <div className="pt-4 border-t border-stone-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="font-extrabold text-sm text-[#2B1B0E]">
                      Tài khoản Google đang kết nối ({accounts.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyLink}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold text-xs transition-colors cursor-pointer"
                      >
                        {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-[#2E9E5B]" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Đã sao chép' : 'Sao chép link /cap-quyen'}</span>
                      </button>
                      <button
                        onClick={handleConnectGoogle}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FFB400] text-[#2B1B0E] font-bold text-xs hover:bg-[#E8890C] hover:text-white transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Kết nối thêm tài khoản</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {accounts.map((acc, aIdx) => (
                      <div
                        key={aIdx}
                        className="p-3 bg-[#FFFBF0] rounded-2xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-[#2B1B0E]">{acc.email}</span>
                          <span className="text-stone-500 ml-2">({acc.sites?.length || 0} website)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteAccount(acc.email)}
                            className="p-1 text-stone-400 hover:text-[#D64545] rounded"
                            title="Gỡ tài khoản này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
