// src/core/miniAppWireDiff.ts
import type { SandboxWireLogEntry } from './miniAppSandboxEngine';
import type { WireSessionFile } from './miniAppWireSession';

export type WireDiffKind = 'same' | 'added' | 'removed' | 'status_changed' | 'payload_diff';

export interface WireFieldDiff {
  path: string;
  valueA: unknown;
  valueB: unknown;
}

export interface WireDiffRow {
  index: number;
  key: string;
  kind: WireDiffKind;
  entryA?: SandboxWireLogEntry;
  entryB?: SandboxWireLogEntry;
  fieldDiffs: WireFieldDiff[];
}

export interface WireDiffReport {
  appIdA: string;
  appIdB: string;
  platformA: string;
  platformB: string;
  ignoreVolatileFields: boolean;
  rows: WireDiffRow[];
  summary: {
    total: number;
    same: number;
    added: number;
    removed: number;
    statusChanged: number;
    payloadDiff: number;
  };
}

const VOLATILE_KEYS = new Set(['request_id', 'timestamp', 'call_id', 'exportedAt']);

function frameKey(entry: SandboxWireLogEntry): string {
  return `${entry.direction}::${entry.methodOrEvent}`;
}

export function normalizePayloadForDiff(input: unknown, ignoreVolatileFields: boolean): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((item) => normalizePayloadForDiff(item, ignoreVolatileFields));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      if (ignoreVolatileFields && VOLATILE_KEYS.has(key)) continue;
      out[key] = normalizePayloadForDiff(
        (input as Record<string, unknown>)[key],
        ignoreVolatileFields,
      );
    }
    return out;
  }
  return input;
}

function collectFieldDiffs(
  valA: unknown,
  valB: unknown,
  prefix = '',
  diffs: WireFieldDiff[] = [],
): WireFieldDiff[] {
  if (Object.is(valA, valB)) return diffs;

  const isObjA = Boolean(valA) && typeof valA === 'object' && !Array.isArray(valA);
  const isObjB = Boolean(valB) && typeof valB === 'object' && !Array.isArray(valB);

  if (isObjA && isObjB) {
    const objA = valA as Record<string, unknown>;
    const objB = valB as Record<string, unknown>;
    const keys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
    for (const k of [...keys].sort()) {
      const nextPath = prefix ? `${prefix}.${k}` : k;
      collectFieldDiffs(objA[k], objB[k], nextPath, diffs);
    }
    return diffs;
  }

  if (Array.isArray(valA) && Array.isArray(valB)) {
    const maxLen = Math.max(valA.length, valB.length);
    for (let i = 0; i < maxLen; i += 1) {
      collectFieldDiffs(valA[i], valB[i], `${prefix}[${i}]`, diffs);
    }
    return diffs;
  }

  if (JSON.stringify(valA) !== JSON.stringify(valB)) {
    diffs.push({
      path: prefix || '(root)',
      valueA: valA,
      valueB: valB,
    });
  }
  return diffs;
}

export function compareWireSessions(
  sessionA: WireSessionFile,
  sessionB: WireSessionFile,
  options?: { ignoreVolatileFields?: boolean },
): WireDiffReport {
  const ignoreVolatileFields = options?.ignoreVolatileFields ?? true;
  const listA = sessionA.wireLogs;
  const listB = sessionB.wireLogs;
  const n = listA.length;
  const m = listB.length;

  // LCS matrix on direction + methodOrEvent
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (frameKey(listA[i]) === frameKey(listB[j])) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rows: WireDiffRow[] = [];
  let i = 0;
  let j = 0;
  let rowIndex = 0;

  while (i < n && j < m) {
    if (frameKey(listA[i]) === frameKey(listB[j])) {
      const a = listA[i];
      const b = listB[j];
      const normA = normalizePayloadForDiff(a.payload, ignoreVolatileFields);
      const normB = normalizePayloadForDiff(b.payload, ignoreVolatileFields);
      const fieldDiffs = collectFieldDiffs(normA, normB);
      let kind: WireDiffKind = 'same';
      if (a.status !== b.status) {
        kind = 'status_changed';
      } else if (fieldDiffs.length > 0) {
        kind = 'payload_diff';
      }
      rows.push({
        index: rowIndex++,
        key: frameKey(a),
        kind,
        entryA: a,
        entryB: b,
        fieldDiffs,
      });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      const a = listA[i++];
      rows.push({
        index: rowIndex++,
        key: frameKey(a),
        kind: 'removed',
        entryA: a,
        fieldDiffs: [],
      });
    } else {
      const b = listB[j++];
      rows.push({
        index: rowIndex++,
        key: frameKey(b),
        kind: 'added',
        entryB: b,
        fieldDiffs: [],
      });
    }
  }

  while (i < n) {
    const a = listA[i++];
    rows.push({
      index: rowIndex++,
      key: frameKey(a),
      kind: 'removed',
      entryA: a,
      fieldDiffs: [],
    });
  }

  while (j < m) {
    const b = listB[j++];
    rows.push({
      index: rowIndex++,
      key: frameKey(b),
      kind: 'added',
      entryB: b,
      fieldDiffs: [],
    });
  }

  return {
    appIdA: sessionA.appId,
    appIdB: sessionB.appId,
    platformA: sessionA.hostConfig.platform,
    platformB: sessionB.hostConfig.platform,
    ignoreVolatileFields,
    rows,
    summary: {
      total: rows.length,
      same: rows.filter((r) => r.kind === 'same').length,
      added: rows.filter((r) => r.kind === 'added').length,
      removed: rows.filter((r) => r.kind === 'removed').length,
      statusChanged: rows.filter((r) => r.kind === 'status_changed').length,
      payloadDiff: rows.filter((r) => r.kind === 'payload_diff').length,
    },
  };
}

export function exportWireDiffMarkdown(report: WireDiffReport): string {
  const lines: string[] = [
    `# So sánh Wire Log: ${report.appIdA} (${report.platformA}) vs ${report.appIdB} (${report.platformB})`,
    '',
    `- **Tổng frames đối chiếu:** ${report.summary.total}`,
    `- **Giống nhau:** ${report.summary.same} · **Khác status:** ${report.summary.statusChanged} · **Khác payload:** ${report.summary.payloadDiff} · **Thêm ở B:** ${report.summary.added} · **Thiếu ở B:** ${report.summary.removed}`,
    '',
    '| # | Frame | Loại sai lệch | Phiên A | Phiên B | Chi tiết field khác |',
    '| :---: | --- | --- | --- | --- | --- |',
  ];

  for (const row of report.rows) {
    if (row.kind === 'same') continue;
    const label = row.entryA?.methodOrEvent ?? row.entryB?.methodOrEvent ?? row.key;
    const statusA = row.entryA ? `${row.entryA.status}` : '—';
    const statusB = row.entryB ? `${row.entryB.status}` : '—';
    const diffs =
      row.fieldDiffs.length > 0
        ? row.fieldDiffs
            .map((d) => `\`${d.path}\`: ${JSON.stringify(d.valueA)} → ${JSON.stringify(d.valueB)}`)
            .join('; ')
        : '—';
    lines.push(`| ${row.index + 1} | \`${label}\` | ${row.kind} | ${statusA} | ${statusB} | ${diffs} |`);
  }

  return lines.join('\n') + '\n';
}
