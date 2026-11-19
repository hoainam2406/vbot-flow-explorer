// tests/scenarioFlowEngine.test.ts
import { describe, expect, it } from 'vitest';
import { loadMergedDataset } from '../plugins/flowDataPlugin';
import { buildVisibleTreeFlow, sanitizeForPublic } from '../src/core/graphEngine';
import {
  buildScenarioTimeline,
  computeActivityDiagramLayout,
  renderScenarioActivitySvg,
  renderScenarioFlowchartSvg,
} from '../src/core/scenarioFlowEngine';
import {
  buildScenarioSequence,
  computeSequenceDiagramLayout,
  renderScenarioSequenceSvg,
} from '../src/core/scenarioSequenceBuilder';

describe('scenarioFlowEngine & scenarioSequenceBuilder', () => {
  const fullDataset = loadMergedDataset(process.cwd());
  const publicDataset = sanitizeForPublic(fullDataset);

  it('builds bridged public overview timeline without tech metadata for sc-call-in-happy & sc-auth-2fa-success', () => {
    const callFlow = buildVisibleTreeFlow(
      publicDataset,
      new Set(['mod-calling', 'call-incoming']),
      'overview',
    );
    const callScenario = callFlow.activeScenarios.find(
      (s) => s.id === 'sc-call-in-happy',
    );
    expect(callScenario).toBeDefined();

    const callTimeline = buildScenarioTimeline(callScenario!, callFlow, 'overview');
    expect(callTimeline.mode).toBe('overview');
    expect(callTimeline.steps.map((s) => s.node.id)).toEqual([
      'call-in-pushkit',
      'call-in-callkit',
      'call-in-answer',
    ]);
    expect(callTimeline.stepEdgeIds).toHaveLength(2);
    expect(callTimeline.steps.every((s) => s.hasPlatformDiff === false && !s.platformTag)).toBe(true);

    const authFlow = buildVisibleTreeFlow(
      publicDataset,
      new Set(['mod-auth', 'auth-login-2fa']),
      'overview',
    );
    const authScenario = authFlow.activeScenarios.find(
      (s) => s.id === 'sc-auth-2fa-success',
    );
    expect(authScenario).toBeDefined();
    const authTimeline = buildScenarioTimeline(authScenario!, authFlow, 'overview');
    expect(authTimeline.steps.map((s) => s.node.id)).toEqual([
      'auth-input',
      'auth-check-2fa',
      'auth-otp-screen',
      'auth-enter-home',
    ]);
    expect(authTimeline.steps[1].outgoingEdgeLabel).toBe('Có bật 2FA');
    expect(authTimeline.steps[0].activityRole).toBe('user');
    expect(authTimeline.steps[1].activityRole).toBe('app');
    expect(authTimeline.steps[1].alternativeBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guardLabel: 'Không bật 2FA',
          targetNodeId: 'auth-enter-home',
          targetStepIndex: 3,
        }),
      ]),
    );

    const svg = renderScenarioFlowchartSvg(authTimeline);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Đăng nhập tài khoản có bật 2FA thành công');
    expect(svg).toContain('Bắt đầu');
    expect(svg).toContain('Kết thúc');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('Người dùng');
    expect(svg).toContain('Ứng dụng VBot');
    expect(svg).toContain('Có bật 2FA');
    expect(svg).toContain('Không bật 2FA');
    expect(svg).not.toContain('TwoFactorSessionManager');
    expect(svg).not.toContain('PushKit');
  });

  it('builds full tech timeline for sc-mauc-import and sc-maad-run', () => {
    const contactFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-contacts', 'ma-user-contact']),
      'tech',
      null,
      'compare',
    );
    const importScenario = contactFlow.activeScenarios.find(
      (s) => s.id === 'sc-mauc-import',
    );
    expect(importScenario).toBeDefined();
    const importTimeline = buildScenarioTimeline(importScenario!, contactFlow, 'tech');
    expect(importTimeline.steps).toHaveLength(4);
    expect(importTimeline.steps[0].displayLabel).toContain('loadMiniApp / MiniAppFragment');
    expect(importTimeline.steps[0].summaryText).toContain('MiniAppFragment');
    expect(importTimeline.steps[2].hasPlatformDiff).toBe(true);

    const autoFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-autodial', 'ma-autodial']),
      'tech',
      null,
      'compare',
    );
    const autoScenario = autoFlow.activeScenarios.find((s) => s.id === 'sc-maad-run');
    expect(autoScenario).toBeDefined();
    const autoTimeline = buildScenarioTimeline(autoScenario!, autoFlow, 'tech');
    expect(autoTimeline.steps.map((s) => s.node.id)).toEqual([
      'maad-start',
      'maad-control',
      'maad-finish',
    ]);
  });

  it('derives accurate Sequence Diagram actors, directions, and SVG across Mini App and Android scenarios', () => {
    // 1. sc-mauc-delete: Mini App -> Server -> Host -> Host -> Mini App (host_to_miniapp dashed)
    const contactFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-contacts', 'ma-user-contact']),
      'tech',
      null,
      'android',
    );
    const deleteSc = contactFlow.activeScenarios.find((s) => s.id === 'sc-mauc-delete')!;
    const deleteTimeline = buildScenarioTimeline(deleteSc, contactFlow, 'tech');
    const deleteSeq = buildScenarioSequence(deleteTimeline, 'android');

    expect(deleteSeq.preferSequenceByDefault).toBe(true);
    expect(deleteSeq.actors.map((a) => a.id)).toEqual(['host', 'miniapp', 'server']);
    expect(deleteSeq.messages[0]).toMatchObject({
      from: 'miniapp',
      to: 'server',
      dashed: false,
    });
    expect(deleteSeq.messages[1]).toMatchObject({
      from: 'miniapp',
      to: 'host',
      dashed: false,
    });
    expect(deleteSeq.messages[2]).toMatchObject({
      from: 'host',
      to: 'miniapp',
      dashed: true,
    });

    // 2. sc-call-in-android-lockscreen: Server push -> Host -> User -> Server
    const callingFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-calling', 'call-incoming']),
      'tech',
      null,
      'android',
    );
    const androidInSc = callingFlow.activeScenarios.find(
      (s) => s.id === 'sc-call-in-android-lockscreen',
    )!;
    const androidInTimeline = buildScenarioTimeline(androidInSc, callingFlow, 'tech');
    const androidInSeq = buildScenarioSequence(androidInTimeline, 'android');

    expect(androidInSeq.actors.some((a) => a.id === 'miniapp')).toBe(false);
    expect(androidInSeq.actors.map((a) => a.id)).toEqual(['user', 'host', 'server']);
    expect(androidInSeq.messages[0]).toMatchObject({
      from: 'server',
      to: 'host',
      dashed: true,
    });
    expect(androidInSeq.messages[3]).toMatchObject({
      from: 'host',
      to: 'server',
      dashed: false,
    });

    // 3. sc-maad-run + SVG rendering
    const autoFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-autodial', 'ma-autodial']),
      'tech',
      null,
      'ios',
    );
    const autoSc = autoFlow.activeScenarios.find((s) => s.id === 'sc-maad-run')!;
    const autoSeq = buildScenarioSequence(
      buildScenarioTimeline(autoSc, autoFlow, 'tech'),
      'ios',
    );
    expect(autoSeq.preferSequenceByDefault).toBe(true);
    expect(autoSeq.messages[2]).toMatchObject({
      from: 'host',
      to: 'miniapp',
      dashed: true,
    });

    const seqSvg = renderScenarioSequenceSvg(deleteSeq, 1);
    expect(seqSvg.startsWith('<svg')).toBe(true);
    expect(seqSvg).toContain('Host App (Android)');
    expect(seqSvg).toContain('user_contact_delete_local');
    expect(seqSvg).toContain('user_contacts_updated');

    // 4. Kiểm tra self-call pills trên kịch bản gọi đến luôn nằm gọn trong biên [0, layout.width]
    const compareCallingFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-calling', 'call-incoming']),
      'tech',
      null,
      'compare',
    );
    const happySc = compareCallingFlow.activeScenarios.find(
      (s) => s.id === 'sc-call-in-happy',
    )!;
    const happySeq = buildScenarioSequence(
      buildScenarioTimeline(happySc, compareCallingFlow, 'tech'),
      'compare',
    );
    const happyLayout = computeSequenceDiagramLayout(happySeq);
    const selfCallRows = happyLayout.rows.filter((r) => Boolean(r.selfCall));
    expect(selfCallRows.length).toBeGreaterThan(0);
    for (const row of selfCallRows) {
      expect(row.selfCall!.boxX).toBeGreaterThanOrEqual(0);
      expect(row.selfCall!.boxX + row.selfCall!.boxWidth).toBeLessThanOrEqual(
        happyLayout.width,
      );
    }
  });

  it('derives UML Activity roles and alternative scenario links across calling and auth scenarios', () => {
    const authTechFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-auth', 'auth-login-2fa']),
      'tech',
      null,
      'compare',
    );
    const authSuccess = authTechFlow.activeScenarios.find(
      (s) => s.id === 'sc-auth-2fa-success',
    )!;
    const authTimeline = buildScenarioTimeline(authSuccess, authTechFlow, 'tech');
    expect(authTimeline.steps.map((s) => s.activityRole)).toEqual([
      'user',     // auth-input (action)
      'system',   // auth-token-api (external)
      'app',      // auth-check-2fa (decision)
      'app',      // auth-ram-challenge (process)
      'user',     // auth-otp-screen (action)
      'system',   // auth-verify-otp (external)
      'app',      // auth-post-init (process)
      'user',     // auth-enter-home (action)
    ]);

    const postInitStep = authTimeline.steps.find(
      (s) => s.node.id === 'auth-post-init',
    )!;
    expect(postInitStep.alternativeBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetNodeId: 'auth-rollback',
          targetScenarioId: 'sc-auth-rollback',
        }),
      ]),
    );

    const authRollbackSc = authTechFlow.activeScenarios.find(
      (s) => s.id === 'sc-auth-rollback',
    )!;
    const rollbackTimeline = buildScenarioTimeline(authRollbackSc, authTechFlow, 'tech');
    expect(
      rollbackTimeline.steps[rollbackTimeline.steps.length - 1].alternativeBranches,
    ).toEqual([]);

    const transferFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-calling', 'call-transfer']),
      'tech',
      null,
      'compare',
    );
    const attendedSc = transferFlow.activeScenarios.find(
      (s) => s.id === 'sc-transfer-attended',
    )!;
    const attendedTimeline = buildScenarioTimeline(attendedSc, transferFlow, 'tech');
    const destStep = attendedTimeline.steps.find((s) => s.node.id === 'call-tr-dest')!;
    expect(destStep.alternativeBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guardLabel: 'Chuyển ngay (Blind - DTMF #1)',
          targetScenarioId: 'sc-transfer-blind-dtmf',
        }),
      ]),
    );

    const callingFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-calling', 'call-incoming']),
      'tech',
      null,
      'compare',
    );
    const happySc = callingFlow.activeScenarios.find(
      (s) => s.id === 'sc-call-in-happy',
    )!;
    const happyTimeline = buildScenarioTimeline(happySc, callingFlow, 'tech');
    const retryStep = happyTimeline.steps.find((s) => s.node.id === 'call-in-crm-retry')!;
    expect(retryStep.alternativeBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetNodeId: 'call-in-crm-error',
          targetScenarioId: 'sc-call-in-bg-retry',
        }),
      ]),
    );

    const contactFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-contacts', 'ma-user-contact']),
      'tech',
      null,
      'compare',
    );
    const maucSc = contactFlow.activeScenarios.find((s) => s.id === 'sc-mauc-import')!;
    const maucTimeline = buildScenarioTimeline(maucSc, contactFlow, 'tech');
    expect(maucTimeline.steps[3].node.id).toBe('mauc-render-list');
    expect(maucTimeline.steps[3].activityRole).toBe('miniapp');
  });

  it('computes UML Swimlane Activity layout & renders Activity SVG cleanly for both Public and Tech views', () => {
    // 1. Tech view: sc-call-in-happy
    const callingFlow = buildVisibleTreeFlow(
      fullDataset,
      new Set(['mod-calling', 'call-incoming']),
      'tech',
      null,
      'compare',
    );
    const happySc = callingFlow.activeScenarios.find((s) => s.id === 'sc-call-in-happy')!;
    const happyTimeline = buildScenarioTimeline(happySc, callingFlow, 'tech');
    const happyLayout = computeActivityDiagramLayout(happyTimeline);

    expect(happyLayout.lanes.map((l) => l.role)).toEqual(['user', 'app', 'system']);
    expect(happyLayout.hasAltRail).toBe(true);
    expect(happyLayout.connectors).toHaveLength(happyTimeline.steps.length - 1);

    const decisionItem = happyLayout.nodes.find(
      (n) => n.step.node.id === 'call-in-crm-retry',
    )!;
    expect(decisionItem.isDecision).toBe(true);
    expect(decisionItem.diamondPoints).toBeTruthy();

    for (const item of happyLayout.nodes) {
      expect(item.x).toBeGreaterThanOrEqual(happyLayout.swimlanesX);
      expect(item.x + item.width).toBeLessThanOrEqual(
        happyLayout.swimlanesX + happyLayout.swimlanesWidth,
      );
      expect(item.y).toBeGreaterThanOrEqual(happyLayout.swimlaneTopY);
      expect(item.y + item.height).toBeLessThanOrEqual(happyLayout.swimlaneBottomY);
      for (const alt of item.altItems) {
        expect(alt.boxX).toBeGreaterThanOrEqual(happyLayout.altRailX);
        expect(alt.boxX + alt.boxWidth).toBeLessThanOrEqual(happyLayout.width);
        expect(alt.boxY).toBeGreaterThanOrEqual(happyLayout.swimlaneTopY);
        expect(alt.boxY + alt.boxHeight).toBeLessThanOrEqual(happyLayout.swimlaneBottomY);
      }
    }

    // 2. Public view: sc-auth-2fa-success SVG render
    const authFlow = buildVisibleTreeFlow(
      publicDataset,
      new Set(['mod-auth', 'auth-login-2fa']),
      'overview',
    );
    const authSc = authFlow.activeScenarios.find((s) => s.id === 'sc-auth-2fa-success')!;
    const authTimeline = buildScenarioTimeline(authSc, authFlow, 'overview');
    const actSvg = renderScenarioActivitySvg(authTimeline, 1);

    expect(actSvg.startsWith('<svg')).toBe(true);
    expect(actSvg).toContain('Bắt đầu');
    expect(actSvg).toContain('Kết thúc');
    expect(actSvg).toContain('<polygon');
    expect(actSvg).toContain('Người dùng');
    expect(actSvg).toContain('Ứng dụng VBot');
    expect(actSvg).toContain('Không bật 2FA');
    expect(actSvg).not.toContain('TwoFactorSessionManager');
    expect(actSvg).not.toContain('PushKit');
  });
});
