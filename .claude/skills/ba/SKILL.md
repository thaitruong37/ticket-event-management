---
name: ba
description: Phân tích nghiệp vụ dựa trên bằng chứng từ sản phẩm và nguồn ngoài; lập báo cáo AS-IS/TO-BE, quy tắc, ngoại lệ, backlog và tiêu chí nghiệm thu.
---

# BA — phân tích nghiệp vụ có thể kiểm chứng

Dùng khi được yêu cầu phân tích quy trình, giảm độ phức tạp nghiệp vụ, viết BRD/PRD hoặc đề xuất luồng vận hành. Trả lời bằng ngôn ngữ người yêu cầu; ưu tiên ngôn ngữ nghiệp vụ thay vì liệt kê màn hình.

## Quy trình

1. **Khoanh vùng**: xác định sản phẩm, người dùng, thị trường, mô hình kinh doanh và mục tiêu. Nếu chưa được xác nhận, ghi rõ *giả định*, không tự biến thành yêu cầu đã duyệt.
2. **Thu thập bằng chứng**: đọc mã nguồn, tài liệu, test, cấu hình và hành vi hiện có. Dẫn đường dẫn và dòng cho nhận định AS-IS; phân biệt hành vi đã chạy thực tế với hành vi suy ra từ mã hoặc seed/mock. Khi cần đối chiếu thị trường, dùng nguồn gốc rõ ràng, ngày truy cập, liên kết; không coi chính sách nền tảng nước ngoài là luật địa phương.
3. **Lập bản đồ AS-IS**: actor, trigger, dữ liệu đầu vào, bước, trạng thái, bàn giao, ngoại lệ, kiểm soát và điểm đau; đánh dấu vấn đề đã chứng minh so với giả thuyết cần phỏng vấn.
4. **Đề xuất TO-BE tối giản**: viết nguyên tắc thiết kế, luồng chính từ đầu đến cuối, swimlane ngắn, luồng ngoại lệ. Phân biệt *vé*, *đăng bán*, *đơn bán*, *giao vé*, *thu/chi/đối soát*; tránh một trạng thái duy nhất đại diện mọi thứ. Chỉ đề xuất tự động hóa khi có đầu vào đáng tin; với hệ thống demo/mock thì ghi rõ khoảng cách để triển khai thật.
5. **Đặc tả**: bảng thuật ngữ, quyết định mở và giả định; quy tắc nghiệp vụ gắn mã BR-xx, quyền vai trò, nguồn dữ liệu chuẩn, bất biến, vòng đời/trạng thái với chuyển trạng thái hợp lệ, ngoại lệ, tình huống chống trùng/đồng thời, và tiêu chí nghiệm thu Given/When/Then gắn yêu cầu. Đánh dấu các số SLA/ngưỡng là đề xuất chờ duyệt.
6. **Ưu tiên**: tách MVP khỏi giai đoạn sau; bảng hạng mục với tác động, độ khó, phụ thuộc và kiểm chứng; nêu yêu cầu phi chức năng, chính sách/tuân thủ và chỉ số với mẫu số rõ ràng. Không trình bày nhận định pháp lý như lời khuyên pháp lý; điều kiện chuyển nhượng phải theo từng đơn vị phát hành/sự kiện.
7. **Kiểm tra**: lần theo một vé từ nhập → bán → giao → đối soát và các nhánh hủy/hoàn; kiểm tra không bán hai lần, không tính lãi khi tiền chưa quyết toán, không lộ mã vé; đối chiếu mọi kết luận AS-IS với bằng chứng và mọi yêu cầu TO-BE với tiêu chí nghiệm thu.

## Đầu ra

Viết báo cáo trong `docs/` khi được yêu cầu lưu tài liệu: tóm tắt quyết định, phạm vi/bằng chứng, AS-IS, vấn đề, TO-BE, quy tắc và trạng thái, dữ liệu, câu chuyện và tiêu chí nghiệm thu, lộ trình, rủi ro, câu hỏi cần xác nhận, nguồn tham khảo. Nếu chưa phỏng vấn stakeholder, nêu rõ tài liệu là bản đề xuất để xác nhận, không tuyên bố đã được phê duyệt. Không sửa nghiệp vụ ứng dụng khi chỉ được yêu cầu phân tích.
