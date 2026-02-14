# 🎬 YouTube Auto Order Bot - TUTMXH.COM

Hệ thống tự động đặt hàng cho video YouTube mới theo lịch, chạy 24/7 trên Render.com (MIỄN PHÍ).

## ✨ Tính năng

- ✅ Chạy 24/7 trên server (không cần mở máy tính)
- ✅ Đăng nhập bảo mật
- ✅ Quản lý nhiều kênh độc lập
- ✅ Lên lịch tự động hoặc chạy liên tục
- ✅ Tự động phát hiện video mới
- ✅ Đặt hàng qua TUTMXH API
- ✅ Logs real-time
- ✅ Lưu lịch sử vĩnh viễn

---

## 🚀 HƯỚNG DẪN DEPLOY LÊN RENDER.COM (MIỄN PHÍ)

### **Bước 1: Chuẩn bị code**

1. Tải toàn bộ code về máy
2. Tạo tài khoản GitHub (nếu chưa có): https://github.com/signup
3. Tạo repository mới trên GitHub

### **Bước 2: Upload code lên GitHub**

**Cách 1: Dùng GitHub Desktop (Đơn giản nhất)**
1. Tải GitHub Desktop: https://desktop.github.com/
2. Cài đặt và đăng nhập
3. File > Add Local Repository > Chọn thư mục code
4. Publish repository

**Cách 2: Dùng Git command line**
```bash
cd youtube-auto-order
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/youtube-auto-order.git
git push -u origin main
```

### **Bước 3: Tạo tài khoản Render.com**

1. Truy cập: https://render.com/
2. Click "Get Started"
3. Đăng ký bằng GitHub (Sign up with GitHub)
4. Cho phép Render truy cập GitHub

### **Bước 4: Deploy lên Render**

1. Vào Dashboard Render: https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Chọn repository: `youtube-auto-order`
4. Điền thông tin:
   - **Name**: `youtube-auto-order` (hoặc tên bạn muốn)
   - **Region**: Singapore (hoặc gần Việt Nam nhất)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free** ⭐

5. Click "Advanced" và thêm Environment Variables:

```
TUTMXH_API_KEY=your_api_key_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password_123
SESSION_SECRET=random_secret_key_change_this_12345
YOUTUBE_API_KEY=your_youtube_api_key_here
```

⚠️ **QUAN TRỌNG**: 
- Thay đổi `ADMIN_PASSWORD` và `SESSION_SECRET` thành giá trị bảo mật của bạn!
- `YOUTUBE_API_KEY` là **TÙY CHỌN** - chỉ cần nếu bạn muốn phân biệt video thường và livestream

### **Lấy YouTube API Key (Tùy chọn - cho tính năng phân biệt livestream):**

1. Vào: https://console.cloud.google.com/
2. Tạo project mới hoặc chọn project có sẵn
3. Enable "YouTube Data API v3":
   - APIs & Services > Library
   - Tìm "YouTube Data API v3"
   - Click "Enable"
4. Tạo credentials:
   - APIs & Services > Credentials
   - Create Credentials > API Key
   - Copy API Key
5. Paste vào `YOUTUBE_API_KEY` ở Environment Variables

**Hạn mức miễn phí:**
- 10,000 units/ngày (FREE forever)
- Mỗi lần check video = 1 unit
- Đủ cho 10,000 lần check/ngày

**Lưu ý:** Nếu không cấu hình YouTube API Key:
- Hệ thống vẫn hoạt động bình thường
- Nhưng không thể phân biệt video thường vs livestream
- Tất cả video sẽ được xử lý như "Cả hai"

6. Click "Create Web Service"
7. Đợi 3-5 phút để deploy

### **Bước 5: Truy cập web app**

Sau khi deploy xong, bạn sẽ có URL dạng:
```
https://youtube-auto-order.onrender.com
```

Truy cập URL này và đăng nhập bằng:
- Username: `admin`
- Password: (password bạn đã set ở bước 4)

---

## 🌐 KẾT NỐI DOMAIN CỦA BẠN

### **Bước 1: Vào Custom Domain trên Render**

1. Vào Web Service của bạn trên Render
2. Tab "Settings"
3. Kéo xuống "Custom Domain"
4. Click "Add Custom Domain"

### **Bước 2: Thêm domain**

Nhập domain của bạn, ví dụ:
```
yourdomain.com
```

Render sẽ cho bạn giá trị DNS cần thêm.

### **Bước 3: Cấu hình DNS**

Vào nhà cung cấp domain của bạn (Namecheap, GoDaddy, Hostinger...) và thêm:

**Nếu dùng CNAME:**
```
Type: CNAME
Name: @  (hoặc www)
Value: youtube-auto-order.onrender.com
```

**Nếu dùng A Record:**
```
Type: A
Name: @
Value: (IP mà Render cung cấp)
```

### **Bước 4: Đợi DNS propagate**

- Thời gian: 5 phút - 24 giờ
- Kiểm tra: https://dnschecker.org/

Sau khi xong, truy cập domain của bạn!

---

## 📖 HƯỚNG DẪN SỬ DỤNG

### **1. Đăng nhập lần đầu**
- Truy cập URL của bạn
- Đăng nhập bằng username/password đã cấu hình

### **2. Cấu hình API Key**
- Lấy API Key từ: https://tutmxh.com/
- Dán vào ô "API Key"
- Click "Lưu API Key"
- Click "Tải dịch vụ"

### **3. Thêm kênh**
- Click "➕ Thêm kênh mới"
- Điền:
  - **Tên kênh**: Tên tùy ý
  - **Channel ID**: Lấy từ URL YouTube (phần UCxxx...)
  - **Lịch**: VD: `17:00,17:01,17:02,18:00` (hoặc để trống = mỗi 5 phút)
  - **Loại nội dung**: 
    - 🎬 Cả video thường và livestream (mặc định)
    - 📹 Chỉ video thường
    - 🔴 Chỉ livestream
- Chọn dịch vụ và số lượng
- Click "✅ Thêm kênh"

**Lưu ý về Loại nội dung:**
- Nếu có YouTube API Key: Hệ thống tự động phân biệt video/livestream
- Nếu không có YouTube API Key: Chỉ option "Cả hai" hoạt động

### **4. Bật kênh**
- Click "▶️ Chạy" ở kênh muốn bật
- Hoặc "▶️ Chạy tất cả" để bật hết

### **5. Theo dõi**
- Phần "Nhật ký hoạt động" sẽ hiển thị logs real-time
- Stats sẽ tự động cập nhật

---

## 🔧 CẬP NHẬT CODE

Khi bạn sửa code và muốn cập nhật:

```bash
git add .
git commit -m "Update features"
git push
```

Render sẽ **TỰ ĐỘNG** deploy lại!

---

## 💡 MẸO & LƯU Ý

### **Render Free Tier:**
- ✅ Hoàn toàn MIỄN PHÍ
- ✅ 750 giờ/tháng
- ⚠️ Ngủ sau 15 phút không có request
- 💡 Giải pháp: Dùng UptimeRobot để ping mỗi 5 phút

### **UptimeRobot (Giữ app luôn chạy):**
1. Tạo tài khoản: https://uptimerobot.com/
2. Add New Monitor:
   - Type: HTTP(s)
   - URL: `https://your-app.onrender.com`
   - Interval: 5 minutes
3. Save

### **Bảo mật:**
- ⚠️ LUÔN đổi `ADMIN_PASSWORD` và `SESSION_SECRET`
- ⚠️ KHÔNG share password
- ✅ Dùng password mạnh (12+ ký tự, số, chữ, ký tự đặc biệt)

### **Backup dữ liệu:**
- Database SQLite tự động lưu tại `/opt/render/project/src/data.db`
- Render không xóa data khi redeploy
- Nhưng nên backup định kỳ bằng cách download file

---

## 🐛 TROUBLESHOOTING

### **Lỗi: "Application failed to respond"**
- Kiểm tra logs trên Render Dashboard
- Đảm bảo `npm start` chạy được local
- Kiểm tra Environment Variables đã đúng chưa

### **Lỗi: "Cannot find module"**
- Build lại: `npm install`
- Commit và push lại

### **App ngủ sau 15 phút**
- Dùng UptimeRobot để ping
- Hoặc upgrade lên plan trả phí ($7/tháng)

### **Không thể login**
- Kiểm tra Environment Variables
- Xóa cache browser
- Thử browser khác

---

## 📞 HỖ TRỢ

Nếu gặp vấn đề:
1. Kiểm tra logs trên Render Dashboard
2. Kiểm tra logs trong app (phần "Nhật ký hoạt động")
3. Xem lại từng bước trong README

---

## 📄 LICENSE

MIT License - Tự do sử dụng và chỉnh sửa.

---

**🎉 CHÚC BẠN THÀNH CÔNG!**

Nếu có câu hỏi, hãy mở Issue trên GitHub.
