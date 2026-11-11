# Đưa dự án lên GitHub và cho nhóm làm việc

Dành cho người tạo repo (một lần) và cho các thành viên (mỗi người một lần).

## A. Người tạo repo (làm một lần)

**1. Kiểm tra trước khi đẩy lên**
```powershell
git status
git ls-files | findstr /i ".env"
```
Dòng thứ hai chỉ được in ra `.env.example`. Nếu thấy `.env` thì **dừng lại** và báo mình, vì file `.env` chứa khoá bí mật và không bao giờ được đẩy lên.

**2. Commit mọi thứ đang chờ** (cả file khoá phiên bản thư viện `pnpm-lock.yaml`):
```powershell
git add -A
git status
git commit -m "chore: T00 and T01 verified, lockfile, port 5433, docs and contracts"
```

**3. Tạo repo trên GitHub** (nên để **Private**), không tick các ô "Add a README / .gitignore / license" vì repo đã có sẵn. Rồi đẩy hai nhánh:
```powershell
git remote add origin https://github.com/<tên-tổ-chức-hoặc-bạn>/octapoint.git
git push -u origin main
git push -u origin develop
```

**4. Cài đặt trên GitHub** (Settings):
- **Default branch:** đổi thành `develop` (để pull request mặc định nhắm vào `develop`).
- **Branches → Add rule** cho `main` và `develop`: bắt buộc pull request, cần ít nhất 1 người duyệt, bắt buộc CI (`check`) xanh, cấm force push, cấm xoá nhánh.
- **Collaborators:** mời 4 thành viên còn lại với quyền **Write**.
- **Actions:** bật. Mở tab Actions, xem lần chạy CI đầu tiên có xanh không. Nếu đỏ, gửi nhật ký lỗi cho mình.

## B. Mỗi thành viên (làm một lần)

1. Cài **Node.js 20 trở lên**, **Git** và **Docker Desktop** (mở Docker Desktop và đợi nó chạy xong trước khi dùng).
2. Cài pnpm (nếu máy dùng Node mới không có corepack): `npm install -g pnpm@9.15.0`.
3. Clone và chuẩn bị (PowerShell cũ **không** dùng được `&&`, gõ từng dòng):
   ```powershell
   git clone https://github.com/<...>/octapoint.git
   cd octapoint
   git checkout develop
   pnpm install
   Copy-Item .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Mở `.env`, dán chuỗi vừa sinh vào `SECRET_ENCRYPTION_KEY=`. **Không commit file này.**
4. Bật database và kiểm tra:
   ```powershell
   docker compose up -d db
   pnpm --filter api migrate
   pnpm lint
   pnpm typecheck
   pnpm test
   ```
   Tất cả phải xanh (khoảng 64 test). Chỉ khi đó mới bắt đầu làm task.
5. Muốn có tài khoản Admin để thử: sửa `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` trong `.env`, rồi `pnpm --filter api seed:admin`.

Lỗi thường gặp: cổng database bị chiếm (đổi cổng trong `docker-compose.yml` và `.env`), `pnpm` không nhận ra (mở lại terminal), PowerShell chặn script (`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`).

## C. Quy trình hằng ngày

```powershell
git checkout develop
git pull
git checkout -b feature/CNPM-393-T07a-points-engine
```
- Tên nhánh = `feature/<mã thẻ Jira>-<mã task>-<tên ngắn>`; tiêu đề commit và pull request bắt đầu bằng mã thẻ, ví dụ `CNPM-393 T07a: issue and redeem points`.
- Commit nhỏ, thường xuyên. Trước khi đẩy lên: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- `git push -u origin <tên nhánh>`, mở pull request vào `develop`, gán người xem lại như trong thẻ Jira, chuyển thẻ sang `In Review`.
- Cập nhật nhánh khi `develop` có thay đổi: `git fetch`, rồi `git merge origin/develop`. Gặp xung đột thì giải quyết giữ cả hai bên, chạy lại test.
- Gộp xong thì chuyển thẻ sang `Done` và xoá nhánh.

## D. Điều tuyệt đối không làm

- Không commit `.env`, khoá, mật khẩu, file sao lưu cơ sở dữ liệu. Nếu lỡ commit một bí mật, **đổi bí mật đó ngay** (xoá khỏi lịch sử chưa đủ) rồi báo cả nhóm.
- Không đẩy thẳng lên `main` hoặc `develop`.
- Không sửa file của task khác (xem bảng sở hữu trong `docs/ai-prompts.md` mục 2).
- Không sửa một migration đã được gộp. Thêm file migration mới.
