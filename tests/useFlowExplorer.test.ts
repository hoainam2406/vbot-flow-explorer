// tests/useFlowExplorer.test.ts
import { describe, expect, it } from 'vitest';
import {
  createFlowExplorerState,
  getCameraTargetNodeIds,
} from '../src/composables/useFlowExplorer';
import { searchFlowNodes } from '../src/composables/useSearch';
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
      nodes: [
        { id: 'b1-1', label: 'B1.1', kind: 'action', audience: 'all', summary: { overview: '1.1' } },
        {
          id: 'b1-tech',
          label: 'Socket Handler',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'Internal handler', tech: 'WebSocket sync' },
          techDetail: { codeRefs: ['TwoFactorSessionManager.swift'] },
        },
      ],
      edges: [{ id: 'e-b1', source: 'b1-1', target: 'b1-tech' }],
    },
    'b1-1': {
      title: 'Deep 1.1',
      layoutHint: 'flow',
      entryNodeIds: ['b1-1-1'],
      nodes: [
        { id: 'b1-1-1', label: 'B1.1.1', kind: 'action', audience: 'all', summary: { overview: '1.1.1' } },
      ],
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

  it('collapses nested descendants of sibling branches when accordionMode is enabled', () => {
    const state = createFlowExplorerState(sampleDataset, true);
    state.toggleExpand('b1');
    state.toggleExpand('b1-1');
    expect(state.expandedIds.value.has('b1')).toBe(true);
    expect(state.expandedIds.value.has('b1-1')).toBe(true);

    state.toggleExpand('b2');
    expect(state.expandedIds.value.has('b1')).toBe(false);
    expect(state.expandedIds.value.has('b1-1')).toBe(false);
    expect(state.expandedIds.value.has('b2')).toBe(true);
  });

  it('searches tech-only nodes and codeRefs in tech mode and excludes them in overview mode', () => {
    const overviewByLabel = searchFlowNodes(sampleDataset, 'Socket Handler', 'overview');
    const overviewByCode = searchFlowNodes(sampleDataset, 'TwoFactorSessionManager', 'overview');
    expect(overviewByLabel).toEqual([]);
    expect(overviewByCode).toEqual([]);

    const techByLabel = searchFlowNodes(sampleDataset, 'Socket Handler', 'tech');
    const techByCode = searchFlowNodes(sampleDataset, 'TwoFactorSessionManager', 'tech');
    expect(techByLabel.map((hit) => hit.node.id)).toEqual(['b1-tech']);
    expect(techByCode.map((hit) => hit.node.id)).toEqual(['b1-tech']);
  });

  it('tracks camera target for newly expanded branch, collapses back cleanly, and preserves subtree focus on mode switch', () => {
    const state = createFlowExplorerState(sampleDataset, true);
    expect(state.cameraTarget.value.kind).toBe('all');
    expect(getCameraTargetNodeIds(state.visibleFlow.value, state.cameraTarget.value)).toBeNull();

    state.toggleExpand('b1');
    state.toggleExpand('b1-1');
    expect(state.cameraTarget.value.kind).toBe('subtree');
    expect(state.cameraTarget.value.nodeId).toBe('b1-1');
    expect(getCameraTargetNodeIds(state.visibleFlow.value, state.cameraTarget.value)).toEqual([
      'b1-1',
      'b1-1-1',
    ]);

    const seqBeforeModeSwitch = state.cameraTarget.value.seq;
    state.setAudienceMode('tech');
    expect(state.cameraTarget.value.kind).toBe('subtree');
    expect(state.cameraTarget.value.nodeId).toBe('b1-1');
    expect(state.cameraTarget.value.seq).toBeGreaterThan(seqBeforeModeSwitch);

    state.toggleExpand('b1-1');
    expect(state.cameraTarget.value.kind).toBe('subtree');
    expect(state.cameraTarget.value.nodeId).toBe('b1');

    state.toggleExpand('b1');
    expect(state.cameraTarget.value.kind).toBe('all');
    expect(getCameraTargetNodeIds(state.visibleFlow.value, state.cameraTarget.value)).toBeNull();

    state.jumpToNode('b2-1');
    expect(state.cameraTarget.value.kind).toBe('node');
    expect(state.cameraTarget.value.nodeId).toBe('b2-1');
    expect(getCameraTargetNodeIds(state.visibleFlow.value, state.cameraTarget.value)).toEqual([
      'b2',
      'b2-1',
    ]);
  });

  it('searches miniAppBridge.miniAppId and bridge messages in tech mode only', () => {
    const bridgeDataset: MergedFlowDataset = {
      ...sampleDataset,
      subtreesByParentId: {
        ...sampleDataset.subtreesByParentId,
        b1: {
          ...sampleDataset.subtreesByParentId.b1,
          nodes: [
            {
              id: 'b1-1',
              label: 'B1.1',
              kind: 'action',
              audience: 'all',
              summary: { overview: '1.1' },
              techDetail: {
                miniAppBridge: {
                  miniAppId: 'vb-ma-2fa-setting',
                  embedMode: 'modal',
                  messages: [
                    {
                      direction: 'host_to_miniapp',
                      name: 'setup_2fa',
                      hostFn: 'VbTwoFactorSocketHandler.dispatchParsedEvent → MiniAppService.emitEventIfMiniAppOpen',
                      miniAppFn: 'on("setup_2fa", cb)',
                      payload: '{ is_enable, timestamp }',
                    },
                  ],
                },
              } as MergedFlowDataset['rootNode']['techDetail'],
            },
          ],
        },
      },
    };

    expect(searchFlowNodes(bridgeDataset, 'vb-ma-2fa-setting', 'overview')).toEqual([]);
    expect(searchFlowNodes(bridgeDataset, 'setup_2fa', 'overview')).toEqual([]);
    expect(searchFlowNodes(bridgeDataset, 'emitEventIfMiniAppOpen', 'overview')).toEqual([]);
    expect(searchFlowNodes(bridgeDataset, 'on("setup_2fa", cb)', 'overview')).toEqual([]);

    expect(searchFlowNodes(bridgeDataset, 'vb-ma-2fa-setting', 'tech').map((h) => h.node.id)).toEqual([
      'b1-1',
    ]);
    expect(searchFlowNodes(bridgeDataset, 'setup_2fa', 'tech').map((h) => h.node.id)).toEqual([
      'b1-1',
    ]);
    expect(searchFlowNodes(bridgeDataset, 'emitEventIfMiniAppOpen', 'tech').map((h) => h.node.id)).toEqual([
      'b1-1',
    ]);
    expect(searchFlowNodes(bridgeDataset, 'on("setup_2fa", cb)', 'tech').map((h) => h.node.id)).toEqual([
      'b1-1',
    ]);
  });
});
