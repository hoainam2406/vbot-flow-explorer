# VBot Flow Explorer — Static-First Dev Management Suite (v4) Design

> **Ngày:** 2026-11-27  
> **Trạng thái:** Đã duyệt bởi User  
> **Nguyên tắc thiết kế:** 100% Static-First — toàn bộ 5 tính năng quản lý chạy thuần client trên bản deploy GitHub Pages (`dist-internal/`) mà không cần backend hoặc API token trong bundle, đồng thời giữ nguyên tương thích local dev (`pnpm dev`) và cách ly tuyệt đối khỏi bản Public (`BUILD_TARGET=public`).

---

## 5 Tính năng Quản lý Dev

1. **Dev Home Dashboard (`src/core/devDashboardEngine.ts`, `src/components/DevDashboardPanel.vue`):**
   - Tab mặc định đầu tiên của **Dev Tools**: 5 thẻ KPI (Parity `action_needed`, `WIP / Review`, quá hạn kiểm `lastVerifiedAt`, node `Đang làm`, task Workboard đang mở), 3 cột hàng đợi Parity (`iOS` / `Android` / `Cả 2 bên`), danh sách Working Pins + Personal Notes, và nút 1-click **Copy Báo cáo Dev (.md)**.
2. **Bảng Quản lý Node hàng loạt (`src/core/bulkNodeManager.ts`, `src/components/BulkNodeTablePanel.vue`):**
   - Xem toàn bộ node dạng bảng (lọc theo module, status, thiếu ngày kiểm, chưa gắn Task, lệch Parity, chỉ iOS/Android) và cập nhật hàng loạt `status`, `lastVerifiedAt`, `owner`, `workTaskUrl` thành `DraftPatch[]`.
3. **Dev Workboard & Badge Task `VbM-*` (`src/core/devWorkboardStore.ts`, `src/components/DevWorkboardPanel.vue`):**
   - Bảng Kanban cá nhân (`Todo · Đang làm · Review · Xong`) lưu `localStorage`, tự nhập task từ các node đã có `meta.workTaskUrl`, tự trích xuất mã `VbM-xxx`, hiển thị badge `VbM-xxx` trực tiếp trên thẻ node ngoài sơ đồ và nút 1-click đẩy trạng thái `stable` + `workTaskUrl` vào Draft Patch.
4. **Ma trận So sánh Đa nhánh & Release Note (`src/core/branchReleaseSummary.ts`, `src/components/FlowSnapshotDiffPanel.vue`):**
   - Thống kê thay đổi theo từng module giữa 2 nhánh (`Nam-dev` ↔ `Nam-dev-SBSI`), liệt kê API/WS/SIP mới, Parity đã đóng/mới phát sinh, và xuất PR / Release Note Markdown kèm sơ đồ Mermaid.
5. **Sao lưu & Khôi phục Dev Profile (`src/core/devProfileBackup.ts`, `src/components/DevSettingsModal.vue`):**
   - Gom 7 khóa `localStorage` cá nhân (`dev-settings`, `dev-pins`, `dev-workboard`, `parity-triage`, `host-fetch-mocks`, `miniapp-url-presets`, `created-vbot-tasks`) vào 1 file `vbot-dev-profile.json` hỗ trợ chế độ **Merge** hoặc **Replace**.

---

## Bảo mật & Kiểm thử
- **OWASP A01:** Mọi component/store mới chỉ nạp khi `__ENABLE_TECH_MODE__ === true` qua `defineAsyncComponent` / dynamic `import()`. Bổ sung token bảo vệ vào `PUBLIC_LEAK_FORBIDDEN_TOKENS`.
- **Verification Gate:** `pnpm validate:data`, `pnpm typecheck`, `pnpm test`, `pnpm audit:sync --ci`, `pnpm build:public && pnpm check:public-leak`, `pnpm build:internal`.
