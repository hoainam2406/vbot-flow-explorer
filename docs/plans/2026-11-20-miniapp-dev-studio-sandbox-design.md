# Thiết kế Mini App Dev Studio & Sandbox Tương tác (Hướng 3)

**Ngày:** 2026-11-20  
**Mục tiêu:** Cung cấp cổng tự phục vụ (self-serve Developer Portal + Interactive Sandbox) ngay trong `MiniAppBridgeModal` (nội bộ / `tech` mode) để đội làm Mini App tự tra cứu hợp đồng 2 chiều (*Host truyền vào ↔ Host nhận lên*), lấy starter code `@vbotma/sdk`, mô phỏng gọi lệnh trên Virtual Host iOS/Android và test trực tiếp Mini App chạy trên `localhost` thông qua Embedded Iframe Bridge.

---

## 1. Kiến trúc tổng thể (5 thành phần)

1. **`src/core/miniAppContractBuilder.ts` (Contract Registry & Codegen)**
   - Sinh hợp đồng 2 chiều chuẩn hóa (`MiniAppContract`) cho toàn bộ 41 Mini App trong `MINI_APP_CATALOG` (kết hợp `CORE_BRIDGE_SPECS`, `BRIDGE_PARITY_ALERTS` và `MINI_APP_PERMISSION_PROFILES`).
   - Định nghĩa đầy đủ:
     - **Host → Mini App**: URL Hash Launch Params (`#vbma_data`, `vbma_theme`, `vbma_api_base_url`, `vbma_extra_data`), danh sách Host Push Events (`theme_changed`, `filter_changed`, `refresh_data`, `autodial_finished`, `autodial_error`, `monitor_call_state_changed`, `user_contacts_updated`, `setup_2fa`, `mini_app_closed`, `mini_app_error`) kèm payload mẫu.
     - **Mini App → Host**: Danh sách lệnh SDK / Host Actions được app sử dụng hoặc hỗ trợ, phân loại clearly giữa `isHostAction` (chạy qua `sendCustomAction` / `VbMABridge.post` / `webkit.messageHandlers.vbma.postMessage`) và Core SDK events, kèm `requestSchema`, `validExample`, `invalidExample`, `responseOk`, `responseError`, và ghi chú parity iOS/Android.
     - **Codegen**: Sinh snippet TypeScript `@vbotma/sdk` cho từng lệnh (`buildCommandSdkSnippet`), file Starter Code đầy đủ vòng đời cho từng app (`buildStarterSdkCode`), và tài liệu Markdown tích hợp (`exportAppIntegrationMarkdown`).

2. **`src/core/miniAppSandboxEngine.ts` (Virtual Host State Machine)**
   - Quản lý trạng thái giả lập có trí nhớ (`SandboxHostState`) và cấu hình môi trường (`SandboxHostConfig`):
     - Nền tảng (`ios` | `android`), Role Preset (`admin`, `member_full`, `member_sales`, `member_supervisor`, `member_minimal`), Theme (`dark` | `light`), Fault Injection (`none`, `token_401_refresh_ok`, `token_401_refresh_fail`, `rbac_denied`, `android_hotline_picker`, `autodial_busy`, `contacts_limited_ios`, `ios_toast_unsupported`, `timeout_5000ms`).
     - Mô phỏng trung thực các hành vi đặc thù của VBot Host:
       - Autodial state machine (`idle` → `running` → `paused` → `stopped`) và validate input (`phones`, `hotline`, `delay`).
       - `make_call` trên Android khi thiếu `hotline` hoặc bật fault `android_hotline_picker` sẽ treo ở `pending` để hiển thị `ChooseHotlineCallBottomSheet` và resolve khi người dùng chọn hoặc huỷ (`USER_CANCELLED`).
       - `monitor_call` trên iOS phát thêm event `monitor_call_state_changed` về JS; Android chỉ cập nhật native PiP UI.
       - `show_toast` hoạt động trên Android, trả cảnh báo parity `UNSUPPORTED_ON_IOS` trên iOS.
       - `host_fetch` chặn header `Authorization` giả mạo từ JS và tự gắn token thật ở Native.
       - `check_permissions` chấm điểm RBAC 2 tầng dựa trên `evaluateActionGrant`.
       - `request_module_token` xử lý luồng `401` refresh thành công hoặc lỗi kích hoạt `sessionLogoutTriggered` một lần trên Android.
       - `user_contact_*` phân biệt trạng thái `limited` trên iOS 18+ vs `hasPromptedReadContacts` trên Android.
     - Xây dựng URL Hash Launch Params thực tế (bao gồm hành vi Android `CallHistoryFragment` không đính kèm `theme_params` cho `vb-ma-user-history-call`).
     - Kiểm tra an toàn URL iframe (`validateIframeDevUrl` chỉ cho phép `http://localhost`, `127.0.0.1`, `[::1]`, `*.local` và HTTPS, chặn scheme nguy hiểm) + sinh 1-click Dev Bridge Shim (`buildDevBridgeShimSnippet`) + parse message từ iframe qua `window.postMessage` (`parseIncomingIframeMessage`).

3. **`src/components/MiniAppPhonePreview.vue` (Mock Phone UI & Localhost Iframe)**
   - Hai chế độ xem song song trong khung điện thoại iOS/Android:
     - **Mock UI (Sẵn):** Header native (nút expand/close tôn trọng `closingConfirmation` với modal xác nhận đóng), Banner cuộc gọi / Autodial đang chạy, Toast Android, Sheet chọn hotline Android, Sheet Child Mini App khi gọi `open_mini_app`, thẻ Launch Params nhận khi mở app, Push Event gần nhất và các nút thao tác mẫu theo từng app.
     - **Iframe Localhost:** Nhập URL dev server (`http://localhost:5173`), gắn tự động `#vbma_data=...`, cung cấp nút copy **Dev Bridge Shim JS** (dán vào `index.html` lúc dev để chặn `VbMABridge` / `webkit.messageHandlers.vbma` chuyển tiếp qua `window.parent.postMessage`), và xác thực `event.source === iframeRef.value?.contentWindow` cho kênh 2 chiều.

4. **`src/components/MiniAppDevStudio.vue` (Giao diện Studio 3 cột)**
   - Bộ chọn 41 Mini App chia nhóm theo category + Quick Action bar (`Copy link gửi Dev`, `Copy Starter Code (.ts)`, `Tải Spec App (.md)`).
   - Chế độ **Mô phỏng Tương tác (Sandbox)**:
     - **Host Environment Bar**: chọn `iOS` / `Android`, Role Preset, Fault Injection, Theme, `Reset Host`.
     - **Cột trái (Composer & Push Events)**: chọn lệnh, nạp `Mẫu chuẩn` / `Mẫu lỗi`, chỉnh JSON trực tiếp với validate tức thì, bấm `▶ Gửi lên Host`, và dải nút bắn **Host Push Events** xuống Mini App.
     - **Cột giữa (Live Wire Console + 3-tab Frame Inspector)**: theo dõi luồng `JS → Native → JS` theo thời gian thực; kiểm tra `Response & Wire JSON` (với `JsonCodeBlock`), `Code @vbotma/sdk`, và `Host Native iOS/Android` kèm cảnh báo parity.
     - **Cột phải**: `MiniAppPhonePreview.vue`.
   - Chế độ **Hợp đồng 2 Chiều & Starter Code**:
     - Bảng đối xứng **Host → Mini App (Truyền vào)** vs **Mini App → Host (Gửi lên)** với nút `▶ Bắn thử` / `▶ Thử lệnh này` nhảy ngay sang Sandbox, cùng Starter Code `@vbotma/sdk` và `manifest.json` `permissions`.

5. **Tích hợp `MiniAppBridgeModal.vue` & Deep-link `App.vue`**
   - Thêm tab đầu tiên `sandbox` (`Dev Studio · Mô phỏng`) trong `MiniAppBridgeModal.vue`, mặc định mở khi không truyền `initialContext.tab`.
   - Hỗ trợ deep-link trực tiếp: `#/?mode=tech&bridge=sandbox&app=<appId>` (chỉ biên dịch trong `BUILD_TARGET=internal` qua `__ENABLE_TECH_MODE__` để đảm bảo **OWASP A01** giữ sạch 100% `dist-public/`).
   - Trên tab Catalog có nút `Mở Dev Studio` mở thẳng app tương ứng vào Studio.

---

## 2. Đảm bảo chất lượng & Ràng buộc

- **Cô lập Public Build (OWASP A01):** `miniAppContractBuilder.ts`, `miniAppSandboxEngine.ts`, `MiniAppDevStudio.vue`, và `MiniAppPhonePreview.vue` chỉ được import bên trong `MiniAppBridgeModal.vue` (đã lazy-load sau guard `__ENABLE_TECH_MODE__` trong `App.vue`), nên tree-shaking loại bỏ hoàn toàn khỏi `dist-public/`.
- **Kiểm thử tự động:** `tests/miniAppDevStudio.test.ts` kiểm chứng hợp đồng toàn bộ 41 app, launch params parity, iframe URL validation, incoming message parsing, state machine Autodial, Android hotline picker + `USER_CANCELLED`, RBAC, token 401 refresh/logout, iOS/Android parity và Host Push Events.
