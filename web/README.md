# TicketOps — ứng dụng vận hành Next.js

Ứng dụng quản lý sàn nguồn, tài khoản nguồn, sự kiện/suất/loại vé, lần mua, kho vé, đơn giữ, link thanh toán payOS, đối soát và giao vé thủ công cho nhân viên. `../frontend/` là **demo tham khảo**, không phải backend hoặc hệ thống dữ liệu thật.

## Phát triển

Yêu cầu Node.js 22+, PostgreSQL 16+. Xem `../docs/huong-dan-trien-khai-nextjs.md` cho biến môi trường, migrations và triển khai Docker. **Hiện chưa có `package-lock.json` vì thao tác cài dependencies không được phép trong phiên xây dựng này; `npm ci` và Docker build chưa thể chạy.** Cần tạo lockfile bằng quy trình cài đặt được phê duyệt rồi chạy toàn bộ kiểm thử trước khi dùng. Không lưu dữ liệu thật nếu chưa hoàn tất checklist go-live.

```sh
npm ci
npm run db:migrate
npm run bootstrap:owner
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

Chỉ server được giữ `DATABASE_URL`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`. Cấu hình `APP_URL` đúng domain HTTPS trước khi đăng ký webhook; không dùng redirect của người mua làm bằng chứng thanh toán. Nếu thiếu cấu hình payOS, ứng dụng không tạo link hoặc xác nhận tiền giả.

## Phạm vi bản đầu

Dành cho **nhân viên vận hành**: không có đăng ký công khai, storefront, gửi email hoặc tự động giao mã/QR. Tài khoản nguồn là nhãn quản lý, **không chứa mật khẩu/OTP**. Vé chỉ bán sau khi chính sách chuyển và cách giao đã được xác minh; chuyển vé được nhân viên thực hiện ngoài hệ thống theo cách được phép và lưu tham chiếu bằng chứng. Tiền lệch/đến muộn là trường hợp cần xử lý, không tự giao hay thu hồi vé đã chuyển cho đơn khác. Chính sách hoàn và điều kiện chuyển cần được xác nhận theo từng sàn/sự kiện trước khi dùng thật.
