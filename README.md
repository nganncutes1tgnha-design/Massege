# Massege

Bản trải nghiệm mạng xã hội bằng React + TypeScript + Vite, tập trung vào hồ sơ cá nhân và kết nối bạn bè. Giao diện tiếng Việt, thích ứng điện thoại và máy tính; không phụ thuộc ảnh, font hay dịch vụ bên ngoài khi chạy.

## Phát triển

Cần Node.js >= 22.12.0 và npm. Môi trường đã được kiểm tra với Node.js 24.19.0.

```sh
cd /workspace/Massege
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev
```

Vite dùng cổng 5173. `npm run build` chạy kiểm tra TypeScript rồi tạo bản production trong `dist/`. `npm run preview -- --port 4173 --strictPort` chạy thử bản production.

## Những gì có thể thử

- Sửa tên, giới thiệu, địa điểm, câu chuyện và tối đa 5 sở thích.
- Tìm người theo tên, địa điểm, sở thích; tìm kiếm hỗ trợ tiếng Việt không dấu.
- Xem hồ sơ, gửi hoặc hủy lời mời, chấp nhận hoặc từ chối lời mời nhận được.
- Xem bạn bè, lọc sở thích, điều hướng bằng bàn phím và dùng trên điện thoại.
- Hồ sơ và trạng thái kết nối được lưu bằng localStorage, giữ lại sau khi tải lại.

## Phạm vi bản trải nghiệm

Các hồ sơ và số bạn chung là dữ liệu mẫu. Đây là một bản prototype trên trình duyệt, chưa có đăng nhập, backend, nhắn tin hay đồng bộ giữa người dùng. Thao tác kết bạn không gửi lời mời cho người thật. localStorage không phải nơi lưu mật khẩu hoặc thông tin nhạy cảm.

Bước phát triển tiếp theo: chọn dịch vụ xác thực và cơ sở dữ liệu, thêm kiểm soát truy cập, rồi thay dữ liệu mẫu bằng hồ sơ và lời mời thực tế.
