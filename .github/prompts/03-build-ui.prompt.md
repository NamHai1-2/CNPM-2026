---
agent: 'agent'
description: 'Dựng nhanh màn hình UI Next.js + shadcn/ui kèm Mock Data thực tế để chụp ảnh SRS'
---
Hãy đọc kỹ đặc tả Use Case trong `#file:docs/00-master-spec.md` và cấu trúc bảng trong `#file:packages/database/postgres/prisma/schema.prisma`.
Tạo trang giao diện hoàn chỉnh trong `apps/web-portals/src/app/` (đúng phân khu `admin/` hoặc `merchant/`) cho Use Case được yêu cầu.

Yêu cầu bắt buộc:
1. Giao diện chuyên nghiệp, sáng sủa (Light mode mặc định để in báo cáo rõ nét), dùng Tailwind CSS và các component chuẩn (Table, Badge, Dialog/Modal, Input, Select, Button, Card).
2. Hiển thị đầy đủ các ô Filter tìm kiếm, bảng danh sách dữ liệu (có phân trang), các nút Action và Modal thêm/sửa đúng như mô tả trong SRS.
3. Tạo sẵn ít nhất 6–8 dòng dữ liệu mẫu (Mock Data) sát thực tế tại Việt Nam (ví dụ: Highlands Coffee, CGV Cinemas, Phuc Long, VinWonders, mã ví Sui `0x7a9f...3b1c`, mã Walrus Blob ID) để màn hình nhìn sống động, chụp ảnh đưa thẳng vào Chương III (SRS) và Chương VI (User Manual).