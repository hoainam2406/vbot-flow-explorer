# VBot App Flow Explorer

Ứng dụng web tĩnh **Vue 3 + TypeScript + Vite** giúp trực quan hóa toàn bộ chức năng, luồng nghiệp vụ và xử lý kỹ thuật của ứng dụng **VBot (iOS & Android — đồng bộ nhánh `Nam-dev`)** trên **một biểu đồ cây–luồng thống nhất (Expand / Collapse)**.

- **Không cần Backend / Database:** Toàn bộ dữ liệu luồng nằm trong `data/*.json` và được kiểm tra tính toàn vẹn bằng `zod` ngay lúc dev/build.
- **2 bản build độc lập trên 1 mã nguồn (OWASP A01):**
  - `BUILD_TARGET=public` → Xuất bản `dist-public/` cho khách hàng / đối tác / người dùng mới: loại bỏ hoàn toàn node/edge/media/scenario `tech`, tự động nối tắt cạnh ẩn để luồng không bị đứt, xóa bỏ `techLabel`, `techBranch`, `codeRefs`, `summary.tech`, `apisOrEvents`, `byPlatform`, `miniAppBridge` và tắt toàn bộ giao diện kỹ thuật ngay lúc biên dịch.
  - `BUILD_TARGET=internal` → Xuất bản `dist-internal/` cho đội ngũ nội bộ (Dev, QA, BA, PM): mặc định mở chế độ **Kỹ thuật** (`iOS | Android | So sánh`), lưu tùy chọn vào `localStorage`, đồng thời vẫn chuyển qua lại `Tổng quan | Kỹ thuật` nhanh trên `TopBar`.

---

## Tính năng chính

- **Biểu đồ Expand / Collapse thống nhất (`@vue-flow/core` + `@dagrejs/dagre`):**
  - Bấm nút `+N` / `−` ở mép phải node (hoặc double-click vào node có nhánh con) để bung/thu gọn trực tiếp trên canvas; Dagre tự dàn lại vị trí và tự động `fitView`.
  - **Chỉ mở 1 nhánh (Accordion Mode)** (mặc định bật): tự thu gọn nhánh anh em cùng cấp và các tầng con của nó khi mở nhánh mới (có nút tắt trên `TopBar` để mở nhiều nhánh đối chiếu).
  - **Focus nhánh, Breadcrumb & URL Deep-link (`#/?mode=&platform=&focus=&node=`):** Tập trung vào một nhánh hoặc một node cụ thể để copy link (có nút **Copy link** ngay trên đầu drawer) chia sẻ đúng ngữ cảnh.
- **Nhãn kép `label` / `techLabel` & Onboarding trực quan:**
  - Chế độ **Tổng quan / Public** hiển thị tên nghiệp vụ thuần Việt dễ hiểu (`label`), tự động ẩn các nút ảnh thu gọn khi chưa có file ảnh thật trong `public/media/`.
  - Chế độ **Kỹ thuật** hiển thị tên chuyên sâu (`techLabel`) kèm badge nhánh đồng bộ (`Nam-dev`) trên `TopBar`.
  - Thanh gợi ý thao tác ở góc trên-trái canvas (nhấn **Mở thử Gọi thoại**, hoặc đóng lại để lưu vào `localStorage`), nút **Chú giải** màu sắc thẻ & badge ở góc dưới-phải, và modal **Hướng dẫn & Từ điển kỹ thuật VBot** (lộ trình 10 phút cho Dev mới + tra cứu 13 thuật ngữ VBot).
- **Đối chiếu đa nền tảng iOS ↔ Android (`iOS | Android | So sánh`) & Bảng Chênh lệch (`ParityMatrixModal`):**
  - Chuyển đổi giữa **iOS**, **Android**, hoặc **So sánh** song song ngay trên biểu đồ và trong `TechDetailPanel`.
  - Mở bảng **Chênh lệch** để lọc mọi điểm khác biệt giữa iOS (`Swift / TelephoneSDK (PJSIP) / CallKit / WKWebView`) và Android (`Kotlin / PJSIP / CallStyle FSI / WebView`) và nhảy thẳng tới node tương ứng.
- **Cầu nối Host App ↔ Mini App (`kind: "miniapp"`, `miniAppBridge` & `MiniAppBridgeModal`):**
  - Biểu diễn lá `Mini App` chuyên biệt cùng danh sách hàm gọi 2 chiều Host ↔ JS SDK (`hostFnByPlatform`, `miniAppFn`), schema/ví dụ Payload & Response JSON thật kèm nút **Copy** nhanh.
  - Bổ sung modal **Cầu nối Mini App** trên `TopBar` (chỉ có ở bản Internal/Kỹ thuật): gồm **Trình chạy thử 8 luồng 4 làn SVG động** (giải thích chi tiết từng hàm gọi, gói tin JSON và cách iOS/Android xử lý/báo kết quả cho _Autodial, Token 401, make_call, Giám sát, Danh bạ, RBAC, Mini App con & Host Push_), **Tra cứu Core Protocol `@vbotma/sdk`**, **Danh mục đầy đủ 41 Mini App (36 đang dùng + 5 chưa dùng, đồng bộ từ `/api/apps` Production)**, **Tab Quản lý Quyền (RBAC)** (ma trận 2 tầng quyền hiển thị Host & quyền action bên trong Mini App kèm bộ giả lập vai trò Admin/Member) và xuất Spec Markdown (`.md`).
- **Side Drawer chi tiết, Lịch sử `← Quay lại` & Copy 1-click:**
  - Click vào thân node để mở `DetailDrawer`; khi bấm các chip **Liên kết chéo (`relatedNodeIds`)** có nút **`← Quay lại`** ở đầu drawer để quay lại node vừa xem trước đó.
  - Trong chế độ kỹ thuật, từng dòng `codeRefs` và các khối ví dụ JSON đều có nút **Copy 1-click**.
  - `MediaGallery` hỗ trợ ảnh (`.webp`, `.png`) và video lặp (`.mp4`, `.webm`), khung giả lập điện thoại (`frame: "phone"`) và `MediaLightbox` phóng to toàn màn hình.
- **Xuất sơ đồ & tài liệu (`ExportMenu` + Drawer Actions):**
  - Xuất toàn bộ khung nhìn hiện tại ra ảnh **PNG (2×)**, vector **SVG**, hoặc tải/copy **Markdown (`.md`)** (tự động tách sạch nội dung Tổng quan hoặc đầy đủ Kỹ thuật theo chế độ đang xem).
- **Chạy thử kịch bản (`ScenarioBar` + `ScenarioFlowDialog`) & Tìm kiếm nhanh (`Cmd / Ctrl + K`):**
  - Chạy từng bước trực tiếp trên sơ đồ chính (`◀ / ▶ / Tự chạy`), tự trượt camera & đánh số thứ tự từng bước; kèm nút **Xem biểu đồ luồng** mở Dialog xem **Biểu đồ hoạt động (Activity Diagram)** (có điểm Bắt đầu/Kết thúc, hình thoi Điều kiện, nhãn vai trò & nhánh rẽ phụ) hoặc **Biểu đồ tuần tự (Sequence Diagram)** nhiều làn ở chế độ Kỹ thuật (hỗ trợ xuất SVG/PNG).
  - Tìm nhanh xuyên toàn bộ cây theo tên node (kể cả `techLabel`), mô tả, API, tên hàm Bridge hoặc đường dẫn file (`.swift` / `.kt`).

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
# Chạy chế độ phát triển đầy đủ (bản Nội bộ: có Tổng quan | Kỹ thuật, iOS/Android/So sánh)
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

# Xác minh không rò rỉ dữ liệu & thuật ngữ kỹ thuật vào bundle Public
grep -rn "TwoFactorSessionManager\|FreeSwitchTransferHelper\|codeRefs\|VbMaSDK\|PushKit\|CallKit\|PJSIP\|Nam-dev\|bgapi\|techLabel\|techBranch\|failed_phones\|Contact V2\|CallStyle\|SQLite\|DTMF\|logout_other_devices" dist-public/ || echo "CLEAN_PUBLIC_BUNDLE"
```

---

## Cấu trúc thư mục

```text
vbot-flow-explorer/
├── data/
│   ├── app.json                     # Gốc VBot App, 7 nhánh lớn, version & inlineSubtrees
│   ├── modules/
│   │   ├── account.json             # Quản lý Dự án, QR Code, Hồ sơ/Cài đặt, Quyền OS, Thông báo & Telemetry
│   │   ├── auth.json                # Luồng Đăng nhập, Đăng ký, Tài khoản đã lưu, 2FA, khóa 429, Quên MK
│   │   ├── calling.json             # Luồng Gọi đến, Gọi đi, Chuyển tiếp, Điều khiển iOS/Android
│   │   └── contacts.json            # Luồng Danh bạ cá nhân, Đồng bộ/Quyền, CRUD, Contact V2 & Bridge
│   └── README.md                    # Hướng dẫn chi tiết danh sách ảnh & cấu trúc mẫu
├── docs/plans/                      # Tài liệu thiết kế & kế hoạch triển khai
├── plugins/
│   └── flowDataPlugin.ts            # Vite plugin nạp JSON, kiểm tra media thật, validate & sanitize bản Public
├── public/media/                    # Ảnh chụp màn hình & video minh họa (app/, auth/, calling/, contacts/)
├── scripts/
│   └── validate-data.ts             # CLI kiểm tra toàn vẹn dữ liệu JSON
├── src/
│   ├── App.vue                      # Root shell, URL deep-link + localStorage sync & phím tắt Cmd/Ctrl + K
│   ├── main.ts
│   ├── style.css
│   ├── env.d.ts
│   ├── data/
│   │   ├── schema.ts                # Zod schemas & TypeScript types (.strict())
│   │   ├── validateDataset.ts       # Kiểm tra trùng ID, broken edges/scenarios/relatedNodeIds
│   │   ├── publicGuideData.ts       # Nội dung hướng dẫn thao tác & khái niệm cho người dùng mới
│   │   └── techGlossaryData.ts      # Lộ trình 10 phút & từ điển kỹ thuật VBot (chỉ nạp ở bản Internal)
│   ├── core/
│   │   ├── graphEngine.ts           # mergeDataset, sanitizeForPublic, filterAndBridgeSubtree, resolve nhãn
│   │   ├── explorerPreferences.ts   # Lưu/khôi phục tùy chọn localStorage & phân giải URL state
│   │   ├── parityAnalyzer.ts        # Phân tích chênh lệch iOS ↔ Android & xuất Markdown báo cáo
│   │   ├── diagramExport.ts         # Render sơ đồ vector SVG & xuất ảnh PNG 2×
│   │   ├── publicMarkdownExport.ts  # Xuất Markdown chế độ Tổng quan (sạch dữ liệu kỹ thuật)
│   │   ├── techMarkdownExport.ts    # Xuất Markdown chế độ Kỹ thuật (iOS / Android / So sánh)
│   │   └── downloadHelper.ts        # Helper copy clipboard, tải file & tạo slug tên file
│   ├── composables/
│   │   ├── useFlowExplorer.ts       # State điều hướng, Accordion, Focus, Breadcrumb & Lịch sử Quay lại
│   │   ├── useGraphLayout.ts        # Auto-layout Dagre (LR/TB) & cấu hình cạnh Vue Flow
│   │   └── useSearch.ts             # Tìm kiếm node xuyên tầng theo chế độ & nền tảng
│   └── components/
│       ├── TopBar.vue
│       ├── TechPlatformSwitcher.vue
│       ├── ExportMenu.vue
│       ├── FlowCanvas.vue
│       ├── CanvasGuideOverlay.vue
│       ├── ScenarioBar.vue
│       ├── SearchModal.vue
│       ├── ParityMatrixModal.vue
│       ├── GuideGlossaryModal.vue
│       ├── TechGuidePanel.vue       # Lazy chunk cho tab Dev mới & Từ điển kỹ thuật
│       ├── edges/
│       │   └── RoutedFlowEdge.vue
│       ├── nodes/
│       │   └── AppFlowNode.vue
│       └── drawer/
│           ├── DetailDrawer.vue
│           ├── TechDetailPanel.vue
│           ├── MediaGallery.vue
│           └── MediaLightbox.vue
├── tests/                           # Unit tests cho validator, graphEngine, prefs, plugin, layout, export & state
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Cập nhật dữ liệu & Ảnh minh họa

1. **Chỉnh sửa hoặc tách module mới:**
   - Cập nhật `data/app.json` hoặc các file trong `data/modules/<module>.json` theo schema tại [src/data/schema.ts](src/data/schema.ts).
   - Với node/edge hiển thị ở bản Public (`audience: "all"`) nhưng cần tên kỹ thuật khác ở chế độ Dev, giữ `label` thân thiện với người dùng và đặt tên kỹ thuật vào `techLabel`.
   - Sau khi sửa JSON, luôn chạy `pnpm validate:data` để kiểm tra không bị trùng ID hay gãy liên kết.
2. **Bổ sung ảnh / video minh họa:**
   - Đặt file vào đúng đường dẫn trong `public/media/` theo danh sách gợi ý tại [data/README.md](data/README.md) (khuyên dùng `.webp` cho ảnh và `.mp4`/`.webm` cho video ngắn).
   - Khi có ít nhất 1 file ảnh/video thật tồn tại trong `public/media/`, plugin sẽ tự bật `hasRealMedia` để hiển thị nút **Hiện ảnh trên sơ đồ** trên `TopBar` và icon media trên thẻ node.
   - Các media gắn `"audience": "tech"` sẽ tự động bị loại khỏi `dist-public/` khi chạy `pnpm build:public`.

---

## Tài liệu tham khảo

- Thiết kế hệ thống: [docs/plans/2026-11-19-app-flow-explorer-design.md](docs/plans/2026-11-19-app-flow-explorer-design.md)
- Kế hoạch triển khai MVP: [docs/plans/2026-11-19-app-flow-explorer-web-plan.md](docs/plans/2026-11-19-app-flow-explorer-web-plan.md)
- Thiết kế biểu đồ Mini App: [docs/plans/2026-11-19-miniapp-flow-graph-design.md](docs/plans/2026-11-19-miniapp-flow-graph-design.md)
- Thiết kế chế độ iOS & Android Compare: [docs/plans/2026-11-19-android-compare-mode-design.md](docs/plans/2026-11-19-android-compare-mode-design.md)
- Tài liệu bộ dữ liệu mẫu: [data/README.md](data/README.md)
