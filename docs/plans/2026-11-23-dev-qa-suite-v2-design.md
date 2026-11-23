# VBot Flow Explorer — Dev & QA Productivity Suite v2 Design

> **Ngày:** 2026-11-23  
> **Trạng thái:** Đã duyệt bởi User (Phương án A — Hybrid 3 Wave: Pure-Core Services + Modular Local Dev Middleware)

---

## 1. Mục tiêu & Phạm vi

Mở rộng `vbot-flow-explorer` thêm **8 nhóm tính năng** phục vụ hằng ngày cho 3 nhóm người dùng (**không** chỉnh sửa phần tạo task VBot Work hiện có):

1. **Wave 1 — Dev Mini App (`#1`, `#2`, `#3`):**
   - Xuất Typed Contract (`vbot-contract.<appId>.ts`) & Unit Test Mock (`vbot-mock-host.<appId>.ts`) sinh tự động từ `MiniAppContract`, đồng thời vá cảnh báo `toggle_actions_menu` trong `audit:sync`.
   - Mock Rules (`localStorage`) + Local Staging Proxy (`/__vbot-dev/host-fetch-proxy`) cho lệnh `host_fetch` trong Mini App Studio & Live Iframe.
   - So sánh 2 phiên Wire Log (`miniAppWireDiff`) kèm đối chiếu nhanh iOS vs Android.
2. **Wave 2 — Dev Mobile (`#4`, `#5`):**
   - Phân tích ảnh hưởng PR từ danh sách file sửa (`parseChangedFileList` / `analyzePrImpact`) và quét Code Drift đối chiếu `codeRefs` + `git log` từ repo local iOS/Android (`/__vbot-dev/git/inspect`).
   - Đóng gói ngữ cảnh AI 1-click (**Copy AI Prompt**) cho Node, Parity Item và Mini App.
3. **Wave 3 — QA / BA Quản trị Luồng (`#6`, `#7`, `#8`):**
   - Nâng cấp Visual Editor: sửa/xóa Edge trực tiếp trên canvas, form `Parity & Bridge` trong `NodeEditorPanel`, Visual Scenario Editor chọn bước trên canvas (`update_edge`, `upsert_scenario`, `delete_scenario`), Xem Diff & Nhập Patch JSON trên `DraftBanner`.
   - Không gian hợp nhất **QA & Quản trị Hub** (`GovernanceHubModal.vue`):
     - **QA Release Hub:** Quản lý đợt test theo phiên bản, tiến độ Pass/Fail/Blocked iOS & Android toàn app, Export/Import/Merge JSON giữa nhiều QA và xuất Báo cáo Sign-off Markdown.
     - **Sức khỏe Dữ liệu & Media:** Bảng `DataHealth` theo module, kéo-thả upload & nén `.webp` lưu thẳng vào `public/media/` qua local middleware (`/__vbot-dev/media/upload`) hoặc tải về trên web tĩnh.
     - **So sánh Phiên bản Luồng (Flow Snapshot Diff):** Lưu/nhập snapshot JSON hoặc chọn commit git cũ (`/__vbot-dev/git/dataset-snapshot`), tô lớp phủ `MỚI` / `ĐÃ SỬA` trên sơ đồ và xuất Changelog.

---

## 2. Ràng buộc kiến trúc & Bảo mật

1. **Cách ly tuyệt đối bản Public (OWASP A01):**
   - Toàn bộ UI và service mới chỉ kích hoạt khi `__ENABLE_TECH_MODE__ === true`, nạp qua `defineAsyncComponent` hoặc dynamic `import()`.
   - Kiểm tra sau mỗi Wave bằng `pnpm build:public && pnpm check:public-leak`.
2. **Kiến trúc Hybrid tĩnh + Local Dev (`plugins/devWorkspaceMiddleware.ts`):**
   - Trên GitHub Pages tĩnh: 100% tính năng lõi hoạt động qua `localStorage`, Canvas API và import/export file.
   - Khi chạy `pnpm dev` (`BUILD_TARGET=internal`): tự bật thêm Proxy Staging, đọc `git` repo local, lấy dataset từ commit cũ và lưu ảnh `.webp` vào `public/media/`.
3. **Biên bảo mật Local Middleware:**
   - **Proxy `host-fetch-proxy`:** Kiểm tra URL qua allowlist (`*.vbot.vn`, `*.vpmedia.vn` và origin dev khai báo tường minh), chặn IP nội bộ/metadata (`169.254.*`, `10.*`, `172.16–31.*`, `192.168.*`), tự strip `Authorization` & `Cookie`, giới hạn body ≤ 2MB, timeout 15s.
   - **Git inspect & snapshot:** Dùng `execFileSync('git', args)` (tuyệt đối không qua shell), kiểm tra `validateGitRef()` chặn flag injection (`-`, `..`, `@{`, whitespace).
   - **Media upload:** Khóa chặt đường dẫn đích bên trong `public/media/` (chống path traversal), chỉ cho phép `.webp`, `.png`, `.jpg`, `.jpeg`, `.mp4`, `.webm`, giới hạn ≤ 10MB, ghi atomic.

---

## 3. Chiến lược kiểm thử

Mỗi Wave kết thúc bằng bộ kiểm tra bắt buộc:
1. `pnpm validate:data`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm audit:sync --ci` (đạt 0 errors, 0 warnings)
5. `pnpm build:public && pnpm check:public-leak` (`CLEAN_PUBLIC_BUNDLE`)
6. `pnpm build:internal`
