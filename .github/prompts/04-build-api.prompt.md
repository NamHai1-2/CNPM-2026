---
agent: 'agent'
description: 'Sinh code Backend Hono theo kiến trúc 3 tầng Controller - Service - Repository'
---
Đọc kỹ `#file:packages/database/postgres/prisma/schema.prisma` và `#file:docs/00-master-spec.md`.
Hãy triển khai mã nguồn Backend cho Use Case được yêu cầu vào đúng thư mục phân hệ trong `apps/api-gateway/src/modules/`.

Yêu cầu bắt buộc:
1. Tách rõ 3 file: `*.controller.ts` (định nghĩa route Hono & validate request), `*.service.ts` (kiểm tra các Business Rules `BR-XX`), và `*.repository.ts` (gọi Prisma Client thao tác Database).
2. Tuân thủ nghiêm ngặt tên bảng và tên trường trong `schema.prisma`.
3. Trả về HTTP status code và cấu trúc JSON chuẩn (`{ success: boolean, code: string, message: string, data?: any }`).