// @vitest-environment jsdom
// tests/devCockpitHelpers.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMultiNodeAiContextPrompt,
  buildParityPortPrompt,
} from '../src/core/aiContextExport';
import {
  loadDevWorkspacePins,
  setNodeDevNote,
  togglePinNode,
} from '../src/core/devWorkspacePins';
import { highlightCodeLine } from '../src/core/jsonHighlight';
import { buildMockRuleFromWireFrame } from '../src/core/miniAppDevPresets';
import { extractParityReport } from '../src/core/parityAnalyzer';
import {
  buildIdeFileUrl,
  createDefaultDevSettings,
} from '../src/core/workspaceSettings';
import type { MergedFlowDataset } from '../src/data/schema';

const SAMPLE_DATASET: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test', techBranch: 'Nam-dev-SBSI' },
  rootNode: {
    id: 'vbot-app',
    label: 'Root',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'br-call',
      label: 'Calling',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Calling' },
    },
  ],
  branchEdges: [{ id: 'e1', source: 'vbot-app', target: 'br-call' }],
  subtreesByParentId: {
    'br-call': {
      title: 'Calling',
      layoutHint: 'flow',
      entryNodeIds: ['call-survey'],
      nodes: [
        {
          id: 'call-survey',
          label: 'Khảo sát cuộc gọi',
          kind: 'action',
          audience: 'tech',
          summary: { overview: 'Khảo sát DTMF #3' },
          techDetail: {
            platformDiffNote: 'Android cooldown 3000ms vs iOS isSendingSurvey',
            codeRefs: [
              'VBot-iOS/Call/CallSurveyHelper.swift',
              'VBot-Android/app/CallForwardDTMFHelper.kt',
            ],
            edgeCases: ['Không gửi lặp khi đang pending'],
            parityAssessment: {
              code: 'CALL-01',
              verdict: 'logic_diff',
              sameLogic: false,
              sameOutcome: true,
              needsFix: 'consider',
              fixTarget: 'android',
              explanation: 'iOS khóa nút bằng flag; Android dùng cooldown 3s',
              recommendation: 'Đồng bộ toast lỗi khi gửi thất bại trên Android',
            },
          },
        },
      ],
      edges: [],
    },
  },
};

describe('Dev Cockpit helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('appends :line safely to IDE deep links', () => {
    const settings = {
      ...createDefaultDevSettings(),
      localIosRepoPath: '/Users/nam/VBot-iOS',
      preferredIde: 'cursor' as const,
    };
    expect(buildIdeFileUrl('VBot-iOS/Call/CallSurveyHelper.swift', settings, 42)).toBe(
      'cursor://file/Users/nam/VBot-iOS/Call/CallSurveyHelper.swift:42',
    );
    expect(buildIdeFileUrl('VBot-iOS/Call/CallSurveyHelper.swift', settings, 0)).toBe(
      'cursor://file/Users/nam/VBot-iOS/Call/CallSurveyHelper.swift',
    );
  });

  it('escapes HTML against XSS while highlighting Swift/Kotlin tokens', () => {
    const html = highlightCodeLine('func surveyCall() { let s = "<script>alert(1)</script>" }', 'swift');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('text-fuchsia-300');
  });

  it('builds Parity Port Prompt with embedded local code/diff and Multi-Node AI Prompt', () => {
    const parity = extractParityReport(SAMPLE_DATASET);
    const item = parity.items[0];
    expect(item).toBeDefined();
    if (!item) return;

    const portPrompt = buildParityPortPrompt(item, SAMPLE_DATASET, {
      direction: 'ios_to_android',
      liveSources: [
        {
          platform: 'ios',
          ref: 'Call/CallSurveyHelper.swift',
          excerpt: 'func surveyCall() {}',
          gitDiff: '+ print("survey")',
        },
      ],
    });
    expect(portPrompt).toContain('[PORT iOS → Android] CALL-01');
    expect(portPrompt).toContain('func surveyCall() {}');
    expect(portPrompt).toContain('+ print("survey")');

    const multiPrompt = buildMultiNodeAiContextPrompt(
      [SAMPLE_DATASET.subtreesByParentId['br-call']!.nodes[0]!],
      SAMPLE_DATASET,
      {
        platformMode: 'compare',
        personalNotesByNodeId: { 'call-survey': 'Check Android toast' },
        changedFiles: ['VBot-Android/app/CallForwardDTMFHelper.kt'],
      },
    );
    expect(multiPrompt).toContain('Check Android toast');
    expect(multiPrompt).toContain('CallForwardDTMFHelper.kt');
  });

  it('creates HostFetchMockRule from host_fetch wire frames and persists Working Pins', () => {
    const rule = buildMockRuleFromWireFrame(
      {
        id: 'rx-1',
        timestamp: '10:00:00',
        direction: 'host_to_miniapp',
        channel: 'Proxy',
        methodOrEvent: 'host_fetch_result',
        status: 'ok',
        payload: {
          status: 200,
          url: 'https://api-dev.vbot.vn/v1/customers?page=1',
          data: { items: [{ id: 1 }] },
        },
      },
      {
        id: 'tx-1',
        timestamp: '10:00:00',
        direction: 'miniapp_to_host',
        channel: 'SDK',
        methodOrEvent: 'host_fetch',
        status: 'ok',
        payload: { method: 'GET', url: 'https://api-dev.vbot.vn/v1/customers?page=1' },
      },
    );
    expect(rule).not.toBeNull();
    expect(rule?.method).toBe('GET');
    expect(rule?.urlPattern).toBe('*/v1/customers*');
    expect(rule?.status).toBe(200);

    const p1 = togglePinNode('call-survey');
    expect(p1.pinnedNodeIds).toEqual(['call-survey']);
    const p2 = setNodeDevNote('call-survey', 'Fix toast');
    expect(p2.notesByNodeId['call-survey']).toBe('Fix toast');
    const loaded = loadDevWorkspacePins();
    expect(loaded.pinnedNodeIds).toEqual(['call-survey']);
    expect(loaded.notesByNodeId['call-survey']).toBe('Fix toast');
    const p3 = togglePinNode('call-survey');
    expect(p3.pinnedNodeIds).toEqual([]);
  });
});
