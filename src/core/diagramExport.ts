// src/core/diagramExport.ts
import { Position } from '@vue-flow/core';
import {
  buildRoutedEdgePath,
  type EdgeRoute,
  type PositionedFlowNode,
} from '../composables/useGraphLayout';
import type { FlowEdgeData, NodeKind, PlatformViewMode } from '../data/schema';
import { downloadBlob, downloadTextFile, slugifyFilename } from './downloadHelper';

export interface DiagramExportOptions {
  nodes: PositionedFlowNode[];
  edges: FlowEdgeData[];
  edgeRoutes: Record<string, EdgeRoute>;
  title: string;
  subtitle?: string;
  activeEdgeIds?: Set<string>;
  dimInactive?: boolean;
  includeTechBadges?: boolean;
  platformMode?: PlatformViewMode;
  childCounts?: Record<string, number>;
  expandedIds?: Set<string>;
}

interface KindColors {
  label: string;
  fill: string;
  stroke: string;
  badgeBg: string;
}

const KIND_COLOR_MAP: Record<NodeKind, KindColors> = {
  module: { label: 'Module', fill: '#eef2ff', stroke: '#a5b4fc', badgeBg: '#4f46e5' },
  miniapp: { label: 'Mini App', fill: '#ecfeff', stroke: '#22d3ee', badgeBg: '#0891b2' },
  action: { label: 'Thao tác', fill: '#eff6ff', stroke: '#93c5fd', badgeBg: '#2563eb' },
  process: { label: 'Xử lý', fill: '#f5f3ff', stroke: '#c4b5fd', badgeBg: '#7c3aed' },
  decision: { label: 'Điều kiện', fill: '#fffbeb', stroke: '#fcd34d', badgeBg: '#f59e0b' },
  external: { label: 'Hệ thống', fill: '#ecfdf5', stroke: '#6ee7b7', badgeBg: '#059669' },
  error: { label: 'Lỗi / Retry', fill: '#fff1f2', stroke: '#fda4af', badgeBg: '#e11d48' },
};

const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
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
  } else if (lines.length === maxLines) {
    const joined = lines.join(' ');
    if (joined.length < text.trim().length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] =
        last.length > maxCharsPerLine - 1
          ? `${last.slice(0, maxCharsPerLine - 1)}…`
          : `${last}…`;
    }
  }

  return lines.slice(0, maxLines);
}

interface PillBadge {
  text: string;
  bg: string;
  fg: string;
  border?: string;
}

function estimateBadgeWidth(text: string): number {
  return Math.max(32, Math.ceil(text.length * 6.1 + 14));
}

export function renderFlowDiagramSvg(options: DiagramExportOptions): string {
  const nodeMap = new Map(options.nodes.map((n) => [n.id, n]));
  const routedEdges = options.edges
    .map((edge) => {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) return null;

      const sourceX = src.position.x + src.data.estimatedWidth;
      const sourceY = src.position.y + src.data.estimatedHeight / 2;
      const targetX = tgt.position.x;
      const targetY = tgt.position.y + tgt.data.estimatedHeight / 2;
      const route = options.edgeRoutes[edge.id];
      const routed = buildRoutedEdgePath({
        sourceX,
        sourceY,
        sourcePosition: Position.Right,
        targetX,
        targetY,
        targetPosition: Position.Left,
        route,
      });

      return { edge, route, routed };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includePoint = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const node of options.nodes) {
    includePoint(node.position.x, node.position.y);
    includePoint(
      node.position.x + node.data.estimatedWidth,
      node.position.y + node.data.estimatedHeight,
    );
    if ((options.childCounts?.[node.id] ?? 0) > 0) {
      includePoint(node.position.x + node.data.estimatedWidth + 14, node.position.y + 10);
    }
  }

  for (const item of routedEdges) {
    for (const pt of item.route?.points ?? []) {
      includePoint(pt.x, pt.y);
    }
    if (item.edge.label) {
      includePoint(item.routed.labelX - 96, item.routed.labelY - 18);
      includePoint(item.routed.labelX + 96, item.routed.labelY + 18);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 320;
    maxY = 120;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const padX = 48;
  const padTop = 84;
  const padBottom = 48;

  const svgW = Math.max(520, Math.ceil(contentW + padX * 2));
  const svgH = Math.ceil(contentH + padTop + padBottom);
  const offsetX = Math.round((svgW - contentW) / 2 - minX);
  const offsetY = Math.round(padTop - minY);

  const edgeSvgParts: string[] = [];
  const labelSvgParts: string[] = [];

  for (const item of routedEdges) {
    const isHighlighted = options.activeEdgeIds?.has(item.edge.id) ?? false;
    const isDimmed = Boolean(options.dimInactive) && !isHighlighted;
    const stroke = isHighlighted ? '#2563eb' : isDimmed ? '#cbd5e1' : '#94a3b8';
    const strokeWidth = isHighlighted ? 2.6 : isDimmed ? 1.3 : 1.7;
    const opacity = isDimmed ? 0.28 : 1;
    const markerId = isHighlighted ? 'arrow-active' : isDimmed ? 'arrow-dim' : 'arrow-default';

    edgeSvgParts.push(
      `<path d="${item.routed.path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" marker-end="url(#${markerId})" />`,
    );

    if (item.edge.label) {
      const labelLines = wrapText(item.edge.label, 24, 2);
      const maxLineLen = Math.max(...labelLines.map((l) => l.length));
      const pillW = Math.min(190, Math.max(44, Math.ceil(maxLineLen * 6.2 + 16)));
      const pillH = labelLines.length * 14 + 8;
      const pillX = Math.round(item.routed.labelX - pillW / 2);
      const pillY = Math.round(item.routed.labelY - pillH / 2);
      const pillFill = isHighlighted ? '#eff6ff' : '#ffffff';
      const pillStroke = isHighlighted ? '#3b82f6' : '#e2e8f0';
      const textFill = isHighlighted ? '#1d4ed8' : '#334155';

      const tspans = labelLines
        .map((line, i) => {
          const ly = pillY + 15 + i * 14;
          return `<tspan x="${Math.round(item.routed.labelX)}" y="${ly}">${escapeXml(line)}</tspan>`;
        })
        .join('');

      labelSvgParts.push(
        `<g opacity="${opacity}">` +
          `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="6" fill="${pillFill}" fill-opacity="0.96" stroke="${pillStroke}" stroke-width="1" />` +
          `<text font-family="${FONT_FAMILY}" font-size="11" font-weight="600" fill="${textFill}" text-anchor="middle">${tspans}</text>` +
          `</g>`,
      );
    }
  }

  const nodeSvgParts: string[] = [];

  for (const node of options.nodes) {
    const nx = Math.round(node.position.x);
    const ny = Math.round(node.position.y);
    const nw = node.data.estimatedWidth;
    const nh = node.data.estimatedHeight;
    const kindStyle = KIND_COLOR_MAP[node.data.kind];

    const badges: PillBadge[] = [
      { text: kindStyle.label, bg: kindStyle.badgeBg, fg: '#ffffff' },
    ];

    if (__ENABLE_TECH_MODE__ && options.includeTechBadges) {
      if (node.data.audience === 'tech') {
        badges.push({ text: 'Kỹ thuật', bg: '#e2e8f0', fg: '#334155' });
      }
      const platforms = node.data.platforms;
      if (platforms?.length === 1) {
        if (platforms[0] === 'ios') {
          badges.push({ text: 'iOS', bg: '#1e293b', fg: '#ffffff' });
        } else {
          badges.push({ text: 'Android', bg: '#059669', fg: '#ffffff' });
        }
      } else if (options.platformMode === 'compare') {
        const detail = node.data.techDetail;
        const hasDiff = Boolean(
          detail?.platformDiffNote ||
            detail?.byPlatform?.android ||
            detail?.miniAppBridge?.messages.some((m) => m.hostFnByPlatform?.android || m.parityNote),
        );
        if (hasDiff) {
          badges.push({
            text: 'iOS ≠ Android',
            bg: '#fef3c7',
            fg: '#78350f',
            border: '#fcd34d',
          });
        }
      }
    }

    let badgeCursorX = nx + 12;
    const badgeY = ny + 10;
    const badgeParts: string[] = [];
    for (const badge of badges) {
      const bw = estimateBadgeWidth(badge.text);
      if (badgeCursorX + bw > nx + nw - 16) break;
      const borderAttr = badge.border ? ` stroke="${badge.border}" stroke-width="1"` : '';
      badgeParts.push(
        `<rect x="${badgeCursorX}" y="${badgeY}" width="${bw}" height="18" rx="4" fill="${badge.bg}"${borderAttr} />` +
          `<text x="${badgeCursorX + bw / 2}" y="${badgeY + 12.5}" font-family="${FONT_FAMILY}" font-size="10" font-weight="700" fill="${badge.fg}" text-anchor="middle">${escapeXml(badge.text)}</text>`,
      );
      badgeCursorX += bw + 5;
    }

    const titleLines = wrapText(node.data.label, 28, 3);
    const titleStartY = ny + 44;
    const titleTspans = titleLines
      .map((line, i) => {
        const y = titleStartY + i * 16;
        return `<tspan x="${nx + 12}" y="${y}">${escapeXml(line)}</tspan>`;
      })
      .join('');

    const childCount = options.childCounts?.[node.id] ?? 0;
    const isExpanded = options.expandedIds?.has(node.id) ?? false;
    let expandBadge = '';
    if (childCount > 0) {
      const pillText = isExpanded ? '−' : `+${childCount}`;
      const pillBg = isExpanded ? '#4f46e5' : '#ffffff';
      const pillFg = isExpanded ? '#ffffff' : '#4338ca';
      const pillBorder = isExpanded ? '#4f46e5' : '#a5b4fc';
      const exW = Math.max(24, pillText.length * 7 + 12);
      const exX = nx + nw - exW / 2 - 4;
      const exY = ny + nh / 2 - 11;
      expandBadge =
        `<rect x="${exX}" y="${exY}" width="${exW}" height="22" rx="11" fill="${pillBg}" stroke="${pillBorder}" stroke-width="1.2" />` +
        `<text x="${exX + exW / 2}" y="${exY + 14.5}" font-family="${FONT_FAMILY}" font-size="10.5" font-weight="700" fill="${pillFg}" text-anchor="middle">${escapeXml(pillText)}</text>`;
    }

    nodeSvgParts.push(
      `<g>` +
        `<rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" rx="12" fill="${kindStyle.fill}" stroke="${kindStyle.stroke}" stroke-width="1.5" />` +
        badgeParts.join('') +
        `<text font-family="${FONT_FAMILY}" font-size="12.5" font-weight="700" fill="#0f172a">${titleTspans}</text>` +
        expandBadge +
        `</g>`,
    );
  }

  const subtitleText = options.subtitle ? escapeXml(options.subtitle) : '';
  const countBadgeText = `${options.nodes.length} bước`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    `<defs>`,
    `<pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">`,
    `<circle cx="1.5" cy="1.5" r="1.2" fill="#cbd5e1" opacity="0.55" />`,
    `</pattern>`,
    `<marker id="arrow-default" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `<path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#94a3b8" />`,
    `</marker>`,
    `<marker id="arrow-active" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">`,
    `<path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#2563eb" />`,
    `</marker>`,
    `<marker id="arrow-dim" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `<path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#cbd5e1" opacity="0.5" />`,
    `</marker>`,
    `</defs>`,
    `<rect width="${svgW}" height="${svgH}" fill="#f8fafc" />`,
    `<rect width="${svgW}" height="${svgH}" fill="url(#dot-grid)" />`,
    `<rect x="0" y="0" width="${svgW}" height="60" fill="#ffffff" />`,
    `<line x1="0" y1="60" x2="${svgW}" y2="60" stroke="#e2e8f0" stroke-width="1" />`,
    `<rect x="18" y="15" width="30" height="30" rx="8" fill="#4f46e5" />`,
    `<text x="33" y="35" font-family="${FONT_FAMILY}" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">V</text>`,
    `<text x="58" y="29" font-family="${FONT_FAMILY}" font-size="14" font-weight="700" fill="#0f172a">${escapeXml(options.title)}</text>`,
    subtitleText
      ? `<text x="58" y="46" font-family="${FONT_FAMILY}" font-size="11" font-weight="500" fill="#64748b">${subtitleText}</text>`
      : '',
    `<rect x="${svgW - 86}" y="18" width="68" height="24" rx="12" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="1" />`,
    `<text x="${svgW - 52}" y="34" font-family="${FONT_FAMILY}" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">${escapeXml(countBadgeText)}</text>`,
    `<g transform="translate(${offsetX}, ${offsetY})">`,
    ...edgeSvgParts,
    ...nodeSvgParts,
    ...labelSvgParts,
    `</g>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function svgToPngBlob(svgString: string, scale = 2): Promise<Blob> {
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)"/);
  const heightMatch = svgString.match(/height="(\d+(?:\.\d+)?)"/);
  const w = widthMatch ? Number(widthMatch[1]) : 1200;
  const h = heightMatch ? Number(heightMatch[1]) : 800;

  const effectiveScale = Math.min(scale, 8192 / Math.max(w, h, 1));
  const targetW = Math.max(1, Math.round(w * effectiveScale));
  const targetH = Math.max(1, Math.round(h * effectiveScale));

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể render SVG thành ảnh PNG'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Trình duyệt không hỗ trợ Canvas 2D');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Không thể tạo file PNG từ Canvas'));
      }, 'image/png');
    });

    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function exportFlowToSvg(options: DiagramExportOptions, filenameBase: string): void {
  const svg = renderFlowDiagramSvg(options);
  downloadTextFile(`${slugifyFilename(filenameBase)}.svg`, svg, 'image/svg+xml;charset=utf-8');
}

export async function exportFlowToPng(
  options: DiagramExportOptions,
  filenameBase: string,
  scale = 2,
): Promise<void> {
  const svg = renderFlowDiagramSvg(options);
  const blob = await svgToPngBlob(svg, scale);
  downloadBlob(`${slugifyFilename(filenameBase)}.png`, blob);
}
