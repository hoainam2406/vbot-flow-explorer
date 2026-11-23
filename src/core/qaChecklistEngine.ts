// src/core/qaChecklistEngine.ts
import type { ScenarioTimelineModel } from './scenarioFlowEngine';
import type { PlatformViewMode } from '../data/schema';

export type QaCaseStatus = 'untested' | 'pass' | 'fail' | 'blocked' | 'skip';
export type QaCaseCategory = 'step' | 'edge_case' | 'parity';

export interface QaTestCase {
  id: string;
  stepNumber: number;
  nodeId: string;
  nodeLabel: string;
  category: QaCaseCategory;
  title: string;
  detail?: string;
  platformScope: 'both' | 'ios' | 'android';
}

export interface QaCaseResult {
  ios: QaCaseStatus;
  android: QaCaseStatus;
  note: string;
  updatedAt?: string;
}

export type QaRunState = Record<string, QaCaseResult>;

export const QA_RUNS_STORAGE_KEY = 'vbot-flow:qa-runs:v1';

export const QA_STATUS_META: Record<QaCaseStatus, { label: string; short: string }> = {
  untested: { label: 'Chưa test', short: '—' },
  pass: { label: 'Pass', short: 'PASS' },
  fail: { label: 'Fail', short: 'FAIL' },
  blocked: { label: 'Blocked', short: 'BLK' },
  skip: { label: 'Bỏ qua', short: 'SKIP' },
};

export function createEmptyQaResult(): QaCaseResult {
  return { ios: 'untested', android: 'untested', note: '' };
}

export function buildQaTestCasesForScenario(
  timeline: ScenarioTimelineModel,
  platformMode: PlatformViewMode,
): QaTestCase[] {
  const cases: QaTestCase[] = [];
  const seenIds = new Set<string>();

  const pushCase = (item: QaTestCase) => {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    cases.push(item);
  };

  for (const step of timeline.steps) {
    const scope: 'both' | 'ios' | 'android' = step.platformTag ?? 'both';
    if (platformMode !== 'compare' && scope !== 'both' && scope !== platformMode) {
      continue;
    }

    pushCase({
      id: `step-${step.node.id}`,
      stepNumber: step.stepNumber,
      nodeId: step.node.id,
      nodeLabel: step.displayLabel,
      category: 'step',
      title: `Bước ${step.stepNumber}: ${step.displayLabel}`,
      detail: step.summaryText,
      platformScope: scope,
    });

    const detail = step.node.techDetail;
    if (!detail) continue;

    const addEdgeCases = (
      items: string[] | undefined,
      edgeScope: 'both' | 'ios' | 'android',
    ) => {
      if (!items?.length) return;
      if (platformMode !== 'compare' && edgeScope !== 'both' && edgeScope !== platformMode) {
        return;
      }
      items.forEach((ec, idx) => {
        pushCase({
          id: `edge-${step.node.id}-${edgeScope}-${idx}`,
          stepNumber: step.stepNumber,
          nodeId: step.node.id,
          nodeLabel: step.displayLabel,
          category: 'edge_case',
          title: `Edge case: ${ec}`,
          detail: `Kiểm tra tại bước "${step.displayLabel}"`,
          platformScope: edgeScope,
        });
      });
    };

    addEdgeCases(detail.edgeCases, scope);
    addEdgeCases(detail.byPlatform?.ios?.edgeCases, 'ios');
    addEdgeCases(detail.byPlatform?.android?.edgeCases, 'android');

    if (platformMode === 'compare' && detail.platformDiffNote) {
      pushCase({
        id: `parity-${step.node.id}`,
        stepNumber: step.stepNumber,
        nodeId: step.node.id,
        nodeLabel: step.displayLabel,
        category: 'parity',
        title: `Đối chiếu Parity iOS ↔ Android tại "${step.displayLabel}"`,
        detail: detail.platformDiffNote,
        platformScope: 'both',
      });
    }
  }

  return cases;
}

function readAllRuns(): Record<string, QaRunState> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(QA_RUNS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, QaRunState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadQaRunState(scenarioId: string): QaRunState {
  const all = readAllRuns();
  return all[scenarioId] ?? {};
}

export function saveQaRunState(scenarioId: string, state: QaRunState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const all = readAllRuns();
  all[scenarioId] = state;
  window.localStorage.setItem(QA_RUNS_STORAGE_KEY, JSON.stringify(all));
}

export function clearQaRunState(scenarioId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const all = readAllRuns();
  delete all[scenarioId];
  window.localStorage.setItem(QA_RUNS_STORAGE_KEY, JSON.stringify(all));
}

export function summarizeQaRun(
  cases: readonly QaTestCase[],
  state: QaRunState,
  platformMode: PlatformViewMode,
): { total: number; pass: number; fail: number; blocked: number; untested: number } {
  let pass = 0;
  let fail = 0;
  let blocked = 0;
  let untested = 0;

  for (const tc of cases) {
    const res = state[tc.id] ?? createEmptyQaResult();
    const statuses: QaCaseStatus[] = [];
    if (platformMode === 'ios') {
      if (tc.platformScope !== 'android') statuses.push(res.ios);
    } else if (platformMode === 'android') {
      if (tc.platformScope !== 'ios') statuses.push(res.android);
    } else {
      if (tc.platformScope === 'ios') statuses.push(res.ios);
      else if (tc.platformScope === 'android') statuses.push(res.android);
      else statuses.push(res.ios, res.android);
    }

    if (statuses.includes('fail')) fail += 1;
    else if (statuses.includes('blocked')) blocked += 1;
    else if (statuses.every((s) => s === 'pass' || s === 'skip') && statuses.some((s) => s === 'pass')) {
      pass += 1;
    } else if (statuses.every((s) => s === 'skip')) {
      pass += 1;
    } else {
      untested += 1;
    }
  }

  return { total: cases.length, pass, fail, blocked, untested };
}

export function exportQaRunToMarkdown(
  timeline: ScenarioTimelineModel,
  cases: readonly QaTestCase[],
  state: QaRunState,
  platformMode: PlatformViewMode,
): string {
  const stats = summarizeQaRun(cases, state, platformMode);
  const lines: string[] = [
    `# Biên bản kiểm thử QA: ${timeline.title}`,
    '',
    `- **Chế độ đối chiếu:** ${platformMode}`,
    `- **Tổng Test Case:** ${stats.total} (Pass: ${stats.pass}, Fail: ${stats.fail}, Blocked: ${stats.blocked}, Chưa test: ${stats.untested})`,
    '',
    '| # | Loại | Test Case | iOS | Android | Ghi chú |',
    '| :---: | :--- | :--- | :---: | :---: | :--- |',
  ];

  const catLabel: Record<QaCaseCategory, string> = {
    step: 'Bước luồng',
    edge_case: 'Edge case',
    parity: 'Parity',
  };

  cases.forEach((tc, idx) => {
    const res = state[tc.id] ?? createEmptyQaResult();
    const iosCol = tc.platformScope === 'android' ? 'N/A' : QA_STATUS_META[res.ios].short;
    const andCol = tc.platformScope === 'ios' ? 'N/A' : QA_STATUS_META[res.android].short;
    const safeTitle = tc.title.replace(/\|/g, '/').replace(/\r?\n+/g, ' ');
    const safeNote = (res.note || '').replace(/\|/g, '/').replace(/\r?\n+/g, ' ');
    lines.push(
      `| ${idx + 1} | ${catLabel[tc.category]} | ${safeTitle} | ${iosCol} | ${andCol} | ${safeNote} |`,
    );
  });

  lines.push('');
  return lines.join('\n');
}

function escapeCsvCell(val: string): string {
  const safe = val.replace(/\r?\n/g, ' ');
  if (/[",]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportQaRunToCsv(
  timeline: ScenarioTimelineModel,
  cases: readonly QaTestCase[],
  state: QaRunState,
): string {
  const header = ['Scenario', 'Case ID', 'Step', 'Category', 'Title', 'Scope', 'iOS', 'Android', 'Note'];
  const rows: string[] = [header.map(escapeCsvCell).join(',')];

  for (const tc of cases) {
    const res = state[tc.id] ?? createEmptyQaResult();
    rows.push(
      [
        timeline.title,
        tc.id,
        String(tc.stepNumber),
        tc.category,
        tc.title,
        tc.platformScope,
        tc.platformScope === 'android' ? 'N/A' : res.ios,
        tc.platformScope === 'ios' ? 'N/A' : res.android,
        res.note || '',
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }

  return rows.join('\n') + '\n';
}
