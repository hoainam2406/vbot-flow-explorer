// tests/apiAtlasEngine.test.ts
import { describe, expect, it } from 'vitest';
import { buildApiAtlas, exportApiAtlasMarkdown } from '../src/core/apiAtlasEngine';
import type { MergedFlowDataset } from '../src/data/schema';

const ATLAS_DATASET: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test' },
  rootNode: {
    id: 'vbot-app',
    label: 'Root',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'br-sync',
      label: 'Agent State',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Sync' },
    },
  ],
  branchEdges: [{ id: 'e1', source: 'vbot-app', target: 'br-sync' }],
  subtreesByParentId: {
    'br-sync': {
      title: 'Agent State',
      layoutHint: 'flow',
      entryNodeIds: ['node-ws'],
      nodes: [
        {
          id: 'node-ws',
          label: 'Realtime Sync',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'WS + SIP' },
          techDetail: {
            apisOrEvents: ['WS vbot.state / UPDATE_STATE', 'GET /api/project/get-state'],
            edgeCases: ['HTTP 401 retry 1 lần; lỗi 803 không tồn tại'],
            byPlatform: {
              ios: { apisOrEvents: ['getStateBySip'] },
              android: { apisOrEvents: ['getState'] },
            },
            miniAppBridge: {
              miniAppId: 'vb-ma-autodial',
              embedMode: 'modal',
              messages: [
                {
                  direction: 'miniapp_to_host',
                  name: 'show_toast',
                  parityNote: 'iOS chưa hỗ trợ',
                },
              ],
            },
          },
        },
      ],
      edges: [],
    },
  },
};

describe('apiAtlasEngine', () => {
  it('categorizes REST, WebSocket, Bridge, Error Codes and flags platform mismatches', () => {
    const report = buildApiAtlas(ATLAS_DATASET);

    expect(report.byKind.websocket).toBeGreaterThanOrEqual(1);
    expect(report.byKind.rest).toBeGreaterThanOrEqual(1);
    expect(report.byKind.bridge).toBe(1);
    expect(report.byKind.error_code).toBeGreaterThanOrEqual(2);

    const iosOnlySip = report.entries.find((e) => e.token === 'getStateBySip');
    expect(iosOnlySip?.hasPlatformMismatch).toBe(true);
    expect(iosOnlySip?.platforms).toEqual(['ios']);

    const bridgeEntry = report.entries.find((e) => e.kind === 'bridge');
    expect(bridgeEntry?.hasPlatformMismatch).toBe(true);
    expect(bridgeEntry?.mismatchNote).toContain('iOS chưa hỗ trợ');

    const md = exportApiAtlasMarkdown(report);
    expect(md).toContain('VBot API, WebSocket, SIP & Bridge Atlas');
    expect(md).toContain('vbot.state');
  });
});
