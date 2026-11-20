# Thiết kế Tái cấu trúc Cây chức năng lớn & Đủ 36/36 Mini App

**Ngày:** 2026-11-20  
**Nhánh:** `feat/flow-explorer-mvp`  
**Trạng thái:** Đã được phê duyệt

---

## 1. Lý do tái cấu trúc
1. Trước đây nhánh Tầng 1 `mod-autodial` (*Autodial & Call Marketing*) gộp chung 2 nghiệp vụ khác nhau (Quay số tự động `vb-ma-autodial` cho mọi user vs. Call Marketing `vb-ma-auto-call-*` lọc theo `CHIEN_DICH` và luồng Native gọi theo kịch bản mẫu).
2. Tách `mod-autodial` ra Tầng 1 cũng bất nhất với `vb-ma-monitoring` (cũng có lõi Native nặng nhưng nằm trong `mod-miniapp-hub`), và trong `mod-miniapp-hub` trước đó còn lặp 2 nút song song (`autodial-campaign` + `ma-autodial`, `monitoring-whisper` + `ma-monitoring`).
3. Trên Trang Tính năng (Tab 0) thực tế có **28/36 Mini App** chia theo 8 nhóm danh mục trong `MiniAppCategoryName.swift`, cộng với 3 Mini App nhúng Tab, 1 Mini App cài đặt 2FA ẩn và 4 Mini App trong cuộc gọi (`in_call`) — tổng **36/36 Mini App** cần có nút đại diện 1-1 trên sơ đồ.

---

## 2. Cấu trúc cây mới (6 phân hệ Tầng 1 + 36/36 nút Mini App)

### Tầng 1 — 6 phân hệ chức năng chính
1. `mod-calling` — **Gọi thoại & Chuyển tiếp**
   - `call-incoming` (Cuộc gọi đến)
   - `call-outgoing` (Cuộc gọi đi)
   - `call-marketing-template` *(chuyển từ `mod-autodial` cũ; liên kết chéo `hub-cat-marketing`)*
   - `call-transfer` (Chuyển tiếp cuộc gọi)
   - `call-controls` (Điều khiển trong cuộc gọi)
   - `call-incall-miniapps` *(`audience: 'tech'`, bung 4/36 Mini App trong cuộc gọi: `ma-call-note`, `ma-call-tag`, `ma-call-transfer`, `ma-call-add-member`)*
2. `mod-auth` — **Đăng nhập & Bảo mật 2FA** *(chứa `ma-2fa-setting` — 1/36)*
3. `mod-contacts` — **Danh bạ & Khách hàng** *(chứa `ma-contact-forward`, `ma-user-contact` — 2/36)*
4. `mod-miniapp-hub` — **Tính năng & Mini App Hub** *(tách sang [`data/modules/miniapp-hub.json`](../../data/modules/miniapp-hub.json))*
   - `miniapp-list` — **Danh mục Mini App Trang Tính năng (28/36)** → bung `+8` nhóm danh mục chuẩn:
     1. `hub-cat-call-mgmt` — Quản lý cuộc gọi (5): `ma-autodial` *(bung `+7` bước Bridge, 5 kịch bản)*, `ma-monitoring` *(bung `+3` bước Bridge, 1 kịch bản)*, `ma-user-hotline`, `ma-alias-hotline`, `ma-tagging`
     2. `hub-cat-marketing` — Cuộc gọi Marketing (7): `ma-auto-call-campaign`, `ma-auto-call-history`, `ma-auto-call-template`, `ma-auto-call-schedule`, `ma-auto-call-custom-field`, `ma-auto-call-group-campaign`, `ma-sms-campaign`
     3. `hub-cat-crm` — Quản lý khách hàng & CRM (3): `ma-crm`, `ma-crm-custom-field`, `ma-order`
     4. `hub-cat-work` — Công việc (3): `ma-ticket`, `ma-todo`, `ma-activity-history`
     5. `hub-cat-member` — Quản lý thành viên (2): `ma-member`, `ma-permission`
     6. `hub-cat-bot` — Bot & Kịch bản tổng đài (2): `ma-call-script`, `ma-bot-ivr`
     7. `hub-cat-report` — Báo cáo (1): `ma-report`
     8. `hub-cat-group-settings` — Cài đặt nhóm (5): `ma-survey`, `ma-webhook`, `ma-api-key`, `ma-add-on`, `ma-call-automation-config`
   - `agent-status-capsule` — Thanh trạng thái trực & Thiết bị nhận gọi (`+4`)
   - `global-search` — Tìm kiếm toàn cục & Gọi nhanh (`+3`)
5. `mod-history-hotline` — **Lịch sử cuộc gọi & Hotline** *(chứa `ma-history-call` — 1/36)*
6. `mod-account-system` — **Tài khoản, Thông báo & Hệ thống**

---

## 3. Ánh xạ 1-1 & Đồng bộ UI
- Toàn bộ 36 mục trong [`MINI_APP_CATALOG`](../../src/data/miniAppBridgeCatalog.ts) đều trỏ `relatedNodeId` duy nhất tới đúng node `ma-*` tương ứng (`28 + 2 + 1 + 1 + 4 = 36`).
- Toàn bộ 8 nhóm và 28 Mini App dưới `miniapp-list` đặt `audience: 'all'` để hiển thị đầy đủ cả ở chế độ Tổng quan (`build:public`) lẫn Kỹ thuật (`build:internal`); riêng nhánh Bridge chi tiết (`ma-autodial` `+7`, `ma-monitoring` `+3`, `call-incall-miniapps` `+4`) giữ `audience: 'tech'`.
- `TechDetailPanel.vue` tra cứu `simulatorFlowId` từ `MINI_APP_CATALOG` theo `miniAppId` thay vì fallback cứng về `flow-autodial`.

---

## 4. Bổ sung đồng bộ dữ liệu Production thực tế (`/api/apps/global` & `/api/apps`)
Sau khi đối chiếu trực tiếp response từ `https://vb-ma.vbplatform.workers.dev/api/apps/global` (35 app) & `/api/apps` (36 app, thêm `vb-ma-api-key`), cây và catalog được đồng bộ chính xác **41 Mini App** (= **36 đang dùng** + **5 đặc biệt/chưa dùng**: `vb-ma-contact-forward` & 4 app `in_call`; loại 2 app không có trên Prod là `vb-ma-order`, `vb-ma-sms-campaign`; không đưa `vb-ma-template`, `template`):
- **6 nhóm thực tế dưới `miniapp-list` (34/41):**
  1. `hub-cat-call-mgmt` — `Cuộc gọi (11)`: gồm `ma-alias-hotline`, `ma-bot-ivr`, `ma-call-automation-config`, `ma-blacklist`, `ma-user-hotline`, `ma-survey`, `ma-ipcall-control`, `ma-call-script`, `ma-history-call` (chuyển từ `mod-history-hotline` kèm `+4` bước Bridge), `ma-autodial` (`+7`), `ma-tagging`.
  2. `hub-cat-autocall` — `Gọi tự động (6)`: 6 app `vb-ma-auto-call-*`.
  3. `hub-cat-group-settings` — `Cài đặt nhóm (9)`: `ma-group-member`, `ma-permission`, `ma-storage-management`, `ma-sdk-mobile-push`, `ma-member`, `ma-add-on`, `ma-webhook`, `ma-widget`, `ma-api-key`.
  4. `hub-cat-crm` — `CRM (2)`: `ma-crm`, `ma-crm-custom-field`.
  5. `hub-cat-featured` — `Nổi bật / Không nhóm (5)`: `ma-report`, `ma-todo`, `ma-monitoring` (`+3`), `ma-ticket`, `ma-activity-history` (`is_hidden=true`).
  6. `hub-cat-utility` — `Tiện ích · utility (1 trên Hub)`: `ma-crm-v2` (liên kết chéo sang `ma-user-contact`, `ma-contact-forward`).
- Cập nhật toàn bộ `manifestCapabilities` trong [`miniAppPermissionMatrix.ts`](../../src/data/miniAppPermissionMatrix.ts) theo `capabilities.permissions` thật của Production.
