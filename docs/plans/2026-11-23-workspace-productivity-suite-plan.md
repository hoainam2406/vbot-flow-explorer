# Workspace Productivity Suite Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Load executing-plans to implement this plan task-by-task.

**Goal:** Nâng cấp `vbot-flow-explorer` qua 4 Wave với 11 tính năng quản trị dữ liệu, quy trình Dev/QA/BA hằng ngày, Mini App Dev Studio Test Suite & Replay, và Hybrid Visual Flow Editor trong khi bảo vệ tuyệt đối bản `BUILD_TARGET=public` (OWASP A01).

**Architecture:** Áp dụng Phương án A (Contextual Lazy Modules + Reactive Draft Overlay + Pure-Core Services). Toàn bộ nghiệp vụ lõi viết bằng TypeScript thuần trong `src/core/` để test độc lập bằng Vitest; mọi UI nội bộ mới chỉ load lazy phía sau `__ENABLE_TECH_MODE__`; middleware lưu trực tiếp của Vite chỉ mở khi chạy `pnpm dev` bản `internal` và luôn validate qua Zod trước khi ghi atomic.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), TypeScript 6, Vite 8, Zod 4, Tailwind CSS 4, `@vue-flow/core`, Vitest 5, `tsx`.

---

## Wave 1: Schema Metadata, CLI Audit/Sync, CI Public Leak Guard & Mermaid Export

### Task 1.1: Schema `meta` / `repoConfig`, `sanitizeForPublic` & `flowDataPlugin` metadata
- **Files:**
  - Modify: `src/data/schema.ts`
  - Modify: `src/core/graphEngine.ts`
  - Modify: `plugins/flowDataPlugin.ts`
  - Test: `tests/graphEngine.test.ts`, `tests/validateDataset.test.ts`, `tests/flowDataPlugin.test.ts`
- **Steps:**
  1. Thêm `NodeStatusSchema`, `NodeMetaSchema`, `AppRepoConfigSchema`, `SourceFileMap`, `existingMediaPaths` vào `src/data/schema.ts`.
  2. Cập nhật `sanitizeForPublic()` trong `src/core/graphEngine.ts` để cắt `repoConfig`, `existingMediaPaths`, `sourceFileMap` (và `meta` đã bị `stripNodeForPublic` loại bỏ).
  3. Xuất `collectExistingMediaPaths` và `buildSourceFileMap` trong `plugins/flowDataPlugin.ts`; chỉ đính kèm vào payload khi `buildTarget === 'internal'`.
  4. Bổ sung unit test ở 3 file test tương ứng và chạy `pnpm test`.

### Task 1.2: Audit / Sync / Public Leak Engine & CLI Scripts + CI Workflow
- **Files:**
  - Create: `src/core/auditSyncEngine.ts`
  - Create: `scripts/audit-sync.ts`, `scripts/sync-miniapps.ts`, `scripts/check-public-leak.ts`, `scripts/media-optimize.ts`
  - Modify: `package.json`, `.github/workflows/deploy-pages.yml`
  - Test: `tests/auditSync.test.ts`
- **Steps:**
  1. Cài đặt `auditMiniAppConsistency`, `auditMediaCoverage`, `extractUniqueCodeRefs`, `auditCodeRefs`, `diffMiniAppApiSnapshot`, `PUBLIC_LEAK_FORBIDDEN_TOKENS`, `scanTextForPublicLeaks` trong `src/core/auditSyncEngine.ts`.
  2. Viết 4 CLI script dưới `scripts/` và khai báo vào `package.json`.
  3. Bổ sung bước `pnpm audit:sync --ci`, `pnpm build:public`, `pnpm check:public-leak` vào `.github/workflows/deploy-pages.yml`.
  4. Viết `tests/auditSync.test.ts` và chạy test.

### Task 1.3: Xuất Mermaid (Public-safe Flowchart + Sequence Diagram)
- **Files:**
  - Create: `src/core/mermaidExport.ts`
  - Modify: `src/components/ExportMenu.vue`, `src/components/SearchModal.vue`, `src/App.vue`, `src/components/ScenarioFlowDialog.vue`
  - Test: `tests/mermaidExport.test.ts`
- **Steps:**
  1. Cài đặt `exportFlowToMermaid`, `exportScenarioTimelineToMermaid`, `exportScenarioSequenceToMermaid` với escape ký tự đặc biệt và bảo vệ chế độ `overview`.
  2. Gắn UI vào `ExportMenu.vue`, `SearchModal.vue`, `App.vue`, và `ScenarioFlowDialog.vue`.
  3. Viết `tests/mermaidExport.test.ts` và xác minh Wave 1 đầy đủ.

---

## Wave 2: Quy trình Dev / QA / BA hằng ngày (Lazy Internal-only)

### Task 2.1: Workspace Settings & Media Coverage Modal
- **Files:**
  - Create: `src/core/workspaceSettings.ts`, `src/components/DevSettingsModal.vue`
  - Modify: `src/components/TopBar.vue`, `src/components/SearchModal.vue`, `src/App.vue`
  - Test: `tests/workspaceSettings.test.ts`

### Task 2.2: Code Links, VBot Work Templates & Parity Triage Tracking
- **Files:**
  - Create: `src/core/vbotWorkTemplates.ts`
  - Modify: `src/components/drawer/TechDetailPanel.vue`, `src/components/drawer/DetailDrawer.vue`, `src/components/ParityMatrixModal.vue`
  - Test: `tests/vbotWorkTemplates.test.ts`

### Task 2.3: Impact Analysis (Reverse Dependency Lookup)
- **Files:**
  - Create: `src/core/impactAnalyzer.ts`, `src/components/ImpactAnalysisModal.vue`
  - Modify: `src/composables/useFlowExplorer.ts`, `src/components/SearchModal.vue`, `src/App.vue`, `src/components/drawer/TechDetailPanel.vue`, `src/components/drawer/DetailDrawer.vue`
  - Test: `tests/impactAnalyzer.test.ts`

### Task 2.4: Canvas Lens Filter & Status Indicators
- **Files:**
  - Create: `src/components/CanvasFilterBar.vue`
  - Modify: `src/composables/useFlowExplorer.ts`, `src/components/FlowCanvas.vue`, `src/components/nodes/AppFlowNode.vue`

### Task 2.5: QA Test Checklist trong Scenario Dialog
- **Files:**
  - Create: `src/core/qaChecklistEngine.ts`, `src/components/ScenarioQaChecklistPanel.vue`
  - Modify: `src/components/ScenarioFlowDialog.vue`
  - Test: `tests/qaChecklistEngine.test.ts`

---

## Wave 3: Mini App Dev Studio Upgrades (Contract Test Suite & Wire Log Replay)

### Task 3.1: Automated Bridge Contract Test Runner
- **Files:**
  - Create: `src/core/miniAppContractTestRunner.ts`
  - Test: `tests/miniAppContractTestRunner.test.ts`

### Task 3.2: Wire Log Export, Import, Redaction & Replay Engine
- **Files:**
  - Create: `src/core/miniAppWireSession.ts`
  - Test: `tests/miniAppWireSession.test.ts`

### Task 3.3: Tích hợp Test Suite Tab & Replay Toolbar vào `MiniAppDevStudio.vue`
- **Files:**
  - Modify: `src/components/MiniAppDevStudio.vue`

---

## Wave 4: Hybrid Visual Flow Editor (Reactive Draft Overlay + Local Dev Save Middleware)

### Task 4.1: Chuyển `useFlowExplorer.ts` sang Reactive `datasetRef`
- **Files:**
  - Modify: `src/composables/useFlowExplorer.ts`

### Task 4.2: Draft Patch Store & Raw File Patching
- **Files:**
  - Create: `src/core/datasetDraftStore.ts`
  - Test: `tests/datasetDraftStore.test.ts`

### Task 4.3: Local Dev Save Middleware trong `plugins/flowDataPlugin.ts`
- **Files:**
  - Modify: `plugins/flowDataPlugin.ts`
  - Test: `tests/flowDataPlugin.test.ts`

### Task 4.4: Contextual Visual Editor UI (`NodeEditorPanel`, `AddFlowElementModal`, `DraftBanner`)
- **Files:**
  - Create: `src/components/drawer/NodeEditorPanel.vue`, `src/components/AddFlowElementModal.vue`, `src/components/DraftBanner.vue`
  - Modify: `src/components/drawer/DetailDrawer.vue`, `src/App.vue`
