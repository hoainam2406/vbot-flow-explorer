# VBot Flow Explorer — Workspace Productivity Suite Design

> **Ngày:** 2026-11-23  
> **Trạng thái:** Đã duyệt bởi User (Phương án A — Contextual Lazy Modules + Reactive Draft Overlay + Pure-Core Services)

---

## 1. Mục tiêu & Ràng buộc kiến trúc

Mở rộng `vbot-flow-explorer` từ công cụ xem sơ đồ chỉ-đọc thành **bộ công cụ quản trị luồng và làm việc hằng ngày** cho Dev (iOS / Android / Mini App), QA, BA và PM thông qua 11 tính năng trải đều trên 4 Wave:

1. **Wave 1 — Nền tảng Quản trị Dữ liệu, CLI Audit/Sync, CI Public Guard & Xuất Mermaid**
2. **Wave 2 — Quy trình Dev / QA / BA hằng ngày** (Dev Workspace Settings & Media Coverage, mở thẳng code IDE/Git + mẫu Task VBot Work + Parity Triage, Impact Analysis, Canvas Lens Filter, QA Test Checklist)
3. **Wave 3 — Nâng cấp Mini App Dev Studio** (Automated Contract Test Runner cho cả Simulation iOS/Android & Live Iframe Compliance, Export/Import & Replay Wire Log)
4. **Wave 4 — Hybrid Visual Flow Editor** (Reactive Draft Overlay + Local Dev Save Middleware ghi trực tiếp về `data/*.json`)

### Các ràng buộc bắt buộc
- **Hybrid Static + Local Dev API:**
  - Trên hosting tĩnh (GitHub Pages): chỉnh sửa lưu vào `localStorage` draft overlay và xuất JSON files / JSON Patch để commit.
  - Trên local dev (`pnpm dev` ở `BUILD_TARGET=internal`): Vite dev middleware cho phép lưu atomic trực tiếp vào `data/app.json` và `data/modules/*.json` sau khi vượt qua `validateDataset`.
- **Cấu hình repo/path linh hoạt:**
  - Đường dẫn Git Web và `work.vpmedia.vn` đọc từ `app.repoConfig` (chỉ có ở bản Internal) hoặc override trong Dev Settings.
  - Đường dẫn local `VBot-iOS` / `VBot-Android` không bao giờ hardcode vào mã nguồn; từng dev cấu hình trong Dev Settings (`localStorage`) hoặc qua CLI flag/env (`VBOT_IOS_DIR`, `VBOT_ANDROID_DIR`).
- **Tách chặt `public` vs `internal` (OWASP A01):**
  - `BUILD_TARGET=public` **chỉ** nhận thêm tính năng xuất Mermaid bản sạch (chỉ `label`, không có dữ liệu kỹ thuật) và CI leak guard (`check:public-leak`).
  - Toàn bộ 10 tính năng còn lại chỉ hiển thị khi `__ENABLE_TECH_MODE__` là `true` và được nạp qua `defineAsyncComponent` / dynamic `import()`.
  - `sanitizeForPublic()` loại bỏ hoàn toàn `node.meta`, `app.repoConfig`, `sourceFileMap`, và `existingMediaPaths`.

---

## 2. Kiến trúc tổng thể & Dòng dữ liệu

```text
virtual:flow-dataset (flowDataPlugin.ts)
   │  ├── public: sanitizeForPublic() — xóa sạch meta, repoConfig, tech fields
   │  └── internal: full dataset + existingMediaPaths + sourceFileMap
   ▼
useFlowExplorer (shallowRef + getter dataset)
   ├── Reactive Draft Overlay (datasetDraftStore.ts, Wave 4)
   ├── Canvas Lens Filter & Impact Highlight (Wave 2)
   ├── FlowCanvas / AppFlowNode / DetailDrawer (lazy Wave 2 & 4 controls)
   └── ScenarioFlowDialog (+ lazy QA Checklist tab, Wave 2)
```

### Danh sách module lõi (`src/core/` — thuần TypeScript, test độc lập với Vitest)
- `src/core/auditSyncEngine.ts`: kiểm tra chéo Mini App catalog/profiles/commands, độ phủ Media, trích xuất & kiểm tra `codeRefs`, diff `/api/apps` snapshot, quét từ khóa rò rỉ Public.
- `src/core/mermaidExport.ts`: xuất `flowchart LR/TB` (cả Public sạch & Internal), `flowchart TD` cho timeline kịch bản, và `sequenceDiagram` cho luồng tuần tự kỹ thuật.
- `src/core/workspaceSettings.ts`: quản lý `DevWorkspaceSettings` trong `localStorage`, dựng URL mở IDE (`vscode://`, `cursor://`) và Git Web an toàn.
- `src/core/vbotWorkTemplates.ts`: sinh Markdown mẫu Task / Bug cho `work.vpmedia.vn` từ Node, Parity Item và QA Fail Case; lưu trạng thái triage Parity.
- `src/core/impactAnalyzer.ts`: lập chỉ mục ngược theo 5 trục (`api_event`, `bridge_method`, `rbac_permission`, `code_ref`, `miniapp`).
- `src/core/qaChecklistEngine.ts`: sinh Test Case từ kịch bản + `edgeCases` + `platformDiffNote`, lưu tiến độ `localStorage`, xuất `.md` và `.csv`.
- `src/core/miniAppContractTestRunner.ts`: bộ kiểm thử hợp đồng Bridge tự động cho iOS/Android Simulation và đánh giá Live Iframe wire logs.
- `src/core/miniAppWireSession.ts`: chuẩn hóa phiên `vbot-bridge-session/v1` (Zod), tự động che token nhạy cảm (`redactSensitivePayload`), import và replay đối chiếu kết quả.
- `src/core/datasetDraftStore.ts`: quản lý `DraftPatch[]`, áp patch bất biến lên runtime `MergedFlowDataset` và raw files (`app.json` + `modules/*.json`) kèm `validateDataset`.

---

## 3. Chiến lược kiểm thử & xác minh

Mỗi Wave kết thúc bằng kiểm tra đầy đủ:
1. `pnpm validate:data`
2. `pnpm typecheck`
3. `pnpm test` (toàn bộ unit tests cũ + unit tests mới của Wave)
4. `pnpm audit:sync --ci`
5. `pnpm build:public && pnpm check:public-leak` (`✅ CLEAN_PUBLIC_BUNDLE`)
6. `pnpm build:internal`
