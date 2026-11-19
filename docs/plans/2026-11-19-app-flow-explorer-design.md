# Thiết Kế Hệ Thống Web Khám Phá Chức Năng & Luồng Logic App (VBot App Flow Explorer)

**Ngày:** 2026-11-19  
**Trạng thái:** Đã duyệt  
**Phạm vi tài liệu:** Kiến trúc ứng dụng web Vue 3 độc lập (repo mới), khuôn dữ liệu JSON đa tầng, cơ chế hiển thị ảnh minh họa và giải pháp bảo mật 2 bản build không cần Backend.

---

## 1. Mục Tiêu & Bối Cảnh

Xây dựng một trang web tĩnh (**Single Page Application** bằng **Vue 3 + TypeScript + Vite**) giúp người xem hiểu nhanh toàn bộ cấu trúc chức năng, luồng nghiệp vụ và cách xử lý kỹ thuật của ứng dụng **VBot** thông qua một **biểu đồ tương tác duy nhất có thể bấm để mở rộng dần (Expand / Collapse)**.

Trang web phục vụ **2 nhóm đối tượng** trên **cùng 1 bộ dữ liệu nguồn**:
1. **Khách hàng / Đối tác / Sale / Người mới (`Chế độ Tổng quan`):** Ưu tiên trực quan, ngôn ngữ đời thường, ảnh minh họa màn hình app, ẩn các chi tiết kỹ thuật nội bộ.
2. **Đội ngũ nội bộ — Dev mới, QA, BA, PM (`Chế độ Kỹ thuật`):** Xem đầy đủ các bước xử lý nội bộ, điều kiện rẽ nhánh, API/WebSocket/State, edge case, tham chiếu file code (`codeRefs`) và liên kết chéo giữa các chức năng.

---

## 2. Đánh Giá Biểu Đồ & Quyết Định UX

### 2.1. Tại sao KHÔNG dùng Knowledge Graph thuần làm giao diện chính?
| Khía cạnh | Knowledge Graph thuần (Force-directed) | Biểu đồ Cây–Luồng Expand/Collapse (Được chọn) |
| :--- | :--- | :--- |
| **Điểm bắt đầu đọc** | Không rõ điểm xuất phát, các node trôi tự do. | Bắt đầu từ 1 gốc duy nhất (`VBot App`) đi từ trái → phải. |
| **Biểu diễn logic tuần tự & rẽ nhánh** | Rất yếu, khó đọc trình tự `Bước 1 -> Điều kiện -> Retry/Lỗi`. | Thể hiện rõ luồng có hướng (`DAG`), nhãn cạnh `If/Else`, nhánh lỗi. |
| **Khi app mở rộng (> 40 node)** | Dễ thành "mạng nhện" (Hairball), rung/nhảy vị trí làm mất trí nhớ không gian. | Dàn layout phân tầng cố định bằng `dagre`, có Accordion tự thu gọn nhánh khác. |
| **Phân tích liên kết chéo** | Điểm mạnh lớn nhất (thấy các module phụ thuộc nhau). | **Kế thừa bằng thuộc tính `relatedNodeIds`** trong Side Drawer (và tùy chọn tab `Relation View` ở bản nội bộ). |

### 2.2. Mô hình UX cốt lõi: 1 Biểu Đồ To Thống Nhất (Unified Expand / Collapse Canvas)
Toàn bộ app nằm trên **1 biểu đồ tương tác duy nhất**:

```text
                                            ┌─▶ Nhận PushKit ─▶ CallKit đổ chuông
                       ┌─▶ [Gọi đến (-)] ───┤
                       │                    └─▶ [Kỹ thuật] Tra cứu CRM nền & Retry
  ┌──────────┐  ┌─▶ [Gọi thoại (-)] ─▶ [Gọi đi (+4)]
  │          │  │      └─▶ [Chuyển tiếp (+9)]
  │ VBot App ├──┼─▶ [Đăng nhập & Bảo mật 2FA (+17)]
  │          │  ├─▶ [Danh bạ & Khách hàng (+16)]
  └──────────┘  ├─▶ [Autodial & Call Marketing (+6)]
                ├─▶ [Tính năng & Mini App Hub (+7)]
                ├─▶ [Lịch sử cuộc gọi & Hotline (+5)]
                └─▶ [Tài khoản, Thông báo & Hệ thống (+7)]
```

- **Trạng thái mặc định khi mở web:** Hiện 1 node gốc `VBot App` tỏa ra **toàn bộ 7 lá chức năng lớn** của app; các nhánh sâu đang thu gọn và hiển thị badge số bước con (`+N`).
- **Tách biệt 2 thao tác bấm trên mỗi node:**
  1. **Bấm nút `+` / `-` trên mép phải node (hoặc double-click vào node có nhánh con):** Bung hoặc thu gọn trực tiếp các node con nối tiếp ngay trên cùng canvas, tự chạy lại layout `dagre` và dịch camera mượt tới vùng vừa mở.
  2. **Click 1 lần vào thân node:** Mở **Side Drawer bên phải** hiển thị mô tả chi tiết, ảnh/video minh họa màn hình app, thông số kỹ thuật và các liên kết chéo.
- **3 cơ chế chống rối khi biểu đồ mở sâu:**
  1. **Accordion Mode (mặc định BẬT, có nút tắt ở TopBar):** Khi bấm bung một nhánh mới ở cùng cấp, nhánh anh em đang mở tự động thu gọn lại để canvas luôn thoáng. Người dùng có thể tắt Accordion khi muốn mở song song 2–3 nhánh để đối chiếu.
  2. **Focus nhánh + Breadcrumb + URL Hash:** Bấm *"Tập trung nhánh này"* trong Drawer (hoặc click Breadcrumb) để thu hẹp góc nhìn chỉ còn nhánh đang quan tâm, đồng bộ URL `#/?focus=call-incoming&mode=tech` để copy chia sẻ thẳng đúng vị trí.
  3. **Quy ước màu sắc & vai trò cố định (Visual Grammar):**

| `kind` | Vai trò trên biểu đồ | Màu gợi ý (Light Mode) |
| :--- | :--- | :--- |
| `module` | Gốc app, chức năng lớn hoặc nhóm chức năng | Slate / Indigo đậm, có badge `+N` nếu có nhánh con |
| `action` | Màn hình hoặc thao tác trực tiếp của người dùng | Xanh dương (`blue`) |
| `process` | Xử lý logic, state machine, SQLite, RAM cache | Tím (`violet`) |
| `decision` | Điều kiện rẽ nhánh (`If/Else`, kiểm tra quyền/trạng thái) | Vàng cam (`amber`), cạnh ra gắn nhãn điều kiện |
| `external` | Gọi API Backend, WebSocket, PushKit, SIP/Linphone, CallKit | Xanh lá (`emerald`) |
| `error` | Xử lý lỗi, Retry, Fallback DTMF, Force Logout, Rollback | Đỏ nhạt (`rose`) |

### 2.3. Chạy Thử Kịch Bản (Scenario Walkthrough) & Tìm Kiếm Xuyên Tầng
- **Scenario Walkthrough:** Khi một nhánh đang mở có khai báo `scenarios` (VD: *Luồng chuẩn* vs *Lỗi mạng `-1005` & Retry*), thanh chọn kịch bản nổi ở góc dưới canvas cho phép chọn 1 kịch bản → làm sáng và chạy hiệu ứng mũi tên (`animated: true`) trên đúng các node/cạnh của kịch bản đó, đồng thời làm mờ (`opacity: 0.25`) các nhánh không liên quan.
- **Tìm kiếm nhanh (`Cmd / Ctrl + K`):** Tìm theo tên node, mô tả, tên API hoặc file code (chỉ tìm trong dữ liệu hợp lệ của bản build hiện tại). Chọn 1 kết quả sẽ tự động mở các node cha trên đường dẫn, focus camera tới node đích và mở Side Drawer.

---

## 3. Cơ Chế Ảnh & Media Minh Họa

1. **Trong Side Drawer (nơi hiển thị chính):**
   - Ngay đầu Drawer đặt component `MediaGallery` (hỗ trợ trượt nhiều ảnh/video với caption cho từng mục).
   - Thuộc tính `frame: "phone" | "none"`: ảnh chụp màn hình iOS/Android tự động bọc khung điện thoại gọn đẹp; sơ đồ kiến trúc để `none`.
   - Bấm vào ảnh mở `MediaLightbox` phóng to toàn màn hình.
   - Hỗ trợ cả ảnh tĩnh (`.webp`, `.png`) và video/animation ngắn (`type: "video"`, `.mp4`/`.webm` phát lặp tắt tiếng).
2. **Trên Canvas biểu đồ:**
   - Mặc định node giữ kích thước gọn, chỉ hiện icon nhỏ báo hiệu có ảnh minh họa.
   - Trên thanh `TopBar` có công tắc **`Hiện ảnh trên sơ đồ`**: khi bật, các node có media sẽ bung thumbnail preview ngay trong thẻ node và truyền chiều cao mới vào `dagre` để tự động giãn khoảng cách, không đè cạnh.
3. **Phân quyền hiển thị & Tối ưu tải:**
   - Mỗi item trong `media[]` có `audience: "all" | "tech"` (mặc định `"all"`). Chế độ Tổng quan chỉ hiện ảnh sản phẩm/UI; chế độ Kỹ thuật mới hiện thêm ảnh chú thích kỹ thuật/diagram.
   - Ảnh dùng `loading="lazy"`, đặt tại `public/media/<module>/...`. Nếu file ảnh chưa tồn tại hoặc lỗi tải (`@error`), gallery tự ẩn khung ảnh an toàn (không hiện icon ảnh vỡ).

---

## 4. Kiến Trúc 0 Backend & Bảo Mật 2 Bản Build (OWASP A01)

### 4.1. Nguy cơ nếu chỉ ẩn bằng giao diện
Nếu đóng gói toàn bộ dữ liệu Tổng quan + Kỹ thuật vào chung 1 bundle tĩnh công khai rồi chỉ ẩn tab Kỹ thuật bằng `v-if`, khách hàng chỉ cần mở DevTools (`F12`) hoặc đọc file JS chunk là trích xuất được toàn bộ tên endpoint nội bộ, luồng kiểm tra bảo mật, `codeRefs` và edge cases. Đây là lỗ hổng **Broken Access Control (OWASP A01)**.

### 4.2. Giải pháp: 1 Repo nguồn — 2 Lệnh Build Độc Lập
Không cần Backend hay Database. Toàn bộ dữ liệu gốc lưu trong `data/` của repo web và được xử lý ngay tại **thời điểm biên dịch (Vite build-time)** thông qua plugin `plugins/flowDataPlugin.ts` dựa vào biến môi trường `BUILD_TARGET`:

1. **`npm run build:public` (`BUILD_TARGET=public`) — Xuất ra `dist-public/` cho Khách hàng / Đối tác:**
   - Chạy hàm `sanitizeForPublic(dataset)`:
     - Loại bỏ toàn bộ node có `audience === "tech"`, đồng thời xóa cả cây con bên dưới nếu node cha là `tech`.
     - Chạy **`bridgeHiddenEdges()`**: nếu luồng đi qua node kỹ thuật bị ẩn (`A -> [tech B] -> C`), tự động nối tắt cạnh thành `A -> C` (gộp nhãn cạnh hợp lý nếu cần) để biểu đồ Tổng quan vẫn liền mạch, không bị đứt luồng.
     - Xóa hoàn toàn các trường `summary.tech`, `techDetail`, `relatedNodeIds` trỏ tới node đã bị cắt.
     - Lọc bỏ `media` và `scenarios` có `audience === "tech"`.
     - Loại bỏ các file ảnh trong `public/media/` thuộc danh sách media `tech` khỏi thư mục `dist-public/`.
   - Biến compile-time `import.meta.env.VITE_ENABLE_TECH_MODE = false`: tree-shake loại bỏ giao diện chuyển chế độ `Tổng quan | Kỹ thuật`, không đọc `?mode=tech` từ URL.
   - **Kết quả:** Mở F12 trên bản Public **không tồn tại bất kỳ chuỗi dữ liệu kỹ thuật nào**.

2. **`npm run build:internal` (`BUILD_TARGET=internal`) — Xuất ra `dist-internal/` cho Nội bộ Dev/QA/BA:**
   - Giữ 100% dữ liệu, bật nút gạt `Tổng quan | Kỹ thuật`, hỗ trợ chia sẻ link `?mode=tech`, hiển thị `techDetail`, `codeRefs` và `relatedNodeIds`.
   - Triển khai sau lớp xác thực hạ tầng sẵn có (Cloudflare Access / VPN / GitLab/GitHub Pages nội bộ), không cần tự viết backend auth.

### 4.3. Nguyên tắc vệ sinh dữ liệu nguồn (`data/*.json`)
Tuyệt đối **không** ghi IP máy chủ nội bộ, tài khoản/mật khẩu Basic Auth, token mẫu thật, số điện thoại hoặc tên khách hàng thật vào JSON. Chỉ mô tả tên endpoint trừu tượng (VD: `POST /token`, `GET/POST /webapi/bgapi (FreeSWITCH Lua)`) và dữ liệu ví dụ ẩn danh (`09xx xxx xxx`).

---

## 5. Data Schema Đầy Đủ (TypeScript & Quy Ước Gộp Cây)

### 5.1. Tổ chức thư mục dữ liệu
```text
data/
  app.json                 # Gốc VBot App + danh sách 7 nhánh lớn + nhánh gọn inlineSubtrees
  modules/
    calling.json           # Chi tiết sâu của mod-calling
    auth.json              # Chi tiết sâu của mod-auth
    contacts.json          # Chi tiết sâu của mod-contacts
    ...                    # Bổ sung dần các module khác (autodial, miniapp-hub...)
public/
  media/
    app/
    calling/
    auth/
    contacts/
```

### 5.2. Interface TypeScript chuẩn (`schemaVersion: "1.0"`)
```ts
export type NodeKind =
  | 'module'
  | 'action'
  | 'process'
  | 'decision'
  | 'external'
  | 'error';

export type AudienceScope = 'all' | 'tech';

export interface MediaItem {
  src: string;                    // VD: "/media/calling/incoming-callkit.webp"
  caption: string;
  type?: 'image' | 'video';       // Mặc định 'image'
  frame?: 'phone' | 'none';       // Mặc định 'none'
  audience?: AudienceScope;       // Mặc định 'all'
}

export interface TechDetail {
  inputs?: string[];
  outputs?: string[];
  apisOrEvents?: string[];
  edgeCases?: string[];
  codeRefs?: string[];            // VD: "VBot/Service/TwoFactorSessionManager.swift"
}

export interface FlowNodeData {
  id: string;                     // Duy nhất trên toàn bộ unified graph
  label: string;
  kind: NodeKind;
  audience: AudienceScope;
  summary: {
    overview: string;             // Giải thích dễ hiểu cho khách hàng / người mới
    tech?: string;                // Giải thích kỹ thuật (nếu khác overview)
  };
  media?: MediaItem[];
  techDetail?: TechDetail;
  relatedNodeIds?: string[];      // Liên kết chéo tới node ID khác trên toàn app
}

export interface FlowEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  audience?: AudienceScope;       // Mặc định 'all'
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  audience?: AudienceScope;       // Mặc định 'all'
  nodeIds: string[];
  edgeIds: string[];
}

export interface SubtreeDefinition {
  title: string;
  layoutHint: 'tree' | 'flow';    // 'tree': chia nhánh con | 'flow': luồng xử lý tuần tự/rẽ nhánh
  direction?: 'LR' | 'TB';        // Mặc định 'LR' (Trái -> Phải)
  entryNodeIds: string[];         // Node đầu tiên trong subtree để nối cạnh từ node cha
  nodes: FlowNodeData[];
  edges: FlowEdgeData[];
  scenarios?: Scenario[];
}

export interface FlowModuleFile {
  schemaVersion: '1.0';
  moduleId: string;               // Khớp với 1 branch.id trong app.json
  subtrees: Record<string, SubtreeDefinition>; // Key = parentNodeId được bung
}

export interface AppManifest {
  schemaVersion: '1.0';
  app: {
    name: string;
    tagline: string;
    version?: string;
  };
  rootNode: FlowNodeData;
  branches: FlowNodeData[];       // Toàn bộ các lá chức năng lớn của app
  branchEdges: FlowEdgeData[];    // Cạnh nối từ rootNode -> branches
  moduleFiles: string[];          // VD: ["calling", "auth", "contacts"] -> data/modules/<name>.json
  inlineSubtrees?: Record<string, SubtreeDefinition>; // Subtree cho các nhánh chưa tách file riêng
}
```

### 5.3. Quy tắc gộp cây & bung nhánh (`mergeDataset` + `buildVisibleTreeFlow`)
1. **Gộp dữ liệu:** Đọc `app.json`, nạp toàn bộ `inlineSubtrees`, rồi nạp lần lượt `data/modules/<name>.json` và gộp `subtrees` vào 1 từ điển chung `subtreesByParentId: Record<string, SubtreeDefinition>`. Nếu có key trùng giữa `inlineSubtrees` và file module riêng thì file module riêng được ưu tiên (giúp tách file dần mà không cần sửa cấu trúc).
2. **Bung nhánh trực tiếp:** Khi node `P` nằm trong `expandedIds` và tồn tại `subtreesByParentId[P]`:
   - Thêm toàn bộ `nodes` (đã lọc theo `audience`) và `edges` (đã chạy nối tắt cạnh ẩn) của subtree đó vào đồ thị hiển thị.
   - Với mỗi `entryId` trong `entryNodeIds` (nếu `entryId` bị ẩn do lọc `audience`, lấy node con kế tiếp sau khi nối tắt), sinh cạnh nối trực tiếp `P -> entryId`.
   - Nếu node con bên trong lại nằm trong `expandedIds`, tiếp tục bung đệ quy (có kiểm tra `visitedParentIds` chống vòng lặp vô hạn).
3. **Tính badge `+N`:** Đếm tổng số node con cháu có thể thấy ở `audienceMode` hiện tại khi `P` đang thu gọn.

---

## 6. Tech Stack & Cấu Trúc Repo Web Vue 3

### 6.1. Thư viện sử dụng
- **Core:** `vue` (v3.5+), `typescript`, `vite`
- **Styling & Icon:** `tailwindcss`, `lucide-vue-next`
- **Biểu đồ:** `@vue-flow/core`, `@vue-flow/controls`, `@vue-flow/minimap`, `@vue-flow/background`
- **Auto-layout:** `@dagrejs/dagre` *(gọn nhẹ; có thể nâng cấp lên `elkjs` sau nếu cần swimlane phức tạp)*
- **Validation & Test:** `zod`, `vitest`, `@vue/test-utils`

### 6.2. Cấu trúc thư mục repo mới (`vbot-flow-explorer`)
```text
vbot-flow-explorer/
  package.json
  vite.config.ts
  plugins/
    flowDataPlugin.ts           # Nạp data/, validate Zod, sanitize theo BUILD_TARGET
  data/
    app.json
    modules/
      calling.json
      auth.json
      contacts.json
  public/media/                 # Ảnh chụp màn hình & video minh họa
  src/
    main.ts
    App.vue
    data/
      schema.ts                 # TypeScript types + Zod schemas
      validateDataset.ts        # Kiểm tra broken refs, duplicate IDs, cycle guard
    core/
      graphEngine.ts            # mergeDataset, sanitizeForPublic, bridgeHiddenEdges, buildVisibleTreeFlow
    composables/
      useFlowExplorer.ts        # State (expandedIds, accordion, focus, mode, scenario, URL sync)
      useGraphLayout.ts         # Dàn tọa độ dagre theo direction & kích thước node (có/không ảnh)
      useSearch.ts              # Index tìm kiếm xuyên cây (Cmd/Ctrl + K)
    components/
      TopBar.vue
      FlowCanvas.vue
      ScenarioBar.vue
      SearchModal.vue
      nodes/
        AppFlowNode.vue
      drawer/
        DetailDrawer.vue
        MediaGallery.vue
        MediaLightbox.vue
  tests/
    validateDataset.test.ts
    graphEngine.test.ts
    flowDataPlugin.test.ts
    useGraphLayout.test.ts
    useFlowExplorer.test.ts
```

---

## 7. Quy Trình Trích Xuất Tiếp Các Chức Năng Còn Lại

Bộ dữ liệu mẫu tại `docs/flow-explorer-sample/` đã dựng sẵn:
- **Cây tổng thể cả app (`app.json`)** với đầy đủ **7 nhánh lớn** + `inlineSubtrees` mô tả các nhánh con cho `mod-autodial`, `mod-miniapp-hub`, `mod-history-hotline`, `mod-account-system`.
- **3 module trích xuất sâu hoàn chỉnh (`modules/calling.json`, `modules/auth.json`, `modules/contacts.json`)** gồm đầy đủ luồng nghiệp vụ, rẽ nhánh lỗi, kịch bản chạy thử (`scenarios`), liên kết chéo (`relatedNodeIds`) và `codeRefs` khớp trực tiếp file thật trong `VBot-iOS`.

Khi muốn đào sâu tiếp 1 trong 4 nhánh còn lại (VD: `mod-autodial`), chỉ cần:
1. Tạo `data/modules/autodial.json` với `moduleId: "mod-autodial"`.
2. Dùng `subtrees["mod-autodial"]` (copy từ `inlineSubtrees["mod-autodial"]` trong `app.json`) và viết tiếp `subtrees["autodial-campaign"]`, `subtrees["call-marketing-template"]` theo đúng schema mục 5.
3. Thêm `"autodial"` vào mảng `moduleFiles` của `app.json` và chạy `npm run validate:data` để kiểm tra toàn vẹn liên kết.
