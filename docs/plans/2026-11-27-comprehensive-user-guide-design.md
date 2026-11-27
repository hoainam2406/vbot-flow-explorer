# Design Doc: Sổ tay Hướng dẫn Toàn tập & Interactive Spotlight Tour (`2026-11-27`)

## 1. Mục tiêu
Giúp người mới vào web (cả người xem tổng quan ở bản Public lẫn Dev ở bản Internal) có thể:
1. Hiểu nhanh cấu trúc giao diện thông qua **Interactive Spotlight Tour** chiếu trực tiếp lên từng khu vực thật của ứng dụng (`data-tour="..."`).
2. Tra cứu đầy đủ **toàn bộ chức năng của web** trong một **Sổ tay Hướng dẫn Toàn tập** có tìm kiếm không dấu, phân loại theo nhóm, tình huống *"Tôi muốn... thì bấm đâu?"*, cùng nút **"Thử mở ngay →"** đi thẳng vào màn hình/tab tương ứng.
3. Đảm bảo cô lập tuyệt đối theo **OWASP A01**: bản `dist-public/` không chứa bất kỳ chuỗi, module, tab hay thuật ngữ nội bộ nào (`CLEAN_PUBLIC_BUNDLE`).

---

## 2. Kiến trúc 2 tầng (Public vs Internal)

### Tầng dùng chung & Public-safe
- `src/core/appTourEngine.ts`: Các type (`AppTourTrack`, `AppTourStep`, `GuideQuickAction`, `GuideFeatureCategory`, `GuideWorkflowRecipe`), helper lưu trạng thái hoàn thành Tour (`vbot-flow-tour-completed-v1`), hàm chuẩn hóa tìm kiếm tiếng Việt không dấu (`normalizeGuideSearch`) và filter/resolve tour tracks. Không import dữ liệu Internal.
- `src/data/publicGuideData.ts`: Chứa `PUBLIC_TOUR_STEPS` (6 bước), `PUBLIC_FEATURE_CATEGORIES` (2 nhóm tính năng Public), `PUBLIC_WORKFLOW_RECIPES` (5 tình huống), bên cạnh `PUBLIC_GUIDE_STEPS` và `PUBLIC_CONCEPTS`.
- `src/components/AppWalkthroughOverlay.vue`: Spotlight Tour overlay dùng `Teleport to="body"` (`z-[75]`), tự đo vị trí `[data-tour="..."]`, vẽ cutout `box-shadow`, điều hướng bàn phím `← / → / Esc`, fallback thẻ nổi giữa màn hình nếu phần tử đang ẩn.

### Tầng Internal-only (`__ENABLE_TECH_MODE__` dynamic import)
- `src/data/techGuideHandbookData.ts`: Chỉ được `import()` động khi `__ENABLE_TECH_MODE__ === true`. Chứa:
  - `TECH_TOUR_STEPS` (10 bước toàn tập cho Dev: chọn nhánh, chế độ Tổng quan/Kỹ thuật, nền tảng & Parity, `⌘K`, thanh lọc & ghim node, canvas + `VbM-*` + Drawer, chạy thử kịch bản, Dev Tools + Mini App Studio, thanh dock/export, cài đặt & backup profile).
  - `TECH_FEATURE_CATEGORIES` (5 nhóm chi tiết bao gồm đủ 8 tab của **Dev Tools Cockpit**, Mini App Studio, Biên tập nháp/Impact/Source Peek, Cài đặt & Sao lưu Profile).
  - `TECH_WORKFLOW_RECIPES` (8 tình huống thực tế cho Dev).

---

## 3. Bản đồ `data-tour` & `GuideQuickAction`

| Anchor `data-tour` | Thành phần UI |
|---|---|
| `topbar-brand` | Tiêu đề ứng dụng & Breadcrumb (`TopBar.vue`) |
| `topbar-branch` | Bộ chọn nhánh đối soát (`TopBar.vue`) |
| `topbar-search` | Nút `Tìm nhanh & Lệnh ⌘K` (`TopBar.vue`) |
| `topbar-workspaces` | Bộ chuyển `Sơ đồ luồng / Mini App Studio / Dev Tools` (`TopBar.vue`) |
| `topbar-platform` | Bộ chọn `iOS / Android / So sánh` & nút `Chênh lệch` (`TechPlatformSwitcher.vue`) |
| `topbar-audience` | Bộ chuyển `Tổng quan / Kỹ thuật` (`TopBar.vue`) |
| `topbar-export` | Menu `Xuất` (`ExportMenu.vue`) |
| `topbar-guide` | Nút `Hướng dẫn (?)` (`TopBar.vue`) |
| `topbar-settings` | Nút `Cài đặt` (`TopBar.vue`) |
| `canvas-area` | Vùng sơ đồ luồng chính (`FlowCanvas.vue`) |
| `canvas-filter` | Thanh lọc Canvas & node đang ghim (`CanvasFilterBar.vue`) |
| `scenario-bar` | Hộp `Chạy thử kịch bản` (`ScenarioBar.vue`) |
| `canvas-dock` | Thanh thu phóng, đổi hướng, Zen mode & chú giải (`CanvasFloatingDock.vue`) |

`GuideQuickAction` hỗ trợ dispatch trực tiếp từ Sổ tay ra `App.vue`: `start_tour`, `open_search`, `jump_node`, `open_governance`, `open_parity`, `open_miniapp_studio`, `open_settings`, `open_impact`, `toggle_zen`, `toggle_direction`.

---

## 4. Lưu trữ LocalStorage & Kiểm soát rò rỉ
- `vbot-flow-tour-completed-v1`: Lưu trạng thái đã hoàn tất Interactive Spotlight Tour (`'1'`).
- `vbot-flow-onboarding-dismissed-v1`: Giữ nguyên trạng thái ẩn thẻ chào mừng góc trên trái `CanvasGuideOverlay`.
- Bổ sung `'Dev Tools Cockpit'` vào `PUBLIC_LEAK_FORBIDDEN_TOKENS` trong `src/core/auditSyncEngine.ts` và kiểm tra tự động trong `tests/appGuideAndTour.test.ts` lẫn `pnpm build:public && pnpm check:public-leak`.
