// tests/logTracerEngine.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildLogTraceAiDebugPrompt,
  traceLogAgainstDataset,
} from '../src/core/logTracerEngine';
import type { MergedFlowDataset } from '../src/data/schema';

const MOCK_DATASET: MergedFlowDataset = {
  app: {
    name: 'VBot Test',
    tagline: 'Test',
    techBranch: 'Nam-dev-SBSI',
  },
  rootNode: {
    id: 'vbot-app',
    label: 'VBot',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'br-call',
      label: 'Gọi điện',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Calling' },
    },
  ],
  branchEdges: [{ id: 'e-root-call', source: 'vbot-app', target: 'br-call' }],
  subtreesByParentId: {
    'br-call': {
      title: 'Calling',
      layoutHint: 'flow',
      entryNodeIds: ['call-survey'],
      nodes: [
        {
          id: 'call-survey',
          label: 'Khảo sát cuộc gọi',
          techLabel: 'DTMF #3 Call Survey',
          kind: 'action',
          audience: 'tech',
          summary: { overview: 'Gửi khảo sát' },
          techDetail: {
            apisOrEvents: ['POST /api/project-user-state-temp/get-all', 'UPDATE_STATE'],
            codeRefs: ['VBot-Android/app/src/main/java/CallForwardDTMFHelper.kt'],
            edgeCases: ['Mã lỗi 409 conflict hoặc 401 token hết hạn'],
          },
        },
        {
          id: 'ma-autodial',
          label: 'Autodial Mini App',
          kind: 'miniapp',
          audience: 'tech',
          summary: { overview: 'Gọi tự động' },
          techDetail: {
            miniAppBridge: {
              miniAppId: 'vb-ma-autodial',
              embedMode: 'modal',
              messages: [
                {
                  direction: 'miniapp_to_host',
                  name: 'start_autodial',
                  miniAppFn: 'sdk.startAutodial()',
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

describe('logTracerEngine', () => {
  it('traces codeRefs, APIs, bridge methods, and error codes chronologically', () => {
    const rawLog = [
      '2026-11-26 10:00:01 D/VbMABridge: start_autodial {"campaign":"1"}',
      '2026-11-26 10:00:02 D/OkHttp: POST /api/project-user-state-temp/get-all',
      '2026-11-26 10:00:03 E/CallForwardDTMFHelper.kt: HTTP 409 error while sending survey',
    ].join('\n');

    const report = traceLogAgainstDataset(rawLog, MOCK_DATASET);
    expect(report.totalLines).toBe(3);
    expect(report.matchedLineCount).toBe(3);
    expect(report.detectedPlatform).toBe('android');
    expect(report.orderedNodeIds).toEqual(['ma-autodial', 'call-survey']);
    expect(report.suspectedErrorNodeIds).toContain('call-survey');
    expect(report.detectedErrorCodes).toContain('409');
    expect(report.hits[0]?.matchReason).toBe('bridge_method');
    expect(report.hits[2]?.severity).toBe('error');

    const prompt = buildLogTraceAiDebugPrompt(report, MOCK_DATASET);
    expect(prompt).toContain('DEBUG TRACE');
    expect(prompt).toContain('call-survey');
    expect(prompt).toContain('CallForwardDTMFHelper.kt');
    expect(prompt).toContain('409');
  });
});
