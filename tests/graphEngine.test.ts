// tests/graphEngine.test.ts
import { describe, expect, it } from 'vitest';
import {
  mergeDataset,
  sanitizeForPublic,
  filterAndBridgeSubtree,
  buildVisibleTreeFlow,
  countDescendants,
} from '../src/core/graphEngine';
import type { AppManifest, FlowModuleFile, SubtreeDefinition } from '../src/data/schema';

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

  it('remaps bridged edges and preserves direct edge IDs in overview scenarios', () => {
    const dataset = mergeDataset(manifest, [modCall]);
    const bridgedModCall = filterAndBridgeSubtree(dataset.subtreesByParentId['mod-call'], 'overview');
    expect(bridgedModCall.scenarios).toHaveLength(1);
    expect(bridgedModCall.scenarios?.[0].id).toBe('s-all');
    expect(bridgedModCall.scenarios?.[0].nodeIds).toEqual(['n1', 'n3']);
    expect(bridgedModCall.scenarios?.[0].edgeIds).toEqual([bridgedModCall.edges[0].id]);

    const mixedSubtree: SubtreeDefinition = {
      title: 'Mixed flow',
      layoutHint: 'flow',
      entryNodeIds: ['v1'],
      nodes: [
        { id: 'v1', label: 'Start', kind: 'action', audience: 'all', summary: { overview: 'S' } },
        { id: 'v2', label: 'Mid', kind: 'action', audience: 'all', summary: { overview: 'M' } },
        { id: 't1', label: 'Internal', kind: 'process', audience: 'tech', summary: { overview: 'T' } },
        { id: 'v3', label: 'End', kind: 'action', audience: 'all', summary: { overview: 'E' } },
      ],
      edges: [
        { id: 'e-direct', source: 'v1', target: 'v2', label: 'Next' },
        { id: 'e-v2-t1', source: 'v2', target: 't1' },
        { id: 'e-t1-v3', source: 't1', target: 'v3', label: 'Done' },
      ],
      scenarios: [
        {
          id: 'sc-mixed',
          name: 'Mixed scenario',
          audience: 'all',
          nodeIds: ['v1', 'v2', 't1', 'v3'],
          edgeIds: ['e-direct', 'e-v2-t1', 'e-t1-v3'],
        },
      ],
    };

    const bridgedMixed = filterAndBridgeSubtree(mixedSubtree, 'overview');
    expect(bridgedMixed.edges.map((e) => e.id)).toEqual(['e-direct', 'bridge-v2-v3']);
    expect(bridgedMixed.scenarios?.[0].nodeIds).toEqual(['v1', 'v2', 'v3']);
    expect(bridgedMixed.scenarios?.[0].edgeIds).toEqual(['e-direct', 'bridge-v2-v3']);
  });
});
