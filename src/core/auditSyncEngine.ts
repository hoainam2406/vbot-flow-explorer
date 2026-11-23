// src/core/auditSyncEngine.ts
import { findNodeById, getNodeDisplayLabel } from './graphEngine';
import type { ContractCommandSpec } from './miniAppContractBuilder';
import type { CoreBridgeSpecItem, MiniAppCatalogEntry } from '../data/miniAppBridgeCatalog';
import type { MiniAppPermissionProfile } from '../data/miniAppPermissionMatrix';
import type { AudienceScope, FlowNodeData, MergedFlowDataset } from '../data/schema';

export interface MiniAppConsistencyReport {
  errors: string[];
  warnings: string[];
  stats: {
    catalogCount: number;
    profileCount: number;
    datasetMiniAppRefs: number;
  };
}

export interface MediaCoverageItem {
  src: string;
  caption: string;
  nodeId: string;
  nodeLabel: string;
  branchId: string;
  audience: AudienceScope;
  exists: boolean;
}

export interface MediaCoverageReport {
  total: number;
  present: number;
  missing: number;
  items: MediaCoverageItem[];
}

export interface ExtractedCodeRef {
  ref: string;
  platform: 'ios' | 'android';
  nodeIds: string[];
}

export interface CodeRefsAuditReport {
  checkedIos: boolean;
  checkedAndroid: boolean;
  totalRefs: number;
  iosCount: number;
  androidCount: number;
  missingIos: ExtractedCodeRef[];
  missingAndroid: ExtractedCodeRef[];
  warnings: string[];
}

export interface MiniAppApiSnapshotDiff {
  matchedCount: number;
  added: Array<{ id: string; name: string; category?: string }>;
  removed: Array<{ id: string; nameVi: string; category: string }>;
  categoryChanged: Array<{ id: string; catalogCategory: string; apiCategory: string }>;
}

export const PUBLIC_LEAK_FORBIDDEN_TOKENS: readonly string[] = [
  'TwoFactorSessionManager',
  'FreeSwitchTransferHelper',
  'codeRefs',
  'VbMaSDK',
  'PushKit',
  'CallKit',
  'PJSIP',
  'Nam-dev',
  'bgapi',
  'techLabel',
  'techBranch',
  'repoConfig',
  'workTaskUrl',
  'sourceFileMap',
  'existingMediaPaths',
  'failed_phones',
  'Contact V2',
  'CallStyle',
  'SQLite',
  'DTMF',
  'logout_other_devices',
  'parityAssessment',
  '__vbot-dev/host-fetch-proxy',
  '__vbot-dev/git/inspect',
  'GovernanceHubModal',
  'QaReleaseHubPanel',
  'FlowSnapshotDiffPanel',
];

function collectAllNodesWithBranch(
  dataset: MergedFlowDataset,
): Array<{ node: FlowNodeData; branchId: string }> {
  const result: Array<{ node: FlowNodeData; branchId: string }> = [
    { node: dataset.rootNode, branchId: dataset.rootNode.id },
  ];
  const seen = new Set<string>([dataset.rootNode.id]);

  const walkSubtree = (parentId: string, branchId: string) => {
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const child of sub.nodes) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push({ node: child, branchId });
      walkSubtree(child.id, branchId);
    }
  };

  for (const branch of dataset.branches) {
    if (!seen.has(branch.id)) {
      seen.add(branch.id);
      result.push({ node: branch, branchId: branch.id });
    }
    walkSubtree(branch.id, branch.id);
  }

  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const child of sub.nodes) {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        result.push({ node: child, branchId: parentId });
      }
    }
  }

  return result;
}

export function auditMiniAppConsistency(
  dataset: MergedFlowDataset,
  catalog: readonly MiniAppCatalogEntry[],
  permissionProfiles: Record<string, MiniAppPermissionProfile>,
  sandboxCommands: readonly ContractCommandSpec[],
  coreSpecs: readonly CoreBridgeSpecItem[] = [],
): MiniAppConsistencyReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const catalogIds = new Set(catalog.map((a) => a.id));
  const documentedSymbols = new Set<string>();
  for (const cmd of sandboxCommands) documentedSymbols.add(cmd.method);
  for (const spec of coreSpecs) {
    documentedSymbols.add(spec.id);
    documentedSymbols.add(spec.name);
    if (spec.responseEvent) documentedSymbols.add(spec.responseEvent);
  }
  for (const sym of [
    'theme_changed',
    'refresh_data',
    'filter_changed',
    'autodial_finished',
    'autodial_error',
    'monitor_call_state_changed',
    'monitor_call_result',
    'user_contacts_updated',
    'setup_2fa',
    'mini_app_closed',
    'mini_app_error',
    'vbma_extra_data',
  ]) {
    documentedSymbols.add(sym);
  }

  for (const app of catalog) {
    if (!permissionProfiles[app.id]) {
      errors.push(`Mini App "${app.id}" thiếu profile phân quyền trong MINI_APP_PERMISSION_PROFILES`);
    }
    if (app.relatedNodeId && !findNodeById(dataset, app.relatedNodeId)) {
      errors.push(
        `Mini App "${app.id}" trỏ relatedNodeId "${app.relatedNodeId}" không tồn tại trong dataset`,
      );
    }
    for (const act of app.customActions ?? []) {
      if (!documentedSymbols.has(act)) {
        warnings.push(
          `Mini App "${app.id}" khai báo customAction "${act}" chưa có trong ALL_SANDBOX_COMMANDS hoặc CORE_BRIDGE_SPECS`,
        );
      }
    }
  }

  for (const profileId of Object.keys(permissionProfiles)) {
    if (!catalogIds.has(profileId)) {
      errors.push(`Permission profile "${profileId}" không tồn tại trong MINI_APP_CATALOG`);
    }
  }

  let datasetMiniAppRefs = 0;
  for (const { node } of collectAllNodesWithBranch(dataset)) {
    const rawMiniAppId = node.techDetail?.miniAppBridge?.miniAppId;
    if (!rawMiniAppId) continue;
    const matches = rawMiniAppId.match(/vb-ma-[a-z0-9-]+/g) ?? [];
    for (const appId of matches) {
      datasetMiniAppRefs += 1;
      if (!catalogIds.has(appId)) {
        errors.push(
          `Node "${node.id}" tham chiếu miniAppId "${appId}" chưa có trong MINI_APP_CATALOG`,
        );
      }
    }
  }

  return {
    errors,
    warnings,
    stats: {
      catalogCount: catalog.length,
      profileCount: Object.keys(permissionProfiles).length,
      datasetMiniAppRefs,
    },
  };
}

export function auditMediaCoverage(
  dataset: MergedFlowDataset,
  existingMediaPaths: readonly string[],
): MediaCoverageReport {
  const existingSet = new Set(existingMediaPaths.map((p) => p.replace(/^\/+/, '')));
  const items: MediaCoverageItem[] = [];
  const seenSrc = new Set<string>();

  for (const { node, branchId } of collectAllNodesWithBranch(dataset)) {
    for (const media of node.media ?? []) {
      const normalized = media.src.replace(/^\/+/, '');
      if (!normalized || seenSrc.has(`${node.id}::${normalized}`)) continue;
      seenSrc.add(`${node.id}::${normalized}`);
      items.push({
        src: media.src.startsWith('/') ? media.src : `/${normalized}`,
        caption: media.caption,
        nodeId: node.id,
        nodeLabel: getNodeDisplayLabel(node, 'overview'),
        branchId,
        audience: media.audience ?? node.audience,
        exists: existingSet.has(normalized),
      });
    }
  }

  const present = items.filter((i) => i.exists).length;
  return {
    total: items.length,
    present,
    missing: items.length - present,
    items,
  };
}

export function classifyCodeRefPlatform(codeRef: string): 'ios' | 'android' {
  const trimmed = codeRef.trim();
  if (
    trimmed.startsWith('VBot-Android/') ||
    trimmed.startsWith('vb-ma-android-sdk/') ||
    /\.(kt|java|xml|gradle)(\b|$)/i.test(trimmed)
  ) {
    return 'android';
  }
  return 'ios';
}

export function extractUniqueCodeRefs(dataset: MergedFlowDataset): {
  ios: string[];
  android: string[];
  all: ExtractedCodeRef[];
} {
  const map = new Map<string, { platform: 'ios' | 'android'; nodeIds: Set<string> }>();

  const registerRef = (rawRef: string, nodeId: string, forcedPlatform?: 'ios' | 'android') => {
    const ref = rawRef.trim();
    if (!ref) return;
    const platform = forcedPlatform ?? classifyCodeRefPlatform(ref);
    const key = `${platform}::${ref}`;
    const existing = map.get(key) ?? { platform, nodeIds: new Set<string>() };
    existing.nodeIds.add(nodeId);
    map.set(key, existing);
  };

  for (const { node } of collectAllNodesWithBranch(dataset)) {
    const detail = node.techDetail;
    if (!detail) continue;
    for (const ref of detail.codeRefs ?? []) {
      registerRef(ref, node.id);
    }
    for (const ref of detail.byPlatform?.ios?.codeRefs ?? []) {
      registerRef(ref, node.id, 'ios');
    }
    for (const ref of detail.byPlatform?.android?.codeRefs ?? []) {
      registerRef(ref, node.id, 'android');
    }
  }

  const all: ExtractedCodeRef[] = [];
  const ios: string[] = [];
  const android: string[] = [];
  for (const [key, info] of map.entries()) {
    const ref = key.slice(info.platform.length + 2);
    all.push({
      ref,
      platform: info.platform,
      nodeIds: [...info.nodeIds],
    });
    if (info.platform === 'ios') ios.push(ref);
    else android.push(ref);
  }

  ios.sort();
  android.sort();
  all.sort((a, b) => a.ref.localeCompare(b.ref));
  return { ios, android, all };
}

function simpleJoin(base: string, rel: string): string {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanRel = rel.replace(/^\/+/, '');
  return `${cleanBase}/${cleanRel}`;
}

export function auditCodeRefs(
  dataset: MergedFlowDataset,
  options: {
    iosDir?: string;
    androidDir?: string;
    fileExists: (absPath: string) => boolean;
    joinPath?: (base: string, rel: string) => string;
  },
): CodeRefsAuditReport {
  const join = options.joinPath ?? simpleJoin;
  const extracted = extractUniqueCodeRefs(dataset);
  const missingIos: ExtractedCodeRef[] = [];
  const missingAndroid: ExtractedCodeRef[] = [];
  const warnings: string[] = [];

  const iosDir = options.iosDir?.trim() || undefined;
  const androidDir = options.androidDir?.trim() || undefined;

  if (!iosDir) {
    warnings.push('Chưa cấu hình thư mục VBot-iOS (--ios-dir hoặc VBOT_IOS_DIR); bỏ qua kiểm tra file Swift.');
  } else {
    for (const item of extracted.all.filter((r) => r.platform === 'ios')) {
      const stripped = item.ref.replace(/^VBot-iOS\//, '');
      const ok =
        options.fileExists(join(iosDir, item.ref)) ||
        options.fileExists(join(iosDir, stripped));
      if (!ok) {
        missingIos.push(item);
      }
    }
  }

  if (!androidDir) {
    warnings.push('Chưa cấu hình thư mục VBot-Android (--android-dir hoặc VBOT_ANDROID_DIR); bỏ qua kiểm tra file Kotlin/Java.');
  } else {
    for (const item of extracted.all.filter((r) => r.platform === 'android')) {
      const stripped = item.ref.replace(/^VBot-Android\//, '');
      const ok =
        options.fileExists(join(androidDir, item.ref)) ||
        options.fileExists(join(androidDir, stripped));
      if (!ok) {
        missingAndroid.push(item);
      }
    }
  }

  return {
    checkedIos: Boolean(iosDir),
    checkedAndroid: Boolean(androidDir),
    totalRefs: extracted.all.length,
    iosCount: extracted.ios.length,
    androidCount: extracted.android.length,
    missingIos,
    missingAndroid,
    warnings,
  };
}

interface RawSnapshotEntry {
  id?: unknown;
  app_id?: unknown;
  appId?: unknown;
  name?: unknown;
  title?: unknown;
  category?: unknown;
  group?: unknown;
}

export function diffMiniAppApiSnapshot(
  rawSnapshot: unknown,
  catalog: readonly MiniAppCatalogEntry[],
): MiniAppApiSnapshotDiff {
  let list: RawSnapshotEntry[] = [];
  if (Array.isArray(rawSnapshot)) {
    list = rawSnapshot as RawSnapshotEntry[];
  } else if (rawSnapshot && typeof rawSnapshot === 'object') {
    const obj = rawSnapshot as Record<string, unknown>;
    if (Array.isArray(obj.data)) list = obj.data as RawSnapshotEntry[];
    else if (Array.isArray(obj.apps)) list = obj.apps as RawSnapshotEntry[];
  }

  const normalized = new Map<string, { id: string; name: string; category?: string }>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rawId = item.id ?? item.app_id ?? item.appId;
    if (typeof rawId !== 'string' || !rawId.trim()) continue;
    const id = rawId.trim();
    const rawName = item.name ?? item.title;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id;
    const rawCat = item.category ?? item.group;
    const category = typeof rawCat === 'string' && rawCat.trim() ? rawCat.trim() : undefined;
    normalized.set(id, { id, name, category });
  }

  const catalogMap = new Map(catalog.map((c) => [c.id, c]));
  const added: MiniAppApiSnapshotDiff['added'] = [];
  const removed: MiniAppApiSnapshotDiff['removed'] = [];
  const categoryChanged: MiniAppApiSnapshotDiff['categoryChanged'] = [];
  let matchedCount = 0;

  for (const [id, entry] of normalized.entries()) {
    const existing = catalogMap.get(id);
    if (!existing) {
      added.push(entry);
    } else {
      matchedCount += 1;
      if (
        entry.category &&
        existing.category &&
        entry.category.toLowerCase() !== existing.category.toLowerCase()
      ) {
        categoryChanged.push({
          id,
          catalogCategory: existing.category,
          apiCategory: entry.category,
        });
      }
    }
  }

  for (const app of catalog) {
    if (!normalized.has(app.id)) {
      removed.push({ id: app.id, nameVi: app.nameVi, category: app.category });
    }
  }

  return {
    matchedCount,
    added,
    removed,
    categoryChanged,
  };
}

export function scanTextForPublicLeaks(
  content: string,
  tokens: readonly string[] = PUBLIC_LEAK_FORBIDDEN_TOKENS,
): string[] {
  const hits: string[] = [];
  for (const token of tokens) {
    if (token && content.includes(token)) {
      hits.push(token);
    }
  }
  return hits;
}
