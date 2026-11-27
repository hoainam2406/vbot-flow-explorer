// src/core/bulkNodeManager.ts
import type { DraftPatch } from './datasetDraftStore';
import { extractVbotTaskKey } from './devWorkboardStore';
import { findNodeById, getNodeDisplayLabel } from './graphEngine';
import { detectCodeRefPlatform } from './workspaceSettings';
import type {
  FlowNodeData,
  MergedFlowDataset,
  NodeMeta,
  NodeStatus,
  ParityVerdict,
} from '../data/schema';

export interface FlatManageableNode {
  node: FlowNodeData;
  nodeLabel: string;
  branchId: string;
  branchLabel: string;
  status: NodeStatus;
  owner: string;
  lastVerifiedAt: string;
  workTaskUrl: string;
  taskKey: string;
  iosRefCount: number;
  androidRefCount: number;
  parityVerdict: ParityVerdict | null;
  parityCode: string | null;
  isStale: boolean;
  isMissingVerified: boolean;
  hasDiff: boolean;
  personalNote: string;
}

export interface BulkNodeMetaUpdate {
  status?: NodeStatus;
  lastVerifiedAt?: string;
  owner?: string;
  workTaskUrl?: string;
  clearWorkTaskUrl?: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_RE = /^https?:\/\//i;

function daysBetweenIso(fromIso: string, toIso: string): number {
  const t1 = Date.parse(`${fromIso}T00:00:00Z`);
  const t2 = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
}

function countNodeCodeRefs(node: FlowNodeData): { ios: number; android: number } {
  const ios = new Set<string>(node.techDetail?.byPlatform?.ios?.codeRefs ?? []);
  const android = new Set<string>(node.techDetail?.byPlatform?.android?.codeRefs ?? []);
  for (const ref of node.techDetail?.codeRefs ?? []) {
    if (detectCodeRefPlatform(ref) === 'android') android.add(ref);
    else ios.add(ref);
  }
  return { ios: ios.size, android: android.size };
}

export function buildFlatManageableNodes(
  dataset: MergedFlowDataset,
  options?: {
    referenceDate?: string;
    staleThresholdDays?: number;
    personalNotesByNodeId?: Record<string, string>;
  },
): FlatManageableNode[] {
  const refDate = options?.referenceDate ?? new Date().toISOString().slice(0, 10);
  const staleDays = options?.staleThresholdDays ?? 60;
  const notesMap = options?.personalNotesByNodeId ?? {};

  const out: FlatManageableNode[] = [];
  const seen = new Set<string>();

  const pushNode = (node: FlowNodeData, branchId: string, branchLabel: string) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);

    const status: NodeStatus = node.meta?.status ?? 'stable';
    const owner = node.meta?.owner?.trim() ?? '';
    const lastVerifiedAt = node.meta?.lastVerifiedAt?.trim() ?? '';
    const workTaskUrl = node.meta?.workTaskUrl?.trim() ?? '';
    const taskKey = extractVbotTaskKey(workTaskUrl) ?? '';
    const refs = countNodeCodeRefs(node);
    const pa = node.techDetail?.parityAssessment;
    const hasDiff = Boolean(
      node.platforms?.length === 1 ||
        node.techDetail?.platformDiffNote ||
        pa?.verdict === 'action_needed' ||
        pa?.verdict === 'logic_diff' ||
        node.techDetail?.miniAppBridge?.messages.some((m) => m.parityNote),
    );
    const isMissingVerified = node.kind !== 'module' && !lastVerifiedAt;
    const isStale = Boolean(
      lastVerifiedAt && daysBetweenIso(lastVerifiedAt, refDate) > staleDays,
    );

    out.push({
      node,
      nodeLabel: getNodeDisplayLabel(node, 'tech'),
      branchId,
      branchLabel,
      status,
      owner,
      lastVerifiedAt,
      workTaskUrl,
      taskKey,
      iosRefCount: refs.ios,
      androidRefCount: refs.android,
      parityVerdict: pa?.verdict ?? null,
      parityCode: pa?.code ?? null,
      isStale,
      isMissingVerified,
      hasDiff,
      personalNote: notesMap[node.id]?.trim() ?? '',
    });
  };

  pushNode(
    dataset.rootNode,
    dataset.rootNode.id,
    getNodeDisplayLabel(dataset.rootNode, 'tech'),
  );

  const walk = (parentId: string, branchId: string, branchLabel: string, visited = new Set<string>()) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const child of sub.nodes) {
      pushNode(child, branchId, branchLabel);
      if (dataset.subtreesByParentId[child.id]) {
        walk(child.id, branchId, branchLabel, visited);
      }
    }
  };

  for (const branch of dataset.branches) {
    const bLabel = getNodeDisplayLabel(branch, 'tech');
    pushNode(branch, branch.id, bLabel);
    walk(branch.id, branch.id, bLabel);
  }

  return out;
}

/**
 * Sinh hàng loạt DraftPatch (`update_node`) để cập nhật metadata cho nhiều node cùng lúc.
 */
export function buildBulkNodeUpdatePatches(
  dataset: MergedFlowDataset,
  nodeIds: readonly string[],
  update: BulkNodeMetaUpdate,
): DraftPatch[] {
  const patches: DraftPatch[] = [];
  const seen = new Set<string>();
  const nowTs = Date.now();

  const cleanDate = update.lastVerifiedAt?.trim();
  const validDate = cleanDate && ISO_DATE_RE.test(cleanDate) ? cleanDate : undefined;

  const cleanUrl = update.workTaskUrl?.trim();
  const validUrl = cleanUrl && HTTP_URL_RE.test(cleanUrl) ? cleanUrl : undefined;

  const cleanOwner = update.owner?.trim();

  for (let i = 0; i < nodeIds.length; i += 1) {
    const nodeId = nodeIds[i]?.trim();
    if (!nodeId || seen.has(nodeId)) continue;
    seen.add(nodeId);

    const existing = findNodeById(dataset, nodeId);
    if (!existing) continue;

    const cloned = JSON.parse(JSON.stringify(existing)) as FlowNodeData;
    const nextMeta: NodeMeta = { ...(cloned.meta ?? {}) };

    if (update.status) {
      nextMeta.status = update.status;
    }
    if (validDate) {
      nextMeta.lastVerifiedAt = validDate;
    }
    if (cleanOwner) {
      nextMeta.owner = cleanOwner;
    }
    if (update.clearWorkTaskUrl) {
      delete nextMeta.workTaskUrl;
    } else if (validUrl) {
      nextMeta.workTaskUrl = validUrl;
    }

    if (Object.keys(nextMeta).length > 0) {
      cloned.meta = nextMeta;
    } else {
      delete cloned.meta;
    }

    patches.push({
      id: `bulk-${nowTs}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowTs + i,
      kind: 'update_node',
      nodeId,
      node: cloned,
    });
  }

  return patches;
}
