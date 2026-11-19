# Thiết kế Mở rộng: Hỗ trợ Android & Chế độ So sánh `iOS ↔ Android`

**Ngày:** 2026-11-19  
**Nhánh:** `feat/flow-explorer-mvp`  
**Trạng thái:** Đã được phê duyệt

---

## 1. Mục tiêu & Nguyên tắc kiến trúc
1. **1 Xương sống nghiệp vụ chung (~85% dùng chung) + Tầng Kỹ thuật phân tách/đối chiếu theo nền tảng:**
   - Chế độ **`Tổng quan`** (và toàn bộ bundle `dist-public/`): giữ 1 sơ đồ nghiệp vụ trung lập duy nhất, không chứa bộ chuyển nền tảng hay dữ liệu kỹ thuật Android/iOS.
   - Chế độ **`Kỹ thuật`**: bổ sung bộ gạt 3 trạng thái **`iOS` | `Android` | `So sánh`** ngay cạnh nút chuyển chế độ trên `TopBar` (qua [`TechPlatformSwitcher.vue`](../../src/components/TechPlatformSwitcher.vue), nạp động chỉ khi `__ENABLE_TECH_MODE__ === true`), đồng bộ tham số URL `#/?mode=tech&platform=ios|android|compare`.
2. **Hiển thị trực quan trên Canvas:**
   - Chọn `iOS`: chỉ hiện bước/cạnh dùng chung + bước `platforms: ['ios']`, tự động nối cầu bỏ qua bước `android`-only.
   - Chọn `Android`: chỉ hiện bước/cạnh dùng chung + bước `platforms: ['android']`, tự động nối cầu bỏ qua bước `ios`-only.
   - Chọn `So sánh`: hiển thị đồng thời cả 2 nhánh tách (gắn badge **`iOS`** màu tối / **`Android`** màu xanh lá) và gắn badge **`iOS ≠ Android`** cho các bước dùng chung có khác biệt xử lý.
3. **Side Drawer đối chiếu 2 cột (`DetailDrawer.vue` + `TechDetailPanel.vue`):**
   - Trong chế độ `So sánh`, Drawer mở rộng mượt (`lg:w-[680px] xl:w-[740px]`), trình bày song song **2 cột `iOS (Swift)` | `Android (Kotlin/Java)`** cho:
     - Chi tiết xử lý kỹ thuật (`byPlatform.ios.summary` ↔ `byPlatform.android.summary`) + cảnh báo `platformDiffNote`.
     - Giao tiếp Host ↔ Mini App: phần chung nằm full-width (`Mini App fn`, JSON ví dụ `examplePayload`/`exampleResponse`), phần Host chia 2 cột (`Hàm Host iOS (Swift)` ↔ `Hàm Host Android (Kotlin/Java)`) kèm thẻ **`parityNote`** nếu có lệch parity.
     - APIs / Events, Edge Cases, Code Refs chia 2 cột `iOS` | `Android`.

---

## 2. Mở rộng Schema ([src/data/schema.ts](../../src/data/schema.ts))
- `PlatformSchema`: `z.enum(['ios', 'android'])` và `PlatformViewMode = 'ios' | 'android' | 'compare'`.
- `PlatformTechDetailSchema`: `{ summary?, transport?, inputs?, outputs?, apisOrEvents?, edgeCases?, codeRefs? }`.
- `FlowNodeDataSchema`, `FlowEdgeDataSchema`, `ScenarioSchema`: bổ sung `platforms?: Platform[]` (không khai báo = hiện ở cả 2 nền tảng).
- `TechDetailSchema`: bổ sung `platformDiffNote?: string` và `byPlatform?: { ios?: PlatformTechDetail, android?: PlatformTechDetail }`.
- `MiniAppBridgeSchema`: bổ sung `transportByPlatform?: { ios?: string, android?: string }`.
- `BridgeMessageSchema`: bổ sung `hostFnByPlatform?: { ios?: string, android?: string }` và `parityNote?: string`.

---

## 3. Khác biệt cốt lõi & Parity Gaps (Đã xác minh trực tiếp từ `VBot-Android` & `vb-ma-android-sdk`)
1. **Lõi VoIP & Cuộc gọi đến:** iOS dùng `Linphone` + `PushKit` + `CallKit` (`retry -1005`), còn Android dùng **`PJSIP (vbotphonesdk)`** (`LinphoneManager` đã comment 100%) + **`FCM data type=3` + `Notification.CallStyle` / `FullScreenIntent` (`NewCallActivity`) + `Foreground CallService` (`phoneCall|microphone`)**. Trên Android, SQLite danh bạ cục bộ được tra ngay trong `FirebaseService` nên ưu tiên cao hơn Push `Name`.
2. **Bảo toàn tên khi gọi đi:** iOS dùng `suppliedCallerName` cho Mini App, Danh bạ & Autodial; Android dùng `CallModel.miniAppDisplayName` **chỉ cho Mini App & Autodial** (từ Danh bạ/Dialpad vẫn có thể bị `getInfoCall2`/CRM ghi đè).
3. **Chuyển tiếp cuộc gọi (Blind Transfer):** iOS ưu tiên HTTP FreeSWITCH `bgapi` (5s) rồi fallback DTMF `#1`; **Android không có HTTP `bgapi`**, gửi thẳng DTMF `#1` (`300ms` delay).
4. **Điều khiển trong gọi & SIP Code:** **Android không hỗ trợ Hold** (`VBotCall.toggleHold()` rỗng), dùng OS native PiP (`2:3`, `CallBubbleService` đã comment 100%), và có luồng **SIP Code Notification** (`SipCodeRepository` → `InAppTopIndicatorHelper` Top Capsule foreground / `SipCallResultNotificationHelper` notification background).
5. **Global Mini App Bridge (`VbMABridge` vs `WKScriptMessageHandler`):**
   - Android dùng `@JavascriptInterface VbMABridge.post()`, `VbMaSDK.activeBridge` toàn cục (không có `MiniAppActiveTracker` theo `appId`), **không prewarm MiniAppToken**, chưa có endpoint `refreshTokenMiniApp`.
   - **`make_call`:** `MiniAppHelper.onRequestCall` luôn trả `success: true` sau 200ms kể cả khi mở sheet chọn Hotline.
   - **`monitor_call_state_changed`:** SDK Android có hàm `sendMonitorCallStateChanged()` nhưng **chưa từng được gọi** trong `VBot-Android`.
   - **Call History (`vb-ma-user-history-call`):** `CallHistoryFragment` không truyền `theme_params`, không emit `theme_changed`, và không có player phát ghi âm native như iOS (`PlayerManager`).
   - **Danh bạ (`vb-ma-user-contact`):** Android dùng `UserContactDatabaseHelper` (`SQLiteOpenHelper` v2, PK `(local_key, uid)`), xin quyền gom nhóm `ActivityResultContracts.RequestPermission`, và chống vòng lặp `user_contacts_updated` bằng chữ ký **`computeContactsSignature` (`lastDeliveredSignature`)** thay cho cờ `userInfo["source"] = "miniapp_bridge"` như iOS.
   - **Contact Forward (`vb-ma-contact-forward`):** Nút `+` trên Android chỉ hiện cho Admin (`UtilsKotlin.checkAdmin()`), trong khi iOS cho phép Admin hoặc quyền `CRM:CREATE`.
   - **Cài đặt 2FA (`vb-ma-2fa-setting`):** Entry row trên UI ở cả iOS và Android hiện đều đang comment out, nhưng socket `SETUP_2FA` đã đấu nối sẵn.
   - **Ngôn ngữ, Cập nhật & Telemetry:** Android hỗ trợ 3 ngôn ngữ (`vi/en/my`), kiểm tra version qua `GET api/config/versionStateNew?platform=VersionAndroid` (`CheckForUpdateActivity` Play In-App đã comment), và Telemetry dùng OpenTelemetry SDK + Firebase Remote Config.

---

## 4. Cô lập Public Build & Kiểm thử
- Mọi trường `platforms`, `byPlatform`, `platformDiffNote`, `hostFnByPlatform`, `parityNote` đều nằm ngoài bản `overview` và bị `sanitizeForPublic` / `flowDataPlugin` loại bỏ hoàn toàn.
- `TechPlatformSwitcher.vue` và `TechDetailPanel.vue` chỉ được import động sau cờ biên dịch `__ENABLE_TECH_MODE__`, đảm bảo `dist-public/` đạt `CLEAN_PUBLIC_BUNDLE`.
