# ⚡ ZALO MARKETING PRO & LIVE CHAT WEB SUITE

> **Hệ thống Quản lý Nhóm Zalo, Nhắn Tin Trực Tiếp Thời Gian Thực, Gửi Tin Nhắn Thoại (Voice Note) và Studio Chiến Dịch Ads Tự Động Hóa.**
> Hoạt động 100% mượt mà trên cả **Điện thoại (iOS / Android)** và **Máy tính (Windows / macOS / Linux)**.

---

## 🌟 Tính Năng Nổi Bật

1. **💬 Hộp Thư & Nhắn Tin Trực Tiếp (Live Realtime Chat)**:
   - Nhắn tin 1-1 và gửi tin nhắn vào nhóm Zalo thời gian thực.
   - Nhận tin nhắn đến tức thì qua kết nối WebSocket Realtime Stream.
   - Gửi kèm văn bản, ảnh, tài liệu (PDF, Word, Excel, ZIP...).

2. **🎙️ Gửi Tin Nhắn Thoại (Voice Note / Sóng Âm Zalo)**:
   - Thu âm giọng nói trực tiếp từ Micro trên trình duyệt Web.
   - Tải file âm thanh (.mp3, .m4a, .wav, .aac, .ogg) gửi thẳng thành Voice Note chuẩn Zalo (nghe trực tiếp trên Zalo).
   - Nút gửi Voice trực tiếp vào nhóm Zalo chỉ với 1 click.

3. **👥 Quản Lý Nhóm & Quét Thành Viên**:
   - Quét danh sách nhóm và toàn bộ thành viên (Tên, UID, Avatar).
   - Tự động lấy avatar Trưởng nhóm / Người tạo nhóm làm logo đại diện nếu nhóm chưa có ảnh.
   - Xuất danh sách thành viên ra file Excel (CSV), TXT, JSON.
   - Nút nhắn tin 1-Click cạnh bất kỳ thành viên nào.

4. **🚀 Studio Chiến Dịch Ads Tự Động (Anti-Ban Engine)**:
   - Cá nhân hóa tin nhắn tự động với biến `{name}`, `{id}`, `{uid}`.
   - Tính năng **Spin Text** `{Chào|Hi|Hello}` chống trùng lặp nội dung.
   - Bộ điều chỉnh độ trễ ngẫu nhiên (Delay Timer) chống chặn / hạn chế tài khoản.
   - Gửi chiến dịch kèm Voice Note hoặc hình ảnh / tài liệu.

5. **📱 Tương Thích 100% Di Động & Máy Tính**:
   - Giao diện Cyberpunk Glassmorphism Neon siêu đẹp.
   - Thanh điều hướng thông minh dưới đáy màn hình (Mobile Bottom Navigation).
   - Tự động co giãn màn hình hoàn hảo trên iPhone, iPad, Android và PC.

---

## 💻 Cách Cài Đặt & Chạy Trên Máy Tính

### 1. Yêu cầu:
- Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 18 trở lên).

### 2. Khởi chạy:
```bash
# Cài đặt các thư viện phụ thuộc
npm install

# Khởi động Web Dashboard
npm start
```
Mở trình duyệt truy cập: **`http://localhost:3000`**

---

## 🌐 Cách Đưa Lên Chạy Online Miễn Phí (Truy Cập Trên Điện Thoại Từ Bất Cứ Đâu)

### Cách 1: Triển khai miễn phí lên Render.com (Khuyên Dùng)
1. Đăng ký tài khoản miễn phí tại [Render.com](https://render.com/).
2. Bấm **New +** ➡️ Chọn **Web Service**.
3. Kết nối với GitHub Repository của bạn: `https://github.com/okphong582-png/Zalo`.
4. Render sẽ tự động nhận diện cấu hình:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Bấm **Create Web Service** ➡️ Đợi 1 phút, bạn sẽ nhận được một đường link web online (ví dụ: `https://zalo-pro-xxx.onrender.com`).
6. Dùng điện thoại hoặc máy tính mở link đó là có thể sử dụng 24/7 từ bất cứ đâu!

### Cách 2: Triển khai lên Koyeb / Railway / Glitch / Docker
- Dự án đã tích hợp sẵn tệp `Dockerfile`, `Procfile`, và `render.yaml`, bạn chỉ cần kết nối GitHub repo là hệ thống tự động build và chạy ngay lập tức.

### Cách 3: Chạy từ máy nhà & mở link xem trên điện thoại (Localtunnel / Ngrok)
Nếu bạn muốn chạy trực tiếp trên máy tính nhưng muốn mở trên điện thoại ngoài đường:
```bash
# Khởi động server
npm start

# Mở một cửa sổ terminal mới và gõ:
npx localtunnel --port 3000
```
Bạn sẽ nhận được một đường link URL công khai để mở trên điện thoại ngay lập tức!
