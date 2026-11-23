// tests/graphEngine.test.ts
import { describe, expect, it } from 'vitest';
import {
  mergeDataset,
  sanitizeForPublic,
  filterAndBridgeSubtree,
  buildVisibleTreeFlow,
  countDescendants,
  getNodeDisplayLabel,
  getEdgeDisplayLabel,
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

  it('strips techDetail.miniAppBridge completely in sanitizeForPublic', () => {
    const manifestWithBridge: AppManifest = {
      ...manifest,
      branches: [
        {
          id: 'mod-call',
          label: 'Danh bạ',
          kind: 'module',
          audience: 'all',
          summary: { overview: 'Danh bạ', tech: 'Mini App' },
          techDetail: {
            codeRefs: ['Secret.swift'],
            miniAppBridge: {
              miniAppId: 'vb-ma-user-contact',
              embedMode: 'inline_tab',
              messages: [
                {
                  direction: 'miniapp_to_host',
                  name: 'user_contact_get_local',
                  hostFn: 'UserContactMiniAppBridgeHelper.executeGetLocal',
                  miniAppFn: 'getLocalContactsState()',
                },
              ],
            },
          } as AppManifest['branches'][number]['techDetail'],
        },
      ],
    };

    const dataset = mergeDataset(manifestWithBridge, [modCall]);
    const pub = sanitizeForPublic(dataset);
    const jsonText = JSON.stringify(pub);
    expect(jsonText).not.toContain('miniAppBridge');
    expect(jsonText).not.toContain('vb-ma-user-contact');
    expect(jsonText).not.toContain('user_contact_get_local');
    expect(jsonText).not.toContain('executeGetLocal');
    expect(jsonText).not.toContain('getLocalContactsState');
  });

  it('strips tech-only miniapp representative nodes, nested subtrees, and relatedNodeIds in sanitizeForPublic and overview mode', () => {
    const modWithMiniApp: FlowModuleFile = {
      schemaVersion: '1.0',
      moduleId: 'mod-call',
      subtrees: {
        'mod-call': {
          title: 'Chi tiết Gọi',
          layoutHint: 'flow',
          entryNodeIds: ['n1', 'ma-demo'],
          nodes: [
            {
              id: 'n1',
              label: 'Nhận Push',
              kind: 'external',
              audience: 'all',
              summary: { overview: 'Push' },
              relatedNodeIds: ['ma-demo'],
            },
            {
              id: 'ma-demo',
              label: 'Mini App: Danh bạ cá nhân',
              kind: 'miniapp' as SubtreeDefinition['nodes'][number]['kind'],
              audience: 'tech',
              summary: { overview: 'Mini App demo', tech: 'Host <-> Mini App bridge' },
            },
          ],
          edges: [],
        },
        'ma-demo': {
          title: 'Luồng Mini App Demo',
          layoutHint: 'flow',
          direction: 'LR',
          entryNodeIds: ['ma-step-1'],
          nodes: [
            {
              id: 'ma-step-1',
              label: 'Xoá SQLite từ Mini App',
              kind: 'process',
              audience: 'tech',
              summary: { overview: 'Xoá local SQLite' },
              techDetail: {
                miniAppBridge: {
                  miniAppId: 'vb-ma-user-contact',
                  embedMode: 'inline_tab',
                  messages: [
                    {
                      direction: 'miniapp_to_host',
                      name: 'user_contact_delete_local',
                      examplePayload: '{"syncedIds":[101]}',
                    },
                  ],
                },
              } as SubtreeDefinition['nodes'][number]['techDetail'],
            },
          ],
          edges: [],
        },
      },
    };

    const dataset = mergeDataset(manifest, [modWithMiniApp]);

    const overviewFlow = buildVisibleTreeFlow(dataset, new Set(['mod-call', 'ma-demo']), 'overview');
    expect(overviewFlow.nodes.map((n) => n.id)).toEqual(['root', 'mod-call', 'n1']);

    const techFlow = buildVisibleTreeFlow(dataset, new Set(['mod-call', 'ma-demo']), 'tech');
    expect(techFlow.nodes.map((n) => n.id)).toContain('ma-demo');
    expect(techFlow.nodes.map((n) => n.id)).toContain('ma-step-1');

    const pub = sanitizeForPublic(dataset);
    const pubJson = JSON.stringify(pub);
    expect(pubJson).not.toContain('ma-demo');
    expect(pubJson).not.toContain('syncedIds');
    expect(pubJson).not.toContain('examplePayload');
    expect(pub.subtreesByParentId['mod-call'].nodes[0].relatedNodeIds).toBeUndefined();
  });

  it('filters platform-specific nodes, bridges edges per platform, shows both in compare mode, and strips all platform tech metadata in sanitizeForPublic', () => {
    const platformSub: SubtreeDefinition = {
      title: 'Incoming Platform Flow',
      layoutHint: 'flow',
      entryNodeIds: ['start'],
      nodes: [
        {
          id: 'start',
          label: 'Nhận Push',
          kind: 'external',
          audience: 'all',
          summary: { overview: 'Push' },
        },
        {
          id: 'ios-only',
          label: 'PushKit Retry -1005',
          kind: 'process',
          audience: 'tech',
          platforms: ['ios'],
          summary: { overview: 'iOS only' },
        },
        {
          id: 'android-only',
          label: 'FCM FullScreenIntent',
          kind: 'process',
          audience: 'tech',
          platforms: ['android'],
          summary: { overview: 'Android only' },
        },
        {
          id: 'end',
          label: 'Đổ chuông',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Ring' },
          techDetail: {
            platformDiffNote: 'Khác cơ chế',
            byPlatform: {
              ios: { codeRefs: ['IOS.swift'] },
              android: { codeRefs: ['Android.kt'] },
            },
          },
        },
      ],
      edges: [
        { id: 'e-s-i', source: 'start', target: 'ios-only', platforms: ['ios'] },
        { id: 'e-i-e', source: 'ios-only', target: 'end', platforms: ['ios'] },
        { id: 'e-s-a', source: 'start', target: 'android-only', platforms: ['android'] },
        { id: 'e-a-e', source: 'android-only', target: 'end', platforms: ['android'] },
      ],
    } as SubtreeDefinition;

    const iosView = (filterAndBridgeSubtree as (s: SubtreeDefinition, m: 'overview' | 'tech', p?: 'ios' | 'android' | 'compare') => SubtreeDefinition)(
      platformSub,
      'tech',
      'ios',
    );
    expect(iosView.nodes.map((n) => n.id)).toEqual(['start', 'ios-only', 'end']);

    const androidView = (filterAndBridgeSubtree as (s: SubtreeDefinition, m: 'overview' | 'tech', p?: 'ios' | 'android' | 'compare') => SubtreeDefinition)(
      platformSub,
      'tech',
      'android',
    );
    expect(androidView.nodes.map((n) => n.id)).toEqual(['start', 'android-only', 'end']);

    const compareView = (filterAndBridgeSubtree as (s: SubtreeDefinition, m: 'overview' | 'tech', p?: 'ios' | 'android' | 'compare') => SubtreeDefinition)(
      platformSub,
      'tech',
      'compare',
    );
    expect(compareView.nodes.map((n) => n.id)).toEqual(['start', 'ios-only', 'android-only', 'end']);

    const overviewView = (filterAndBridgeSubtree as (s: SubtreeDefinition, m: 'overview' | 'tech', p?: 'ios' | 'android' | 'compare') => SubtreeDefinition)(
      platformSub,
      'overview',
      'android',
    );
    expect(overviewView.nodes.map((n) => n.id)).toEqual(['start', 'end']);
    expect(overviewView.edges).toHaveLength(1);
    expect(overviewView.edges[0].source).toBe('start');
    expect(overviewView.edges[0].target).toBe('end');

    const modPlatform: FlowModuleFile = {
      schemaVersion: '1.0',
      moduleId: 'mod-call',
      subtrees: { 'mod-call': platformSub },
    };
    const dataset = mergeDataset(manifest, [modPlatform]);
    const pubJson = JSON.stringify(sanitizeForPublic(dataset));
    expect(pubJson).not.toContain('ios-only');
    expect(pubJson).not.toContain('android-only');
    expect(pubJson).not.toContain('byPlatform');
    expect(pubJson).not.toContain('platformDiffNote');
    expect(pubJson).not.toContain('Android.kt');
    expect(pubJson).not.toContain('"platforms"');
  });

  it('resolves techLabel on nodes/edges in tech mode and strips techLabel & app.techBranch in sanitizeForPublic', () => {
    const manifestWithLabels: AppManifest = {
      ...manifest,
      app: {
        ...manifest.app,
        techBranch: 'Nam-dev',
      },
      rootNode: {
        ...manifest.rootNode,
        label: 'Ứng dụng VBot',
        techLabel: 'Ứng dụng VBot (PushKit / PJSIP)',
      },
    };

    const subWithTechLabels: SubtreeDefinition = {
      title: 'Tech Labels Test',
      layoutHint: 'flow',
      entryNodeIds: ['n1'],
      nodes: [
        {
          id: 'n1',
          label: 'Cuộc gọi đến',
          techLabel: 'Cuộc gọi đến (PushKit & CallKit / FSI)',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Gọi đến' },
        },
        {
          id: 'n2',
          label: 'Kết nối tổng đài',
          techLabel: 'Thiết lập SIP / DTMF',
          kind: 'external',
          audience: 'all',
          summary: { overview: 'Kết nối' },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          label: 'Chuyển ngay',
          techLabel: 'Chuyển ngay (Blind - DTMF #1)',
        },
      ],
    };

    expect(getNodeDisplayLabel(manifestWithLabels.rootNode, 'overview')).toBe('Ứng dụng VBot');
    expect(getNodeDisplayLabel(manifestWithLabels.rootNode, 'tech')).toBe(
      'Ứng dụng VBot (PushKit / PJSIP)',
    );
    expect(getEdgeDisplayLabel(subWithTechLabels.edges[0], 'overview')).toBe('Chuyển ngay');
    expect(getEdgeDisplayLabel(subWithTechLabels.edges[0], 'tech')).toBe(
      'Chuyển ngay (Blind - DTMF #1)',
    );

    const overviewSub = filterAndBridgeSubtree(subWithTechLabels, 'overview');
    expect(overviewSub.edges[0].label).toBe('Chuyển ngay');
    expect(overviewSub.edges[0].techLabel).toBeUndefined();

    const compareSub = filterAndBridgeSubtree(subWithTechLabels, 'tech', 'compare');
    expect(compareSub.edges[0].label).toBe('Chuyển ngay (Blind - DTMF #1)');
    expect(compareSub.edges[0].techLabel).toBeUndefined();

    const iosSub = filterAndBridgeSubtree(subWithTechLabels, 'tech', 'ios');
    expect(iosSub.edges[0].label).toBe('Chuyển ngay (Blind - DTMF #1)');

    const modLabels: FlowModuleFile = {
      schemaVersion: '1.0',
      moduleId: 'mod-call',
      subtrees: { 'mod-call': subWithTechLabels },
    };
    const merged = mergeDataset(manifestWithLabels, [modLabels]);
    const sanitized = sanitizeForPublic(merged);
    expect(sanitized.app.techBranch).toBeUndefined();

    const pubStr = JSON.stringify(sanitized);
    expect(pubStr).not.toContain('techLabel');
    expect(pubStr).not.toContain('techBranch');
    expect(pubStr).not.toContain('PushKit');
    expect(pubStr).not.toContain('DTMF');
    expect(pubStr).not.toContain('Nam-dev');
  });

  it('strips node.meta, app.repoConfig, sourceFileMap, and existingMediaPaths in sanitizeForPublic', () => {
    const manifestWithMeta: AppManifest = {
      ...manifest,
      app: {
        ...manifest.app,
        repoConfig: {
          iosRepoWebUrl: 'https://github.com/org/VBot-iOS',
          androidRepoWebUrl: 'https://github.com/org/VBot-Android',
          vbotWorkBaseUrl: 'https://work.vpmedia.vn',
        },
      },
      rootNode: {
        ...manifest.rootNode,
        meta: {
          status: 'needs_review',
          owner: 'Nam Hoang',
          lastVerifiedAt: '2026-11-23',
          workTaskUrl: 'https://work.vpmedia.vn/tasks/123',
        },
      },
    };
    const merged: ReturnType<typeof mergeDataset> = {
      ...mergeDataset(manifestWithMeta, [modCall]),
      existingMediaPaths: ['/media/app/vbot-home.webp'],
      sourceFileMap: { subtrees: { 'mod-call': 'modules/calling.json' }, moduleFiles: ['calling'] },
    };
    const pub = sanitizeForPublic(merged);
    expect(pub.app.repoConfig).toBeUndefined();
    expect(pub.rootNode.meta).toBeUndefined();
    expect(pub.existingMediaPaths).toBeUndefined();
    expect(pub.sourceFileMap).toBeUndefined();
    const pubJson = JSON.stringify(pub);
    expect(pubJson).not.toContain('repoConfig');
    expect(pubJson).not.toContain('workTaskUrl');
    expect(pubJson).not.toContain('needs_review');
    expect(pubJson).not.toContain('sourceFileMap');
    expect(pubJson).not.toContain('existingMediaPaths');
  });
});
