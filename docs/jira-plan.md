# OctaPoint – Phân công công việc (Jira)

Mỗi task bên dưới là một thẻ Jira. Trong thẻ đã có sẵn: ai làm, ai xem lại, làm tuần nào, **phải chờ task nào** và **task nào đang chờ mình**. Chi tiết kỹ thuật nằm trong các tài liệu trong `docs/`, thẻ chỉ trỏ tới đúng phần cần đọc.

## Quy tắc chung (dán lên bảng Jira)

1. Mỗi task có **một người làm** và **một người xem lại** (người xem lại đọc code và duyệt pull request).
2. Tạo nhánh từ `develop`, đặt tên như `feature/T07a-points-engine`; tiêu đề pull request bắt đầu bằng mã task.
3. **Task xong khi:** đạt hết mục "Xong khi" của thẻ, `pnpm lint`, `pnpm typecheck`, `pnpm test` đều xanh, có người xem lại duyệt, và tài liệu đã sửa nếu có thay đổi.
4. Trạng thái: `To Do` → `In Progress` → `In Review` → `Testing` → `Done`.
5. **Bị kẹt hơn một ngày thì báo ngay** trên thẻ và nhắn người liên quan. Đừng chờ đến buổi họp.
6. Chưa chắc thì hỏi, không tự đoán. Không thêm tính năng ngoài SRS.

## Bảng tổng quan

| Task | Việc | Làm | Xem lại | Tuần | Giờ | Phải chờ |
|---|---|---|---|---|---|---|
| T02 | Đăng nhập và phiên làm việc | Hiếu | Duy | Tuần 5 | 32 | T01 |
| T03 | Đăng ký, duyệt cửa hàng và tách dữ liệu giữa các cửa hàng | Duy | Hiếu | Tuần 5 | 32 | T02 |
| T04 | Nhân viên và khoá API | Duy | Hiếu | Tuần 6 | 12 | T03 |
| T05 | Quản lý khách hàng | Hiệp | Duy | Tuần 5 | 8 | T02 |
| T06 | Quy tắc tích điểm | Hải | Hiếu | Tuần 5 | 12 | T02 |
| T07a | Lõi điểm: cộng điểm và đổi điểm | Hiếu | Duy | Tuần 6 | 38 | T05, T06 |
| T07b | Chống gửi trùng yêu cầu (idempotency) | Duy | Hiếu | Tuần 6 | 30 | T07a |
| T08 | Xem sổ cái và huỷ giao dịch | Hải | Hiếu | Tuần 6 | 22 | T07a |
| T09 | Cổng API cho máy POS (ký HMAC) | Đạt | Hiếu | Tuần 6 | 20 | T04, T07a, T07b |
| T10 | API bảng thống kê | Hiệp | Hải | Tuần 6 | 8 | T07a |
| T11 | Hợp đồng Move và đưa lên Testnet | Đạt | Hiếu | Tuần 5 | 16 | Không chờ ai |
| T12 | Worker neo bằng chứng lên Sui | Hiếu | Đạt | Tuần 7 | 26 | T07a và T11 |
| T13a | Web portal: khung, đăng nhập, đăng ký, màn hình Admin | Hiệp | Hải | Tuần 5–6 | 24 | T02, T03 (dữ liệu giả trước) |
| T13b | Web portal: màn hình của cửa hàng | Hiệp | Hải | Tuần 7 | 16 | T04, T05, T06, T07, T08, T10 |
| T14 | SDK TypeScript | Đạt | Duy | Tuần 7 | 22 | T09 |
| T15 | MCP Server (chỉ đọc) | Duy | Đạt | Tuần 7 | 20 | T14 |
| T16a | Kiểm thử thủ công và báo cáo | Đạt | Hải | Tuần 6–8 | 24 | Các tính năng xong dần |
| T16b | Tài liệu và triển khai | Hải | Hiếu | Tuần 5–8 | 52 | Làm liên tục |
| T16c | Diễn tập demo (UAT) | Đạt | Hải | Tuần 8 | 8 | T12, T15, T16a, T16b |

**Tuần 5 làm gì trước:** Hiếu (T02) và Duy (T03) làm xong "bộ kiểm tra phiên" và "hàm lọc theo cửa hàng" trong 2 ngày đầu và báo cả nhóm, vì T04, T05, T06 và giao diện đều cần hai thứ này. Đạt bắt đầu T11 (Sui) ngay vì đây là phần rủi ro nhất.

## Mỗi người làm gì

- **Hiếu** (96 giờ): T02, T07a, T12
- **Duy** (94 giờ): T03, T04, T07b, T15
- **Đạt** (90 giờ): T09, T11, T14, T16a, T16c
- **Hiệp** (56 giờ): T05, T10, T13a, T13b
- **Hải** (86 giờ): T06, T08, T16b

Sprint 3 là tuần 5–6, Sprint 4 là tuần 7–8. Sprint 3 nặng nhất; nếu chậm hơn một ngày, Hải họp ngay với người liên quan để dời việc. Phần duy nhất được cắt khi thiếu thời gian là công cụ `get_loyalty_rules` (Should).

---

## T02 · Đăng nhập và phiên làm việc

**Người làm:** Hiếu · **Xem lại:** Duy · **Tuần 5** (Sprint 3) · **32 giờ**
**Phải chờ:** T01 (đã xong)
**Mở khoá cho:** T03, T04, T05, T06, T13a

**Mục tiêu.** Người dùng đăng nhập bằng email và mật khẩu, được giữ đăng nhập 8 giờ. Mọi chức năng sau này đều dựa vào phần này.

**Cần có trước**
- Đọc SRS 3.2.1.1, 3.2.1.4 và api-spec mục B.1–B.2.
- Code sẵn có: lib/password, lib/errors, bảng users và sessions. Tài khoản Admin tạo bằng seed:admin.

**Làm gì**
1. Viết trước (xong trong 2 ngày đầu, báo cả nhóm): bộ kiểm tra phiên, bộ kiểm tra vai trò, khung gắn route (routes/index.ts) và hàm hỗ trợ test (test/helpers/app.ts, auth.ts).
2. Đăng nhập: kiểm mật khẩu trước, rồi mới kiểm cửa hàng có đang hoạt động; tạo cookie phiên 8 giờ.
3. Đăng xuất, xem thông tin tài khoản, đổi mật khẩu.
4. Viết test trong apps/api/test/db/auth.test.ts.

**Giao nộp**
- routes/portal/auth.ts, services/auth.ts, middleware/auth.ts (requireSession, requireRole, requireCsrfHeader, requireMerchantId), routes/index.ts, services/audit.ts (writeAudit), test/helpers/app.ts và auth.ts.
- File test.

**Xong khi**
- Đăng nhập đúng/sai trả đúng thông báo (MSG03, MSG02, MSG15).
- Phiên hết hạn, đã đăng xuất, người dùng bị khoá hoặc cửa hàng bị khoá đều bị chặn (MSG35).
- Đổi mật khẩu đúng quy tắc (MSG36, MSG37).

## T03 · Đăng ký, duyệt cửa hàng và tách dữ liệu giữa các cửa hàng

**Người làm:** Duy · **Xem lại:** Hiếu · **Tuần 5** (Sprint 3) · **32 giờ**
**Phải chờ:** T02 (bộ kiểm tra phiên). Phần đăng ký làm trước được.
**Mở khoá cho:** T04, T05 (sau khi 2 hàm dùng chung được gộp)

**Mục tiêu.** Chủ cửa hàng đăng ký, Admin duyệt hoặc tạm khoá. Dữ liệu cửa hàng này không bao giờ lộ sang cửa hàng khác.

**Cần có trước**
- Đọc SRS 3.2.1.1–3.2.1.2, BR-01, BR-18; api-spec B.2–B.3.

**Làm gì**
1. Đăng ký: tạo cửa hàng "Pending" và tài khoản Owner cùng lúc, sinh mã MCH-.
2. Admin: xem danh sách, duyệt, tạm khoá (chỉ các chuyển trạng thái hợp lệ; khoá API đi theo trạng thái cửa hàng).
3. Viết 2 hàm dùng chung (xong trong 2 ngày đầu, báo cả nhóm): lib/codes.ts (mã MCH- và TXN-) và lib/pg-errors.ts. Ghi audit dùng hàm writeAudit của T02.
4. Viết test: người dùng cửa hàng A không đọc hay sửa được dữ liệu cửa hàng B.

**Giao nộp**
- POST /auth/register, các endpoint admin/merchants, lib/codes.ts, lib/pg-errors.ts, test/helpers/tenant.ts, test.

**Xong khi**
- Đăng ký tạo cửa hàng Pending có mã MCH- và đúng một Owner; email trùng báo MSG31.
- Chỉ cho phép đúng các chuyển trạng thái trong SRS 3.2.1.2.
- Có test chứng minh hai cửa hàng tách biệt.

## T04 · Nhân viên và khoá API

**Người làm:** Duy · **Xem lại:** Hiếu · **Tuần 6** (Sprint 3) · **12 giờ**
**Phải chờ:** T03
**Mở khoá cho:** T09

**Mục tiêu.** Owner tạo nhân viên và khoá API cho máy POS. Mã bí mật (secret) chỉ hiện đúng một lần.

**Cần có trước**
- Đọc SRS 3.2.1.3, 3.2.3.3, CR-07; api-spec B.4 (staff, api-keys).
- WBS 6.1 là 8 giờ; phần nhân viên chưa có trong WBS nên cộng khoảng 4 giờ.

**Làm gì**
1. Viết lib/crypto.ts để mã hoá secret (AES-256-GCM) trước khi lưu.
2. Tạo, xem và thu hồi khoá API: tối đa 5 khoá mỗi cửa hàng (MSG40); danh sách chỉ hiện mã đã che.
3. Tạo nhân viên; khoá nhân viên thì phiên của họ kết thúc.
4. Ghi nhật ký audit và viết test.

**Giao nộp**
- Các endpoint staff và api-keys, lib/crypto.ts, test.

**Xong khi**
- Khoá thứ 6 bị từ chối (MSG40); khoá đã thu hồi không dùng lại được.
- Trong database không có secret ở dạng chữ rõ.

## T05 · Quản lý khách hàng

**Người làm:** Hiệp · **Xem lại:** Duy · **Tuần 5** (Sprint 3) · **8 giờ**
**Phải chờ:** T02 (phiên, audit) và T03 (codes, pg-errors)
**Mở khoá cho:** T07a

**Mục tiêu.** Owner và nhân viên tìm, tạo, sửa khách hàng theo mã khách. Owner có thể khoá khách tạo nhầm (không xoá, không gộp).

**Cần có trước**
- Đọc SRS 3.2.3.1, BR-04, CR-02; api-spec B.4 (customers).

**Làm gì**
1. Tạo khách: tên và mã bắt buộc, số điện thoại tuỳ chọn (trùng mã MSG27, trùng số MSG38).
2. Tìm theo mã, tên hoặc số điện thoại; chỉ sửa được tên và số điện thoại.
3. Khoá và mở lại khách (chỉ Owner).
4. Viết test.

**Giao nộp**
- Các endpoint customers, services/customers.ts (getCustomerForUpdate, findCustomer, toCustomerView) và test.

**Xong khi**
- Cùng một số điện thoại ở hai cửa hàng khác nhau là hợp lệ; trong cùng cửa hàng thì báo MSG38.
- Mã chữ thường bị từ chối.
- Nhân viên gọi chức năng khoá khách nhận MSG04.

## T06 · Quy tắc tích điểm

**Người làm:** Hải · **Xem lại:** Hiếu · **Tuần 5** (Sprint 3) · **12 giờ**
**Phải chờ:** T02 (phiên, audit)
**Mở khoá cho:** T07a

**Mục tiêu.** Owner đặt tỷ lệ tích điểm (bao nhiêu VND được 1 điểm) và số điểm tối thiểu mỗi lần đổi.

**Cần có trước**
- Đọc SRS 3.2.2.1, BR-07, BR-22; api-spec B.4 (rules).

**Làm gì**
1. Xem và lưu quy tắc: cả hai giá trị là số nguyên dương không quá 1.000.000 (MSG33 nếu sai).
2. Chỉ Owner được sửa.
3. Ghi audit giá trị cũ và mới; viết test.

**Giao nộp**
- GET và PUT /merchant/rules, services/rules.ts (getLoyaltyRules, toRulesView) và test.

**Xong khi**
- Giá trị 0, âm hoặc quá trần đều bị từ chối.
- Mỗi lần lưu có một dòng audit.

## T07a · Lõi điểm: cộng điểm và đổi điểm

**Người làm:** Hiếu · **Xem lại:** Duy · **Tuần 6** (Sprint 3) · **38 giờ**
**Phải chờ:** T05, T06. Trong lúc chờ có thể viết trước lib/proof-hash.ts.
**Mở khoá cho:** T07b, T08, T09, T10, T12

**Mục tiêu.** Cộng điểm và đổi điểm cho khách, sao cho số dư không bao giờ sai dù nhiều yêu cầu đến cùng lúc. Đây là phần quan trọng nhất của hệ thống.

**Cần có trước**
- Đọc kỹ SRS 3.2.3.2, BR-05, BR-06, BR-17; db-schema mục 4–5; api-spec A và B.4.

**Làm gì**
1. Mỗi lần cộng/đổi điểm làm trong MỘT giao dịch database, theo thứ tự: khoá dòng khách (để hai yêu cầu cùng lúc không trừ trùng), đọc quy tắc, kiểm tra, cập nhật số dư, ghi giao dịch.
2. Cộng điểm: điểm = làm tròn xuống (số tiền ÷ tỷ lệ). Đổi điểm: kiểm tối thiểu trước (MSG09), rồi kiểm số dư (MSG08).
3. Mỗi giao dịch lưu người thực hiện, số dư sau, mã hash bằng chứng (đúng ví dụ trong db-schema mục 4) và mã TXN- (dùng generateTxCode của T03).
4. Test quan trọng: 20 yêu cầu đổi điểm cùng lúc khi số dư chỉ đủ cho 5 lần, đúng 5 lần thành công.

**Giao nộp**
- services/points.ts, services/transactions.ts, lib/proof-hash.ts, test. Chưa có endpoint HTTP (T07b làm).

**Xong khi**
- Công thức điểm và thông báo lỗi đúng SRS.
- Test chạy song song đạt, số dư không bao giờ âm.
- Mã hash đúng ví dụ mẫu.

## T07b · Chống gửi trùng yêu cầu (idempotency)

**Người làm:** Duy · **Xem lại:** Hiếu · **Tuần 6** (Sprint 3) · **30 giờ**
**Phải chờ:** T07a (hai người thống nhất cách gắn vào services/points.ts ngay từ ngày đầu)
**Mở khoá cho:** T09

**Mục tiêu.** Nếu máy POS gửi lại cùng một yêu cầu (do mạng chậm), hệ thống chỉ tạo một giao dịch và trả lại đúng kết quả lần đầu.

**Cần có trước**
- Đọc SRS BR-10; db-schema bảng idempotency_keys và mục 5; api-spec A.1.

**Làm gì**
1. Mỗi yêu cầu cộng/đổi điểm bắt buộc có khoá X-Idempotency-Key (thiếu thì MSG33).
2. Cùng khoá và cùng nội dung: trả lại kết quả đã lưu. Cùng khoá khác nội dung: MSG34. Quá 24 giờ thì coi như khoá mới.
3. Yêu cầu lỗi thì không lưu khoá để có thể thử lại.
4. Ghi audit cho các hành động theo CR-04; viết test; thêm việc dọn khoá cũ mỗi ngày.

**Giao nộp**
- services/idempotency.ts, services/maintenance.ts, endpoint cộng/đổi điểm của portal (POST /merchant/customers/{code}/issue và /redeem) và test.

**Xong khi**
- Gửi hai lần giống nhau (kể cả cùng lúc) chỉ ra một giao dịch.
- Cùng khoá khác nội dung: MSG34.

## T08 · Xem sổ cái và huỷ giao dịch

**Người làm:** Hải · **Xem lại:** Hiếu · **Tuần 6** (Sprint 3) · **22 giờ**
**Phải chờ:** T07a (Hiếu hướng dẫn mẫu giao dịch cho Hải trước khi bắt đầu)
**Mở khoá cho:** T13b

**Mục tiêu.** Xem lịch sử giao dịch kèm trạng thái bằng chứng. Owner huỷ một giao dịch bằng cách tạo giao dịch đảo ngược; giao dịch gốc không bao giờ bị sửa.

**Cần có trước**
- Đọc SRS 3.2.5.1–3.2.5.2, BR-03, BR-21; api-spec B.3–B.4; db-schema mục 3 và mục 5 (phần Reversal).

**Làm gì**
1. Sổ cái: lọc theo loại, trạng thái, ngày (UTC+7), mã khách; mới nhất lên đầu; có đường dẫn Sui Explorer khi đã neo.
2. Huỷ giao dịch trong MỘT giao dịch database: khoá dòng khách trước rồi mới kiểm tra giao dịch gốc (MSG26 nếu đã huỷ hoặc không huỷ được).
3. Huỷ khi số dư không đủ: MSG25; khi làm số dư vượt trần: MSG41.
4. Viết test, gồm cả hai yêu cầu huỷ cùng lúc.

**Giao nộp**
- GET ledger (merchant và admin), POST reverse, test.

**Xong khi**
- Giao dịch gốc không đổi; giao dịch đảo ngược không huỷ được nữa.
- Hai yêu cầu huỷ cùng lúc chỉ một cái thành công.
- Admin xem được mọi cửa hàng nhưng chỉ đọc.

## T09 · Cổng API cho máy POS (ký HMAC)

**Người làm:** Đạt · **Xem lại:** Hiếu · **Tuần 6** (Sprint 3) · **20 giờ**
**Phải chờ:** T04 (khoá API) và T07a, T07b. Phần kiểm tra chữ ký làm trước được.
**Mở khoá cho:** T14

**Mục tiêu.** Mọi lời gọi từ bên ngoài đều phải có chữ ký hợp lệ. Cửa hàng được xác định từ khoá API, không bao giờ từ dữ liệu client gửi lên.

**Cần có trước**
- Đọc SRS 3.2.3.4, UC-15; api-spec mục A (nhất là A.2 và 3 ví dụ chữ ký).
- Code sẵn có: lib/hmac.ts và lib/request-target.ts (đã có test).

**Làm gì**
1. Kiểm theo thứ tự: khoá hợp lệ và cửa hàng đang hoạt động (MSG18), giờ trong 5 phút (MSG17), chữ ký (MSG16), dữ liệu (MSG33).
2. Lấy nội dung gốc của request (chưa parse JSON) và đường dẫn đúng như client gửi để tính chữ ký.
3. Gắn các endpoint: issue, redeem, balance, transactions (và loyalty-rules nếu kịp).
4. Test với 3 ví dụ chữ ký, khoá bị tạm khoá/thu hồi, gửi lại request đã ký.

**Giao nộp**
- routes/external/, test/db/gateway.test.ts.

**Xong khi**
- Ba ví dụ chữ ký đạt.
- Thứ tự lỗi MSG18, MSG17, MSG16 đúng.
- Gửi lại request đã ký mà không có khoá idempotency mới không tạo giao dịch thứ hai.

## T10 · API bảng thống kê

**Người làm:** Hiệp · **Xem lại:** Hải · **Tuần 6** (Sprint 3) · **8 giờ**
**Phải chờ:** T07a
**Mở khoá cho:** T13a, T13b

**Mục tiêu.** Con số tổng quan: số cửa hàng theo trạng thái, khách hàng, điểm đang lưu hành, giao dịch hôm nay.

**Cần có trước**
- Đọc SRS 3.2.6 và db-schema mục 6 (có sẵn câu truy vấn mẫu).

**Làm gì**
1. Dùng đúng câu truy vấn mẫu cho Admin và Owner.
2. Điểm đã cấp và đã đổi phải trừ các giao dịch đã huỷ.
3. Test với dữ liệu có giao dịch huỷ và giao dịch sát nửa đêm giờ Việt Nam.

**Giao nộp**
- GET /admin/dashboard, GET /merchant/dashboard, test.

**Xong khi**
- Số liệu khớp câu truy vấn mẫu; "hôm nay" tính theo UTC+7.

## T11 · Hợp đồng Move và đưa lên Testnet

**Người làm:** Đạt · **Xem lại:** Hiếu · **Tuần 5** (Sprint 3) · **16 giờ**
**Phải chờ:** Không phải chờ ai: bắt đầu ngay tuần 5
**Mở khoá cho:** T12

**Mục tiêu.** Hợp đồng nhỏ trên blockchain Sui chỉ lưu mã giao dịch và hash bằng chứng. Đây là phần rủi ro số 2 của dự án nên làm sớm.

**Cần có trước**
- Đọc docs/anchoring.md mục 1–2.
- Làm trước spike S2 trong docs/spikes.md: cài Sui CLI, tạo ví, xin gas Testnet.

**Làm gì**
1. Bắt đầu từ bản phác thảo trong anchoring.md, sửa cho khớp phiên bản Sui đang cài.
2. Viết 3 test Move: ghi mới thành công, ghi trùng bị từ chối, hash không đủ 32 byte bị từ chối.
3. Build, test rồi publish lên Testnet.
4. Gọi thử hàm bằng CLI và mở kết quả trên Sui Explorer.

**Giao nộp**
- Thư mục contracts/anchor, hai mã id (package và registry), kết quả spike S2.

**Xong khi**
- 3 test Move đạt.
- Hợp đồng đã publish và một giao dịch thử xem được trên Explorer.

## T12 · Worker neo bằng chứng lên Sui

**Người làm:** Hiếu · **Xem lại:** Đạt · **Tuần 7** (Sprint 4) · **26 giờ**
**Phải chờ:** T07a và T11
**Mở khoá cho:** T16c

**Mục tiêu.** Giao dịch được lưu vào database trước, rồi một tiến trình chạy nền mới ghi bằng chứng lên blockchain. Testnet lỗi cũng không làm mất giao dịch hay đổi số dư.

**Cần có trước**
- Đọc docs/anchoring.md mục 3–5; SRS 3.2.5.3, BR-11, BR-12.
- Biến môi trường SUI_* và ENABLE_ANCHOR_WORKER=true (chỉ bật trên một nơi chạy).

**Làm gì**
1. Mỗi 30 giây lấy các giao dịch đang chờ (dùng câu truy vấn trong anchoring.md để hai worker không lấy trùng).
2. Gửi từng giao dịch lên hợp đồng; thành công thì đánh dấu ANCHORED kèm mã digest.
3. Lỗi thì thử lại sau 1, 2, 4, 8, 16 phút; lần thất bại thứ 6 thì FAILED. Nếu hợp đồng báo "đã có" thì lấy digest từ chuỗi.
4. Test với bản giả của Sui, rồi thử với Testnet thật.

**Giao nộp**
- services/anchoring.ts và test.

**Xong khi**
- Giao dịch mới thành ANCHORED, mở digest được trên Explorer.
- Mạng lỗi: thử lại đúng lịch rồi FAILED sau lần thứ 6.
- Không bao giờ đổi số dư.

## T13a · Web portal: khung, đăng nhập, đăng ký, màn hình Admin

**Người làm:** Hiệp · **Xem lại:** Hải · **Tuần 5–6** (Sprint 3) · **24 giờ**
**Phải chờ:** T02 và T03. Làm trước bằng dữ liệu giả.
**Mở khoá cho:** T13b

**Mục tiêu.** Giao diện cho Admin và luồng đăng nhập, đăng ký. Việc ẩn menu theo vai trò chỉ để tiện dùng, quyền thật do máy chủ kiểm tra.

**Cần có trước**
- Đọc SRS 3.1.2–3.1.6 và sơ đồ Screen Flow trong docs/diagrams.
- apps/web đã có sẵn, các lời gọi /api/ đi qua proxy.

**Làm gì**
1. Cài Tailwind và shadcn/ui; viết một hàm gọi API dùng chung (đường dẫn tương đối /api/v1).
2. Làm bố cục và menu theo vai trò, màn Login chung, Register.
3. Làm Admin Dashboard, Merchant Management (Duyệt/Tạm khoá), System Ledger Logs, Account Settings.
4. Hiện thông báo đúng danh sách MSG; gặp MSG35 thì quay về Login.

**Giao nộp**
- Các màn hình nêu trên trong apps/web.

**Xong khi**
- Đúng menu cho từng vai trò.
- Thông báo lấy đúng từ danh sách MSG.
- Hết phiên thì quay về Login.

## T13b · Web portal: màn hình của cửa hàng

**Người làm:** Hiệp · **Xem lại:** Hải · **Tuần 7** (Sprint 4) · **16 giờ**
**Phải chờ:** T04, T05, T06, T07, T08, T10
**Mở khoá cho:** T16a

**Mục tiêu.** Các màn hình dùng hằng ngày của chủ cửa hàng và nhân viên.

**Cần có trước**
- Đọc SRS 3.1.2 (màn 3–10) và api-spec B.4.

**Làm gì**
1. Dashboard, danh sách khách kèm hộp thoại Cộng/Đổi điểm, Quy tắc, Khoá API, Nhân viên, Sổ cái kèm nút Huỷ (Owner).
2. Hộp thoại cộng/đổi điểm tạo một mã duy nhất cho mỗi lần bấm xác nhận (X-Idempotency-Key) và khoá nút khi đang gửi.
3. Secret của khoá API chỉ hiện một lần; sổ cái hiện trạng thái PENDING_ANCHOR / ANCHORED / FAILED.
4. Nhân viên không thấy các màn hình của Owner.

**Giao nộp**
- Các màn hình nêu trên trong apps/web.

**Xong khi**
- Mọi màn trong SRS 3.1.2 chạy với API thật.
- Bấm đúp không tạo hai giao dịch.

## T14 · SDK TypeScript

**Người làm:** Đạt · **Xem lại:** Duy · **Tuần 7** (Sprint 4) · **22 giờ**
**Phải chờ:** T09
**Mở khoá cho:** T15

**Mục tiêu.** Thư viện giúp hệ thống POS gọi API dễ dàng: tự ký request và tự tạo khoá chống gửi trùng.

**Cần có trước**
- Đọc SRS 3.2.3.5; api-spec A.2 và C.2.
- Tham khảo logic ký trong apps/api/src/lib/hmac.ts.

**Làm gì**
1. Viết lớp OctaPointClient với 4 hàm: issuePoints, redeemPoints, getBalance, listTransactions.
2. Tự ký request; tự thêm khoá idempotency cho cộng/đổi điểm; không tự thử lại.
3. Lỗi từ API ném ra OctaPointError có mã MSG.
4. Viết README kèm ví dụ chạy được.

**Giao nộp**
- packages/sdk, test và README.

**Xong khi**
- Ba ví dụ chữ ký cho đúng kết quả.
- Ví dụ trong README chạy được.

## T15 · MCP Server (chỉ đọc)

**Người làm:** Duy · **Xem lại:** Đạt · **Tuần 7** (Sprint 4) · **20 giờ**
**Phải chờ:** T14. Tự học MCP SDK sớm vì kiến thức còn ít.
**Mở khoá cho:** T16c

**Mục tiêu.** Cho trợ lý AI đọc số dư và lịch sử giao dịch. Tuyệt đối không có công cụ ghi.

**Cần có trước**
- Đọc SRS 3.2.4.1, BR-14; api-spec C.1.

**Làm gì**
1. Dùng packages/sdk; cấu hình qua OCTAPOINT_BASE_URL, OCTAPOINT_API_KEY, OCTAPOINT_API_SECRET.
2. Chỉ có các công cụ get_balance, list_transactions (10 giao dịch mới nhất) và get_loyalty_rules (Should).
3. Viết test khẳng định không có công cụ ghi.
4. Thử với một MCP client thật, ví dụ Claude Desktop.

**Giao nộp**
- packages/mcp, test và hướng dẫn cấu hình.

**Xong khi**
- Chỉ có công cụ chỉ đọc.
- Khoá sai báo MSG18.
- Chạy được từ MCP client.

## T16a · Kiểm thử thủ công và báo cáo

**Người làm:** Đạt · **Xem lại:** Hải · **Tuần 6–8** (Sprint 4) · **24 giờ**
**Phải chờ:** Viết danh sách kiểm thử dần từ tuần 6; chạy toàn bộ khi các tính năng xong
**Mở khoá cho:** T16c

**Mục tiêu.** Kiểm tra mọi chức năng trước buổi demo.

**Cần có trước**
- Đọc SRS phần kế hoạch kiểm thử và mục "kịch bản kiểm thử chéo" trong implementation-plan.md.

**Làm gì**
1. Mỗi tính năng xong thì thêm các ca kiểm thử vào danh sách.
2. Dùng Postman cho API (có ca gửi song song) và duyệt từng màn hình.
3. Mỗi lỗi là một issue loại Bug có bước tái hiện; người sửa chạy lại ca đó.

**Giao nộp**
- Danh sách kiểm thử có kết quả Đạt/Không đạt và báo cáo lỗi.

**Xong khi**
- Mỗi UC và BR có ít nhất một ca kiểm thử.
- Không còn lỗi chặn trước demo.

## T16b · Tài liệu và triển khai

**Người làm:** Hải · **Xem lại:** Hiếu · **Tuần 5–8** (Sprint 4) · **52 giờ**
**Phải chờ:** Làm liên tục, chốt cuối Sprint 4
**Mở khoá cho:** T16c

**Mục tiêu.** Giữ tài liệu luôn đúng với code, triển khai hệ thống lên mạng và đóng gói để giảng viên chạy lại được.

**Cần có trước**
- Đọc SRS phần tài liệu và docs/config-and-deploy.md.

**Làm gì**
1. Mỗi tuần xem các pull request đã gộp và sửa SRS, ERD, đặc tả API cho khớp.
2. Làm các spike S1, S3, S4 trong docs/spikes.md.
3. Triển khai thử từ Sprint 3 (Vercel, Render hoặc Railway, PostgreSQL) để cuối kỳ không bị dồn.
4. Viết hướng dẫn cài đặt và sổ tay người dùng; gắn tag phát hành.

**Giao nộp**
- Tài liệu cập nhật, hệ thống đã triển khai, hướng dẫn cài đặt, sổ tay người dùng, tag phát hành.

**Xong khi**
- Người ngoài làm theo hướng dẫn chạy được hệ thống.
- Tài liệu không mâu thuẫn với code.

## T16c · Diễn tập demo (UAT)

**Người làm:** Đạt · **Xem lại:** Hải · **Tuần 8** (Sprint 4) · **8 giờ**
**Phải chờ:** T12, T15, T16a, T16b
**Mở khoá cho:** Buổi bảo vệ

**Mục tiêu.** Cả nhóm chạy thử toàn bộ kịch bản demo trên hệ thống đã triển khai.

**Cần có trước**
- Đọc SRS mục 2 (kịch bản demo) và docs/spikes.md.

**Làm gì**
1. Chạy kịch bản: đăng ký, duyệt, đặt quy tắc, tạo khoá API, thêm khách, cộng điểm, đổi điểm, xem sổ cái và digest, gọi SDK, hỏi MCP.
2. Gọi trước một request để đánh thức máy chủ miễn phí.
3. Chuẩn bị sẵn một giao dịch đã neo xong, phòng khi Testnet lỗi lúc demo.

**Giao nộp**
- Hai lần chạy kịch bản liên tiếp không lỗi chặn.

**Xong khi**
- Hai lần chạy liên tiếp đạt.

---

## Nhập vào Jira

1. Vào **Import issues** (hoặc External system import → CSV), chọn `jira-import.csv`, mã hoá UTF-8, dấu phân cách là dấu phẩy.
2. Ghép các cột trùng tên. Cột `Story Points` đang chứa **số giờ** (1 điểm = 1 giờ).
3. Ghép tên (`Hải`, `Hiếu`, `Hiệp`, `Duy`, `Đạt`) với đúng tài khoản Jira của từng người.
4. Jira không nhập tin cậy được liên kết "bị chặn bởi", nên đặt tay theo dòng **Phải chờ** của từng thẻ.
5. Mình chưa thử file này trên Jira thật. Nếu cách nối Epic hoặc Sub-task không đúng, tạo bằng tay và dán nội dung từ các thẻ ở trên.
