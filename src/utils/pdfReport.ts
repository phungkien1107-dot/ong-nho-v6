/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TIỆN ÍCH XUẤT BÁO CÁO PDF A4 VÀ CHIA SẺ
 * Dùng html2canvas chụp từng khối [data-pdf-block="true"] và ghép vào jsPDF A4 đứng.
 * Tránh triệt để việc cắt ngang dòng chữ giữa các trang, nén JPEG 0.92, chân trang Trang x/y.
 */

export interface SavePdfResult {
  success: boolean;
  method: 'shared' | 'downloaded' | 'modal_required';
  blobUrl?: string;
  error?: string;
}

/**
 * Chờ toàn bộ font chữ và hình ảnh trong container được nạp xong
 */
async function waitForAssets(containerEl: HTMLElement): Promise<void> {
  // Chờ font
  if (typeof document !== 'undefined' && (document as any).fonts && (document as any).fonts.ready) {
    try {
      await (document as any).fonts.ready;
    } catch {
      // Bỏ qua lỗi font nếu có
    }
  }

  // Chờ ảnh tải xong
  const images = Array.from(containerEl.querySelectorAll('img'));
  if (images.length > 0) {
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      })
    );
  }
}

/**
 * Tạo Blob PDF A4 từ container chứa các khối data-pdf-block="true"
 * Có bảo vệ timeout 30 giây.
 */
export async function generatePdfBlobFromBlocks(
  containerEl: HTMLElement,
  timeoutMs: number = 30000
): Promise<Blob> {
  const task = (async () => {
    await waitForAssets(containerEl);

    // Tìm tất cả các khối có data-pdf-block="true"
    let blocks = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-pdf-block="true"]'));
    if (blocks.length === 0) {
      blocks = [containerEl];
    }

    // Nạp thư viện html2canvas và jspdf theo nhu cầu (lazy load)
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    // Khởi tạo tài liệu A4 đứng: 210 x 297 mm
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const marginX = 10;
    const contentWidth = 190; // 210 - 2 * 10
    const marginTop = 10;
    const maxContentY = 280; // Dành 17mm dưới chân trang cho footer tại y = 290mm

    let currentY = marginTop;

    // Chụp từng khối một và ghép vào trang
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      const canvas = await html2canvas(block, {
        scale: Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1.5) || 1.5),
        backgroundColor: '#FFFFFF',
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const blockHeightMm = (canvas.height * contentWidth) / canvas.width;

      // Nếu khối quá dài vượt quá cả một trang đơn lẻ
      if (blockHeightMm > (maxContentY - marginTop)) {
        if (currentY > marginTop) {
          pdf.addPage();
          currentY = marginTop;
        }
        const maxHeight = maxContentY - marginTop;
        const scale = maxHeight / blockHeightMm;
        const scaledHeight = maxHeight;
        const scaledWidth = contentWidth * scale;
        const offsetX = marginX + (contentWidth - scaledWidth) / 2;

        pdf.addImage(imgData, 'JPEG', offsetX, currentY, scaledWidth, scaledHeight, undefined, 'FAST');
        currentY += scaledHeight + 3.5;
      } else {
        // Nếu cộng khối này vào vượt quá đáy trang thì sang trang mới
        if (currentY > marginTop && currentY + blockHeightMm > maxContentY) {
          pdf.addPage();
          currentY = marginTop;
        }

        pdf.addImage(imgData, 'JPEG', marginX, currentY, contentWidth, blockHeightMm, undefined, 'FAST');
        currentY += blockHeightMm + 3.5; // Khoảng cách giữa các khối
      }
    }

    // In chân trang "Trang x / y" và ngày xuất ở cuối mỗi trang
    const totalPages = (pdf.internal as any).getNumberOfPages();
    const nowStr = new Date().toLocaleDateString('vi-VN');

    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 113, 108); // Màu đá xám #78716C
      pdf.text('Ong Nho - Kiem tra website', marginX, 291);
      pdf.text(`Trang ${p} / ${totalPages} - ${nowStr}`, pageWidth - marginX, 291, { align: 'right' });
    }

    return pdf.output('blob');
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Quá thời gian 30 giây khi tạo tài liệu PDF'));
    }, timeoutMs);
  });

  return Promise.race([task, timeoutPromise]);
}

/**
 * Tải file hoặc chia sẻ PDF an toàn trên mọi thiết bị
 */
export async function downloadOrSharePdf(
  blob: Blob,
  fileName: string
): Promise<SavePdfResult> {
  // 1. Nếu di động hỗ trợ Web Share API có file: mở bảng chia sẻ hệ thống
  if (typeof navigator !== 'undefined' && (navigator as any).canShare) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if ((navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({
          files: [file],
          title: 'Báo cáo Ong Nhỏ',
          text: `Báo cáo kiểm tra website: ${fileName}`,
        });
        return { success: true, method: 'shared' };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Người dùng tự đóng share sheet
        return { success: true, method: 'shared' };
      }
      console.warn('Lỗi chia sẻ file, chuyển sang tải file:', err);
    }
  }

  // Tạo Blob URL
  const blobUrl = URL.createObjectURL(blob);

  // 2. Kiểm tra nếu là thiết bị iOS (Safari) thường chặn tải tự động
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  if (isIOS) {
    return {
      success: true,
      method: 'modal_required',
      blobUrl,
    };
  }

  // 3. Tải tự động qua thẻ <a> có thuộc tính download
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) {
        document.body.removeChild(link);
      }
    }, 1000);

    return {
      success: true,
      method: 'downloaded',
      blobUrl,
    };
  } catch (err: any) {
    return {
      success: true,
      method: 'modal_required',
      blobUrl,
    };
  }
}

/**
 * Chia sẻ văn bản hoặc URL qua Web Share API
 */
export async function shareReportData(title: string, text: string, url: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return true;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Lỗi khi chia sẻ qua Web Share API:', err);
      }
    }
  }
  return false;
}
