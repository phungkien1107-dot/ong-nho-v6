import express, { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import crypto from 'crypto';
import fs from 'fs';
import OpenAI from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '5mb' }));

// ---------------------------------------------------------------------------
// Rate Limiter: Tối đa 30 lượt/phút/IP cho /api/fetch-site
// ---------------------------------------------------------------------------
const rateLimitWindowMs = 60 * 1000;
const maxRequestsPerWindow = 30;
const ipRequestHistory = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipRequestHistory.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < rateLimitWindowMs);
  if (validTimestamps.length >= maxRequestsPerWindow) {
    ipRequestHistory.set(ip, validTimestamps);
    return false;
  }
  validTimestamps.push(now);
  ipRequestHistory.set(ip, validTimestamps);
  return true;
}

// Định kỳ dọn dẹp map lưu IP mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipRequestHistory.entries()) {
    const valid = timestamps.filter((t) => now - t < rateLimitWindowMs);
    if (valid.length === 0) {
      ipRequestHistory.delete(ip);
    } else {
      ipRequestHistory.set(ip, valid);
    }
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// Bảo mật SSRF: Chặn địa chỉ nội bộ & IP nhạy cảm
// ---------------------------------------------------------------------------
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  // 0.0.0.0/8
  if (parts[0] === 0) return true;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 127.0.0.0/8 (localhost)
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 (link-local, cloud metadata 169.254.169.254)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (parts[0] >= 224) return true;
  // 255.255.255.255
  if (ip === '255.255.255.255') return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // ::1 loopback
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  // :: unspecified
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (normalized.startsWith('::ffff:')) {
    const v4 = normalized.replace('::ffff:', '');
    return isPrivateIPv4(v4);
  }
  // Unique local fc00::/7 (fc.. or fd..)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // Link-local fe80::/10
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }
  return false;
}

function isBlockedIP(ip: string): boolean {
  if (ip.includes(':')) {
    return isPrivateIPv6(ip);
  }
  return isPrivateIPv4(ip);
}

async function validateHostname(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    throw new Error('Địa chỉ máy chủ nội bộ không được phép kiểm tra vì lý do bảo mật.');
  }

  // Phân giải DNS
  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(hostname, { all: true });
  } catch (err: any) {
    throw new Error('Không thể phân giải tên miền. Vui lòng kiểm tra lại chính tả địa chỉ web.');
  }

  if (!records || records.length === 0) {
    throw new Error('Không tìm thấy bản ghi máy chủ cho tên miền này.');
  }

  for (const record of records) {
    if (isBlockedIP(record.address)) {
      throw new Error(`Tên miền trỏ về địa chỉ nội bộ (${record.address}) bị chặn bảo mật.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Trình tải an toàn (Safe Fetcher) với giới hạn chuyển hướng và timeout
// ---------------------------------------------------------------------------
interface FetchResult {
  finalUrl: string;
  statusCode: number;
  html: string;
  responseTimeMs: number;
  redirectChain: { from: string; to: string; status: number }[];
  xRobotsTag: string;
  robotsTxt: string | null;
  robotsTxtFound: boolean;
  sitemapFound: boolean;
  isBlocked: boolean;
  blockedReason?: string;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (OngNhoBot/1.0; +https://ongnho.vn)';

async function fetchResourceSafe(
  targetUrl: string,
  maxBytes: number = 2 * 1024 * 1024,
  timeoutMs: number = 10000
): Promise<{ status: number; text: string; finalUrl: string; headers: Headers; redirects: { from: string; to: string; status: number }[] }> {
  let currentUrl = targetUrl;
  const redirects: { from: string; to: string; status: number }[] = [];
  const maxRedirects = 5;

  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Chỉ chấp nhận đường dẫn website dùng giao thức http:// hoặc https://');
    }

    await validateHostname(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Website phản hồi quá lâu (quá 10 giây). Vui lòng thử lại sau.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // Xử lý chuyển hướng
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        break;
      }
      const nextUrl = new URL(location, currentUrl).href;
      redirects.push({ from: currentUrl, to: nextUrl, status: res.status });
      if (redirects.length > maxRedirects) {
        throw new Error('Website chuyển hướng quá nhiều lần (vượt quá 5 lần).');
      }
      currentUrl = nextUrl;
      continue;
    }

    // Đọc nội dung với giới hạn dung lượng
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { status: res.status, text: text.slice(0, maxBytes), finalUrl: currentUrl, headers: res.headers, redirects };
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        chunks.push(value);
        if (receivedBytes >= maxBytes) {
          reader.cancel();
          break;
        }
      }
    }

    const totalBuffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(totalBuffer);

    return {
      status: res.status,
      text,
      finalUrl: currentUrl,
      headers: res.headers,
      redirects,
    };
  }

  throw new Error('Chuyển hướng vượt quá giới hạn cho phép.');
}

// ---------------------------------------------------------------------------
// Health check endpoint
// ---------------------------------------------------------------------------
app.get('/api/health', (_req: ExpressRequest, res: ExpressResponse) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: 'Ong Nhỏ – Kiểm tra website',
    version: '1.0.0',
    phase: 1,
  });
});

// ---------------------------------------------------------------------------
// Chẩn đoán kết nối OpenAI (không dữ liệu giả, gọi trực tiếp)
// ---------------------------------------------------------------------------
app.post('/api/test-openai', async (_req: ExpressRequest, res: ExpressResponse) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey || apiKey.trim() === '' || apiKey === 'sk-...') {
    return res.status(400).json({
      success: false,
      error: 'Chưa cấu hình OPENAI_API_KEY trong biến môi trường server (hoặc Secrets của AI Studio).',
    });
  }

  const startTime = Date.now();
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: 'Bạn là trợ lý hệ thống Ong Nhỏ. Hãy trả lời ngắn gọn một câu: Ong Nhỏ đã kết nối thành công với OpenAI!',
        },
      ],
      max_tokens: 30,
      temperature: 0.2,
    });

    const reply = response.choices?.[0]?.message?.content?.trim() || 'Phản hồi trống';
    const latencyMs = Date.now() - startTime;

    return res.json({
      success: true,
      model,
      reply,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      model,
      latencyMs,
      error: err.message || 'Lỗi không xác định khi kết nối OpenAI.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/fetch-site: Quét website an toàn
// ---------------------------------------------------------------------------
app.post('/api/fetch-site', async (req: ExpressRequest, res: ExpressResponse) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Bạn đã thực hiện hơn 30 lượt kiểm tra trong 1 phút. Chú Ong Nhỏ đang nghỉ lấy mật một chút, vui lòng thử lại sau giây lát!',
    });
  }

  let rawUrl = (req.body?.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({
      success: false,
      error: 'Vui lòng nhập địa chỉ website cần kiểm tra.',
    });
  }

  // Tự động thêm https:// nếu thiếu
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Địa chỉ website không hợp lệ. Vui lòng nhập dạng example.com hoặc https://example.com.',
    });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({
      success: false,
      error: 'Chỉ chấp nhận đường dẫn website dùng http:// hoặc https://.',
    });
  }

  if (!parsedUrl.hostname || (!parsedUrl.hostname.includes('.') && parsedUrl.hostname !== 'localhost')) {
    return res.status(400).json({
      success: false,
      error: 'Địa chỉ website không hợp lệ. Vui lòng nhập đầy đủ tên miền có đuôi (ví dụ: cuahang.vn hoặc example.com).',
    });
  }

  const startTime = Date.now();
  try {
    // 1. Tải HTML trang chính
    const htmlFetch = await fetchResourceSafe(parsedUrl.href, 2 * 1024 * 1024, 10000);
    const responseTimeMs = Date.now() - startTime;
    const finalUrl = htmlFetch.finalUrl;
    const statusCode = htmlFetch.status;
    const xRobotsTag = htmlFetch.headers.get('x-robots-tag') || '';
    const html = htmlFetch.text;

    // Kiểm tra trang có chặn bot / tường lửa / captcha không
    const isWafBlocked =
      statusCode === 403 ||
      statusCode === 429 ||
      html.includes('Cloudflare') && html.includes('Just a moment...') ||
      html.includes('cf-browser-verification') ||
      html.includes('g-recaptcha') ||
      html.includes('Attention Required! | Cloudflare');

    // 2. Tải song song robots.txt và kiểm tra sitemap.xml an toàn
    let robotsTxt: string | null = null;
    let robotsTxtFound = false;
    let sitemapFound = false;

    try {
      const robotsUrl = new URL('/robots.txt', finalUrl).href;
      const robotsRes = await fetchResourceSafe(robotsUrl, 100 * 1024, 5000);
      if (robotsRes.status === 200 && robotsRes.text.length > 0) {
        const lower = robotsRes.text.trim().toLowerCase();
        const isHtml = lower.startsWith('<!doctype') || lower.startsWith('<html');
        const hasRobotsKeywords =
          lower.includes('user-agent') || lower.includes('sitemap:') || lower.includes('disallow');
        if (!isHtml && hasRobotsKeywords) {
          robotsTxt = robotsRes.text;
          robotsTxtFound = true;
        } else {
          robotsTxt = null;
          robotsTxtFound = false;
        }
      }
    } catch {
      // Bỏ qua lỗi robots.txt
      robotsTxtFound = false;
    }

    // 3. Kiểm tra sitemap theo quy tắc 4:
    // a) Từ robots.txt có dòng Sitemap: ...
    // b) hoặc /sitemap.xml ở GỐC tên miền
    // c) hoặc /sitemap_index.xml ở GỐC tên miền
    // Hợp lệ khi mã 200 và nội dung chứa thẻ XML (<urlset hoặc <sitemapindex)
    const checkSitemapUrl = async (sUrl: string): Promise<boolean> => {
      try {
        const sRes = await fetchResourceSafe(sUrl, 30 * 1024, 5000);
        if (sRes.status === 200) {
          const lower = sRes.text.toLowerCase().trim();
          if (lower.includes('<urlset') || lower.includes('<sitemapindex')) {
            return true;
          }
        }
      } catch {}
      return false;
    };

    let sitemapCandidateFromRobots: string | null = null;
    if (robotsTxt) {
      const match = robotsTxt.match(/^[ \t]*Sitemap:[ \t]*([^\r\n]+)/im);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (/^https?:\/\//i.test(candidate)) {
          sitemapCandidateFromRobots = candidate;
        }
      }
    }

    if (sitemapCandidateFromRobots && (await checkSitemapUrl(sitemapCandidateFromRobots))) {
      sitemapFound = true;
    } else {
      try {
        const origin = new URL(finalUrl).origin;
        if (await checkSitemapUrl(origin + '/sitemap.xml')) {
          sitemapFound = true;
        } else if (await checkSitemapUrl(origin + '/sitemap_index.xml')) {
          sitemapFound = true;
        }
      } catch {
        sitemapFound = false;
      }
    }

    const result: FetchResult = {
      finalUrl,
      statusCode,
      html,
      responseTimeMs,
      redirectChain: htmlFetch.redirects,
      xRobotsTag,
      robotsTxt,
      robotsTxtFound,
      sitemapFound,
      isBlocked: isWafBlocked,
      blockedReason: isWafBlocked
        ? 'Website này chặn công cụ kiểm tra (tường lửa hoặc captcha), kết quả không đáng tin.'
        : undefined,
    };

    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const errorMsg = err.message || 'Không thể truy cập website này.';
    return res.status(400).json({
      success: false,
      error: errorMsg,
    });
  }
});

// ---------------------------------------------------------------------------
// Rate Limiter cho AI: Tối đa 40 lượt gọi AI/ngày/IP
// ---------------------------------------------------------------------------
const aiDailyUsage = new Map<string, { date: string; count: number }>();
const MAX_AI_PER_DAY = 40;

function checkAiDailyLimit(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const userUsage = aiDailyUsage.get(ip);
  if (!userUsage || userUsage.date !== today) {
    aiDailyUsage.set(ip, { date: today, count: 1 });
    return true;
  }
  if (userUsage.count >= MAX_AI_PER_DAY) {
    return false;
  }
  userUsage.count += 1;
  aiDailyUsage.set(ip, userUsage);
  return true;
}

// Bộ nhớ đệm (Cache) cho kết quả AI theo chuỗi hash
const aiCache = new Map<string, { data: any; expireAt: number }>();

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// ---------------------------------------------------------------------------
// Câu nhận xét mẫu chuẩn theo từng ID tiêu chuẩn (Rule 11 & 12)
// ---------------------------------------------------------------------------
const itemStrengthSentence: Record<string, string> = {
  https: 'Website có chứng chỉ bảo mật HTTPS ở địa chỉ cuối, giúp khách hàng hoàn toàn yên tâm khi truy cập.',
  viewport: 'Trang web hiển thị vừa vặn và tự động co giãn đẹp mắt trên màn hình điện thoại.',
  title: 'Tiêu đề trang có độ dài chuẩn xác, giúp tên thương hiệu xuất hiện ngay ngắn trên Google.',
  meta_desc: 'Đoạn mô tả Meta Description có độ dài lý tưởng, thu hút khách bấm vào xem trên Google.',
  h1: 'Trang có duy nhất một tiêu đề chính H1 rõ ràng, giúp Google hiểu ngay chủ đề cốt lõi.',
  h2: 'Có các tiêu đề phụ H2 chia đoạn bài viết mạch lạc, giúp khách hàng dễ lướt đọc.',
  img_alt: 'Hình ảnh trên trang đều có thuộc tính mô tả alt đầy đủ, hỗ trợ người xem và Google Hình ảnh.',
  word_count: 'Nội dung bài viết phong phú và đầy đủ thông tin hữu ích cho khách hàng.',
  keyword: 'Từ khóa chính xuất hiện khéo léo ở các vị trí quan trọng nhất của trang.',
  icons: 'Đầy đủ biểu tượng favicon và biểu tượng khi khách lưu ra màn hình chính iPhone.',
  html_size: 'Mã nguồn trang rất gọn nhẹ, giúp tiết kiệm dung lượng 4G cho khách hàng.',
  response_time: 'Máy chủ phản hồi nhanh, khách hàng không bị cảm giác chờ đợi sốt ruột.',
  canonical: 'Đã khai báo đường dẫn chuẩn canonical, tránh bị phạt do trùng lặp nội dung.',
  lang: 'Đã khai báo ngôn ngữ trang web rõ ràng, giúp máy tìm kiếm phân loại chính xác.',
  robots: 'Có tệp robots.txt hướng dẫn các công cụ tìm kiếm thu thập dữ liệu đúng cách.',
  sitemap: 'Có sơ đồ trang web sitemap.xml hợp lệ giúp Google cập nhật trang mới nhanh hơn.',
  redirects: 'Đường dẫn mở trực tiếp, không bị qua các lần chuyển hướng lòng vòng.',
  json_ld: 'Có dữ liệu cấu trúc Schema JSON-LD hỗ trợ hiển thị nổi bật trên Google.',
  og_title: 'Tiêu đề hiển thị rõ ràng và chuẩn mực mỗi khi gửi link qua Zalo hay Facebook.',
  og_desc: 'Đoạn tóm tắt hiển thị hấp dẫn bên dưới đường link khi gửi qua mạng xã hội.',
  og_image: 'Hình ảnh đại diện to đẹp bắt mắt mỗi khi bạn gửi link qua tin nhắn Zalo/Facebook.',
  twitter_card: 'Đã chuẩn hóa định dạng thẻ chia sẻ mở rộng trên các nền tảng mạng xã hội.',
  ui_viewport: 'Khung nhìn di động đạt chuẩn quốc tế, co giãn mượt mà trên tất cả dòng điện thoại.',
  ui_font_size: 'Phông chữ và cỡ chữ rất dễ đọc, khách hàng lướt xem không bị mỏi mắt.',
  ui_touch_target: 'Các nút bấm và liên kết có kích thước lớn, chạm bằng ngón tay rất thuận tiện.',
  ui_contrast: 'Màu chữ và màu nền có độ tương phản tốt, chữ nét và nổi bật.',
  ui_hotline_zalo: 'Có nút gọi Hotline hoặc chat Zalo nhanh, giúp khách liên hệ mua hàng chỉ trong 1 chạm.',
  ui_short_form: 'Biểu mẫu liên hệ tinh gọn, không rườm rà giúp tối đa hóa số khách để lại thông tin.',
  ui_alt_ux: 'Hình ảnh có đầy đủ mô tả tiếp cận, bảo đảm khách không bị hẫng khi mạng chậm.',
  ui_heading_hierarchy: 'Cấu trúc tiêu đề phân cấp mạch lạc, giúp khách nắm bắt ý chính bài viết nhanh chóng.',
  ui_favicon: 'Có biểu tượng thương hiệu riêng trên tab trình duyệt, tạo cảm giác uy tín và chuyên nghiệp.',
  ui_popup: 'Trang web mở ra thoáng đãng, không có popup che chắn gây phiền toái cho khách.',
};

const itemImprovementSentence: Record<string, string> = {
  meta_desc: 'Cần bổ sung đoạn mô tả Meta Description từ 120–160 ký tự để khi hiện trên Google khách muốn bấm vào.',
  og_image: 'Chưa có ảnh đại diện khi gửi link: hãy thêm thẻ og:image để khi gửi qua Zalo hay Facebook hiện banner đẹp.',
  https: 'Cần kích hoạt ngay chứng chỉ bảo mật HTTPS để trang web không bị trình duyệt cảnh báo "Không an toàn".',
  viewport: 'Cần bổ sung cấu hình viewport để trang tự động co giãn vừa vặn trên màn hình điện thoại.',
  title: 'Chỉnh sửa lại tiêu đề trang đạt chuẩn 30–60 ký tự để Google không cắt bớt dấu 3 chấm.',
  h1: 'Cần chỉnh lại để mỗi trang chỉ có duy nhất 1 tiêu đề chính H1 nêu rõ chủ đề bài viết.',
  h2: 'Thêm các tiêu đề mục con H2 để phân chia bài viết rõ ràng, giúp khách đọc không bị ngợp.',
  img_alt: 'Bổ sung thuộc tính mô tả alt cho các hình ảnh để Google hiểu được nội dung ảnh.',
  word_count: 'Bổ sung thêm nội dung chi tiết cho trang (đạt trên 300 từ) để Google đánh giá trang hữu ích.',
  keyword: 'Chèn thêm từ khóa chính vào tiêu đề, tiêu đề H1 hoặc đoạn mô tả của trang.',
  icons: 'Thêm biểu tượng favicon cho máy tính và apple-touch-icon cho điện thoại iPhone.',
  html_size: 'Dọn dẹp mã nguồn HTML thừa để giảm dung lượng tải trang xuống dưới 500KB.',
  response_time: 'Nâng cấp máy chủ hoặc bật bộ nhớ đệm cache để tốc độ phản hồi nhanh hơn.',
  canonical: 'Thêm thẻ liên kết canonical để tránh việc Google hiểu lầm là trang sao chép.',
  lang: 'Thêm thuộc tính lang="vi" vào thẻ html để công cụ tìm kiếm nhận diện đúng tiếng Việt.',
  robots: 'Tạo tệp robots.txt ở thư mục gốc để hướng dẫn Google ghé thăm các trang hợp lệ.',
  sitemap: 'Tạo sơ đồ sitemap.xml để các trang sản phẩm và bài viết mới được Google lập chỉ mục nhanh.',
  redirects: 'Hạn chế chuyển hướng nhiều lần (dưới 2 lần) để khách truy cập nhanh hơn.',
  json_ld: 'Cài đặt mã Schema JSON-LD để có cơ hội hiện đánh giá sao hoặc giá bán nổi bật trên Google.',
  og_title: 'Thêm thẻ og:title để khi chia sẻ qua Zalo/Facebook hiển thị tiêu đề chính xác.',
  og_desc: 'Thêm thẻ og:description để hiển thị đoạn giới thiệu tóm tắt khi gửi link qua tin nhắn.',
  twitter_card: 'Bổ sung thẻ twitter:card để bài chia sẻ hiển thị trọn vẹn hơn trên mọi ứng dụng.',
  ui_viewport: 'Bổ sung chuẩn khung nhìn width=device-width, initial-scale=1 để trang không bị lệch tỉ lệ trên di động.',
  ui_font_size: 'Tăng cỡ chữ của một số đoạn văn bản lên tối thiểu 14px để khách hàng dễ đọc trên điện thoại.',
  ui_touch_target: 'Mở rộng khoảng cách đệm (padding) của các nút bấm và liên kết hành động để tránh bấm nhầm.',
  ui_contrast: 'Tăng độ đậm màu chữ so với nền để văn bản rõ nét hơn khi xem ngoài trời.',
  ui_hotline_zalo: 'Bổ sung nút gọi Hotline (tel:) và liên kết Chat Zalo ở góc màn hình để khách tiện liên hệ tư vấn.',
  ui_short_form: 'Rút gọn các ô nhập liệu trong form đăng ký xuống dưới 6 trường để khách không nản lòng khi điền.',
  ui_alt_ux: 'Bổ sung mô tả alt cho ảnh để người dùng vẫn hiểu được nội dung khi mạng chậm hoặc ảnh bị lỗi.',
  ui_heading_hierarchy: 'Sắp xếp lại các tiêu đề theo thứ tự H1 tới H2 để bài viết mạch lạc hơn.',
  ui_favicon: 'Cài đặt biểu tượng thương hiệu favicon trên tab trình duyệt để tăng độ uy tín.',
  ui_popup: 'Hạn chế bật popup quảng cáo che phủ ngay khi khách vừa vào trang để tránh gây khó chịu.',
};

// ---------------------------------------------------------------------------
// POST /api/ai-review: Nhận xét AI 3 điểm mạnh + 3 điểm cần cải thiện
// ---------------------------------------------------------------------------
app.post('/api/ai-review', async (req: ExpressRequest, res: ExpressResponse) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const { tenMien = '', loaiWebsite = 'none', strengthsItems = [], improvementsItems = [] } = req.body || {};

  const payloadHash = simpleHash(JSON.stringify({ tenMien, loaiWebsite, strengthsItems, improvementsItems }));

  // Kiểm tra cache
  const cached = aiCache.get(payloadHash);
  if (cached && cached.expireAt > Date.now()) {
    return res.json({ success: true, data: cached.data, fromCache: true });
  }

  // Hàm sinh nhận xét dự phòng chuẩn theo đúng ID
  const generateDeterministicFallback = () => {
    const sTexts = (strengthsItems as any[]).map((it) => {
      return itemStrengthSentence[it.id] || it.ghiChu || `Mục ${it.ten} của trang web được thiết lập tốt.`;
    });
    const iTexts = (improvementsItems as any[]).map((it) => {
      return itemImprovementSentence[it.id] || it.ghiChu || `Cần tối ưu thêm mục ${it.ten} để trang hoàn thiện hơn.`;
    });
    return {
      strengths: sTexts.slice(0, 3),
      improvements: iTexts.slice(0, 3),
      isAutoGenerated: true,
    };
  };

  if (!checkAiDailyLimit(clientIp)) {
    const fb = generateDeterministicFallback();
    return res.json({ success: true, data: fb });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey || apiKey.trim() === '' || apiKey === 'sk-...') {
    const fb = generateDeterministicFallback();
    aiCache.set(payloadHash, { data: fb, expireAt: Date.now() + 24 * 3600 * 1000 });
    return res.json({ success: true, data: fb });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = `Bạn là chuyên gia tư vấn website cho doanh nghiệp Việt Nam.
Trang: ${tenMien} (${loaiWebsite}).
Hãy viết ĐÚNG 1 câu nhận xét chân thành, súc tích cho mỗi mục theo ĐÚNG thứ tự danh sách dưới đây:

3 Điểm mạnh:
${JSON.stringify(strengthsItems, null, 2)}

3 Việc cần cải thiện:
${JSON.stringify(improvementsItems, null, 2)}

Yêu cầu trả về JSON chuẩn:
{
  "strengths": [
    { "id": "...", "text": "..." },
    { "id": "...", "text": "..." },
    { "id": "...", "text": "..." }
  ],
  "improvements": [
    { "id": "...", "text": "..." },
    { "id": "...", "text": "..." },
    { "id": "...", "text": "..." }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');

    // Kiểm tra tính hợp lệ của id và thứ tự
    const sExpectedIds = (strengthsItems as any[]).map((it) => it.id);
    const iExpectedIds = (improvementsItems as any[]).map((it) => it.id);

    const sResult: string[] = [];
    const iResult: string[] = [];

    let isValid = true;
    if (Array.isArray(parsed.strengths) && parsed.strengths.length === sExpectedIds.length) {
      for (let idx = 0; idx < sExpectedIds.length; idx++) {
        if (parsed.strengths[idx]?.id === sExpectedIds[idx] && parsed.strengths[idx]?.text) {
          sResult.push(parsed.strengths[idx].text);
        } else {
          isValid = false;
          break;
        }
      }
    } else {
      isValid = false;
    }

    if (Array.isArray(parsed.improvements) && parsed.improvements.length === iExpectedIds.length) {
      for (let idx = 0; idx < iExpectedIds.length; idx++) {
        if (parsed.improvements[idx]?.id === iExpectedIds[idx] && parsed.improvements[idx]?.text) {
          iResult.push(parsed.improvements[idx].text);
        } else {
          isValid = false;
          break;
        }
      }
    } else {
      isValid = false;
    }

    if (!isValid) {
      const fb = generateDeterministicFallback();
      return res.json({ success: true, data: fb });
    }

    const resultData = {
      strengths: sResult,
      improvements: iResult,
      isAutoGenerated: false,
    };

    aiCache.set(payloadHash, { data: resultData, expireAt: Date.now() + 24 * 3600 * 1000 });
    return res.json({ success: true, data: resultData });
  } catch (err: any) {
    const fb = generateDeterministicFallback();
    return res.json({ success: true, data: fb });
  }
});

// ---------------------------------------------------------------------------
// QUẢN LÝ LƯU TRỮ VÀ MÃ HÓA GOOGLE SEARCH CONSOLE TOKEN (AES-256-GCM)
// ---------------------------------------------------------------------------
const GSC_DATA_DIR = path.resolve(__dirname, 'data');
const GSC_ACCOUNTS_FILE = path.resolve(GSC_DATA_DIR, 'search_console_accounts.json');

if (!fs.existsSync(GSC_DATA_DIR)) {
  try {
    fs.mkdirSync(GSC_DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Không thể tạo thư mục data:', err);
  }
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.GOOGLE_CLIENT_SECRET ||
    'ong-nho-gsc-secure-encryption-key-2025-aistudio-build';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(plainText: string): { encryptedToken: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encryptedToken: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

function decryptToken(encryptedToken: string, ivHex: string, authTagHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

interface GscSite {
  siteUrl: string;
  permissionLevel: string;
  customCustomerName?: string;
}

interface GscAccount {
  email: string;
  encryptedRefreshToken: string;
  iv: string;
  authTag: string;
  linkedAt: string;
  sites: GscSite[];
  status?: 'active' | 'revoked' | 'error';
  lastChecked?: string;
  lastError?: string;
}

function normalizeSiteUrl(inputUrl: string, availableSites: GscSite[] = []): string {
  if (!inputUrl) return '';
  const trimmed = inputUrl.trim();

  // 1. Kiểm tra khớp chính xác với siteUrl nào trong danh sách
  const exactMatch = availableSites.find((s) => s.siteUrl === trimmed);
  if (exactMatch) return exactMatch.siteUrl;

  // Lấy domain sạch (loại bỏ sc-domain:, http://, https://, đuôi / và đường dẫn con)
  const cleanDomain = trimmed
    .replace(/^sc-domain:/i, '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();

  // 2. So khớp thông minh trong availableSites xem có site nào cùng domain không
  const domainMatch = availableSites.find((s) => {
    const sDomain = s.siteUrl
      .replace(/^sc-domain:/i, '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase();
    return sDomain === cleanDomain;
  });
  if (domainMatch) return domainMatch.siteUrl;

  // 3. Chuẩn hóa theo chuẩn Google Search Console:
  // - Thuộc tính miền (Domain Property): sc-domain:ten-mien.com
  // - Thuộc tính tiền tố URL (URL-prefix): https://ten-mien.com/ (bắt buộc có trailing slash)
  if (trimmed.toLowerCase().startsWith('sc-domain:')) {
    return `sc-domain:${cleanDomain}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  // Mặc định: trả về định dạng https://ten-mien.com/
  return `https://${cleanDomain}/`;
}

function translateGoogleError(errData: any, status: number): string {
  const rawMsg =
    errData?.error?.message ||
    (typeof errData?.error === 'string' ? errData.error : '') ||
    (typeof errData === 'string' ? errData : '');
  const reason =
    errData?.error?.details?.[0]?.reason ||
    errData?.error?.errors?.[0]?.reason ||
    '';

  const rawUpper = `${rawMsg} ${reason}`.toUpperCase();

  if (status === 403) {
    if (
      rawUpper.includes('SERVICE_DISABLED') ||
      rawUpper.includes('ACCESSNOTCONFIGURED') ||
      rawUpper.includes('HAS NOT BEEN USED') ||
      rawUpper.includes('IS DISABLED')
    ) {
      return 'Google Search Console API chưa được bật trên Google Cloud Project (Mã 403: SERVICE_DISABLED). Vui lòng vào Google Cloud Console > APIs & Services > Library, tìm "Google Search Console API" và bấm "Enable" (Bật) rồi thử lại.';
    }
    if (rawUpper.includes('PERMISSION') || rawUpper.includes('INSUFFICIENT')) {
      return `Tài khoản Google không có quyền truy cập website này trong Search Console (Mã 403: Forbidden). Hãy kiểm tra lại quyền của tài khoản trong Search Console. Chi tiết: ${rawMsg}`;
    }
    return `Google từ chối quyền truy cập (Mã 403): ${rawMsg}`;
  }

  if (status === 404 || rawUpper.includes('NOT FOUND')) {
    return `Không tìm thấy website trong Google Search Console (Mã 404). Hãy kiểm tra lại định dạng tên miền (sc-domain:ten-mien.com hoặc https://ten-mien.com/). Chi tiết: ${rawMsg}`;
  }

  if (status === 400 || rawUpper.includes('INVALID')) {
    return `Yêu cầu không hợp lệ tới Search Console (Mã 400): ${rawMsg}`;
  }

  if (status === 429 || rawUpper.includes('QUOTA') || rawUpper.includes('RATE')) {
    return `Đã vượt quá giới hạn lượt gọi API của Google (Mã 429: Quota Exceeded). Vui lòng thử lại sau ít phút.`;
  }

  if (status >= 500) {
    return `Máy chủ Google gặp sự cố nội bộ (Mã ${status}). Vui lòng thử lại sau. Chi tiết: ${rawMsg}`;
  }

  return `Lỗi từ Google Search Console (Mã ${status}): ${rawMsg || 'Không xác định'}`;
}

function loadGscAccounts(): GscAccount[] {
  try {
    if (fs.existsSync(GSC_ACCOUNTS_FILE)) {
      const data = fs.readFileSync(GSC_ACCOUNTS_FILE, 'utf-8');
      return JSON.parse(data) || [];
    }
  } catch (e) {
    console.error('Lỗi khi đọc tệp GSC accounts:', e);
  }
  return [];
}

function saveGscAccounts(accounts: GscAccount[]): void {
  try {
    fs.writeFileSync(GSC_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (e) {
    console.error('Lỗi khi lưu tệp GSC accounts:', e);
  }
}

async function getAccessTokenForAccount(account: GscAccount): Promise<string> {
  const refreshToken = decryptToken(account.encryptedRefreshToken, account.iv, account.authTag);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Chưa cấu hình GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET trên server.');
  }

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok) {
    if (tokenData.error === 'invalid_grant') {
      account.status = 'revoked';
      account.lastChecked = new Date().toISOString();
      const accounts = loadGscAccounts();
      saveGscAccounts(accounts.map((a) => (a.email === account.email ? account : a)));
      throw new Error('Quyền truy cập đã bị thu hồi hoặc hết hạn trong tài khoản Google. Vui lòng cấp quyền lại.');
    }
    throw new Error(tokenData.error_description || 'Không thể làm mới mã truy cập Google.');
  }

  account.status = 'active';
  account.lastChecked = new Date().toISOString();
  const accounts = loadGscAccounts();
  saveGscAccounts(accounts.map((a) => (a.email === account.email ? account : a)));

  return tokenData.access_token;
}

function findExactSiteInAccount(inputUrl: string, accountSites: GscSite[]): GscSite | undefined {
  if (!inputUrl) return undefined;
  const trimmed = inputUrl.trim();

  // 1. Khớp chính xác với siteUrl nào trong danh sách
  const exactMatch = accountSites.find((s) => s.siteUrl === trimmed);
  if (exactMatch) return exactMatch;

  // 2. So khớp domain sạch
  const cleanDomain = trimmed
    .replace(/^sc-domain:/i, '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();

  return accountSites.find((s) => {
    const sDomain = s.siteUrl
      .replace(/^sc-domain:/i, '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase();
    return sDomain === cleanDomain;
  });
}

function getDomainVariantsInAccount(targetSiteUrl: string, accountSites: GscSite[]): GscSite[] {
  const cleanDomain = targetSiteUrl
    .replace(/^sc-domain:/i, '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/^www\./i, '')
    .toLowerCase();

  return accountSites.filter((s) => {
    if (s.siteUrl === targetSiteUrl) return false;
    const sDomain = s.siteUrl
      .replace(/^sc-domain:/i, '')
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .replace(/^www\./i, '')
      .toLowerCase();
    return sDomain === cleanDomain;
  });
}

function shiftDateString(dateStr: string, daysOffset: number): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + daysOffset);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
}

async function fetchGscWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const resp = await fetch(url, options);
    if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
      attempt++;
      const delayMs = Math.min(Math.pow(2, attempt) * 500, 3000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    return resp;
  }
}

async function executeGscSearchQuery(
  account: GscAccount,
  siteUrl: string,
  bodyParams: { startDate: string; endDate: string; dimensions: string[]; rowLimit?: number },
  options: {
    checkVariantsOn403?: boolean;
    retryEmptyData?: boolean;
  } = { checkVariantsOn403: true, retryEmptyData: true }
): Promise<{
  ok: boolean;
  status: number;
  data: any;
  resolvedSiteUrl: string;
  actualStartDate: string;
  actualEndDate: string;
  shiftedDays?: number;
  error?: string;
  errorType?: 'service_disabled' | 'permission_denied' | 'token_revoked' | 'other';
}> {
  let accessToken: string;
  try {
    accessToken = await getAccessTokenForAccount(account);
  } catch (err: any) {
    return {
      ok: false,
      status: 401,
      data: null,
      resolvedSiteUrl: siteUrl,
      actualStartDate: bodyParams.startDate,
      actualEndDate: bodyParams.endDate,
      error: err.message || 'Không thể lấy mã truy cập Google.',
      errorType: 'token_revoked',
    };
  }

  // Dùng đúng siteUrl từ sites.list của tài khoản nếu có
  const matchedSite = findExactSiteInAccount(siteUrl, account.sites);
  let targetSiteUrl = matchedSite ? matchedSite.siteUrl : siteUrl;

  const tryCall = async (sUrl: string, reqBody: any) => {
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      sUrl
    )}/searchAnalytics/query`;

    let resp = await fetchGscWithRetry(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    });

    // Nếu token hết hạn (401), tự refresh token và gọi lại 1 lần
    if (resp.status === 401) {
      try {
        accessToken = await getAccessTokenForAccount(account);
        resp = await fetchGscWithRetry(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reqBody),
        });
      } catch (e) {
        // Refresh token không thành công
      }
    }

    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  };

  let { resp, data } = await tryCall(targetSiteUrl, bodyParams);

  // Nếu bị 403: tự động thử biến thể khác có trong sites.list của chính tài khoản đó
  if (!resp.ok && resp.status === 403 && options.checkVariantsOn403) {
    const variants = getDomainVariantsInAccount(targetSiteUrl, account.sites);
    for (const variant of variants) {
      const vResult = await tryCall(variant.siteUrl, bodyParams);
      if (vResult.resp.ok) {
        resp = vResult.resp;
        data = vResult.data;
        targetSiteUrl = variant.siteUrl;
        break;
      }
    }
  }

  // Nếu vẫn lỗi sau khi thử
  if (!resp.ok) {
    const rawMsg = data?.error?.message || '';
    const rawUpper = `${rawMsg}`.toUpperCase();
    let errorType: 'service_disabled' | 'permission_denied' | 'token_revoked' | 'other' = 'other';
    if (rawUpper.includes('SERVICE_DISABLED') || rawUpper.includes('ACCESSNOTCONFIGURED')) {
      errorType = 'service_disabled';
    } else if (resp.status === 403) {
      errorType = 'permission_denied';
    }

    return {
      ok: false,
      status: resp.status,
      data,
      resolvedSiteUrl: targetSiteUrl,
      actualStartDate: bodyParams.startDate,
      actualEndDate: bodyParams.endDate,
      error: translateGoogleError(data, resp.status),
      errorType,
    };
  }

  // Dữ liệu rỗng: Tự lùi ngày kết thúc thêm 1-3 ngày rồi thử lại trước khi báo chưa có dữ liệu
  let actualStartDate = bodyParams.startDate;
  let actualEndDate = bodyParams.endDate;
  let shiftedDays = 0;

  if (options.retryEmptyData && (!data.rows || data.rows.length === 0)) {
    for (let shift = 1; shift <= 3; shift++) {
      const shiftedEnd = shiftDateString(bodyParams.endDate, -shift);
      const shiftedStart = shiftDateString(bodyParams.startDate, -shift);
      const shiftedBody = { ...bodyParams, startDate: shiftedStart, endDate: shiftedEnd };
      const shiftedResult = await tryCall(targetSiteUrl, shiftedBody);
      if (shiftedResult.resp.ok && Array.isArray(shiftedResult.data?.rows) && shiftedResult.data.rows.length > 0) {
        data = shiftedResult.data;
        actualStartDate = shiftedStart;
        actualEndDate = shiftedEnd;
        shiftedDays = shift;
        break;
      }
    }
  }

  return {
    ok: true,
    status: 200,
    data,
    resolvedSiteUrl: targetSiteUrl,
    actualStartDate,
    actualEndDate,
    shiftedDays,
  };
}

// ---------------------------------------------------------------------------
// GOOGLE OAUTH ENDPOINTS
// ---------------------------------------------------------------------------
function getGoogleRedirectUri(req: ExpressRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  if (process.env.REDIRECT_URI && process.env.REDIRECT_URI.trim()) {
    return process.env.REDIRECT_URI.trim();
  }
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${appUrl}/auth/google/callback`;
}

app.get('/auth/google/url', (req: ExpressRequest, res: ExpressResponse) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || clientId.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Chưa cấu hình GOOGLE_CLIENT_ID trong biến môi trường máy chủ.',
    });
  }

  const redirectUri = getGoogleRedirectUri(req);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set(
    'scope',
    'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email'
  );
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return res.json({
    success: true,
    url: authUrl.toString(),
  });
});

app.get('/auth/google/callback', async (req: ExpressRequest, res: ExpressResponse) => {
  const code = (req.query.code as string) || '';
  const error = (req.query.error as string) || '';

  if (error || !code) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Lỗi cấp quyền Google</title>
          <style>
            body { font-family: 'Be Vietnam Pro', Arial, sans-serif; text-align: center; padding: 40px; background: #FFFBF0; color: #2B1B0E; }
            .box { max-width: 500px; margin: 0 auto; background: white; padding: 24px; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            button { background: #FFB400; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2 style="color: #D64545;">Chưa hoàn tất cấp quyền</h2>
            <p>Google phản hồi: <strong>${error || 'Không nhận được mã ủy quyền'}</strong></p>
            <p>Bạn có thể đóng cửa sổ này và thử lại.</p>
            <button onclick="window.close()">Đóng cửa sổ</button>
          </div>
        </body>
      </html>
    `);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleRedirectUri(req);

  try {
    // 1. Đổi code lấy tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Không thể đổi mã ủy quyền.');
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // 2. Lấy email người dùng
    const userinfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userinfo = await userinfoResp.json();
    const email = userinfo.email || 'unknown@gmail.com';

    // 3. Lấy danh sách website từ Google Search Console
    let sites: GscSite[] = [];
    let lastError: string | undefined = undefined;
    let accountStatus: 'active' | 'revoked' | 'error' = 'active';

    try {
      const sitesResp = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!sitesResp.ok) {
        const errorJson = await sitesResp.json().catch(() => ({}));
        const status = sitesResp.status;
        const rawMsg = errorJson?.error?.message || errorJson?.error_description || '';
        const reason =
          errorJson?.error?.details?.[0]?.reason ||
          errorJson?.error?.errors?.[0]?.reason ||
          '';
        const rawUpper = `${rawMsg} ${reason}`.toUpperCase();

        accountStatus = 'error';

        if (
          status === 403 &&
          (rawUpper.includes('SERVICE_DISABLED') ||
            rawUpper.includes('ACCESSNOTCONFIGURED') ||
            rawUpper.includes('HAS NOT BEEN USED') ||
            rawUpper.includes('IS DISABLED'))
        ) {
          // Trường hợp (a): Search Console API chưa bật
          lastError =
            'Google Search Console API chưa được bật trên Google Cloud Project (Mã lỗi 403: SERVICE_DISABLED). Vui lòng vào Google Cloud Console > APIs & Services > Library, tìm "Google Search Console API" và bấm "Enable" (Bật) rồi thử lại.';
        } else {
          // Trường hợp (c): Lỗi khác từ Google kèm mã lỗi và thông điệp (tuyệt đối không ghi token)
          const safeMsg = rawMsg ? rawMsg.replace(/ya29\.[a-zA-Z0-9_\-]+/g, '[TOKEN]') : 'Không thể lấy danh sách website';
          lastError = `Lỗi từ Google Search Console (Mã lỗi ${status}): ${safeMsg}`;
        }
      } else {
        const sitesData = await sitesResp.json().catch(() => ({}));
        if (Array.isArray(sitesData.siteEntry)) {
          sites = sitesData.siteEntry.map((s: any) => ({
            siteUrl: s.siteUrl,
            permissionLevel: s.permissionLevel || 'siteOwner',
          }));
        }

        if (sites.length === 0) {
          // Trường hợp (b): Kết nối thành công nhưng tài khoản chưa có website nào trong Search Console
          lastError =
            'Đã kết nối tài khoản Google thành công, nhưng tài khoản này chưa có website nào trong Google Search Console. Vui lòng thêm website vào Search Console (search.google.com/search-console) trước.';
          accountStatus = 'active';
        } else {
          lastError = undefined;
          accountStatus = 'active';
        }
      }
    } catch (e: any) {
      console.error('Không thể lấy danh sách site từ GSC:', e);
      accountStatus = 'error';
      lastError = `Không thể kết nối máy chủ Google Search Console: ${e?.message || 'Lỗi mạng'}`;
    }

    // 4. Lưu hoặc cập nhật tài khoản
    const accounts = loadGscAccounts();
    const existing = accounts.find((a) => a.email === email);

    let encryptedRefreshToken = '';
    let iv = '';
    let authTag = '';

    if (refreshToken) {
      const enc = encryptToken(refreshToken);
      encryptedRefreshToken = enc.encryptedToken;
      iv = enc.iv;
      authTag = enc.authTag;
    } else if (existing) {
      // Giữ refresh token cũ nếu lần này Google không trả về do đã cấp phép
      encryptedRefreshToken = existing.encryptedRefreshToken;
      iv = existing.iv;
      authTag = existing.authTag;
    } else {
      throw new Error('Google không trả về refresh token. Vui lòng bấm hủy quyền trong cài đặt Google và cấp quyền lại.');
    }

    // Giữ lại customCustomerName đã đặt trước đó nếu có
    const updatedSites = sites.map((s) => {
      const old = existing?.sites.find((oldS) => oldS.siteUrl === s.siteUrl);
      return {
        ...s,
        customCustomerName: old?.customCustomerName,
      };
    });

    const newAccount: GscAccount = {
      email,
      encryptedRefreshToken,
      iv,
      authTag,
      linkedAt: existing ? existing.linkedAt : new Date().toISOString(),
      sites: updatedSites,
      status: accountStatus,
      lastChecked: new Date().toISOString(),
      lastError,
    };

    const remaining = accounts.filter((a) => a.email !== email);
    remaining.push(newAccount);
    saveGscAccounts(remaining);

    // 5. Trả về trang thông báo theo từng trường hợp
    let headingHtml = '';
    let bodyHtml = '';

    if (accountStatus === 'error') {
      const isServiceDisabled = lastError?.includes('SERVICE_DISABLED');
      headingHtml = `<h2 style="color: #D64545;">${isServiceDisabled ? 'Cần bật Google Search Console API' : 'Lỗi từ Google Search Console'}</h2>`;
      bodyHtml = `
        <div style="background: #FEE2E2; border: 1px solid #FCA5A5; padding: 14px; border-radius: 8px; text-align: left; font-size: 13px; color: #991B1B; line-height: 1.6; margin-bottom: 16px;">
          ${lastError}
        </div>
        ${isServiceDisabled ? `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; border-radius: 8px; text-align: left; font-size: 12px; color: #92400E; margin-bottom: 16px;">
            <strong>Hướng dẫn bật API trên Google Cloud:</strong>
            <ol style="margin: 6px 0 0 16px; padding: 0;">
              <li>Mở <a href="https://console.cloud.google.com" target="_blank" style="color: #2563EB; font-weight: bold;">Google Cloud Console</a>.</li>
              <li>Chọn đúng dự án chứa OAuth Client ID.</li>
              <li>Vào menu <strong>APIs & Services &gt; Library</strong>.</li>
              <li>Tìm kiếm <strong>"Google Search Console API"</strong> và bấm <strong>Enable (Bật)</strong>.</li>
              <li>Đợi 1-2 phút rồi bấm Cấp quyền lại trong app Ong Nhỏ.</li>
            </ol>
          </div>
        ` : ''}
        <button onclick="window.close()" style="background:#FFB400;border:none;padding:10px 20px;font-weight:bold;border-radius:8px;cursor:pointer;">Đóng cửa sổ</button>
      `;
    } else if (sites.length === 0) {
      headingHtml = `<h2 style="color: #D97706;">Đã kết nối, nhưng chưa có website</h2>`;
      bodyHtml = `
        <p>Tài khoản: <strong>${email}</strong> đã kết nối thành công, nhưng chưa có website nào được xác minh trong Search Console.</p>
        <div style="background: #FEF3C7; border: 1px solid #FCD34D; padding: 12px; border-radius: 8px; text-align: left; font-size: 12px; color: #92400E; margin-bottom: 16px;">
          Vui lòng truy cập <a href="https://search.google.com/search-console" target="_blank" style="color: #2563EB; font-weight: bold;">search.google.com/search-console</a> để thêm và xác minh website của bạn.
        </div>
        <button onclick="window.close()" style="background:#FFB400;border:none;padding:10px 20px;font-weight:bold;border-radius:8px;cursor:pointer;">Đóng cửa sổ</button>
      `;
    } else {
      headingHtml = `<h2 style="color: #2E9E5B;">Kết nối Google Search Console thành công!</h2>`;
      bodyHtml = `
        <p>Tài khoản: <strong>${email}</strong> (${sites.length} website)</p>
        <p>Hệ thống đang tự động quay về ứng dụng Ong Nhỏ...</p>
      `;
    }

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Kết nối Google Search Console – Ong Nhỏ</title>
          <style>
            body { font-family: 'Be Vietnam Pro', Arial, sans-serif; text-align: center; padding: 30px; background: #FFFBF0; color: #2B1B0E; }
            .box { max-width: 520px; margin: 0 auto; background: white; padding: 24px; border-radius: 16px; border: 1px solid #E5E7EB; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
            a { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="box">
            ${headingHtml}
            ${bodyHtml}
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'GSC_AUTH_SUCCESS', email: '${email}' }, '*');
                ${accountStatus === 'active' && sites.length > 0 ? 'setTimeout(() => window.close(), 1500);' : ''}
              }
            } catch (e) {
              console.warn(e);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Lỗi kết nối</title>
          <style>
            body { font-family: 'Be Vietnam Pro', Arial, sans-serif; text-align: center; padding: 40px; background: #FFFBF0; color: #2B1B0E; }
            .box { max-width: 500px; margin: 0 auto; background: white; padding: 24px; border-radius: 12px; border: 1px solid #F8B4B4; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2 style="color: #D64545;">Lỗi khi kết nối Google</h2>
            <p>${err.message || 'Lỗi không xác định.'}</p>
            <button onclick="window.close()" style="background:#FFB400;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">Đóng cửa sổ</button>
          </div>
        </body>
      </html>
    `);
  }
});

// ---------------------------------------------------------------------------
// GSC API: Trạng thái cấu hình & Chế độ Demo
// ---------------------------------------------------------------------------
app.get('/api/gsc/status', (_req: ExpressRequest, res: ExpressResponse) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const isConfigured = Boolean(
    clientId.trim() &&
    clientSecret.trim() &&
    !clientSecret.includes('<<')
  );
  const isDemo = process.env.GSC_DEMO === 'true';

  return res.json({
    success: true,
    isConfigured,
    isDemo,
    hasClientId: Boolean(clientId.trim()),
    hasClientSecret: Boolean(clientSecret.trim() && !clientSecret.includes('<<')),
  });
});

// ---------------------------------------------------------------------------
// GSC API: Danh sách website & Sức khỏe token
// ---------------------------------------------------------------------------
app.get('/api/gsc/accounts', async (_req: ExpressRequest, res: ExpressResponse) => {
  const isDemo = process.env.GSC_DEMO === 'true';
  const accounts = loadGscAccounts();

  if (isDemo && accounts.length === 0) {
    return res.json({
      success: true,
      isDemo: true,
      data: [
        {
          email: 'demo@ongnho.vn',
          linkedAt: new Date().toISOString(),
          status: 'active',
          sites: [
            {
              siteUrl: 'https://ongnho.vn',
              permissionLevel: 'siteOwner',
              customCustomerName: 'Ong Nhỏ (Bản Demo)',
            },
          ],
        },
      ],
    });
  }

  const safeAccounts = accounts.map((acc) => ({
    email: acc.email,
    linkedAt: acc.linkedAt,
    status: acc.status || 'active',
    lastChecked: acc.lastChecked,
    sites: acc.sites,
    lastError: acc.lastError,
  }));
  return res.json({ success: true, isDemo, data: safeAccounts });
});

app.post('/api/gsc/customer-name', (req: ExpressRequest, res: ExpressResponse) => {
  const { email, siteUrl, customerName } = req.body || {};
  if (!email || !siteUrl) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin email hoặc siteUrl.' });
  }

  const accounts = loadGscAccounts();
  const acc = accounts.find((a) => a.email === email);
  if (!acc) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
  }

  const targetSite = acc.sites.find((s) => s.siteUrl === siteUrl);
  if (targetSite) {
    targetSite.customCustomerName = (customerName || '').trim();
    saveGscAccounts(accounts);
  }

  return res.json({ success: true, message: 'Đã cập nhật tên khách hàng.' });
});

app.post('/api/gsc/delete-account', (req: ExpressRequest, res: ExpressResponse) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ success: false, error: 'Thiếu email cần xóa.' });
  }

  const accounts = loadGscAccounts();
  const filtered = accounts.filter((a) => a.email !== email);
  saveGscAccounts(filtered);
  return res.json({ success: true, message: 'Đã gỡ liên kết tài khoản Google.' });
});

// ---------------------------------------------------------------------------
// GSC API: Phân tích số liệu Search Console (1 Website cụ thể)
// ---------------------------------------------------------------------------
app.post('/api/gsc/analytics', async (req: ExpressRequest, res: ExpressResponse) => {
  const {
    email,
    siteUrl,
    startDate,
    endDate,
    dimension = 'query',
    compareStartDate,
    compareEndDate,
  } = req.body || {};

  if (!email || !siteUrl || !startDate || !endDate) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin truy vấn thống kê.' });
  }

  const isDemo = process.env.GSC_DEMO === 'true';

  // Chế độ dữ liệu mẫu khi bật GSC_DEMO=true
  if (isDemo && (email === 'demo@ongnho.vn' || siteUrl.includes('ongnho.vn') || loadGscAccounts().length === 0)) {
    const demoDailyRows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> = [];
    const startD = new Date(startDate);
    const endD = new Date(endDate);
    const dayCount = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24))) + 1;

    for (let i = 0; i < dayCount; i++) {
      const cur = new Date(startD);
      cur.setDate(cur.getDate() + i);
      const dStr = cur.toISOString().slice(0, 10);
      const baseImp = Math.floor(400 + Math.sin(i * 0.4) * 120 + (i % 7) * 20);
      const baseClk = Math.floor(baseImp * 0.015 + (i % 3));
      demoDailyRows.push({
        keys: [dStr],
        clicks: baseClk,
        impressions: baseImp,
        ctr: baseImp > 0 ? Math.round((baseClk / baseImp) * 1000) / 10 : 0,
        position: 14.2,
      });
    }

    const demoDeviceRows = [
      { keys: ['MOBILE'], clicks: 116, impressions: 9672, ctr: 1.2, position: 14.8 },
      { keys: ['DESKTOP'], clicks: 68, impressions: 2480, ctr: 2.74, position: 11.5 },
      { keys: ['TABLET'], clicks: 2, impressions: 248, ctr: 0.81, position: 16.0 },
    ];

    const demoPageRows = [
      { keys: ['https://ongnho.vn/dich-vu'], clicks: 14, impressions: 2000, ctr: 0.7, position: 12.4 },
      { keys: ['https://ongnho.vn/gioi-thieu'], clicks: 9, impressions: 1500, ctr: 0.6, position: 13.8 },
      { keys: ['https://ongnho.vn/san-pham'], clicks: 10, impressions: 1200, ctr: 0.83, position: 14.1 },
      { keys: ['https://ongnho.vn/tin-tuc'], clicks: 12, impressions: 800, ctr: 1.5, position: 15.2 },
      { keys: ['https://ongnho.vn/'], clicks: 125, impressions: 5500, ctr: 2.27, position: 8.5 },
    ];

    let demoTableRows = demoPageRows;
    if (dimension === 'device') {
      demoTableRows = demoDeviceRows;
    } else if (dimension === 'query') {
      demoTableRows = [
        { keys: ['ong nho seo'], clicks: 45, impressions: 820, ctr: 5.49, position: 1.8 },
        { keys: ['kiem tra website chuan seo'], clicks: 32, impressions: 1450, ctr: 2.21, position: 4.2 },
        { keys: ['thiet ke web chuan seo'], clicks: 28, impressions: 2100, ctr: 1.33, position: 8.9 },
        { keys: ['dich vu seo uy tin'], clicks: 18, impressions: 1980, ctr: 0.91, position: 11.4 },
        { keys: ['bao gia dich vu seo'], clicks: 12, impressions: 1650, ctr: 0.73, position: 13.2 },
      ];
    }

    return res.json({
      success: true,
      isDemo: true,
      data: {
        siteUrl: 'https://ongnho.vn',
        resolvedSiteUrl: 'https://ongnho.vn',
        startDate,
        endDate,
        originalStartDate: startDate,
        originalEndDate: endDate,
        shiftedDays: 0,
        siteStatus: 'ok',
        dimension,
        tableRows: demoTableRows,
        dailyRows: demoDailyRows,
        deviceRows: demoDeviceRows,
        pageRows: demoPageRows,
        totals: {
          clicks: 186,
          impressions: 12400,
          ctr: 1.5,
          position: 14.2,
        },
        comparison: {
          prevClicks: 166,
          prevImpressions: 11800,
          prevCtr: 1.41,
          prevPosition: 15.0,
          clicksDiff: 20,
          clicksDiffPercent: 12.0,
          impressionsDiff: 600,
          impressionsDiffPercent: 5.1,
          ctrDiff: 0.09,
          positionDiff: -0.8,
        },
      },
    });
  }

  const accounts = loadGscAccounts();
  const account = accounts.find((a) => a.email === email);
  if (!account) {
    return res.status(404).json({ success: false, error: 'Tài khoản chưa được kết nối.' });
  }

  try {
    // 1. Lấy dữ liệu theo dimension
    const mainQueryRes = await executeGscSearchQuery(
      account,
      siteUrl,
      { startDate, endDate, dimensions: [dimension], rowLimit: 50 },
      { checkVariantsOn403: true, retryEmptyData: true }
    );

    if (!mainQueryRes.ok) {
      return res.status(mainQueryRes.status).json({
        success: false,
        error: mainQueryRes.error,
        errorType: mainQueryRes.errorType,
        siteUrl,
        resolvedSiteUrl: mainQueryRes.resolvedSiteUrl,
      });
    }

    const actualStartDate = mainQueryRes.actualStartDate;
    const actualEndDate = mainQueryRes.actualEndDate;
    const resolvedSiteUrl = mainQueryRes.resolvedSiteUrl;
    const shiftedDays = mainQueryRes.shiftedDays || 0;
    const mainRows = mainQueryRes.data?.rows || [];

    // 2. Lấy dữ liệu chuỗi thời gian theo ngày để vẽ biểu đồ
    const dailyQueryRes = await executeGscSearchQuery(
      account,
      resolvedSiteUrl,
      { startDate: actualStartDate, endDate: actualEndDate, dimensions: ['date'], rowLimit: 100 },
      { checkVariantsOn403: false, retryEmptyData: false }
    );

    const currentRows = dailyQueryRes.ok ? dailyQueryRes.data?.rows || [] : [];

    // 3. Lấy dữ liệu device (MOBILE, DESKTOP, TABLET) cho Phần 1
    const deviceQueryRes = await executeGscSearchQuery(
      account,
      resolvedSiteUrl,
      { startDate: actualStartDate, endDate: actualEndDate, dimensions: ['device'], rowLimit: 10 },
      { checkVariantsOn403: false, retryEmptyData: false }
    );
    const deviceRows = deviceQueryRes.ok ? deviceQueryRes.data?.rows || [] : [];

    // 4. Lấy dữ liệu trang (page) cho Phần 2
    const pageQueryRes = await executeGscSearchQuery(
      account,
      resolvedSiteUrl,
      { startDate: actualStartDate, endDate: actualEndDate, dimensions: ['page'], rowLimit: 50 },
      { checkVariantsOn403: false, retryEmptyData: false }
    );
    const pageRows = pageQueryRes.ok ? pageQueryRes.data?.rows || [] : [];

    // 5. Lấy dữ liệu kỳ so sánh nếu có
    let compareRows: any[] = [];
    if (compareStartDate && compareEndDate) {
      const compRes = await executeGscSearchQuery(
        account,
        resolvedSiteUrl,
        { startDate: compareStartDate, endDate: compareEndDate, dimensions: ['date'], rowLimit: 100 },
        { checkVariantsOn403: false, retryEmptyData: false }
      );
      if (compRes.ok && Array.isArray(compRes.data?.rows)) {
        compareRows = compRes.data.rows;
      }
    }

    // Tính tổng số liệu chu kỳ hiện tại
    let totalClicks = 0;
    let totalImpressions = 0;
    let weightedPositionSum = 0;

    for (const r of currentRows) {
      totalClicks += r.clicks || 0;
      totalImpressions += r.impressions || 0;
      weightedPositionSum += (r.position || 0) * (r.impressions || 0);
    }

    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgPosition = totalImpressions > 0 ? weightedPositionSum / totalImpressions : 0;

    // Tính tổng số liệu chu kỳ trước
    let compTotalClicks = 0;
    let compTotalImpressions = 0;
    let compWeightedPosSum = 0;

    for (const r of compareRows) {
      compTotalClicks += r.clicks || 0;
      compTotalImpressions += r.impressions || 0;
      compWeightedPosSum += (r.position || 0) * (r.impressions || 0);
    }

    const compAvgCtr = compTotalImpressions > 0 ? (compTotalClicks / compTotalImpressions) * 100 : 0;
    const compAvgPosition = compTotalImpressions > 0 ? compWeightedPosSum / compTotalImpressions : 0;

    const calcPercentDiff = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    const hasData = mainRows.length > 0 || (currentRows.length > 0 && (totalClicks > 0 || totalImpressions > 0));
    const siteStatus: 'ok' | 'no_data' = hasData ? 'ok' : 'no_data';

    return res.json({
      success: true,
      data: {
        siteUrl,
        resolvedSiteUrl,
        startDate: actualStartDate,
        endDate: actualEndDate,
        originalStartDate: startDate,
        originalEndDate: endDate,
        shiftedDays,
        siteStatus,
        dimension,
        tableRows: mainRows,
        dailyRows: currentRows,
        deviceRows,
        pageRows,
        totals: {
          clicks: totalClicks,
          impressions: totalImpressions,
          ctr: Math.round(avgCtr * 100) / 100,
          position: Math.round(avgPosition * 10) / 10,
        },
        comparison: compareRows.length > 0
          ? {
              prevClicks: compTotalClicks,
              prevImpressions: compTotalImpressions,
              prevCtr: Math.round(compAvgCtr * 100) / 100,
              prevPosition: Math.round(compAvgPosition * 10) / 10,
              clicksDiff: totalClicks - compTotalClicks,
              clicksDiffPercent: calcPercentDiff(totalClicks, compTotalClicks),
              impressionsDiff: totalImpressions - compTotalImpressions,
              impressionsDiffPercent: calcPercentDiff(totalImpressions, compTotalImpressions),
              ctrDiff: Math.round((avgCtr - compAvgCtr) * 100) / 100,
              positionDiff: Math.round((avgPosition - compAvgPosition) * 10) / 10,
            }
          : null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Lỗi khi truy xuất dữ liệu từ Google Search Console.',
    });
  }
});

// ---------------------------------------------------------------------------
// GSC API: Tổng hợp & So sánh nhiều website (Promise.allSettled)
// ---------------------------------------------------------------------------
app.post('/api/gsc/overview', async (req: ExpressRequest, res: ExpressResponse) => {
  const { email = 'all', startDate, endDate } = req.body || {};
  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin ngày bắt đầu hoặc kết thúc.' });
  }

  const allAccounts = loadGscAccounts();
  const accountsToQuery = email === 'all'
    ? allAccounts
    : allAccounts.filter((a) => a.email === email);

  if (accountsToQuery.length === 0) {
    return res.json({
      success: true,
      data: {
        summary: {
          totalClicks: 0,
          totalImpressions: 0,
          avgCtr: 0,
          totalSites: 0,
          activeSites: 0,
          noDataSites: 0,
          errorSites: 0,
        },
        sites: [],
      },
    });
  }

  // Tập hợp danh sách các site từ các tài khoản cần truy vấn
  const siteQueries: Array<{ account: GscAccount; site: GscSite }> = [];
  for (const acc of accountsToQuery) {
    for (const site of acc.sites || []) {
      siteQueries.push({ account: acc, site });
    }
  }

  // Sử dụng Promise.allSettled: Một website bị lỗi (403, 404, etc.) không làm hỏng cả trang
  const results = await Promise.allSettled(
    siteQueries.map(async ({ account, site }) => {
      try {
        const queryRes = await executeGscSearchQuery(
          account,
          site.siteUrl,
          { startDate, endDate, dimensions: ['date'], rowLimit: 100 },
          { checkVariantsOn403: true, retryEmptyData: true }
        );

        if (!queryRes.ok) {
          return {
            siteUrl: site.siteUrl,
            resolvedSiteUrl: queryRes.resolvedSiteUrl,
            email: account.email,
            customerName: site.customCustomerName,
            status: 'error' as const,
            error: queryRes.error || 'Lỗi truy xuất số liệu từ Google.',
            errorType: queryRes.errorType,
            totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
          };
        }

        const rows = queryRes.data?.rows || [];
        let clicks = 0;
        let impressions = 0;
        let weightedPos = 0;

        for (const r of rows) {
          clicks += r.clicks || 0;
          impressions += r.impressions || 0;
          weightedPos += (r.position || 0) * (r.impressions || 0);
        }

        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const position = impressions > 0 ? weightedPos / impressions : 0;
        const hasData = rows.length > 0 && (clicks > 0 || impressions > 0);

        return {
          siteUrl: site.siteUrl,
          resolvedSiteUrl: queryRes.resolvedSiteUrl,
          email: account.email,
          customerName: site.customCustomerName,
          status: hasData ? ('ok' as const) : ('no_data' as const),
          shiftedDays: queryRes.shiftedDays,
          actualStartDate: queryRes.actualStartDate,
          actualEndDate: queryRes.actualEndDate,
          totals: {
            clicks,
            impressions,
            ctr: Math.round(ctr * 100) / 100,
            position: Math.round(position * 10) / 10,
          },
        };
      } catch (err: any) {
        return {
          siteUrl: site.siteUrl,
          resolvedSiteUrl: site.siteUrl,
          email: account.email,
          customerName: site.customCustomerName,
          status: 'error' as const,
          error: err.message || 'Lỗi kết nối tới tài khoản Google.',
          errorType: 'other' as const,
          totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        };
      }
    })
  );

  const siteList = results.map((r, idx) => {
    if (r.status === 'fulfilled') {
      return r.value;
    } else {
      const fallback = siteQueries[idx];
      return {
        siteUrl: fallback.site.siteUrl,
        resolvedSiteUrl: fallback.site.siteUrl,
        email: fallback.account.email,
        customerName: fallback.site.customCustomerName,
        status: 'error' as const,
        error: r.reason?.message || 'Lỗi không xác định khi truy vấn website.',
        errorType: 'other' as const,
        totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      };
    }
  });

  // Tính tổng hợp
  let sumClicks = 0;
  let sumImpressions = 0;
  let activeSites = 0;
  let noDataSites = 0;
  let errorSites = 0;

  for (const s of siteList) {
    sumClicks += s.totals.clicks || 0;
    sumImpressions += s.totals.impressions || 0;
    if (s.status === 'ok') activeSites++;
    else if (s.status === 'no_data') noDataSites++;
    else if (s.status === 'error') errorSites++;
  }

  const overallCtr = sumImpressions > 0 ? (sumClicks / sumImpressions) * 100 : 0;

  return res.json({
    success: true,
    data: {
      summary: {
        totalClicks: sumClicks,
        totalImpressions: sumImpressions,
        avgCtr: Math.round(overallCtr * 100) / 100,
        totalSites: siteList.length,
        activeSites,
        noDataSites,
        errorSites,
      },
      sites: siteList,
    },
  });
});

// ---------------------------------------------------------------------------
// GSC API: Nhận định từ số liệu Search Console (Chỉ sự thật, không lời khuyên)
// ---------------------------------------------------------------------------
app.post('/api/gsc/ai-summary', async (req: ExpressRequest, res: ExpressResponse) => {
  const { siteUrl, stats } = req.body || {};
  if (!stats) {
    return res.status(400).json({ success: false, error: 'Thiếu dữ liệu số liệu.' });
  }

  const generateDeterministicStatements = (): string[] => {
    const clicks = stats.totals?.clicks || 0;
    const impressions = stats.totals?.impressions || 0;
    const ctr = stats.totals?.ctr || 0;
    const pos = stats.totals?.position || 0;

    const list: string[] = [];

    // 1. Lưu lượng hiển thị & lượt nhấp
    if (impressions < 100) {
      list.push(`Website có ${clicks.toLocaleString('vi-VN')} lượt nhấp từ ${impressions.toLocaleString('vi-VN')} lượt hiển thị (chưa đủ dữ liệu để kết luận do dưới 100 lượt hiển thị).`);
    } else {
      list.push(`Website ghi nhận ${clicks.toLocaleString('vi-VN')} lượt nhấp từ ${impressions.toLocaleString('vi-VN')} lượt hiển thị trên kết quả tìm kiếm Google.`);
    }

    // 2. Tỷ lệ CTR
    if (impressions >= 100) {
      if (ctr >= 2.5) {
        list.push(`Tỷ lệ nhấp CTR đạt ${ctr}%, cao hơn mức trung bình 2% của kết quả tìm kiếm thông thường.`);
      } else {
        list.push(`Tỷ lệ nhấp CTR đạt ${ctr}%, thấp hơn mức trung bình 2% của kết quả tìm kiếm thông thường.`);
      }
    }

    // 3. Vị trí trung bình
    if (impressions >= 100) {
      if (pos <= 10) {
        list.push(`Vị trí trung bình đạt ${pos}, nằm trong trang 1 của kết quả tìm kiếm Google.`);
      } else {
        list.push(`Vị trí trung bình là ${pos}, nằm ngoài trang 1 của kết quả tìm kiếm Google.`);
      }
    }

    // 4. So sánh kỳ trước nếu có
    if (stats.comparison) {
      const diffP = stats.comparison.clicksDiffPercent || 0;
      if (diffP > 0) {
        list.push(`Lượt nhấp tăng ${diffP}% so với chu kỳ trước.`);
      } else if (diffP < 0) {
        list.push(`Lượt nhấp giảm ${Math.abs(diffP)}% so với chu kỳ trước.`);
      }
    }

    return list;
  };

  const defaultStatements = generateDeterministicStatements();
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey || apiKey.trim() === '' || apiKey === 'sk-...') {
    return res.json({
      success: true,
      data: {
        statements: defaultStatements,
        isAutoGenerated: true,
      },
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = `Bạn là hệ thống tóm tắt dữ liệu thống kê Google Search Console.
Website: ${siteUrl}
Số liệu thật:
- Lượt nhấp: ${stats.totals?.clicks}
- Lượt hiển thị: ${stats.totals?.impressions}
- Tỷ lệ CTR: ${stats.totals?.ctr}%
- Vị trí trung bình: ${stats.totals?.position}
${stats.comparison ? `- Tăng trưởng lượt nhấp: ${stats.comparison.clicksDiffPercent}%` : ''}

Quy tắc TUYỆT ĐỐI:
1. Chỉ diễn đạt lại các nhận định về sự thật đang xảy ra từ số liệu trên.
2. TUYỆT ĐỐI KHÔNG đưa ra lời khuyên, hướng dẫn, hành động hay giải pháp.
3. CẤM sử dụng các từ: "nên", "hãy", "cần", "gợi ý", "đề xuất", "khuyên", "thử".
4. Không được tự nghĩ ra bất kỳ số liệu nào ngoài các số đã cung cấp ở trên.

Trả về JSON:
{
  "statements": ["nhận định 1", "nhận định 2", "nhận định 3"]
}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    const aiStatements = Array.isArray(parsed.statements) ? parsed.statements : [];

    // Kiểm tra tính hợp lệ: không chứa từ cấm và số liệu phải có trong input
    const forbiddenRegex = /\b(nên|hãy|cần|gợi ý|đề xuất|khuyên|thử)\b/i;
    const validStatements: string[] = [];

    const allowedNumberStrings = [
      String(stats.totals?.clicks),
      String(stats.totals?.impressions),
      String(stats.totals?.ctr),
      String(stats.totals?.position),
      String(stats.comparison?.clicksDiffPercent || ''),
    ].filter(Boolean);

    for (const stmt of aiStatements) {
      if (typeof stmt !== 'string') continue;
      if (forbiddenRegex.test(stmt)) continue;

      // Trích xuất các số trong câu xem có số lạ không
      const numbersInStmt = stmt.match(/\d+(?:[.,]\d+)?/g) || [];
      const hasInvalidNumber = numbersInStmt.some((n) => {
        const clean = n.replace(',', '.');
        return !allowedNumberStrings.some((allowed) => allowed === clean || allowed.replace('.', ',') === n);
      });

      if (!hasInvalidNumber) {
        validStatements.push(stmt);
      }
    }

    if (validStatements.length > 0) {
      return res.json({
        success: true,
        data: {
          statements: validStatements.slice(0, 3),
          isAutoGenerated: false,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        statements: defaultStatements,
        isAutoGenerated: true,
      },
    });
  } catch {
    return res.json({
      success: true,
      data: {
        statements: defaultStatements,
        isAutoGenerated: true,
      },
    });
  }
});

// ---------------------------------------------------------------------------
// TỪ KHÓA API: GOOGLE SUGGEST & AI DỰ PHÒNG
// ---------------------------------------------------------------------------
app.get('/api/keywords/suggest', async (req: ExpressRequest, res: ExpressResponse) => {
  const query = (req.query.q as string || '').trim();
  if (!query) {
    return res.status(400).json({ success: false, error: 'Vui lòng cung cấp từ khóa cần tra cứu.' });
  }

  const suffixes = ['', ' là gì', ' giá bao nhiêu', ' ở đâu', ' uy tín', ' tốt nhất', ' trọn gói'];
  const keywordSet = new Set<string>();
  keywordSet.add(query);

  let googleSuccess = false;

  for (const suf of suffixes) {
    const fullQ = query + suf;
    try {
      const suggestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&hl=vi&q=${encodeURIComponent(
        fullQ
      )}`;
      const sRes = await fetch(suggestUrl, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        if (Array.isArray(sData) && Array.isArray(sData[1])) {
          googleSuccess = true;
          for (const item of sData[1]) {
            if (typeof item === 'string' && item.trim()) {
              keywordSet.add(item.trim());
            }
          }
        }
      }
    } catch {
      // Tiếp tục thử các hậu tố khác
    }
    if (keywordSet.size >= 30) break;
  }

  if (googleSuccess && keywordSet.size > 2) {
    return res.json({
      success: true,
      source: 'google',
      keywords: Array.from(keywordSet).slice(0, 25),
      isAiFallback: false,
    });
  }

  // Chuyển sang AI fallback nếu Google Suggest bị chặn hoặc rỗng
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey || apiKey.trim() === '' || apiKey === 'sk-...') {
    // Dự phòng thủ công tiếng Việt phong phú
    const manualList = [
      query,
      `${query} giá rẻ`,
      `${query} uy tín`,
      `${query} chất lượng`,
      `${query} tại hà nội`,
      `${query} tại tphcm`,
      `${query} trọn gói`,
      `cách chọn ${query}`,
      `kinh nghiệm mua ${query}`,
      `báo giá ${query} mới nhất`,
      `địa chỉ bán ${query}`,
      `so sánh các loại ${query}`,
      `${query} chính hãng`,
      `đánh giá ${query}`,
      `top ${query} tốt nhất`,
    ];
    return res.json({
      success: true,
      source: 'ai',
      keywords: manualList,
      isAiFallback: true,
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = `Hãy gợi ý 18 đến 25 từ khóa tìm kiếm tiếng Việt phổ biến, tự nhiên nhất liên quan đến chủ đề: "${query}".
Bao gồm cả từ khóa mua sắm, tìm hiểu, so sánh và địa điểm.
Trả về JSON:
{
  "keywords": ["từ khóa 1", "từ khóa 2", ...]
}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    const aiKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    if (aiKeywords.length > 0) {
      return res.json({
        success: true,
        source: 'ai',
        keywords: [query, ...aiKeywords.filter((k: string) => k.toLowerCase() !== query.toLowerCase())].slice(0, 25),
        isAiFallback: true,
      });
    }
  } catch (err) {
    // Thất bại AI -> trả về danh sách cơ bản
  }

  return res.json({
    success: true,
    source: 'ai',
    keywords: [query, `${query} uy tín`, `${query} giá tốt`, `${query} chính hãng`, `báo giá ${query}`],
    isAiFallback: true,
  });
});

app.post('/api/keywords/analyze', (req: ExpressRequest, res: ExpressResponse) => {
  const { keywords = [], siteVisibleText = '' } = req.body || {};
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ success: false, error: 'Danh sách từ khóa không hợp lệ.' });
  }

  const cleanSiteText = (siteVisibleText || '').toLowerCase();

  const results = keywords.map((kw: string) => {
    const lower = kw.toLowerCase();

    // 1. Phân loại ý định tìm kiếm
    let intent: 'muon_mua' | 'tim_hieu' | 'so_sanh' | 'dia_diem' = 'tim_hieu';

    if (
      lower.includes('mua') ||
      lower.includes('bán') ||
      lower.includes('giá') ||
      lower.includes('báo giá') ||
      lower.includes('khuyến mãi') ||
      lower.includes('ưu đãi') ||
      lower.includes('đặt hàng') ||
      lower.includes('shop') ||
      lower.includes('cửa hàng') ||
      lower.includes('order') ||
      lower.includes('trọn gói')
    ) {
      intent = 'muon_mua';
    } else if (
      lower.includes('so sánh') ||
      lower.includes('review') ||
      lower.includes('đánh giá') ||
      lower.includes('tốt nhất') ||
      lower.includes('top') ||
      lower.includes('nên mua') ||
      lower.includes('hay hơn')
    ) {
      intent = 'so_sanh';
    } else if (
      lower.includes('ở đâu') ||
      lower.includes('gần đây') ||
      lower.includes('tại') ||
      lower.includes('hà nội') ||
      lower.includes('tphcm') ||
      lower.includes('sài gòn') ||
      lower.includes('đà nẵng') ||
      lower.includes('chi nhánh') ||
      lower.includes('showroom') ||
      lower.includes('địa chỉ')
    ) {
      intent = 'dia_diem';
    } else {
      intent = 'tim_hieu';
    }

    // 2. Mức độ cạnh tranh ước tính (Thấp / Vừa / Cao)
    const wordCount = kw.trim().split(/\s+/).length;
    let competition: 'Thấp' | 'Vừa' | 'Cao' = 'Vừa';
    if (wordCount >= 5) {
      competition = 'Thấp'; // Từ khóa dài, ngách cụ thể
    } else if (wordCount <= 2) {
      competition = 'Cao'; // Từ khóa ngắn chung chung
    } else {
      competition = 'Vừa';
    }

    // 3. Kiểm tra xem website đã có từ khóa này chưa
    const isMissing = cleanSiteText.length > 50 ? !cleanSiteText.includes(lower) : false;

    return {
      keyword: kw,
      intent,
      competition,
      isMissing,
    };
  });

  return res.json({ success: true, data: results });
});

// ---------------------------------------------------------------------------
// KIỂM TRA CHÍNH TẢ & NGỮ PHÁP TIẾNG VIỆT/ANH
// ---------------------------------------------------------------------------
app.post('/api/spellcheck', async (req: ExpressRequest, res: ExpressResponse) => {
  const { visibleText = '' } = req.body || {};
  const sample = (visibleText || '').slice(0, 3000).trim();

  if (sample.length < 30) {
    return res.json({
      success: true,
      data: {
        detectedLanguage: 'vi',
        errors: [],
        note: 'Không đọc được đủ văn bản để rà soát lỗi chính tả (trang có thể tải bằng JavaScript hoặc quá ít chữ).',
      },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey || apiKey.trim() === '' || apiKey === 'sk-...') {
    return res.json({
      success: true,
      data: {
        detectedLanguage: 'vi',
        errors: [],
        note: 'Chưa cấu hình OPENAI_API_KEY để kích hoạt tính năng kiểm tra chính tả thông minh.',
      },
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = `Bạn là trợ lý biên tập viên tiếng Việt chuyên nghiệp.
Hãy rà soát đoạn văn bản sau trích xuất từ website:
"""
${sample}
"""

YÊU CẦU QUAN TRỌNG:
1. Phát hiện các lỗi chính tả, sai dấu thanh hỏi/ngã, lộn s/x, tr/ch, d/gi, lỗi gõ phím telex, câu lủng củng.
2. TUYỆT ĐỐI BỎ QUA tên thương hiệu riêng, tên công ty, tên người, mã sản phẩm, thuật ngữ kỹ thuật hoặc tiếng Anh (như SEO, Marketing, Admin, Zalo, Fanpage, Hotline...).
3. Chỉ nêu tối đa 8 lỗi rõ ràng nhất. Nếu văn bản không có lỗi hoặc viết đúng chuẩn, trả về danh sách rỗng.
4. Trả về JSON:
{
  "detectedLanguage": "vi",
  "errors": [
    {
      "original": "đoạn chữ gốc bị sai",
      "suggestion": "đoạn chữ sửa đúng",
      "reason": "lý do ngắn gọn dễ hiểu"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    return res.json({
      success: true,
      data: {
        detectedLanguage: parsed.detectedLanguage || 'vi',
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      },
    });
  } catch (err: any) {
    return res.json({
      success: true,
      data: {
        detectedLanguage: 'vi',
        errors: [],
        note: 'Tạm thời không thể kết nối tới dịch vụ kiểm tra chính tả.',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai-compare: KẾT LUẬN & 15-20 KHUYẾN NGHỊ HÀNH ĐỘNG TOÀN DIỆN
// ---------------------------------------------------------------------------
app.post('/api/ai-compare', async (req: ExpressRequest, res: ExpressResponse) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const { customerDomain = '', loserItems = [], winnerItems = [] } = req.body || {};

  const payloadHash = simpleHash(JSON.stringify({ customerDomain, loserItems, winnerItems }));
  const cached = aiCache.get(payloadHash);
  if (cached && cached.expireAt > Date.now()) {
    return res.json({ success: true, data: cached.data, fromCache: true });
  }

  const allCandidateItems: Array<{ id: string; ten: string; compDomain: string; diff: number; type: 'loser' | 'winner' }> = [
    ...(loserItems as any[]).map((it) => ({ ...it, type: 'loser' as const })),
    ...(winnerItems as any[]).map((it) => ({ ...it, type: 'winner' as const })),
  ];

  // Hàm dự phòng chuẩn 15-20 khuyến nghị
  const generateDeterministicCompare = () => {
    const lines: string[] = [];
    for (const item of allCandidateItems.slice(0, 3)) {
      if (item.type === 'loser') {
        lines.push(
          `Đối thủ ${item.compDomain} đang vượt hơn bạn ở mục ${item.ten} (chênh lệch ${item.diff} điểm), bạn nên sớm khắc phục để không bị tụt lại.`
        );
      } else {
        lines.push(
          `Bên bạn đang có lợi thế dẫn trước ${item.compDomain} ở mục ${item.ten} (hơn ${item.diff} điểm), cần tiếp tục duy trì điểm mạnh này.`
        );
      }
    }
    while (lines.length < 3) {
      lines.push('Hãy tiếp tục tối ưu hóa các tiêu chuẩn kỹ thuật và nội dung để giữ vững lợi thế cạnh tranh với đối thủ.');
    }

    const topPriorities = [
      'Khắc phục triệt để các tiêu chí kỹ thuật mà đối thủ đang dẫn trước để lấy lại điểm số SEO.',
      'Viết lại thẻ tiêu đề Title và mô tả Meta Description hấp dẫn hơn để hút khách từ trang tìm kiếm Google.',
      'Tối ưu kích thước hình ảnh và dọn dẹp mã nguồn để tăng tốc độ tải trang trên mạng di động 4G.',
    ];

    const detailedRecommendations = [
      {
        category: 'Tối ưu SEO & Thứ hạng Google',
        items: [
          'Chỉnh sửa lại tiêu đề trang đạt chuẩn 30–60 ký tự, đưa từ khóa ngành lên đầu.',
          'Bổ sung thẻ mô tả Meta Description từ 120–160 ký tự kèm lời kêu gọi hành động.',
          'Kiểm tra và chuẩn hóa tệp sơ đồ sitemap.xml để Google nhận diện bài viết mới nhanh hơn.',
          'Cài đặt thẻ canonical tránh việc Google hiểu lầm là nội dung sao chép từ đối thủ.',
        ],
      },
      {
        category: 'Tốc độ & Kỹ thuật hạ tầng',
        items: [
          'Kích hoạt chứng chỉ bảo mật HTTPS toàn diện trên tất cả các đường dẫn chuyển hướng.',
          'Nén ảnh sang định dạng WebP hiện đại để giảm dung lượng tải trang xuống dưới 500KB.',
          'Tối ưu thời gian phản hồi của máy chủ máy chủ phản hồi dưới 0.8 giây.',
          'Hạn chế các bước chuyển hướng trung gian để khách truy cập nhanh hơn.',
        ],
      },
      {
        category: 'Nội dung & Thông điệp bán hàng',
        items: [
          'Bổ sung nội dung bài viết chi tiết đạt trên 500 từ để cung cấp đầy đủ thông tin hữu ích.',
          'Sắp xếp lại cấu trúc bài viết có duy nhất 1 tiêu đề H1 và các đề mục con H2 mạch lạc.',
          'Chèn khéo léo từ khóa ngành vào tiêu đề H1 và đoạn văn mở đầu.',
          'Bổ sung mô tả Alt đầy đủ cho 100% hình ảnh sản phẩm.',
        ],
      },
      {
        category: 'Giao diện & Trải nghiệm di động (UI/UX)',
        items: [
          'Đảm bảo khung nhìn viewport tự động co giãn vừa vặn trên mọi kích cỡ màn hình điện thoại.',
          'Tăng cỡ chữ nội dung lên tối thiểu 14px để khách hàng đọc thoải mái.',
          'Mở rộng kích thước các nút bấm và liên kết cảm ứng tối thiểu 44px.',
          'Không sử dụng popup che khuất màn hình khi khách vừa truy cập.',
        ],
      },
      {
        category: 'Độ tin cậy & Chuyển đổi khách hàng',
        items: [
          'Cài đặt nút gọi Hotline và Chat Zalo nhanh ở góc màn hình.',
          'Đơn giản hóa biểu mẫu liên hệ chỉ giữ lại Tên và Số điện thoại.',
          'Cài đặt đầy đủ biểu tượng Favicon trên tab trình duyệt để tăng sự uy tín.',
          'Chuẩn hóa hình ảnh đại diện og:image để hiển thị banner đẹp khi chia sẻ qua Zalo/Facebook.',
        ],
      },
    ];

    return {
      conclusions: lines.slice(0, 3),
      topPriorities,
      detailedRecommendations,
      isAutoGenerated: true,
    };
  };

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey || apiKey.trim() === '' || apiKey === 'sk-...' || allCandidateItems.length === 0) {
    const fb = generateDeterministicCompare();
    aiCache.set(payloadHash, { data: fb, expireAt: Date.now() + 24 * 3600 * 1000 });
    return res.json({ success: true, data: fb });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = `Bạn là trợ lý Ong Nhỏ chuyên tư vấn website doanh nghiệp Việt Nam.
Website của khách: ${customerDomain}.
Danh sách các mục chênh lệch:
${JSON.stringify(allCandidateItems, null, 2)}

YÊU CẦU:
1. "conclusions": Đúng 3 DÒNG kết luận ngắn gọn, mỗi dòng bám vào một mục chênh lệch và nêu tên đối thủ.
2. "topPriorities": Đúng 3 điều quan trọng nhất cần làm ngay để vượt mặt đối thủ.
3. "detailedRecommendations": 5 nhóm chuyên sâu, mỗi nhóm 3-4 khuyến nghị hành động thiết thực:
   - Tối ưu SEO & Thứ hạng Google
   - Tốc độ & Kỹ thuật hạ tầng
   - Nội dung & Thông điệp bán hàng
   - Giao diện & Trải nghiệm di động (UI/UX)
   - Độ tin cậy & Chuyển đổi khách hàng

Trả về JSON:
{
  "conclusions": [
    { "id": "...", "text": "..." },
    { "id": "...", "text": "..." },
    { "id": "...", "text": "..." }
  ],
  "topPriorities": ["...", "...", "..."],
  "detailedRecommendations": [
    { "category": "Tối ưu SEO & Thứ hạng Google", "items": ["...", "...", "...", "..."] },
    { "category": "Tốc độ & Kỹ thuật hạ tầng", "items": ["...", "...", "...", "..."] },
    { "category": "Nội dung & Thông điệp bán hàng", "items": ["...", "...", "...", "..."] },
    { "category": "Giao diện & Trải nghiệm di động (UI/UX)", "items": ["...", "...", "...", "..."] },
    { "category": "Độ tin cậy & Chuyển đổi khách hàng", "items": ["...", "...", "...", "..."] }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    const validIds = new Set(allCandidateItems.map((it) => it.id));

    const finalLines: string[] = [];
    if (Array.isArray(parsed.conclusions) && parsed.conclusions.length === 3) {
      for (const c of parsed.conclusions) {
        if (c.id && validIds.has(c.id) && c.text) {
          finalLines.push(c.text);
        }
      }
    }

    if (finalLines.length !== 3) {
      const fb = generateDeterministicCompare();
      return res.json({ success: true, data: fb });
    }

    const result = {
      conclusions: finalLines,
      topPriorities: Array.isArray(parsed.topPriorities) && parsed.topPriorities.length >= 3
        ? parsed.topPriorities.slice(0, 3)
        : ['Tối ưu thẻ meta description', 'Cải thiện tốc độ di động', 'Bổ sung nút gọi Hotline'],
      detailedRecommendations: Array.isArray(parsed.detailedRecommendations) && parsed.detailedRecommendations.length >= 4
        ? parsed.detailedRecommendations
        : generateDeterministicCompare().detailedRecommendations,
      isAutoGenerated: false,
    };

    aiCache.set(payloadHash, { data: result, expireAt: Date.now() + 24 * 3600 * 1000 });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    const fb = generateDeterministicCompare();
    return res.json({ success: true, data: fb });
  }
});

// ---------------------------------------------------------------------------
// Tiện ích lấy URL ứng dụng và phục vụ tệp tĩnh / SPA
// ---------------------------------------------------------------------------
function getBaseAppUrl(req: ExpressRequest): string {
  if (process.env.APP_URL && process.env.APP_URL.trim()) {
    return process.env.APP_URL.trim().replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || ((req.socket as any).encrypted ? 'https' : 'http') || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${process.env.PORT || 3000}`;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

// 1. Phục vụ robots.txt chuẩn SEO với __APP_URL__ thay thế
app.get('/robots.txt', (req: ExpressRequest, res: ExpressResponse) => {
  const appUrl = getBaseAppUrl(req);
  const robotsPath = path.resolve(__dirname, 'public', 'robots.txt');
  let content = 'User-agent: *\nAllow: /\nSitemap: __APP_URL__/sitemap.xml\n';
  if (fs.existsSync(robotsPath)) {
    content = fs.readFileSync(robotsPath, 'utf-8');
  }
  res.type('text/plain').send(content.replace(/__APP_URL__/g, appUrl));
});

// 2. Phục vụ sitemap.xml chuẩn SEO với __APP_URL__ thay thế
app.get('/sitemap.xml', (req: ExpressRequest, res: ExpressResponse) => {
  const appUrl = getBaseAppUrl(req);
  const sitemapPath = path.resolve(__dirname, 'public', 'sitemap.xml');
  let content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>__APP_URL__/</loc>
    <lastmod>2026-10-27</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  if (fs.existsSync(sitemapPath)) {
    content = fs.readFileSync(sitemapPath, 'utf-8');
  }
  res.type('application/xml').send(content.replace(/__APP_URL__/g, appUrl));
});

// 3. Đường dẫn có đuôi tệp (.txt, .xml, .png, .svg, .js, .css...) mà không tồn tại thì trả 404, không trả index.html
app.use((req: ExpressRequest, res: ExpressResponse, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
    return next();
  }
  const ext = path.extname(req.path).toLowerCase();
  if (ext && ext !== '.html') {
    const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
    const publicPath = path.resolve(__dirname, 'public', req.path.replace(/^\/+/, ''));
    const distPath = path.resolve(__dirname, 'dist', req.path.replace(/^\/+/, ''));
    if (fs.existsSync(publicPath) || (isProd && fs.existsSync(distPath))) {
      return next();
    }
    return res.status(404).type('text/plain').send('404 Not Found');
  }
  next();
});

// ---------------------------------------------------------------------------
// Khởi chạy Vite middleware trong dev hoặc static files trong production
// ---------------------------------------------------------------------------
async function startServer() {
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.argv.includes('--production');

  if (isProd) {
    process.env.NODE_ENV = 'production';
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req: ExpressRequest, res: ExpressResponse) => {
      const appUrl = getBaseAppUrl(req);
      const indexPath = path.resolve(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf-8');
        res.type('text/html').send(html.replace(/__APP_URL__/g, appUrl));
      } else {
        res.status(404).send('Not Found');
      }
    });
  } else {
    // In dev: serve public directory static files
    app.use(express.static(path.resolve(__dirname, 'public'), { index: false }));
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    // Intercept GET requests for HTML to replace __APP_URL__ before Vite transform
    app.use(async (req: ExpressRequest, res: ExpressResponse, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/auth')) {
        return next();
      }
      const ext = path.extname(req.path);
      if (ext && ext !== '.html') {
        return next();
      }
      try {
        const template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const appUrl = getBaseAppUrl(req);
        const replaced = template.replace(/__APP_URL__/g, appUrl);
        const transformed = await vite.transformIndexHtml(req.originalUrl, replaced);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (e) {
        next(e);
      }
    });

    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ong Nhỏ] Server đang chạy tại http://0.0.0.0:${PORT} (Chế độ: ${isProd ? 'Production' : 'Development'})`);
  });
}

startServer();
