# Ong Nhỏ – Kiểm tra website

Ứng dụng kiểm tra và chấm điểm website dành riêng cho chủ doanh nghiệp nhỏ và chủ shop tại Việt Nam.

## 1. Cách khởi động ứng dụng
1. Cài đặt các gói phụ thuộc (nếu cần):
   ```bash
   npm install
   ```
2. Chạy ứng dụng ở chế độ phát triển (bao gồm máy chủ Express và giao diện React Vite):
   ```bash
   npm run dev
   ```
   Ứng dụng sẽ chạy tại địa chỉ: `http://0.0.0.0:3000`

## 2. Cách thêm khóa OPENAI_API_KEY
- **Cách 1 (Khuyên dùng trong AI Studio):**
  Thêm biến `OPENAI_API_KEY` vào bảng điều khiển **Secrets** của AI Studio.
- **Cách 2 (Trên máy chủ cục bộ hoặc VPS):**
  Tạo hoặc mở file `.env` ở thư mục gốc và thêm:
  ```env
  OPENAI_API_KEY=sk-...
  OPENAI_MODEL=gpt-4o-mini
  PORT=3000
  ```
- *Lưu ý:* Khi chưa có khóa `OPENAI_API_KEY`, ứng dụng vẫn hoạt động 100% trơn tru nhờ cơ chế nhận xét dự phòng thông minh (tự động gắn nhãn "Nhận xét tự động").
