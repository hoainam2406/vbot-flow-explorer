# VBot Flow Explorer — Dev & QA Productivity Suite v2 Implementation Plan

> **For Antigravity:** Thực hiện lần lượt theo từng bước, kiểm thử TDD ở từng module `src/core/` và `plugins/`, đảm bảo OWASP A01 (`BUILD_TARGET=public` sạch hoàn toàn).

**Goal:** Triển khai trọn bộ 8 tính năng nâng cấp thuộc Phương án A trên 3 Wave cho Dev Mini App, Dev Mobile và QA/BA (giữ nguyên phần VBot Work hiện có).

**Architecture:** Logic thuần TypeScript nằm trong `src/core/`, middleware local tách riêng vào `plugins/devWorkspaceMiddleware.ts`, UI nội bộ nạp lazy qua `defineAsyncComponent` dưới cờ `__ENABLE_TECH_MODE__` và gom QA Release Hub / Data Health / Flow Snapshot Diff vào `GovernanceHubModal.vue`.

**Tech Stack:** Vue 3.5, TypeScript 6, Vite 8, Tailwind CSS v4, Zod 4, `@vue-flow/core`, Vitest 5.

---

## Breakdown & Files

### Bước 1: Modular Local Dev Middleware (`plugins/devWorkspaceMiddleware.ts` & `plugins/flowDataPlugin.ts`)
- Create: `plugins/devWorkspaceMiddleware.ts` (`isAllowedProxyUrl`, `validateGitRef`, `inspectLocalGitRepo`, `readDatasetSnapshotFromGit`, `saveUploadedMediaFile`, `registerDevWorkspaceMiddleware`)
- Modify: `plugins/flowDataPlugin.ts` (bổ sung `capabilities` ở `/__vbot-dev/status` và gọi `registerDevWorkspaceMiddleware`)
- Test: `tests/devWorkspaceMiddleware.test.ts`

### Bước 2: Wave 1 — Dev Mini App (`#1`, `#2`, `#3`)
- Modify: `src/data/miniAppBridgeCatalog.ts`, `src/core/miniAppContractBuilder.ts` (bổ sung `toggle_actions_menu` sửa dứt điểm warning `audit:sync`)
- Create: `src/core/miniAppTypeCodegen.ts`, `src/components/MiniAppContractExportPanel.vue`, `tests/miniAppTypeCodegen.test.ts`
- Create: `src/core/miniAppHostFetchMock.ts`, `src/components/MiniAppHostFetchMockPanel.vue`, `tests/miniAppHostFetchMock.test.ts`
- Modify: `src/core/miniAppSandboxEngine.ts` (hỗ trợ `options.mockRules` trong `host_fetch`)
- Create: `src/core/miniAppWireDiff.ts`, `src/components/MiniAppWireDiffPanel.vue`, `tests/miniAppWireDiff.test.ts`
- Modify: `src/components/MiniAppDevStudio.vue` (tích hợp tab `Contract & Type`, `Mock API`, `So sánh Wire`)

### Bước 3: Wave 2 — Dev Mobile (`#4`, `#5`)
- Create: `src/core/prImpactEngine.ts`, `tests/prImpactEngine.test.ts`
- Modify: `src/components/ImpactAnalysisModal.vue`, `src/App.vue` (thêm tab `Kiểm tra PR` và `Code Drift (Git)`)
- Create: `src/core/aiContextExport.ts`, `tests/aiContextExport.test.ts`
- Modify: `src/components/drawer/DetailDrawer.vue`, `src/components/ParityMatrixModal.vue`, `src/components/MiniAppDevStudio.vue` (nút **Copy AI Prompt** ở Tech mode)

### Bước 4: Wave 3 — QA / BA Quản trị Luồng (`#6`, `#7`, `#8`)
- Modify: `src/core/datasetDraftStore.ts`, `tests/datasetDraftStore.test.ts` (`update_edge`, `upsert_scenario`, `delete_scenario`, `parseImportedPatchesJson`, `buildDraftDiffSummary`)
- Modify: `src/components/drawer/NodeEditorPanel.vue` (tab `Parity & Bridge`), `src/components/DraftBanner.vue` (Xem Diff & Nhập Patch), `src/components/FlowCanvas.vue`, `src/components/ScenarioBar.vue`, `src/composables/useFlowExplorer.ts`, `src/components/nodes/AppFlowNode.vue`, `src/components/CanvasFilterBar.vue`
- Create: `src/components/EdgeEditorPopover.vue`, `src/components/ScenarioEditorModal.vue`
- Create: `src/core/qaReleaseHub.ts`, `src/components/QaReleaseHubPanel.vue`, `tests/qaReleaseHub.test.ts`
- Modify: `src/components/ScenarioQaChecklistPanel.vue` (đồng bộ active release)
- Create: `src/core/dataHealthEngine.ts`, `src/components/DataHealthPanel.vue`, `tests/dataHealthEngine.test.ts`
- Modify: `src/components/DevSettingsModal.vue` (nút upload ảnh ở tab Độ phủ Media)
- Create: `src/core/flowSnapshotDiff.ts`, `src/components/FlowSnapshotDiffPanel.vue`, `tests/flowSnapshotDiff.test.ts`
- Create: `src/components/GovernanceHubModal.vue`
- Modify: `src/App.vue`, `src/components/TopBar.vue`, `src/components/SearchModal.vue`

### Bước 5: Public Leak Guard & Kiểm tra cuối cùng
- Modify: `src/core/auditSyncEngine.ts` (bổ sung token guard cho module nội bộ mới)
- Verify: `pnpm validate:data && pnpm typecheck && pnpm test && pnpm audit:sync --ci && pnpm build:public && pnpm check:public-leak && pnpm build:internal`
