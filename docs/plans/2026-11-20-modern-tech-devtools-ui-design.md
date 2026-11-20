# Thiết kế: Giao diện Công nghệ Hiện đại & Trải nghiệm DevTools (Hướng C — Linear / Vercel Precision)

**Ngày:** 2026-11-20  
**Trạng thái:** Đã duyệt & Triển khai  
**Mục tiêu:** Nâng cấp `vbot-flow-explorer` từ giao diện tài liệu phẳng lên chuẩn **Linear / Vercel Precision DevTools**: hỗ trợ Dark/Light Mode thông minh theo bản build, sơ đồ "Live Architecture Radar", HUD nổi tinh gọn, Command Palette `⌘K` đầy đủ lệnh, tô màu cú pháp JSON / file nguồn, điều hướng bàn phím + Zen Mode và giữ sạch tuyệt đối bản `public` (OWASP A01).

---

## 1. Hệ thống Design Tokens, Theme & Typography
- **Mặc định Theme theo đối tượng:**
  - Bản **Nội bộ (`BUILD_TARGET=internal`)** mặc định **Dark Mode** (`#090d16` Obsidian Slate, viền hairline mảnh, điểm nhấn Indigo/Cyan tinh tế).
  - Bản **Công khai (`BUILD_TARGET=public`)** mặc định **Light Mode** (`#f8fafc`, thẻ kính mờ sắc nét).
  - Cả hai bản đều có nút chuyển nhanh `Sáng / Tối` và lưu bền vững vào `localStorage` (`vbot-flow-theme-v1`), đồng bộ class `.dark` ngay trước khi mount Vue để tránh chớp sáng (FOUC).
- **Tailwind CSS v4 Dark Variant:** Khai báo `@custom-variant dark (&:where(.dark, .dark *));` trong `src/style.css`.
- **Typography:** Nạp cặp font `Plus Jakarta Sans` (UI tiếng Việt sắc nét) + `JetBrains Mono` (cho `techLabel`, API, Bridge, JSON, `⌘K`, Telemetry HUD) với system fallback an toàn khi offline.

---

## 2. Canvas, Node & Cạnh nối — "Live Architecture Radar"
- **Thẻ Node (`AppFlowNode.vue`):**
  - Chuyển sang thẻ **Precision Surface Card** kính mờ kèm **dải accent 3.5px bên trái** và **icon Lucide riêng theo `kind`** (`Module`, `Mini App`, `Thao tác`, `Xử lý`, `Điều kiện`, `Hệ thống`, `Lỗi / Retry`).
  - Ở chế độ *Kỹ thuật*, bổ sung footer mono đếm nhanh số lượng API, Bridge SDK và file tham chiếu (đặt hoàn toàn sau `__ENABLE_TECH_MODE__`).
  - Nút `+N / −` tự thích ứng vị trí theo hướng sơ đồ (`LR` mép phải ↔ `TB` mép dưới).
- **Cạnh nối (`RoutedFlowEdge.vue` + `useGraphLayout.ts`):**
  - **Data-packet pulse:** Hạt sáng chạy dọc cạnh bằng SVG `<animateMotion>` khi cạnh đang active trong kịch bản hoặc khi Hover Lineage Trace (tôn trọng `prefers-reduced-motion`).
  - **Hover Lineage Trace:** Rê chuột vào node (khi không chạy kịch bản) sẽ làm sáng chuỗi tổ tiên–con cháu và cạnh trực tiếp, làm dịu các nhánh khác.
  - **Màu ngữ nghĩa:** Cạnh tới `error` màu rose nét đứt, cạnh kết nối `miniapp` màu cyan.
  - Sửa định tuyến `buildRoutedEdgePath` hỗ trợ chuẩn cả hướng dọc `TB` lẫn ngang `LR`, đồng thời tô màu `<MiniMap>` theo từng `kind`.

---

## 3. Bố cục Spatial Floating HUD & Chuyển động
- **Tinh gọn `TopBar.vue`:** Logo SVG mạng luồng mới đổi sắc độ theo chế độ *Tổng quan ↔ Kỹ thuật*, Breadcrumb, thanh mở nhanh `⌘K`, cụm Kỹ thuật (`Cầu nối Mini App`, `iOS | Android | So sánh`, `Chênh lệch`), `Tổng quan | Kỹ thuật`, `Xuất`, `Hướng dẫn` và nút đổi `Sáng / Tối`.
- **`CanvasFloatingDock.vue`:** Thanh dock kính mờ góc dưới-phải thay thế `<Controls>` mặc định: `Zoom − | % | Zoom +`, `Fit View (F)`, đổi hướng `LR ↔ TB`, `Chỉ mở 1 nhánh`, `Hiện ảnh`, `Chú giải` (popover mở lên trên) và `Zen Mode (Z)`.
- **`TelemetryHud.vue`:** Dải thông số mono ở góc trên-trái (xếp dọc phía trên `CanvasGuideOverlay` để không đè nhau). Bản Internal hiển thị số node, hướng, tên nhánh đồng bộ và nút nhanh `Δ parity` (nạp động `parityAnalyzer` sau `__ENABLE_TECH_MODE__`). Bản Public chỉ hiện thông số trung tính.
- **Chuyển động & Phản hồi (`ToastHost.vue` + `<Transition>`):** Drawer trượt mượt, modal fade+scale và toast pill khi sao chép / xuất file / đổi chế độ.

---

## 4. Lớp Power-User DevTools
- **Command Palette `⌘K` (`SearchModal.vue`):** Hỗ trợ tìm song song **Lệnh nhanh** (hoặc lọc riêng lệnh với tiền tố `>`), **Node vừa xem gần đây**, **Kịch bản khả dụng** và tìm xuyên cây node. Các lệnh kỹ thuật chỉ nạp sau `__ENABLE_TECH_MODE__`.
- **Syntax Highlight JSON & Pill Ngôn ngữ (`jsonHighlight.ts`, `JsonCodeBlock.vue`):** Bộ tô màu cú pháp JSON thuần TypeScript (escape HTML chống XSS) và badge màu theo đuôi file `.swift`, `.kt`, `.ts`, `.vue`.
- **Điều hướng bàn phím (`useKeyboardNavigation.ts`) & Zen Mode:** Hỗ trợ `↑ ↓ ← →` theo cây (khớp `LR`/`TB`), `Enter / Space` bung/thu nhánh, `F` Fit View, `[` / `]` bước kịch bản, `Z` bật/tắt Zen Mode trình chiếu, `?` mở hướng dẫn, `Esc` thoát lớp trên cùng.

---

## 5. Đồng bộ Dark Mode & Bảo mật OWASP A01
- Toàn bộ Drawer và các Modal lớn (`DetailDrawer`, `TechDetailPanel`, `ParityMatrixModal`, `MiniAppBridgeModal`, `BridgeFlowSimulator`, `MiniAppPermissionsPanel`, `ScenarioFlowDialog`, `GuideGlossaryModal`) được đồng bộ Dark/Light. Các biểu đồ SVG nền sáng trong modal dùng khung `.vbot-svg-stage` để giữ độ tương phản cao trong Dark Mode.
- Kiểm chứng bản `dist-public/` bằng `pnpm build:public` và lệnh `grep` kiểm tra rò rỉ chuỗi kỹ thuật (`CLEAN_PUBLIC_BUNDLE`).
