import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');

// 1. Tạo SVG 1200x630
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFBF0"/>
      <stop offset="100%" stop-color="#FFF3C4"/>
    </linearGradient>
    <linearGradient id="primary" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFB400"/>
      <stop offset="100%" stop-color="#E8890C"/>
    </linearGradient>
  </defs>
  
  <!-- Nền -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="24" y="24" width="1152" height="582" rx="32" fill="#FFFFFF" stroke="#2B1B0E" stroke-width="6" stroke-opacity="0.15"/>
  
  <!-- Điểm nhấn góc -->
  <circle cx="1080" cy="120" r="80" fill="#FFB400" fill-opacity="0.15"/>
  <circle cx="100" cy="530" r="60" fill="#E8890C" fill-opacity="0.12"/>
  
  <!-- Biểu tượng Ong Nhỏ -->
  <g transform="translate(120, 215)">
    <!-- Thân ong -->
    <ellipse cx="100" cy="100" rx="90" ry="70" fill="url(#primary)" stroke="#2B1B0E" stroke-width="8"/>
    <!-- Sọc nâu -->
    <path d="M 80 32 Q 75 100 80 168" stroke="#2B1B0E" stroke-width="18" fill="none" stroke-linecap="round"/>
    <path d="M 120 32 Q 125 100 120 168" stroke="#2B1B0E" stroke-width="18" fill="none" stroke-linecap="round"/>
    <!-- Mắt -->
    <circle cx="150" cy="85" r="9" fill="#2B1B0E"/>
    <!-- Cánh -->
    <ellipse cx="65" cy="35" rx="36" ry="22" fill="#FFFFFF" stroke="#2B1B0E" stroke-width="6" fill-opacity="0.9" transform="rotate(-30, 65, 35)"/>
    <ellipse cx="115" cy="35" rx="36" ry="22" fill="#FFFFFF" stroke="#2B1B0E" stroke-width="6" fill-opacity="0.9" transform="rotate(30, 115, 35)"/>
  </g>
  
  <!-- Tiêu đề & Thông điệp -->
  <g transform="translate(360, 230)">
    <rect x="0" y="-45" width="230" height="42" rx="12" fill="#FFF3C4" stroke="#FFB400" stroke-width="2"/>
    <text x="18" y="-17" font-family="'Be Vietnam Pro', Arial, sans-serif" font-size="18" font-weight="800" fill="#8A4B00" letter-spacing="1">BÁO CÁO NHANH</text>
    
    <text x="0" y="55" font-family="'Be Vietnam Pro', Arial, sans-serif" font-size="64" font-weight="900" fill="#2B1B0E">Ong Nhỏ</text>
    <text x="0" y="115" font-family="'Be Vietnam Pro', Arial, sans-serif" font-size="36" font-weight="700" fill="#8A4B00">Kiểm tra website miễn phí</text>
    <text x="0" y="170" font-family="'Be Vietnam Pro', Arial, sans-serif" font-size="22" font-weight="500" fill="#2B1B0E" fill-opacity="0.8">Chấm điểm SEO, Tốc độ, Di động &amp; Trải nghiệm UI/UX cho doanh nghiệp</text>
  </g>
  
  <!-- Chân trang -->
  <line x1="120" y1="520" x2="1080" y2="520" stroke="#2B1B0E" stroke-width="2" stroke-opacity="0.1"/>
  <text x="120" y="555" font-family="'Be Vietnam Pro', Arial, sans-serif" font-size="18" font-weight="600" fill="#2B1B0E" fill-opacity="0.6">Dành riêng cho chủ doanh nghiệp nhỏ tại Việt Nam • Không yêu cầu kiến thức kỹ thuật</text>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'og-image.svg'), svgContent, 'utf-8');
console.log('Đã tạo public/og-image.svg thành công');

// 2. Tạo PNG 1200x630 nhị phân hợp lệ không cần phụ thuộc thư viện ngoài
// Tạo PNG 1200x630 chuẩn định dạng IHDR + IDAT + IEND
function createSolidPng(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB (3 bytes per pixel)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    // CRC
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  // Raw image data with filter type 0 at the start of each scanline
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowSize);

  // Tô màu nền vàng nhạt #FFFBF0 và vẽ viền vàng cam #FFB400
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      // Khung viền và nền
      const isBorder = (x < 12 || x >= width - 12 || y < 12 || y >= height - 12);
      const isInnerBorder = (x >= 24 && x < 32 || x >= width - 32 && x < width - 24 || y >= 24 && y < 32 || y >= height - 32 && y < height - 24);
      if (isBorder) {
        // Viền vàng mật ong #FFB400
        rawData[pxOffset] = 255;
        rawData[pxOffset + 1] = 180;
        rawData[pxOffset + 2] = 0;
      } else if (isInnerBorder) {
        // Viền trong cam đất #E8890C
        rawData[pxOffset] = 232;
        rawData[pxOffset + 1] = 137;
        rawData[pxOffset + 2] = 12;
      } else {
        // Nền sáng ngà #FFFBF0
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Bảng CRC32 chuẩn
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[i] = c;
}

// Tạo file PNG kích thước 1200x630 (màu RGB ngà #FFFBF0)
const pngBuffer = createSolidPng(1200, 630, 255, 251, 240);
fs.writeFileSync(path.join(publicDir, 'og-image.png'), pngBuffer);
console.log(`Đã tạo public/og-image.png (1200x630) thành công: ${pngBuffer.length} bytes`);
