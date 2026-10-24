---
agent : 'agent'
description: 'Viết đặc tả SRS chuẩn FPT Capstone cho 1 Use Case từ Master Spec và Schema'
---
Hãy đọc kỹ `#file:docs/00-master-spec.md` và `#file:packages/database/postgres/prisma/schema.prisma`.
Viết đặc tả chi tiết mục Functional Requirement (Chương III - SRS) cho Use Case mà tôi chỉ định theo đúng khung mẫu trong `.github/copilot-instructions.md`.

Yêu cầu bắt buộc:
1. Ngôn ngữ xuất ra: Tiếng Anh chuyên ngành (trừ tên nút bấm hoặc nhãn giao diện có thể để song ngữ nếu cần).
2. Mục **Interface**: Liệt kê rõ từng trường trong Form, từng cột trong Bảng (Table) và các bộ lọc (Filter) để khớp 100% với màn hình UI.
3. Mục **Data Processing**: Chỉ rõ thao tác (INSERT/UPDATE/SELECT) lên đúng tên Model và tên trường trong `schema.prisma`.
4. Mục **Business Rules**: Trích dẫn đúng mã `BR-XX` từ `00-master-spec.md` và giải thích chi tiết logic kiểm tra.
5. Lưu kết quả vào thư mục `docs/03_Requirements_SRS/` theo tên phân hệ tương ứng.