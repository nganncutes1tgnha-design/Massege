# Massege

Mạng xã hội bằng React + TypeScript + Vite, tập trung vào hồ sơ cá nhân và kết nối bạn bè. Giao diện tiếng Việt và hỗ trợ điện thoại. Dùng Supabase cho đăng nhập, hồ sơ và lời mời kết bạn; nếu chưa cấu hình backend, website chạy bản mẫu cục bộ như trước.

## Phát triển

Cần Node.js >= 22.12.0. Đã kiểm tra với Node.js 24.19.0.

```sh
cd /workspace/Massege
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev
```

Vite dùng cổng 5173. `npm run build` kiểm tra TypeScript và tạo bản production trong `dist/`. `npm run preview -- --port 4173 --strictPort` chạy bản production.

## Kết nối Supabase lần đầu

1. Tạo project tại https://supabase.com/dashboard. Giữ riêng mật khẩu database.
2. Vào **SQL Editor**, tạo truy vấn mới, dán toàn bộ nội dung [migration](supabase/migrations/202610140001_social.sql) và bấm **Run**. Migration tạo bảng hồ sơ và lời mời, trigger tạo hồ sơ khi đăng ký, RLS và các RPC xử lý kết bạn. Có thể chạy lại mà không xóa hồ sơ hoặc kết nối đã có.
3. Trong Supabase **Authentication → URL Configuration**, đặt **Site URL** là `https://massege-eta.vercel.app`. Thêm URL đó vào **Redirect URLs**. Nếu thử trên máy, thêm `http://localhost:5173` và `http://127.0.0.1:5173`. Với domain riêng, đổi sang đúng domain website; không cho phép redirect tới mọi domain.
4. Bật phương thức **Email** trong Authentication. Giữ xác nhận email bật. Để gửi email cho người dùng ngoài nhóm quản trị, cấu hình SMTP riêng theo hướng dẫn Supabase; dịch vụ email mặc định có hạn chế người nhận và quota. Email xác nhận và đặt lại mật khẩu chỉ hoạt động khi Supabase gửi email thành công.
5. Lấy **Project URL** và **Publishable key** từ phần kết nối/API keys của dự án. Đây là cấu hình công khai cho trình duyệt. Có thể dùng legacy **anon key** thay publishable key. Không dùng **secret key**, **service_role key**, mật khẩu database hoặc connection string trong frontend.
6. Trong Vercel **Project → Settings → Environment Variables**, thêm:

   | Tên                             | Giá trị                              |
   | ------------------------------- | ------------------------------------ |
   | `VITE_SUPABASE_URL`             | Project URL của Supabase             |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key hoặc legacy anon key |

   Chọn môi trường **Production** và redeploy. Các biến Vite được đọc khi build; thay biến sau một deployment không cập nhật bản đã build. Preview cần biến tương ứng và redirect URL chính xác nếu muốn dùng đăng nhập trên preview.

7. Đăng ký hai tài khoản thử của bạn, xác nhận email, sửa hồ sơ; dùng hai trình duyệt riêng để gửi/chấp nhận lời mời. Người nhận tải lại trang hoặc chờ tối đa 30 giây để thấy dữ liệu mới. Không có hồ sơ mẫu trong danh sách người dùng thật.

Cho phát triển cục bộ, sao chép `.env.example` thành `.env.local`, điền hai giá trị công khai và khởi động lại Vite. `.env.local` và thư mục `.vercel/` được Git bỏ qua. Không cấu hình cả hai biến thì bản mẫu vẫn hoạt động; cấu hình thiếu hoặc dùng key quản trị sẽ làm build thất bại trước khi bundle được tạo.

## Bật bảng tin trên Supabase

Sau migration hồ sơ và kết bạn, chạy [migration bảng tin](supabase/migrations/202611210001_feed.sql) một lần trong **SQL Editor** của đúng dự án Supabase. Thực hiện bước này trước khi triển khai bản web có bảng tin.

## Bật nhắn tin riêng

Chạy [migration nhắn tin riêng](supabase/migrations/202611210002_direct_messages.sql), rồi chạy [migration Realtime và tin chưa đọc](supabase/migrations/202611210003_direct_realtime.sql) trong **SQL Editor**. Người dùng đã kết bạn có thể mở **Bạn bè → Nhắn tin** để gửi văn bản và xem lịch sử. Tin mới tự xuất hiện và số tin chưa đọc hiển thị ở mục **Bạn bè** và cạnh từng nút **Nhắn tin**. Mở cuộc trò chuyện trong tab đang hiển thị sẽ đánh dấu các tin đã nhận là đã đọc.

## Chức năng

- Mục **Tin nhắn** hiển thị các cuộc trò chuyện gần đây, lời nhắn cuối và số tin chưa đọc. Bật tính năng trên Supabase bằng [migration hộp thư](supabase/migrations/202611210004_direct_inbox.sql) sau migration Realtime.

- Đăng ký email/mật khẩu, xác nhận email, đăng nhập, đăng xuất trên trình duyệt hiện tại và đặt lại mật khẩu.
- Hồ sơ riêng: tên, giới thiệu, địa điểm, câu chuyện và tối đa 5 sở thích.
- Tìm người theo tên, địa điểm hoặc sở thích; tìm kiếm tiếng Việt không dấu.
- Gửi/hủy lời mời, chấp nhận/từ chối; bạn bè và số bạn chung tính từ dữ liệu đã chấp nhận.
- Làm mới dữ liệu mỗi 30 giây khi trang đang hiển thị và khi quay lại tab.
- RLS chỉ cho sửa hồ sơ của chính mình. Lời mời chỉ đọc được bởi hai người liên quan. Các thay đổi kết bạn đi qua RPC kiểm tra `auth.uid()`; người gửi không được tự chấp nhận lời mời.
- Nếu không cấu hình Supabase, bản mẫu lưu trong localStorage vẫn hoạt động. Có thể khám phá bản mẫu từ trang đăng nhập, với dữ liệu tách biệt khỏi tài khoản thật.

- Bảng tin cho tài khoản đã đăng nhập: bài viết văn bản, thích/bỏ thích và bình luận. Supabase kiểm tra quyền sửa/xóa theo tác giả. Xóa bài viết cũng xóa bình luận và lượt thích gắn với bài đó.

Hồ sơ và bài viết hiển thị với mọi người dùng đã đăng nhập.

## Kiểm tra

```sh
npm run build
npm run test:database
```

Các kiểm tra database chạy migration, RLS và RPC bằng PostgreSQL qua PGlite, với schema `auth` mô phỏng vai trò Supabase. Chúng kiểm tra quyền của tác giả, giới hạn nội dung, lượt thích trùng, dọn dữ liệu khi xóa bài và các luồng hồ sơ/kết bạn.

Kiểm tra giao diện đăng nhập với HTTP fixtures hoàn toàn cục bộ (không gửi email hay tạo tài khoản ngoài hệ thống thử):

```sh
# Terminal riêng: các giá trị sau chỉ dành cho fixtures cục bộ.
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_browser_test_fixture \
npm run dev -- --port 5180 --strictPort

# Terminal thứ hai, dùng Python Playwright và Chromium có sẵn trong Codex:
python3 tests/browser_auth.py
```

11 kiểm tra giao diện bao gồm đăng ký và chờ xác nhận email, đăng nhập sai/đúng, khôi phục phiên, sửa hồ sơ, lỗi cập nhật kết nối, gửi/hủy/chấp nhận, đăng xuất/đổi tài khoản, điện thoại và đặt lại mật khẩu. Khi có dự án Supabase, cần kiểm tra riêng việc gửi/nhận email và luồng giữa hai tài khoản thật trước khi coi backend sẵn sàng.
