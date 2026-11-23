# Thiết kế: Phân tích bản chất chênh lệch 4 mức & Trang Chênh lệch toàn màn hình

**Ngày:** 2026-11-23
**Phạm vi:** `vbot-flow-explorer` (Internal Build only cho UI; Public bundle giữ sạch hoàn toàn)

## 1. Mục tiêu
- Làm rõ bản chất từng mục trong tổng số **125 mục** chênh lệch iOS ↔ Android để biết chính xác mục nào **chỉ khác đặc thù OS/ngôn ngữ (Swift vs Kotlin — cùng logic & kết quả, không cần sửa)** và mục nào **lệch logic / UX / kết quả hoặc lỗi thật (cần cân nhắc hoặc sửa ngay)**.
- Giữ nguyên tổng **125 mục** trên thanh công cụ (Phương án A) và bổ sung bộ lọc theo mức độ ảnh hưởng + giải thích trực tiếp từng mục.
- Chuyển Bảng chênh lệch từ dialog hẹp sang **trang toàn màn hình (Master–Detail 2 cột)** để đọc đối chiếu rộng rãi hơn.

## 2. Schema `parityAssessment` (4 mức đánh giá)
Thêm vào `TechDetailSchema` trong `src/data/schema.ts`:
- `verdict`: `'action_needed' | 'logic_diff' | 'os_impl_only' | 'synced'`
  - `action_needed` (**Nên sửa — Lỗi / Parity Gap**): Bug hoặc thiếu contract/caller rõ ràng.
  - `logic_diff` (**Khác logic / Kết quả**): Khác luồng UX, API, tính năng đơn nền tảng hoặc đầu ra; cần PO/Tech cân nhắc đồng bộ hoặc chấp nhận.
  - `os_impl_only` (**Chỉ khác OS / Ngôn ngữ**): Khác vì PushKit/CallKit/WKWebView/Keychain/SQLite3 (iOS) vs FCM/CallStyle/@JavascriptInterface/Realm/SQLiteOpenHelper (Android), logic & kết quả cuối tương đương — **không cần sửa**.
  - `synced` (**Đã đồng bộ**): Hai nền tảng đã làm giống nhau, ghi chú chỉ để xác nhận — **không cần sửa**.
- `sameLogic: boolean`
- `sameOutcome: boolean`
- `needsFix: 'yes' | 'consider' | 'no'`
- `explanation: string`
- `recommendation: string`

Gắn đầy đủ cho **125/125 mục** thật trong `data/app.json` & `data/modules/*.json`, kèm fallback suy luận thông minh `resolveParityAssessment()` trong `src/core/parityAnalyzer.ts` cho node tạo mới.

## 3. UI & Export
- **Trang toàn màn hình** (`src/components/ParityMatrixModal.vue`): kích hoạt từ `TopBar.vue` / `TechPlatformSwitcher.vue`, quản lý state song song với Mini App Studio trong `App.vue` (`v-show="!miniAppModalOpen && !parityOpen"` giữ sống `FlowCanvas`, đồng bộ query URL `?view=parity`).
- **4 thẻ thống kê bấm-để-lọc** + chip lọc nhanh *"Chỉ xem mục cần sửa / lệch kết quả"* + bố cục **Master–Detail 2 cột** (cột trái danh sách, cột phải khung Kết luận 3 tiêu chí `Logic / Kết quả / Cần sửa`, giải thích chi tiết, khuyến nghị, ghi chú kỹ thuật, Bridge parity, và so sánh iOS vs Android).
- **Drawer trên sơ đồ** (`TechDetailPanel.vue`): hiển thị hộp kết luận & giải thích ngắn gọn ngay dưới ghi chú `platformDiffNote` khi chọn node.
- **Export & VBot Work**: cập nhật `exportParityReportToMarkdown` và `buildParityTaskMarkdown` để kèm đủ kết luận, giải thích và khuyến nghị.

## 4. Cô lập bảo mật Public (OWASP A01)
- `parityAssessment` nằm trong `techDetail` (đã bị `sanitizeForPublic` cắt khỏi bản Public).
- Bổ sung `'parityAssessment'` vào `PUBLIC_LEAK_FORBIDDEN_TOKENS` trong `src/core/auditSyncEngine.ts` và xác minh bằng `pnpm build:public && pnpm check:public-leak`.
