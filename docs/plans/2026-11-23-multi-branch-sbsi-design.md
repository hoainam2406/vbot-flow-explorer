# Thiết kế: Hỗ trợ đa nhánh (`Nam-dev` & `Nam-dev-SBSI`) trên VBot Flow Explorer

**Ngày:** 2026-11-23  
**Mục tiêu:** Giữ nguyên luồng so sánh **iOS ↔ Android** trên nhánh `Nam-dev` như hiện tại, đồng thời bổ sung dữ liệu đối soát thực tế của nhánh `Nam-dev-SBSI` (từ 2 repo local `VBot-iOS` và `VBot-Android`, bao gồm cập nhật `VbM-832`) và cho phép chọn chuyển qua lại giữa 2 nhánh ngay trên `TopBar`.

---

## 1. Kiến trúc dữ liệu & Bundle

- **Phương án được chọn:** Nhánh gốc `data/` (`Nam-dev`) + Override theo file tại `data/branches/<branchId>/`.
  - `data/app.json` và `data/modules/*.json` giữ nguyên làm nhánh mặc định `Nam-dev`.
  - Thư mục `data/branches/Nam-dev-SBSI/` chứa:
    - `branch.json`: metadata nhánh (`id`, `label`, `description`, `extends: "Nam-dev"`, `appOverrides.techBranch: "Nam-dev-SBSI"`).
    - `modules/calling.json`, `modules/miniapp-hub.json`, `modules/account.json`: các module có thay đổi so với `Nam-dev`.
    - Các module không thay đổi (`auth.json`, `contacts.json`) được tự động kế thừa từ `data/modules/`.
- **Lazy-load đa nhánh (Internal build):**
  - `plugins/flowDataPlugin.ts` cung cấp `virtual:flow-branches` (`defaultBranchId`, `branches`, `loadBranchDataset(branchId)`) với dynamic `import("virtual:flow-dataset-branch/<id>")` để Vite/Rolldown tách chunk riêng cho `Nam-dev-SBSI`, hoạt động thuần tĩnh trên GitHub Pages mà không làm nặng bundle tải lần đầu.
- **An toàn bản Public (OWASP A01):**
  - Khi `BUILD_TARGET=public`, `virtual:flow-branches` chỉ trả về stub rỗng, không đóng gói dữ liệu hay tên nhánh `Nam-dev-SBSI` vào `dist-public/`.
  - Bổ sung `'Nam-dev-SBSI'` vào `PUBLIC_LEAK_FORBIDDEN_TOKENS` trong `src/core/auditSyncEngine.ts`.
- **Copy-on-write Draft Editor:**
  - Nháp trong `localStorage` được tách khóa theo nhánh (`vbot-flow:draft-patches:v1` cho `Nam-dev`, `vbot-flow:draft-patches:v1:<branchId>` cho nhánh khác).
  - API `/__vbot-dev/apply-patches` nhận `branchId`; khi lưu trên `Nam-dev-SBSI`, middleware chỉ ghi vào `data/branches/Nam-dev-SBSI/` mà không sửa đè lên `data/`.

---

## 2. Giao diện & Điều hướng

- **TopBar Branch Switcher (`src/components/TopBar.vue`):**
  - Thay badge tĩnh `Nam-dev` bằng nút dropdown chọn nhánh (hiển thị `<GitBranch /> <tên nhánh> ▾`) đặt cạnh logo app ở góc trên bên trái (không lồng trong nút logo), mở popover chọn giữa `Nam-dev` và `Nam-dev-SBSI` trên bản Internal.
- **State, Deep-link & Reactivity:**
  - `src/composables/useFlowExplorer.ts` hỗ trợ `baseDataset` reactive (`setBaseDataset`) và `activeBranchId`.
  - Lưu nhánh đang chọn vào URL `#/?branch=Nam-dev-SBSI&...` và `localStorage` (`src/core/explorerPreferences.ts`).
  - Giữ lại node đang chọn / nhánh đang mở nếu ID còn tồn tại ở nhánh đích; tự động cập nhật `TelemetryHud.vue`, `GuideGlossaryModal.vue`, `ParityMatrixModal.vue`, link Git Web (`buildGitWebFileUrl`), và Export Markdown/AI Context.

---

## 3. Nội dung đối soát iOS ↔ Android trên `Nam-dev-SBSI`

1. **Khảo sát đánh giá cuộc gọi DTMF `#3` (`calling.json` — `call-ctrl-survey`):**
   - Nâng cấp từ helper chưa gắn UI (`Nam-dev`) sang tính năng live trên cả iOS (`CallSurveyHelper`, `VPMCallFunc.surveyCall`, `NewCallViewController`, `VPMAppService.surveyTransfer`) và Android (`CallPipHelper.resolveCallFeatureVisibility`, `CallForwardDTMFHelper.DTMF_CALL_SURVEY`, `NewCallActivity.showConfirmCallSurveyDialog`).
   - Ghi nhận 2 điểm `logic_diff` thực tế: hiển thị nút khi chưa kết nối/cuộc gọi nhóm (`alpha 0.45` trên iOS vs `View.GONE` trên Android) và cơ chế chống bấm lặp/báo lỗi (`isSendingSurvey` + toast lỗi trên iOS vs cooldown `3000ms` fire-and-forget trên Android).
2. **Trạng thái nhân sự theo Dự án, Mẫu lý do & Hẹn giờ (`miniapp-hub.json` — `agent-status-capsule` & subtree):**
   - Cập nhật đầy đủ cả bản `VbM-832`: `GET api/project/get-state`, 5 API `/api/project-user-state-temp/{get-all,count-all,detail,setup,delete}`, trường `temp_id`, `name` (1..255 ký tự), `description` (0..500 ký tự), WebSocket `vbot.state` + ACK 10s, mở sheet từ cả `UserProfileCell` (`AccountProjectVC`) trên iOS.
   - Bổ sung node `as-manage-reason-templates` (CRUD mẫu lý do cho Trưởng nhóm / Admin với `isManager`, debounce 300ms, mã lỗi `404/409/429/803/-1`) và `as-auto-resume-reconnect` (`ServerTimeUtils` bù trừ `+7h` = `25_200_000 ms`, hẹn giờ auto-resume `resume_at + 500ms`, `buildReconnectSocketPayloadJson` tính lại số phút còn lại khi reconnect).
   - Cập nhật `as-realtime-sync` với 3 quy tắc `UPDATE_STATE` (lọc theo `project_code`, bảo toàn trường bị khuyết khi payload rút gọn, triệt tiêu Toast giả/lặp).
   - Cả cụm `VbM-832` gồm `as-open-sheet`, `as-set-status`, `as-manage-reason-templates` (đã đồng bộ tự động refresh token & retry HTTP `401` qua `TokenAuthenticator` trên Android) và `as-auto-resume-reconnect` đều đã `synced` hoàn toàn trên cả 2 HĐH; node tổng `agent-status-capsule` chỉ còn ghi nhận nhánh fallback SIP thuần (`getStateBySip` vs `getState`).
3. **Vòng đời Đổi Dự án & Đăng xuất (`account.json` — `prj-list-switch`, `acc-support-logout`):**
   - Bổ sung đồng bộ `VbUserStateHolder.onProjectChanged` khi đổi dự án và `resetOnLogout`/`clear` khi đăng xuất trên cả 2 nền tảng.
