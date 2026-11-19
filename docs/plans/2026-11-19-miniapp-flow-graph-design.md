# Thiết kế Mở rộng: Lá đại diện Mini App, Luồng giao tiếp Host ↔ Mini App & Drawer JSON Ví dụ

**Ngày:** 2026-11-19  
**Nhánh:** `feat/flow-explorer-mvp`  
**Trạng thái:** Đã được phê duyệt

---

## 1. Mục tiêu
1. Biểu diễn trực quan các **Mini App** trên sơ đồ kỹ thuật bằng một loại node đại diện riêng (`kind: 'miniapp'`, `audience: 'tech'`) đặt trực tiếp trong từng phân hệ sử dụng Mini App và liên kết chéo với Mini App Hub (`miniapp-list`).
2. Khi bấm `+N` trên lá Mini App (ở chế độ **Kỹ thuật**), bung ra sơ đồ luồng các sự kiện giao tiếp hai chiều giữa **Host App (iOS / `VbMaSDK`)** và **Mini App (`@vbotma/sdk` / JS)** kèm kịch bản chạy ví dụ trên `ScenarioBar`, với **Danh bạ cá nhân (`vb-ma-user-contact`)** làm mẫu sâu nhất (4 luồng + 4 kịch bản).
3. Thiết kế lại Side Drawer ([TechDetailPanel.vue](../../src/components/drawer/TechDetailPanel.vue)) dễ quét mắt hơn:
   - Nhãn luồng trực quan `Host App (iOS) → Mini App (JS)` / `Mini App (JS) → Host App (iOS)`.
   - Tách riêng hộp `Hàm phía Host (iOS / Swift)` và `Hàm phía Mini App (JS / SDK)`.
   - Bổ sung khối JSON ví dụ thực tế (`examplePayload`, `exampleResponse`) với giá trị giả lập an toàn.
   - Tự động mở sẵn toàn bộ card với node bước (≤ 2 message), thu gọn gọn gàng dưới dạng accordion khi node có > 2 message.
4. Giữ tách biệt tuyệt đối OWASP A01: toàn bộ node `miniapp`, subtree, edge, scenario mới đều gắn `audience: 'tech'` và bị loại bỏ hoàn toàn khỏi chế độ `Tổng quan` lẫn bundle `dist-public/`.

---

## 2. Cấu trúc kỹ thuật

### 2.1 Schema ([src/data/schema.ts](../../src/data/schema.ts))
- `NodeKindSchema`: bổ sung `'miniapp'` (`'module' | 'miniapp' | 'action' | 'process' | 'decision' | 'external' | 'error'`).
- `BridgeMessageSchema`: bổ sung `examplePayload?: string` và `exampleResponse?: string` (đều `z.string().min(1).optional()`).

### 2.2 Canvas, Layout & Drawer
- [`useGraphLayout.ts`](../../src/composables/useGraphLayout.ts): `node.kind === 'module' || node.kind === 'miniapp' ? 250 : 230` để lá đại diện Mini App có chiều rộng chuẩn 250px.
- [`AppFlowNode.vue`](../../src/components/nodes/AppFlowNode.vue): kiểu riêng màu xanh ngọc (`border-cyan-400 bg-cyan-50/95`, badge `bg-cyan-600 text-white`, label `Mini App`), tránh lặp badge phụ khi `kind === 'miniapp'`.
- [`DetailDrawer.vue`](../../src/components/drawer/DetailDrawer.vue):
  - Thêm `miniapp` vào `KIND_BADGE_MAP`.
  - Lọc `relatedNodes` theo `audienceMode` (`mode === 'tech' || target.audience === 'all'`) để không lộ liên kết tới lá kỹ thuật khi ở chế độ `Tổng quan`.
  - Tiếp tục lazy-load [`TechDetailPanel.vue`](../../src/components/drawer/TechDetailPanel.vue) qua `__ENABLE_TECH_MODE__ ? defineAsyncComponent(...) : null` để Vite/Rolldown tree-shake 100% khỏi `dist-public/`.

### 2.3 Danh sách 6 lá đại diện Mini App & Subtree
1. `ma-user-contact` (`mod-contacts` → `vb-ma-user-contact`): 4 luồng (Mở tab & lấy danh bạ iPhone; Thêm/Sửa đồng bộ SQLite; Xoá Server-first & chống vòng lặp; Gọi nhanh CallKit) + 4 kịch bản ví dụ.
2. `ma-contact-forward` (`mod-contacts` → `vb-ma-contact-forward`): mở Tab/Modal `+`, `refresh_data`, `theme_changed`, `check_permissions` & `make_call`.
3. `ma-history-call` (`mod-history-hotline` → `vb-ma-user-history-call`): `filter_changed`, `refresh_data` (`callEndedRefreshPending`), `make_call` & `check_permissions`.
4. `ma-2fa-setting` (`mod-auth` → `vb-ma-2fa-setting`): `openMiniApp`, `request_mini_app_token`, WebSocket `SETUP_2FA` → `emitEventIfMiniAppOpen("setup_2fa")`.
5. `ma-autodial` (`mod-autodial` → `vb-ma-auto-call-campaign`): `start_autodial`, `pause/resume/stop/get_autodial_state`, `autodial_finished`, `autodial_error`.
6. `ma-monitoring` (`mod-miniapp-hub` → `vb-ma-monitoring`): `monitor_call` (`listen`/`capture`/`whisper`), khóa slot `MiniAppMonitoringCoordinator`, `monitor_call_state_changed`.

---

## 3. Ràng buộc bảo mật & Kiểm thử
- Không chứa bí mật (`vbma_*`), URL nội bộ, IP hay số điện thoại/UID thật — chỉ dùng dữ liệu giả lập (`u_8842`, `0912345678`, `Nguyễn Văn A`, `req_01`, `tr_99120`).
- Kiểm tra tự động qua `pnpm validate:data`, `pnpm test`, `pnpm typecheck`, `pnpm build:public`, `pnpm build:internal`, grep kiểm tra `dist-public/` (`CLEAN_PUBLIC_BUNDLE`) và grep kiểm tra `data/` (`NO_SECRETS_IN_DATA`).
