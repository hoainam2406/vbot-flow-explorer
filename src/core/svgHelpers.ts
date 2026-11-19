// src/core/svgHelpers.ts
import type { NodeKind } from '../data/schema';

export interface NodeKindStyleMeta {
  label: string;
  fill: string;
  stroke: string;
  badgeBg: string;
  cardCls: string;
  badgeCls: string;
}

export type ScenarioActivityRole = 'user' | 'app' | 'miniapp' | 'system';

export interface ActivityRoleMeta {
  id: ScenarioActivityRole;
  label: string;
  badgeCls: string;
  fill: string;
  stroke: string;
  textFill: string;
}

export const ACTIVITY_ROLE_META: Record<ScenarioActivityRole, ActivityRoleMeta> = {
  user: {
    id: 'user',
    label: 'Người dùng',
    badgeCls: 'border-blue-200 bg-white/90 text-blue-700',
    fill: '#eff6ff',
    stroke: '#bfdbfe',
    textFill: '#1d4ed8',
  },
  app: {
    id: 'app',
    label: 'Ứng dụng VBot',
    badgeCls: 'border-indigo-200 bg-white/90 text-indigo-700',
    fill: '#eef2ff',
    stroke: '#c7d2fe',
    textFill: '#4338ca',
  },
  miniapp: {
    id: 'miniapp',
    label: 'Mini App',
    badgeCls: 'border-cyan-200 bg-white/90 text-cyan-700',
    fill: '#ecfeff',
    stroke: '#a5f3fc',
    textFill: '#0e7490',
  },
  system: {
    id: 'system',
    label: 'Hệ thống / Tổng đài',
    badgeCls: 'border-emerald-200 bg-white/90 text-emerald-700',
    fill: '#ecfdf5',
    stroke: '#a7f3d0',
    textFill: '#047857',
  },
};

export function resolveActivityRole(kind: NodeKind): ScenarioActivityRole {
  if (kind === 'action') return 'user';
  if (kind === 'miniapp') return 'miniapp';
  if (kind === 'external') return 'system';
  return 'app';
}

export const SVG_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const NODE_KIND_STYLE_META: Record<NodeKind, NodeKindStyleMeta> = {
  module: {
    label: 'Module',
    fill: '#eef2ff',
    stroke: '#a5b4fc',
    badgeBg: '#4f46e5',
    cardCls: 'border-indigo-300 bg-indigo-50/95',
    badgeCls: 'bg-indigo-600 text-white',
  },
  miniapp: {
    label: 'Mini App',
    fill: '#ecfeff',
    stroke: '#22d3ee',
    badgeBg: '#0891b2',
    cardCls: 'border-cyan-400 bg-cyan-50/95',
    badgeCls: 'bg-cyan-600 text-white',
  },
  action: {
    label: 'Thao tác',
    fill: '#eff6ff',
    stroke: '#93c5fd',
    badgeBg: '#2563eb',
    cardCls: 'border-blue-300 bg-blue-50/95',
    badgeCls: 'bg-blue-600 text-white',
  },
  process: {
    label: 'Xử lý',
    fill: '#f5f3ff',
    stroke: '#c4b5fd',
    badgeBg: '#7c3aed',
    cardCls: 'border-violet-300 bg-violet-50/95',
    badgeCls: 'bg-violet-600 text-white',
  },
  decision: {
    label: 'Điều kiện',
    fill: '#fffbeb',
    stroke: '#fcd34d',
    badgeBg: '#f59e0b',
    cardCls: 'border-amber-300 bg-amber-50/95',
    badgeCls: 'bg-amber-500 text-white',
  },
  external: {
    label: 'Hệ thống',
    fill: '#ecfdf5',
    stroke: '#6ee7b7',
    badgeBg: '#059669',
    cardCls: 'border-emerald-300 bg-emerald-50/95',
    badgeCls: 'bg-emerald-600 text-white',
  },
  error: {
    label: 'Lỗi / Retry',
    fill: '#fff1f2',
    stroke: '#fda4af',
    badgeBg: '#e11d48',
    cardCls: 'border-rose-300 bg-rose-50/95',
    badgeCls: 'bg-rose-600 text-white',
  },
};

/** Escape special XML characters for safe inline SVG interpolation. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Word-wrap text into at most `maxLines` lines capped at `maxCharsPerLine`. */
export function wrapSvgText(
  text: string,
  maxCharsPerLine: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        break;
      }
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (lines.length === maxLines && lines.join(' ').length < text.trim().length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] =
      last.length > maxCharsPerLine - 1
        ? `${last.slice(0, maxCharsPerLine - 1)}…`
        : `${last}…`;
  }

  return lines.slice(0, maxLines);
}
