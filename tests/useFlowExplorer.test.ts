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

  it('includes kind miniapp tech nodes in search only in tech mode', () => {
    const withMiniAppNode: MergedFlowDataset = {
      ...sampleDataset,
      subtreesByParentId: {
        ...sampleDataset.subtreesByParentId,
        b2: {
          title: 'Sub 2',
          layoutHint: 'flow',
          entryNodeIds: ['ma-user-contact'],
          nodes: [
            {
              id: 'ma-user-contact',
              label: 'Mini App: Danh bạ cá nhân (vb-ma-user-contact)',
              kind: 'miniapp' as MergedFlowDataset['rootNode']['kind'],
              audience: 'tech',
              summary: { overview: 'Mini App Danh bạ' },
            },
          ],
          edges: [],
        },
      },
    };

    expect(searchFlowNodes(withMiniAppNode, 'Danh bạ cá nhân', 'overview')).toEqual([]);
    expect(searchFlowNodes(withMiniAppNode, 'Danh bạ cá nhân', 'tech').map((h) => h.node.id)).toEqual([
      'ma-user-contact',
    ]);
  });

  it('switches platformMode (ios / android / compare), clears hidden selection, and filters searchFlowNodes by platform', () => {
    const platformDataset: MergedFlowDataset = {
      ...sampleDataset,
      subtreesByParentId: {
        ...sampleDataset.subtreesByParentId,
        b1: {
          title: 'Sub 1',
          layoutHint: 'flow',
          entryNodeIds: ['b1-ios', 'b1-and'],
          nodes: [
            {
              id: 'b1-ios',
              label: 'iOS Only Step',
              kind: 'process',
              audience: 'tech',
              platforms: ['ios'],
              summary: { overview: 'iOS' },
            },
            {
              id: 'b1-and',
              label: 'Android Only Step',
              kind: 'process',
              audience: 'tech',
              platforms: ['android'],
              summary: { overview: 'Android', tech: 'AndroidSpecificFn()' },
            },
          ] as MergedFlowDataset['subtreesByParentId']['b1']['nodes'],
          edges: [],
        },
      },
    };

    const state = createFlowExplorerState(platformDataset, true) as ReturnType<
      typeof createFlowExplorerState
    > & {
      platformMode: { value: string };
      setPlatformMode: (m: 'ios' | 'android' | 'compare') => void;
    };

    expect(state.platformMode.value).toBe('compare');
    state.setAudienceMode('tech');
    state.toggleExpand('b1');
    expect(state.visibleFlow.value.nodes.map((n) => n.id)).toContain('b1-ios');
    expect(state.visibleFlow.value.nodes.map((n) => n.id)).toContain('b1-and');

    state.selectedNodeId.value = 'b1-ios';
    state.setPlatformMode('android');
    expect(state.selectedNodeId.value).toBeNull();
    expect(state.visibleFlow.value.nodes.map((n) => n.id)).not.toContain('b1-ios');
    expect(state.visibleFlow.value.nodes.map((n) => n.id)).toContain('b1-and');

    const searchFn = searchFlowNodes as (
      d: MergedFlowDataset,
      q: string,
      m: 'overview' | 'tech',
      p?: 'ios' | 'android' | 'compare',
    ) => ReturnType<typeof searchFlowNodes>;
    expect(searchFn(platformDataset, 'AndroidSpecificFn', 'tech', 'android').map((h) => h.node.id)).toEqual([
      'b1-and',
    ]);
    expect(searchFn(platformDataset, 'AndroidSpecificFn', 'tech', 'ios')).toEqual([]);
    expect(searchFn(platformDataset, 'AndroidSpecificFn', 'overview', 'android')).toEqual([]);
  });

  it('tracks navigation history across selectNode/jumpToNode, filters hidden targets in goBack, and indexes techLabel only in tech search', () => {
    const navDataset: MergedFlowDataset = {
      ...sampleDataset,
      subtreesByParentId: {
        ...sampleDataset.subtreesByParentId,
        b1: {
          title: 'Sub 1',
          layoutHint: 'flow',
          entryNodeIds: ['b1-all', 'b1-ios-tech'],
          nodes: [
            {
              id: 'b1-all',
              label: 'Bước thân thiện',
              techLabel: 'Bước Kỹ Thuật (PushKit / bgapi)',
              kind: 'action',
              audience: 'all',
              summary: { overview: 'Chung' },
            },
            {
              id: 'b1-ios-tech',
              label: 'Nội bộ iOS',
              kind: 'process',
              audience: 'tech',
              platforms: ['ios'],
              summary: { overview: 'iOS tech' },
            },
          ],
          edges: [],
        },
      },
    };

    const state = createFlowExplorerState(navDataset, true);
    state.setAudienceMode('tech');

    state.selectNode('b1');
    expect(state.previousNode.value).toBeNull();

    state.jumpToNode('b1-ios-tech');
    expect(state.previousNode.value?.id).toBe('b1');

    state.jumpToNode('b2-1');
    expect(state.previousNode.value?.id).toBe('b1-ios-tech');

    // Chuyển sang Android làm 'b1-ios-tech' bị ẩn -> goBack phải bỏ qua 'b1-ios-tech' và quay về 'b1'
    state.setPlatformMode('android');
    expect(state.previousNode.value?.id).toBe('b1');
    expect(state.goBack()).toBe(true);
    expect(state.selectedNodeId.value).toBe('b1');
    expect(state.previousNode.value).toBeNull();
    expect(state.goBack()).toBe(false);

    // Search techLabel chỉ khớp ở chế độ 'tech'
    expect(searchFlowNodes(navDataset, 'bgapi', 'overview')).toEqual([]);
    expect(searchFlowNodes(navDataset, 'bgapi', 'tech').map((h) => h.node.id)).toEqual(['b1-all']);
  });

  it('manages scenario stepper navigation, camera target, dialog state, and resets on mode/expand changes', () => {
    const scenarioDataset: MergedFlowDataset = {
      ...sampleDataset,
      subtreesByParentId: {
        ...sampleDataset.subtreesByParentId,
        b1: {
          title: 'Sub 1',
          layoutHint: 'flow',
          entryNodeIds: ['s1'],
          nodes: [
            { id: 's1', label: 'Bước 1', kind: 'action', audience: 'all', summary: { overview: '1' } },
            { id: 's2', label: 'Bước 2', kind: 'process', audience: 'all', summary: { overview: '2' } },
            { id: 's3', label: 'Bước 3', kind: 'action', audience: 'all', summary: { overview: '3' } },
          ],
          edges: [
            { id: 'e-s12', source: 's1', target: 's2' },
            { id: 'e-s23', source: 's2', target: 's3' },
          ],
          scenarios: [
            {
              id: 'sc-demo',
              name: 'Kịch bản Demo',
              nodeIds: ['s1', 's2', 's3'],
              edgeIds: ['e-s12', 'e-s23'],
            },
          ],
        },
      },
    };

    const state = createFlowExplorerState(scenarioDataset, true);
    state.toggleExpand('b1');

    state.selectScenario('sc-demo');
    expect(state.activeScenarioId.value).toBe('sc-demo');
    expect(state.activeScenarioStepIndex.value).toBe(0);
    expect(state.activeScenarioStepNodeId.value).toBe('s1');
    expect(state.cameraTarget.value.kind).toBe('scenario_step');
    expect(getCameraTargetNodeIds(state.visibleFlow.value, state.cameraTarget.value)).toEqual(['s1', 's2']);

    state.stepScenario(1);
    expect(state.activeScenarioStepIndex.value).toBe(1);
    expect(state.activeScenarioStepNodeId.value).toBe('s2');
    expect(getCameraTargetNodeIds(state.visibleFlow.value, state.cameraTarget.value)).toEqual(['s1', 's2', 's3']);

    state.stepScenario(1);
    expect(state.activeScenarioStepIndex.value).toBe(2);
    state.stepScenario(1);
    expect(state.activeScenarioStepIndex.value).toBe(2);

    state.stepScenario(-1);
    expect(state.activeScenarioStepIndex.value).toBe(1);

    state.openScenarioDialog();
    expect(state.scenarioDialogOpen.value).toBe(true);

    // Đổi mode phải reset toàn bộ trạng thái scenario & đóng dialog
    state.setAudienceMode('tech');
    expect(state.activeScenarioId.value).toBeNull();
    expect(state.activeScenarioStepIndex.value).toBeNull();
    expect(state.scenarioDialogOpen.value).toBe(false);

    // Mở dialog trực tiếp theo ID phải tự chọn kịch bản & bước 0
    state.openScenarioDialog('sc-demo');
    expect(state.activeScenarioId.value).toBe('sc-demo');
    expect(state.activeScenarioStepIndex.value).toBe(0);
    expect(state.scenarioDialogOpen.value).toBe(true);

    state.closeScenarioDialog();
    expect(state.scenarioDialogOpen.value).toBe(false);
    expect(state.activeScenarioId.value).toBe('sc-demo');
  });

  it('preserves shared scenario dialog across setPlatformMode changes and clears platform-specific scenarios', () => {
    const platformScenarioDataset: MergedFlowDataset = {
      ...sampleDataset,
      subtreesByParentId: {
        ...sampleDataset.subtreesByParentId,
        b1: {
          title: 'Sub 1',
          layoutHint: 'flow',
          entryNodeIds: ['s1'],
          nodes: [
            { id: 's1', label: 'Bước 1', kind: 'action', audience: 'all', summary: { overview: '1' } },
            {
              id: 's2-ios',
              label: 'Bước iOS',
              kind: 'process',
              audience: 'tech',
              platforms: ['ios'],
              summary: { overview: '2 ios' },
            },
            {
              id: 's2-and',
              label: 'Bước Android',
              kind: 'process',
              audience: 'tech',
              platforms: ['android'],
              summary: { overview: '2 android' },
            },
            { id: 's3', label: 'Bước 3', kind: 'action', audience: 'all', summary: { overview: '3' } },
          ] as MergedFlowDataset['subtreesByParentId']['b1']['nodes'],
          edges: [
            { id: 'e-1ios', source: 's1', target: 's2-ios' },
            { id: 'e-1and', source: 's1', target: 's2-and' },
            { id: 'e-ios3', source: 's2-ios', target: 's3' },
            { id: 'e-and3', source: 's2-and', target: 's3' },
          ],
          scenarios: [
            {
              id: 'sc-shared',
              name: 'Kịch bản dùng chung',
              nodeIds: ['s1', 's2-ios', 's2-and', 's3'],
              edgeIds: ['e-1ios', 'e-ios3'],
            },
            {
              id: 'sc-ios-only',
              name: 'Chỉ dành cho iOS',
              nodeIds: ['s1', 's2-ios'],
              edgeIds: ['e-1ios'],
              platforms: ['ios'],
            },
          ],
        },
      },
    };

    const state = createFlowExplorerState(platformScenarioDataset, true);
    state.setAudienceMode('tech');
    state.toggleExpand('b1');

    // Khi đổi giữa các nền tảng mà kịch bản chung vẫn hợp lệ: giữ dialog mở và kẹp lại step index
    state.openScenarioDialog('sc-shared');
    state.setScenarioStep(3); // Step 3 (last step) trong compare mode (4 node)
    expect(state.scenarioDialogOpen.value).toBe(true);

    state.setPlatformMode('ios');
    expect(state.scenarioDialogOpen.value).toBe(true);
    expect(state.activeScenarioId.value).toBe('sc-shared');
    expect(state.activeScenarioStepIndex.value).toBe(2); // Kẹp còn 3 node ở iOS

    // Khi đang mở kịch bản chỉ thuộc iOS mà chuyển sang Android: phải tự đóng dialog và clear state
    state.openScenarioDialog('sc-ios-only');
    expect(state.scenarioDialogOpen.value).toBe(true);
    state.setPlatformMode('android');
    expect(state.activeScenarioId.value).toBeNull();
    expect(state.activeScenarioStepIndex.value).toBeNull();
    expect(state.scenarioDialogOpen.value).toBe(false);
  });
});
