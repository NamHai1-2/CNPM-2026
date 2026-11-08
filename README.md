# OctaPoint

Nền tảng **Credit-as-a-Service** (điểm thưởng khách hàng thân thiết) có xác thực bằng blockchain **Sui Testnet**, kèm REST API, TypeScript SDK và MCP Server (chỉ đọc) cho trợ lý AI.
Đây là sản phẩm học thuật (MVP), không dùng cho môi trường thật.

- Giảng viên hướng dẫn: Nguyễn Văn Chiến
- Nhóm thực hiện: Mai Nguyễn Nam Hải (Leader), Nguyễn Trung Hiếu, Phạm Văn Đức Hiệp, Hoàng Anh Duy, Nguyễn Lê Thành Đạt

## Xem ở đâu

| Cần xem | Vị trí |
|---|---|
| Đặc tả yêu cầu (SRS), kế hoạch dự án | [`docs/PROJECT_REPORT_FIXED.md`](docs/PROJECT_REPORT_FIXED.md) |
| Sơ đồ (ERD, use case, context, luồng màn hình) | [`docs/diagrams/`](docs/diagrams/) |
| Thiết kế cơ sở dữ liệu | [`docs/db-schema.md`](docs/db-schema.md) |
| Đặc tả API | [`docs/api-spec.md`](docs/api-spec.md) |
| Smart contract và worker ghi nhận lên Sui | [`docs/anchoring.md`](docs/anchoring.md), [`contracts/anchor/`](contracts/anchor/) |
| Cấu hình, triển khai | [`docs/config-and-deploy.md`](docs/config-and-deploy.md) |
| Kế hoạch triển khai theo task (T00–T16) | [`docs/implementation-plan.md`](docs/implementation-plan.md) |
| Kiểm thử | [`docs/testing/`](docs/testing/) |
| Hướng dẫn cài đặt và sử dụng | [`docs/guides/`](docs/guides/) |
| Quản lý dự án (sprint, họp, Jira) | [`docs/management/`](docs/management/) |

## Cấu trúc mã nguồn

```
apps/api          Backend (Node.js, Hono, PostgreSQL) và worker ghi nhận lên Sui
apps/web          Web Portal (Next.js) cho Admin, Merchant Owner, Staff
packages/sdk      TypeScript SDK (tự động ký HMAC)
packages/mcp      MCP Server (chỉ đọc)
contracts/anchor  Smart contract Sui Move
docs/             Toàn bộ tài liệu
```

## Demo

- Web Portal: _(điền link Vercel)_
- Tài khoản demo: _(điền sau khi triển khai)_
- Kịch bản demo: đăng ký merchant → Admin duyệt → đặt luật → tạo API key → thêm khách → cộng điểm → đổi điểm → xem sổ cái và digest trên Sui Explorer → gọi SDK → hỏi qua MCP.

## Chạy trên máy

Yêu cầu: Node.js 20+, pnpm, PostgreSQL 16+.

```bash
corepack enable                   # dùng đúng phiên bản pnpm trong package.json
pnpm install
cp .env.example .env              # file .env nằm ở thư mục gốc; điền SECRET_ENCRYPTION_KEY thật (lệnh sinh khoá có trong file)
docker compose up -d db           # PostgreSQL 16 trên localhost:5433
pnpm --filter api migrate
pnpm --filter api seed:admin
pnpm --filter api dev             # http://localhost:3001/health
pnpm --filter web dev             # http://localhost:3000
```

Kiểm tra: `pnpm lint`, `pnpm typecheck`, `pnpm test` (cần PostgreSQL đang chạy), `pnpm test:unit` (không cần cơ sở dữ liệu).

Chi tiết biến môi trường và triển khai: [`docs/config-and-deploy.md`](docs/config-and-deploy.md). Quy tắc cho lập trình viên: [`CLAUDE.md`](CLAUDE.md).

## Trạng thái

| Hạng mục | Trạng thái |
|---|---|
| Tài liệu (SRS, API, DB, thiết kế) | Hoàn thành |
| T00 Khung dự án (công cụ, CI, cấu hình, thông điệp, migration, test) | Hoàn thành, đã kiểm thử (63 test đạt) |
| FE1–FE6 Lõi API và bảo mật (T01–T10) | T01 (cơ sở dữ liệu) hoàn thành; T02 (đăng nhập, phiên) hoàn thành; T03 (đăng ký, duyệt cửa hàng) hoàn thành; T04 (nhân viên, khoá API) hoàn thành; T06 (quy tắc tích điểm) và T05 (khách hàng) hoàn thành; T07–T10 chưa bắt đầu |
| FE7 Web Portal | Chưa bắt đầu |
| FE8 Anchoring trên Sui | Chưa bắt đầu |
| FE9 SDK, FE10 MCP | Chưa bắt đầu |
| Kiểm thử và UAT | Chưa bắt đầu |

_(Cập nhật bảng này sau mỗi sprint.)_

## Quy trình làm việc

Nhánh `main` (luôn chạy được, dùng để demo) ← `develop` ← `feature/Txx-ten-task`. Mỗi task một pull request, có ít nhất 1 người review. Commit bắt đầu bằng `[Feature]` hoặc `[Fix]`. Các mốc nộp được đánh tag (ví dụ `v0.1-docs`, `v1.0`).
