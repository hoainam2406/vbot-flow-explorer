# VBot App Flow Explorer

Ứng dụng web tĩnh **Vue 3 + TypeScript + Vite** giúp trực quan hóa toàn bộ chức năng, luồng nghiệp vụ và xử lý kỹ thuật của ứng dụng **VBot** trên **một biểu đồ cây–luồng thống nhất (Expand / Collapse)**.

- **Không cần Backend / Database:** Toàn bộ dữ liệu luồng nằm trong `data/*.json` và được kiểm tra tính toàn vẹn bằng `zod` ngay lúc dev/build.
- **2 bản build độc lập trên 1 mã nguồn (OWASP A01):**
  - `BUILD_TARGET=public` → Xuất bản `dist-public/` cho khách hàng / đối tác: loại bỏ hoàn toàn node/edge/media/scenario `tech`, tự động nối tắt cạnh ẩn để luồng không bị đứt, xóa bỏ `codeRefs` / `summary.tech` / `apisOrEvents` và gạt tắt nút chuyển chế độ kỹ thuật ngay lúc biên dịch.
  - `BUILD_TARGET=internal` → Xuất bản `dist-internal/` cho đội ngũ nội bộ (Dev, QA, BA, PM): giữ 100% dữ liệu và bật công tắc chuyển đổi `Tổng quan | Kỹ thuật`.

---

## Tính năng chính

- **Biểu đồ Expand / Collapse thống nhất (`@vue-flow/core` + `@dagrejs/dagre`):**
  - Bấm nút `+N` / `−` ở mép phải node (hoặc double-click vào node có nhánh con) để bung/thu gọn trực tiếp trên canvas; Dagre tự dàn lại vị trí và tự động `fitView`.
  - **Accordion Mode** (mặc định bật): tự thu gọn nhánh anh em cùng cấp và các tầng con của nó khi mở nhánh mới (có công tắc tắt trên `TopBar` để mở nhiều nhánh đối chiếu).
  - **Focus nhánh & Breadcrumb + URL Hash:** Tập trung vào một nhánh cụ thể (`#/?focus=<nodeId>&mode=tech`) để copy link chia sẻ đúng ngữ cảnh.
- **Side Drawer chi tiết & Media minh họa:**
  - Click vào thân node để mở `DetailDrawer` bên phải với mô tả tổng quan, chi tiết kỹ thuật (chế độ nội bộ) và chip **Liên kết chéo (`relatedNodeIds`)** nhảy thẳng tới node liên quan.
  - `MediaGallery` hỗ trợ ảnh (`.webp`, `.png`) và video lặp (`.mp4`, `.webm`), khung giả lập điện thoại (`frame: "phone"`), tự ẩn khung khi file ảnh chưa tồn tại ở bản build hoặc hiện gợi ý đường dẫn ở môi trường dev, và `MediaLightbox` phóng to toàn màn hình.
  - Công tắc **Hiện ảnh trên sơ đồ** trên `TopBar` hiển thị thumbnail ngay trên thẻ node và tự tăng chiều cao node cho Dagre giãn khoảng cách.
- **Chạy thử kịch bản (`ScenarioBar`):** Làm sáng và chạy hiệu ứng mũi tên theo từng kịch bản (`scenarios`) của nhánh đang mở, làm mờ các nhánh không liên quan.
- **Tìm kiếm nhanh (`Cmd / Ctrl + K`):** Tìm xuyên toàn bộ cây theo tên node, mô tả (và API / `codeRefs` ở bản nội bộ), tự bung các tầng cha và focus tới node đích.

---

## Cài đặt & Chạy dự án

### Yêu cầu
- Node.js (khuyến nghị Node 22+ / 24+) và pnpm (`pnpm@10.23.0`)

### Cài đặt dependencies
```bash
pnpm install
```

### Lệnh phát triển & kiểm thử
```bash
# Chạy chế độ phát triển đầy đủ (bản Nội bộ: có Tổng quan | Kỹ thuật)
pnpm dev

# Chạy xem thử đúng hành vi bản Public (ẩn dữ liệu & giao diện kỹ thuật)
pnpm dev:public

# Kiểm tra tính toàn vẹn toàn bộ JSON trong data/
pnpm validate:data

# Chạy unit test (Vitest)
pnpm test

# Kiểm tra kiểu TypeScript + Vue SFC
pnpm typecheck
```

### Build 2 bản độc lập & Kiểm tra bảo mật bản Public
```bash
# Build bản Public (cho khách hàng / đối tác) -> dist-public/
pnpm build:public

# Build bản Internal (cho nội bộ) -> dist-internal/
pnpm build:internal

# Xác minh không rò rỉ dữ liệu kỹ thuật vào bundle Public
grep -rn "TwoFactorSessionManager\|FreeSwitchTransferHelper\|codeRefs" dist-public/ || echo "CLEAN_PUBLIC_BUNDLE"
```

---

## Cấu trúc thư mục

```text
vbot-flow-explorer/
├── data/
│   ├── app.json                     # Gốc VBot App, 7 nhánh lớn & inlineSubtrees
│   ├── modules/
│   │   ├── auth.json                # Luồng Đăng nhập, 2FA, khóa 429, SETUP_2FA, Quên mật khẩu
│   │   ├── calling.json             # Luồng Gọi đến, Gọi đi, Chuyển tiếp, Điều khiển
│   │   └── contacts.json            # Luồng Danh bạ cá nhân, Đồng bộ/Quyền, CRUD, Contact V2
│   └── README.md                    # Hướng dẫn chi tiết danh sách ảnh & cấu trúc mẫu
├── docs/plans/                      # Tài liệu thiết kế & kế hoạch triển khai
├── plugins/
│   └── flowDataPlugin.ts            # Vite plugin nạp JSON, validate Zod & sanitize bản Public
├── public/media/                    # Ảnh chụp màn hình & video minh họa (app/, auth/, calling/, contacts/)
├── scripts/
│   └── validate-data.ts             # CLI kiểm tra toàn vẹn dữ liệu JSON
├── src/
│   ├── App.vue                      # Root shell, URL hash sync & phím tắt Cmd/Ctrl + K
│   ├── main.ts
│   ├── style.css
│   ├── env.d.ts
│   ├── data/
│   │   ├── schema.ts                # Zod schemas & TypeScript types
│   │   └── validateDataset.ts       # Kiểm tra trùng ID, broken edges/scenarios/relatedNodeIds
│   ├── core/
│   │   └── graphEngine.ts           # mergeDataset, sanitizeForPublic, filterAndBridgeSubtree, buildVisibleTreeFlow
│   ├── composables/
│   │   ├── useFlowExplorer.ts       # State điều hướng, Accordion, Focus, Breadcrumb
│   │   ├── useGraphLayout.ts        # Auto-layout Dagre (LR/TB) & cấu hình cạnh Vue Flow
│   │   └── useSearch.ts             # Tìm kiếm node xuyên tầng theo chế độ hiển thị
│   └── components/
│       ├── TopBar.vue
│       ├── FlowCanvas.vue
│       ├── ScenarioBar.vue
│       ├── SearchModal.vue
│       ├── nodes/
│       │   └── AppFlowNode.vue
│       └── drawer/
│           ├── DetailDrawer.vue
│           ├── MediaGallery.vue
│           └── MediaLightbox.vue
├── tests/                           # Unit tests cho validator, graphEngine, plugin, layout & state
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Cập nhật dữ liệu & Ảnh minh họa

1. **Chỉnh sửa hoặc tách module mới:**
   - Cập nhật `data/app.json` hoặc các file trong `data/modules/<module>.json` theo schema tại [src/data/schema.ts](src/data/schema.ts).
   - Nếu tách thêm module mới từ `inlineSubtrees` (ví dụ `mod-autodial`), tạo `data/modules/autodial.json` với `moduleId: "mod-autodial"` và thêm `"autodial"` vào mảng `moduleFiles` trong `data/app.json`.
   - Sau khi sửa JSON, luôn chạy `pnpm validate:data` để kiểm tra không bị trùng ID hay gãy liên kết.
2. **Bổ sung ảnh / video minh họa:**
   - Đặt file vào đúng đường dẫn trong `public/media/` theo danh sách gợi ý tại [data/README.md](data/README.md) (khuyên dùng `.webp` cho ảnh và `.mp4`/`.webm` cho video ngắn).
   - Các media gắn `"audience": "tech"` sẽ tự động bị loại khỏi `dist-public/` khi chạy `pnpm build:public`.

---

## Tài liệu tham khảo

- Thiết kế hệ thống: [docs/plans/2026-11-19-app-flow-explorer-design.md](docs/plans/2026-11-19-app-flow-explorer-design.md)
- Kế hoạch triển khai: [docs/plans/2026-11-19-app-flow-explorer-web-plan.md](docs/plans/2026-11-19-app-flow-explorer-web-plan.md)
- Tài liệu bộ dữ liệu mẫu: [data/README.md](data/README.md)
