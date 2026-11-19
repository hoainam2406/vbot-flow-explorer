// tests/diagramExport.test.ts
import { describe, expect, it } from 'vitest';
import { computeDagreGraphLayout } from '../src/composables/useGraphLayout';
import { renderFlowDiagramSvg } from '../src/core/diagramExport';
import type { FlowEdgeData, FlowNodeData } from '../src/data/schema';

const nodes: FlowNodeData[] = [
  {
    id: 'n-root',
    label: 'Gọi đến & Xác thực <2FA>',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Gốc' },
    techDetail: {
      platformDiffNote: 'iOS PushKit vs Android FCM',
      byPlatform: {
        android: { summary: 'Android FCM' },
      },
    },
  },
  {
    id: 'n-ios',
    label: 'PushKit "VoIP" & CallKit',
    kind: 'process',
    audience: 'tech',
    platforms: ['ios'],
    summary: { overview: 'iOS only' },
  },
  {
    id: 'n-and',
    label: 'CallService & FSI',
    kind: 'external',
    audience: 'tech',
    platforms: ['android'],
    summary: { overview: 'Android only' },
  },
];

const edges: FlowEdgeData[] = [
  { id: 'e1', source: 'n-root', target: 'n-ios', label: 'APNs & VoIP' },
  { id: 'e2', source: 'n-root', target: 'n-and', label: 'FCM type=3' },
];

describe('diagramExport', () => {
  it('renders valid escaped SVG without tech/platform badges when includeTechBadges is false', () => {
    const layout = computeDagreGraphLayout(nodes, edges, { direction: 'LR' });
    const svg = renderFlowDiagramSvg({
      nodes: layout.nodes,
      edges,
      edgeRoutes: layout.edgeRoutes,
      title: 'VBot Flow <Public & Clean>',
      subtitle: 'Tổng quan luồng',
      includeTechBadges: false,
      childCounts: { 'n-root': 2 },
      expandedIds: new Set(['n-root']),
    });

    expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('VBot Flow &lt;Public &amp; Clean&gt;');
    expect(svg).toContain('Gọi đến &amp; Xác thực &lt;2FA&gt;');
    expect(svg).toContain('PushKit &quot;VoIP&quot; &amp; CallKit');
    expect(svg).toContain('APNs &amp; VoIP');
    expect(svg).toContain('<path d="M ');
    expect(svg).toContain('3 bước');

    expect(svg).not.toContain('Kỹ thuật');
    expect(svg).not.toContain('iOS ≠ Android');
    expect(svg).not.toContain('>iOS<');
    expect(svg).not.toContain('>Android<');
  });

  it('includes Kỹ thuật and platform badges in compare mode when includeTechBadges is true', () => {
    const layout = computeDagreGraphLayout(nodes, edges, { direction: 'LR' });
    const svg = renderFlowDiagramSvg({
      nodes: layout.nodes,
      edges,
      edgeRoutes: layout.edgeRoutes,
      title: 'VBot Tech Compare',
      includeTechBadges: true,
      platformMode: 'compare',
      activeEdgeIds: new Set(['e2']),
      dimInactive: true,
    });

    expect(svg).toContain('>Kỹ thuật<');
    expect(svg).toContain('>iOS<');
    expect(svg).toContain('>Android<');
    expect(svg).toContain('>iOS ≠ Android<');
    expect(svg).toContain('stroke="#2563eb"');
  });
});
