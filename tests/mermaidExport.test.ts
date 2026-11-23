// tests/mermaidExport.test.ts
import { describe, expect, it } from 'vitest';
import {
  escapeMermaidLabel,
  exportFlowToMermaid,
  exportScenarioSequenceToMermaid,
  exportScenarioTimelineToMermaid,
  sanitizeMermaidId,
} from '../src/core/mermaidExport';
import type { VisibleFlowResult } from '../src/core/graphEngine';
import type { ScenarioTimelineModel } from '../src/core/scenarioFlowEngine';
import type { ScenarioSequenceModel } from '../src/core/scenarioSequenceBuilder';

const sampleFlow: VisibleFlowResult = {
  nodes: [
    {
      id: 'mod-auth',
      label: 'Đăng nhập & "2FA"',
      techLabel: 'Auth OAuth + TwoFactorSessionManager',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Đăng nhập' },
    },
    {
      id: 'end',
      label: 'Kiểm tra OTP | Bước 2',
      techLabel: 'Verify OTP /token',
      kind: 'decision',
      audience: 'all',
      summary: { overview: 'Check OTP' },
    },
    {
      id: 'err-429',
      label: 'Khóa tạm thời',
      techLabel: 'HTTP 429 Lockout',
      kind: 'error',
      audience: 'all',
      summary: { overview: 'Lockout' },
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'mod-auth',
      target: 'end',
      label: 'Gửi | OTP',
      techLabel: 'POST /verify',
    },
    {
      id: 'e2',
      source: 'end',
      target: 'err-429',
      label: 'Sai nhiều lần',
    },
  ],
  nodeParentMap: { end: 'mod-auth', 'err-429': 'mod-auth' },
  activeScenarios: [],
};

describe('mermaidExport', () => {
  it('sanitizes reserved/numeric Mermaid IDs and escapes unsafe label characters', () => {
    expect(sanitizeMermaidId('end')).toBe('n_end');
    expect(sanitizeMermaidId('123-step')).toBe('n_123_step');
    expect(escapeMermaidLabel('Hello "World" | line1\nline2')).toBe("Hello 'World' / line1 line2");
  });

  it('exports overview Mermaid flowchart without leaking techLabel or tech terms', () => {
    const mmd = exportFlowToMermaid(sampleFlow, {
      direction: 'LR',
      mode: 'overview',
      activeEdgeIds: new Set(['e1']),
    });
    expect(mmd).toContain('flowchart LR');
    expect(mmd).toContain('mod_auth[["Đăng nhập & \'2FA\'"]]:::kind_module');
    expect(mmd).toContain('n_end{"Kiểm tra OTP / Bước 2"}:::kind_decision');
    expect(mmd).toContain('mod_auth ==>|"Gửi / OTP"| n_end');
    expect(mmd).toContain('n_end -->|"Sai nhiều lần"| err_429');
    expect(mmd).not.toContain('TwoFactorSessionManager');
    expect(mmd).not.toContain('POST /verify');
  });

  it('exports tech Mermaid flowchart using techLabel and TB direction', () => {
    const mmd = exportFlowToMermaid(sampleFlow, {
      direction: 'TB',
      mode: 'tech',
    });
    expect(mmd).toContain('flowchart TB');
    expect(mmd).toContain('Auth OAuth + TwoFactorSessionManager');
    expect(mmd).toContain('POST /verify');
  });

  it('exports scenario timeline activity flowchart and sequence diagram', () => {
    const timeline: ScenarioTimelineModel = {
      scenarioId: 'sc-1',
      title: 'Đăng nhập 2FA',
      mode: 'overview',
      stepEdgeIds: ['e1'],
      steps: [
        {
          index: 0,
          stepNumber: 1,
          node: sampleFlow.nodes[0],
          displayLabel: 'Nhập tài khoản',
          summaryText: 'Nhập SĐT',
          kind: 'action',
          activityRole: 'user',
          outgoingEdgeLabel: 'Hợp lệ',
          alternativeBranches: [
            {
              edgeId: 'e-alt',
              guardLabel: 'Sai mật khẩu',
              targetNodeId: 'err-429',
              targetLabel: 'Báo lỗi',
              targetKind: 'error',
            },
          ],
          hasPlatformDiff: false,
        },
        {
          index: 1,
          stepNumber: 2,
          node: sampleFlow.nodes[1],
          displayLabel: 'Nhập OTP',
          summaryText: '6 số',
          kind: 'decision',
          activityRole: 'user',
          alternativeBranches: [],
          hasPlatformDiff: false,
        },
      ],
    };

    const flowMmd = exportScenarioTimelineToMermaid(timeline);
    expect(flowMmd).toContain('flowchart TD');
    expect(flowMmd).toContain('sc_start(("Bắt đầu"))');
    expect(flowMmd).toContain('s_1_mod_auth["1. Nhập tài khoản"]');
    expect(flowMmd).toContain('s_2_n_end{"2. Nhập OTP"}');
    expect(flowMmd).toContain('s_1_mod_auth -.->|"Sai mật khẩu"| alt_err_429');
    expect(flowMmd).toContain('sc_end((("Kết thúc")))');

    const seqModel: ScenarioSequenceModel = {
      scenarioId: 'sc-1',
      title: 'Autodial Bridge',
      platformMode: 'compare',
      preferSequenceByDefault: true,
      actors: [
        { id: 'miniapp', label: 'Mini App', sublabel: 'JS', accent: '#000', bg: '#fff', border: '#ccc' },
        { id: 'host', label: 'Host App', sublabel: 'Native', accent: '#000', bg: '#fff', border: '#ccc' },
      ],
      messages: [
        {
          id: 'm1',
          stepIndex: 0,
          stepNumber: 1,
          nodeId: 'n1',
          from: 'miniapp',
          to: 'host',
          title: 'start_autodial',
          subtitle: 'Bắt đầu quay số',
          dashed: false,
          isSelfCall: false,
          kind: 'miniapp',
          parityNote: 'iOS prewarm 600s',
        },
      ],
    };

    const seqMmd = exportScenarioSequenceToMermaid(seqModel);
    expect(seqMmd).toContain('sequenceDiagram');
    expect(seqMmd).toContain('participant miniapp as Mini App');
    expect(seqMmd).toContain('miniapp->>host: 1. start_autodial — Bắt đầu quay số');
    expect(seqMmd).toContain('Note over miniapp,host: Parity - iOS prewarm 600s');
  });
});
