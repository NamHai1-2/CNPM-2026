---
agent: 'agent'
description: 'Sinh mã Mermaid cho Class Diagram và Sequence Diagram chuẩn SDD FPT'
---
Dựa vào `#file:packages/database/postgres/prisma/schema.prisma` và `#file:docs/00-master-spec.md`, hãy thiết kế mục Detailed Design (Chương IV - SDD) cho Use Case được yêu cầu.

Hãy xuất ra 2 khối mã Mermaid.js chuẩn để import vào Draw.io:
1. **Class Diagram (`classDiagram`)**: Bao gồm `<Feature>Controller`, `<Feature>Service`, `I<Feature>Service`, `<Feature>Repository`, `PrismaService` và các Entity liên quan từ `schema.prisma` (ghi đầy đủ các thuộc tính và phương thức `+methodName()`).
2. **Sequence Diagram (`sequenceDiagram`)**: Thể hiện luồng tương tác từ `Actor -> Browser (Next.js) -> Controller (Hono) -> Service -> Repository -> PostgreSQL / Sui SDK`. Bắt buộc phải có các khối `alt [Validation / Business Rule Failed]` và `else [Valid Data]` để xử lý lỗi nghiệp vụ trước khi lưu Database.