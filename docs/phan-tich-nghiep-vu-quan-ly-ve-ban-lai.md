# Phân tích nghiệp vụ quản lý vé bán lại (góc nhìn đơn vị kinh doanh vé)

**Phiên bản:** 0.1 — đề xuất BA, 23/10/2026  
**Phạm vi khảo sát:** mã nguồn và README của `frontend/`, đối chiếu một số chính sách sàn công khai; **chưa phỏng vấn người vận hành, khách mua, kế toán hoặc đơn vị phát hành**.  
**Trạng thái:** chưa phê duyệt; các mục ghi **[Đề xuất]**, **[Giả định]** cần xác nhận. Đây không phải tư vấn pháp lý và không đồng nghĩa phần mềm hiện tại đã có các chức năng TO-BE.

## 1. Kết luận điều hành

Ứng dụng hiện tại là **demo trong một trình duyệt**, có nhiều biện pháp bảo vệ nghiệp vụ đúng hướng (vé đơn vị, giữ chỗ, phân bổ sau thanh toán, giao vé, idempotency), nhưng giao diện và mô hình chưa tập trung vào công việc quan trọng nhất của người bán lại: **biết vé nào thật sự có thể bán, bán cho ai, đã thu đủ chưa, đã giao được chưa, lãi/lỗ và tiền nào cần xử lý**. Tài liệu đề xuất 4 luồng chính dễ hiểu:

1. **Nhập nguồn vé → xác thực khả năng chuyển/giao → đưa lên bán.**
2. **Giữ vé → chốt đơn → xác nhận thu tiền → giao đúng vé → đóng đơn.**
3. **Một hàng đợi “Cần xử lý”** cho thiếu nguồn giao, tiền lệch, chuyển vé lỗi, sự kiện thay đổi và hoàn tiền.
4. **Đối soát tiền và lãi theo sự kiện/đơn/vé**, tách tiền đã nhận, nghĩa vụ với khách và lãi đã thực hiện.

**Quyết định khuyến nghị:** MVP ưu tiên quản lý tồn vé sở hữu và bán trực tiếp, có chứng từ/điều kiện chuyển nhượng theo từng sự kiện. Chưa xây marketplace đa người bán, bot mua vé, chia sẻ mật khẩu tài khoản, đa kênh tự động hay tự giao vé khi chưa có tích hợp được phép. Giữ các bất biến bảo vệ đã có; **giảm thao tác trên giao diện, không bỏ kiểm soát phía domain**.

## 2. Phương pháp, bằng chứng và giới hạn

- **[Đã thấy trong mã]** README mô tả đây là demo React/TypeScript, dữ liệu `localStorage`, vai trò và QR giả; không tích hợp sàn, ngân hàng hoặc gửi email (`frontend/README.md:1-5`, `frontend/README.md:93-105`). Đường dẫn tổng quan, tài khoản, sự kiện, nhập, kho, đơn, thanh toán và cài đặt ở `frontend/README.md:35-42`. Các chức năng bên dưới được đọc từ mã/test; **không chạy ứng dụng hay test trong đợt phân tích này**.
- **[Tham chiếu thị trường, không mặc định áp dụng tại Việt Nam]** Ticketmaster cho biết người tổ chức có quyền quyết định điều kiện bán lại/chuyển vé; một số vé không đủ điều kiện bán lại, và chuyển vé có thể bị hạn chế [TM1], [TM2]. Khi người nhận chấp nhận chuyển, mã cũ không còn hiệu lực trong quy trình tương ứng [TM3]. Một số chương trình giới hạn giá bán lại và chi trả sau sự kiện [TM4], [TM5]. Đây là ví dụ để thiết kế kiểm soát, **không áp đặt chính sách Ticketmaster cho sàn khác**.
- **[Góc nhìn pháp lý cần xác nhận]** Một bài báo phỏng vấn luật sư về bóng đá ở Việt Nam cho rằng bán lại giá cao không tự động là hành vi bị xử phạt, nhưng hành vi đi kèm có thể phát sinh trách nhiệm [VN1]. Đây là ý kiến báo chí trong một bối cảnh cụ thể, **không phải kết luận cho mọi loại vé/sàn**. Trước triển khai thật phải rà soát điều khoản phát hành, điều kiện chuyển nhượng, thuế, thương mại điện tử, bảo vệ dữ liệu cá nhân và quy định địa phương cùng tư vấn phù hợp.
- **Chưa biết:** mô hình sở hữu hay ký gửi, quy mô vé, sàn thực dùng, kênh bán, loại vé định danh, bằng chứng thanh toán thực, quy trình đổi/hoàn. Không gán các giả định này thành sự thật.

## 3. Người dùng, mục tiêu và phạm vi

| Vai trò | Mục tiêu hằng ngày | Quyền/kiểm soát mong muốn [Đề xuất] |
|---|---|---|
| Chủ đơn vị | Biết hàng có thể bán, lợi nhuận, rủi ro, xử lý ngoại lệ lớn | Duyệt chính sách, giá sàn/trần nội bộ, hoàn tiền và xem audit |
| Nhân viên nguồn hàng/kho | Nhập, xác minh, gắn phương thức giao, sửa chứng từ | Không tự xác nhận khách đã trả tiền |
| Nhân viên bán hàng | Báo giá, giữ vé, chốt thông tin khách, hỗ trợ sau bán | Chỉ bán vé đủ điều kiện, không tự chuyển vé đã bán sang đơn khác |
| Kế toán | Đối soát giao dịch, chi phí, hoàn tiền, công nợ | Không sửa mã vé/nguồn giao |
| Khách mua | Thấy mô tả vé/giá/điều kiện giao rõ ràng; nhận đúng vé | Chỉ thấy dữ liệu của chính đơn mình sau xác thực |
| Nền tảng/ban tổ chức | Là chủ thể đặt điều kiện vé | Là nguồn chính sách, không phải tác nhân tự động có sẵn trong demo |

**Trong MVP:** vé do đơn vị sở hữu, bán 1 vé hoặc nhiều vé trong 1 đơn; GA và ghế chỉ định; nhận thanh toán, giao đúng vé; xử lý ngoại lệ. **Chỉ khi được xác nhận:** ký gửi bên thứ ba, đặt cọc, thu nhiều đợt, payout từ sàn, bán đồng thời nhiều kênh, đổi vé, đa tiền tệ, chia sẻ tài khoản nguồn. Account nguồn **không được đồng nhất với quyền chuyển giao hợp pháp**; không xây luồng tiết lộ mật khẩu/OTP.

### Thuật ngữ tối thiểu

| Thuật ngữ | Nghĩa |
|---|---|
| Vé/đơn vị tồn | Một quyền tham dự cụ thể hoặc một đơn vị GA có định danh nội bộ, nguồn gốc và giá vốn |
| Lần nhập nguồn | Lô mua/nhận vé có đối tác, tham chiếu, chứng từ và chi phí |
| Điều kiện giao | Artifact cá nhân hoặc khả năng chuyển qua kênh chính thức được xác minh; không phải chỉ là việc có chuỗi QR |
| Tin đăng/kênh bán | Cách một vé xuất hiện trên một kênh; **khác** với quyền sở hữu và khả dụng của vé |
| Giữ vé | Khóa tạm có hạn; không phải bán thành công |
| Đơn bán | Thỏa thuận giá đã chốt cho khách; trạng thái thanh toán và giao hàng là hai chiều độc lập |
| Đối soát | Gắn giao dịch tiền/hoàn tiền/chi phí với đơn, phân biệt thu tiền và doanh thu/lãi |

## 4. AS-IS — luồng hiện có

```text
Vận hành nhập account + vé (tay/Excel)
 → vé pending/available → quản lý kho → công khai sự kiện
 → cửa hàng/nhân viên tạo đơn + hold
 → kế toán ghi giao dịch DEMO → khớp đúng/đủ/trong hạn mới phân bổ
 → artifact giao ngay hoặc transfer chờ mô phỏng, lỗi vào hàng đợi
 → khách xem link theo dõi; dashboard tổng hợp
```

| Chặng | Hiện trạng từ mã | Điểm cần làm rõ / ma sát |
|---|---|---|
| Nguồn vé | Mỗi vé có account/lần mua/sự kiện/suất/hạng/mã hoặc khóa nguồn/ghế/vốn/giá và một trong `pending, available, held, allocated, blocked` (`frontend/src/domain/models.ts:12-18`). Nhập tay/Excel kiểm tra trùng, nhập lặp giống hệt thì bỏ qua, xung đột chặn cả batch (`frontend/src/domain/inventory.ts:153-263`; `frontend/README.md:58-67`). | Cần chuẩn hóa *vé mua nhưng chưa giao được* khác với *vé sẵn sàng bán*; chứng từ và quyền chuyển chưa được xác minh ngoài đời. |
| Bán | Catalog công khai chỉ vé `available` thuộc sự kiện đã phát hành, trừ vé giao bằng account (`frontend/src/domain/orders.ts:128-141`). Tạo đơn kiểm tra vé khả dụng, giữ toàn bộ hoặc không giữ; bundle account phải gồm mọi vé của account qua mọi sự kiện (`frontend/src/domain/orders.ts:17-82`). | Luồng bundle chéo nhiều sự kiện là ngoại lệ khó hiểu: chỉ bật sau khi có nhu cầu thực và quyền chuyển giao được xác nhận. Chưa có thực thể tin đăng đa kênh. |
| Tiền | Một giao dịch DEMO **đầu tiên** đúng số tiền, đúng tham chiếu, tới khi hold còn hiệu lực mới tự chấp nhận; thiếu/thừa/đến muộn/đã thu trước vào `review`, không tự cộng dồn (`frontend/src/domain/payments.ts:26-78`). | Chưa có quy trình quyết định tiền lệch đi đâu, ai duyệt, hoàn vào đâu, cách đóng case. Không phải thanh toán ngân hàng thật (`frontend/README.md:69-75`). |
| Giao | Sau phân bổ tạo một bản ghi giao/vé, khóa theo đơn + vé; artifact/account có dữ liệu thì giao demo ngay, transfer là chờ, chưa rõ phương thức là lỗi; retry không tạo thêm bản ghi (`frontend/src/domain/delivery.ts:11-115`). | Có command `setArtifact` để bổ sung dữ liệu, nhưng kho chỉ có drawer xem (`frontend/src/domain/models.ts:43-55`; `frontend/src/features/inventory/InventoryPage.tsx:122-141`). **[Suy ra từ tìm kiếm giao diện]** nhân viên chưa có luồng sửa thiếu artifact rõ ràng. |
| Vòng đời | Đơn `active/expired/cancelled`, payment `unpaid/paid/review`, delivery `pending/processing/delivered/error` (`frontend/src/domain/models.ts:3-27`). Hủy đơn đã trả tiền bị từ chối (`frontend/src/domain/orders.ts:85-104`). | Chưa có hậu bán: sự kiện hủy/dời, giao lỗi sau thanh toán, yêu cầu hoàn, đổi đơn và đóng đối soát. |
| Hạ tầng | Snapshot per-workspace trong localStorage, command tuần tự **trong một runtime**, hết hạn reconcile khi có truy cập (`frontend/README.md:93-105`). | Không có khóa đa tab/thiết bị, auth thực, tác vụ nền, bảo mật artifact. Không dùng dữ liệu vé/khách thật (`frontend/README.md:5`, `frontend/README.md:115-117`). |

**Các bất nhất cần sửa trước khi giản lược giao diện:** (a) lô seed có vé artifact `available` nhưng thiếu artifact, trong khi nhập thông thường đưa sang `pending` (`frontend/src/domain/seed.ts:79-85`; `frontend/src/domain/inventory.ts:251-260`); (b) thao tác bundle trên UI có thể xuất hiện trước khi thỏa điều kiện artifact, service mới chặn (`frontend/src/features/orders/OrdersPage.tsx:49-53`; `frontend/src/domain/orders.ts:34-47`); (c) giá hạng vé hiển thị, giá từng vé và giá chốt đơn là ba giá khác nhau; sửa hạng không sửa giá vé đã nhập (`frontend/src/domain/workspace.ts:18-23`; `frontend/src/domain/orders.ts:65-72`); (d) giới hạn chọn 20 vé ở cửa hàng chỉ nằm tại UI (`frontend/src/features/storefront/ShopEventPage.tsx:46`; `frontend/src/domain/orders.ts:17-23`). Chưa có phỏng vấn nên **không kết luận** các lựa chọn đó là sai về kinh doanh; đây là rủi ro hiểu nhầm/rào chắn thiếu nhất quán.

## 5. TO-BE — quy trình vận hành tối giản

### 5.1 Ba câu hỏi ở mọi thời điểm

- **Bán được không?** Có nguồn hợp lệ, chính sách cho chuyển/bán, phương thức giao xác thực, chưa bị giữ/bán/chặn, còn trước thời điểm giao an toàn.
- **Đơn cần làm gì tiếp?** Chưa thu, tiền lệch, chờ chuyển, giao lỗi, sự kiện thay đổi, yêu cầu hoàn — mỗi case có người phụ trách/hạn xử lý, một hành động tiếp theo.
- **Tiền đang ở đâu?** Số đã nhận, chưa phân bổ, phải hoàn, chi phí, doanh thu và lãi đã thực hiện được hiển thị tách biệt.

### 5.2 Swimlane chính

| Bước | Nguồn/kho | Bán hàng/khách | Kế toán | Hệ thống |
|---|---|---|---|---|
| 1. Nhập | Ghi nguồn mua, vé, vốn, bằng chứng, điều kiện chuyển/giao | — | Đối chiếu chi phí nguồn khi cần | Chống trùng; `chờ kiểm tra` nếu thiếu dữ liệu |
| 2. Mở bán | Xác nhận vé có thể giao qua cách được phép | Nhìn vé có thể bán và giá cuối cùng | — | Tính khả dụng từ quyền sở hữu + policy + trạng thái; khóa vé rủi ro |
| 3. Chốt | — | Tạo đơn, thông báo tổng giá, thời hạn, điều kiện giao; lấy thông tin người nhận tối thiểu | — | Giữ đúng vé trong một giao dịch nguyên tử; đóng băng giá và danh tính vé |
| 4. Thu | — | Khách trả theo hướng dẫn đã xác nhận | Đối soát tiền thực; xử lý lệch | Chỉ ghi nhận thanh toán từ nguồn tin cậy; không suy diễn từ ảnh/chữ khách gửi |
| 5. Giao | Xác nhận chuyển qua kênh hợp lệ; xử lý lỗi | Khách xác nhận đã nhận nếu có | — | Chỉ giao đúng vé đã phân bổ; ghi bằng chứng giao, không gửi lặp mã |
| 6. Đóng | Kiểm tra vé không còn bán | Hỗ trợ sau bán | Đối soát chi phí/phí/hoàn và đóng đơn | Cập nhật audit, chỉ số, nhắc việc theo SLA **[chờ duyệt]** |

**Lối tắt nghiệp vụ:** nhân viên kho chỉ cần “Nhập vé” và “Sẵn sàng bán”; bán hàng “Giữ/Chốt đơn”; kế toán “Khớp tiền”; giao hàng “Chuyển/Đã giao”; mọi nhánh khác đẩy vào “Cần xử lý”. Không yêu cầu nhân viên học các trạng thái kỹ thuật như `allocated` hoặc `artifact` nếu không liên quan quyết định của họ.

### 5.3 Ngoại lệ và quyết định an toàn

| Tình huống | Xử lý mặc định [Đề xuất] | Không được làm |
|---|---|---|
| Vé không cho chuyển, vé định danh không đổi tên được, chưa biết policy | Chặn mở bán, gắn lý do và người xác minh; kiểm tra nguồn/chính sách theo từng event/tier | Không phát hành QR/đổi tên trái điều khoản hoặc đảm bảo khách vào cửa khi chưa rõ |
| Thiếu artifact/transfer chưa bật | `chờ chuẩn bị`, không công khai; nếu phát hiện sau khi thu thì khóa vé cho đơn, mở case ưu tiên | Không giao artifact của vé khác, không hủy và bán lại vì giao lỗi |
| Hai nhân viên/2 kênh cùng bán một vé | Một giao dịch giành quyền giữ; kênh còn lại nhận hết hàng/đồng bộ gỡ tin | Không để cùng vé vào 2 đơn đã chốt |
| Khách trả thiếu/thừa/sai tham chiếu/đến muộn | Ghi ledger riêng, gắn chứng từ, tạo case; kế toán quyết định phân bổ/hoàn theo quyền và bằng chứng | Không tự giao; không tự tái giữ vé đã được bán cho khách khác |
| Khách yêu cầu hủy trước khi thanh toán | Nhả hold theo điều kiện; thông báo thời hạn và chi phí nếu có | Không gọi “hoàn tiền” khi chưa hề nhận tiền |
| Khách yêu cầu hủy sau thanh toán; transfer thất bại | Mở case hậu bán, xác minh trách nhiệm/chính sách, quyết định giao thay thế *nếu được phép* hoặc hoàn | Không giải phóng vé/bán lại cho đến khi đã vô hiệu quyền khách cũ và hoàn tất đối soát |
| Sự kiện dời/hủy; barcode thay đổi | Cập nhật chính sách, đóng băng hàng ảnh hưởng, liên hệ khách, đối chiếu quyền hoàn từ nguồn | Không mặc định sự kiện dời = hủy hoặc tự hoàn tiền không kiểm chứng |
| Vé giao theo account nguồn | Xác nhận rõ tài khoản có thể chuyển hợp lệ; nếu không, không mở bán theo cách này | Không dùng chung mật khẩu/OTP giữa nhiều khách hoặc coi bàn giao account là giao quyền vào cửa được đảm bảo |

## 6. Đặc tả quy tắc nghiệp vụ và trạng thái

### 6.1 Bất biến (business rules)

| Mã | Quy tắc TO-BE | Mức |
|---|---|---|
| BR-01 | Mỗi vé có `workspaceId`, nguồn mua, sự kiện/suất/hạng, mã nguồn hoặc định danh duy nhất; ghế chỉ định có khu/hàng/số; GA có ID đơn vị riêng. Nhập lặp y hệt không nhân đôi; dữ liệu trùng nhưng khác nội dung cần xử lý xung đột. | MVP; kế thừa logic hiện có |
| BR-02 | `có thể bán` = nguồn đã xác minh **và** policy cho phép **và** có cách giao hợp lệ **và** không bị chặn/giữ/bán/hoàn/đang tranh chấp. Điều kiện phải do domain kiểm tra tại lúc mở bán **và** lúc giữ. | MVP; thêm policy/check nguồn |
| BR-03 | Một vé tại một thời điểm có tối đa một hold hiệu lực hoặc một đơn sở hữu quyền giao. Tạo hold nhiều vé phải nguyên tử; hết hạn kiểm tra phía server. | MVP; demo mới bảo đảm trong một runtime |
| BR-04 | Giá hạng là **giá gợi ý mặc định** [Đề xuất], giá từng vé là giá chào; giá dòng đơn là giá chốt bất biến. Đổi giá không hồi tố đơn đã tạo. Đơn vị tiền, phí, giảm giá phải tách trường và hiển thị tổng khách trả. | MVP; cần xác nhận định nghĩa giá |
| BR-05 | Không công nhận tiền từ thao tác người dùng/ảnh chuyển khoản; chỉ ledger từ nguồn xác thực hoặc xác nhận thủ công có chứng từ và quyền phê duyệt. Giao dịch có ID riêng; xử lý lặp không tạo thu trùng. | MVP thật; demo vẫn giả lập |
| BR-06 | Tiền thiếu/thừa/sai/đến muộn vào hàng chờ; quyết định hoàn hoặc gán lại phải có tác nhân, lý do và audit; một giao dịch không được dùng cho hai đơn. | MVP |
| BR-07 | Vé chỉ giao sau khi đơn đủ điều kiện thanh toán; bằng chứng giao phải theo từng vé và người nhận; retry cùng yêu cầu không sinh giao trùng. Với official transfer phải có bằng chứng chấp nhận/chuyển thành công, không chỉ nhấn nút “đã chuyển”. | MVP |
| BR-08 | Đơn đã trả tiền không tự `cancel` như đơn chưa trả; mở yêu cầu hoàn riêng, giữ dấu vết tiền vào/ra và quyền của khách cho tới khi kết thúc. | MVP |
| BR-09 | Tin đăng đa kênh **không** là tồn kho độc lập; phải có cơ chế giữ tồn đồng bộ, xác nhận/gỡ đăng sau bán. Nếu không có API/chấp thuận đồng bộ đủ tin cậy thì không mở tự động đa kênh. | Sau MVP |
| BR-10 | Chính sách resale/giới hạn giá, vé định danh, thời điểm transfer, ngày hết hạn, đơn vị phát hành được lưu theo sự kiện/loại vé/nguồn và kiểm tra trước mở bán; thay đổi policy thì khóa hàng bị ảnh hưởng và mở case. | MVP cơ bản; tự cập nhật sau |
| BR-11 | Public API chỉ trả giá, mô tả, điều kiện giao và trạng thái đúng đơn; mã vé/tệp/giá vốn/chứng từ nguồn/PII chỉ trả khi đã xác thực quyền; link ngẫu nhiên **không đủ** làm bảo vệ production. | MVP thật |
| BR-12 | Phần mềm không tự khẳng định lợi nhuận từ số dư đã thu: chỉ số lãi đã thực hiện cần doanh thu đủ điều kiện ghi nhận trừ giá vốn vé đã bán, phí, hoàn/chargeback; các khoản chưa xử lý tách riêng. | MVP báo cáo |

**Tách trạng thái:** không nên gộp vé, đơn, thanh toán và giao thành một cột `status` vì sẽ mất các tổ hợp hợp lệ (ví dụ **đã thu tiền + chưa giao**). Trạng thái lưu trong hệ thống có thể khác nhãn hiển thị, nhưng chuyển trạng thái phải được quy định.

| Đối tượng | Các trạng thái nghiệp vụ [Đề xuất] | Chuyển trạng thái hợp lệ quan trọng |
|---|---|---|
| Vé | chờ xác minh → sẵn bán ↔ tạm chặn; sẵn bán → đang giữ → đã phân bổ → đã giao/đang xử lý hậu bán | Hết hold chưa thu: đang giữ → sẵn bán **nếu** còn đủ điều kiện; đã phân bổ không quay về sẵn bán chỉ vì giao lỗi |
| Đơn | đang giữ → chờ thu → đã xác nhận thu → hoàn tất; đang giữ/chờ thu → hết hạn/hủy; đã thu → đang xử lý hậu bán → hoàn/đóng | “Hoàn tất” cần đủ giao, đối soát, không còn case mở; không dùng hủy trực tiếp với đơn đã thu |
| Thanh toán | chưa nhận → chờ đối soát → khớp đủ; lệch → chờ xử lý → phân bổ/hoàn; hoàn đề nghị → hoàn được duyệt → tiền hoàn thực đi | Một ledger event có kết quả xử lý, không sửa đè số tiền lịch sử |
| Giao vé | chưa sẵn sàng → đang chuyển → đã xác nhận/ lỗi; lỗi → đang xử lý → đã xác nhận/hoàn | Nguồn chứng cứ quyết định “đã xác nhận”; không lấy việc gửi email làm bằng chứng chắc chắn khách vào cửa |
| Case | mới → có người xử lý → chờ bên ngoài → giải quyết → đóng | Phải có loại, ưu tiên, người phụ trách, deadline và quyết định cuối |

**Giữ nguyên ranh giới demo:** các trạng thái `chờ xác minh`, `hoàn` và `case` là **thiết kế mới**, không khẳng định đang tồn tại trong `frontend/src/domain/models.ts:1-33`. Trong triển khai thật dùng giao dịch DB với unique constraints / row locks và idempotency keys server-side; không dựa vào việc refresh trang, localStorage hoặc thứ tự thao tác ở UI (`frontend/README.md:93-105`).

## 7. Mô hình dữ liệu và ranh giới hệ thống TO-BE

| Thực thể (chủ sở hữu dữ liệu) | Trường bắt buộc để ra quyết định | Quan hệ / lưu ý |
|---|---|---|
| `SourceAcquisition` (nguồn) | bên mua/nguồn, tham chiếu, ngày, loại sở hữu, chứng từ, tổng chi phí | 1 nguồn → nhiều vé; chi phí chung phân bổ theo quy tắc kế toán đã duyệt |
| `TicketUnit` (kho) | event/session/tier, GA ID hoặc seat, nguồn, policy version, face value/giá vốn/giá chào, điều kiện giao, state | 1 vé → tối đa 1 quyền sở hữu đơn hiệu lực; không lưu mã gốc ở public DTO |
| `EventPolicy` (kiểm soát) | organizer, loại vé, được bán/chuyển?, giá trần nếu có, khi nào chuyển, quy định đổi tên, link & ngày kiểm chứng | Version hóa; thay đổi policy có thể ảnh hưởng vé đang đăng |
| `Listing` (chỉ khi đa kênh) | ticket IDs, kênh, giá hiển thị, trạng thái đồng bộ, external ID | Không nhân tồn; lỗi đồng bộ tạo case, cần cơ chế chống race |
| `Reservation` + `SalesOrder` | ticket IDs, thời hạn, giá chốt, khách, kênh, điều kiện giao đã công bố | 1 đơn nhiều dòng, một vé chỉ xuất hiện trong tối đa một reservation/đơn hiệu lực |
| `PaymentLedger` | ID giao dịch duy nhất, nguồn, số tiền, thời gian, chứng từ, phân bổ đơn, outcome | Append-only; hoàn tiền là bút toán đối ứng, không xóa thu gốc |
| `Delivery` | đơn + vé, cách giao, người nhận, bằng chứng gửi/chấp nhận, nỗ lực, idempotency key | 1 nghĩa vụ giao cho mỗi cặp đơn–vé; lịch sử retry riêng |
| `Case` + `Audit` | loại lỗi, chủ xử lý, thời hạn, quyết định, dấu vết thay đổi | Audit không lưu OTP/mã QR thuần hoặc dữ liệu nhạy cảm |

**Nguồn dữ liệu chuẩn:** domain/DB là chủ sở hữu vé và đơn; kết quả chuyển chính thức từ nền tảng (nếu có tích hợp hợp lệ) là chứng cứ giao; nguồn tiền xác thực/đối soát kế toán là chứng cứ thu; chính sách gốc từ nhà phát hành là căn cứ eligibility. Giao diện chỉ phản ánh, không tự thay trạng thái dựa trên suy đoán. **[Giả định]** tiền tệ VND, hiển thị số nguyên đồng; xác nhận nếu bán nhiều tiền tệ.

### Mẫu đối soát minh họa, chưa phải chính sách ghi nhận kế toán

Một vé: giá vốn 800.000đ, giá chốt 1.000.000đ, phí kênh 50.000đ. Nếu thu đủ, giao thành công, không hoàn: **biên đóng góp sơ bộ** = 1.000.000 − 800.000 − 50.000 = 150.000đ (chưa gồm thuế, phí thanh toán, chi phí vận hành). Nếu khách đã nộp 1.000.000đ nhưng vé chưa giao/đang tranh chấp: báo **tiền đã nhận 1.000.000đ, nghĩa vụ chưa giải quyết**, **không** đưa 150.000đ vào chỉ số “lãi đã thực hiện”. Nếu hoàn 1.000.000đ thì ghi bút toán hoàn và chi phí/phạt tương ứng, không xóa giao dịch nhận ban đầu.

## 8. Giao diện và mức độ ưu tiên

### 8.1 Đề xuất cấu trúc điều hướng

**Hôm nay** (3 nhóm việc: đơn cần thu, vé cần giao, ngoại lệ cần quyết định) → **Kho vé** (2 tab `Sẵn bán`/`Cần chuẩn bị`) → **Bán hàng** (chọn vé, báo giá, giữ đơn) → **Đơn hàng** (theo hành trình của một đơn) → **Tiền & đối soát** → **Cấu hình nguồn & chính sách**. Nhân viên chọn vai trò chỉ thấy thao tác liên quan; quyền vẫn kiểm ở service/server. Các cột nâng cao như source key, account, phương thức artifact, retry count đặt trong chi tiết/khu vực kỹ thuật. Mỗi thẻ ngoại lệ có một CTA cụ thể: “Bổ sung chứng từ”, “Xác minh tiền”, “Chuyển vé”, “Xem yêu cầu hoàn”.

### 8.2 Backlog có thể giao cho sản phẩm/kỹ thuật

| ID | Hạng mục / kết quả đo được | Ưu tiên | Phụ thuộc & kiểm chứng |
|---|---|---|---|
| P0-01 | Phỏng vấn 1–2 người vận hành, bán, kế toán; đi qua 3 đơn thật đã ẩn danh (thuận lợi, thiếu tiền, giao lỗi) | Trước code | Xác nhận phạm vi, vocab, nguồn chứng cứ; **số người là gợi ý, chưa phê duyệt** |
| P0-02 | Chuẩn hóa eligibility & giá (BR-02/04/10); ẩn hành động không hợp lệ kèm lý do; bật UI bổ sung artifact an toàn | MVP | Quy tắc ở domain; test seed, import và hồ sơ vé thiếu dữ liệu |
| P0-03 | Hàng đợi case cho tiền lệch/giao lỗi/sự kiện đổi; phân người, audit, đóng case có lý do | MVP | BR-06/07/08, tiêu chí AC-06/07/08 |
| P0-04 | Quy trình hoàn/hậu bán riêng cho đơn đã trả; ledger thu/hoàn và đối soát | MVP | Kế toán/pháp lý xác nhận; AC-08 |
| P0-05 | Chuyển khỏi demo: backend, auth, phân quyền, multi-tenant, transaction giữ tồn và webhook tiền đã xác thực | Điều kiện **bắt buộc** trước vận hành thật | Kiểm thử đa thiết bị, idempotency, bảo mật; không thay bằng localStorage |
| P1-01 | Làm lại dashboard tác vụ, nhãn nghiệp vụ và wizard nhập nguồn→kiểm tra→sẵn bán | MVP UX | Chạy thử theo nhiệm vụ với người dùng; đo thời gian hoàn thành |
| P1-02 | Báo cáo vốn/tiền/phí/biên đóng góp và khoản đang tranh chấp, export đối soát | Sau khi mô hình tài chính được duyệt | AC-10, đối chiếu số với ledger |
| P2-01 | Đồng bộ đăng bán đa kênh và official transfer API (nếu được phép) | Sau MVP | Hợp đồng/API, SLA, chống bán trùng, monitor đồng bộ |
| P2-02 | Ký gửi, cọc/top-up, gói account đa sự kiện, dynamic pricing | Chỉ nếu phỏng vấn chứng minh nhu cầu | Tài liệu quy tắc riêng, rủi ro pháp lý và edge cases |

**Không hứa thời gian triển khai** khi chưa biết đội ngũ, backlog, phạm vi pháp lý/tích hợp. Có thể chia ra: (A) chốt nghiệp vụ + UX prototype bằng dữ liệu giả; (B) sửa demo để thử luồng; (C) xây nền tảng production sau khi có bằng chứng nguồn tiền/quyền giao và kiểm soát bảo mật.

### 8.3 NFR và số đo để nghiệm thu [Đề xuất]

- **Bảo mật/riêng tư:** vé mã gốc và chứng từ chỉ tại server mã hóa/bảo vệ quyền; log che dữ liệu nhạy cảm; khách xác thực khi xem giao; chính sách lưu/xóa dữ liệu cá nhân cần xác nhận. Không nhập dữ liệu thật vào demo hiện tại.
- **Tin cậy:** giữ/bán/cập nhật tồn là atomic trên DB; retry payment/delivery idempotent; tác vụ quá hạn chạy nền; có giám sát, sao lưu/phục hồi được kiểm thử.
- **Kiểm toán:** lưu tác nhân, thời điểm, trước/sau, căn cứ của thay đổi giá, quyền bán, hoàn tiền, xử lý đối soát; audit bất biến theo chính sách lưu giữ được duyệt.
- **KPI nên theo dõi:** tỷ lệ bán trùng = số vé bị xác nhận cho >1 đơn / tổng vé đã chốt; tỷ lệ giao đúng hạn = đơn đã giao trong hạn đã hứa / đơn đủ điều kiện giao; tỷ lệ tiền cần xử lý = giao dịch review chưa đóng / tổng giao dịch nhận; tồn rủi ro = vé đang mở bán nhưng thiếu bằng chứng đủ điều kiện / tổng vé đang mở bán; biên đóng góp **đã hoàn tất** = tổng giá chốt − vốn vé − phí kênh − hoàn/chargeback trên các đơn đủ điều kiện ghi nhận. Ngưỡng và thời hạn SLA **chờ phê duyệt**; thời điểm ghi nhận doanh thu phải do kế toán quyết định.

## 9. Tiêu chí nghiệm thu dạng Given / When / Then

| AC | Tình huống / kết quả bắt buộc | Quy tắc |
|---|---|---|
| AC-01 | **Given** một vé trùng khóa nguồn nhưng khác giá/mã, **When** nhập lại, **Then** không ghi đè hoặc nhân tồn và tạo xung đột có thể giải quyết. | BR-01 |
| AC-02 | **Given** vé chưa rõ quyền chuyển hoặc thiếu cách giao, **When** mở bán/checkout, **Then** hệ thống chặn và nêu điều kiện thiếu; public catalog không hiển thị vé. | BR-02/10 |
| AC-03 | **Given** hai phiên cùng giữ một vé cuối, **When** cùng xác nhận, **Then** đúng một phiên nhận hold; phiên còn lại biết không còn vé. | BR-03 |
| AC-04 | **Given** giá vé đã đổi sau lúc tạo đơn, **When** xem lại đơn, **Then** giá và tổng tiền của đơn không thay đổi; giá mới chỉ áp dụng cho đơn tiếp theo. | BR-04 |
| AC-05 | **Given** ngân hàng gửi lặp cùng ID và payload, **When** nhận hai lần, **Then** chỉ một bút toán/không phân bổ thêm vé; cùng ID khác payload thì cảnh báo xung đột. | BR-05 |
| AC-06 | **Given** 800.000đ cho đơn 1.000.000đ hoặc tiền tới sau hạn, **When** đối soát, **Then** tạo case và ghi tiền nhận; không giao, không chiếm lại vé đã nhả. | BR-06 |
| AC-07 | **Given** đơn đã thanh toán nhưng transfer thất bại, **When** retry, **Then** vẫn cùng vé/đơn/người nhận, có lịch sử và case, không tạo nghĩa vụ giao thứ hai. | BR-07 |
| AC-08 | **Given** đơn đã thu tiền và khách yêu cầu hoàn, **When** có phê duyệt và thực chuyển tiền hoàn, **Then** lưu cả thu lẫn hoàn, kết luận quyền của vé rồi mới xét có thể mở bán lại; không xóa đơn cũ. | BR-08/12 |
| AC-09 | **Given** khách mở URL đơn của người khác hoặc chưa xác thực, **When** truy cập vé, **Then** không thấy mã vé, giá vốn hay chứng từ nguồn; chỉ chủ đơn hợp lệ được nhận đúng vé. | BR-11 |
| AC-10 | **Given** đơn thu đủ nhưng chưa giao, **When** xem báo cáo, **Then** số tiền đã nhận tăng, nghĩa vụ chờ giao hiển thị, “lãi đã thực hiện” chưa tăng; sau giao/đóng theo policy kế toán mới ghi nhận. | BR-12 |
| AC-11 | **Given** admin ngừng cho transfer đối với một loại vé đang đăng, **When** policy cập nhật, **Then** vé ảnh hưởng không nhận hold mới; tin đăng/case được cập nhật và đơn đã thu được xử lý riêng. | BR-02/10 |
| AC-12 | **Given** vé thuộc account có vé sự kiện khác và muốn bán account nguyên gói, **When** ít nhất một vé đã giữ hoặc chưa có điều kiện giao, **Then** chặn toàn gói và nêu vé gây chặn. Tính năng này chỉ bật sau khi có xác nhận nhu cầu/policy. | BR-02/03 |

## 10. Câu hỏi cần quyết định trước khi phát triển

1. **[Cao]** Bán vé đơn vị đang sở hữu, ký gửi hay môi giới? Khách là B2C hay sỉ? Những kênh nào được phép? Ai chịu trách nhiệm nếu vé không vào được?
2. **[Cao]** Từng sàn/sự kiện có cho bán lại/chuyển vé/đổi tên không; giá giới hạn/transfer window/bằng chứng giao là gì? Người nào xác nhận policy, khi nào kiểm tra lại?
3. **[Cao]** Vé artifact thiếu trước khi mở bán có được chào hàng *có điều kiện* không, hay chặn tuyệt đối? Có chấp nhận rủi ro thu tiền trước khi vé sẵn sàng giao? Khuyến nghị MVP: chặn.
4. **[Cao]** Tiền thiếu/thừa/đến muộn: cho phép top-up hoặc hoàn? Hạn và quyền duyệt của ai? Khi nào được dùng vé thay thế, khi nào bắt buộc hoàn?
5. **[Cao]** Điều kiện hoàn khi khách hủy, giao lỗi, sự kiện dời/hủy; ai chịu phí/chargeback; kiểm soát vé gốc sau hoàn?
6. **[Cao]** Mã nguồn/GA nào là duy nhất; dữ liệu nguồn thật lấy từ đâu, có quyền lưu/cung cấp QR không; cách bảo quản và hủy chứng từ?
7. **[Trung bình]** Giá hạng vé là giá mặc định hay giá bán bắt buộc? Có hoa hồng/phí kênh/thuế/chiết khấu; theo chính sách kế toán nào ghi nhận doanh thu/lãi?
8. **[Trung bình]** Cần bán cả account đa sự kiện thật không? Nếu có, điều khoản cho phép chuyển giao quyền truy cập không? Nếu không, loại luồng này khỏi MVP.
9. **[Trung bình]** Số vé, số nhân viên/tab/thiết bị, SLA giao vé, thời gian hold, retention và nhu cầu xuất dữ liệu? Giới hạn số lượng cần thống nhất ở UI và domain.
10. **[Trung bình]** Ai cung cấp dữ liệu và quyền tích hợp ngân hàng/sàn chính thức; có môi trường sandbox và webhook tin cậy không?

**Đề nghị bước tiếp theo:** workshop ngắn với người vận hành, bán hàng, kế toán, pháp lý; đi qua ba tình huống thật đã ẩn danh. Chốt câu hỏi 1–6, ký nhận sơ đồ TO-BE/BR/AC, sau đó mới đưa backlog P0-02.. vào thiết kế kỹ thuật và thử nghiệm.

## 11. Nguồn tham khảo

Nguồn ngoài truy cập ngày **23/10/2026**; chính sách có thể thay đổi theo vùng, loại vé, sự kiện và thời điểm. Không suy rộng điều khoản bên thứ ba thành quy định áp dụng cho sản phẩm này.

- [TM1 — Ticketmaster, *How do I sell tickets?*](https://help.ticketmaster.com/hc/en-us/articles/9672915828881-How-do-I-sell-tickets): điều kiện đủ để đăng bán phụ thuộc vé/sự kiện; mẫu hành trình listing.
- [TM2 — Ticketmaster, *Why can't I transfer my tickets?*](https://help.ticketmaster.com/hc/en-us/articles/40903015045905-Why-can-t-I-transfer-my-tickets): người tổ chức quyết định khả năng và thời điểm transfer.
- [TM3 — Ticketmaster, *How does Ticket Transfer work?*](https://help.ticketmaster.com/hc/en-us/articles/9786975926673-How-does-Ticket-Transfer-work?language=en_US): người nhận chấp nhận chuyển, mã gốc của người gửi mất hiệu lực trong quy trình mô tả.
- [TM4 — Ticketmaster, *Face Value Exchange*](https://help.ticketmaster.com/hc/en-us/articles/9781464415249-How-does-Ticketmaster-s-Face-Value-Exchange-work): ví dụ ràng buộc giá cho **sự kiện đủ điều kiện**, không phải mọi vé.
- [TM5 — Ticketmaster, *How and when do I get paid?*](https://help.ticketmaster.com/hc/en-us/articles/9612708273425-How-and-when-do-I-get-paid-for-tickets-I-sell): ví dụ sàn giữ thanh toán người bán đến sau sự kiện theo điều kiện của họ; không dùng để hứa thời gian trả tiền của sản phẩm này.
- [VN1 — Dân trí, ý kiến luật sư về bán lại vé bóng đá, 25/08/2026](https://dantri.com.vn/ban-doc/mua-ve-bong-da-roi-ban-lai-gia-cho-den-bi-xu-ly-nhu-the-nao-20260825193824358.htm): bối cảnh tham khảo pháp lý Việt Nam, không thay thế rà soát quy định/điều khoản hiện hành.
- Nguồn nội bộ: `frontend/README.md` và `frontend/src/{domain,features,services}/` (tham chiếu từng mục ở trên). Báo cáo không xác nhận hành vi production từ mã demo.
