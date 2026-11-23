// src/core/impactAnalyzer.ts
import { getNodeDisplayLabel } from './graphEngine';
import type { BridgeParityAlert, CoreBridgeSpecItem, MiniAppCatalogEntry } from '../data/miniAppBridgeCatalog';
import type { MiniAppPermissionProfile } from '../data/miniAppPermissionMatrix';
import type { FlowNodeData, MergedFlowDataset, Scenario } from '../data/schema';

export type ImpactAxis =
  | 'all'
  | 'api_event'
  | 'bridge_method'
  | 'rbac_permission'
  | 'code_ref'
  | 'miniapp';

export type ConcreteImpactAxis = Exclude<ImpactAxis, 'all'>;

export interface ImpactMatchToken {
  axis: ConcreteImpactAxis;
  token: string;
}

export interface ImpactNodeHit {
  node: FlowNodeData;
  nodeLabel: string;
  branchId: string;
  branchLabel: string;
  tokens: ImpactMatchToken[];
}

export interface ImpactScenarioHit {
  scenario: Scenario;
  parentId: string;
  matchedNodeIds: string[];
}

export interface ImpactSuggestedToken {
  token: string;
  axis: ConcreteImpactAxis;
  count: number;
}

export interface ImpactIndex {
  nodeHits: Map<string, ImpactNodeHit>;
  scenarios: Array<{ scenario: Scenario; parentId: string }>;
  tokenCounts: ImpactSuggestedToken[];
  catalog: readonly MiniAppCatalogEntry[];
  specs: readonly CoreBridgeSpecItem[];
  profiles: Record<string, MiniAppPermissionProfile>;
  parityAlerts: readonly BridgeParityAlert[];
}

export interface ImpactQueryResult {
  query: string;
  axis: ImpactAxis;
  nodes: ImpactNodeHit[];
  scenarios: ImpactScenarioHit[];
  miniApps: MiniAppCatalogEntry[];
  parityAlerts: BridgeParityAlert[];
}

function extractNodeTokens(
  node: FlowNodeData,
  profiles: Record<string, MiniAppPermissionProfile>,
): ImpactMatchToken[] {
  const tokens: ImpactMatchToken[] = [];
  const seen = new Set<string>();
  const add = (axis: ConcreteImpactAxis, raw: string | undefined) => {
    const token = raw?.trim();
    if (!token) return;
    const key = `${axis}::${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    tokens.push({ axis, token });
  };

  const detail = node.techDetail;
  if (!detail) return tokens;

  for (const api of detail.apisOrEvents ?? []) add('api_event', api);
  for (const api of detail.byPlatform?.ios?.apisOrEvents ?? []) add('api_event', api);
  for (const api of detail.byPlatform?.android?.apisOrEvents ?? []) add('api_event', api);

  for (const ref of detail.codeRefs ?? []) add('code_ref', ref);
  for (const ref of detail.byPlatform?.ios?.codeRefs ?? []) add('code_ref', ref);
  for (const ref of detail.byPlatform?.android?.codeRefs ?? []) add('code_ref', ref);

  const bridge = detail.miniAppBridge;
  if (bridge) {
    const appIds = bridge.miniAppId.match(/vb-ma-[a-z0-9-]+/g) ?? [];
    for (const appId of appIds) {
      add('miniapp', appId);
      const profile = profiles[appId];
      if (profile) {
        if (profile.visibilityModule) {
          add(
            'rbac_permission',
            profile.visibilityAction
              ? `${profile.visibilityModule}-${profile.visibilityAction}`
              : profile.visibilityModule,
          );
        }
        for (const cap of profile.manifestCapabilities) {
          add('rbac_permission', cap.module);
          for (const act of cap.actions) {
            add('rbac_permission', `${cap.module}-${act}`);
          }
        }
      }
    }

    for (const msg of bridge.messages) {
      add('bridge_method', msg.name);
      if (msg.miniAppFn) {
        if (msg.name === 'check_permissions') {
          const permMods = msg.miniAppFn.match(/[A-Z_]{3,}/g) ?? [];
          for (const pm of permMods) add('rbac_permission', pm);
        }
      }
      if (msg.payload && msg.name === 'check_permissions') {
        const permMods = msg.payload.match(/[A-Z_]{3,}/g) ?? [];
        for (const pm of permMods) add('rbac_permission', pm);
      }
    }
  }

  return tokens;
}

export function buildImpactIndex(
  dataset: MergedFlowDataset,
  catalog: readonly MiniAppCatalogEntry[],
  specs: readonly CoreBridgeSpecItem[],
  profiles: Record<string, MiniAppPermissionProfile>,
  parityAlerts: readonly BridgeParityAlert[] = [],
): ImpactIndex {
  const nodeHits = new Map<string, ImpactNodeHit>();
  const scenarios: Array<{ scenario: Scenario; parentId: string }> = [];
  const tokenFreq = new Map<string, { axis: ConcreteImpactAxis; token: string; nodes: Set<string> }>();

  const registerNode = (node: FlowNodeData, branchId: string, branchLabel: string) => {
    if (nodeHits.has(node.id)) return;
    const tokens = extractNodeTokens(node, profiles);
    nodeHits.set(node.id, {
      node,
      nodeLabel: getNodeDisplayLabel(node, 'tech'),
      branchId,
      branchLabel,
      tokens,
    });
    for (const t of tokens) {
      const k = `${t.axis}::${t.token}`;
      const existing = tokenFreq.get(k) ?? { axis: t.axis, token: t.token, nodes: new Set() };
      existing.nodes.add(node.id);
      tokenFreq.set(k, existing);
    }
  };

  const walkSubtree = (parentId: string, branchId: string, branchLabel: string, visited = new Set<string>()) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);
    const sub = dataset.subtreesByParentId[parentId];
    if (!sub) return;
    for (const sc of sub.scenarios ?? []) {
      scenarios.push({ scenario: sc, parentId });
    }
    for (const child of sub.nodes) {
      registerNode(child, branchId, branchLabel);
      walkSubtree(child.id, branchId, branchLabel, visited);
    }
  };

  registerNode(
    dataset.rootNode,
    dataset.rootNode.id,
    getNodeDisplayLabel(dataset.rootNode, 'tech'),
  );
  for (const branch of dataset.branches) {
    const bLabel = getNodeDisplayLabel(branch, 'tech');
    registerNode(branch, branch.id, bLabel);
    walkSubtree(branch.id, branch.id, bLabel);
  }

  const tokenCounts: ImpactSuggestedToken[] = [...tokenFreq.values()]
    .map((v) => ({ token: v.token, axis: v.axis, count: v.nodes.size }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));

  return {
    nodeHits,
    scenarios,
    tokenCounts,
    catalog,
    specs,
    profiles,
    parityAlerts,
  };
}

export function queryImpact(
  index: ImpactIndex,
  rawQuery: string,
  axis: ImpactAxis = 'all',
): ImpactQueryResult {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return {
      query: rawQuery,
      axis,
      nodes: [],
      scenarios: [],
      miniApps: [],
      parityAlerts: [],
    };
  }

  const matchedNodes: ImpactNodeHit[] = [];
  const matchedNodeIdSet = new Set<string>();
  const matchedMiniAppIds = new Set<string>();

  for (const hit of index.nodeHits.values()) {
    const filteredTokens = hit.tokens.filter(
      (t) => (axis === 'all' || t.axis === axis) && t.token.toLowerCase().includes(q),
    );
    const labelMatches =
      axis === 'all' &&
      (hit.nodeLabel.toLowerCase().includes(q) || hit.node.id.toLowerCase().includes(q));

    if (filteredTokens.length > 0 || labelMatches) {
      matchedNodes.push({
        ...hit,
        tokens: filteredTokens.length > 0 ? filteredTokens : hit.tokens.slice(0, 4),
      });
      matchedNodeIdSet.add(hit.node.id);
      for (const t of hit.tokens) {
        if (t.axis === 'miniapp') matchedMiniAppIds.add(t.token);
      }
    }
  }

  const scenarios: ImpactScenarioHit[] = [];
  for (const entry of index.scenarios) {
    const overlap = entry.scenario.nodeIds.filter((id) => matchedNodeIdSet.has(id));
    if (overlap.length > 0) {
      scenarios.push({
        scenario: entry.scenario,
        parentId: entry.parentId,
        matchedNodeIds: overlap,
      });
    }
  }

  const miniApps = index.catalog.filter((app) => {
    if (matchedMiniAppIds.has(app.id)) return true;
    if (axis === 'miniapp' || axis === 'all') {
      if (app.id.toLowerCase().includes(q) || app.nameVi.toLowerCase().includes(q)) return true;
    }
    if (axis === 'bridge_method' || axis === 'all') {
      if ((app.customActions ?? []).some((act) => act.toLowerCase().includes(q))) return true;
    }
    if (axis === 'rbac_permission' || axis === 'all') {
      const profile = index.profiles[app.id];
      if (
        profile?.manifestCapabilities.some(
          (c) =>
            c.module.toLowerCase().includes(q) ||
            c.actions.some((a) => `${c.module}-${a}`.toLowerCase().includes(q) || a.toLowerCase().includes(q)),
        )
      ) {
        return true;
      }
    }
    return false;
  });

  const parityAlerts = index.parityAlerts.filter((alert) => {
    if (alert.relatedNodeId && matchedNodeIdSet.has(alert.relatedNodeId)) return true;
    const text = `${alert.title} ${alert.scope} ${alert.iosBehavior} ${alert.androidBehavior} ${alert.recommendationForMiniApp}`.toLowerCase();
    return text.includes(q);
  });

  return {
    query: rawQuery,
    axis,
    nodes: matchedNodes,
    scenarios,
    miniApps,
    parityAlerts,
  };
}
