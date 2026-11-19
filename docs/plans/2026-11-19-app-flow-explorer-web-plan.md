# VBot App Flow Explorer (Vue 3) Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Load executing-plans to implement this plan task-by-task.

**Goal:** Khởi tạo và hoàn thiện repo web tĩnh Vue 3 (`vbot-flow-explorer`) hiển thị toàn bộ chức năng & luồng xử lý của app dưới dạng 1 biểu đồ Expand/Collapse thống nhất, hỗ trợ ảnh/video minh họa, chuyển đổi chế độ Tổng quan/Kỹ thuật và tách 2 bản build Public/Internal bảo mật không cần Backend.

**Architecture:** Toàn bộ dữ liệu cây–luồng nằm trong `data/app.json` và `data/modules/*.json`. Plugin Vite `plugins/flowDataPlugin.ts` đọc và kiểm tra schema bằng `zod` ngay lúc biên dịch/dev: bản `BUILD_TARGET=public` cắt bỏ hoàn toàn node/edge/media/scenario `tech` (kèm nối tắt cạnh ẩn `bridgeHiddenEdges`) và xóa asset ảnh `tech` khỏi thư mục build; bản `BUILD_TARGET=internal` giữ đầy đủ và mở công tắc `Tổng quan | Kỹ thuật`. Giao diện dùng `@vue-flow/core` + `@dagrejs/dagre` để dàn layout động mỗi khi bung/thu gọn nhánh.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), `@vue-flow/core`, `@vue-flow/controls`, `@vue-flow/minimap`, `@vue-flow/background`, `@dagrejs/dagre`, `zod`, `lucide-vue-next`, `vitest`, `@vue/test-utils`.

> **Lưu ý quy ước đường dẫn:** Mọi đường dẫn trong kế hoạch này tính từ thư mục gốc của **repo web mới** `vbot-flow-explorer/` (nằm ngoài repo `VBot-iOS`, ví dụ `../vbot-flow-explorer`). Dữ liệu mẫu nguồn cần copy nằm tại `VBot-iOS/docs/flow-explorer-sample/`.

---

### Task 1: Khởi tạo repo Vue 3, cài dependencies và nạp dữ liệu mẫu

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/style.css`
- Create: `data/app.json` (copy từ `VBot-iOS/docs/flow-explorer-sample/app.json`)
- Create: `data/modules/calling.json`, `data/modules/auth.json`, `data/modules/contacts.json`

**Step 1: Tạo thư mục repo mới và khởi tạo khung Vite Vue TS**

```bash
mkdir -p ../vbot-flow-explorer
cd ../vbot-flow-explorer
npm create vite@latest . -- --template vue-ts
git init
```

Expected: Thư mục `../vbot-flow-explorer` có sẵn `package.json`, `tsconfig.json`, `src/App.vue`, `src/main.ts`.

**Step 2: Cài đặt thư viện runtime và devDependencies**

```bash
npm install @vue-flow/core @vue-flow/controls @vue-flow/minimap @vue-flow/background @dagrejs/dagre zod lucide-vue-next
npm install -D tailwindcss @tailwindcss/vite vitest @vue/test-utils jsdom @types/node tsx
```

Expected: Cài đặt thành công không có peer dependency error, sinh `package-lock.json`.

**Step 3: Copy dữ liệu mẫu và cập nhật `package.json` scripts + `src/style.css`**

```bash
mkdir -p data/modules public/media/app public/media/calling public/media/auth public/media/contacts
cp -R ../VBot-iOS/docs/flow-explorer-sample/* data/
```

Cập nhật `package.json` (thêm các script):
```json
{
  "scripts": {
    "dev": "BUILD_TARGET=internal vite",
    "dev:public": "BUILD_TARGET=public vite",
    "build:public": "BUILD_TARGET=public vite build --outDir dist-public",
    "build:internal": "BUILD_TARGET=internal vite build --outDir dist-internal",
    "test": "vitest run",
    "validate:data": "tsx scripts/validate-data.ts",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

Ghi `src/style.css`:
```css
@import "tailwindcss";
@import "@vue-flow/core/dist/style.css";
@import "@vue-flow/core/dist/theme-default.css";
@import "@vue-flow/controls/dist/style.css";
@import "@vue-flow/minimap/dist/style.css";

html, body, #app {
  height: 100%;
  margin: 0;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

**Step 4: Commit khởi tạo**

```bash
git add .
git commit -m "chore: scaffold Vue 3 + Vue Flow repo and import VBot sample data"
```

---

### Task 2: Định nghĩa Schema TypeScript + Zod Validator toàn vẹn dữ liệu

**Files:**
- Create: `src/data/schema.ts`
- Create: `src/data/validateDataset.ts`
- Create: `scripts/validate-data.ts`
- Test: `tests/validateDataset.test.ts`

**Step 1: Write the failing test**

```ts
// tests/validateDataset.test.ts
import { describe, expect, it } from 'vitest';
import { validateDataset } from '../src/data/validateDataset';
import type { AppManifest, FlowModuleFile } from '../src/data/schema';

const validManifest: AppManifest = {
  schemaVersion: '1.0',
  app: { name: 'VBot', tagline: 'Test' },
  rootNode: {
    id: 'vbot-app',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'mod-a',
      label: 'Module A',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Mod A' },
    },
  ],
  branchEdges: [{ id: 'e-root-a', source: 'vbot-app', target: 'mod-a' }],
  moduleFiles: ['a'],
};

const validModule: FlowModuleFile = {
  schemaVersion: '1.0',
  moduleId: 'mod-a',
  subtrees: {
    'mod-a': {
      title: 'Chi tiết A',
      layoutHint: 'flow',
      entryNodeIds: ['a-1'],
      nodes: [
        {
          id: 'a-1',
          label: 'Bước 1',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Bước 1' },
          relatedNodeIds: ['non-existent-node'],
        },
      ],
      edges: [],
    },
  },
};

describe('validateDataset', () => {
  it('detects broken relatedNodeIds and duplicate node IDs', () => {
    const errors = validateDataset(validManifest, [validModule]);
    expect(errors.some((e) => e.includes('non-existent-node'))).toBe(true);
  });

  it('returns zero errors for valid dataset', () => {
    const cleanModule: FlowModuleFile = {
      ...validModule,
      subtrees: {
        'mod-a': {
          ...validModule.subtrees['mod-a'],
          nodes: [
            {
              id: 'a-1',
              label: 'Bước 1',
              kind: 'action',
              audience: 'all',
              summary: { overview: 'Bước 1' },
            },
          ],
        },
      },
    };
    expect(validateDataset(validManifest, [cleanModule])).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validateDataset.test.ts`
Expected: FAIL với lỗi không tìm thấy `../src/data/validateDataset`.

**Step 3: Implement `src/data/schema.ts` và `src/data/validateDataset.ts`**

```ts
// src/data/schema.ts
import { z } from 'zod';

export const NodeKindSchema = z.enum([
  'module',
  'action',
  'process',
  'decision',
  'external',
  'error',
]);

export const AudienceScopeSchema = z.enum(['all', 'tech']);

export const MediaItemSchema = z.object({
  src: z.string().min(1),
  caption: z.string().min(1),
  type: z.enum(['image', 'video']).optional(),
  frame: z.enum(['phone', 'none']).optional(),
  audience: AudienceScopeSchema.optional(),
});

export const TechDetailSchema = z.object({
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  apisOrEvents: z.array(z.string()).optional(),
  edgeCases: z.array(z.string()).optional(),
  codeRefs: z.array(z.string()).optional(),
});

export const FlowNodeDataSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: NodeKindSchema,
  audience: AudienceScopeSchema,
  summary: z.object({
    overview: z.string().min(1),
    tech: z.string().optional(),
  }),
  media: z.array(MediaItemSchema).optional(),
  techDetail: TechDetailSchema.optional(),
  relatedNodeIds: z.array(z.string()).optional(),
});

export const FlowEdgeDataSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  audience: AudienceScopeSchema.optional(),
});

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  audience: AudienceScopeSchema.optional(),
  nodeIds: z.array(z.string()),
  edgeIds: z.array(z.string()),
});

export const SubtreeDefinitionSchema = z.object({
  title: z.string().min(1),
  layoutHint: z.enum(['tree', 'flow']),
  direction: z.enum(['LR', 'TB']).optional(),
  entryNodeIds: z.array(z.string().min(1)).min(1),
  nodes: z.array(FlowNodeDataSchema).min(1),
  edges: z.array(FlowEdgeDataSchema),
  scenarios: z.array(ScenarioSchema).optional(),
});

export const FlowModuleFileSchema = z.object({
  schemaVersion: z.literal('1.0'),
  moduleId: z.string().min(1),
  subtrees: z.record(z.string(), SubtreeDefinitionSchema),
});

export const AppManifestSchema = z.object({
  schemaVersion: z.literal('1.0'),
  app: z.object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    version: z.string().optional(),
  }),
  rootNode: FlowNodeDataSchema,
  branches: z.array(FlowNodeDataSchema).min(1),
  branchEdges: z.array(FlowEdgeDataSchema),
  moduleFiles: z.array(z.string()),
  inlineSubtrees: z.record(z.string(), SubtreeDefinitionSchema).optional(),
});

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type AudienceScope = z.infer<typeof AudienceScopeSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type TechDetail = z.infer<typeof TechDetailSchema>;
export type FlowNodeData = z.infer<typeof FlowNodeDataSchema>;
export type FlowEdgeData = z.infer<typeof FlowEdgeDataSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type SubtreeDefinition = z.infer<typeof SubtreeDefinitionSchema>;
export type FlowModuleFile = z.infer<typeof FlowModuleFileSchema>;
export type AppManifest = z.infer<typeof AppManifestSchema>;

export interface MergedFlowDataset {
  app: AppManifest['app'];
  rootNode: FlowNodeData;
  branches: FlowNodeData[];
  branchEdges: FlowEdgeData[];
  subtreesByParentId: Record<string, SubtreeDefinition>;
}
```

```ts
// src/data/validateDataset.ts
import {
  AppManifestSchema,
  FlowModuleFileSchema,
  type AppManifest,
  type FlowModuleFile,
  type SubtreeDefinition,
} from './schema';

export function validateDataset(
  rawManifest: unknown,
  rawModules: unknown[],
): string[] {
  const errors: string[] = [];
  const manifestParsed = AppManifestSchema.safeParse(rawManifest);
  if (!manifestParsed.success) {
    return [`Invalid app.json: ${manifestParsed.error.message}`];
  }
  const manifest: AppManifest = manifestParsed.data;
  const modules: FlowModuleFile[] = [];

  rawModules.forEach((raw, idx) => {
    const modParsed = FlowModuleFileSchema.safeParse(raw);
    if (!modParsed.success) {
      errors.push(`Invalid module[${idx}]: ${modParsed.error.message}`);
    } else {
      modules.push(modParsed.data);
    }
  });
  if (errors.length > 0) return errors;

  const allNodeIds = new Set<string>();
  const registerNode = (id: string, ctx: string) => {
    if (allNodeIds.has(id)) {
      errors.push(`Duplicate node id "${id}" at ${ctx}`);
    }
    allNodeIds.add(id);
  };

  registerNode(manifest.rootNode.id, 'rootNode');
  manifest.branches.forEach((b) => registerNode(b.id, `branches/${b.id}`));

  const subtrees: Record<string, SubtreeDefinition> = {
    ...(manifest.inlineSubtrees ?? {}),
  };
  const branchIds = new Set(manifest.branches.map((b) => b.id));

  for (const mod of modules) {
    if (!branchIds.has(mod.moduleId)) {
      errors.push(`Module "${mod.moduleId}" does not match any branch id`);
    }
    Object.assign(subtrees, mod.subtrees);
  }

  for (const [parentId, subtree] of Object.entries(subtrees)) {
    subtree.nodes.forEach((n) => registerNode(n.id, `subtree/${parentId}`));
  }

  // Validate references
  manifest.branchEdges.forEach((e) => {
    if (!allNodeIds.has(e.source) || !allNodeIds.has(e.target)) {
      errors.push(`Broken branchEdge "${e.id}": ${e.source} -> ${e.target}`);
    }
  });

  for (const [parentId, subtree] of Object.entries(subtrees)) {
    if (!allNodeIds.has(parentId)) {
      errors.push(`Subtree parent "${parentId}" does not exist`);
    }
    const localIds = new Set(subtree.nodes.map((n) => n.id));
    const localEdgeIds = new Set(subtree.edges.map((e) => e.id));

    for (const entryId of subtree.entryNodeIds) {
      if (!localIds.has(entryId)) {
        errors.push(`Subtree "${parentId}" entryNodeId "${entryId}" missing in local nodes`);
      }
    }
    for (const edge of subtree.edges) {
      if (!localIds.has(edge.source) || !localIds.has(edge.target)) {
        errors.push(`Subtree "${parentId}" edge "${edge.id}" references missing node`);
      }
    }
    for (const sc of subtree.scenarios ?? []) {
      sc.nodeIds.forEach((nid) => {
        if (!allNodeIds.has(nid)) {
          errors.push(`Scenario "${sc.id}" references missing node "${nid}"`);
        }
      });
      sc.edgeIds.forEach((eid) => {
        if (!localEdgeIds.has(eid)) {
          errors.push(`Scenario "${sc.id}" references missing edge "${eid}" in "${parentId}"`);
        }
      });
    }
  }

  const checkRelated = (nodes: { id: string; relatedNodeIds?: string[] }[]) => {
    for (const n of nodes) {
      for (const rel of n.relatedNodeIds ?? []) {
        if (!allNodeIds.has(rel)) {
          errors.push(`Node "${n.id}" has broken relatedNodeId "${rel}"`);
        }
      }
    }
  };
  checkRelated([manifest.rootNode, ...manifest.branches]);
  Object.values(subtrees).forEach((s) => checkRelated(s.nodes));

  return errors;
}
```

Tạo thêm CLI `scripts/validate-data.ts`:
```ts
// scripts/validate-data.ts
import fs from 'node:fs';
import path from 'node:path';
import { validateDataset } from '../src/data/validateDataset';

const dataDir = path.resolve(process.cwd(), 'data');
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'app.json'), 'utf8'));
const modules = (manifest.moduleFiles as string[]).map((name) =>
  JSON.parse(fs.readFileSync(path.join(dataDir, 'modules', `${name}.json`), 'utf8')),
);
const errors = validateDataset(manifest, modules);
if (errors.length > 0) {
  console.error('❌ Data validation failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('✅ All flow data JSON files are valid.');
```

**Step 4: Run test & validate sample data**

Run: `npx vitest run tests/validateDataset.test.ts && npm run validate:data`
Expected: PASS (2 tests passed) và `✅ All flow data JSON files are valid.`

**Step 5: Commit**

```bash
git add src/data/ scripts/validate-data.ts tests/validateDataset.test.ts
git commit -m "feat(data): add Zod schemas and dataset integrity validator"
```

---

### Task 3: Graph Merger, Audience Sanitizer & Smart Edge Bridging Engine

**Files:**
- Create: `src/core/graphEngine.ts`
- Test: `tests/graphEngine.test.ts`

**Step 1: Write the failing test**

```ts
// tests/graphEngine.test.ts
import { describe, expect, it } from 'vitest';
import {
  mergeDataset,
  sanitizeForPublic,
  filterAndBridgeSubtree,
  buildVisibleTreeFlow,
  countDescendants,
} from '../src/core/graphEngine';
import type { AppManifest, FlowModuleFile } from '../src/data/schema';

const manifest: AppManifest = {
  schemaVersion: '1.0',
  app: { name: 'VBot', tagline: 'Demo' },
  rootNode: {
    id: 'root',
    label: 'App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'App' },
  },
  branches: [
    {
      id: 'mod-call',
      label: 'Gọi',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Gọi', tech: 'SIP + CallKit' },
      techDetail: { codeRefs: ['Secret.swift'] },
    },
  ],
  branchEdges: [{ id: 'e-r-c', source: 'root', target: 'mod-call' }],
  moduleFiles: ['call'],
};

const modCall: FlowModuleFile = {
  schemaVersion: '1.0',
  moduleId: 'mod-call',
  subtrees: {
    'mod-call': {
      title: 'Chi tiết Gọi',
      layoutHint: 'flow',
      entryNodeIds: ['n1'],
      nodes: [
        { id: 'n1', label: 'Nhận Push', kind: 'external', audience: 'all', summary: { overview: 'Push' } },
        { id: 'n2', label: 'Raw Log', kind: 'process', audience: 'tech', summary: { overview: 'Log', tech: 'RAM' }, techDetail: { codeRefs: ['Log.swift'] } },
        { id: 'n3', label: 'Đổ chuông', kind: 'action', audience: 'all', summary: { overview: 'Ring' } },
      ],
      edges: [
        { id: 'e12', source: 'n1', target: 'n2' },
        { id: 'e23', source: 'n2', target: 'n3', label: 'OK' },
      ],
      scenarios: [
        { id: 's-all', name: 'Chuẩn', audience: 'all', nodeIds: ['n1', 'n2', 'n3'], edgeIds: ['e12', 'e23'] },
        { id: 's-tech', name: 'Debug', audience: 'tech', nodeIds: ['n2'], edgeIds: [] },
      ],
    },
  },
};

describe('graphEngine', () => {
  it('bridges edges across hidden tech nodes in overview mode', () => {
    const dataset = mergeDataset(manifest, [modCall]);
    const bridged = filterAndBridgeSubtree(dataset.subtreesByParentId['mod-call'], 'overview');
    expect(bridged.nodes.map((n) => n.id)).toEqual(['n1', 'n3']);
    expect(bridged.edges).toHaveLength(1);
    expect(bridged.edges[0].source).toBe('n1');
    expect(bridged.edges[0].target).toBe('n3');
  });

  it('strips all tech fields and bridges edges in sanitizeForPublic', () => {
    const dataset = mergeDataset(manifest, [modCall]);
    const pub = sanitizeForPublic(dataset);
    const jsonText = JSON.stringify(pub);
    expect(jsonText).not.toContain('Secret.swift');
    expect(jsonText).not.toContain('SIP + CallKit');
    expect(jsonText).not.toContain('Raw Log');
    expect(pub.subtreesByParentId['mod-call'].scenarios?.map((s) => s.id)).toEqual(['s-all']);
  });

  it('expands branches and counts visible descendants accurately', () => {
    const dataset = mergeDataset(manifest, [modCall]);
    expect(countDescendants(dataset, 'mod-call', 'overview')).toBe(2);
    expect(countDescendants(dataset, 'mod-call', 'tech')).toBe(3);

    const collapsed = buildVisibleTreeFlow(dataset, new Set(), 'overview');
    expect(collapsed.nodes.map((n) => n.id)).toEqual(['root', 'mod-call']);

    const expanded = buildVisibleTreeFlow(dataset, new Set(['mod-call']), 'overview');
    expect(expanded.nodes.map((n) => n.id)).toEqual(['root', 'mod-call', 'n1', 'n3']);
    expect(expanded.edges.some((e) => e.source === 'mod-call' && e.target === 'n1')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graphEngine.test.ts`
Expected: FAIL với lỗi không tìm thấy `../src/core/graphEngine`.

**Step 3: Implement `src/core/graphEngine.ts`**

```ts
// src/core/graphEngine.ts
import type {
  AppManifest,
  FlowEdgeData,
  FlowModuleFile,
  FlowNodeData,
  MergedFlowDataset,
  SubtreeDefinition,
} from '../data/schema';

export type ViewMode = 'overview' | 'tech';

export function mergeDataset(
  manifest: AppManifest,
  modules: FlowModuleFile[],
): MergedFlowDataset {
  const subtreesByParentId: Record<string, SubtreeDefinition> = {
    ...(manifest.inlineSubtrees ?? {}),
  };
  for (const mod of modules) {
    Object.assign(subtreesByParentId, mod.subtrees);
  }
  return {
    app: manifest.app,
    rootNode: manifest.rootNode,
    branches: manifest.branches,
    branchEdges: manifest.branchEdges,
    subtreesByParentId,
  };
}

function isVisibleForMode(audience: 'all' | 'tech' | undefined, mode: ViewMode): boolean {
  return mode === 'tech' || (audience ?? 'all') === 'all';
}

export function filterAndBridgeSubtree(
  subtree: SubtreeDefinition,
  mode: ViewMode,
): SubtreeDefinition {
  if (mode === 'tech') return subtree;

  const visibleIds = new Set(
    subtree.nodes.filter((n) => isVisibleForMode(n.audience, 'overview')).map((n) => n.id),
  );
  const activeEdges = subtree.edges.filter((e) => isVisibleForMode(e.audience, 'overview'));

  const outgoing = new Map<string, FlowEdgeData[]>();
  for (const edge of activeEdges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  // BFS từ mỗi node visible đi xuyên qua các node bị ẩn để nối tắt tới node visible kế tiếp
  const bridgedEdges: FlowEdgeData[] = [];
  const seenPairs = new Set<string>();

  const collectVisibleTargets = (startId: string): { target: string; labels: string[] }[] => {
    const results: { target: string; labels: string[] }[] = [];
    const queue: { id: string; labels: string[] }[] = [{ id: startId, labels: [] }];
    const visitedHidden = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of outgoing.get(current.id) ?? []) {
        const nextLabels = edge.label ? [...current.labels, edge.label] : current.labels;
        if (visibleIds.has(edge.target)) {
          results.push({ target: edge.target, labels: nextLabels });
        } else if (!visitedHidden.has(edge.target)) {
          visitedHidden.add(edge.target);
          queue.push({ id: edge.target, labels: nextLabels });
        }
      }
    }
    return results;
  };

  for (const sourceId of visibleIds) {
    for (const hit of collectVisibleTargets(sourceId)) {
      if (hit.target === sourceId) continue;
      const pairKey = `${sourceId}->${hit.target}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      bridgedEdges.push({
        id: `bridge-${sourceId}-${hit.target}`,
        source: sourceId,
        target: hit.target,
        label: hit.labels[0],
        audience: 'all',
      });
    }
  }

  // Nếu entryNodeId bị ẩn, dịch chuyển entry sang node visible kế tiếp
  const nextEntries: string[] = [];
  const entrySeen = new Set<string>();
  for (const entryId of subtree.entryNodeIds) {
    if (visibleIds.has(entryId)) {
      if (!entrySeen.has(entryId)) {
        entrySeen.add(entryId);
        nextEntries.push(entryId);
      }
    } else {
      for (const hit of collectVisibleTargets(entryId)) {
        if (!entrySeen.has(hit.target)) {
          entrySeen.add(hit.target);
          nextEntries.push(hit.target);
        }
      }
    }
  }

  const visibleNodes = subtree.nodes.filter((n) => visibleIds.has(n.id));
  const visibleEdgeIds = new Set(bridgedEdges.map((e) => e.id));

  return {
    ...subtree,
    entryNodeIds: nextEntries,
    nodes: visibleNodes,
    edges: bridgedEdges,
    scenarios: (subtree.scenarios ?? [])
      .filter((s) => isVisibleForMode(s.audience, 'overview'))
      .map((s) => ({
        ...s,
        nodeIds: s.nodeIds.filter((id) => visibleIds.has(id)),
        edgeIds: s.edgeIds.filter((id) => visibleEdgeIds.has(id)),
      })),
  };
}

function stripNodeForPublic(node: FlowNodeData, allowedIds: Set<string>): FlowNodeData {
  const publicMedia = (node.media ?? [])
    .filter((m) => (m.audience ?? 'all') === 'all')
    .map(({ audience: _aud, ...rest }) => rest);

  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    audience: 'all',
    summary: { overview: node.summary.overview },
    ...(publicMedia.length > 0 ? { media: publicMedia } : {}),
    ...(node.relatedNodeIds?.length
      ? { relatedNodeIds: node.relatedNodeIds.filter((id) => allowedIds.has(id)) }
      : {}),
  };
}

export function sanitizeForPublic(dataset: MergedFlowDataset): MergedFlowDataset {
  const visibleBranches = dataset.branches.filter((b) => isVisibleForMode(b.audience, 'overview'));
  const filteredSubtrees: Record<string, SubtreeDefinition> = {};
  const allowedIds = new Set<string>([dataset.rootNode.id, ...visibleBranches.map((b) => b.id)]);

  // Chỉ giữ subtree của các parent tồn tại và không bị ẩn
  const collectAllowed = (parentId: string, visited = new Set<string>()) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    const bridged = filterAndBridgeSubtree(sub, 'overview');
    if (bridged.nodes.length === 0) return;
    filteredSubtrees[parentId] = bridged;
    for (const node of bridged.nodes) {
      allowedIds.add(node.id);
      collectAllowed(node.id, visited);
    }
  };

  for (const branch of visibleBranches) {
    collectAllowed(branch.id);
  }

  for (const key of Object.keys(filteredSubtrees)) {
    filteredSubtrees[key] = {
      ...filteredSubtrees[key],
      nodes: filteredSubtrees[key].nodes.map((n) => stripNodeForPublic(n, allowedIds)),
    };
  }

  return {
    app: dataset.app,
    rootNode: stripNodeForPublic(dataset.rootNode, allowedIds),
    branches: visibleBranches.map((b) => stripNodeForPublic(b, allowedIds)),
    branchEdges: dataset.branchEdges.filter(
      (e) =>
        isVisibleForMode(e.audience, 'overview') &&
        allowedIds.has(e.source) &&
        allowedIds.has(e.target),
    ),
    subtreesByParentId: filteredSubtrees,
  };
}

export function countDescendants(
  dataset: MergedFlowDataset,
  parentId: string,
  mode: ViewMode,
  visited = new Set<string>(),
): number {
  if (visited.has(parentId)) return 0;
  visited.add(parentId);
  const raw = dataset.subtreesByParentId[parentId];
  if (!raw) return 0;
  const sub = filterAndBridgeSubtree(raw, mode);
  let total = sub.nodes.length;
  for (const node of sub.nodes) {
    total += countDescendants(dataset, node.id, mode, visited);
  }
  return total;
}

export interface VisibleFlowResult {
  nodes: FlowNodeData[];
  edges: FlowEdgeData[];
  nodeParentMap: Record<string, string>;
  activeScenarios: NonNullable<SubtreeDefinition['scenarios']>;
}

export function buildVisibleTreeFlow(
  dataset: MergedFlowDataset,
  expandedIds: Set<string>,
  mode: ViewMode,
  focusRootId?: string | null,
): VisibleFlowResult {
  const nodes: FlowNodeData[] = [];
  const edges: FlowEdgeData[] = [];
  const nodeParentMap: Record<string, string> = {};
  const addedNodes = new Set<string>();
  const activeScenarios: NonNullable<SubtreeDefinition['scenarios']> = [];

  const pushNode = (node: FlowNodeData, parentId?: string) => {
    if (addedNodes.has(node.id)) return;
    addedNodes.add(node.id);
    nodes.push(node);
    if (parentId) nodeParentMap[node.id] = parentId;
  };

  const expandSubtree = (parentId: string, visited = new Set<string>()) => {
    if (visited.has(parentId) || !expandedIds.has(parentId)) return;
    visited.add(parentId);
    const raw = dataset.subtreesByParentId[parentId];
    if (!raw) return;
    const sub = filterAndBridgeSubtree(raw, mode);
    if (sub.scenarios?.length) activeScenarios.push(...sub.scenarios);

    for (const node of sub.nodes) {
      pushNode(node, parentId);
    }
    for (const entryId of sub.entryNodeIds) {
      edges.push({
        id: `expand-${parentId}-${entryId}`,
        source: parentId,
        target: entryId,
      });
    }
    edges.push(...sub.edges);

    for (const node of sub.nodes) {
      expandSubtree(node.id, visited);
    }
  };

  if (focusRootId && focusRootId !== dataset.rootNode.id) {
    const focusNode = findNodeById(dataset, focusRootId);
    if (focusNode) {
      pushNode(focusNode);
      expandSubtree(focusNode.id);
      return { nodes, edges, nodeParentMap, activeScenarios };
    }
  }

  pushNode(dataset.rootNode);
  for (const branch of dataset.branches) {
    if (!isVisibleForMode(branch.audience, mode)) continue;
    pushNode(branch, dataset.rootNode.id);
    expandSubtree(branch.id);
  }
  for (const edge of dataset.branchEdges) {
    if (addedNodes.has(edge.source) && addedNodes.has(edge.target)) {
      edges.push(edge);
    }
  }

  return { nodes, edges, nodeParentMap, activeScenarios };
}

export function findNodeById(
  dataset: MergedFlowDataset,
  nodeId: string,
): FlowNodeData | undefined {
  if (dataset.rootNode.id === nodeId) return dataset.rootNode;
  const branch = dataset.branches.find((b) => b.id === nodeId);
  if (branch) return branch;
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    const found = sub.nodes.find((n) => n.id === nodeId);
    if (found) return found;
  }
  return undefined;
}
```

**Step 4: Run test**

Run: `npx vitest run tests/graphEngine.test.ts`
Expected: PASS (3/3 passed).

**Step 5: Commit**

```bash
git add src/core/graphEngine.ts tests/graphEngine.test.ts
git commit -m "feat(core): implement graph merger, public sanitizer, edge bridging, and tree expansion"
```

---

### Task 4: Build-time Vite Plugin tách bản Public & Internal an toàn (OWASP A01)

**Files:**
- Create: `plugins/flowDataPlugin.ts`
- Create: `vite.config.ts`
- Create: `src/env.d.ts`
- Test: `tests/flowDataPlugin.test.ts`

**Step 1: Write the failing test**

```ts
// tests/flowDataPlugin.test.ts
import { describe, expect, it } from 'vitest';
import { collectTechOnlyMediaPaths } from '../plugins/flowDataPlugin';
import type { MergedFlowDataset } from '../src/data/schema';

describe('collectTechOnlyMediaPaths', () => {
  it('excludes media paths also referenced by audience=all items', () => {
    const dataset: MergedFlowDataset = {
      app: { name: 'VBot', tagline: 'Test' },
      rootNode: {
        id: 'root',
        label: 'Root',
        kind: 'module',
        audience: 'all',
        summary: { overview: 'R' },
        media: [
          { src: '/media/shared.webp', caption: 'Shared', audience: 'all' },
          { src: '/media/tech-only.webp', caption: 'Tech', audience: 'tech' },
        ],
      },
      branches: [
        {
          id: 'b-tech',
          label: 'Tech Branch',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'T' },
          media: [{ src: '/media/shared.webp', caption: 'Also shared' }],
        },
      ],
      branchEdges: [],
      subtreesByParentId: {},
    };

    const paths = collectTechOnlyMediaPaths(dataset);
    expect(paths).toEqual(['/media/tech-only.webp']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flowDataPlugin.test.ts`
Expected: FAIL với lỗi không tìm thấy `../plugins/flowDataPlugin`.

**Step 3: Implement `plugins/flowDataPlugin.ts`, `vite.config.ts` và `src/env.d.ts`**

```ts
// plugins/flowDataPlugin.ts
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { mergeDataset, sanitizeForPublic } from '../src/core/graphEngine';
import { validateDataset } from '../src/data/validateDataset';
import type { AppManifest, FlowModuleFile, FlowNodeData, MergedFlowDataset } from '../src/data/schema';

const VIRTUAL_ID = 'virtual:flow-dataset';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

export function collectTechOnlyMediaPaths(dataset: MergedFlowDataset): string[] {
  const publicSrcs = new Set<string>();
  const techSrcs = new Set<string>();

  const inspectNodes = (nodes: FlowNodeData[], parentIsTech = false) => {
    for (const node of nodes) {
      const nodeIsTech = parentIsTech || node.audience === 'tech';
      for (const m of node.media ?? []) {
        if (nodeIsTech || m.audience === 'tech') {
          techSrcs.add(m.src);
        } else {
          publicSrcs.add(m.src);
        }
      }
    }
  };

  inspectNodes([dataset.rootNode]);
  inspectNodes(dataset.branches);
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    const parentTech =
      dataset.branches.find((b) => b.id === parentId)?.audience === 'tech';
    inspectNodes(sub.nodes, parentTech);
  }

  return [...techSrcs].filter((src) => !publicSrcs.has(src));
}

export function loadMergedDataset(rootDir: string): MergedFlowDataset {
  const dataDir = path.join(rootDir, 'data');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'app.json'), 'utf8'),
  ) as AppManifest;
  const modules = manifest.moduleFiles.map((name) =>
    JSON.parse(
      fs.readFileSync(path.join(dataDir, 'modules', `${name}.json`), 'utf8'),
    ) as FlowModuleFile,
  );

  const errors = validateDataset(manifest, modules);
  if (errors.length > 0) {
    throw new Error(`Flow dataset validation error:\n${errors.join('\n')}`);
  }
  return mergeDataset(manifest, modules);
}

export function flowDataPlugin(buildTarget: 'public' | 'internal'): Plugin {
  let resolvedConfig: ResolvedConfig;
  let techOnlyMedia: string[] = [];

  return {
    name: 'vbot-flow-data',
    configResolved(config) {
      resolvedConfig = config;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const merged = loadMergedDataset(resolvedConfig.root);
      techOnlyMedia = collectTechOnlyMediaPaths(merged);
      const output = buildTarget === 'public' ? sanitizeForPublic(merged) : merged;
      return `export default ${JSON.stringify(output)};`;
    },
    closeBundle() {
      if (buildTarget !== 'public') return;
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      for (const relSrc of techOnlyMedia) {
        const cleanRel = relSrc.replace(/^\/+/, '');
        const targetFile = path.resolve(outDir, cleanRel);
        if (targetFile.startsWith(outDir + path.sep) && fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile);
        }
      }
    },
  };
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { flowDataPlugin } from './plugins/flowDataPlugin';

const buildTarget = process.env.BUILD_TARGET === 'public' ? 'public' : 'internal';

export default defineConfig({
  plugins: [vue(), tailwindcss(), flowDataPlugin(buildTarget)],
  define: {
    __ENABLE_TECH_MODE__: JSON.stringify(buildTarget === 'internal'),
    __BUILD_TARGET__: JSON.stringify(buildTarget),
  },
});
```

```ts
// src/env.d.ts
/// <reference types="vite/client" />

declare const __ENABLE_TECH_MODE__: boolean;
declare const __BUILD_TARGET__: 'public' | 'internal';

declare module 'virtual:flow-dataset' {
  import type { MergedFlowDataset } from './data/schema';
  const dataset: MergedFlowDataset;
  export default dataset;
}
```

**Step 4: Run test**

Run: `npx vitest run tests/flowDataPlugin.test.ts`
Expected: PASS (1/1 passed).

**Step 5: Commit**

```bash
git add plugins/flowDataPlugin.ts vite.config.ts src/env.d.ts tests/flowDataPlugin.test.ts
git commit -m "feat(build): add Vite virtual flow dataset plugin with public/internal sanitizer"
```

---

### Task 5: Auto-Layout Dagre Composable (`useGraphLayout`)

**Files:**
- Create: `src/composables/useGraphLayout.ts`
- Test: `tests/useGraphLayout.test.ts`

**Step 1: Write the failing test**

```ts
// tests/useGraphLayout.test.ts
import { describe, expect, it } from 'vitest';
import { computeDagreLayout } from '../src/composables/useGraphLayout';
import type { FlowEdgeData, FlowNodeData } from '../src/data/schema';

describe('computeDagreLayout', () => {
  it('places child nodes to the right of root in LR direction and expands height when media shown', () => {
    const nodes: FlowNodeData[] = [
      { id: 'root', label: 'Root', kind: 'module', audience: 'all', summary: { overview: 'R' } },
      {
        id: 'child',
        label: 'Child',
        kind: 'action',
        audience: 'all',
        summary: { overview: 'C' },
        media: [{ src: '/media/x.webp', caption: 'Screen' }],
      },
    ];
    const edges: FlowEdgeData[] = [{ id: 'e1', source: 'root', target: 'child' }];

    const compact = computeDagreLayout(nodes, edges, { showCanvasMedia: false, direction: 'LR' });
    const withMedia = computeDagreLayout(nodes, edges, { showCanvasMedia: true, direction: 'LR' });

    expect(compact[1].position.x).toBeGreaterThan(compact[0].position.x);
    expect(withMedia[1].data.estimatedHeight).toBeGreaterThan(compact[1].data.estimatedHeight);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/useGraphLayout.test.ts`
Expected: FAIL với lỗi không tìm thấy `../src/composables/useGraphLayout`.

**Step 3: Implement `src/composables/useGraphLayout.ts`**

```ts
// src/composables/useGraphLayout.ts
import dagre from '@dagrejs/dagre';
import { Position, type Edge, type Node } from '@vue-flow/core';
import type { FlowEdgeData, FlowNodeData } from '../data/schema';

export interface LayoutOptions {
  direction?: 'LR' | 'TB';
  showCanvasMedia?: boolean;
}

export interface PositionedFlowNode extends Node {
  data: FlowNodeData & {
    estimatedWidth: number;
    estimatedHeight: number;
  };
}

export function computeDagreLayout(
  flowNodes: FlowNodeData[],
  flowEdges: FlowEdgeData[],
  options: LayoutOptions = {},
): PositionedFlowNode[] {
  const direction = options.direction ?? 'LR';
  const showMedia = options.showCanvasMedia ?? false;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: showMedia ? 48 : 34,
    ranksep: 90,
    marginx: 32,
    marginy: 32,
  });

  const dims = new Map<string, { w: number; h: number }>();
  for (const node of flowNodes) {
    const hasMedia = (node.media?.length ?? 0) > 0;
    const w = node.kind === 'module' ? 250 : 230;
    const h = showMedia && hasMedia ? 186 : 86;
    dims.set(node.id, { w, h });
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of flowEdges) {
    if (dims.has(edge.source) && dims.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  return flowNodes.map((node) => {
    const pos = g.node(node.id);
    const { w, h } = dims.get(node.id)!;
    return {
      id: node.id,
      type: 'appFlow',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      data: {
        ...node,
        estimatedWidth: w,
        estimatedHeight: h,
      },
    };
  });
}

export function toVueFlowEdges(
  flowEdges: FlowEdgeData[],
  highlightedEdgeIds?: Set<string>,
  dimOthers = false,
): Edge[] {
  return flowEdges.map((edge) => {
    const isHighlighted = highlightedEdgeIds?.has(edge.id) ?? false;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: isHighlighted,
      style: dimOthers
        ? {
            stroke: isHighlighted ? '#2563eb' : '#cbd5e1',
            strokeWidth: isHighlighted ? 2.6 : 1.3,
            opacity: isHighlighted ? 1 : 0.28,
          }
        : { stroke: '#94a3b8', strokeWidth: 1.7 },
    };
  });
}
```

**Step 4: Run test**

Run: `npx vitest run tests/useGraphLayout.test.ts`
Expected: PASS (1/1 passed).

**Step 5: Commit**

```bash
git add src/composables/useGraphLayout.ts tests/useGraphLayout.test.ts
git commit -m "feat(layout): add Dagre layout calculator with canvas media sizing"
```

---

### Task 6: State Điều Hướng, Accordion, Breadcrumb & Global Search

**Files:**
- Create: `src/composables/useFlowExplorer.ts`
- Create: `src/composables/useSearch.ts`
- Test: `tests/useFlowExplorer.test.ts`

**Step 1: Write the failing test**

```ts
// tests/useFlowExplorer.test.ts
import { describe, expect, it } from 'vitest';
import { createFlowExplorerState } from '../src/composables/useFlowExplorer';
import type { MergedFlowDataset } from '../src/data/schema';

const sampleDataset: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test' },
  rootNode: { id: 'root', label: 'VBot', kind: 'module', audience: 'all', summary: { overview: 'R' } },
  branches: [
    { id: 'b1', label: 'Nhánh 1', kind: 'module', audience: 'all', summary: { overview: '1' } },
    { id: 'b2', label: 'Nhánh 2', kind: 'module', audience: 'all', summary: { overview: '2' } },
  ],
  branchEdges: [
    { id: 'e1', source: 'root', target: 'b1' },
    { id: 'e2', source: 'root', target: 'b2' },
  ],
  subtreesByParentId: {
    b1: {
      title: 'Sub 1',
      layoutHint: 'flow',
      entryNodeIds: ['b1-1'],
      nodes: [{ id: 'b1-1', label: 'B1.1', kind: 'action', audience: 'all', summary: { overview: '1.1' } }],
      edges: [],
    },
    b2: {
      title: 'Sub 2',
      layoutHint: 'flow',
      entryNodeIds: ['b2-1'],
      nodes: [{ id: 'b2-1', label: 'B2.1', kind: 'action', audience: 'all', summary: { overview: '2.1' } }],
      edges: [],
    },
  },
};

describe('createFlowExplorerState', () => {
  it('collapses sibling branches when accordionMode is enabled', () => {
    const state = createFlowExplorerState(sampleDataset, false);
    state.toggleExpand('b1');
    expect(state.expandedIds.value.has('b1')).toBe(true);

    state.toggleExpand('b2');
    expect(state.expandedIds.value.has('b1')).toBe(false);
    expect(state.expandedIds.value.has('b2')).toBe(true);
  });

  it('auto-expands ancestor chain when jumping to a deep node', () => {
    const state = createFlowExplorerState(sampleDataset, true);
    state.jumpToNode('b2-1');
    expect(state.expandedIds.value.has('b2')).toBe(true);
    expect(state.selectedNodeId.value).toBe('b2-1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/useFlowExplorer.test.ts`
Expected: FAIL với lỗi không tìm thấy `../src/composables/useFlowExplorer`.

**Step 3: Implement `src/composables/useFlowExplorer.ts` và `src/composables/useSearch.ts`**

```ts
// src/composables/useFlowExplorer.ts
import { computed, ref } from 'vue';
import {
  buildVisibleTreeFlow,
  countDescendants,
  findNodeById,
  type ViewMode,
} from '../core/graphEngine';
import type { FlowNodeData, MergedFlowDataset } from '../data/schema';

export function buildParentIndex(dataset: MergedFlowDataset): Record<string, string> {
  const parentOf: Record<string, string> = {};
  for (const branch of dataset.branches) {
    parentOf[branch.id] = dataset.rootNode.id;
  }
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const node of sub.nodes) {
      parentOf[node.id] = parentId;
    }
  }
  return parentOf;
}

export function createFlowExplorerState(
  dataset: MergedFlowDataset,
  allowTechMode: boolean,
) {
  const audienceMode = ref<ViewMode>('overview');
  const expandedIds = ref<Set<string>>(new Set());
  const accordionMode = ref(true);
  const focusRootId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const activeScenarioId = ref<string | null>(null);
  const showCanvasMedia = ref(false);

  const parentIndex = buildParentIndex(dataset);

  const setAudienceMode = (next: ViewMode) => {
    audienceMode.value = allowTechMode ? next : 'overview';
    activeScenarioId.value = null;
  };

  const getAncestorChain = (nodeId: string): string[] => {
    const chain: string[] = [];
    let cursor: string | undefined = nodeId;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      chain.unshift(cursor);
      cursor = parentIndex[cursor];
    }
    return chain;
  };

  const toggleExpand = (nodeId: string) => {
    if (!dataset.subtreesByParentId[nodeId]) return;
    const next = new Set(expandedIds.value);

    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      if (accordionMode.value) {
        const parent = parentIndex[nodeId];
        // Thu gọn các nhánh anh em cùng cha và con cháu của chúng
        for (const id of [...next]) {
          if (id !== nodeId && parentIndex[id] === parent) {
            next.delete(id);
          }
        }
      }
      next.add(nodeId);
    }
    expandedIds.value = next;
    activeScenarioId.value = null;
  };

  const jumpToNode = (nodeId: string) => {
    const ancestors = getAncestorChain(nodeId);
    const next = new Set(accordionMode.value ? [] : expandedIds.value);
    for (const ancId of ancestors.slice(0, -1)) {
      if (dataset.subtreesByParentId[ancId]) {
        next.add(ancId);
      }
    }
    expandedIds.value = next;
    selectedNodeId.value = nodeId;
    if (focusRootId.value && !ancestors.includes(focusRootId.value)) {
      focusRootId.value = null;
    }
  };

  const visibleFlow = computed(() =>
    buildVisibleTreeFlow(
      dataset,
      expandedIds.value,
      audienceMode.value,
      focusRootId.value,
    ),
  );

  const selectedNode = computed<FlowNodeData | null>(() =>
    selectedNodeId.value ? findNodeById(dataset, selectedNodeId.value) ?? null : null,
  );

  const breadcrumbNodes = computed<FlowNodeData[]>(() => {
    const anchor = focusRootId.value ?? selectedNodeId.value ?? dataset.rootNode.id;
    return getAncestorChain(anchor)
      .map((id) => findNodeById(dataset, id))
      .filter((n): n is FlowNodeData => Boolean(n));
  });

  const getChildCount = (nodeId: string) =>
    countDescendants(dataset, nodeId, audienceMode.value);

  const hasSubtree = (nodeId: string) => Boolean(dataset.subtreesByParentId[nodeId]);

  return {
    audienceMode,
    expandedIds,
    accordionMode,
    focusRootId,
    selectedNodeId,
    activeScenarioId,
    showCanvasMedia,
    visibleFlow,
    selectedNode,
    breadcrumbNodes,
    setAudienceMode,
    toggleExpand,
    jumpToNode,
    getChildCount,
    hasSubtree,
  };
}
```

```ts
// src/composables/useSearch.ts
import type { ViewMode } from '../core/graphEngine';
import type { FlowNodeData, MergedFlowDataset } from '../data/schema';

export interface SearchHit {
  node: FlowNodeData;
  groupTitle: string;
}

export function searchFlowNodes(
  dataset: MergedFlowDataset,
  query: string,
  mode: ViewMode,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];
  const match = (n: FlowNodeData, groupTitle: string) => {
    if (mode === 'overview' && n.audience === 'tech') return;
    const haystack = [
      n.label,
      n.summary.overview,
      ...(mode === 'tech'
        ? [
            n.summary.tech ?? '',
            ...(n.techDetail?.apisOrEvents ?? []),
            ...(n.techDetail?.codeRefs ?? []),
          ]
        : []),
    ]
      .join(' ')
      .toLowerCase();
    if (haystack.includes(q)) hits.push({ node: n, groupTitle });
  };

  match(dataset.rootNode, 'Tổng quan');
  dataset.branches.forEach((b) => match(b, 'Chức năng lớn'));
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    sub.nodes.forEach((n) => match(n, sub.title));
  }
  return hits.slice(0, 20);
}
```

**Step 4: Run test**

Run: `npx vitest run tests/useFlowExplorer.test.ts`
Expected: PASS (2/2 passed).

**Step 5: Commit**

```bash
git add src/composables/useFlowExplorer.ts src/composables/useSearch.ts tests/useFlowExplorer.test.ts
git commit -m "feat(state): add flow explorer navigation, accordion, breadcrumb, and search"
```

---

### Task 7: Custom Node, TopBar & FlowCanvas Components

**Files:**
- Create: `src/components/nodes/AppFlowNode.vue`
- Create: `src/components/TopBar.vue`
- Create: `src/components/ScenarioBar.vue`
- Create: `src/components/SearchModal.vue`
- Create: `src/components/FlowCanvas.vue`

**Step 1: Tạo `src/components/nodes/AppFlowNode.vue`**
- Dùng bản đồ màu cố định theo `data.kind` (`module`, `action`, `process`, `decision`, `external`, `error`).
- Hiện badge loại node, nhãn `Kỹ thuật` (nếu `audience === 'tech'`), icon ảnh nếu có `media`.
- Nếu `showCanvasMedia && visibleMedia[0]`, render thumbnail gọn (`h-20 object-cover rounded-lg`) kèm `@error` ẩn an toàn.
- Trên mép phải render nút tròn `+N` / `−` để gọi `toggleExpand(data.id)` với `@click.stop` (không mở nhầm Drawer); bấm vào thân node để chọn mở Drawer.

**Step 2: Tạo `src/components/TopBar.vue`, `ScenarioBar.vue`, `SearchModal.vue`, `FlowCanvas.vue`**
- `TopBar.vue`: Hiển thị tên app, dãy **Breadcrumb** bấm về đúng tầng, nút tìm kiếm `Cmd/Ctrl + K`, công tắc `Accordion`, công tắc `Hiện ảnh trên sơ đồ`, và chỉ hiển thị nút chuyển `Tổng quan | Kỹ thuật` khi `__ENABLE_TECH_MODE__` là `true`.
- `FlowCanvas.vue`: Nhúng `<VueFlow>` + `<Background />` + `<Controls />` + `<MiniMap />`, đăng ký `nodeTypes = { appFlow: AppFlowNode }`, tự gọi `fitView({ padding: 0.22, duration: 350 })` sau mỗi lần bung/thu gọn nhánh, và làm nổi bật các node/edge theo `activeScenarioId`.
- `ScenarioBar.vue`: Thanh pill nổi góc dưới trái liệt kê các kịch bản thuộc nhánh đang mở.
- `SearchModal.vue`: Hộp thoại tìm kiếm xuyên cây gọi `searchFlowNodes()`, bấm Enter/Click để `jumpToNode(hit.node.id)`.

**Step 3: Kiểm tra typecheck**

Run: `npm run typecheck`
Expected: PASS (0 TypeScript errors).

**Step 4: Commit**

```bash
git add src/components/
git commit -m "feat(ui): implement AppFlowNode, FlowCanvas, TopBar, ScenarioBar, and SearchModal"
```

---

### Task 8: Side Drawer, Media Gallery (Phone Frame) & Lightbox

**Files:**
- Create: `src/components/drawer/MediaGallery.vue`
- Create: `src/components/drawer/MediaLightbox.vue`
- Create: `src/components/drawer/DetailDrawer.vue`
- Modify: `src/App.vue`

**Step 1: Tạo `MediaGallery.vue` và `MediaLightbox.vue`**
- Lọc `node.media` theo `audienceMode` (bản public chỉ có ảnh `all`).
- Hỗ trợ `frame === 'phone'` bọc viền khung điện thoại bo tròn gọn gàng, hỗ trợ cả `<img loading="lazy">` lẫn `<video autoplay loop muted playsinline>`.
- Bắt sự kiện `@error` trên `<img>` / `<video>`: đánh dấu item lỗi và ẩn khung (hoặc hiện placeholder nhẹ *"Chưa có ảnh minh họa — đặt file tại `public/...`"* ở chế độ dev) để không bao giờ vỡ layout.
- Bấm vào ảnh mở `MediaLightbox.vue` toàn màn hình, hỗ trợ ESC để đóng.

**Step 2: Tạo `DetailDrawer.vue` và nối vào `App.vue`**
- Hiển thị tiêu đề, badge loại node, nút *"Bung nhánh con"* / *"Tập trung nhánh này"* (`focusRootId`).
- Đặt `MediaGallery` ngay phía trên mô tả.
- Hiển thị `summary.overview` (và `summary.tech` nếu `audienceMode === 'tech'`).
- Khi `audienceMode === 'tech'`, hiển thị các khối `Inputs`, `Outputs`, `APIs / Events`, `Edge Cases`, `Code Refs` và danh sách chip **`Liên kết chéo (relatedNodeIds)`** (bấm chip để gọi `jumpToNode(targetId)`).
- Nối toàn bộ vào `src/App.vue` kèm đồng bộ URL hash (`?mode=tech`, `#focus=...`) và phím tắt `Cmd/Ctrl + K`.

**Step 3: Kiểm tra typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors).

**Step 4: Commit**

```bash
git add src/components/drawer/ src/App.vue
git commit -m "feat(drawer): add DetailDrawer with Phone-frame MediaGallery, Lightbox, and cross-links"
```

---

### Task 9: Kiểm thử toàn diện & Xác minh tách biệt 2 bản build

**Files:**
- Verify: `tests/*.test.ts`, `dist-public/`, `dist-internal/`

**Step 1: Chạy toàn bộ unit test và validate dữ liệu**

Run: `npm run validate:data && npm run test && npm run typecheck`
Expected: PASS tất cả test suite và 0 lỗi typecheck.

**Step 2: Build cả 2 bản và kiểm tra rò rỉ dữ liệu bản Public**

Run:
```bash
npm run build:public && npm run build:internal
grep -rn "TwoFactorSessionManager\|FreeSwitchTransferHelper\|codeRefs" dist-public/ || echo "CLEAN_PUBLIC_BUNDLE"
```

Expected:
- Cả 2 lệnh build đều thoát mã `0`.
- `grep` không tìm thấy bất kỳ symbol nội bộ hay `codeRefs` nào trong `dist-public/`, in ra `CLEAN_PUBLIC_BUNDLE`.
- Trong `dist-internal/` có đầy đủ cả 2 chế độ Tổng quan và Kỹ thuật.

**Step 3: Commit cuối**

```bash
git status
git commit -m "chore: verify public and internal builds"
```
