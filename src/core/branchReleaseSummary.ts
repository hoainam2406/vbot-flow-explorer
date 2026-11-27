// src/core/branchReleaseSummary.ts
import { buildApiAtlas } from './apiAtlasEngine';
import { diffDatasets, type FlowSnapshotDiffReport } from './flowSnapshotDiff';
import { getNodeDisplayLabel } from './graphEngine';
import { extractParityReport, type ParityItem } from './parityAnalyzer';
import type { MergedFlowDataset, ParityVerdict } from '../data/schema';

export interface BranchModuleDeltaRow {
  branchId: string;
  branchLabel: string;
  nodesAdded: number;
  nodesModified: number;
  nodesRemoved: number;
  edgesChanged: number;
  scenariosChanged: number;
}

export interface BranchParityDeltaReport {
  resolvedCodes: Array<{
    code: string;
    nodeId: string;
    nodeLabel: string;
    from: ParityVerdict;
    to: ParityVerdict;
  }>;
  newlyAdded: ParityItem[];
  stillActionNeeded: ParityItem[];
}

export interface BranchComparisonSummary {
  baseLabel: string;
  currentLabel: string;
  diff: FlowSnapshotDiffReport;
  moduleMatrix: BranchModuleDeltaRow[];
  newApis: string[];
  parityDelta: BranchParityDeltaReport;
  changedNodeMermaid: string;
}

function buildNodeToBranchMap(dataset: MergedFlowDataset): Map<string, { id: string; label: string }> {
  const map = new Map<string, { id: string; label: string }>();
  const rootLabel = getNodeDisplayLabel(dataset.rootNode, 'tech');
  map.set(dataset.rootNode.id, { id: dataset.rootNode.id, label: rootLabel });

  const walk = (parentId: string, branchId: string, branchLabel: string, visited = new Set<string>()) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const node of sub.nodes) {
      map.set(node.id, { id: branchId, label: branchLabel });
      if (dataset.subtreesByParentId[node.id]) {
        walk(node.id, branchId, branchLabel, visited);
      }
    }
  };

  for (const b of dataset.branches) {
    const label = getNodeDisplayLabel(b, 'tech');
    map.set(b.id, { id: b.id, label });
    walk(b.id, b.id, label);
  }
  return map;
}

function sanitizeMermaidNodeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeMermaidLabel(raw: string): string {
  return raw.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Tổng hợp ma trận thay đổi theo module, API mới, Parity đã đóng & Mermaid Release Note giữa 2 nhánh.
 */
export function buildBranchComparisonSummary(
  baseDataset: MergedFlowDataset,
  currentDataset: MergedFlowDataset,
  options: { baseLabel: string; currentLabel: string },
): BranchComparisonSummary {
  const diff = diffDatasets(baseDataset, currentDataset, options);
  const currentBranchMap = buildNodeToBranchMap(currentDataset);
  const baseBranchMap = buildNodeToBranchMap(baseDataset);

  const moduleAcc = new Map<string, BranchModuleDeltaRow>();
  const ensureModule = (branchId: string, branchLabel: string): BranchModuleDeltaRow => {
    const existing = moduleAcc.get(branchId);
    if (existing) return existing;
    const row: BranchModuleDeltaRow = {
      branchId,
      branchLabel,
      nodesAdded: 0,
      nodesModified: 0,
      nodesRemoved: 0,
      edgesChanged: 0,
      scenariosChanged: 0,
    };
    moduleAcc.set(branchId, row);
    return row;
  };

  for (const item of diff.items) {
    const owner =
      currentBranchMap.get(item.id) ??
      baseBranchMap.get(item.id) ??
      { id: 'other', label: 'Khác / Global' };
    const row = ensureModule(owner.id, owner.label);
    if (item.entityKind === 'node') {
      if (item.change === 'added') row.nodesAdded += 1;
      else if (item.change === 'modified') row.nodesModified += 1;
      else if (item.change === 'removed') row.nodesRemoved += 1;
    } else if (item.entityKind === 'edge') {
      row.edgesChanged += 1;
    } else if (item.entityKind === 'scenario') {
      row.scenariosChanged += 1;
    }
  }

  const moduleMatrix = [...moduleAcc.values()].sort(
    (a, b) =>
      b.nodesAdded + b.nodesModified + b.nodesRemoved -
      (a.nodesAdded + a.nodesModified + a.nodesRemoved),
  );

  const baseAtlas = buildApiAtlas(baseDataset);
  const curAtlas = buildApiAtlas(currentDataset);
  const baseApiKeys = new Set(baseAtlas.entries.map((e) => e.id));
  const newApis = curAtlas.entries
    .filter((e) => !baseApiKeys.has(e.id))
    .map((e) => `[${e.kind.toUpperCase()}] ${e.token}`);

  const baseParity = extractParityReport(baseDataset);
  const curParity = extractParityReport(currentDataset);
  const baseByNode = new Map(baseParity.items.map((i) => [i.nodeId, i]));
  const curByNode = new Map(curParity.items.map((i) => [i.nodeId, i]));

  const resolvedCodes: BranchParityDeltaReport['resolvedCodes'] = [];
  for (const [nodeId, baseItem] of baseByNode) {
    const curItem = curByNode.get(nodeId);
    const wasBad =
      baseItem.assessment.verdict === 'action_needed' ||
      baseItem.assessment.verdict === 'logic_diff';
    if (!wasBad) continue;
    if (
      curItem &&
      (curItem.assessment.verdict === 'synced' ||
        curItem.assessment.verdict === 'os_impl_only')
    ) {
      resolvedCodes.push({
        code: curItem.code,
        nodeId,
        nodeLabel: curItem.nodeLabel,
        from: baseItem.assessment.verdict,
        to: curItem.assessment.verdict,
      });
    }
  }

  const newlyAdded = curParity.items.filter((i) => !baseByNode.has(i.nodeId));
  const stillActionNeeded = curParity.items.filter(
    (i) => i.assessment.verdict === 'action_needed',
  );

  const changedNodes = diff.items
    .filter((i) => i.entityKind === 'node' && (i.change === 'added' || i.change === 'modified'))
    .slice(0, 30);

  const mermaidLines = ['flowchart LR'];
  if (changedNodes.length === 0) {
    mermaidLines.push('  NoChanges["Không có node thêm/sửa"]');
  } else {
    const groupNodes = new Map<string, typeof changedNodes>();
    for (const item of changedNodes) {
      const owner = currentBranchMap.get(item.id) ?? { id: 'root', label: 'VBot App' };
      const arr = groupNodes.get(owner.label) ?? [];
      arr.push(item);
      groupNodes.set(owner.label, arr);
    }
    for (const [groupLabel, items] of groupNodes) {
      const gid = sanitizeMermaidNodeId(groupLabel);
      mermaidLines.push(`  subgraph ${gid}["${escapeMermaidLabel(groupLabel)}"]`);
      for (const item of items) {
        const prefix = item.change === 'added' ? '+ ' : '~ ';
        mermaidLines.push(
          `    ${sanitizeMermaidNodeId(item.id)}["${escapeMermaidLabel(prefix + item.label)}"]`,
        );
      }
      mermaidLines.push('  end');
    }
  }

  return {
    baseLabel: options.baseLabel,
    currentLabel: options.currentLabel,
    diff,
    moduleMatrix,
    newApis,
    parityDelta: {
      resolvedCodes,
      newlyAdded,
      stillActionNeeded,
    },
    changedNodeMermaid: mermaidLines.join('\n'),
  };
}

export function exportBranchReleaseMarkdown(summary: BranchComparisonSummary): string {
  const s = summary.diff.summary;
  const lines: string[] = [
    `# Release / PR Summary: ${summary.baseLabel} → ${summary.currentLabel}`,
    '',
    `- **Node:** +${s.nodesAdded} mới · ~${s.nodesModified} sửa · -${s.nodesRemoved} xóa`,
    `- **Edge:** +${s.edgesAdded} · ~${s.edgesModified} · -${s.edgesRemoved} · **Kịch bản:** +${s.scenariosAdded} · ~${s.scenariosModified} · -${s.scenariosRemoved}`,
    '',
    '## 1. Ma trận thay đổi theo Module',
    '| Module | + Mới | ~ Sửa | - Xóa | Edge / Kịch bản |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...summary.moduleMatrix.map(
      (m) =>
        `| ${m.branchLabel} | ${m.nodesAdded} | ${m.nodesModified} | ${m.nodesRemoved} | ${m.edgesChanged + m.scenariosChanged} |`,
    ),
  ];

  if (summary.newApis.length > 0) {
    lines.push('', `## 2. API / WebSocket / Bridge mới (${summary.newApis.length})`);
    lines.push(...summary.newApis.map((a) => `- \`${a}\``));
  }

  if (summary.parityDelta.resolvedCodes.length > 0 || summary.parityDelta.newlyAdded.length > 0) {
    lines.push('', '## 3. Biến động Parity iOS ↔ Android');
    for (const r of summary.parityDelta.resolvedCodes) {
      lines.push(`- ✅ **[${r.code}] ${r.nodeLabel}:** \`${r.from}\` → \`${r.to}\``);
    }
    for (const n of summary.parityDelta.newlyAdded) {
      lines.push(`- 🆕 **[${n.code}] ${n.nodeLabel}:** ${n.assessment.verdict}`);
    }
  }

  lines.push(
    '',
    '## 4. Sơ đồ tóm tắt Node thay đổi (Mermaid)',
    '```mermaid',
    summary.changedNodeMermaid,
    '```',
  );

  return lines.join('\n') + '\n';
}
