// @vitest-environment jsdom
// tests/devManagementSuite.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildBranchComparisonSummary,
  exportBranchReleaseMarkdown,
} from '../src/core/branchReleaseSummary';
import {
  buildBulkNodeUpdatePatches,
  buildFlatManageableNodes,
} from '../src/core/bulkNodeManager';
import { applyDraftPatchesToDataset } from '../src/core/datasetDraftStore';
import {
  buildDevDashboardSummary,
  exportDevDashboardMarkdown,
} from '../src/core/devDashboardEngine';
import {
  applyDevProfileBackup,
  exportDevProfileBackup,
  getDevProfileCountsSummary,
  parseDevProfileBackupJson,
} from '../src/core/devProfileBackup';
import {
  collectNodeTaskBadges,
  extractVbotTaskKey,
  loadDevWorkboard,
  updateWorkboardTaskStatus,
  upsertWorkboardTask,
} from '../src/core/devWorkboardStore';
import { togglePinNode, setNodeDevNote } from '../src/core/devWorkspacePins';
import { saveDevWorkspaceSettings, createDefaultDevSettings } from '../src/core/workspaceSettings';
import type { MergedFlowDataset } from '../src/data/schema';

const BASE_DATASET: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test', techBranch: 'Nam-dev' },
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
          kind: 'action',
          audience: 'tech',
          summary: { overview: 'Khảo sát' },
          meta: {
            status: 'wip',
            lastVerifiedAt: '2026-08-01',
            workTaskUrl: 'https://work.vpmedia.vn/dashboard/VbM-832',
          },
          techDetail: {
            platformDiffNote: 'iOS có UI xác nhận; Android chưa gắn dialog',
            apisOrEvents: ['POST /api/call/survey'],
            codeRefs: ['VBot-iOS/Call/Survey.swift'],
            parityAssessment: {
              code: 'CALL-01',
              verdict: 'action_needed',
              sameLogic: false,
              sameOutcome: false,
              needsFix: 'yes',
              fixTarget: 'android',
              explanation: 'Android chưa gắn UI',
              recommendation: 'Gắn dialog xác nhận trên Android',
            },
          },
        },
      ],
      edges: [],
    },
  },
};

const NEXT_DATASET: MergedFlowDataset = {
  ...BASE_DATASET,
  app: { ...BASE_DATASET.app, techBranch: 'Nam-dev-SBSI' },
  subtreesByParentId: {
    'br-call': {
      ...BASE_DATASET.subtreesByParentId['br-call']!,
      nodes: [
        {
          ...BASE_DATASET.subtreesByParentId['br-call']!.nodes[0]!,
          meta: {
            status: 'stable',
            lastVerifiedAt: '2026-11-26',
            workTaskUrl: 'https://work.vpmedia.vn/dashboard/VbM-832',
          },
          techDetail: {
            platformDiffNote: 'Đã đồng bộ confirm dialog trên cả 2 nền tảng',
            apisOrEvents: ['POST /api/call/survey', 'WS vbot.state'],
            codeRefs: ['VBot-iOS/Call/Survey.swift', 'VBot-Android/CallSurvey.kt'],
            parityAssessment: {
              code: 'CALL-01',
              verdict: 'synced',
              sameLogic: true,
              sameOutcome: true,
              needsFix: 'no',
              fixTarget: 'none',
              explanation: 'Đã đồng bộ',
              recommendation: 'Giữ nguyên',
            },
          },
        },
        {
          id: 'call-dtmf-log',
          label: 'Ghi log DTMF',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'Log DTMF' },
        },
      ],
    },
  },
};

describe('Dev Management Suite (v4)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('manages Dev Workboard tasks, extracts VbM-* keys, and builds Canvas task badges', () => {
    expect(extractVbotTaskKey('https://work.vpmedia.vn/task/VbM-832')).toBe('VbM-832');

    const wb1 = upsertWorkboardTask({
      title: 'Fix CALL-01 Android',
      url: 'https://work.vpmedia.vn/task/VbM-901',
      status: 'doing',
      platform: 'android',
      priority: 'high',
      nodeId: 'call-survey',
    });
    expect(wb1.tasks.length).toBe(1);
    expect(wb1.tasks[0]?.key).toBe('VbM-901');

    const wb2 = updateWorkboardTaskStatus(wb1.tasks[0]!.id, 'done');
    expect(loadDevWorkboard().tasks[0]?.status).toBe('done');

    const badges = collectNodeTaskBadges(BASE_DATASET, wb2);
    expect(badges['call-survey']?.label).toBe('VbM-901');
    expect(badges['call-survey']?.status).toBe('done');
  });

  it('builds flat manageable nodes and valid DraftPatches for bulk updates', () => {
    const rows = buildFlatManageableNodes(BASE_DATASET, {
      referenceDate: '2026-11-27',
      personalNotesByNodeId: { 'call-survey': 'Check DTMF' },
    });
    const surveyRow = rows.find((r) => r.node.id === 'call-survey');
    expect(surveyRow?.isStale).toBe(true);
    expect(surveyRow?.taskKey).toBe('VbM-832');
    expect(surveyRow?.personalNote).toBe('Check DTMF');

    const patches = buildBulkNodeUpdatePatches(BASE_DATASET, ['call-survey'], {
      status: 'stable',
      lastVerifiedAt: '2026-11-27',
      owner: 'Hoài Nam',
    });
    expect(patches.length).toBe(1);

    const applied = applyDraftPatchesToDataset(BASE_DATASET, patches);
    expect(applied.errors).toEqual([]);
    const updatedNode = applied.dataset.subtreesByParentId['br-call']?.nodes[0];
    expect(updatedNode?.meta?.status).toBe('stable');
    expect(updatedNode?.meta?.lastVerifiedAt).toBe('2026-11-27');
    expect(updatedNode?.meta?.owner).toBe('Hoài Nam');
    expect(updatedNode?.meta?.workTaskUrl).toBe('https://work.vpmedia.vn/dashboard/VbM-832');
  });

  it('builds Dev Dashboard summary and exports Markdown report', () => {
    togglePinNode('call-survey');
    setNodeDevNote('call-survey', 'Ưu tiên Android');

    const summary = buildDevDashboardSummary(BASE_DATASET, {
      pinnedNodeIds: ['call-survey'],
      devNotesByNodeId: { 'call-survey': 'Ưu tiên Android' },
      referenceDate: '2026-11-27',
    });
    expect(summary.totals.parityActionNeeded).toBe(1);
    expect(summary.totals.wipCount).toBe(1);
    expect(summary.totals.staleCount).toBe(1);
    expect(summary.parityQueues.android.length).toBe(1);
    expect(summary.pinnedSummaries[0]?.note).toBe('Ưu tiên Android');

    const md = exportDevDashboardMarkdown(summary);
    expect(md).toContain('Báo cáo Quản lý Dev VBot');
    expect(md).toContain('CALL-01');
  });

  it('builds Branch Comparison Summary with module matrix, new APIs, parity delta, and Mermaid', () => {
    const summary = buildBranchComparisonSummary(BASE_DATASET, NEXT_DATASET, {
      baseLabel: 'Nam-dev',
      currentLabel: 'Nam-dev-SBSI',
    });
    expect(summary.moduleMatrix[0]?.nodesAdded).toBe(1);
    expect(summary.moduleMatrix[0]?.nodesModified).toBe(1);
    expect(summary.newApis.some((a) => a.includes('vbot.state'))).toBe(true);
    expect(summary.parityDelta.resolvedCodes[0]?.code).toBe('CALL-01');

    const md = exportBranchReleaseMarkdown(summary);
    expect(md).toContain('Nam-dev → Nam-dev-SBSI');
    expect(md).toContain('```mermaid');
  });

  it('exports, validates, and restores Dev Profile Backup in merge and replace modes', () => {
    saveDevWorkspaceSettings({
      ...createDefaultDevSettings(),
      localIosRepoPath: '/Users/dev/VBot-iOS',
    });
    togglePinNode('call-survey');
    upsertWorkboardTask({
      title: 'Task A',
      status: 'todo',
      platform: 'ios',
      priority: 'medium',
    });

    const backup = exportDevProfileBackup();
    const raw = JSON.stringify(backup);
    const parsed = parseDevProfileBackupJson(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    window.localStorage.clear();
    expect(getDevProfileCountsSummary().pinnedCount).toBe(0);

    const res = applyDevProfileBackup(parsed.backup, 'replace');
    expect(res.restoredSections.length).toBeGreaterThanOrEqual(3);
    expect(getDevProfileCountsSummary().pinnedCount).toBe(1);
    expect(getDevProfileCountsSummary().workboardTaskCount).toBe(1);

    // Verify merge preserves existing pin
    togglePinNode('br-call');
    applyDevProfileBackup(parsed.backup, 'merge');
    expect(getDevProfileCountsSummary().pinnedCount).toBe(2);
  });
});
