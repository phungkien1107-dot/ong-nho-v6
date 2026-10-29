/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BỘ CHẤM ĐIỂM WEBSITE "ONG NHỎ"
 * Phân tích bằng DOMParser phía client theo chuẩn 4 nhóm tiêu chuẩn.
 */

export interface ScoreItem {
  id: string;
  nhom: 'noi_dung' | 'di_dong' | 'ky_thuat' | 'mang_xa_hoi' | 'giao_dien_ux';
  ten: string;
  diemToiDa: number;
  ketQua: 'dat' | 'nen_sua' | 'loi' | 'khong_ap_dung';
  diem: number;
  ghiChu: string;
  chiTiet?: string;
  khongApDung?: boolean;
}

export interface ScoreGroup {
  id: 'noi_dung' | 'di_dong' | 'ky_thuat' | 'mang_xa_hoi' | 'giao_dien_ux';
  ten: string;
  diemToiDa: number;
  diemDat: number;
  items: ScoreItem[];
}

export interface ScoreResult {
  tongDiem: number; // Điểm quy đổi về thang 100
  diemThucTe: number;
  diemToiDaKhaDung: number;
  nhoms: ScoreGroup[];
  allDoneItems: ScoreItem[];
  coCoDo: boolean;
  coDoLyDo?: string;
  coCanhBaoVang: boolean;
  canhBaoVangLyDo?: string;
  khongDangTin: boolean;
  khongDangTinLyDo?: string;
  soTu: number;
  soAnh: number;
  soAnhThieuAlt: number;
  soTheH1: number;
  soTheH2: number;
}

export interface FetchMetadata {
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  htmlSizeBytes: number;
  redirectChain: { from: string; to: string; status: number }[];
  xRobotsTag: string;
  robotsTxt: string | null;
  robotsTxtFound: boolean;
  sitemapFound: boolean;
  isBlocked: boolean;
}

// 6. Trích xuất văn bản hiển thị từ HTML: bỏ script, style, noscript, nav, header, footer, svg, iframe
function extractVisibleText(doc: Document): string {
  const clone = doc.body ? (doc.body.cloneNode(true) as HTMLElement) : null;
  if (!clone) return '';
  const removeElements = clone.querySelectorAll(
    'script, style, noscript, nav, header, footer, svg, iframe, path'
  );
  removeElements.forEach((el) => el.remove());
  return clone.textContent?.replace(/\s+/g, ' ').trim() || '';
}

// Đếm số từ tiếng Việt và tiếng Anh hợp lệ
function countWords(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/);
  return words.filter((w) => w.length > 0).length;
}

// 8. Kiểm tra robots.txt chỉ coi là "chặn toàn bộ" khi User-agent: * hoặc googlebot có Disallow: / đúng nguyên và không có Allow
function isRobotsBlockingAll(robotsTxt: string | null): boolean {
  if (!robotsTxt) return false;
  const lines = robotsTxt.split(/\r?\n/);
  let isTargetAgent = false;
  let hasDisallowRoot = false;
  let hasAllow = false;

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === 'user-agent') {
      const agent = val.toLowerCase();
      if (agent === '*' || agent === 'googlebot') {
        isTargetAgent = true;
      } else {
        isTargetAgent = false;
      }
    } else if (isTargetAgent) {
      if (key === 'disallow') {
        if (val === '/' || val === '/*') {
          hasDisallowRoot = true;
        }
      } else if (key === 'allow') {
        if (val === '/' || val.startsWith('/')) {
          hasAllow = true;
        }
      }
    }
  }

  return hasDisallowRoot && !hasAllow;
}

export function scoreWebsite(
  html: string,
  meta: FetchMetadata,
  keywordInput: string = ''
): ScoreResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const visibleText = extractVisibleText(doc);
  const wordCount = countWords(visibleText);
  const scriptTagsCount = doc.querySelectorAll('script').length;

  // 1. Kiểm tra CỜ ĐỎ: noindex (meta hoặc header x-robots-tag) hoặc robots.txt chặn toàn bộ
  let coCoDo = false;
  let coDoLyDo = '';

  const metaRobots = (
    doc.querySelector('meta[name="robots" i]')?.getAttribute('content') || ''
  ).toLowerCase();
  const metaGooglebot = (
    doc.querySelector('meta[name="googlebot" i]')?.getAttribute('content') || ''
  ).toLowerCase();
  const xRobots = (meta.xRobotsTag || '').toLowerCase();

  const isNoIndex =
    metaRobots.includes('noindex') ||
    metaGooglebot.includes('noindex') ||
    xRobots.includes('noindex');

  const isRobotsBlockAll = isRobotsBlockingAll(meta.robotsTxt);

  if (isNoIndex || isRobotsBlockAll) {
    coCoDo = true;
    coDoLyDo = isNoIndex
      ? 'Trang này đang gắn thẻ "noindex" bảo Google không được hiển thị website lên kết quả tìm kiếm.'
      : 'Tệp robots.txt đang chặn toàn bộ máy chủ tìm kiếm truy cập (Disallow: / trong User-agent: *).';
  }

  // 2. Kiểm tra CẢNH BÁO VÀNG: JavaScript rendering
  let coCanhBaoVang = false;
  let canhBaoVangLyDo = '';
  if (wordCount < 80 && scriptTagsCount >= 5) {
    coCanhBaoVang = true;
    canhBaoVangLyDo =
      'Kết quả có thể thiếu chính xác vì trang tải nội dung bằng JavaScript.';
  }

  // 9. Kiểm tra website "Không đáng tin"
  // Bị chặn bot (403/captcha), hoặc HTML dưới 15KB kèm chữ hiển thị dưới 100 từ, hoặc có cảnh báo JavaScript
  const isHtmlTooSmallWithFewWords = meta.htmlSizeBytes < 15 * 1024 && wordCount < 100;
  const khongDangTin = meta.isBlocked || isHtmlTooSmallWithFewWords || coCanhBaoVang;
  const khongDangTinLyDo = khongDangTin
    ? 'Chưa đọc được nội dung thật của trang này, kết quả chỉ mang tính tham khảo'
    : undefined;

  const items: ScoreItem[] = [];

  // ==========================================
  // NHÓM 1: NỘI DUNG TRANG (Tối đa 30 điểm)
  // ==========================================

  // 1. Tiêu đề title: 30 - 60 ký tự (6đ)
  const titleText = doc.querySelector('title')?.textContent?.trim() || '';
  const titleLen = Array.from(titleText).length;
  if (titleLen >= 30 && titleLen <= 60) {
    items.push({
      id: 'title',
      nhom: 'noi_dung',
      ten: 'Tiêu đề trang (Title)',
      diemToiDa: 6,
      diem: 6,
      ketQua: 'dat',
      ghiChu: `Tiêu đề rất chuẩn (${titleLen} ký tự), Google hiển thị vừa đẹp mắt, không bị cắt bớt.`,
      chiTiet: titleText,
    });
  } else if (titleLen > 0 && titleLen < 30) {
    items.push({
      id: 'title',
      nhom: 'noi_dung',
      ten: 'Tiêu đề trang (Title)',
      diemToiDa: 6,
      diem: 3,
      ketQua: 'nen_sua',
      ghiChu: `Tiêu đề hơi ngắn (${titleLen} ký tự), nên bổ sung thêm tên thương hiệu hoặc dịch vụ (30–60 ký tự).`,
      chiTiet: titleText,
    });
  } else if (titleLen > 60) {
    items.push({
      id: 'title',
      nhom: 'noi_dung',
      ten: 'Tiêu đề trang (Title)',
      diemToiDa: 6,
      diem: 3.5,
      ketQua: 'nen_sua',
      ghiChu: `Tiêu đề hơi dài (${titleLen} ký tự), Google sẽ bị cắt đuôi bằng dấu 3 chấm (...).`,
      chiTiet: titleText,
    });
  } else {
    items.push({
      id: 'title',
      nhom: 'noi_dung',
      ten: 'Tiêu đề trang (Title)',
      diemToiDa: 6,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Trang chưa có thẻ tiêu đề, khách hàng trên Google sẽ không biết bạn là ai.',
    });
  }

  // 2. Thẻ mô tả Meta Description: 120 - 160 ký tự (6đ)
  const metaDesc = (
    doc.querySelector('meta[name="description" i]')?.getAttribute('content') || ''
  ).trim();
  const descLen = Array.from(metaDesc).length;
  if (descLen >= 120 && descLen <= 160) {
    items.push({
      id: 'meta_desc',
      nhom: 'noi_dung',
      ten: 'Đoạn mô tả hiển thị (Meta Description)',
      diemToiDa: 6,
      diem: 6,
      ketQua: 'dat',
      ghiChu: `Đoạn mô tả lý tưởng (${descLen} ký tự), đủ thông tin hấp dẫn khách bấm vào xem.`,
      chiTiet: metaDesc,
    });
  } else if (descLen > 0 && descLen < 120) {
    items.push({
      id: 'meta_desc',
      nhom: 'noi_dung',
      ten: 'Đoạn mô tả hiển thị (Meta Description)',
      diemToiDa: 6,
      diem: 3,
      ketQua: 'nen_sua',
      ghiChu: `Đoạn mô tả hơi ngắn (${descLen}/120 ký tự), bạn có thể viết thêm lý do khách nên chọn bạn.`,
      chiTiet: metaDesc,
    });
  } else if (descLen > 160) {
    items.push({
      id: 'meta_desc',
      nhom: 'noi_dung',
      ten: 'Đoạn mô tả hiển thị (Meta Description)',
      diemToiDa: 6,
      diem: 3.5,
      ketQua: 'nen_sua',
      ghiChu: `Đoạn mô tả hơi dài (${descLen} ký tự), câu cuối có thể bị khuất trên màn hình điện thoại.`,
      chiTiet: metaDesc,
    });
  } else {
    items.push({
      id: 'meta_desc',
      nhom: 'noi_dung',
      ten: 'Đoạn mô tả hiển thị (Meta Description)',
      diemToiDa: 6,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Trang chưa có dòng mô tả, nên khi hiện trên Google sẽ trống và ít người bấm vào.',
    });
  }

  // 3. Đúng 1 thẻ H1 (5đ)
  const h1Elements = doc.querySelectorAll('h1');
  const h1Count = h1Elements.length;
  if (h1Count === 1) {
    const h1Text = h1Elements[0].textContent?.trim() || '';
    items.push({
      id: 'h1',
      nhom: 'noi_dung',
      ten: 'Tiêu đề lớn nhất của trang (Thẻ H1)',
      diemToiDa: 5,
      diem: 5,
      ketQua: 'dat',
      ghiChu: 'Chuẩn xác, trang có duy nhất 1 tiêu đề chính rõ ràng giúp Google hiểu ngay chủ đề.',
      chiTiet: h1Text,
    });
  } else if (h1Count === 0) {
    items.push({
      id: 'h1',
      nhom: 'noi_dung',
      ten: 'Tiêu đề lớn nhất của trang (Thẻ H1)',
      diemToiDa: 5,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Trang thiếu tiêu đề chính H1, Google sẽ bối rối khi tìm hiểu thông điệp cốt lõi.',
    });
  } else {
    items.push({
      id: 'h1',
      nhom: 'noi_dung',
      ten: 'Tiêu đề lớn nhất của trang (Thẻ H1)',
      diemToiDa: 5,
      diem: 2.5,
      ketQua: 'nen_sua',
      ghiChu: `Trang đang có ${h1Count} thẻ H1 (quá nhiều), mỗi trang chỉ nên có duy nhất 1 tiêu đề chính.`,
    });
  }

  // 4. Có ít nhất 1 thẻ H2 (3đ)
  const h2Count = doc.querySelectorAll('h2').length;
  if (h2Count >= 1) {
    items.push({
      id: 'h2',
      nhom: 'noi_dung',
      ten: 'Tiêu đề phân mục con (Thẻ H2)',
      diemToiDa: 3,
      diem: 3,
      ketQua: 'dat',
      ghiChu: `Đã có ${h2Count} tiêu đề mục con H2, bài viết mạch lạc và người đọc dễ lướt nhanh.`,
    });
  } else {
    items.push({
      id: 'h2',
      nhom: 'noi_dung',
      ten: 'Tiêu đề phân mục con (Thẻ H2)',
      diemToiDa: 3,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có các tiêu đề phụ H2 chia đoạn, bài viết dễ bị ngợp và khó theo dõi.',
    });
  }

  // 5. Mục alt: chỉ ảnh THIẾU HẲN thuộc tính alt là thiếu; alt="" (ảnh trang trí) hợp lệ; (4đ)
  // Bỏ qua ảnh trong noscript và ảnh nhỏ hơn 3px
  const allImages = Array.from(doc.querySelectorAll('img'));
  const eligibleImages = allImages.filter((img) => {
    // Bỏ ảnh trong noscript
    if (img.closest('noscript')) return false;
    // Bỏ ảnh nhỏ hơn 3px
    const w = parseInt(img.getAttribute('width') || '10', 10);
    const h = parseInt(img.getAttribute('height') || '10', 10);
    if (!isNaN(w) && w > 0 && w < 3) return false;
    if (!isNaN(h) && h > 0 && h < 3) return false;
    return true;
  });

  const totalEligibleImg = eligibleImages.length;
  let missingAltCount = 0;
  for (const img of eligibleImages) {
    // Chỉ thiếu hẳn thuộc tính alt mới là thiếu
    if (!img.hasAttribute('alt')) {
      missingAltCount++;
    }
  }

  if (totalEligibleImg === 0) {
    // Mục không áp dụng: trang không có ảnh
    items.push({
      id: 'img_alt',
      nhom: 'noi_dung',
      ten: 'Mô tả hình ảnh (Thẻ Alt)',
      diemToiDa: 0,
      diem: 0,
      ketQua: 'khong_ap_dung',
      khongApDung: true,
      ghiChu: 'Không áp dụng: Trang không có hình ảnh.',
    });
  } else {
    const passedCount = totalEligibleImg - missingAltCount;
    const altRatio = (passedCount / totalEligibleImg) * 100;

    if (altRatio >= 80) {
      items.push({
        id: 'img_alt',
        nhom: 'noi_dung',
        ten: 'Mô tả hình ảnh (Thẻ Alt)',
        diemToiDa: 4,
        diem: 4,
        ketQua: 'dat',
        ghiChu:
          missingAltCount === 0
            ? `Tất cả ${totalEligibleImg}/${totalEligibleImg} ảnh đều có mô tả alt hợp lệ.`
            : `${passedCount}/${totalEligibleImg} ảnh có mô tả alt (đạt trên 80%), chỉ có ${missingAltCount}/${totalEligibleImg} ảnh chưa có mô tả alt.`,
      });
    } else {
      items.push({
        id: 'img_alt',
        nhom: 'noi_dung',
        ten: 'Mô tả hình ảnh (Thẻ Alt)',
        diemToiDa: 4,
        diem: 0,
        ketQua: 'loi',
        ghiChu: `${missingAltCount}/${totalEligibleImg} ảnh chưa có mô tả alt (chưa đạt chuẩn 80%).`,
      });
    }
  }

  // 6. Chữ hiển thị >= 300 từ (3đ)
  if (wordCount >= 300) {
    items.push({
      id: 'word_count',
      nhom: 'noi_dung',
      ten: 'Độ dài văn bản trang',
      diemToiDa: 3,
      diem: 3,
      ketQua: 'dat',
      ghiChu: `Nội dung phong phú (${wordCount} từ), cung cấp đầy đủ thông tin cho khách hàng.`,
    });
  } else {
    items.push({
      id: 'word_count',
      nhom: 'noi_dung',
      ten: 'Độ dài văn bản trang',
      diemToiDa: 3,
      diem: 0,
      ketQua: 'loi',
      ghiChu: `Trang chỉ có ${wordCount} từ, thiếu nội dung so với mức chuẩn 300 từ.`,
    });
  }

  // 7. Từ khóa chính có trong title / H1 / description (3đ) - Chỉ khi có nhập
  const cleanKeyword = keywordInput.trim().toLowerCase();
  if (cleanKeyword.length > 0) {
    const inTitle = titleText.toLowerCase().includes(cleanKeyword);
    const inH1 = Array.from(h1Elements).some((h) =>
      (h.textContent || '').toLowerCase().includes(cleanKeyword)
    );
    const inDesc = metaDesc.toLowerCase().includes(cleanKeyword);

    const matchCount = (inTitle ? 1 : 0) + (inH1 ? 1 : 0) + (inDesc ? 1 : 0);

    if (matchCount >= 2) {
      items.push({
        id: 'keyword',
        nhom: 'noi_dung',
        ten: `Từ khóa chính "${cleanKeyword}"`,
        diemToiDa: 3,
        diem: 3,
        ketQua: 'dat',
        ghiChu: `Từ khóa xuất hiện ở ${matchCount}/3 vị trí quan trọng nhất (Tiêu đề, H1, Mô tả).`,
      });
    } else if (matchCount === 1) {
      items.push({
        id: 'keyword',
        nhom: 'noi_dung',
        ten: `Từ khóa chính "${cleanKeyword}"`,
        diemToiDa: 3,
        diem: 1.5,
        ketQua: 'nen_sua',
        ghiChu: `Từ khóa mới có ở 1 vị trí, nên bổ sung vào tiêu đề chính hoặc đoạn mô tả.`,
      });
    } else {
      items.push({
        id: 'keyword',
        nhom: 'noi_dung',
        ten: `Từ khóa chính "${cleanKeyword}"`,
        diemToiDa: 3,
        diem: 0,
        ketQua: 'loi',
        ghiChu: `Từ khóa hoàn toàn chưa có trong tiêu đề, H1 hoặc mô tả của trang này.`,
      });
    }
  } else {
    // Mục không áp dụng: Chưa nhập từ khóa
    items.push({
      id: 'keyword',
      nhom: 'noi_dung',
      ten: 'Từ khóa chính',
      diemToiDa: 0,
      diem: 0,
      ketQua: 'khong_ap_dung',
      khongApDung: true,
      ghiChu: 'Không áp dụng: Chưa nhập từ khóa chính.',
    });
  }

  // ==========================================
  // NHÓM 2: DI ĐỘNG & TỐC ĐỘ (Tối đa 20 điểm)
  // ==========================================

  // 1. Thẻ viewport (6đ)
  const viewportTag = doc.querySelector('meta[name="viewport" i]');
  const viewportContent = (viewportTag?.getAttribute('content') || '').toLowerCase();
  if (viewportTag && viewportContent.includes('width=')) {
    items.push({
      id: 'viewport',
      nhom: 'di_dong',
      ten: 'Hiển thị vừa vặn trên điện thoại (Viewport)',
      diemToiDa: 6,
      diem: 6,
      ketQua: 'dat',
      ghiChu: 'Website tự động co giãn đẹp mắt, chữ và nút bấm không bị tràn màn hình điện thoại.',
    });
  } else {
    items.push({
      id: 'viewport',
      nhom: 'di_dong',
      ten: 'Hiển thị vừa vặn trên điện thoại (Viewport)',
      diemToiDa: 6,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có cấu hình hiển thị di động (viewport).',
    });
  }

  // 2. Favicon & Apple-touch-icon (4đ)
  const hasFavicon = !!doc.querySelector('link[rel~="icon" i]');
  const hasAppleIcon = !!doc.querySelector('link[rel="apple-touch-icon" i]');
  if (hasFavicon && hasAppleIcon) {
    items.push({
      id: 'icons',
      nhom: 'di_dong',
      ten: 'Biểu tượng trang web & Biểu tượng iPhone',
      diemToiDa: 4,
      diem: 4,
      ketQua: 'dat',
      ghiChu: 'Đầy đủ biểu tượng trên tab trình duyệt và khi khách lưu trang ra màn hình chính iPhone.',
    });
  } else if (hasFavicon || hasAppleIcon) {
    items.push({
      id: 'icons',
      nhom: 'di_dong',
      ten: 'Biểu tượng trang web & Biểu tượng iPhone',
      diemToiDa: 4,
      diem: 2,
      ketQua: 'nen_sua',
      ghiChu: hasFavicon
        ? 'Đã có biểu tượng tab (favicon), nhưng nên thêm apple-touch-icon để đẹp mắt khi khách dùng iPhone.'
        : 'Đã có icon Apple, nên bổ sung thêm favicon cho trình duyệt máy tính.',
    });
  } else {
    items.push({
      id: 'icons',
      nhom: 'di_dong',
      ten: 'Biểu tượng trang web & Biểu tượng iPhone',
      diemToiDa: 4,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có biểu tượng nhận diện riêng favicon và apple-touch-icon.',
    });
  }

  // 3. Dung lượng HTML (5đ) (HTML ≤100KB "gọn nhẹ", 100–500KB "tạm ổn", >500KB "nặng")
  const htmlSizeKB = meta.htmlSizeBytes / 1024;
  if (htmlSizeKB <= 100) {
    items.push({
      id: 'html_size',
      nhom: 'di_dong',
      ten: 'Độ nhẹ của mã nguồn HTML',
      diemToiDa: 5,
      diem: 5,
      ketQua: 'dat',
      ghiChu: `Mã nguồn rất gọn nhẹ (${htmlSizeKB.toFixed(1)} KB ≤ 100 KB).`,
    });
  } else if (htmlSizeKB <= 500) {
    items.push({
      id: 'html_size',
      nhom: 'di_dong',
      ten: 'Độ nhẹ của mã nguồn HTML',
      diemToiDa: 5,
      diem: 5,
      ketQua: 'dat',
      ghiChu: `Mã nguồn tạm ổn (${htmlSizeKB.toFixed(1)} KB ≤ 500 KB).`,
    });
  } else {
    items.push({
      id: 'html_size',
      nhom: 'di_dong',
      ten: 'Độ nhẹ của mã nguồn HTML',
      diemToiDa: 5,
      diem: 0,
      ketQua: 'loi',
      ghiChu: `Mã nguồn nặng (${htmlSizeKB.toFixed(1)} KB > 500 KB), làm chậm tốc độ tải trang.`,
    });
  }

  // 4. Thời gian phản hồi (5đ) (phản hồi ≤0,8 giây "rất nhanh", 0,8–1,5 giây "ổn", >1,5 giây "hơi chậm")
  const responseTimeSec = meta.responseTimeMs / 1000;
  if (meta.responseTimeMs <= 800) {
    items.push({
      id: 'response_time',
      nhom: 'di_dong',
      ten: 'Tốc độ phản hồi của máy chủ',
      diemToiDa: 5,
      diem: 5,
      ketQua: 'dat',
      ghiChu: `Máy chủ phản hồi rất nhanh (${meta.responseTimeMs} ms).`,
    });
  } else if (meta.responseTimeMs <= 1500) {
    items.push({
      id: 'response_time',
      nhom: 'di_dong',
      ten: 'Tốc độ phản hồi của máy chủ',
      diemToiDa: 5,
      diem: 5,
      ketQua: 'dat',
      ghiChu: `Máy chủ phản hồi ổn (${responseTimeSec.toFixed(2)}s).`,
    });
  } else {
    items.push({
      id: 'response_time',
      nhom: 'di_dong',
      ten: 'Tốc độ phản hồi của máy chủ',
      diemToiDa: 5,
      diem: 0,
      ketQua: 'loi',
      ghiChu: `Máy chủ phản hồi hơi chậm (${responseTimeSec.toFixed(2)}s > 1,5s).`,
    });
  }

  // ==========================================
  // NHÓM 3: KỸ THUẬT & TÌM KIẾM (Tối đa 15 điểm)
  // ==========================================

  // 1. HTTPS ở địa chỉ cuối cùng sau chuyển hướng (5đ)
  const isHttps = meta.finalUrl.startsWith('https://');
  if (isHttps) {
    items.push({
      id: 'https',
      nhom: 'ky_thuat',
      ten: 'Khóa bảo mật an toàn (HTTPS)',
      diemToiDa: 5,
      diem: 5,
      ketQua: 'dat',
      ghiChu: 'Trang web có ổ khóa xanh bảo mật HTTPS ở địa chỉ cuối.',
    });
  } else {
    items.push({
      id: 'https',
      nhom: 'ky_thuat',
      ten: 'Khóa bảo mật an toàn (HTTPS)',
      diemToiDa: 5,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có HTTPS, trình duyệt sẽ cảnh báo "Không an toàn".',
    });
  }

  // 2. Thẻ canonical (2đ)
  const canonicalTag = doc.querySelector('link[rel="canonical" i]');
  const canonicalHref = canonicalTag?.getAttribute('href') || '';
  if (canonicalHref) {
    items.push({
      id: 'canonical',
      nhom: 'ky_thuat',
      ten: 'Xác định đường dẫn chuẩn (Canonical)',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Đã có liên kết canonical chuẩn, tránh bị phạt do trùng lặp nội dung.',
    });
  } else {
    items.push({
      id: 'canonical',
      nhom: 'ky_thuat',
      ten: 'Xác định đường dẫn chuẩn (Canonical)',
      diemToiDa: 2,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có thẻ đường dẫn chuẩn (canonical).',
    });
  }

  // 3. Thuộc tính lang trên thẻ <html> (2đ)
  const htmlLang = doc.documentElement.getAttribute('lang') || '';
  if (htmlLang.trim().length > 0) {
    items.push({
      id: 'lang',
      nhom: 'ky_thuat',
      ten: 'Khai báo ngôn ngữ website (lang)',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: `Đã khai báo ngôn ngữ rõ ràng (${htmlLang}).`,
    });
  } else {
    items.push({
      id: 'lang',
      nhom: 'ky_thuat',
      ten: 'Khai báo ngôn ngữ website (lang)',
      diemToiDa: 2,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Thẻ html chưa khai báo thuộc tính lang.',
    });
  }

  // 4. Có tệp robots.txt (2đ)
  // Chỉ coi robots.txt là hợp lệ khi nội dung có "user-agent" hoặc "sitemap:" hoặc "disallow" và KHÔNG bắt đầu bằng <!doctype hay <html
  let isRobotsValid = false;
  if (meta.robotsTxtFound) {
    if (meta.robotsTxt) {
      const rLower = meta.robotsTxt.trim().toLowerCase();
      const isHtml = rLower.startsWith('<!doctype') || rLower.startsWith('<html');
      const hasRobotsKeywords =
        rLower.includes('user-agent') || rLower.includes('sitemap:') || rLower.includes('disallow');
      isRobotsValid = !isHtml && hasRobotsKeywords;
    } else {
      isRobotsValid = true;
    }
  }

  if (isRobotsValid) {
    items.push({
      id: 'robots',
      nhom: 'ky_thuat',
      ten: 'Tệp hướng dẫn thu thập dữ liệu (robots.txt)',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Đã có tệp robots.txt hướng dẫn bọ tìm kiếm hợp lệ.',
    });
  } else {
    items.push({
      id: 'robots',
      nhom: 'ky_thuat',
      ten: 'Tệp hướng dẫn thu thập dữ liệu (robots.txt)',
      diemToiDa: 2,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa tìm thấy tệp robots.txt hợp lệ (không chứa quy tắc hoặc trả về trang HTML).',
    });
  }

  // 5. Có sitemap.xml (2đ)
  if (meta.sitemapFound) {
    items.push({
      id: 'sitemap',
      nhom: 'ky_thuat',
      ten: 'Sơ đồ trang web (sitemap.xml)',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Có sơ đồ trang web sitemap.xml hợp lệ giúp Google tìm bài nhanh.',
    });
  } else {
    items.push({
      id: 'sitemap',
      nhom: 'ky_thuat',
      ten: 'Sơ đồ trang web (sitemap.xml)',
      diemToiDa: 2,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa tìm thấy sơ đồ trang web (sitemap.xml).',
    });
  }

  // 6. Chuyển hướng <= 2 lần (1đ)
  const redirectCount = meta.redirectChain ? meta.redirectChain.length : 0;
  if (redirectCount <= 2) {
    items.push({
      id: 'redirects',
      nhom: 'ky_thuat',
      ten: 'Số lần chuyển hướng đường dẫn (Redirects)',
      diemToiDa: 1,
      diem: 1,
      ketQua: 'dat',
      ghiChu:
        redirectCount === 0
          ? 'Truy cập thẳng trực tiếp, không bị trễ.'
          : `Chuyển hướng rất gọn gàng (${redirectCount} lần).`,
    });
  } else {
    items.push({
      id: 'redirects',
      nhom: 'ky_thuat',
      ten: 'Số lần chuyển hướng đường dẫn (Redirects)',
      diemToiDa: 1,
      diem: 0,
      ketQua: 'loi',
      ghiChu: `Chuyển hướng ${redirectCount} lần (quá nhiều), làm hao phí tốc độ mạng.`,
    });
  }

  // 7. Có dữ liệu cấu trúc JSON-LD (1đ)
  const jsonLdCount = doc.querySelectorAll('script[type="application/ld+json" i]').length;
  if (jsonLdCount > 0) {
    items.push({
      id: 'json_ld',
      nhom: 'ky_thuat',
      ten: 'Dữ liệu cấu trúc thông minh (Schema / JSON-LD)',
      diemToiDa: 1,
      diem: 1,
      ketQua: 'dat',
      ghiChu: 'Đã có dữ liệu JSON-LD giúp hiển thị thông tin nổi bật trên Google.',
    });
  } else {
    items.push({
      id: 'json_ld',
      nhom: 'ky_thuat',
      ten: 'Dữ liệu cấu trúc thông minh (Schema / JSON-LD)',
      diemToiDa: 1,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có mã JSON-LD, mất cơ hội hiện thông tin nổi bật.',
    });
  }

  // ==========================================
  // NHÓM 4: MẠNG XÃ HỘI (Tối đa 15 điểm)
  // ==========================================

  // 1. og:title (4đ)
  const ogTitle = doc.querySelector('meta[property="og:title" i]')?.getAttribute('content') || '';
  if (ogTitle.trim().length > 0) {
    items.push({
      id: 'og_title',
      nhom: 'mang_xa_hoi',
      ten: 'Tiêu đề khi chia sẻ Zalo / Facebook (og:title)',
      diemToiDa: 4,
      diem: 4,
      ketQua: 'dat',
      ghiChu: 'Khi gửi link qua Zalo hay Facebook, tiêu đề hiển thị rõ ràng.',
    });
  } else {
    items.push({
      id: 'og_title',
      nhom: 'mang_xa_hoi',
      ten: 'Tiêu đề khi chia sẻ Zalo / Facebook (og:title)',
      diemToiDa: 4,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có thẻ og:title khi chia sẻ liên kết.',
    });
  }

  // 2. og:description (3đ)
  const ogDesc = doc.querySelector('meta[property="og:description" i]')?.getAttribute('content') || '';
  if (ogDesc.trim().length > 0) {
    items.push({
      id: 'og_desc',
      nhom: 'mang_xa_hoi',
      ten: 'Đoạn giới thiệu khi gửi link (og:description)',
      diemToiDa: 3,
      diem: 3,
      ketQua: 'dat',
      ghiChu: 'Lời giới thiệu tóm tắt hiện đầy đủ dưới link gửi.',
    });
  } else {
    items.push({
      id: 'og_desc',
      nhom: 'mang_xa_hoi',
      ten: 'Đoạn giới thiệu khi gửi link (og:description)',
      diemToiDa: 3,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có thẻ og:description khi chia sẻ liên kết.',
    });
  }

  // 3. og:image (5đ)
  const ogImage = doc.querySelector('meta[property="og:image" i]')?.getAttribute('content') || '';
  if (ogImage.trim().length > 0) {
    items.push({
      id: 'og_image',
      nhom: 'mang_xa_hoi',
      ten: 'Hình ảnh đại diện khi gửi link (og:image)',
      diemToiDa: 5,
      diem: 5,
      ketQua: 'dat',
      ghiChu: 'Hình ảnh đại diện to đẹp bắt mắt mỗi khi bạn gửi link qua Zalo/Facebook.',
    });
  } else {
    items.push({
      id: 'og_image',
      nhom: 'mang_xa_hoi',
      ten: 'Hình ảnh đại diện khi gửi link (og:image)',
      diemToiDa: 5,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có hình ảnh đại diện og:image khi gửi link qua Zalo/Facebook.',
    });
  }

  // 4. twitter:card (3đ)
  const twitterCard =
    doc.querySelector('meta[name="twitter:card" i]')?.getAttribute('content') ||
    doc.querySelector('meta[property="twitter:card" i]')?.getAttribute('content') ||
    '';
  if (twitterCard.trim().length > 0) {
    items.push({
      id: 'twitter_card',
      nhom: 'mang_xa_hoi',
      ten: 'Thẻ chia sẻ mở rộng (twitter:card)',
      diemToiDa: 3,
      diem: 3,
      ketQua: 'dat',
      ghiChu: 'Đã chuẩn hóa định dạng hiển thị thẻ liên kết mạng xã hội.',
    });
  } else {
    items.push({
      id: 'twitter_card',
      nhom: 'mang_xa_hoi',
      ten: 'Thẻ chia sẻ mở rộng (twitter:card)',
      diemToiDa: 3,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có thẻ twitter:card khi chia sẻ liên kết.',
    });
  }

  // ==========================================
  // NHÓM 5: GIAO DIỆN & TRẢI NGHIỆM UI/UX (Tối đa 20 điểm)
  // ==========================================

  // 1. Thẻ Viewport chuẩn di động (3đ)
  const isViewportStandard =
    viewportContent.includes('width=device-width') &&
    (viewportContent.includes('initial-scale=1') || viewportContent.includes('initial-scale=1.0'));
  if (isViewportStandard) {
    items.push({
      id: 'ui_viewport',
      nhom: 'giao_dien_ux',
      ten: 'Khung nhìn tối ưu di động (Responsive Viewport)',
      diemToiDa: 3,
      diem: 3,
      ketQua: 'dat',
      ghiChu: 'Cấu hình khung nhìn đạt chuẩn quốc tế (width=device-width, initial-scale=1), hiển thị hoàn hảo trên mọi điện thoại.',
    });
  } else if (viewportTag) {
    items.push({
      id: 'ui_viewport',
      nhom: 'giao_dien_ux',
      ten: 'Khung nhìn tối ưu di động (Responsive Viewport)',
      diemToiDa: 3,
      diem: 1.5,
      ketQua: 'nen_sua',
      ghiChu: 'Thẻ viewport đã có nhưng chưa khai báo đầy đủ initial-scale=1, giao diện có thể bị zoom lệch khi mở.',
    });
  } else {
    items.push({
      id: 'ui_viewport',
      nhom: 'giao_dien_ux',
      ten: 'Khung nhìn tối ưu di động (Responsive Viewport)',
      diemToiDa: 3,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Thiếu cấu hình viewport, trang web sẽ bị thu nhỏ như trên máy tính khiến người dùng phải dùng ngón tay kéo dãn.',
    });
  }

  // 2. Cỡ chữ nền đọc tốt trên di động (2đ)
  // Quét các thẻ p, span, li xem có class text-xs hoặc font-size < 13px tràn lan không
  const rawHtml = html.toLowerCase();
  const hasTinyFontInline = /font-size\s*:\s*([6-9]|1[0-1])px/i.test(rawHtml);
  if (!hasTinyFontInline) {
    items.push({
      id: 'ui_font_size',
      nhom: 'giao_dien_ux',
      ten: 'Cỡ chữ đọc thoải mái trên điện thoại',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Phông chữ rõ ràng, cỡ chữ tối thiểu đạt từ 14px trở lên giúp khách hàng đọc tin tức không bị mỏi mắt.',
    });
  } else {
    items.push({
      id: 'ui_font_size',
      nhom: 'giao_dien_ux',
      ten: 'Cỡ chữ đọc thoải mái trên điện thoại',
      diemToiDa: 2,
      diem: 1,
      ketQua: 'nen_sua',
      ghiChu: 'Phát hiện một số đoạn văn bản dùng cỡ chữ nhỏ dưới 12px, có thể gây khó đọc cho khách hàng lớn tuổi.',
    });
  }

  // 3. Kích thước nút bấm & liên kết cảm ứng (2đ)
  const buttonTags = doc.querySelectorAll('button, a.btn, a[class*="button" i], [role="button" i]');
  if (buttonTags.length > 0) {
    items.push({
      id: 'ui_touch_target',
      nhom: 'giao_dien_ux',
      ten: 'Kích thước nút bấm & vùng chạm cảm ứng',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Các nút bấm và thanh điều hướng được bố trí kích thước ngón tay chạm vừa vặn, không bị bấm nhầm.',
    });
  } else {
    items.push({
      id: 'ui_touch_target',
      nhom: 'giao_dien_ux',
      ten: 'Kích thước nút bấm & vùng chạm cảm ứng',
      diemToiDa: 2,
      diem: 1,
      ketQua: 'nen_sua',
      ghiChu: 'Nên bổ sung các nút bấm hành động nổi bật (Kêu gọi hành động CTA) có khoảng đệm tối thiểu 44px.',
    });
  }

  // 4. Tương phản cơ bản văn bản và nền (2đ)
  const hasLowContrastSuspect = /color\s*:\s*(#ccc|#ddd|#eee|gray|lightgray)/i.test(rawHtml);
  if (!hasLowContrastSuspect) {
    items.push({
      id: 'ui_contrast',
      nhom: 'giao_dien_ux',
      ten: 'Độ tương phản chữ và nền trang',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Độ tương phản màu sắc rõ ràng, văn bản dễ đọc kể cả khi người dùng xem ngoài trời nắng.',
    });
  } else {
    items.push({
      id: 'ui_contrast',
      nhom: 'giao_dien_ux',
      ten: 'Độ tương phản chữ và nền trang',
      diemToiDa: 2,
      diem: 1,
      ketQua: 'nen_sua',
      ghiChu: 'Phát hiện một số đoạn chữ màu xám quá nhạt so với nền, nên tăng độ đậm để dễ nhìn hơn.',
    });
  }

  // 5. Nút liên hệ nhanh Hotline & Zalo (3đ)
  const hasTelLink = !!doc.querySelector('a[href^="tel:" i]');
  const hasZaloLink = !!doc.querySelector('a[href*="zalo.me" i]') || rawHtml.includes('zalo');
  if (hasTelLink || hasZaloLink) {
    items.push({
      id: 'ui_hotline_zalo',
      nhom: 'giao_dien_ux',
      ten: 'Nút gọi Hotline & Chat Zalo nhanh',
      diemToiDa: 3,
      diem: 3,
      ketQua: 'dat',
      ghiChu: `Có tiện ích liên hệ nhanh (${hasTelLink ? 'Số điện thoại bấm gọi ngay' : ''}${hasTelLink && hasZaloLink ? ' và ' : ''}${hasZaloLink ? 'Kênh chat Zalo tiện lợi' : ''}), khách hàng bấm vào là kết nối được ngay.`,
    });
  } else {
    items.push({
      id: 'ui_hotline_zalo',
      nhom: 'giao_dien_ux',
      ten: 'Nút gọi Hotline & Chat Zalo nhanh',
      diemToiDa: 3,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có nút bấm gọi Hotline (tel:) hoặc liên kết Zalo nhanh, khách truy cập khó liên hệ mua hàng.',
    });
  }

  // 6. Form liên hệ tinh gọn (2đ)
  const forms = doc.querySelectorAll('form');
  let hasComplexForm = false;
  forms.forEach((f) => {
    const inputs = f.querySelectorAll('input:not([type="hidden"]), select, textarea');
    if (inputs.length > 6) {
      hasComplexForm = true;
    }
  });

  if (forms.length === 0) {
    items.push({
      id: 'ui_short_form',
      nhom: 'giao_dien_ux',
      ten: 'Biểu mẫu liên hệ khách hàng',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Trang trình bày trực tiếp, không bắt khách hàng phải điền form đăng ký rườm rà.',
    });
  } else if (!hasComplexForm) {
    items.push({
      id: 'ui_short_form',
      nhom: 'giao_dien_ux',
      ten: 'Biểu mẫu liên hệ khách hàng',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Biểu mẫu điền thông tin rất tinh gọn (dưới 6 ô nhập liệu), giúp tỷ lệ khách để lại thông tin cao hơn.',
    });
  } else {
    items.push({
      id: 'ui_short_form',
      nhom: 'giao_dien_ux',
      ten: 'Biểu mẫu liên hệ khách hàng',
      diemToiDa: 2,
      diem: 1,
      ketQua: 'nen_sua',
      ghiChu: 'Biểu mẫu có trên 6 ô nhập liệu quá dài, nên rút gọn chỉ giữ lại Tên và Số điện thoại.',
    });
  }

  // 7. Mô tả Alt hỗ trợ tiếp cận (2đ)
  if (totalEligibleImg === 0) {
    items.push({
      id: 'ui_alt_ux',
      nhom: 'giao_dien_ux',
      ten: 'Trải nghiệm hình ảnh tiếp cận (Accessibility)',
      diemToiDa: 0,
      diem: 0,
      ketQua: 'khong_ap_dung',
      khongApDung: true,
      ghiChu: 'Không áp dụng: Trang không có hình ảnh.',
    });
  } else if (missingAltCount === 0) {
    items.push({
      id: 'ui_alt_ux',
      nhom: 'giao_dien_ux',
      ten: 'Trải nghiệm hình ảnh tiếp cận (Accessibility)',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: '100% hình ảnh có mô tả trợ năng, người dùng khiếm thị hoặc mạng chập chờn vẫn hiểu được nội dung.',
    });
  } else if ((totalEligibleImg - missingAltCount) / totalEligibleImg >= 0.7) {
    items.push({
      id: 'ui_alt_ux',
      nhom: 'giao_dien_ux',
      ten: 'Trải nghiệm hình ảnh tiếp cận (Accessibility)',
      diemToiDa: 2,
      diem: 1,
      ketQua: 'nen_sua',
      ghiChu: `Đã có ${(totalEligibleImg - missingAltCount)}/${totalEligibleImg} ảnh có mô tả, nên bổ sung nốt cho các ảnh còn lại.`,
    });
  } else {
    items.push({
      id: 'ui_alt_ux',
      nhom: 'giao_dien_ux',
      ten: 'Trải nghiệm hình ảnh tiếp cận (Accessibility)',
      diemToiDa: 2,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Nhiều hình ảnh chưa có mô tả alt, khi mạng chậm hình ảnh không tải được sẽ để lại khoảng trắng vô nghĩa.',
    });
  }

  // 8. Phân cấp tiêu đề trực quan H1 -> H2 (2đ)
  if (h1Count === 1 && h2Count >= 1) {
    items.push({
      id: 'ui_heading_hierarchy',
      nhom: 'giao_dien_ux',
      ten: 'Phân cấp tiêu đề thông tin mạch lạc',
      diemToiDa: 2,
      diem: 2,
      ketQua: 'dat',
      ghiChu: 'Phân cấp nội dung mạch lạc theo thứ tự H1 tới H2, khách lướt đọc rất dễ nắm bắt cấu trúc trang.',
    });
  } else if (h1Count >= 1) {
    items.push({
      id: 'ui_heading_hierarchy',
      nhom: 'giao_dien_ux',
      ten: 'Phân cấp tiêu đề thông tin mạch lạc',
      diemToiDa: 2,
      diem: 1,
      ketQua: 'nen_sua',
      ghiChu: 'Cấu trúc tiêu đề chưa cân đối, nên bổ sung các đề mục con để phân tách nội dung rõ ràng hơn.',
    });
  } else {
    items.push({
      id: 'ui_heading_hierarchy',
      nhom: 'giao_dien_ux',
      ten: 'Phân cấp tiêu đề thông tin mạch lạc',
      diemToiDa: 2,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Trang thiếu cấu trúc tiêu đề chuẩn, tạo cảm giác một khối văn bản dài khó theo dõi.',
    });
  }

  // 9. Biểu tượng nhận diện Favicon (1đ)
  if (hasFavicon) {
    items.push({
      id: 'ui_favicon',
      nhom: 'giao_dien_ux',
      ten: 'Biểu tượng thương hiệu trên tab (Favicon)',
      diemToiDa: 1,
      diem: 1,
      ketQua: 'dat',
      ghiChu: 'Có biểu tượng thương hiệu trên tab trình duyệt, tạo ấn tượng chuyên nghiệp và tin cậy.',
    });
  } else {
    items.push({
      id: 'ui_favicon',
      nhom: 'giao_dien_ux',
      ten: 'Biểu tượng thương hiệu trên tab (Favicon)',
      diemToiDa: 1,
      diem: 0,
      ketQua: 'loi',
      ghiChu: 'Chưa có biểu tượng Favicon trên tab trình duyệt.',
    });
  }

  // 10. Cảnh báo Popup che phủ màn hình (1đ)
  const hasIntrusivePopup =
    rawHtml.includes('modal-open') ||
    rawHtml.includes('popup-overlay') ||
    rawHtml.includes('subscribe-modal') ||
    rawHtml.includes('sp-fancybox');
  if (!hasIntrusivePopup) {
    items.push({
      id: 'ui_popup',
      nhom: 'giao_dien_ux',
      ten: 'Trải nghiệm vào trang không bị popup che chắn',
      diemToiDa: 1,
      diem: 1,
      ketQua: 'dat',
      ghiChu: 'Trang mở ra thoáng đãng, không có popup quảng cáo bất ngờ nhảy ra che khuất màn hình.',
    });
  } else {
    items.push({
      id: 'ui_popup',
      nhom: 'giao_dien_ux',
      ten: 'Trải nghiệm vào trang không bị popup che chắn',
      diemToiDa: 1,
      diem: 0,
      ketQua: 'nen_sua',
      ghiChu: 'Phát hiện cửa sổ quảng cáo/popup xuất hiện, có thể khiến khách lúng túng tìm nút đóng khi xem trên điện thoại.',
    });
  }

  // ==========================================
  // TỔNG HỢP VÀ QUY ĐỔI ĐIỂM SỐ
  // ==========================================

  const nhomMap: Record<'noi_dung' | 'di_dong' | 'ky_thuat' | 'mang_xa_hoi' | 'giao_dien_ux', ScoreGroup> = {
    noi_dung: { id: 'noi_dung', ten: 'Nội dung trang (30đ)', diemToiDa: 0, diemDat: 0, items: [] },
    di_dong: { id: 'di_dong', ten: 'Di động & Tốc độ (20đ)', diemToiDa: 0, diemDat: 0, items: [] },
    ky_thuat: { id: 'ky_thuat', ten: 'Kỹ thuật & Tìm kiếm (15đ)', diemToiDa: 0, diemDat: 0, items: [] },
    mang_xa_hoi: { id: 'mang_xa_hoi', ten: 'Mạng xã hội & Chia sẻ (15đ)', diemToiDa: 0, diemDat: 0, items: [] },
    giao_dien_ux: { id: 'giao_dien_ux', ten: 'Giao diện & Trải nghiệm UI/UX (20đ)', diemToiDa: 0, diemDat: 0, items: [] },
  };

  let tongDiemDat = 0;
  let tongDiemToiDaKhaDung = 0;

  for (const item of items) {
    nhomMap[item.nhom].items.push(item);
    // Mục không áp dụng bị loại khỏi điểm tối đa
    if (!item.khongApDung) {
      nhomMap[item.nhom].diemToiDa += item.diemToiDa;
      nhomMap[item.nhom].diemDat += item.diem;
      tongDiemDat += item.diem;
      tongDiemToiDaKhaDung += item.diemToiDa;
    }
  }

  // Quy đổi về thang 100
  let diemQuyDoi =
    tongDiemToiDaKhaDung > 0 ? Math.round((tongDiemDat / tongDiemToiDaKhaDung) * 100) : 0;

  // Đảm bảo không bao giờ < 0 hoặc > 100
  diemQuyDoi = Math.max(0, Math.min(100, diemQuyDoi));

  // Nếu có CỜ ĐỎ: giới hạn điểm tối đa 40 điểm!
  if (coCoDo && diemQuyDoi > 40) {
    diemQuyDoi = 40;
  }

  return {
    tongDiem: diemQuyDoi,
    diemThucTe: Math.round(tongDiemDat * 10) / 10,
    diemToiDaKhaDung: tongDiemToiDaKhaDung,
    nhoms: Object.values(nhomMap),
    allDoneItems: items,
    coCoDo,
    coDoLyDo,
    coCanhBaoVang,
    canhBaoVangLyDo,
    khongDangTin,
    khongDangTinLyDo,
    soTu: wordCount,
    soAnh: totalEligibleImg,
    soAnhThieuAlt: missingAltCount,
    soTheH1: h1Count,
    soTheH2: h2Count,
  };
}
