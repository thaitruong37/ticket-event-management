# Hướng dẫn triển khai ứng dụng Next.js

Tài liệu này mô tả cách chạy ứng dụng nhân viên trên một VPS bằng Docker Compose, PostgreSQL 16 và Caddy HTTPS. Cấu hình hiện tại **không đồng nghĩa hệ thống đã sẵn sàng xử lý tiền hoặc vé thật**. Chỉ go-live sau khi đã kiểm chứng payOS bằng credential/channel được cấp, chạy thử webhook HTTPS, và diễn tập backup/restore thành công.

## 1. Kiến trúc triển khai

- `caddy`: nhận cổng 80/443, tự cấp/gia hạn TLS và reverse proxy tới `web:3000`.
- `web`: chạy file `server.js` từ Next.js standalone, không publish trực tiếp cổng 3000 ra VPS.
- `worker`: chạy `npm run worker` để xử lý hết hạn/đối soát. Worker phải tự dùng khóa/lock ở cơ sở dữ liệu để tránh hai lượt xử lý đồng thời.
- `migrate`: tác vụ một lần chạy `npm run db:migrate`; không tự chạy migration mỗi lần web khởi động.
- `postgres`: PostgreSQL 16, chỉ ở mạng Docker nội bộ, không publish cổng 5432, dữ liệu nằm trong volume `postgres_data`.

`web` và `worker` có đường ra Internet để gọi payOS. PostgreSQL chỉ tham gia mạng `backend` được đánh dấu `internal`.

## 2. Điều kiện trước khi triển khai

### Hạ tầng

- VPS Linux 64-bit có Docker Engine và Docker Compose plugin hiện hành.
- Domain do đơn vị kiểm soát; bản ghi DNS `A`/`AAAA` trỏ đúng về VPS.
- Firewall chỉ mở SSH theo chính sách vận hành và TCP 80, TCP/UDP 443. Không mở 3000 hoặc 5432.
- Đồng hồ VPS đồng bộ NTP; dung lượng đĩa và cảnh báo dung lượng đã được cấu hình.

### Mã nguồn

Trước khi build, nhánh phát hành phải có đầy đủ:

1. `web/package-lock.json` phù hợp với `web/package.json`; Dockerfile cố ý dùng `npm ci` và sẽ dừng nếu thiếu lockfile.
2. Cấu hình Next.js `output: "standalone"` để sinh `web/.next/standalone/server.js`.
3. Các script `npm run build`, `npm run worker`, `npm run db:migrate` và `npm run bootstrap:owner` hoạt động trong môi trường phát hành.
4. Migration đã được version hóa; migration không xóa/reset dữ liệu ngoài chủ đích.
5. Worker có cơ chế khóa để nhiều process không xử lý cùng một kỳ expiry/reconcile.

Chạy các cổng kiểm tra của dự án trước khi tạo image:

```bash
cd web
npm ci
npm run typecheck
npm run lint
npm test
npm run build
cd ..
```

Không tiếp tục nếu một bước thất bại hoặc `.next/standalone/server.js` không được tạo.

## 3. Chuẩn bị DNS, thư mục và biến môi trường

Ví dụ thư mục triển khai:

```bash
sudo install -d -m 750 /srv/ticketops
sudo chown "$USER":"$USER" /srv/ticketops
cd /srv/ticketops
```

Đưa mã nguồn phát hành đã được duyệt vào thư mục này. Không đưa `.env` vào Git, image Docker, tài liệu nội bộ hoặc kênh chat.

Sao chép mẫu rồi sửa trực tiếp trên VPS:

```bash
cp .env.example .env
chmod 600 .env
```

Các biến bắt buộc:

| Biến | Mục đích |
|---|---|
| `DOMAIN` | Tên miền công khai, không gồm `https://` |
| `APP_URL` | URL chuẩn của ứng dụng, dạng `https://<domain>` |
| `POSTGRES_PASSWORD` | Mật khẩu ngẫu nhiên dài cho role PostgreSQL `ticketops` |
| `DATABASE_URL` | Chuỗi kết nối tới host Docker `postgres`, database/user `ticketops` |
| `PAYOS_CLIENT_ID` | Client ID do payOS cấp |
| `PAYOS_API_KEY` | API key do payOS cấp |
| `PAYOS_CHECKSUM_KEY` | Khóa xác minh chữ ký webhook do payOS cấp |

Tạo mật khẩu trên VPS bằng nguồn ngẫu nhiên an toàn. Nếu mật khẩu có ký tự đặc biệt, phần mật khẩu trong `DATABASE_URL` phải được percent-encode, trong khi `POSTGRES_PASSWORD` vẫn là giá trị gốc. Hai biến phải đại diện cho cùng một mật khẩu.

Có thể để ba biến payOS trống ở môi trường staging không thanh toán. Khi thiếu credential, ứng dụng phải từ chối tạo link/thao tác xác nhận thanh toán; không được dùng checkout giả hoặc đánh dấu đơn đã trả tiền.

Kiểm tra cấu hình Compose đã nội suy mà không in hoặc lưu đầu ra chứa secret vào ticket/log chia sẻ:

```bash
docker compose config --quiet
```

## 4. Build, migration và khởi động lần đầu

Build hai target. Target `web-runner` chỉ chạy Next standalone; target `ops-runner` giữ công cụ cần cho worker/migration TypeScript.

```bash
docker compose build web worker
```

Khởi động cơ sở dữ liệu và chờ trạng thái healthy:

```bash
docker compose up -d postgres
docker compose ps
```

Chạy migration như một bước phát hành riêng. Xem log và dừng triển khai nếu migration lỗi:

```bash
docker compose --profile tools run --rm migrate
```

Sau đó khởi động web, worker và Caddy:

```bash
docker compose up -d web worker caddy
docker compose ps
```

Theo dõi log ban đầu; không đưa khóa, URL cơ sở dữ liệu đầy đủ, dữ liệu khách hàng hoặc mã vé vào hệ thống log:

```bash
docker compose logs --since=10m web worker caddy postgres
```

Kiểm tra từ máy ngoài VPS:

```bash
curl -I "https://<domain>"
```

Một redirect tới trang đăng nhập có thể là bình thường. TLS phải hợp lệ cho đúng domain. Nếu Caddy chưa cấp được chứng chỉ, kiểm tra DNS, firewall, cổng 80/443 và log Caddy; không bỏ HTTPS để lách lỗi.

## 5. Khởi tạo tài khoản owner

Chỉ chạy sau migration, từ terminal tương tác có TTY (không dùng `-T`):

```bash
docker compose --profile tools run --rm migrate npm run bootstrap:owner
```

CLI hỏi email và mật khẩu owner; ký tự mật khẩu không hiện ra. Nếu chạy tự động, có thể cấp `BOOTSTRAP_EMAIL` cùng `BOOTSTRAP_PASSWORD_FILE` trỏ tới tệp secret chỉ đọc bên trong container, nhưng phải cấu hình mount tệp riêng trước khi chạy. Không đặt mật khẩu owner trực tiếp trên dòng lệnh vì có thể lưu vào shell history/process list. Không bật self-registration. Sau khi tạo owner, đăng nhập và thử quyền `owner`, `operations`, `finance`, `viewer` trên cả API phía server.

## 6. Cấu hình và kiểm chứng payOS

1. Nhận credential và quyền cấu hình webhook từ kênh quản trị payOS được phê duyệt. Lưu credential vào `.env` trên VPS hoặc secret manager; không dán vào repo/chat/tài liệu.
2. Cập nhật container sau khi đổi `.env`:

   ```bash
   docker compose up -d --force-recreate web worker
   ```

3. Đăng ký webhook HTTPS:

   ```text
   https://<domain>/api/payos/webhook
   ```

4. Kiểm tra webhook bằng cơ chế chính thức của payOS và một giao dịch kiểm thử được cho phép. Ứng dụng phải xác minh chữ ký/checksum, `orderCode`, payment link, số tiền và trạng thái ở server.
5. Xác nhận webhook lặp không ghi nhận tiền/giao vé hai lần; webhook sai chữ ký hoặc sai số tiền bị từ chối/đưa vào review.
6. Kiểm tra trường hợp callback bị mất, thanh toán đến sau expiry, thanh toán thiếu/thừa/sai tham chiếu và worker restart.
7. Xác nhận trang return/cancel của trình duyệt chỉ hiển thị trạng thái; không được dùng return URL để kết luận đã nhận tiền.

Nếu chưa có đủ credential hoặc chưa hoàn thành kiểm chứng trên channel thật/test được cấp, hệ thống chỉ được xem là staging với dữ liệu giả.

## 7. Vận hành và quan sát

Các lệnh thường dùng:

```bash
docker compose ps
docker compose logs --since=30m web
docker compose logs --since=30m worker
docker compose logs --since=30m caddy
docker compose restart worker
```

Kiểm tra PostgreSQL không bị publish ra host:

```bash
docker compose port postgres 5432
```

Lệnh trên không được trả về địa chỉ/cổng host. Đồng thời kiểm tra firewall của VPS không cho phép truy cập 5432 từ Internet.

Cần cảnh báo ít nhất cho: container restart liên tục, webhook lỗi, reconcile lỗi, payment cần review, dung lượng đĩa/volume, backup thất bại, chứng chỉ TLS và hàng đợi worker. Log phải che PII, token, khóa payOS, session, QR/mã vé và chuỗi kết nối có mật khẩu.

## 8. Backup PostgreSQL

Volume giúp dữ liệu tồn tại qua restart nhưng **không phải backup**. Lưu bản sao mã hóa ở vị trí tách khỏi VPS/volume, có retention và kiểm soát truy cập. Ví dụ tạo bản dump định dạng custom:

```bash
sudo install -d -m 700 /srv/ticketops/backups
cd /srv/ticketops
umask 077
docker compose exec -T postgres \
  pg_dump -U ticketops -d ticketops --format=custom \
  > "backups/ticketops-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Kiểm tra lệnh thành công, file không rỗng và chuyển bản sao tới kho backup ngoài VPS. Không ghi `POSTGRES_PASSWORD` hay `DATABASE_URL` vào script backup/log. Thiết lập lịch chạy phù hợp với RPO và theo dõi việc backup thất bại.

Ngoài dữ liệu DB, lưu bản phát hành (`compose.yaml`, `Caddyfile`, image/tag hoặc commit chính xác) và cấu hình secret trong secret manager. Caddy có thể cấp lại chứng chỉ, nhưng vẫn cần bảo vệ quyền truy cập domain/DNS.

## 9. Diễn tập restore bắt buộc

Thực hiện định kỳ và trước go-live trên bản dump mới. Trước tiên restore vào database kiểm tra tách biệt, không ghi đè production:

```bash
cd /srv/ticketops
docker compose exec postgres createdb -U ticketops ticketops_restore_check
docker compose exec -T postgres \
  pg_restore -U ticketops -d ticketops_restore_check --exit-on-error \
  < backups/<approved-backup>.dump
docker compose exec postgres \
  psql -U ticketops -d ticketops_restore_check -c '\dt'
docker compose exec postgres dropdb -U ticketops ticketops_restore_check
```

Ngoài việc thấy bảng, phải chạy kiểm tra toàn vẹn/số lượng bản ghi do ứng dụng quy định và một smoke test bằng môi trường cô lập. Ghi lại thời gian restore thực tế để đối chiếu RTO.

Khôi phục production là thao tác phá hủy và cần change approval. Quy trình tối thiểu:

1. Dừng `web` và `worker` để không phát sinh ghi mới.
2. Chụp backup khẩn cấp của DB hiện tại và xác nhận file đọc được.
3. Xác nhận đúng file backup, thời điểm và phạm vi mất dữ liệu được chấp thuận.
4. Drop/recreate database rồi `pg_restore --exit-on-error` dưới sự giám sát của người chịu trách nhiệm.
5. Chạy `npm run db:migrate` để đưa schema về phiên bản ứng dụng tương ứng.
6. Kiểm tra dữ liệu, khởi động lại dịch vụ, theo dõi payment/webhook/reconcile và lập biên bản.

Không thực hiện restore production lần đầu trong sự cố; go-live chỉ sau khi đã diễn tập thành công.

## 10. Cập nhật và rollback

Trước mỗi lần cập nhật:

- Có backup DB mới và bản restore đã được kiểm chứng theo lịch.
- Đọc migration, đánh giá khả năng tương thích ngược và phương án rollback dữ liệu.
- Ghi lại commit/image đang chạy; không chỉ dùng tag thay đổi được mà không có tham chiếu phiên bản.

Quy trình cập nhật cơ bản:

```bash
docker compose build web worker
docker compose --profile tools run --rm migrate
docker compose up -d web worker caddy
docker compose ps
```

Nếu migration lỗi, không khởi động bản ứng dụng mới. Rollback image không tự đảo migration; chỉ restore DB khi phương án migration yêu cầu và đã có phê duyệt. Sau cập nhật, chạy smoke test đăng nhập, phân quyền, tạo/giữ đơn bằng dữ liệu kiểm thử, webhook/reconcile và luồng giao không nhạy cảm.

## 11. Checklist go-live

Chỉ đánh dấu sẵn sàng khi tất cả mục sau có bằng chứng:

- [ ] DNS, TLS, firewall và quyền sở hữu domain đã được xác nhận.
- [ ] Không publish cổng 3000/5432; PostgreSQL nằm trong private network và volume bền vững.
- [ ] `.env` quyền hạn chế, không có secret thật trong Git/image/docs/log; các khóa đã được luân chuyển nếu từng lộ.
- [ ] Build standalone, migration DB trống, restart và kiểm thử tự động đều đạt.
- [ ] Owner bootstrap và phân quyền server-side đã kiểm thử.
- [ ] Credential payOS thật/test hợp lệ được cấu hình qua secret; webhook HTTPS đã đăng ký và xác minh.
- [ ] Đã thử giao dịch được phép cho exact/sai/thiếu/thừa/late/lặp; return URL không xác nhận tiền.
- [ ] Worker lock, expiry/reconcile, restart và cảnh báo lỗi đã kiểm thử.
- [ ] Backup tự động có bản sao ngoài VPS; restore drill thành công và đạt RPO/RTO.
- [ ] Chính sách chuyển nhượng, bằng chứng giao, refund/chargeback và người xử lý review đã được phê duyệt.
- [ ] Không lưu mật khẩu/OTP tài khoản nguồn, không công khai QR/mã vé hoặc artifact nhạy cảm.

Thiếu bất kỳ mục payOS/backup-restore/chính sách quan trọng nào thì chưa được đưa khách hàng dùng với tiền hoặc vé thật.
