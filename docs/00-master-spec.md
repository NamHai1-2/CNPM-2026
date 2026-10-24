# OCTAPOINT MASTER SPECIFICATION (SINGLE SOURCE OF TRUTH)

## 1. Actors (Mục III.2.1 SRS)
1. **System Admin (SuperAdmin):** Quản trị viên vận hành nền tảng OctaPoint, quản lý đối tác (Merchant Tenants), giám sát quỹ Gas Sponsorship (Enoki Treasury), cấu hình gói cước (Subscription Tiers) và theo dõi sức khỏe hệ thống.
2. **Merchant (Tenant Admin):** Doanh nghiệp sử dụng dịch vụ CaaS (chuỗi F&B, siêu thị, khu vui chơi), thực hiện cấu hình quy tắc tích/đổi điểm (Dynamic Loyalty Rules), tạo chiến dịch khuyến mãi, quản lý API Keys và đối soát lịch sử giao dịch.
3. **End-User (Customer / POS Client):** Khách hàng cuối hoặc máy POS tại cửa hàng thực hiện đăng nhập không ví (Walletless Login), tích điểm (Earn), đổi điểm (Redeem) và tra cứu số dư thông qua ứng dụng tích hợp SDK.
4. **AI Agent (MCP Client):** Trợ lý AI hoặc Chatbot chăm sóc khách hàng kết nối qua giao thức OctaPoint MCP Server để tra cứu số dư, kiểm tra lịch sử giao dịch và kích hoạt tặng điểm tự động theo ngữ cảnh.

## 2. Danh sách 20 Use Cases & Phân công 5 Thành viên (Mục III.2.2 & III.3 SRS)

### Phân hệ 1: Core Auth, Blockchain Config & Walletless Session (Thành viên 1 - Leader phụ trách)
- **UC-01: Sign in with Walletless zkLogin / OAuth** (Actors: System Admin, Merchant, End-User) - Đăng nhập hệ thống qua Google OAuth và tự động ánh xạ địa chỉ ví Sui ngầm định.
- **UC-02: Manage Profile & Security Settings** (Actors: Authenticated User) - Xem, cập nhật hồ sơ cá nhân và cấu hình bảo mật tài khoản.
- **UC-03: Configure Sui Smart Contract & Gas Sponsorship Policy** (Actors: System Admin) - Cấu hình Package ID của Move Smart Contract và hạn mức tài trợ phí gas tối đa cho mỗi giao dịch.
- **UC-04: Verify On-Chain Credit Object State** (Actors: System Admin, Merchant) - Kiểm tra và xác thực trạng thái Object điểm thưởng trực tiếp trên mạng Sui Testnet thông qua Transaction Digest.

### Phân hệ 2: Merchant Onboarding & Dynamic Rule Engine (Thành viên 2 phụ trách)
- **UC-05: Register & Onboard Merchant Tenant** (Actors: Merchant) - Đăng ký tài khoản doanh nghiệp (Tenant), khai báo tên thương hiệu, đơn vị điểm thưởng (Point Symbol) và lĩnh vực kinh doanh.
- **UC-06: Manage API Keys & HMAC Secrets** (Actors: Merchant) - Tạo mới, xem danh sách, xoay vòng (rotate) hoặc thu hồi cặp `api_key` và `hmac_secret` để tích hợp SDK.
- **UC-07: Configure Dynamic Earn & Redeem Rules** (Actors: Merchant) - Thiết lập tỷ lệ quy đổi tiền sang điểm (Earn Ratio), tỷ lệ đổi điểm trừ hóa đơn (Redeem Ratio), số điểm tối thiểu được đổi và thời hạn hết hạn điểm.
- **UC-08: Manage Customer Tiers & Multiplier Campaigns** (Actors: Merchant) - Thiết lập các hạng thành viên (Bronze, Silver, Gold, Diamond) và chiến dịch nhân hệ số điểm thưởng (ví dụ: x2 điểm cuối tuần).

### Phân hệ 3: Credit Transactions, SDK & Audit Reconciliation (Thành viên 3 phụ trách)
- **UC-09: Manage End-User Loyalty Wallets** (Actors: Merchant) - Xem danh sách khách hàng của cửa hàng, tra cứu số dư điểm khả dụng, số điểm đang khóa và khóa/mở khóa ví khách hàng nghi ngờ gian lận.
- **UC-10: Issue Loyalty Credits via SDK/API (Earn Flow)** (Actors: Merchant, End-User) - Cấp điểm thưởng cho khách hàng sau khi thanh toán hóa đơn, kiểm tra chữ ký HMAC-SHA256, áp dụng hệ số nhân và ghi nhận giao dịch lên Sui.
- **UC-11: Redeem Loyalty Credits at POS (Burn/Redeem Flow)** (Actors: Merchant, End-User) - Trừ điểm thưởng của khách hàng để giảm giá hóa đơn tại quầy POS, kiểm tra số dư khả dụng và chống chi tiêu lặp (Double-spending).
- **UC-12: View Transaction History & Export Walrus Audit Logs** (Actors: Merchant) - Tra cứu lịch sử giao dịch điểm, lọc theo trạng thái on-chain, xem mã bằng chứng lưu trữ (Walrus Blob ID) và xuất file Excel đối soát tài chính.

### Phân hệ 4: Admin Control Panel, Tenant Billing & Anti-Fraud (Thành viên 4 phụ trách)
- **UC-13: Approve & Manage Merchant Tenants** (Actors: System Admin) - Duyệt hồ sơ đăng ký Merchant mới, tạm khóa (Suspend) hoặc mở khóa hoạt động của Merchant vi phạm.
- **UC-14: Monitor Enoki Gas Sponsorship Treasury** (Actors: System Admin) - Theo dõi số dư quỹ SUI tài trợ phí gas, nạp thêm hạn mức gas cho từng Merchant và cảnh báo khi quỹ sắp cạn.
- **UC-15: Manage Subscription Plans & Stripe Billing** (Actors: System Admin, Merchant) - Quản lý các gói cước (Starter, Growth, Enterprise), theo dõi hạn mức số lượng giao dịch/tháng và thanh toán hóa đơn qua Stripe.
- **UC-16: Monitor Anti-Fraud Alerts & Rate Limit Logs** (Actors: System Admin) - Xem danh sách các yêu cầu API bị chặn do sai chữ ký HMAC, vượt quá giới hạn tần suất (Rate Limit) hoặc phát hiện cộng điểm bất thường.

### Phân hệ 5: AI-Ready MCP Server & Analytics Dashboard (Thành viên 5 phụ trách)
- **UC-17: Configure MCP Server Permissions & Prompts** (Actors: Merchant) - Cấp quyền cho phép AI Agent truy cập những công cụ (Tools) nào của cửa hàng và thiết lập hạn mức điểm tối đa AI được phép tự động tặng.
- **UC-18: Query Customer Balance & History via MCP Agent** (Actors: AI Agent) - AI Agent tự động gọi tool `get_customer_balance` và `get_transaction_history` để trả lời thắc mắc của khách hàng.
- **UC-19: Trigger Automated Compensation/Bonus via MCP Agent** (Actors: AI Agent) - AI Agent gọi tool `trigger_loyalty_bonus` để tặng điểm đền bù tự động cho khách hàng dựa trên kịch bản được Merchant cho phép.
- **UC-20: View Analytics Dashboard & Redemption Velocity** (Actors: System Admin, Merchant) - Xem biểu đồ thống kê tổng lượng điểm đang lưu hành, tốc độ đổi điểm (Redemption Velocity) và số lượng khách hàng hoạt động.

## 3. Danh sách 20 Business Rules Cốt lõi (Mục III.5.1 SRS)
- **BR-01 (Xác thực Tenant):** Mọi Merchant mới đăng ký đều ở trạng thái `PENDING` và chỉ được phép phát hành API Key hoặc gọi giao dịch điểm sau khi được System Admin phê duyệt sang trạng thái `ACTIVE`.
- **BR-02 (Cách ly đa khách hàng - Multi-tenancy):** Điểm thưởng của khách hàng thuộc về từng Merchant riêng biệt; điểm tích lũy tại Merchant A không thể dùng để đổi thưởng tại Merchant B trừ khi có cấu hình liên minh.
- **BR-03 (Chống phát hành trùng lặp - Idempotency):** Mọi yêu cầu cấp điểm (`ISSUE`) hoặc đổi điểm (`REDEEM`) từ SDK bắt buộc phải kèm theo mã `idempotency_key` (hoặc `order_reference_id`) duy nhất. Nếu trùng mã đã xử lý thành công, hệ thống từ chối tạo giao dịch mới.
- **BR-04 (Xác thực chữ ký HMAC-SHA256):** Mọi lệnh gọi API phát sinh thay đổi số dư từ SDK phải có chữ ký `X-OctaPoint-Signature` hợp lệ được băm từ payload + timestamp bằng `hmac_secret` của Merchant và độ lệch thời gian không quá 5 phút.
- **BR-05 (Quy tắc tính điểm tích lũy - Earn Calculation):** Số điểm cấp mới được tính theo công thức: `Points = floor((OrderAmount / EarnUnit) * BaseEarnRate * TierMultiplier * CampaignMultiplier)`. Kết quả luôn làm tròn xuống số nguyên dương.
- **BR-06 (Điều kiện đổi điểm tối thiểu):** Khách hàng chỉ được phép đổi điểm (`REDEEM`) khi số dư điểm khả dụng (`available_balance`) lớn hơn hoặc bằng mức điểm tối thiểu (`min_redeem_points`) do Merchant cấu hình và không vượt quá số điểm tối đa cho phép trên 1 hóa đơn.
- **BR-07 (Chống âm quỹ & Chi tiêu lặp):** Tại thời điểm đổi điểm, hệ thống phải khóa số dư tạm thời (Lock/Atomic check). Tuyệt đối không cho phép `available_balance` âm dưới bất kỳ hình thức nào.
- **BR-08 (Tự động nâng hạng thành viên):** Sau mỗi giao dịch tích điểm thành công, nếu tổng điểm tích lũy trọn đời (`lifetime_points`) của khách hàng chạm ngưỡng hạng cao hơn (Silver, Gold, Diamond), hệ thống tự động nâng hạng ngay lập tức cho giao dịch tiếp theo.
- **BR-09 (Thời hạn hiệu lực của Chiến dịch nhân điểm):** Một thời điểm chỉ áp dụng tối đa 01 Chiến dịch nhân điểm (`CampaignMultiplier`) có hệ số cao nhất đang trong thời gian hiệu lực (`start_date <= now <= end_date`).
- **BR-10 (Giới hạn hạn mức gói cước - Subscription Quota):** Mỗi Merchant bị giới hạn số lượng giao dịch tối đa mỗi tháng theo gói cước (ví dụ: Starter = 10,000 tx/tháng). Nếu vượt ngưỡng và chưa nâng cấp gói, các lệnh cấp điểm mới sẽ bị chặn.
- **BR-11 (Kiểm soát quỹ tài trợ phí Gas - Enoki Gas Cap):** Giao dịch on-chain chỉ được tài trợ phí gas (Sponsored Transaction) khi quỹ `gas_budget_balance` của Merchant còn lớn hơn `0.05 SUI`. Nếu cạn quỹ, hệ thống ghi nhận trạng thái `QUEUED_FOR_GAS` và cảnh báo Admin/Merchant.
- **BR-12 (Bất biến đối soát On-chain):** Mọi giao dịch điểm sau khi thực thi trên Sui Testnet phải lưu lại `sui_tx_digest` và `sui_object_id` vào cơ sở dữ liệu; không bất kỳ Actor nào (kể cả SuperAdmin) được phép xóa (`Hard Delete`) bản ghi giao dịch đã lên chuỗi.
- **BR-13 (Giới hạn thẩm quyền của AI Agent qua MCP):** AI Agent kết nối qua MCP Server chỉ được phép tặng điểm tự động (`MCP_BONUS`) khi số điểm trong 1 lần gọi không vượt quá `max_ai_bonus_per_tx` (mặc định 500 điểm) và tối đa 1 lần/ngày cho mỗi khách hàng.
- **BR-14 (Khóa tự động khi phát hiện bất thường - Anti-Fraud):** Nếu một ví khách hàng phát sinh quá 10 giao dịch tích điểm trong vòng 60 giây hoặc tổng điểm nhận bất thường vượt ngưỡng `fraud_threshold`, hệ thống tự động chuyển ví sang trạng thái `FROZEN` và chặn đổi điểm.
- **BR-15 (Quy tắc thu hồi API Key):** Khi Merchant thu hồi (`REVOKE`) một API Key, khóa đó ngay lập tức mất hiệu lực trên toàn bộ API Gateway và MCP Server mà không làm ảnh hưởng đến dữ liệu giao dịch cũ.
- **BR-16 (Quy tắc hết hạn điểm thưởng):** Điểm thưởng không sử dụng sau khoảng thời gian `expiration_days` (tính từ ngày phát hành) sẽ tự động chuyển sang trạng thái `EXPIRED` qua tiến trình chạy ngầm hàng ngày (Cron Job).
- **BR-17 (Quy tắc hoàn trả giao dịch - Refund/Clawback):** Khi đơn hàng bị hủy tại POS, Merchant có thể gọi lệnh thu hồi điểm đã cấp; nếu khách hàng đã tiêu hết số điểm đó, tài khoản khách hàng sẽ bị ghi nhận nợ điểm (`locked_debt`) và trừ vào lần tích điểm tiếp theo.
- **BR-18 (Đồng bộ bằng chứng kiểm toán Walrus):** Kết thúc mỗi chu kỳ đối soát hoặc mỗi lô giao dịch, bản băm dữ liệu giao dịch (`audit_payload_hash`) phải được gắn mã định danh lưu trữ bất biến (`walrus_blob_id`) để phục vụ kiểm toán độc lập.
- **BR-19 (Phân quyền truy cập RBAC):** Tài khoản có vai trò `MERCHANT` chỉ được xem và thao tác trên dữ liệu thuộc `tenant_id` của chính mình; mọi truy cập chéo sang `tenant_id` khác đều trả về lỗi `403 Forbidden`.
- **BR-20 (Ràng buộc kích thước và định dạng dữ liệu xuất/nhập):** Tất cả báo cáo đối soát xuất ra từ hệ thống phải ở định dạng `.xlsx` hoặc `.csv` chuẩn hóa, bao gồm đầy đủ mã giao dịch nội bộ, mã `sui_tx_digest` và dấu thời gian chuẩn UTC.