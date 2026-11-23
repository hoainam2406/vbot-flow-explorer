// tests/aiContextExport.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildMiniAppAiContextPrompt,
  buildNodeAiContextPrompt,
  buildParityItemAiContextPrompt,
} from '../src/core/aiContextExport';
import { buildMiniAppContract } from '../src/core/miniAppContractBuilder';
import { extractParityReport } from '../src/core/parityAnalyzer';
import { createDefaultDevSettings } from '../src/core/workspaceSettings';
import type { MergedFlowDataset } from '../src/data/schema';

const TEST_DATASET: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test', techBranch: 'Nam-dev' },
  rootNode: {
    id: 'vbot-app',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'App root' },
  },
  branches: [
    {
      id: 'mod-calling',
      label: 'Gọi thoại',
      techLabel: 'Calling Engine',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Gọi qua SIP', tech: 'PJSIP + CallKit' },
      techDetail: {
        platformDiffNote: 'iOS dùng CallKit, Android dùng CallStyle',
        codeRefs: ['VBot/Service/VPMAppService.swift'],
        byPlatform: {
          ios: { summary: 'iOS PJSIP', codeRefs: ['VBot/Service/VPMAppService.swift'] },
          android: {
            summary: 'Android PJSIP',
            codeRefs: ['VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt'],
          },
        },
        apisOrEvents: ['POST /api/call'],
        edgeCases: ['Mất mạng giữa cuộc gọi'],
        parityAssessment: {
          verdict: 'logic_diff',
          sameLogic: false,
          sameOutcome: false,
          needsFix: 'consider',
          fixTarget: 'android',
          explanation: 'Android thiếu event đồng bộ',
          recommendation: 'Bổ sung event đồng bộ trên Android',
        },
      },
      relatedNodeIds: ['vbot-app'],
    },
  ],
  branchEdges: [{ id: 'e1', source: 'vbot-app', target: 'mod-calling' }],
  subtreesByParentId: {},
};

describe('aiContextExport', () => {
  it('builds structured Node AI prompt with local repo paths when configured', () => {
    const settings = {
      ...createDefaultDevSettings(),
      localIosRepoPath: '/Users/dev/VBot-iOS',
      localAndroidRepoPath: '/Users/dev/VBot-Android',
    };
    const prompt = buildNodeAiContextPrompt(
      TEST_DATASET.branches[0],
      TEST_DATASET,
      'compare',
      settings,
    );

    expect(prompt).toContain('Calling Engine');
    expect(prompt).toContain('/Users/dev/VBot-iOS/VBot/Service/VPMAppService.swift');
    expect(prompt).toContain(
      '/Users/dev/VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt',
    );
    expect(prompt).toContain('Mất mạng giữa cuộc gọi');
    expect(prompt).toContain('POST /api/call');
  });

  it('builds ParityItem AI prompt without local paths when settings omitted', () => {
    const report = extractParityReport(TEST_DATASET);
    expect(report.items.length).toBeGreaterThan(0);
    const prompt = buildParityItemAiContextPrompt(report.items[0], TEST_DATASET);
    expect(prompt).toContain('fixTarget');
    expect(prompt).toContain('Android thiếu event đồng bộ');
    expect(prompt).toContain('VBot/Service/VPMAppService.swift');
  });

  it('builds MiniApp AI prompt from contract', () => {
    const contract = buildMiniAppContract('vb-ma-autodial');
    const prompt = buildMiniAppAiContextPrompt(contract);
    expect(prompt).toContain('vb-ma-autodial');
    expect(prompt).toContain('start_autodial');
    expect(prompt).toContain('autodial_finished');
  });
});
