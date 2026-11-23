// src/core/flowSnapshotDiff.ts
import { z } from 'zod';
import { getNodeDisplayLabel } from './graphEngine';
import {
  FlowEdgeDataSchema,
  FlowNodeDataSchema,
  SubtreeDefinitionSchema,
  type FlowEdgeData,
  type FlowNodeData,
  type MergedFlowDataset,
  type Scenario,
} from '../data/schema';

export const MAX_SNAPSHOT_IMPORT_BYTES = 10 * 1024 * 1024;

export const FlowSnapshotFileSchema = z.object({
  schemaVersion: z.literal('vbot-flow-snapshot/v1'),
  createdAt: z.string().min(1),
  label: z.string().min(1),
  app: z.object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    version: z.string().optional(),
    techBranch: z.string().optional(),
  }),
  rootNode: FlowNodeDataSchema,
  branches: z.array(FlowNodeDataSchema),
  branchEdges: z.array(FlowEdgeDataSchema),
  subtreesByParentId: z.record(z.string(), SubtreeDefinitionSchema),
});

export type FlowSnapshotFile = z.infer<typeof FlowSnapshotFileSchema>;

export type SnapshotEntityKind = 'node' | 'edge' | 'scenario';
export type SnapshotChangeType = 'added' | 'modified' | 'removed';

export interface SnapshotDiffItem {
  entityKind: SnapshotEntityKind;
  change: SnapshotChangeType;
  id: string;
  label: string;
  techLabel?: string;
  branchId?: string;
  audience?: 'all' | 'tech';
  changedFields: string[];
  hasBusinessChange: boolean;
  hasTechChange: boolean;
}

export interface FlowSnapshotDiffReport {
  baseLabel: string;
  currentLabel: string;
  summary: {
    nodesAdded: number;
    nodesModified: number;
    nodesRemoved: number;
    edgesAdded: number;
    edgesModified: number;
    edgesRemoved: number;
    scenariosAdded: number;
    scenariosModified: number;
    scenariosRemoved: number;
  };
  items: SnapshotDiffItem[];
}

export function createDatasetSnapshot(
  dataset: MergedFlowDataset,
  label?: string,
): FlowSnapshotFile {
  const now = new Date().toISOString();
  return {
    schemaVersion: 'vbot-flow-snapshot/v1',
    createdAt: now,
    label: label?.trim() || `${dataset.app.name} ${dataset.app.version ?? ''} (${now.slice(0, 10)})`.trim(),
    app: {
      name: dataset.app.name,
      tagline: dataset.app.tagline,
      ...(dataset.app.version ? { version: dataset.app.version } : {}),
      ...(dataset.app.techBranch ? { techBranch: dataset.app.techBranch } : {}),
    },
    rootNode: dataset.rootNode,
    branches: dataset.branches,
    branchEdges: dataset.branchEdges,
    subtreesByParentId: dataset.subtreesByParentId,
  };
}

export function parseDatasetSnapshotJson(
  raw: string,
): { ok: true; dataset: MergedFlowDataset; label: string } | { ok: false; error: string } {
  if (raw.length > MAX_SNAPSHOT_IMPORT_BYTES) {
    return { ok: false, error: 'File snapshot vượt quá giới hạn 10MB.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cú pháp JSON: ${err instanceof Error ? err.message : 'không đọc được'}`,
    };
  }
  const snapRes = FlowSnapshotFileSchema.safeParse(parsed);
  if (snapRes.success) {
    const s = snapRes.data;
    return {
      ok: true,
      label: s.label,
      dataset: {
        app: s.app,
        rootNode: s.rootNode,
        branches: s.branches,
        branchEdges: s.branchEdges,
        subtreesByParentId: s.subtreesByParentId,
      },
    };
  }
  return { ok: false, error: 'File không đúng định dạng vbot-flow-snapshot/v1.' };
}

function collectNodesWithBranch(
  dataset: MergedFlowDataset,
): Map<string, { node: FlowNodeData; branchId: string }> {
  const map = new Map<string, { node: FlowNodeData; branchId: string }>();
  map.set(dataset.rootNode.id, { node: dataset.rootNode, branchId: dataset.rootNode.id });

  const walk = (parentId: string, branchId: string) => {
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const child of sub.nodes) {
      if (!map.has(child.id)) {
        map.set(child.id, { node: child, branchId });
        walk(child.id, branchId);
      }
    }
  };

  for (const b of dataset.branches) {
    if (!map.has(b.id)) map.set(b.id, { node: b, branchId: b.id });
    walk(b.id, b.id);
  }
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const child of sub.nodes) {
      if (!map.has(child.id)) {
        map.set(child.id, { node: child, branchId: parentId });
      }
    }
  }
  return map;
}

function collectEdges(dataset: MergedFlowDataset): Map<string, { edge: FlowEdgeData; parentId: string }> {
  const map = new Map<string, { edge: FlowEdgeData; parentId: string }>();
  for (const e of dataset.branchEdges) map.set(e.id, { edge: e, parentId: dataset.rootNode.id });
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const e of sub.edges) map.set(e.id, { edge: e, parentId });
  }
  return map;
}

function collectScenarios(dataset: MergedFlowDataset): Map<string, { scenario: Scenario; parentId: string }> {
  const map = new Map<string, { scenario: Scenario; parentId: string }>();
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const s of sub.scenarios ?? []) map.set(s.id, { scenario: s, parentId });
  }
  return map;
}

const BUSINESS_FIELDS = new Set(['label', 'kind', 'audience', 'summary.overview', 'media']);

function detectChangedNodeFields(a: FlowNodeData, b: FlowNodeData): string[] {
  const changed: string[] = [];
  const cmp = (key: string, va: unknown, vb: unknown) => {
    if (JSON.stringify(va) !== JSON.stringify(vb)) changed.push(key);
  };
  cmp('label', a.label, b.label);
  cmp('techLabel', a.techLabel, b.techLabel);
  cmp('kind', a.kind, b.kind);
  cmp('audience', a.audience, b.audience);
  cmp('platforms', a.platforms, b.platforms);
  cmp('summary.overview', a.summary.overview, b.summary.overview);
  cmp('summary.tech', a.summary.tech, b.summary.tech);
  cmp('platformDiffNote', a.techDetail?.platformDiffNote, b.techDetail?.platformDiffNote);
  cmp('parityAssessment', a.techDetail?.parityAssessment, b.techDetail?.parityAssessment);
  cmp('apisOrEvents', a.techDetail?.apisOrEvents, b.techDetail?.apisOrEvents);
  cmp('edgeCases', a.techDetail?.edgeCases, b.techDetail?.edgeCases);
  cmp('codeRefs', a.techDetail?.codeRefs, b.techDetail?.codeRefs);
  cmp('byPlatform', a.techDetail?.byPlatform, b.techDetail?.byPlatform);
  cmp('miniAppBridge', a.techDetail?.miniAppBridge, b.techDetail?.miniAppBridge);
  cmp('meta', a.meta, b.meta);
  cmp('media', a.media, b.media);
  cmp('relatedNodeIds', a.relatedNodeIds, b.relatedNodeIds);
  return changed;
}

export function diffDatasets(
  base: MergedFlowDataset,
  current: MergedFlowDataset,
  labels?: { baseLabel?: string; currentLabel?: string },
): FlowSnapshotDiffReport {
  const items: SnapshotDiffItem[] = [];

  const baseNodes = collectNodesWithBranch(base);
  const currNodes = collectNodesWithBranch(current);

  for (const [id, { node, branchId }] of currNodes.entries()) {
    const prev = baseNodes.get(id);
    if (!prev) {
      items.push({
        entityKind: 'node',
        change: 'added',
        id,
        label: getNodeDisplayLabel(node, 'overview'),
        techLabel: node.techLabel,
        branchId,
        audience: node.audience,
        changedFields: [],
        hasBusinessChange: node.audience === 'all',
        hasTechChange: true,
      });
    } else if (JSON.stringify(prev.node) !== JSON.stringify(node)) {
      const changedFields = detectChangedNodeFields(prev.node, node);
      const hasBusinessChange = changedFields.some((f) => BUSINESS_FIELDS.has(f));
      items.push({
        entityKind: 'node',
        change: 'modified',
        id,
        label: getNodeDisplayLabel(node, 'overview'),
        techLabel: node.techLabel,
        branchId,
        audience: node.audience,
        changedFields,
        hasBusinessChange,
        hasTechChange: changedFields.some((f) => !BUSINESS_FIELDS.has(f)) || hasBusinessChange,
      });
    }
  }

  for (const [id, { node, branchId }] of baseNodes.entries()) {
    if (!currNodes.has(id)) {
      items.push({
        entityKind: 'node',
        change: 'removed',
        id,
        label: getNodeDisplayLabel(node, 'overview'),
        techLabel: node.techLabel,
        branchId,
        audience: node.audience,
        changedFields: [],
        hasBusinessChange: node.audience === 'all',
        hasTechChange: true,
      });
    }
  }

  const baseEdges = collectEdges(base);
  const currEdges = collectEdges(current);
  for (const [id, { edge, parentId }] of currEdges.entries()) {
    const prev = baseEdges.get(id);
    const label = `${edge.source} → ${edge.target}${edge.label ? ` (${edge.label})` : ''}`;
    if (!prev) {
      items.push({
        entityKind: 'edge',
        change: 'added',
        id,
        label,
        branchId: parentId,
        audience: edge.audience,
        changedFields: [],
        hasBusinessChange: (edge.audience ?? 'all') === 'all',
        hasTechChange: true,
      });
    } else if (JSON.stringify(prev.edge) !== JSON.stringify(edge)) {
      items.push({
        entityKind: 'edge',
        change: 'modified',
        id,
        label,
        branchId: parentId,
        audience: edge.audience,
        changedFields: ['label/routing'],
        hasBusinessChange: prev.edge.label !== edge.label,
        hasTechChange: true,
      });
    }
  }
  for (const [id, { edge, parentId }] of baseEdges.entries()) {
    if (!currEdges.has(id)) {
      items.push({
        entityKind: 'edge',
        change: 'removed',
        id,
        label: `${edge.source} → ${edge.target}`,
        branchId: parentId,
        audience: edge.audience,
        changedFields: [],
        hasBusinessChange: (edge.audience ?? 'all') === 'all',
        hasTechChange: true,
      });
    }
  }

  const baseSc = collectScenarios(base);
  const currSc = collectScenarios(current);
  for (const [id, { scenario, parentId }] of currSc.entries()) {
    const prev = baseSc.get(id);
    if (!prev) {
      items.push({
        entityKind: 'scenario',
        change: 'added',
        id,
        label: scenario.name,
        branchId: parentId,
        audience: scenario.audience,
        changedFields: [],
        hasBusinessChange: (scenario.audience ?? 'all') === 'all',
        hasTechChange: true,
      });
    } else if (JSON.stringify(prev.scenario) !== JSON.stringify(scenario)) {
      items.push({
        entityKind: 'scenario',
        change: 'modified',
        id,
        label: scenario.name,
        branchId: parentId,
        audience: scenario.audience,
        changedFields: ['steps/description'],
        hasBusinessChange: (scenario.audience ?? 'all') === 'all',
        hasTechChange: true,
      });
    }
  }
  for (const [id, { scenario, parentId }] of baseSc.entries()) {
    if (!currSc.has(id)) {
      items.push({
        entityKind: 'scenario',
        change: 'removed',
        id,
        label: scenario.name,
        branchId: parentId,
        audience: scenario.audience,
        changedFields: [],
        hasBusinessChange: (scenario.audience ?? 'all') === 'all',
        hasTechChange: true,
      });
    }
  }

  const count = (k: SnapshotEntityKind, c: SnapshotChangeType) =>
    items.filter((i) => i.entityKind === k && i.change === c).length;

  return {
    baseLabel: labels?.baseLabel ?? 'Snapshot gốc',
    currentLabel: labels?.currentLabel ?? 'Dataset hiện tại',
    summary: {
      nodesAdded: count('node', 'added'),
      nodesModified: count('node', 'modified'),
      nodesRemoved: count('node', 'removed'),
      edgesAdded: count('edge', 'added'),
      edgesModified: count('edge', 'modified'),
      edgesRemoved: count('edge', 'removed'),
      scenariosAdded: count('scenario', 'added'),
      scenariosModified: count('scenario', 'modified'),
      scenariosRemoved: count('scenario', 'removed'),
    },
    items,
  };
}

export function exportSnapshotDiffChangelogMarkdown(report: FlowSnapshotDiffReport): string {
  const s = report.summary;
  const businessItems = report.items.filter((i) => i.hasBusinessChange);
  const techItems = report.items.filter((i) => i.hasTechChange);

  const lines: string[] = [
    `# Changelog Phiên bản Luồng VBot`,
    '',
    `- **Đối chiếu:** \`${report.baseLabel}\` → \`${report.currentLabel}\``,
    `- **Nodes:** +${s.nodesAdded} thêm / ~${s.nodesModified} sửa / -${s.nodesRemoved} xóa`,
    `- **Edges:** +${s.edgesAdded} thêm / ~${s.edgesModified} sửa / -${s.edgesRemoved} xóa`,
    `- **Kịch bản:** +${s.scenariosAdded} thêm / ~${s.scenariosModified} sửa / -${s.scenariosRemoved} xóa`,
    '',
    '## 1. Thay đổi Nghiệp vụ (BA / PM)',
  ];

  if (businessItems.length === 0) {
    lines.push('- Không có thay đổi nghiệp vụ.');
  } else {
    for (const item of businessItems) {
      lines.push(`- **[${item.change.toUpperCase()} · ${item.entityKind}]** ${item.label} (\`${item.id}\`)`);
    }
  }

  lines.push('', '## 2. Thay đổi Kỹ thuật & Parity (Dev / QA)');
  if (techItems.length === 0) {
    lines.push('- Không có thay đổi kỹ thuật.');
  } else {
    for (const item of techItems) {
      const fields = item.changedFields.length > 0 ? ` — trường sửa: \`${item.changedFields.join(', ')}\`` : '';
      lines.push(
        `- **[${item.change.toUpperCase()} · ${item.entityKind}]** ${item.techLabel ?? item.label} (\`${item.id}\`)${fields}`,
      );
    }
  }

  return lines.join('\n') + '\n';
}
