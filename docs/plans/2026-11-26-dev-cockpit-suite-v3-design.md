# VBot Flow Explorer — Dev Cockpit Suite (v3) Design

> **Ngày:** 2026-11-26  
> **Trạng thái:** Đã duyệt bởi User  
> **Mục tiêu:** Biến `vbot-flow-explorer` thành trạm làm việc kỹ thuật hằng ngày cho Dev (`VBot-iOS`, `VBot-Android`, Mini App Bridge, đa nhánh `Nam-dev` / `Nam-dev-SBSI`) và dọn gọn điều hướng ưu tiên Dev (`Dev Tools`).

---

## 1. Kiến trúc tổng thể & Dọn gọn TopBar

- **TopBar Dev-First:**
  - Chuyển nút `QA & Quản trị` thành **`Dev Tools`** (mở `GovernanceHubModal` với tab mặc định `atlas`).
  - Thứ tự tab trong `Dev Tools`: **API & Event Atlas** · **Log Tracer** · **Branch & Snapshot Diff** · **Sức khỏe Dữ liệu** · **QA Hub** (tab phụ cuối, giữ nguyên khả năng tương thích URL `?view=governance&gtab=qa`).
  - Hiển thị **Live Git Status** pill (chỉ ở local dev khi đã cấu hình repo local): báo nhánh đang checkout của `VBot-iOS` & `VBot-Android`, cảnh báo lệch nhánh và số file dirty (click để tô sáng node ảnh hưởng trên canvas hoặc copy Multi-Node AI Prompt).
- **Cách ly bản Public (OWASP A01):**
  - Toàn bộ UI, engine và client mới chỉ kích hoạt khi `__ENABLE_TECH_MODE__ === true` qua `defineAsyncComponent` / dynamic `import()`.
  - Bảo vệ thêm trong `PUBLIC_LEAK_FORBIDDEN_TOKENS` (`__vbot-dev/source/read`, `__vbot-dev/git/status`, `SourcePeekModal`, `ApiAtlasPanel`, `LogTracerPanel`).

---

## 2. Chi tiết 3 Wave triển khai

### Wave 1 — Local Source Peek (Swift ↔ Kotlin), Live Git Status & AI Port Prompt v2
1. **Local Dev Middleware (`plugins/devWorkspaceMiddleware.ts`):**
   - `POST /__vbot-dev/source/read`: Đọc file nguồn từ `localIosRepoPath` / `localAndroidRepoPath`.
     - Bảo mật: chuẩn hóa root và target bằng `fs.realpathSync()` và khóa chặt `realTarget.startsWith(realRoot + path.sep)` chống symlink & path traversal; chặn file nhị phân; giới hạn 300 KB / 4.000 dòng.
     - Hỗ trợ tìm `symbolQuery` (trả về `matchedLines`, `primaryLine`) và `includeGitDiff` (`git diff HEAD -- <file>` via `execFileSync`).
   - `POST /__vbot-dev/git/status`: Đọc nhánh hiện tại và danh sách file dirty của cả `VBot-iOS` và `VBot-Android`.
2. **Inline Source Peek (`src/core/sourcePeekClient.ts`, `src/components/SourcePeekModal.vue`):**
   - Mở từ nút xem nhanh ở từng `codeRef` trong `TechDetailPanel.vue` hoặc nút **"So sánh Code iOS ↔ Android"** ở `DetailDrawer` / `ParityMatrixModal`.
   - Hỗ trợ chế độ **Split View Swift ↔ Kotlin**, tìm symbol trong file, tab `Git Diff`, tô màu cú pháp nhẹ (`highlightCodeLine`) và mở thẳng `file:line` trong IDE (`buildIdeFileUrl` hỗ trợ `:line`).
3. **AI Prompt Engine v2 (`src/core/aiContextExport.ts`):**
   - `buildParityPortPrompt()`: tạo prompt đồng bộ code `iOS → Android` / `Android → iOS` (có tùy chọn nhúng code/diff thật từ repo local).
   - `buildMultiNodeAiContextPrompt()`: đóng gói nhiều node (từ Working Pins hoặc dirty git files) thành 1 prompt duy nhất.

### Wave 2 — Branch Diff trực tiếp trên Canvas & Debug Log-to-Flow Tracer
1. **Branch Diff Overlay (`Nam-dev` ↔ `Nam-dev-SBSI`):**
   - Trong `TopBar.vue` (dropdown nhánh) và `FlowSnapshotDiffPanel.vue`, bổ sung nút 1-click so sánh trực tiếp với nhánh khác qua `loadBranchDataset()` từ `virtual:flow-branches`.
   - Hỗ trợ toggle **"Chỉ hiện node thay đổi"** và đếm `+N mới · ~M sửa` trên `CanvasFilterBar.vue`.
2. **Debug Log-to-Flow Tracer (`src/core/logTracerEngine.ts`, `src/components/LogTracerPanel.vue`):**
   - Dán log Xcode / Logcat / SIP / WebSocket / Bridge → parser khớp 4 tầng (`code_ref`, `api_event`, `bridge_method`, `error_code`) → tạo timeline, tô **Trace Overlay** (`#1`, `#2`, badge lỗi) trên `FlowCanvas.vue` và xuất **AI Debug Prompt**.

### Wave 3 — API/WS/SIP Atlas, Mini App Studio Power Tools & Working Pins
1. **API, WebSocket, SIP & Error-Code Atlas (`src/core/apiAtlasEngine.ts`, `src/components/ApiAtlasPanel.vue`):**
   - Gom và phân loại toàn bộ `REST API`, `WebSocket`, `SIP / DTMF`, `Bridge`, `Error Code`, tự động gắn cờ mục lệch giữa iOS ↔ Android.
2. **Mini App Studio Power Tools (`src/core/miniAppDevPresets.ts`, `MiniAppDevStudio.vue`, `MiniAppPhonePreview.vue`):**
   - **Bridge Breakpoint / Interceptor:** tạm dừng lệnh `miniapp_to_host`, cho phép sửa payload trước khi chạy hoặc giả lập response/lỗi trả về ngay lập tức.
   - **Record-to-Mock 1-click:** chuyển thẳng wire frame `host_fetch` (kể cả từ Staging Proxy) thành `HostFetchMockRule`.
   - **Local Dev URL Presets:** lưu nhanh URL localhost theo từng `vb-ma-*`.
3. **Working Pins & Personal Dev Notes (`src/core/devWorkspacePins.ts`):**
   - Ghim node đang làm, ghi chú kỹ thuật cá nhân (`localStorage`), truy cập nhanh từ `CanvasFilterBar.vue`, `DetailDrawer.vue` và `Cmd+K`.

---

## 3. Kiểm thử bắt buộc
1. `pnpm validate:data`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm audit:sync --ci`
5. `pnpm build:public && pnpm check:public-leak` (`CLEAN_PUBLIC_BUNDLE`)
6. `pnpm build:internal`
