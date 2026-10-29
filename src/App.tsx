/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ỨNG DỤNG "ONG NHỎ – KIỂM TRA WEBSITE"
 * Dành riêng cho chủ doanh nghiệp nhỏ tại Việt Nam.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  History,
  GitCompare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  FileText,
  Activity,
  Layers,
  HelpCircle,
  Copy,
  Download,
  Share2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Crown,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Plus,
  ExternalLink,
  Smartphone,
  ShieldCheck,
  Share,
  BarChart2,
  Key,
} from 'lucide-react';
import { Bee, BeeStatus } from './components/Bee';
import { scoreWebsite, ScoreResult, ScoreItem, ScoreGroup, FetchMetadata } from './scoring';
import {
  getHistory,
  saveHistoryRecord,
  deleteHistoryItem,
  clearAllHistory,
  findPreviousCheck,
  HistoryRecord,
  normalizeDomain,
} from './history';
import { playTingSound } from './utils/sound';
import {
  generatePdfBlobFromBlocks,
  downloadOrSharePdf,
  shareReportData,
} from './utils/pdfReport';
import { SingleReportPdf, CompareReportPdf } from './components/ReportPdf';
import { CapQuyenPage } from './components/CapQuyenPage';
import { SpellCheckCard } from './components/SpellCheckCard';
import { KeywordsTab } from './components/KeywordsTab';
import { StatsTab } from './components/StatsTab';
import { ComparisonPlanAccordion } from './components/ComparisonPlanAccordion';
import { motion, AnimatePresence } from 'motion/react';
import { HoneycombBackground } from './components/animations/HoneycombBackground';
import { GoldHexagonRain } from './components/animations/GoldHexagonRain';
import { ScanningBeeOrbit } from './components/animations/ScanningBeeOrbit';
import { ScoreCircleSpring } from './components/animations/ScoreCircleSpring';
import { Zap, ZapOff } from 'lucide-react';

type ActiveTab = 'check' | 'compare' | 'keywords' | 'stats' | 'history' | 'auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/cap-quyen') {
      return 'auth';
    }
    return 'check';
  });

  // Cấu hình âm thanh
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('ongnho_sound_enabled') !== 'false';
  });

  // Cấu hình giảm hiệu ứng (Reduced Motion)
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem('ongnho_reduce_motion');
      if (saved !== null) return saved === 'true';
      const prefersReduced =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
          : false;
      const isLowConcurrency =
        typeof navigator !== 'undefined' &&
        typeof navigator.hardwareConcurrency === 'number' &&
        navigator.hardwareConcurrency <= 4;
      return Boolean(prefersReduced || isLowConcurrency);
    } catch {
      return false;
    }
  });

  const toggleReducedMotion = () => {
    const nextVal = !reducedMotion;
    setReducedMotion(nextVal);
    try {
      localStorage.setItem('ongnho_reduce_motion', String(nextVal));
    } catch {}
  };

  // Tên nhân viên (nhớ localStorage)
  const [staffName, setStaffName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('ongnho_staff_name') || '';
  });

  // Form kiểm tra đơn
  const [urlInput, setUrlInput] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [mainKeyword, setMainKeyword] = useState('');
  const [websiteType, setWebsiteType] = useState('none');

  // Trạng thái kiểm tra đơn
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [beeStatus, setBeeStatus] = useState<BeeStatus>('thuong');

  // Kết quả kiểm tra đơn hiện tại
  const [currentScore, setCurrentScore] = useState<ScoreResult | null>(null);
  const [currentFinalUrl, setCurrentFinalUrl] = useState('');
  const [currentFetchMeta, setCurrentFetchMeta] = useState<FetchMetadata | null>(null);
  const [previousScoreDiff, setPreviousScoreDiff] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Dữ liệu nội dung website để hỗ trợ từ khóa & chính tả
  const [currentVisibleText, setCurrentVisibleText] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentH1, setCurrentH1] = useState('');
  const [currentMetaDesc, setCurrentMetaDesc] = useState('');

  // Nhận xét AI
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiReview, setAiReview] = useState<{
    strengths: string[];
    improvements: string[];
    isAutoGenerated?: boolean;
  } | null>(null);

  // Hiệu ứng đếm điểm từ 0
  const [displayScore, setDisplayScore] = useState(0);

  // Modal sao chép văn bản & chia sẻ
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const copyToastTimerRef = useRef<any>(null);
  const [canShare, setCanShare] = useState(false);

  // Danh sách lịch sử
  const [historyList, setHistoryList] = useState<HistoryRecord[]>([]);

  // Form So sánh đối thủ (Giai đoạn 5)
  const [compareCustUrl, setCompareCustUrl] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState<string[]>(['', '']);
  const [isComparing, setIsComparing] = useState(false);
  const [compareLoadingStep, setCompareLoadingStep] = useState('');
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<{
    customer: { url: string; domain: string; score: number; scoreResult: ScoreResult };
    competitors: { url: string; domain: string; score: number; scoreResult?: ScoreResult; error?: string }[];
    winnerDomain: string;
    loserItems: { ten: string; diff: number; custNote: string; compNote: string }[];
    winnerItems: { ten: string; diff: number; custNote: string }[];
    conclusions: string[];
    isAutoGenerated?: boolean;
    topPriorities?: string[];
    detailedRecommendations?: { category: string; items: string[] }[];
  } | null>(null);

  // Chẩn đoán OpenAI
  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const [openAIResult, setOpenAIResult] = useState<any>(null);

  // Ref báo cáo PDF
  const singleReportRef = useRef<HTMLDivElement>(null);
  const compareReportRef = useRef<HTMLDivElement>(null);
  const singlePdfContainerRef = useRef<HTMLDivElement>(null);
  const comparePdfContainerRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfModalUrl, setPdfModalUrl] = useState<{ url: string; fileName: string } | null>(null);
  const [lastGeneratedSinglePdf, setLastGeneratedSinglePdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [lastGeneratedComparePdf, setLastGeneratedComparePdf] = useState<{ blob: Blob; fileName: string } | null>(null);

  // Kiểm tra hỗ trợ Web Share API
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setCanShare(true);
    }
    return () => {
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    };
  }, []);

  // Tải danh sách lịch sử khi mở tab
  useEffect(() => {
    setHistoryList(getHistory());
  }, [activeTab]);

  // Hiệu ứng tăng dần điểm số từ 0 lên điểm thật
  useEffect(() => {
    if (!currentScore) {
      setDisplayScore(0);
      return;
    }
    const target = currentScore.tongDiem;
    let start = 0;
    const duration = 900;
    const stepTime = 20;
    const totalSteps = duration / stepTime;
    const increment = target / totalSteps;

    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setDisplayScore(target);
        clearInterval(timer);
      } else {
        setDisplayScore(Math.floor(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [currentScore]);

  // Bật/tắt âm thanh
  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    localStorage.setItem('ongnho_sound_enabled', String(nextVal));
    if (nextVal) playTingSound(true);
  };

  // Lưu tên nhân viên vào localStorage
  const handleStaffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStaffName(val);
    localStorage.setItem('ongnho_staff_name', val);
  };

  // Thu gọn / mở rộng nhóm tiêu chí
  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ==========================================
  // XỬ LÝ KIỂM TRA MỘT WEBSITE
  // ==========================================
  const handleCheckWebsite = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let cleanUrl = urlInput.trim();
    if (!cleanUrl) {
      setErrorMessage('Bạn hãy nhập địa chỉ website cần kiểm tra nhé (ví dụ: cuahang.vn hoặc https://cuahang.vn)');
      return;
    }

    // Tự động thêm https:// nếu người dùng chỉ nhập domain
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setCurrentScore(null);
    setAiReview(null);
    setPreviousScoreDiff(null);
    setBeeStatus('quet');

    try {
      // Bước 1: Đang tải trang
      setLoadingStep('Đang tải trang...');
      const fetchRes = await fetch('/api/fetch-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });
      const fetchData = await fetchRes.json();
      if (!fetchRes.ok || !fetchData.success) {
        throw new Error(fetchData.error || 'Không thể truy cập website này.');
      }

      const meta: FetchMetadata = {
        finalUrl: fetchData.data.finalUrl,
        statusCode: fetchData.data.statusCode,
        responseTimeMs: fetchData.data.responseTimeMs,
        htmlSizeBytes: fetchData.data.html.length,
        redirectChain: fetchData.data.redirectChain,
        xRobotsTag: fetchData.data.xRobotsTag,
        robotsTxt: fetchData.data.robotsTxt,
        robotsTxtFound: fetchData.data.robotsTxtFound,
        sitemapFound: fetchData.data.sitemapFound,
        isBlocked: fetchData.data.isBlocked,
      };

      setCurrentFinalUrl(meta.finalUrl);
      setCurrentFetchMeta(meta);

      if (meta.isBlocked) {
        setBeeStatus('buon');
        setErrorMessage('Website này chặn công cụ kiểm tra (tường lửa hoặc captcha), kết quả không đáng tin cậy.');
        setIsLoading(false);
        return;
      }

      // Bước 2: Đang chấm điểm
      setLoadingStep('Đang chấm điểm...');
      await new Promise((r) => setTimeout(r, 150));

      const scoreRes = scoreWebsite(fetchData.data.html, meta, mainKeyword);
      setCurrentScore(scoreRes);

      // Mặc định chỉ mở nhóm có lỗi (diemDat < diemToiDa), các nhóm đạt tối đa thì đóng
      const initialCollapsed: Record<string, boolean> = {};
      for (const nhom of scoreRes.nhoms) {
        initialCollapsed[nhom.id] = nhom.diemDat === nhom.diemToiDa;
      }
      setCollapsedGroups(initialCollapsed);

      // Trích xuất văn bản hiển thị và thông tin trang cho mục Từ khóa & Chính tả
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(fetchData.data.html, 'text/html');
        const clone = doc.body ? (doc.body.cloneNode(true) as HTMLElement) : null;
        if (clone) {
          clone.querySelectorAll('script, style, noscript, nav, header, footer, svg, iframe, path').forEach((el) => el.remove());
          setCurrentVisibleText(clone.textContent?.replace(/\s+/g, ' ').trim() || '');
        }
        setCurrentTitle(doc.querySelector('title')?.textContent?.trim() || '');
        setCurrentH1(doc.querySelector('h1')?.textContent?.trim() || '');
        setCurrentMetaDesc(doc.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() || '');
      } catch (e) {
        console.warn('Lỗi trích xuất text bổ trợ:', e);
      }

      // Cập nhật trạng thái ong theo điểm
      if (scoreRes.tongDiem >= 80) {
        setBeeStatus('vui');
      } else if (scoreRes.tongDiem < 50) {
        setBeeStatus('buon');
      } else {
        setBeeStatus('thuong');
      }

      // Tính điểm so với lần trước
      const prevCheck = findPreviousCheck(meta.finalUrl);
      let diff: number | null = null;
      if (prevCheck) {
        diff = scoreRes.tongDiem - prevCheck.score;
        setPreviousScoreDiff(diff);
      }

      // Phát âm thanh ting
      playTingSound(soundEnabled);
      setIsLoading(false);

      // Bước 3: AI viết nhận xét (hoặc fallback thông minh)
      setIsAiLoading(true);
      setLoadingStep('AI viết nhận xét...');

      try {
        // 11. Chọn 3 việc cần cải thiện: 3 mục mất nhiều điểm nhất (diemToiDa - diem lớn nhất,
        // ưu tiên mục điểm tối đa cao hơn nếu bằng, rồi theo thứ tự bảng). Không lấy mục không áp dụng.
        const candidateImprovements = scoreRes.allDoneItems
          .map((item, originalIndex) => ({
            item,
            lostPoints: item.diemToiDa - item.diem,
            originalIndex,
          }))
          .filter(({ item, lostPoints }) => !item.khongApDung && lostPoints > 0)
          .sort((a, b) => {
            if (b.lostPoints !== a.lostPoints) return b.lostPoints - a.lostPoints;
            if (b.item.diemToiDa !== a.item.diemToiDa) return b.item.diemToiDa - a.item.diemToiDa;
            return a.originalIndex - b.originalIndex;
          })
          .slice(0, 3)
          .map(({ item }) => ({
            id: item.id,
            ten: item.ten,
            ghiChu: item.ghiChu,
            diem: item.diem,
            diemToiDa: item.diemToiDa,
          }));

        // 11. Chọn 3 điểm mạnh: 3 mục điểm tối đa cao nhất trong các mục đạt điểm trọn vẹn,
        // không lấy quá 2 mục trong cùng 1 nhóm, không lấy mục không áp dụng,
        // site không đáng tin không lấy "gọn nhẹ/nhanh" (html_size, response_time).
        const candidateStrengthsPool = scoreRes.allDoneItems
          .map((item, originalIndex) => ({ item, originalIndex }))
          .filter(({ item }) => {
            if (item.khongApDung) return false;
            if (item.diem !== item.diemToiDa || item.diem <= 0) return false;
            if (scoreRes.khongDangTin && (item.id === 'html_size' || item.id === 'response_time')) {
              return false;
            }
            return true;
          })
          .sort((a, b) => {
            if (b.item.diemToiDa !== a.item.diemToiDa) return b.item.diemToiDa - a.item.diemToiDa;
            return a.originalIndex - b.originalIndex;
          });

        const selectedStrengths: {
          id: string;
          ten: string;
          ghiChu: string;
          diem: number;
          diemToiDa: number;
        }[] = [];
        const groupCounts: Record<string, number> = {};

        for (const { item } of candidateStrengthsPool) {
          if (selectedStrengths.length >= 3) break;
          const count = groupCounts[item.nhom] || 0;
          if (count < 2) {
            selectedStrengths.push({
              id: item.id,
              ten: item.ten,
              ghiChu: item.ghiChu,
              diem: item.diem,
              diemToiDa: item.diemToiDa,
            });
            groupCounts[item.nhom] = count + 1;
          }
        }

        const aiRes = await fetch('/api/ai-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenMien: normalizeDomain(meta.finalUrl),
            loaiWebsite: websiteType,
            strengthsItems: selectedStrengths,
            improvementsItems: candidateImprovements,
          }),
        });

        const aiJson = await aiRes.json();
        const aiData = aiJson.data || {
          strengths: selectedStrengths.map((s) => s.ghiChu),
          improvements: candidateImprovements.map((i) => i.ghiChu),
          isAutoGenerated: true,
        };
        setAiReview(aiData);

        // Lưu vào lịch sử (không lưu html)
        saveHistoryRecord({
          type: 'single',
          url: meta.finalUrl,
          customerName: customerName.trim() || undefined,
          staffName: staffName.trim() || undefined,
          score: scoreRes.tongDiem,
          items: scoreRes.allDoneItems.map((it) => ({
            id: it.id,
            ten: it.ten,
            ketQua: it.ketQua,
            diem: it.diem,
            diemToiDa: it.diemToiDa,
            ghiChu: it.ghiChu,
          })),
          aiReview: aiData,
        });

        setHistoryList(getHistory());
      } catch (aiErr) {
        console.warn('Lỗi AI nhận xét:', aiErr);
      } finally {
        setIsAiLoading(false);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Đã có lỗi xảy ra trong quá trình kiểm tra.');
      setBeeStatus('buon');
      setIsLoading(false);
    }
  };

  // ==========================================
  // XỬ LÝ SO SÁNH ĐỐI THỦ (Giai đoạn 5)
  // ==========================================
  const handleAddCompetitor = () => {
    if (competitorUrls.length < 3) {
      setCompetitorUrls([...competitorUrls, '']);
    } else {
      setCompareError('Tối đa 3 đối thủ.');
    }
  };

  const handleRemoveCompetitor = (index: number) => {
    if (competitorUrls.length > 1) {
      setCompetitorUrls(competitorUrls.filter((_, i) => i !== index));
    }
  };

  const handleCompareSites = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const custUrl = compareCustUrl.trim();
    const validCompetitors = competitorUrls.map((u) => u.trim()).filter((u) => u.length > 0);

    if (!custUrl) {
      setCompareError('Vui lòng nhập địa chỉ website của bạn/khách hàng.');
      return;
    }
    if (validCompetitors.length === 0) {
      setCompareError('Vui lòng nhập ít nhất 1 website đối thủ để so sánh.');
      return;
    }

    // 13. Kiểm tra địa chỉ trùng: nếu URL khách và bất kỳ đối thủ nào cùng tên miền gốc (normalizeDomain) thì báo lỗi
    const custDomain = normalizeDomain(custUrl);
    for (const compUrl of validCompetitors) {
      if (normalizeDomain(compUrl) === custDomain) {
        setCompareError('Hai website giống nhau.');
        return;
      }
    }

    setIsComparing(true);
    setCompareError(null);
    setCompareResult(null);
    setCompareLoadingStep('Đang chuẩn bị quét dữ liệu các trang web...');

    try {
      // Quét tối đa 2 site song song qua /api/fetch-site
      const allUrlsToFetch = [custUrl, ...validCompetitors];
      const fetchResults: {
        url: string;
        finalUrl: string;
        domain: string;
        success: boolean;
        scoreResult?: ScoreResult;
        error?: string;
      }[] = [];

      // Hàm fetch an toàn và chấm điểm (không ném lỗi để không làm hỏng cả bảng)
      const fetchAndScoreSingle = async (urlStr: string) => {
        try {
          const res = await fetch('/api/fetch-site', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlStr }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            return {
              url: urlStr,
              finalUrl: urlStr,
              domain: normalizeDomain(urlStr),
              success: false,
              error: data.error || 'Không kiểm tra được',
            };
          }
          const meta: FetchMetadata = {
            finalUrl: data.data.finalUrl,
            statusCode: data.data.statusCode,
            responseTimeMs: data.data.responseTimeMs,
            htmlSizeBytes: data.data.html.length,
            redirectChain: data.data.redirectChain,
            xRobotsTag: data.data.xRobotsTag,
            robotsTxt: data.data.robotsTxt,
            robotsTxtFound: data.data.robotsTxtFound,
            sitemapFound: data.data.sitemapFound,
            isBlocked: data.data.isBlocked,
          };
          const scored = scoreWebsite(data.data.html, meta);
          return {
            url: urlStr,
            finalUrl: meta.finalUrl,
            domain: normalizeDomain(meta.finalUrl),
            success: true,
            scoreResult: scored,
          };
        } catch (err: any) {
          return {
            url: urlStr,
            finalUrl: urlStr,
            domain: normalizeDomain(urlStr),
            success: false,
            error: err.message || 'Lỗi kết nối',
          };
        }
      };

      // Chạy 2 site song song mỗi lượt
      for (let i = 0; i < allUrlsToFetch.length; i += 2) {
        const chunk = allUrlsToFetch.slice(i, i + 2);
        setCompareLoadingStep(`Đang kiểm tra ${chunk.map((u) => normalizeDomain(u)).join(', ')}...`);
        const chunkRes = await Promise.all(chunk.map((u) => fetchAndScoreSingle(u)));
        fetchResults.push(...chunkRes);
      }

      const custData = fetchResults[0];
      if (!custData.success || !custData.scoreResult) {
        setCompareError(`Không thể kiểm tra website của bạn (${custUrl}): ${custData.error || 'Lỗi kết nối'}`);
        setIsComparing(false);
        return;
      }

      const customerObj = {
        url: custData.finalUrl,
        domain: normalizeDomain(custData.finalUrl),
        score: custData.scoreResult.tongDiem,
        scoreResult: custData.scoreResult,
      };

      const compData = fetchResults.slice(1);
      const competitorObjs = compData.map((c) => ({
        url: c.finalUrl,
        domain: c.domain,
        score: c.success && c.scoreResult ? c.scoreResult.tongDiem : 0,
        scoreResult: c.scoreResult,
        error: c.success ? undefined : (c.error || 'Không kiểm tra được'),
      }));

      // Lọc các đối thủ hợp lệ đã chấm điểm được
      const validCompetitorObjs = competitorObjs.filter(
        (c): c is typeof c & { scoreResult: ScoreResult } => !!c.scoreResult
      );

      // Rule 12: Bỏ qua trang không đáng tin khi so sánh
      const trustworthyCompetitorObjs = validCompetitorObjs.filter(
        (c) => !c.scoreResult.khongDangTin
      );

      // Xác định website chiến thắng: Rule 10: Site không đáng tin KHÔNG BAO GIỜ nhận vương miện
      const candidateWinners: { domain: string; score: number }[] = [];
      if (!customerObj.scoreResult.khongDangTin) {
        candidateWinners.push(customerObj);
      }
      for (const comp of trustworthyCompetitorObjs) {
        candidateWinners.push(comp);
      }

      const winnerDomain =
        candidateWinners.length > 0
          ? [...candidateWinners].sort((a, b) => b.score - a.score)[0].domain
          : '';

      // Tìm đối thủ có điểm cao nhất trong số các trang đáng tin cậy
      const bestComp =
        trustworthyCompetitorObjs.length > 0
          ? [...trustworthyCompetitorObjs].sort((a, b) => b.score - a.score)[0]
          : null;

      let loserItems: { id: string; ten: string; diff: number; custNote: string; compNote: string }[] = [];
      let winnerItems: { id: string; ten: string; diff: number; custNote: string }[] = [];

      // So sánh từng mục giữa khách và đối thủ tốt nhất nếu có
      if (bestComp) {
        const custItems = customerObj.scoreResult.allDoneItems;
        const compItems = bestComp.scoreResult.allDoneItems;

        const itemDiffs = custItems
          .filter((cItem) => !cItem.khongApDung)
          .map((cItem) => {
            const matchedComp = compItems.find((it) => it.id === cItem.id && !it.khongApDung);
            const compScore = matchedComp ? matchedComp.diem : 0;
            return {
              id: cItem.id,
              ten: cItem.ten,
              custScore: cItem.diem,
              compScore,
              diff: cItem.diem - compScore, // < 0: khách thua, > 0: khách hơn
              custNote: cItem.ghiChu,
              compNote: matchedComp?.ghiChu || '',
            };
          });

        // Rule 10: Nếu khách là site không đáng tin thì ẨN luôn khối "Thua"
        if (!customerObj.scoreResult.khongDangTin) {
          loserItems = itemDiffs
            .filter((i) => i.diff < 0)
            .sort((a, b) => a.diff - b.diff)
            .slice(0, 3)
            .map((i) => ({
              id: i.id,
              ten: i.ten,
              diff: Math.abs(i.diff),
              custNote: i.custNote,
              compNote: i.compNote,
            }));
        }

        // 2 chỗ khách HƠN lớn nhất
        winnerItems = itemDiffs
          .filter((i) => i.diff > 0)
          .sort((a, b) => b.diff - a.diff)
          .slice(0, 2)
          .map((i) => ({
            id: i.id,
            ten: i.ten,
            diff: i.diff,
            custNote: i.custNote,
          }));
      }

      // Gọi AI Compare hoặc fallback
      setCompareLoadingStep('Đang phân tích 3 kết luận so sánh & kế hoạch hành động...');
      let conclusions: string[] = [];
      let isAutoGenerated = true;
      let topPriorities: string[] = [];
      let detailedRecommendations: { category: string; items: string[] }[] = [];

      try {
        const aiCompRes = await fetch('/api/ai-compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerDomain: customerObj.domain,
            loserItems: loserItems.map((i) => ({
              id: i.id,
              ten: i.ten,
              compDomain: bestComp?.domain || 'đối thủ',
              diff: i.diff,
            })),
            winnerItems: winnerItems.map((i) => ({
              id: i.id,
              ten: i.ten,
              compDomain: bestComp?.domain || 'đối thủ',
              diff: i.diff,
            })),
          }),
        });
        const aiCompJson = await aiCompRes.json();
        if (aiCompJson.data?.conclusions) {
          conclusions = aiCompJson.data.conclusions;
          isAutoGenerated = !!aiCompJson.data.isAutoGenerated;
          topPriorities = aiCompJson.data.topPriorities || [];
          detailedRecommendations = aiCompJson.data.detailedRecommendations || [];
        }
      } catch (err) {
        console.warn('Lỗi gọi AI Compare:', err);
      }

      if (conclusions.length === 0) {
        if (bestComp) {
          if (customerObj.score >= bestComp.score) {
            conclusions = [
              `Website của bạn đạt ${customerObj.score} điểm, vượt mặt đối thủ ${bestComp.domain} (${bestComp.score} điểm).`,
              `Trang của bạn tối ưu tốc độ và hiển thị trên điện thoại tốt hơn, giúp khách ở lại lâu hơn.`,
              `Hãy tiếp tục bổ sung bài viết mới và từ khóa dịch vụ để nới rộng khoảng cách dẫn đầu.`,
            ];
          } else {
            conclusions = [
              `Đối thủ ${bestComp.domain} đạt ${bestComp.score} điểm, đang dẫn trước bạn ${bestComp.score - customerObj.score} điểm.`,
              `Đối thủ có hình ảnh đại diện và lời mời bắt mắt khi gửi link qua Zalo, bên bạn chưa có.`,
              `Chỉ cần sửa lại ảnh đại diện và thêm dòng mô tả Meta Description, bạn sẽ nhanh chóng bắt kịp đối thủ.`,
            ];
          }
        } else {
          conclusions = [
            `Website của bạn đạt ${customerObj.score} điểm.`,
            `Chưa có website đối thủ đáng tin cậy nào để đối chiếu toàn diện.`,
            `Hãy tiếp tục tối ưu hóa các tiêu chuẩn kỹ thuật và nội dung để phục vụ khách hàng tốt nhất.`,
          ];
        }
      }

      const resFinal = {
        customer: customerObj,
        competitors: competitorObjs,
        winnerDomain,
        loserItems,
        winnerItems,
        conclusions,
        isAutoGenerated,
        topPriorities,
        detailedRecommendations,
      };

      setCompareResult(resFinal);
      playTingSound(soundEnabled);

      // Lưu kết quả so sánh vào Lịch sử
      saveHistoryRecord({
        type: 'compare',
        url: customerObj.url,
        customerName: customerName.trim() || undefined,
        staffName: staffName.trim() || undefined,
        score: customerObj.score,
        compareData: {
          competitors: competitorObjs.map((c) => ({
            url: c.url,
            domain: c.domain,
            score: c.score,
          })),
          conclusions,
          isAutoGenerated,
        },
      });

      setHistoryList(getHistory());
    } catch (err: any) {
      setCompareError(err.message || 'Đã có lỗi xảy ra khi so sánh website.');
    } finally {
      setIsComparing(false);
      setCompareLoadingStep('');
    }
  };

  // ==========================================
  // XUẤT VĂN BẢN ĐỂ COPY
  // ==========================================
  const generateTextReport = () => {
    if (!currentScore) return '';
    const dateStr = new Date().toLocaleDateString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const passedItems = currentScore.allDoneItems.filter((i) => !i.khongApDung && i.ketQua === 'dat');
    const needFixItems = currentScore.allDoneItems.filter((i) => !i.khongApDung && i.ketQua !== 'dat');
    const nonApplicableItems = currentScore.allDoneItems.filter((i) => i.khongApDung);

    let text = `BÁO CÁO KIỂM TRA WEBSITE - NHÓM ONG NHỎ\n`;
    text += `==========================================\n`;
    if (urlInput.trim()) {
      text += `• Địa chỉ bạn nhập: ${urlInput.trim()}\n`;
    }
    text += `• Địa chỉ cuối cùng sau khi mở: ${currentFinalUrl || urlInput}`;
    if (urlInput.trim() && normalizeDomain(currentFinalUrl) !== normalizeDomain(urlInput)) {
      text += ` (Khác với địa chỉ đã gõ: ${urlInput.trim()})`;
    }
    text += `\n`;
    if (customerName) text += `• Khách hàng: ${customerName}\n`;
    if (staffName) text += `• Nhân viên đánh giá: ${staffName}\n`;
    text += `• Ngày giờ kiểm tra: ${dateStr}\n`;
    if (currentScore.diemToiDaKhaDung < 100) {
      text += `• ĐIỂM TỔNG KẾT: ${currentScore.tongDiem}/100 ĐIỂM (quy đổi từ ${currentScore.diemThucTe}/${currentScore.diemToiDaKhaDung}đ)\n`;
    } else {
      text += `• ĐIỂM TỔNG KẾT: ${currentScore.tongDiem}/100 ĐIỂM\n`;
    }
    if (currentScore.coCoDo && currentScore.tongDiem === 40) {
      text += `  (Giới hạn 40 điểm do chặn hiển thị Google)\n`;
    }
    if (currentScore.khongDangTin) {
      text += `  * Chú ý: Chưa đọc được nội dung thật của trang này, kết quả chỉ mang tính tham khảo\n`;
    }
    if (previousScoreDiff !== null) {
      text += `• So với lần kiểm tra trước: ${previousScoreDiff >= 0 ? `+${previousScoreDiff}` : previousScoreDiff} điểm\n`;
    }
    text += `==========================================\n\n`;

    if (aiReview) {
      text += `3 ĐIỂM MẠNH NỔI BẬT:\n`;
      aiReview.strengths.forEach((s, idx) => {
        text += ` ${idx + 1}. ${s}\n`;
      });
      text += `\n3 ĐIỂM CẦN CẢI THIỆN NGAY:\n`;
      aiReview.improvements.forEach((imp, idx) => {
        text += ` ${idx + 1}. ${imp}\n`;
      });
      text += `\n`;
    }

    text += `TÓM TẮT CHECKLIST:\n`;
    text += `✓ Đã đạt (${passedItems.length} mục):\n`;
    passedItems.forEach((it) => {
      text += `  - ${it.ten} (${it.diem}/${it.diemToiDa}đ): ${it.ghiChu}\n`;
    });

    if (needFixItems.length > 0) {
      text += `\n! Cần khắc phục (${needFixItems.length} mục):\n`;
      needFixItems.forEach((it) => {
        text += `  - ${it.ten} (${it.diem}/${it.diemToiDa}đ): ${it.ghiChu}\n`;
      });
    }

    if (nonApplicableItems.length > 0) {
      text += `\n- Không áp dụng (${nonApplicableItems.length} mục):\n`;
      nonApplicableItems.forEach((it) => {
        text += `  - Không áp dụng: ${it.ten} (${it.ghiChu})\n`;
      });
    }

    text += `\n------------------------------------------\n`;
    text += `Báo cáo bởi nhóm Ong Nhỏ • Dành riêng cho doanh nghiệp Việt Nam\n`;
    return text;
  };

  const fallbackCopyText = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  };

  const handleCopyReport = () => {
    const text = generateTextReport();
    const showToast = () => {
      setCopyToast(true);
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = setTimeout(() => setCopyToast(false), 2500);
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showToast).catch(() => {
        if (fallbackCopyText(text)) showToast();
      });
    } else {
      if (fallbackCopyText(text)) showToast();
    }
  };

  // ==========================================
  // XUẤT FILE PDF A4 CHUẨN ĐẸP
  // ==========================================
  const handleExportPdf = async () => {
    if (!currentScore || !singlePdfContainerRef.current) return;
    setIsExportingPdf(true);
    setPdfError(null);
    try {
      const cleanDomain = normalizeDomain(currentFinalUrl || urlInput || 'website').replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `OngNho_BaoCao_${cleanDomain}.pdf`;
      const blob = await generatePdfBlobFromBlocks(singlePdfContainerRef.current);
      setLastGeneratedSinglePdf({ blob, fileName });
      const res = await downloadOrSharePdf(blob, fileName);
      if (res.method === 'modal_required' && res.blobUrl) {
        setPdfModalUrl({ url: res.blobUrl, fileName });
      }
    } catch (err: any) {
      console.error('Lỗi xuất PDF:', err);
      setPdfError(err.message || 'Lỗi xử lý tài liệu');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportComparePdf = async () => {
    if (!compareResult || !comparePdfContainerRef.current) return;
    setIsExportingPdf(true);
    setPdfError(null);
    try {
      const cleanDomain = normalizeDomain(compareResult.customer.domain || 'website').replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `OngNho_SoSanh_${cleanDomain}.pdf`;
      const blob = await generatePdfBlobFromBlocks(comparePdfContainerRef.current);
      setLastGeneratedComparePdf({ blob, fileName });
      const res = await downloadOrSharePdf(blob, fileName);
      if (res.method === 'modal_required' && res.blobUrl) {
        setPdfModalUrl({ url: res.blobUrl, fileName });
      }
    } catch (err: any) {
      console.error('Lỗi xuất PDF So sánh:', err);
      setPdfError(err.message || 'Lỗi xử lý tài liệu');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Chia sẻ bằng Web Share API
  const handleShare = async () => {
    if (lastGeneratedSinglePdf && typeof navigator !== 'undefined' && (navigator as any).canShare) {
      try {
        const file = new File([lastGeneratedSinglePdf.blob], lastGeneratedSinglePdf.fileName, { type: 'application/pdf' });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({
            files: [file],
            title: 'Báo cáo Ong Nhỏ',
            text: `Báo cáo kiểm tra website: ${normalizeDomain(currentFinalUrl)}`,
          });
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    const text = `Website ${normalizeDomain(currentFinalUrl)} đạt ${currentScore?.tongDiem || 0}/100 điểm trên công cụ kiểm tra Ong Nhỏ!`;
    const shared = await shareReportData('Báo cáo Ong Nhỏ', text, window.location.href);
    if (!shared) {
      handleCopyReport();
    }
  };

  // Xem lại 1 mục từ lịch sử
  const handleViewHistoryItem = (item: HistoryRecord) => {
    if (item.type === 'single') {
      setActiveTab('check');
      setUrlInput(item.url);
      setCurrentFinalUrl(item.url);
      setCustomerName(item.customerName || '');
      setStaffName(item.staffName || '');
      if (item.aiReview) setAiReview(item.aiReview);
      if (item.scoreDiffFromPrevious !== undefined) {
        setPreviousScoreDiff(item.scoreDiffFromPrevious);
      }

      // Tái tạo lại cấu trúc ScoreResult đơn giản
      const dummyDoneItems: ScoreItem[] = (item.items || []).map((it) => ({
        id: it.id,
        nhom: it.id.includes('title') || it.id.includes('h1') || it.id.includes('desc') || it.id.includes('alt') || it.id.includes('word') || it.id.includes('keyword') ? 'noi_dung' : it.id.includes('view') || it.id.includes('icon') || it.id.includes('size') || it.id.includes('time') ? 'di_dong' : it.id.includes('og') || it.id.includes('twitter') ? 'mang_xa_hoi' : 'ky_thuat',
        ten: it.ten,
        diemToiDa: it.diemToiDa,
        diem: it.diem,
        ketQua: it.ketQua,
        ghiChu: it.ghiChu,
      }));

      // Nhóm lại
      const nhoms: ScoreGroup[] = [
        { id: 'noi_dung', ten: 'Nội dung trang', diemToiDa: 40, diemDat: 0, items: [] },
        { id: 'di_dong', ten: 'Di động & Tốc độ', diemToiDa: 20, diemDat: 0, items: [] },
        { id: 'ky_thuat', ten: 'Kỹ thuật & Tìm kiếm', diemToiDa: 25, diemDat: 0, items: [] },
        { id: 'mang_xa_hoi', ten: 'Mạng xã hội & Chia sẻ', diemToiDa: 15, diemDat: 0, items: [] },
      ];

      dummyDoneItems.forEach((it) => {
        const g = nhoms.find((n) => n.id === it.nhom);
        if (g) {
          g.items.push(it);
          g.diemDat += it.diem;
        }
      });

      setCurrentScore({
        tongDiem: item.score,
        diemThucTe: item.score,
        diemToiDaKhaDung: 100,
        nhoms,
        allDoneItems: dummyDoneItems,
        coCoDo: item.score <= 40,
        coCanhBaoVang: false,
        khongDangTin: false,
        soTu: 0,
        soAnh: 0,
        soAnhThieuAlt: 0,
        soTheH1: 1,
        soTheH2: 1,
      });

      setBeeStatus(item.score >= 80 ? 'vui' : item.score < 50 ? 'buon' : 'thuong');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setActiveTab('compare');
      setCompareCustUrl(item.url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Xóa 1 mục lịch sử
  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteHistoryItem(id);
    setHistoryList(updated);
  };

  // Xóa toàn bộ lịch sử có xác nhận
  const handleClearAll = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách lịch sử kiểm tra không?')) {
      clearAllHistory();
      setHistoryList([]);
    }
  };

  // Màu sắc theo thang điểm
  const getScoreColor = (sc: number) => {
    if (sc >= 80) return '#2E9E5B'; // Xanh
    if (sc >= 50) return '#E8A100'; // Cam
    return '#D64545'; // Đỏ
  };

  const getScoreBg = (sc: number) => {
    if (sc >= 80) return 'bg-emerald-50 text-[#2E9E5B] border-emerald-200';
    if (sc >= 50) return 'bg-amber-50 text-[#E8A100] border-amber-200';
    return 'bg-red-50 text-[#D64545] border-red-200';
  };

  const getScoreLabel = (sc: number) => {
    if (sc >= 85) return 'Rất Tốt';
    if (sc >= 75) return 'Khá Tốt';
    if (sc >= 50) return 'Trung Bình';
    return 'Cần Nâng Cấp';
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] text-[#2B1B0E] flex flex-col font-['Be_Vietnam_Pro',sans-serif] relative">
      {/* NỀN HỌA TIẾT TỔ ONG MỜ ẢO */}
      <HoneycombBackground reducedMotion={reducedMotion} />

      {/* MƯA LỤC GIÁC VÀNG KHI ĐIỂM >= 90 */}
      <GoldHexagonRain
        active={Boolean(currentScore && currentScore.tongDiem >= 90)}
        reducedMotion={reducedMotion}
      />

      {/* HEADER: Chiều cao cố định 64px (h-16) trên điện thoại và 72px (lg:h-[72px]) trên máy tính */}
      <header className="sticky top-0 z-30 bg-[#FFFBF0]/95 backdrop-blur-md border-b border-[#2B1B0E]/10 h-16 lg:h-[72px] transition-colors">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 h-16 lg:h-[72px] flex items-center justify-between gap-3 flex-nowrap">
          {/* Logo & Tên thương hiệu: Ong bay vào và đáp xuống, mọi chữ trên 1 dòng */}
          <motion.div
            initial={reducedMotion ? undefined : { y: -22, opacity: 0, scale: 0.88 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 14, stiffness: 140 }}
            onClick={() => setActiveTab('check')}
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group flex-shrink-0 whitespace-nowrap"
          >
            <Bee status={beeStatus} size={40} className="w-10 h-10 flex-shrink-0" />
            <div className="whitespace-nowrap flex flex-col justify-center">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-xl lg:text-2xl font-black tracking-tight text-[#2B1B0E] whitespace-nowrap leading-none">
                  Ong Nhỏ
                </span>
                <span className="hidden xl:inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full bg-[#FFB400] text-[#2B1B0E] whitespace-nowrap">
                  Chấm điểm website
                </span>
              </div>
              <p className="hidden xl:block text-xs text-[#2B1B0E]/80 font-medium whitespace-nowrap mt-0.5">
                Dễ hiểu cho chủ shop • Không dùng từ kỹ thuật khó
              </p>
            </div>
          </motion.div>

          {/* Thanh điều hướng máy tính (chỉ hiện từ lg: 1024px trở lên), nhãn tab 1 dòng */}
          <div
            role="tablist"
            aria-label="Điều hướng chính"
            className="hidden lg:flex items-center gap-1 bg-[#FFF3C4]/70 p-1.5 rounded-2xl border border-[#2B1B0E]/10 flex-shrink-0 whitespace-nowrap"
          >
            <button
              role="tab"
              aria-selected={activeTab === 'check'}
              onClick={() => setActiveTab('check')}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00] whitespace-nowrap ${
                activeTab === 'check' ? 'text-[#2B1B0E]' : 'text-[#2B1B0E]/80 hover:text-[#2B1B0E]'
              }`}
            >
              {activeTab === 'check' && (
                <motion.span
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#FFB400] rounded-xl shadow-xs -z-10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                />
              )}
              <Search className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">Kiểm tra</span>
            </button>

            <button
              role="tab"
              aria-selected={activeTab === 'compare'}
              onClick={() => setActiveTab('compare')}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00] whitespace-nowrap ${
                activeTab === 'compare' ? 'text-[#2B1B0E]' : 'text-[#2B1B0E]/80 hover:text-[#2B1B0E]'
              }`}
            >
              {activeTab === 'compare' && (
                <motion.span
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#FFB400] rounded-xl shadow-xs -z-10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                />
              )}
              <GitCompare className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">So sánh</span>
            </button>

            <button
              role="tab"
              aria-selected={activeTab === 'keywords'}
              onClick={() => setActiveTab('keywords')}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00] whitespace-nowrap ${
                activeTab === 'keywords' ? 'text-[#2B1B0E]' : 'text-[#2B1B0E]/80 hover:text-[#2B1B0E]'
              }`}
            >
              {activeTab === 'keywords' && (
                <motion.span
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#FFB400] rounded-xl shadow-xs -z-10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                />
              )}
              <Sparkles className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">Từ khóa</span>
            </button>

            <button
              role="tab"
              aria-selected={activeTab === 'stats'}
              onClick={() => setActiveTab('stats')}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00] whitespace-nowrap ${
                activeTab === 'stats' ? 'text-[#2B1B0E]' : 'text-[#2B1B0E]/80 hover:text-[#2B1B0E]'
              }`}
            >
              {activeTab === 'stats' && (
                <motion.span
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#FFB400] rounded-xl shadow-xs -z-10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                />
              )}
              <Activity className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">Thống kê</span>
            </button>

            <button
              role="tab"
              aria-selected={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00] whitespace-nowrap ${
                activeTab === 'history' ? 'text-[#2B1B0E]' : 'text-[#2B1B0E]/80 hover:text-[#2B1B0E]'
              }`}
            >
              {activeTab === 'history' && (
                <motion.span
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#FFB400] rounded-xl shadow-xs -z-10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                />
              )}
              <History className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">Lịch sử</span>
              {historyList.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-[#8A4B00] text-white text-[11px] font-bold rounded-full whitespace-nowrap">
                  {historyList.length}
                </span>
              )}
            </button>
          </div>

          {/* Các nút điều khiển tròn 44px: Giảm hiệu ứng & Bật/tắt âm thanh (chỉ icon, aria-label, tooltip) */}
          <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
            <button
              type="button"
              onClick={toggleReducedMotion}
              aria-label={reducedMotion ? 'Bật hiệu ứng động đầy đủ' : 'Giảm hiệu ứng động'}
              title={reducedMotion ? 'Đang giảm hiệu ứng (bấm để bật đầy đủ)' : 'Đang bật hiệu ứng động mượt mà (bấm để giảm)'}
              className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border transition-all cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00] flex-shrink-0 ${
                reducedMotion
                  ? 'bg-amber-100 border-[#FFB400] text-[#8A4B00]'
                  : 'bg-[#FFF3C4] border-[#FFB400] text-[#8A4B00] hover:bg-[#FFB400] hover:text-[#2B1B0E]'
              }`}
            >
              {reducedMotion ? <ZapOff className="w-5 h-5" aria-hidden="true" /> : <Sparkles className="w-5 h-5" aria-hidden="true" />}
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Tắt âm thanh thông báo' : 'Bật âm thanh thông báo'}
              title={soundEnabled ? 'Đang bật chuông ting (bấm để tắt)' : 'Đang tắt chuông (bấm để bật)'}
              className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border transition-all cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00] flex-shrink-0 ${
                soundEnabled
                  ? 'bg-[#FFF3C4] border-[#FFB400] text-[#8A4B00] hover:bg-[#FFB400] hover:text-[#2B1B0E]'
                  : 'bg-stone-100 border-stone-300 text-stone-500 hover:bg-stone-200'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" aria-hidden="true" /> : <VolumeX className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {/* NỘI DUNG CHÍNH (Tối đa 1100px) */}
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 lg:pb-12">
        <AnimatePresence mode="wait">
          {/* ========================================================= */}
          {/* TAB 1: MÀN HÌNH KIỂM TRA (A & B) */}
          {/* ========================================================= */}
          {activeTab === 'check' && (
            <motion.div
              key="check"
              initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-8"
            >
            {/* Tiêu đề lớn canh trái với hiệu ứng xuất hiện từng cụm chữ (stagger) */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FFF3C4] text-[#8A4B00] text-xs font-bold uppercase tracking-wider border border-[#FFB400]/40">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                Đơn giản • Nhanh chóng • Không thuật ngữ khó
              </div>
              <motion.h1
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
                }}
                initial={reducedMotion ? undefined : 'hidden'}
                animate="visible"
                className="text-3xl sm:text-4xl md:text-5xl font-black text-[#2B1B0E] tracking-tight leading-tight"
              >
                {['Website', 'của bạn', 'được bao nhiêu', 'điểm?'].map((phrase, idx) => (
                  <motion.span
                    key={idx}
                    variants={{
                      hidden: { opacity: 0, y: 12 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: 'easeOut' } },
                    }}
                    className={`inline-block mr-2.5 ${idx === 3 ? 'text-[#8A4B00]' : ''}`}
                  >
                    {phrase}
                  </motion.span>
                ))}
              </motion.h1>
              <p className="text-base sm:text-lg text-[#2B1B0E]/80 font-normal max-w-2xl leading-relaxed">
                Nhập địa chỉ website để chú Ong Nhỏ bay vào kiểm tra tốc độ, hiển thị trên điện thoại,
                độ chuẩn khi xuất hiện trên Google và hình ảnh khi gửi link qua Zalo.
              </p>
            </div>

            {/* Khung nhập liệu */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-[#2B1B0E]/15 shadow-sm space-y-6">
              <form onSubmit={handleCheckWebsite} className="space-y-5">
                {/* Ô nhập URL */}
                <div className="space-y-2">
                  <label htmlFor="site-url-input" className="block text-sm sm:text-base font-bold text-[#2B1B0E]">
                    Địa chỉ website của bạn <span className="text-[#D64545]">*</span>
                  </label>
                  <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-stone-500">
                        <Globe className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <input
                        id="site-url-input"
                        type="url"
                        inputMode="url"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        value={urlInput}
                        onChange={(e) => {
                          setUrlInput(e.target.value);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder="vidu.vn hoặc https://cuahangcuaban.com"
                        className="w-full pl-12 pr-4 py-3.5 sm:py-4 min-h-[48px] rounded-2xl bg-[#FFFBF0] border-2 border-[#2B1B0E]/15 text-[#2B1B0E] font-medium placeholder:text-stone-500 focus-visible:outline-none focus:border-[#FFB400] focus:ring-4 focus:ring-[#FFB400]/30 shadow-[0_0_0_0_rgba(255,180,0,0)] focus:shadow-[0_0_18px_rgba(255,180,0,0.25)] text-base transition-all"
                        disabled={isLoading}
                      />
                    </div>
                    <motion.button
                      whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                      type="submit"
                      disabled={isLoading}
                      className="relative overflow-hidden w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-3 px-8 py-3.5 sm:py-4 rounded-2xl bg-[#FFB400] hover:bg-[#8A4B00] text-[#2B1B0E] hover:text-white font-extrabold text-base transition-all active:scale-[0.98] shadow-sm disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
                    >
                      {/* Ánh sáng quét nhẹ (shimmer) mỗi vài giây */}
                      {!reducedMotion && (
                        <span className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none animate-button-shimmer" />
                      )}
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                          <span>Đang kiểm tra...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-5 h-5" aria-hidden="true" />
                          <span>Kiểm tra ngay</span>
                        </>
                      )}
                    </motion.button>
                  </div>

                  {/* Nút "Trở lại trang web" ngay dưới nút Kiểm tra ngay (mở tab mới, ẩn khi URL chưa hợp lệ) */}
                  {(() => {
                    const trimmed = urlInput.trim();
                    let isValid = false;
                    if (trimmed) {
                      try {
                        const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
                        const parsed = new URL(candidate);
                        isValid = Boolean(parsed.hostname && parsed.hostname.includes('.'));
                      } catch {
                        isValid = false;
                      }
                    }
                    if (!isValid) return null;
                    const finalTarget = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
                    return (
                      <div className="flex justify-end pt-1">
                        <a
                          href={finalTarget}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-sm font-bold text-[#8A4B00] bg-[#FFF3C4] hover:bg-[#FFB400]/40 border border-[#FFB400]/50 transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
                        >
                          <ExternalLink className="w-4 h-4" aria-hidden="true" />
                          <span>Trở lại trang web</span>
                        </a>
                      </div>
                    );
                  })()}

                  {/* Nút gợi ý test nhanh */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[#2B1B0E]/70 font-medium">
                    <span>Thử nhanh:</span>
                    <button
                      type="button"
                      onClick={() => setUrlInput('https://www.mozilla.org')}
                      className="px-2.5 py-1 rounded-lg bg-[#FFF3C4] hover:bg-[#FFB400]/40 text-[#2B1B0E] font-semibold transition-colors cursor-pointer"
                    >
                      mozilla.org (site chuẩn)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrlInput('https://example.com')}
                      className="px-2.5 py-1 rounded-lg bg-[#FFF3C4] hover:bg-[#FFB400]/40 text-[#2B1B0E] font-semibold transition-colors cursor-pointer"
                    >
                      example.com (site thiếu thẻ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrlInput('https://khong-ton-tai-abc123.vn')}
                      className="px-2.5 py-1 rounded-lg bg-[#FFF3C4] hover:bg-[#FFB400]/40 text-[#2B1B0E] font-semibold transition-colors cursor-pointer"
                    >
                      khong-ton-tai-abc123.vn (lỗi DNS)
                    </button>
                  </div>
                </div>

                {/* 3 ô nhập phụ + 1 select loại website */}
                <div className="pt-2 border-t border-[#2B1B0E]/10">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#2B1B0E]/70">
                      Thông tin bổ sung (không bắt buộc)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* Tên khách hàng */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#2B1B0E]/80">Tên khách hàng</label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="VD: Tiệm Bánh Hoa Mai"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFBF0] border border-[#2B1B0E]/20 text-sm font-medium text-[#2B1B0E] focus:outline-none focus:border-[#FFB400]"
                      />
                    </div>

                    {/* Tên nhân viên (nhớ localStorage) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#2B1B0E]/80">Tên nhân viên</label>
                        <span className="text-xs text-amber-900 font-semibold bg-[#FFF3C4] px-2 py-0.5 rounded">
                          Tự nhớ trên máy
                        </span>
                      </div>
                      <input
                        type="text"
                        value={staffName}
                        onChange={handleStaffChange}
                        placeholder="VD: Nguyễn Văn A"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFBF0] border border-[#2B1B0E]/20 text-sm font-medium text-[#2B1B0E] focus:outline-none focus:border-[#FFB400]"
                      />
                    </div>

                    {/* Từ khóa chính */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#2B1B0E]/80">Từ khóa chính</label>
                      <input
                        type="text"
                        value={mainKeyword}
                        onChange={(e) => setMainKeyword(e.target.value)}
                        placeholder="VD: bánh sinh nhật đà nẵng"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFBF0] border border-[#2B1B0E]/20 text-sm font-medium text-[#2B1B0E] focus:outline-none focus:border-[#FFB400]"
                      />
                    </div>

                    {/* Loại website */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#2B1B0E]/80">Loại hình website</label>
                      <select
                        value={websiteType}
                        onChange={(e) => setWebsiteType(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFBF0] border border-[#2B1B0E]/20 text-sm font-medium text-[#2B1B0E] focus:outline-none focus:border-[#FFB400] cursor-pointer"
                      >
                        <option value="none">Không chọn</option>
                        <option value="ecommerce">Bán hàng online</option>
                        <option value="local">Dịch vụ địa phương</option>
                        <option value="corporate">Giới thiệu doanh nghiệp</option>
                        <option value="blog">Tin tức - blog</option>
                      </select>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Trạng thái Loading với ong bay quanh quỹ đạo và thanh tiến trình chạy mượt */}
            {isLoading && (
              <ScanningBeeOrbit loadingStep={loadingStep} reducedMotion={reducedMotion} />
            )}

            {/* Báo lỗi rõ ràng kèm nút Thử lại */}
            {errorMessage && (
              <div className="bg-red-50 rounded-3xl p-6 border-2 border-[#D64545]/30 text-[#D64545] space-y-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-6 h-6 flex-shrink-0 mt-0.5 text-[#D64545]" aria-hidden="true" />
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-base text-[#D64545]">Không thể kiểm tra website</h4>
                    <p className="text-sm font-medium leading-relaxed text-red-900">{errorMessage}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-9">
                  <button
                    type="button"
                    onClick={() => handleCheckWebsite()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D64545] hover:bg-[#B91C1C] text-white font-bold text-sm transition-colors cursor-pointer inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Thử lại
                  </button>
                </div>
              </div>
            )}

            {/* Trạng thái chưa kiểm tra: Hướng dẫn 3 bước ngắn gọn */}
            {!currentScore && !isLoading && !errorMessage && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#2B1B0E]/15 shadow-sm space-y-6">
                <div className="text-center max-w-lg mx-auto space-y-2">
                  <h3 className="text-lg sm:text-xl font-black text-[#2B1B0E]">
                    Hướng dẫn 3 bước kiểm tra website nhanh
                  </h3>
                  <p className="text-sm text-[#2B1B0E]/80">
                    Đánh giá toàn diện 24 tiêu chí chuẩn SEO, tốc độ, di động và trải nghiệm khách hàng hoàn toàn miễn phí.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-[#FFFBF0] rounded-2xl p-5 border border-[#2B1B0E]/10 space-y-2 text-center flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-[#FFB400] text-[#2B1B0E] font-black flex items-center justify-center text-base shadow-sm">
                      1
                    </div>
                    <h4 className="font-extrabold text-[#2B1B0E] text-base">Nhập địa chỉ web</h4>
                    <p className="text-sm text-[#2B1B0E]/80">
                      Gõ tên miền website cần kiểm tra (hệ thống tự động thêm https://).
                    </p>
                  </div>

                  <div className="bg-[#FFFBF0] rounded-2xl p-5 border border-[#2B1B0E]/10 space-y-2 text-center flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-[#FFB400] text-[#2B1B0E] font-black flex items-center justify-center text-base shadow-sm">
                      2
                    </div>
                    <h4 className="font-extrabold text-[#2B1B0E] text-base">Bấm Kiểm tra ngay</h4>
                    <p className="text-sm text-[#2B1B0E]/80">
                      Hệ thống tải trang thật, quét mã nguồn và kiểm tra tự động trong 3 giây.
                    </p>
                  </div>

                  <div className="bg-[#FFFBF0] rounded-2xl p-5 border border-[#2B1B0E]/10 space-y-2 text-center flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-[#FFB400] text-[#2B1B0E] font-black flex items-center justify-center text-base shadow-sm">
                      3
                    </div>
                    <h4 className="font-extrabold text-[#2B1B0E] text-base">Xem điểm & cải thiện</h4>
                    <p className="text-sm text-[#2B1B0E]/80">
                      Xem thang điểm 100, 3 điểm mạnh, 3 việc cải thiện và xuất PDF A4 chuyên nghiệp.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* KẾT QUẢ CHẤM ĐIỂM CHI TIẾT (B) */}
            {/* ========================================================= */}
            {currentScore && (
              <div ref={singleReportRef} className="space-y-6">
                {/* CỜ ĐỎ nếu trang noindex hoặc chặn robots (KHÔNG animate-bounce) */}
                {currentScore.coCoDo && (
                  <div className="bg-red-50 rounded-2xl p-4 sm:p-5 border-2 border-[#D64545] text-[#D64545] flex items-start gap-3.5">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h4 className="font-black text-base uppercase tracking-wide">
                        CỜ ĐỎ: Trang này đang bảo Google đừng hiển thị!
                      </h4>
                      <p className="text-xs sm:text-sm font-medium mt-1 leading-relaxed text-red-900">
                        {currentScore.coDoLyDo ||
                          'Website đang chứa thẻ noindex hoặc chặn trong robots.txt khiến khách hàng tìm kiếm trên Google không thể thấy bạn. Điểm số tối đa bị giới hạn ở 40 điểm.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* CẢNH BÁO VÀNG nếu trang dùng JavaScript */}
                {currentScore.coCanhBaoVang && (
                  <div className="bg-amber-50 rounded-2xl p-4 border border-[#E8A100] text-amber-900 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[#8A4B00] mt-0.5" aria-hidden="true" />
                    <div>
                      <h4 className="font-bold text-sm">
                        Cảnh báo: Website tải nội dung bằng JavaScript
                      </h4>
                      <p className="text-xs mt-0.5 text-amber-800">
                        {currentScore.canhBaoVangLyDo}
                      </p>
                    </div>
                  </div>
                )}

                {/* BANNER VÀNG nếu trang không đáng tin cậy */}
                {currentScore.khongDangTin && (
                  <div className="bg-amber-50 rounded-2xl p-4 sm:p-5 border-2 border-[#E8A100] text-amber-950 flex items-start gap-3.5">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0 text-[#8A4B00] mt-0.5" aria-hidden="true" />
                    <div>
                      <h4 className="font-bold text-sm sm:text-base text-amber-900">
                        Kết quả chỉ mang tính tham khảo
                      </h4>
                      <p className="text-xs sm:text-sm font-medium mt-1 leading-relaxed text-amber-800">
                        Chưa đọc được nội dung thật của trang này, kết quả chỉ mang tính tham khảo
                      </p>
                    </div>
                  </div>
                )}

                {/* BỐ CỤC 2 CỘT CHO DESKTOP: Cột trái cố định khi cuộn chuột, cột phải chi tiết */}
                <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start space-y-6 lg:space-y-0">
                  {/* CỘT TRÁI (Sticky Scoreboard trên desktop) */}
                  <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
                    <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-[#2B1B0E]/15 shadow-sm space-y-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        {/* Vòng tròn điểm số chạy đầy dần & số đếm tăng từ 0 */}
                        <ScoreCircleSpring
                          score={currentScore.tongDiem}
                          maxScoreAvailable={currentScore.diemToiDaKhaDung}
                          actualScore={currentScore.diemThucTe}
                          reducedMotion={reducedMotion}
                          onScoreReached={() => playTingSound(soundEnabled)}
                        />

                        <div className="space-y-2 w-full">
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <span
                              className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border ${getScoreBg(
                                currentScore.tongDiem
                              )}`}
                            >
                              Xếp loại: {getScoreLabel(currentScore.tongDiem)}
                            </span>
                            {previousScoreDiff !== null && (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold ${
                                  previousScoreDiff > 0
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : previousScoreDiff < 0
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-stone-100 text-stone-700'
                                }`}
                              >
                                {previousScoreDiff > 0 ? (
                                  <>
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    Tăng +{previousScoreDiff}đ
                                  </>
                                ) : previousScoreDiff < 0 ? (
                                  <>
                                    <TrendingDown className="w-3.5 h-3.5" />
                                    Giảm {previousScoreDiff}đ
                                  </>
                                ) : (
                                  <>
                                    <Minus className="w-3.5 h-3.5" />
                                    Không đổi
                                  </>
                                )}
                              </span>
                            )}
                          </div>

                          <h2 className="text-xl sm:text-2xl font-black text-[#2B1B0E] break-all">
                            {normalizeDomain(currentFinalUrl)}
                          </h2>

                          {currentScore.diemToiDaKhaDung < 100 && (
                            <span className="inline-block text-xs font-bold text-[#8A4B00] bg-[#FFF3C4] px-2.5 py-1 rounded-xl border border-[#FFB400]/40">
                              {currentScore.tongDiem}/100 (quy đổi từ {currentScore.diemThucTe}/{currentScore.diemToiDaKhaDung})
                            </span>
                          )}

                          <div className="text-xs text-[#2B1B0E]/80 pt-1 text-left bg-[#FFFBF0] p-3 rounded-2xl border border-[#2B1B0E]/10 space-y-1">
                            <div>
                              <span className="font-bold">Địa chỉ cuối cùng sau khi mở:</span>{' '}
                              <span className="font-medium text-stone-800 break-all">{currentFinalUrl}</span>
                            </div>
                            {urlInput.trim() && normalizeDomain(currentFinalUrl) !== normalizeDomain(urlInput) && (
                              <div className="text-[#8A4B00] font-bold">
                                (Khác với địa chỉ bạn đã gõ: {urlInput.trim()})
                              </div>
                            )}
                            {(customerName || staffName) && (
                              <div className="text-[#2B1B0E]/70 pt-1 border-t border-[#2B1B0E]/10">
                                {customerName ? `Khách hàng: ${customerName}` : ''}
                                {customerName && staffName ? ' • ' : ''}
                                {staffName ? `Nhân viên: ${staffName}` : ''}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Nút hành động với min-h-[44px] */}
                        <div className="w-full flex flex-col gap-2 pt-2">
                          <button
                            onClick={handleExportPdf}
                            disabled={isExportingPdf}
                            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFB400] hover:bg-[#8A4B00] text-[#2B1B0E] hover:text-white font-extrabold text-sm transition-all cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
                          >
                            {isExportingPdf ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Đang tạo PDF...</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-4 h-4" />
                                <span>Tải PDF A4</span>
                              </>
                            )}
                          </button>
                          <div className="grid grid-cols-2 gap-2 w-full">
                            <button
                              onClick={() => setCopyModalOpen(true)}
                              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFF3C4] hover:bg-[#FFB400] text-[#2B1B0E] font-bold text-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Sao chép</span>
                            </button>
                            {canShare && (
                              <button
                                onClick={handleShare}
                                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#2B1B0E]/20 hover:bg-[#FFF3C4] text-[#2B1B0E] font-bold text-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8A4B00]"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Chia sẻ</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CỘT PHẢI (Chi tiết 5 nhóm, nhận xét AI, chính tả) */}
                  <div className="lg:col-span-7 space-y-6">
                    {/* 2. KHỐI AI NHẬN XÉT: 3 ĐIỂM MẠNH & 3 ĐIỂM CẢI THIỆN */}
                    <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-[#2B1B0E]/15 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-[#8A4B00]" />
                          <h3 className="text-base sm:text-lg font-black text-[#2B1B0E]">
                            Nhận xét trọng tâm dành cho chủ doanh nghiệp
                          </h3>
                        </div>
                        {aiReview?.isAutoGenerated ? (
                          <span className="text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                            Nhận xét tự động
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                            Tư vấn bởi AI
                          </span>
                        )}
                      </div>

                      {isAiLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
                          <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-200/60 space-y-3">
                            <div className="h-4 bg-emerald-200 rounded w-1/3"></div>
                            <div className="h-3 bg-emerald-100 rounded w-full"></div>
                            <div className="h-3 bg-emerald-100 rounded w-4/5"></div>
                          </div>
                          <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200/60 space-y-3">
                            <div className="h-4 bg-amber-200 rounded w-1/3"></div>
                            <div className="h-3 bg-amber-100 rounded w-full"></div>
                            <div className="h-3 bg-amber-100 rounded w-4/5"></div>
                          </div>
                        </div>
                      ) : aiReview ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* 3 Điểm mạnh */}
                          <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 space-y-3">
                            <div className="flex items-center gap-2 text-emerald-900 font-black text-sm uppercase tracking-wide">
                              <CheckCircle2 className="w-4 h-4 text-[#2E9E5B]" />
                              3 Điểm mạnh nổi bật
                            </div>
                            <ul className="space-y-2 text-xs sm:text-sm text-emerald-950 font-medium">
                              {aiReview.strengths.map((str, idx) => (
                                <li key={idx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="font-bold text-[#2E9E5B]">{idx + 1}.</span>
                                  <span>{str}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* 3 Điểm cần cải thiện */}
                          <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 space-y-3">
                            <div className="flex items-center gap-2 text-amber-900 font-black text-sm uppercase tracking-wide">
                              <AlertTriangle className="w-4 h-4 text-[#8A4B00]" />
                              3 Việc cần cải thiện ngay
                            </div>
                            <ul className="space-y-2 text-xs sm:text-sm text-amber-950 font-medium">
                              {aiReview.improvements.map((imp, idx) => (
                                <li key={idx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="font-bold text-[#8A4B00]">{idx + 1}.</span>
                                  <span>{imp}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* 3. CHECKLIST CHI TIẾT 5 NHÓM */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-black text-[#2B1B0E] flex items-center gap-2">
                        <Layers className="w-5 h-5 text-[#8A4B00]" />
                        Bảng chi tiết 5 nhóm đánh giá tiêu chuẩn
                      </h3>

                      {currentScore.nhoms.map((nhom) => {
                        const isCollapsed = !!collapsedGroups[nhom.id];
                        return (
                          <div
                            key={nhom.id}
                            className="bg-white rounded-3xl border-2 border-[#2B1B0E]/10 overflow-hidden shadow-sm transition-all"
                          >
                            {/* Tiêu đề nhóm */}
                            <button
                              type="button"
                              onClick={() => toggleGroup(nhom.id)}
                              className="w-full px-5 sm:px-6 py-4 bg-[#FFFBF0] hover:bg-[#FFF3C4]/50 flex items-center justify-between border-b border-[#2B1B0E]/10 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-black text-base text-[#2B1B0E]">
                                  {nhom.ten}
                                </span>
                                <span className="text-xs font-bold text-[#2B1B0E]/70 bg-white px-2.5 py-0.5 rounded-md border border-[#2B1B0E]/10">
                                  {nhom.diemDat} / {nhom.diemToiDa} điểm
                                </span>
                                {/* Thanh điểm từng nhóm chạy đầy */}
                                <div className="w-20 bg-stone-200 rounded-full h-2 overflow-hidden ml-1 hidden sm:block">
                                  <motion.div
                                    className="bg-[#2E9E5B] h-full rounded-full"
                                    initial={reducedMotion ? { width: `${Math.min(100, (nhom.diemDat / (nhom.diemToiDa || 1)) * 100)}%` } : { width: 0 }}
                                    animate={{ width: `${Math.min(100, (nhom.diemDat / (nhom.diemToiDa || 1)) * 100)}%` }}
                                    transition={{ duration: 0.7, ease: 'easeOut' }}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-xs font-bold text-[#2B1B0E]/70">
                                <span>{isCollapsed ? 'Mở ra xem' : 'Thu gọn'}</span>
                                {isCollapsed ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronUp className="w-4 h-4" />
                                )}
                              </div>
                            </button>

                            {/* Danh sách các mục trong nhóm gập/mở mượt mà (animate height) */}
                            <AnimatePresence initial={false}>
                              {!isCollapsed && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.28, ease: 'easeInOut' }}
                                  className="divide-y divide-[#2B1B0E]/10 overflow-hidden"
                                >
                                  {nhom.items.map((item, idx) =>
                                    item.khongApDung ? (
                                      <motion.div
                                        key={item.id}
                                        initial={reducedMotion ? undefined : { opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.22, delay: idx * 0.04 }}
                                        className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/80 text-stone-500"
                                      >
                                        <div className="space-y-1 flex-1">
                                          <div className="flex items-center gap-2">
                                            <Minus className="w-5 h-5 text-stone-400 flex-shrink-0" />
                                            <span className="font-bold text-sm sm:text-base text-stone-600">
                                              Không áp dụng: {item.ten}
                                            </span>
                                          </div>
                                          <p className="text-xs sm:text-sm text-stone-500 font-normal pl-7 leading-relaxed">
                                            {item.ghiChu}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2 self-end sm:self-center pl-7 sm:pl-0">
                                          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-stone-200 text-stone-600">
                                            Không tính điểm
                                          </span>
                                        </div>
                                      </motion.div>
                                    ) : (
                                      <motion.div
                                        key={item.id}
                                        initial={reducedMotion ? undefined : { opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.22, delay: idx * 0.04 }}
                                        className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FFFBF0]/60 transition-colors"
                                      >
                                        <div className="space-y-1 flex-1">
                                          <div className="flex items-center gap-2">
                                            {item.ketQua === 'dat' ? (
                                              <CheckCircle2 className="w-5 h-5 text-[#2E9E5B] flex-shrink-0" />
                                            ) : item.ketQua === 'nen_sua' ? (
                                              <AlertTriangle className="w-5 h-5 text-[#8A4B00] flex-shrink-0" />
                                            ) : (
                                              <XCircle className="w-5 h-5 text-[#D64545] flex-shrink-0" />
                                            )}
                                            <span className="font-bold text-sm sm:text-base text-[#2B1B0E]">
                                              {item.ten}
                                            </span>
                                          </div>

                                          <p className="text-xs sm:text-sm text-[#2B1B0E]/80 font-normal pl-7 leading-relaxed">
                                            {item.ghiChu}
                                          </p>

                                          {item.chiTiet && (
                                            <div className="overflow-x-auto ml-7 max-w-full">
                                              <code className="inline-block text-xs font-mono text-stone-700 bg-stone-100 px-2.5 py-1 rounded whitespace-nowrap">
                                                {item.chiTiet}
                                              </code>
                                            </div>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-center pl-7 sm:pl-0">
                                          <motion.span
                                            whileHover={reducedMotion ? undefined : { scale: 1.05 }}
                                            className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                                              item.ketQua === 'dat'
                                                ? 'bg-emerald-100 text-[#2E9E5B]'
                                                : item.ketQua === 'nen_sua'
                                                ? 'bg-amber-100 text-[#8A4B00]'
                                                : 'bg-red-100 text-[#D64545]'
                                            }`}
                                          >
                                            +{item.diem} / {item.diemToiDa}đ
                                          </motion.span>
                                        </div>
                                      </motion.div>
                                    )
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>

                    {/* KIỂM TRA CHÍNH TẢ & NGỮ PHÁP TIẾNG VIỆT */}
                    <SpellCheckCard
                      visibleText={currentVisibleText}
                      wordCount={currentScore.soTu}
                      isJsRendered={currentScore.coCanhBaoVang}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CHẨN ĐOÁN HỆ THỐNG */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#2B1B0E]/15 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#E8890C]" />
                    <h3 className="text-base font-extrabold text-[#2B1B0E]">
                      Chẩn đoán hệ thống & Kết nối OpenAI
                    </h3>
                  </div>
                  <p className="text-xs text-[#2B1B0E]/70">
                    Gọi thử trực tiếp OpenAI API (mô hình gpt-4o-mini qua bí mật OPENAI_API_KEY ở backend). Không dùng dữ liệu giả.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setTestingOpenAI(true);
                    setOpenAIResult(null);
                    try {
                      const res = await fetch('/api/test-openai', { method: 'POST' });
                      const data = await res.json();
                      setOpenAIResult(data);
                    } catch (err: any) {
                      setOpenAIResult({ success: false, error: err.message });
                    } finally {
                      setTestingOpenAI(false);
                    }
                  }}
                  disabled={testingOpenAI}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFF3C4] hover:bg-[#FFB400] text-[#2B1B0E] font-bold text-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {testingOpenAI ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Đang kiểm tra OpenAI...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-[#E8890C]" />
                      Kiểm tra kết nối OpenAI
                    </>
                  )}
                </button>
              </div>

              {openAIResult && (
                <div
                  className={`p-4 rounded-2xl text-xs space-y-1.5 ${
                    openAIResult.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-950'
                      : 'bg-red-50 border border-red-200 text-red-950'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {openAIResult.success ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#2E9E5B]" />
                        <span>Kết nối OpenAI thành công!</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-[#D64545]" />
                        <span>Kết nối OpenAI chưa sẵn sàng</span>
                      </>
                    )}
                    {openAIResult.model && (
                      <span className="font-mono bg-white/70 px-2 py-0.5 rounded text-xs">
                        Model: {openAIResult.model}
                      </span>
                    )}
                  </div>
                  {openAIResult.success && (
                    <p className="font-medium text-emerald-800 pl-6 text-sm">
                      Phản hồi từ AI: "{openAIResult.reply}"
                    </p>
                  )}
                  {!openAIResult.success && (
                    <p className="font-mono text-red-800 pl-6 text-xs">
                      {openAIResult.error}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: SO SÁNH ĐỐI THỦ (G) */}
        {/* ========================================================= */}
        {activeTab === 'compare' && (
          <motion.div
            key="compare"
            initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-8"
          >
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FFF3C4] text-[#8A4B00] text-xs font-bold uppercase tracking-wider border border-[#FFB400]/40">
                <Crown className="w-3.5 h-3.5" />
                Biết người biết ta • Trăm trận trăm thắng
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#2B1B0E] tracking-tight leading-tight">
                So sánh website với đối thủ
              </h1>
              <p className="text-base sm:text-lg text-[#2B1B0E]/75 font-normal max-w-2xl leading-relaxed">
                Nhập website của bạn và từ 1 đến 3 đối thủ để xem ai đang có điểm số cao hơn,
                tìm ra các điểm bạn đang thua và những lợi thế bạn đang vượt trội.
              </p>
            </div>

            {/* Form nhập liệu so sánh */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-[#2B1B0E]/15 shadow-sm space-y-6">
              <form onSubmit={handleCompareSites} className="space-y-5">
                {/* Website của bạn */}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[#2B1B0E]">
                    1. Website của bạn (hoặc khách hàng) <span className="text-[#D64545]">*</span>
                  </label>
                  <input
                    type="text"
                    value={compareCustUrl}
                    onChange={(e) => setCompareCustUrl(e.target.value)}
                    placeholder="VD: cuahangcuaban.vn"
                    className="w-full px-4 py-3 rounded-2xl bg-[#FFFBF0] border-2 border-[#2B1B0E]/15 font-medium text-base text-[#2B1B0E] focus:outline-none focus:border-[#FFB400]"
                  />
                </div>

                {/* Các website đối thủ */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold text-[#2B1B0E]">
                      2. Website đối thủ cạnh tranh (1–3 trang web) <span className="text-[#D64545]">*</span>
                    </label>
                    {competitorUrls.length < 3 && (
                      <button
                        type="button"
                        onClick={handleAddCompetitor}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#E8890C] hover:underline cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm đối thủ
                      </button>
                    )}
                  </div>

                  {competitorUrls.map((cUrl, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#2B1B0E]/60 w-16">
                        Đối thủ {idx + 1}:
                      </span>
                      <input
                        type="text"
                        value={cUrl}
                        onChange={(e) => {
                          const updated = [...competitorUrls];
                          updated[idx] = e.target.value;
                          setCompetitorUrls(updated);
                        }}
                        placeholder={`VD: doithu${idx + 1}.vn`}
                        className="flex-1 px-4 py-3 rounded-2xl bg-[#FFFBF0] border-2 border-[#2B1B0E]/15 font-medium text-sm text-[#2B1B0E] focus:outline-none focus:border-[#FFB400]"
                      />
                      {competitorUrls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCompetitor(idx)}
                          className="p-3 text-stone-400 hover:text-red-500 rounded-xl hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isComparing}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] hover:text-white font-black text-base shadow-sm transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isComparing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Đang so sánh website...</span>
                      </>
                    ) : (
                      <>
                        <GitCompare className="w-5 h-5" />
                        <span>Bắt đầu so sánh</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Trạng thái loading so sánh */}
            {isComparing && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#FFB400] shadow-sm flex flex-col sm:flex-row items-center gap-6 animate-pulse">
                <Bee status="quet" size={72} />
                <div className="space-y-2 text-center sm:text-left flex-1">
                  <h3 className="text-lg font-extrabold text-[#2B1B0E]">
                    {compareLoadingStep || 'Đang quét và so sánh dữ liệu...'}
                  </h3>
                  <p className="text-xs text-[#2B1B0E]/70 font-medium">
                    Hệ thống quét tối đa 2 website song song để đảm bảo tốc độ và độ chính xác cao nhất.
                  </p>
                </div>
              </div>
            )}

            {/* Báo lỗi so sánh */}
            {compareError && (
              <div className="bg-red-50 rounded-3xl p-6 border-2 border-[#D64545]/30 text-[#D64545] space-y-2">
                <div className="flex items-start gap-3">
                  <XCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-base">Không thể so sánh</h4>
                    <p className="text-sm font-medium">{compareError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* KẾT QUẢ SO SÁNH */}
            {compareResult && (
              <div ref={compareReportRef} className="space-y-6">
                {/* 1. Các cột điểm đặt cạnh nhau + vương miện */}
                <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#2B1B0E]/15 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2B1B0E]/10">
                    <div>
                      <h3 className="text-xl font-black text-[#2B1B0E]">
                        Bảng xếp hạng điểm số website
                      </h3>
                      <p className="text-xs text-[#2B1B0E]/70 font-medium mt-0.5">
                        Trang web có điểm số cao nhất sẽ được đội vương miện Ong Nhỏ 👑
                      </p>
                    </div>

                    <button
                      onClick={handleExportComparePdf}
                      disabled={isExportingPdf}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] hover:text-white font-bold text-xs transition-all cursor-pointer disabled:opacity-60"
                    >
                      {isExportingPdf ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang tạo PDF...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Tải PDF so sánh</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Danh sách thanh điểm "chạy đua" */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Thẻ khách hàng */}
                    <div
                      className={`p-5 rounded-3xl border-2 relative flex flex-col items-center text-center space-y-2 hover-lift ${
                        compareResult.winnerDomain === compareResult.customer.domain
                          ? 'border-[#FFB400] bg-[#FFF3C4]/40 shadow-md ring-4 ring-[#FFB400]/20'
                          : 'border-[#2B1B0E]/10 bg-[#FFFBF0]'
                      }`}
                    >
                      {compareResult.winnerDomain === compareResult.customer.domain && (
                        <motion.div
                          initial={reducedMotion ? undefined : { y: -22, opacity: 0, scale: 0.6 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.3 }}
                          className="absolute -top-3.5 bg-[#FFB400] text-[#2B1B0E] px-3 py-0.5 rounded-full text-xs font-black uppercase flex items-center gap-1 shadow-sm"
                        >
                          <Crown className="w-3.5 h-3.5" /> Quán quân
                        </motion.div>
                      )}
                      <span className="text-xs font-bold text-[#8A4B00] uppercase tracking-wide">
                        Bên bạn
                      </span>
                      <h4 className="font-extrabold text-base text-[#2B1B0E] truncate max-w-full">
                        {compareResult.customer.domain}
                      </h4>
                      <div
                        className="text-4xl font-black"
                        style={{ color: getScoreColor(compareResult.customer.score) }}
                      >
                        {compareResult.customer.score}
                        <span className="text-xs font-semibold text-[#2B1B0E]/60">/100</span>
                      </div>

                      {/* Thanh điểm chạy đua từ trái sang phải */}
                      <div className="w-full bg-[#FFF3C4] rounded-full h-2.5 overflow-hidden mt-1 border border-[#FFB400]/30">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: getScoreColor(compareResult.customer.score) }}
                          initial={reducedMotion ? { width: `${compareResult.customer.score}%` } : { width: 0 }}
                          animate={{ width: `${compareResult.customer.score}%` }}
                          transition={{ duration: 0.85, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
                        />
                      </div>

                      {compareResult.customer.scoreResult.khongDangTin && (
                        <div className="text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 mt-1">
                          Tham khảo (chưa đọc đủ)
                        </div>
                      )}
                    </div>

                    {/* Thẻ các đối thủ */}
                    {compareResult.competitors.map((comp, idx) => (
                      <div
                        key={idx}
                        className={`p-5 rounded-3xl border-2 relative flex flex-col items-center text-center space-y-2 hover-lift ${
                          comp.error
                            ? 'border-red-200 bg-red-50/60'
                            : compareResult.winnerDomain === comp.domain
                            ? 'border-[#FFB400] bg-[#FFF3C4]/40 shadow-md ring-4 ring-[#FFB400]/20'
                            : 'border-[#2B1B0E]/10 bg-white'
                        }`}
                      >
                        {!comp.error && compareResult.winnerDomain === comp.domain && (
                          <motion.div
                            initial={reducedMotion ? undefined : { y: -22, opacity: 0, scale: 0.6 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.3 }}
                            className="absolute -top-3.5 bg-[#FFB400] text-[#2B1B0E] px-3 py-0.5 rounded-full text-xs font-black uppercase flex items-center gap-1 shadow-sm"
                          >
                            <Crown className="w-3.5 h-3.5" /> Quán quân
                          </motion.div>
                        )}
                        <span className="text-xs font-bold text-[#2B1B0E]/60 uppercase tracking-wide">
                          Đối thủ {idx + 1} {comp.error ? '(Lỗi)' : ''}
                        </span>
                        <h4 className="font-extrabold text-base text-[#2B1B0E] truncate max-w-full">
                          {comp.domain}
                        </h4>
                        {comp.error ? (
                          <div className="text-xs text-red-700 font-semibold bg-white/80 p-2 rounded-xl border border-red-200 mt-2">
                            {comp.error}
                          </div>
                        ) : (
                          <>
                            <div
                              className="text-4xl font-black"
                              style={{ color: getScoreColor(comp.score) }}
                            >
                              {comp.score}
                              <span className="text-xs font-semibold text-[#2B1B0E]/60">/100</span>
                            </div>

                            {/* Thanh điểm chạy đua của đối thủ */}
                            <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden mt-1 border border-stone-200">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: getScoreColor(comp.score) }}
                                initial={reducedMotion ? { width: `${comp.score}%` } : { width: 0 }}
                                animate={{ width: `${comp.score}%` }}
                                transition={{ duration: 0.85, delay: 0.2 + idx * 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                              />
                            </div>

                            {comp.scoreResult?.khongDangTin && (
                              <div className="text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 mt-1">
                                Chưa đọc được đủ
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 10. Cảnh báo nếu website của khách là site không đáng tin */}
                  {compareResult.customer.scoreResult.khongDangTin && (
                    <div className="bg-amber-50 rounded-2xl p-4 sm:p-5 border-2 border-[#E8A100] text-amber-950 flex items-start gap-3.5">
                      <AlertTriangle className="w-6 h-6 flex-shrink-0 text-[#8A4B00] mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm sm:text-base text-amber-900">
                          Cảnh báo dữ liệu khách hàng
                        </h4>
                        <p className="text-xs sm:text-sm font-medium mt-1 leading-relaxed text-amber-800">
                          Website của khách chưa đọc được đầy đủ, chưa nên dùng kết quả này gửi khách
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 2. KHỐI ĐỎ: Khách đang thua ở các chỗ này (hiện lần lượt) */}
                  {!compareResult.customer.scoreResult.khongDangTin && (
                    <div className="bg-red-50 rounded-3xl p-5 sm:p-6 border-2 border-red-200 space-y-3">
                      <div className="flex items-center gap-2 text-red-900 font-black text-base uppercase">
                        <XCircle className="w-5 h-5 text-[#D64545]" />
                        {compareResult.loserItems.length > 0
                          ? `Khách đang thua ở ${compareResult.loserItems.length} chỗ này`
                          : 'Điểm thua đối thủ'}
                      </div>
                      {compareResult.loserItems.length > 0 ? (
                        <div className="space-y-2.5">
                          {compareResult.loserItems.map((item, idx) => (
                            <motion.div
                              key={idx}
                              initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.28, delay: idx * 0.08 }}
                              className="bg-white p-3.5 rounded-2xl border border-red-200 text-xs sm:text-sm text-red-950 font-medium space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-red-900">
                                  {idx + 1}. {item.ten}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-xs">
                                  Thua -{item.diff} điểm
                                </span>
                              </div>
                              <p className="text-[#2B1B0E]/75">{item.custNote}</p>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white/80 p-4 rounded-2xl border border-red-200 text-sm font-bold text-red-800">
                          Khách đang dẫn đầu, chưa thua mục nào
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. KHỐI XANH: Khách đang hơn ở các chỗ này (hiện lần lượt) */}
                  <div className="bg-emerald-50 rounded-3xl p-5 sm:p-6 border-2 border-emerald-200 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-900 font-black text-base uppercase">
                      <CheckCircle2 className="w-5 h-5 text-[#2E9E5B]" />
                      {compareResult.winnerItems.length > 0
                        ? `Khách đang hơn ở ${compareResult.winnerItems.length} chỗ này`
                        : 'Điểm hơn đối thủ'}
                    </div>
                    {compareResult.winnerItems.length > 0 ? (
                      <div className="space-y-2.5">
                        {compareResult.winnerItems.map((item, idx) => (
                          <motion.div
                            key={idx}
                            initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.28, delay: idx * 0.08 }}
                            className="bg-white p-3.5 rounded-2xl border border-emerald-200 text-xs sm:text-sm text-emerald-950 font-medium space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-emerald-900">
                                {idx + 1}. {item.ten}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-xs">
                                Dẫn trước +{item.diff} điểm
                              </span>
                            </div>
                            <p className="text-[#2B1B0E]/75">{item.custNote}</p>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white/80 p-4 rounded-2xl border border-emerald-200 text-sm font-bold text-emerald-800">
                        Chưa có mục nào hơn đối thủ
                      </div>
                    )}
                  </div>

                  {/* 4. AI VIẾT ĐÚNG 3 DÒNG KẾT LUẬN LỜI ĐƠN GIẢN */}
                  <div className="bg-[#FFF3C4]/60 p-5 sm:p-6 rounded-3xl border border-[#FFB400] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-black text-[#2B1B0E] text-sm uppercase">
                        <Sparkles className="w-4 h-4 text-[#E8890C]" />
                        3 Dòng kết luận so sánh từ Ong Nhỏ
                      </div>
                      <span className="text-xs font-semibold text-stone-600">
                        {compareResult.isAutoGenerated ? 'Nhận xét tự động' : 'Tư vấn AI'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {compareResult.conclusions.map((line, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-xs sm:text-sm text-[#2B1B0E] font-medium leading-relaxed"
                        >
                          <span className="font-bold text-[#E8890C]">{idx + 1}.</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* KẾ HOẠCH HÀNH ĐỘNG VƯỢT ĐỐI THỦ (TOP 3 + 15-20 ĐIỀU) */}
                  <ComparisonPlanAccordion
                    topPriorities={compareResult.topPriorities || []}
                    detailedRecommendations={compareResult.detailedRecommendations || []}
                    isAutoGenerated={compareResult.isAutoGenerated}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: NGHIÊN CỨU TỪ KHÓA */}
        {/* ========================================================= */}
        {activeTab === 'keywords' && (
          <motion.div
            key="keywords"
            initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <KeywordsTab
              currentFinalUrl={currentFinalUrl}
              currentTitle={currentTitle}
              currentH1={currentH1}
              currentMetaDesc={currentMetaDesc}
              currentVisibleText={currentVisibleText}
            />
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: THỐNG KÊ GOOGLE SEARCH CONSOLE */}
        {/* ========================================================= */}
        {activeTab === 'stats' && (
          <motion.div
            key="stats"
            initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <StatsTab onOpenCapQuyen={() => setActiveTab('auth')} />
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TRANG CẤP QUYỀN GSC (/cap-quyen) */}
        {/* ========================================================= */}
        {activeTab === 'auth' && (
          <motion.div
            key="auth"
            initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <CapQuyenPage
              onBackToApp={() => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', '/');
                }
                setActiveTab('stats');
              }}
            />
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: LỊCH SỬ KIỂM TRA (D) */}
        {/* ========================================================= */}
        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black text-[#2B1B0E] tracking-tight">
                  Lịch sử kiểm tra
                </h1>
                <p className="text-sm text-[#2B1B0E]/70 font-medium mt-1">
                  Lưu trữ tối đa 20 lần kiểm tra gần nhất trên thiết bị này.
                </p>
              </div>

              {historyList.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Xóa tất cả
                </button>
              )}
            </div>

            {historyList.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 border-2 border-[#2B1B0E]/15 text-center space-y-4">
                <Bee status="thuong" size={64} />
                <h3 className="text-lg font-bold text-[#2B1B0E]">
                  Chưa có lịch sử kiểm tra nào
                </h3>
                <p className="text-xs text-[#2B1B0E]/70 max-w-sm mx-auto">
                  Các lần kiểm tra website đơn hoặc so sánh đối thủ sẽ tự động được lưu tại đây để bạn tiện xem lại.
                </p>
                <button
                  onClick={() => setActiveTab('check')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFB400] text-[#2B1B0E] font-bold text-xs cursor-pointer"
                >
                  Kiểm tra website ngay
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {historyList.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: idx * 0.04 }}
                    onClick={() => handleViewHistoryItem(item)}
                    className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#2B1B0E]/10 hover:border-[#FFB400] shadow-sm flex items-center justify-between gap-4 transition-all cursor-pointer group hover-lift"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                            item.type === 'compare'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.type === 'compare' ? 'So sánh' : 'Kiểm tra đơn'}
                        </span>
                        <h4 className="font-extrabold text-sm sm:text-base text-[#2B1B0E] truncate group-hover:text-[#8A4B00] transition-colors">
                          {item.domain}
                        </h4>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[#2B1B0E]/70 flex-wrap">
                        {item.customerName && <span>Khách: {item.customerName}</span>}
                        {item.staffName && <span>NV: {item.staffName}</span>}
                        <span>
                          {new Date(item.timestamp).toLocaleDateString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Điểm số */}
                      <div className="text-right">
                        <div
                          className="text-2xl font-black"
                          style={{ color: getScoreColor(item.score) }}
                        >
                          {item.score}
                          <span className="text-xs font-normal text-stone-500">/100</span>
                        </div>
                        {item.scoreDiffFromPrevious !== undefined && (
                          <span
                            className={`text-xs font-bold block ${
                              item.scoreDiffFromPrevious > 0
                                ? 'text-emerald-700'
                                : item.scoreDiffFromPrevious < 0
                                ? 'text-red-700'
                                : 'text-stone-500'
                            }`}
                          >
                            {item.scoreDiffFromPrevious > 0
                              ? `+${item.scoreDiffFromPrevious}đ`
                              : `${item.scoreDiffFromPrevious}đ`}
                          </span>
                        )}
                      </div>

                      {/* Nút xóa */}
                      <button
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        title="Xóa mục này"
                        className="p-2 text-stone-400 hover:text-red-500 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      {/* THANH ĐIỀU HƯỚNG DƯỚI CÙNG CHO MÀN HÌNH < 1024px (Mobile & Tablet Bottom Bar) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-lg border-t border-[#2B1B0E]/15 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-16 min-h-[56px] items-stretch">
          <button
            onClick={() => setActiveTab('check')}
            className={`min-h-[56px] h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer py-1 px-0.5 whitespace-nowrap ${
              activeTab === 'check'
                ? 'text-[#8A4B00] font-extrabold'
                : 'text-[#2B1B0E]/65 font-semibold hover:text-[#2B1B0E]'
            }`}
          >
            <Search className="w-5 h-5 flex-shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap leading-tight">Kiểm tra</span>
          </button>

          <button
            onClick={() => setActiveTab('compare')}
            className={`min-h-[56px] h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer py-1 px-0.5 whitespace-nowrap ${
              activeTab === 'compare'
                ? 'text-[#8A4B00] font-extrabold'
                : 'text-[#2B1B0E]/65 font-semibold hover:text-[#2B1B0E]'
            }`}
          >
            <GitCompare className="w-5 h-5 flex-shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap leading-tight">So sánh</span>
          </button>

          <button
            onClick={() => setActiveTab('keywords')}
            className={`min-h-[56px] h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer py-1 px-0.5 whitespace-nowrap ${
              activeTab === 'keywords'
                ? 'text-[#8A4B00] font-extrabold'
                : 'text-[#2B1B0E]/65 font-semibold hover:text-[#2B1B0E]'
            }`}
          >
            <Key className="w-5 h-5 flex-shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap leading-tight">Từ khóa</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`min-h-[56px] h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer py-1 px-0.5 whitespace-nowrap ${
              activeTab === 'stats'
                ? 'text-[#8A4B00] font-extrabold'
                : 'text-[#2B1B0E]/65 font-semibold hover:text-[#2B1B0E]'
            }`}
          >
            <BarChart2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap leading-tight">Thống kê</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`min-h-[56px] h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer relative py-1 px-0.5 whitespace-nowrap ${
              activeTab === 'history'
                ? 'text-[#8A4B00] font-extrabold'
                : 'text-[#2B1B0E]/65 font-semibold hover:text-[#2B1B0E]'
            }`}
          >
            <History className="w-5 h-5 flex-shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap leading-tight">Lịch sử</span>
            {historyList.length > 0 && (
              <span className="absolute top-2 right-3 w-2 h-2 rounded-full bg-[#8A4B00]" />
            )}
          </button>
        </div>
      </nav>

      {/* MODAL XEM TRƯỚC VÀ SAO CHÉP VĂN BẢN (E) */}
      {copyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-xl border-2 border-[#2B1B0E]/20">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-lg text-[#2B1B0E]">
                Xem trước báo cáo dạng văn bản
              </h3>
              <button
                onClick={() => setCopyModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            <textarea
              readOnly
              rows={12}
              value={generateTextReport()}
              className="w-full p-4 rounded-2xl bg-[#FFFBF0] border border-[#2B1B0E]/20 font-mono text-xs text-[#2B1B0E] focus:outline-none"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-stone-500">
                {copyToast ? '✓ Đã sao chép vào bộ nhớ tạm!' : 'Sẵn sàng gửi qua tin nhắn Zalo/FB'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCopyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100"
                >
                  Đóng
                </button>
                <button
                  onClick={handleCopyReport}
                  className="px-5 py-2 rounded-xl bg-[#FFB400] hover:bg-[#8A4B00] text-[#2B1B0E] hover:text-white font-extrabold text-xs transition-colors cursor-pointer"
                >
                  {copyToast ? 'Đã sao chép ✓' : 'Sao chép văn bản'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST THÔNG BÁO COPY TRƯỢT VÀO MƯỢT MÀ */}
      <AnimatePresence>
        {copyToast && (
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#2B1B0E] text-[#FFFBF0] px-5 py-2.5 rounded-full shadow-lg font-bold text-xs flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-[#FFB400]" />
            Đã sao chép báo cáo vào bộ nhớ tạm!
          </motion.div>
        )}
      </AnimatePresence>

      {/* THÔNG BÁO LỖI TẠO PDF KÈM NÚT THỬ LẠI / SAO CHÉP */}
      {pdfError && (
        <div className="fixed bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#FDF0F0] border-2 border-[#D64545] text-[#D64545] px-5 py-3.5 rounded-2xl shadow-xl max-w-xl w-[92%] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[#D64545]" />
            <span>
              Chưa tạo được PDF: {pdfError}. Bạn thử lại, hoặc bấm Sao chép báo cáo để gửi bằng chữ.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                setPdfError(null);
                if (activeTab === 'compare') {
                  handleExportComparePdf();
                } else {
                  handleExportPdf();
                }
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#D64545] text-white font-bold text-xs hover:bg-[#B91C1C] cursor-pointer"
            >
              Thử lại
            </button>
            <button
              onClick={() => {
                setPdfError(null);
                handleCopyReport();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-white border border-[#D64545] text-[#D64545] font-bold text-xs hover:bg-red-50 cursor-pointer"
            >
              Sao chép
            </button>
            <button
              onClick={() => setPdfError(null)}
              className="p-1 text-[#D64545] hover:text-[#7F1D1D] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* MODAL MỞ PDF TRÊN SAFARI IOS NẾU BỊ CHẶN TỰ TẢI */}
      {pdfModalUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl border-2 border-[#2B1B0E]/20 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FFF3C4] text-[#E8890C] mx-auto flex items-center justify-center">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-lg text-[#2B1B0E]">
              Báo cáo PDF đã sẵn sàng
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Trình duyệt trên thiết bị của bạn yêu cầu mở tài liệu trước khi lưu vào Tệp:
            </p>
            <div className="bg-[#FFFBF0] border border-[#2B1B0E]/15 p-3 rounded-2xl text-left text-xs text-[#2B1B0E] space-y-1">
              <div className="font-bold text-[#E8890C]">Hướng dẫn lưu trên iPhone/iPad:</div>
              <div>1. Bấm nút <strong>Mở PDF</strong> bên dưới để xem báo cáo trong tab mới.</div>
              <div>2. Bấm giữ màn hình hoặc nút Chia sẻ ⎋ → chọn <strong>"Lưu vào Tệp"</strong>.</div>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPdfModalUrl(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Đóng
              </button>
              <a
                href={pdfModalUrl.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPdfModalUrl(null)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#FFB400] hover:bg-[#E8890C] text-[#2B1B0E] hover:text-white font-extrabold text-xs transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                Mở PDF
              </a>
            </div>
          </div>
        </div>
      )}

      {/* VÙNG CHUẨN BỊ XUẤT PDF ẨN NGOÀI MÀN HÌNH (100% INLINE STYLE, KHÔNG TAILWIND) */}
      <div
        ref={singlePdfContainerRef}
        style={{
          position: 'absolute',
          left: '-10000px',
          top: 0,
          width: '794px',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {currentScore && (
          <SingleReportPdf
            scoreResult={currentScore}
            finalUrl={currentFinalUrl || urlInput}
            inputUrl={urlInput}
            customerName={customerName}
            staffName={staffName}
            scoreDiff={previousScoreDiff}
            aiReview={aiReview}
          />
        )}
      </div>

      <div
        ref={comparePdfContainerRef}
        style={{
          position: 'absolute',
          left: '-10000px',
          top: 0,
          width: '794px',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {compareResult && (
          <CompareReportPdf
            customer={compareResult.customer}
            competitors={compareResult.competitors}
            winnerDomain={compareResult.winnerDomain}
            loserItems={compareResult.loserItems}
            winnerItems={compareResult.winnerItems}
            conclusions={compareResult.conclusions}
            isAutoGenerated={compareResult.isAutoGenerated}
            topPriorities={compareResult.topPriorities}
            detailedRecommendations={compareResult.detailedRecommendations}
            customerName={customerName}
            staffName={staffName}
          />
        )}
      </div>
    </div>
  );
}
