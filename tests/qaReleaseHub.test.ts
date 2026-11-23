// tests/qaReleaseHub.test.ts
import { describe, expect, it } from 'vitest';
import {
  collectAllDatasetScenarios,
  createQaReleaseSession,
  exportReleaseSignoffMarkdown,
  mergeQaReleaseSessions,
  parseQaReleaseJson,
  serializeQaRelease,
  summarizeReleaseProgress,
} from '../src/core/qaReleaseHub';
import type { MergedFlowDataset } from '../src/data/schema';

const TEST_DS: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test' },
  rootNode: {
    id: 'vbot-app',
    label: 'VBot',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'mod-auth',
      label: 'Auth',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Auth' },
    },
  ],
  branchEdges: [{ id: 'e0', source: 'vbot-app', target: 'mod-auth' }],
  subtreesByParentId: {
    'mod-auth': {
      title: 'Auth',
      layoutHint: 'flow',
      entryNodeIds: ['login-1'],
      nodes: [
        {
          id: 'login-1',
          label: 'Nhập SĐT',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Phone' },
          techDetail: { edgeCases: ['SĐT sai định dạng'] },
        },
        {
          id: 'login-2',
          label: 'Xác thực OTP',
          kind: 'process',
          audience: 'all',
          summary: { overview: 'OTP' },
        },
      ],
      edges: [{ id: 'e1', source: 'login-1', target: 'login-2' }],
      scenarios: [
        {
          id: 'sc-login',
          name: 'Đăng nhập chuẩn',
          nodeIds: ['login-1', 'login-2'],
          edgeIds: ['e1'],
        },
      ],
    },
  },
};

describe('qaReleaseHub', () => {
  it('collects scenarios across collapsed subtrees and summarizes iOS/Android progress', () => {
    const scenarios = collectAllDatasetScenarios(TEST_DS);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].cases).toHaveLength(3); // 2 steps + 1 edge case

    const rel = createQaReleaseSession('v2.4.0 - RC1', 'QA A');
    rel.runsByScenarioId['sc-login'] = {
      'step-login-1': { ios: 'pass', android: 'fail', note: 'Android crash nhẹ' },
      'step-login-2': { ios: 'pass', android: 'pass', note: '' },
    };

    const summary = summarizeReleaseProgress(TEST_DS, rel);
    expect(summary.totalScenarios).toBe(1);
    expect(summary.ios.pass).toBe(2);
    expect(summary.android.fail).toBe(1);

    const md = exportReleaseSignoffMarkdown(TEST_DS, rel);
    expect(md).toContain('v2.4.0 - RC1');
    expect(md).toContain('Android crash nhẹ');
  });

  it('serializes, parses, and merges iOS and Android tester sessions', () => {
    const iosRel = createQaReleaseSession('RC1', 'iOS QA', 'rel-1');
    iosRel.runsByScenarioId['sc-login'] = {
      'step-login-1': { ios: 'pass', android: 'untested', note: '', updatedAt: '2026-11-23T10:00:00Z' },
    };

    const androidRel = createQaReleaseSession('RC1', 'Android QA', 'rel-2');
    androidRel.runsByScenarioId['sc-login'] = {
      'step-login-1': {
        ios: 'untested',
        android: 'pass',
        note: 'OK trên Pixel',
        updatedAt: '2026-11-23T11:00:00Z',
      },
    };

    const parsed = parseQaReleaseJson(serializeQaRelease(androidRel));
    expect(parsed.ok).toBe(true);

    const merged = mergeQaReleaseSessions(iosRel, androidRel, 'latest_timestamp');
    expect(merged.runsByScenarioId['sc-login']['step-login-1']).toMatchObject({
      ios: 'pass',
      android: 'pass',
      note: 'OK trên Pixel',
    });
  });
});
