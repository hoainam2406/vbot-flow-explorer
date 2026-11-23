// src/core/qaReleaseHub.ts
import { z } from 'zod';
import { getNodeDisplayLabel, type VisibleFlowResult } from './graphEngine';
import {
  buildQaTestCasesForScenario,
  createEmptyQaResult,
  type QaCaseResult,
  type QaCaseStatus,
  type QaRunState,
  type QaTestCase,
} from './qaChecklistEngine';
import { buildScenarioTimeline, type ScenarioTimelineModel } from './scenarioFlowEngine';
import type { FlowEdgeData, FlowNodeData, MergedFlowDataset, Scenario } from '../data/schema';

export const QA_RELEASES_STORAGE_KEY = 'vbot-flow:qa-releases:v1';
export const QA_ACTIVE_RELEASE_KEY = 'vbot-flow:qa-active-release:v1';
export const MAX_QA_RELEASE_IMPORT_BYTES = 5 * 1024 * 1024;

export const QaCaseStatusSchema = z.enum(['untested', 'pass', 'fail', 'blocked', 'skip']);

export const QaCaseResultSchema = z.object({
  ios: QaCaseStatusSchema.default('untested'),
  android: QaCaseStatusSchema.default('untested'),
  note: z.string().default(''),
  updatedAt: z.string().optional(),
});

export const QaReleaseSessionSchema = z.object({
  schemaVersion: z.literal('vbot-qa-release/v1'),
  id: z.string().min(1),
  name: z.string().min(1),
  testerName: z.string().default('QA Team'),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  notes: z.string().optional(),
  runsByScenarioId: z.record(z.string(), z.record(z.string(), QaCaseResultSchema)),
});

export type QaReleaseSession = z.infer<typeof QaReleaseSessionSchema>;

export interface CollectedDatasetScenario {
  scenario: Scenario;
  parentId: string;
  parentLabel: string;
  timeline: ScenarioTimelineModel;
  cases: QaTestCase[];
}

export interface PlatformStatusCounts {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skip: number;
  untested: number;
}

export interface ScenarioReleaseProgress {
  scenarioId: string;
  scenarioName: string;
  parentId: string;
  parentLabel: string;
  totalCases: number;
  ios: PlatformStatusCounts;
  android: PlatformStatusCounts;
}

export interface ReleaseProgressSummary {
  totalScenarios: number;
  totalCases: number;
  ios: PlatformStatusCounts;
  android: PlatformStatusCounts;
  passRateIos: number;
  passRateAndroid: number;
  scenarios: ScenarioReleaseProgress[];
}

export function createQaReleaseSession(
  name: string,
  testerName = 'QA Team',
  id?: string,
): QaReleaseSession {
  const now = new Date().toISOString();
  return {
    schemaVersion: 'vbot-qa-release/v1',
    id: id ?? `rel-${Date.now().toString(36)}`,
    name: name.trim() || 'Release mặc định',
    testerName: testerName.trim() || 'QA Team',
    createdAt: now,
    updatedAt: now,
    runsByScenarioId: {},
  };
}

export function loadQaReleases(): QaReleaseSession[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(QA_RELEASES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: QaReleaseSession[] = [];
    for (const item of parsed) {
      const res = QaReleaseSessionSchema.safeParse(item);
      if (res.success) out.push(res.data);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveQaReleases(releases: readonly QaReleaseSession[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(QA_RELEASES_STORAGE_KEY, JSON.stringify(releases));
  } catch {
    // ignore storage quota errors
  }
}

export function getActiveReleaseId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(QA_ACTIVE_RELEASE_KEY);
  } catch {
    return null;
  }
}

export function setActiveReleaseId(releaseId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(QA_ACTIVE_RELEASE_KEY, releaseId);
  } catch {
    // ignore
  }
}

export function ensureDefaultQaRelease(): {
  releases: QaReleaseSession[];
  activeRelease: QaReleaseSession;
} {
  let releases = loadQaReleases();
  if (releases.length === 0) {
    const created = createQaReleaseSession('Release hiện tại', 'QA Team', 'rel-default');
    releases = [created];
    saveQaReleases(releases);
    setActiveReleaseId(created.id);
    return { releases, activeRelease: created };
  }
  const savedActiveId = getActiveReleaseId();
  const activeRelease = releases.find((r) => r.id === savedActiveId) ?? releases[0];
  setActiveReleaseId(activeRelease.id);
  return { releases, activeRelease };
}

export function syncScenarioRunToActiveRelease(
  scenarioId: string,
  runState: QaRunState,
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const { releases, activeRelease } = ensureDefaultQaRelease();
  const updated: QaReleaseSession = {
    ...activeRelease,
    updatedAt: new Date().toISOString(),
    runsByScenarioId: {
      ...activeRelease.runsByScenarioId,
      [scenarioId]: runState,
    },
  };
  saveQaReleases(releases.map((r) => (r.id === updated.id ? updated : r)));
}

function buildDatasetFlatFlow(dataset: MergedFlowDataset): VisibleFlowResult {
  const nodes: FlowNodeData[] = [dataset.rootNode, ...dataset.branches];
  const edges: FlowEdgeData[] = [...dataset.branchEdges];
  const nodeParentMap: Record<string, string> = {};
  const activeScenarios: Scenario[] = [];
  const seen = new Set<string>(nodes.map((n) => n.id));

  for (const branch of dataset.branches) {
    nodeParentMap[branch.id] = dataset.rootNode.id;
  }
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    for (const n of sub.nodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        nodes.push(n);
      }
      if (!nodeParentMap[n.id]) nodeParentMap[n.id] = parentId;
    }
    edges.push(...sub.edges);
    if (sub.scenarios?.length) activeScenarios.push(...sub.scenarios);
  }
  return { nodes, edges, nodeParentMap, activeScenarios };
}

export function collectAllDatasetScenarios(
  dataset: MergedFlowDataset,
): CollectedDatasetScenario[] {
  const flatFlow = buildDatasetFlatFlow(dataset);
  const nodeLabelById = new Map(
    flatFlow.nodes.map((n) => [n.id, getNodeDisplayLabel(n, 'tech')]),
  );
  const out: CollectedDatasetScenario[] = [];

  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    if (!sub.scenarios?.length) continue;
    const parentLabel = nodeLabelById.get(parentId) ?? sub.title ?? parentId;
    for (const sc of sub.scenarios) {
      const timeline = buildScenarioTimeline(sc, flatFlow, 'tech');
      const cases = buildQaTestCasesForScenario(timeline, 'compare');
      out.push({
        scenario: sc,
        parentId,
        parentLabel,
        timeline,
        cases,
      });
    }
  }
  return out;
}

function emptyCounts(): PlatformStatusCounts {
  return { total: 0, pass: 0, fail: 0, blocked: 0, skip: 0, untested: 0 };
}

function accumulateStatus(counts: PlatformStatusCounts, status: QaCaseStatus): void {
  counts.total += 1;
  counts[status] += 1;
}

export function summarizeReleaseProgress(
  dataset: MergedFlowDataset,
  release: QaReleaseSession,
): ReleaseProgressSummary {
  const collected = collectAllDatasetScenarios(dataset);
  const totalIos = emptyCounts();
  const totalAndroid = emptyCounts();
  const scenarios: ScenarioReleaseProgress[] = [];

  for (const entry of collected) {
    const run = release.runsByScenarioId[entry.scenario.id] ?? {};
    const ios = emptyCounts();
    const android = emptyCounts();

    for (const tc of entry.cases) {
      const res = run[tc.id] ?? createEmptyQaResult();
      if (tc.platformScope !== 'android') {
        accumulateStatus(ios, res.ios);
        accumulateStatus(totalIos, res.ios);
      }
      if (tc.platformScope !== 'ios') {
        accumulateStatus(android, res.android);
        accumulateStatus(totalAndroid, res.android);
      }
    }

    scenarios.push({
      scenarioId: entry.scenario.id,
      scenarioName: entry.scenario.name,
      parentId: entry.parentId,
      parentLabel: entry.parentLabel,
      totalCases: entry.cases.length,
      ios,
      android,
    });
  }

  const calcPassRate = (c: PlatformStatusCounts) => {
    const effective = c.total - c.skip;
    if (effective <= 0) return c.total > 0 ? 100 : 0;
    return Math.round((c.pass / effective) * 100);
  };

  return {
    totalScenarios: collected.length,
    totalCases: collected.reduce((acc, s) => acc + s.cases.length, 0),
    ios: totalIos,
    android: totalAndroid,
    passRateIos: calcPassRate(totalIos),
    passRateAndroid: calcPassRate(totalAndroid),
    scenarios,
  };
}

export type QaMergeStrategy = 'latest_timestamp' | 'fill_untested' | 'overwrite_incoming';

function mergeSingleCaseResult(
  base: QaCaseResult,
  incoming: QaCaseResult,
  strategy: QaMergeStrategy,
): QaCaseResult {
  if (strategy === 'overwrite_incoming') {
    return { ...incoming };
  }
  if (strategy === 'fill_untested') {
    return {
      ios: base.ios === 'untested' ? incoming.ios : base.ios,
      android: base.android === 'untested' ? incoming.android : base.android,
      note: base.note.trim() ? base.note : incoming.note,
      updatedAt:
        incoming.updatedAt && (!base.updatedAt || incoming.updatedAt > base.updatedAt)
          ? incoming.updatedAt
          : base.updatedAt,
    };
  }

  // latest_timestamp
  const tBase = base.updatedAt ?? '';
  const tInc = incoming.updatedAt ?? '';
  const preferIncoming = tInc > tBase;
  return {
    ios:
      base.ios === 'untested'
        ? incoming.ios
        : incoming.ios === 'untested'
          ? base.ios
          : preferIncoming
            ? incoming.ios
            : base.ios,
    android:
      base.android === 'untested'
        ? incoming.android
        : incoming.android === 'untested'
          ? base.android
          : preferIncoming
            ? incoming.android
            : base.android,
    note:
      preferIncoming && incoming.note.trim()
        ? incoming.note
        : base.note.trim() || incoming.note,
    updatedAt: preferIncoming ? tInc || tBase : tBase || tInc,
  };
}

export function mergeQaReleaseSessions(
  target: QaReleaseSession,
  incoming: QaReleaseSession,
  strategy: QaMergeStrategy = 'latest_timestamp',
): QaReleaseSession {
  const mergedRuns: Record<string, QaRunState> = {};
  const allScenarioIds = new Set([
    ...Object.keys(target.runsByScenarioId),
    ...Object.keys(incoming.runsByScenarioId),
  ]);

  for (const scId of allScenarioIds) {
    const runA = target.runsByScenarioId[scId] ?? {};
    const runB = incoming.runsByScenarioId[scId] ?? {};
    const nextRun: QaRunState = {};
    const caseIds = new Set([...Object.keys(runA), ...Object.keys(runB)]);
    for (const cid of caseIds) {
      const a = runA[cid];
      const b = runB[cid];
      if (a && b) nextRun[cid] = mergeSingleCaseResult(a, b, strategy);
      else if (a) nextRun[cid] = { ...a };
      else if (b) nextRun[cid] = { ...b };
    }
    mergedRuns[scId] = nextRun;
  }

  return {
    ...target,
    updatedAt: new Date().toISOString(),
    runsByScenarioId: mergedRuns,
  };
}

export function serializeQaRelease(release: QaReleaseSession): string {
  return JSON.stringify(release, null, 2) + '\n';
}

export function parseQaReleaseJson(
  raw: string,
): { ok: true; release: QaReleaseSession } | { ok: false; error: string } {
  if (raw.length > MAX_QA_RELEASE_IMPORT_BYTES) {
    return { ok: false, error: 'File tiến độ QA vượt quá giới hạn 5MB.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cú pháp JSON: ${err instanceof Error ? err.message : 'không đọc được'}`,
    };
  }
  const res = QaReleaseSessionSchema.safeParse(parsed);
  if (!res.success) {
    return { ok: false, error: 'File không đúng định dạng vbot-qa-release/v1.' };
  }
  return { ok: true, release: res.data };
}

export function exportReleaseSignoffMarkdown(
  dataset: MergedFlowDataset,
  release: QaReleaseSession,
): string {
  const summary = summarizeReleaseProgress(dataset, release);
  const collected = collectAllDatasetScenarios(dataset);

  const lines: string[] = [
    `# Báo cáo QA Release Sign-off: ${release.name}`,
    '',
    `- **Người phụ trách:** ${release.testerName}`,
    `- **Cập nhật lúc:** ${release.updatedAt}`,
    `- **Tổng Kịch bản / Test Case:** ${summary.totalScenarios} kịch bản · ${summary.totalCases} cases`,
    `- **Tiến độ iOS:** Pass ${summary.ios.pass}/${summary.ios.total} (${summary.passRateIos}%) · Fail: ${summary.ios.fail} · Blocked: ${summary.ios.blocked}`,
    `- **Tiến độ Android:** Pass ${summary.android.pass}/${summary.android.total} (${summary.passRateAndroid}%) · Fail: ${summary.android.fail} · Blocked: ${summary.android.blocked}`,
    '',
    '## 1. Tổng hợp theo Kịch bản',
    '',
    '| Phân hệ | Kịch bản | Cases | iOS (Pass/Fail/Blk) | Android (Pass/Fail/Blk) |',
    '| :--- | :--- | :---: | :---: | :---: |',
  ];

  for (const sc of summary.scenarios) {
    lines.push(
      `| ${sc.parentLabel} | ${sc.scenarioName} | ${sc.totalCases} | ${sc.ios.pass}/${sc.ios.fail}/${sc.ios.blocked} | ${sc.android.pass}/${sc.android.fail}/${sc.android.blocked} |`,
    );
  }

  const issueLines: string[] = [];
  for (const entry of collected) {
    const run = release.runsByScenarioId[entry.scenario.id] ?? {};
    for (const tc of entry.cases) {
      const res = run[tc.id];
      if (!res) continue;
      if (
        res.ios === 'fail' ||
        res.ios === 'blocked' ||
        res.android === 'fail' ||
        res.android === 'blocked'
      ) {
        issueLines.push(
          `- **[${entry.scenario.name}]** ${tc.title} — iOS: \`${res.ios}\`, Android: \`${res.android}\`${res.note ? ` · _${res.note}_` : ''}`,
        );
      }
    }
  }

  lines.push('', '## 2. Danh sách Case Fail / Blocked');
  if (issueLines.length === 0) {
    lines.push('- Không ghi nhận case Fail / Blocked nào.');
  } else {
    lines.push(...issueLines);
  }

  return lines.join('\n') + '\n';
}
