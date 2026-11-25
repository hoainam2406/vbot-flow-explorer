// tests/auditSync.test.ts
import { describe, expect, it } from 'vitest';
import {
  listAvailableBranches,
  loadMergedDataset,
  loadMergedDatasetForBranch,
} from '../plugins/flowDataPlugin';
import {
  auditCodeRefs,
  auditMediaCoverage,
  auditMiniAppConsistency,
  classifyCodeRefPlatform,
  diffMiniAppApiSnapshot,
  PUBLIC_LEAK_FORBIDDEN_TOKENS,
  scanTextForPublicLeaks,
} from '../src/core/auditSyncEngine';
import { findNodeById } from '../src/core/graphEngine';
import { ALL_SANDBOX_COMMANDS } from '../src/core/miniAppContractBuilder';
import { CORE_BRIDGE_SPECS, MINI_APP_CATALOG } from '../src/data/miniAppBridgeCatalog';
import { MINI_APP_PERMISSION_PROFILES } from '../src/data/miniAppPermissionMatrix';

describe('auditSyncEngine', () => {
  const dataset = loadMergedDataset(process.cwd());

  it('passes Mini App consistency check across real dataset, catalog, and permission profiles', () => {
    const report = auditMiniAppConsistency(
      dataset,
      MINI_APP_CATALOG,
      MINI_APP_PERMISSION_PROFILES,
      ALL_SANDBOX_COMMANDS,
      CORE_BRIDGE_SPECS,
    );
    expect(report.errors).toEqual([]);
    expect(report.stats.catalogCount).toBe(MINI_APP_CATALOG.length);
    expect(report.stats.datasetMiniAppRefs).toBeGreaterThan(0);
  });

  it('reports media coverage accurately against existing paths', () => {
    const report = auditMediaCoverage(dataset, ['/media/app/vbot-home.webp']);
    expect(report.total).toBeGreaterThan(1);
    expect(report.present).toBe(1);
    expect(report.missing).toBe(report.total - 1);
    expect(report.items.find((i) => i.src === '/media/app/vbot-home.webp')?.exists).toBe(true);
  });

  it('classifies codeRefs by platform and checks file existence against mock repos', () => {
    expect(classifyCodeRefPlatform('VBot/Service/MiniAppService.swift')).toBe('ios');
    expect(
      classifyCodeRefPlatform('VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/main/MainActivity.kt'),
    ).toBe('android');
    expect(
      classifyCodeRefPlatform('vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMaSDK.kt'),
    ).toBe('android');

    const auditNoDirs = auditCodeRefs(dataset, { fileExists: () => false });
    expect(auditNoDirs.checkedIos).toBe(false);
    expect(auditNoDirs.checkedAndroid).toBe(false);
    expect(auditNoDirs.warnings).toHaveLength(2);

    const auditWithMock = auditCodeRefs(dataset, {
      iosDir: '/repos/VBot-iOS',
      androidDir: '/repos/VBot-Android',
      fileExists: (abs) => abs.endsWith('MiniAppService.swift') || abs.includes('/app/src/main/java/'),
    });
    expect(auditWithMock.checkedIos).toBe(true);
    expect(auditWithMock.checkedAndroid).toBe(true);
    expect(auditWithMock.missingIos.some((m) => m.ref.endsWith('MiniAppService.swift'))).toBe(false);
    expect(auditWithMock.missingIos.length).toBeGreaterThan(0);
  });

  it('diffs Mini App production API snapshot against MINI_APP_CATALOG', () => {
    const sample = {
      data: [
        { id: 'vb-ma-autodial', name: 'Autodial', category: 'Calling' },
        { id: 'vb-ma-brand-new', name: 'New AI Bot', category: 'AI' },
      ],
    };
    const diff = diffMiniAppApiSnapshot(sample, MINI_APP_CATALOG);
    expect(diff.matchedCount).toBe(1);
    expect(diff.added).toEqual([{ id: 'vb-ma-brand-new', name: 'New AI Bot', category: 'AI' }]);
    expect(diff.removed.length).toBe(MINI_APP_CATALOG.length - 1);
  });

  it('detects forbidden internal tokens for public bundle guard', () => {
    expect(PUBLIC_LEAK_FORBIDDEN_TOKENS).toContain('repoConfig');
    expect(PUBLIC_LEAK_FORBIDDEN_TOKENS).toContain('workTaskUrl');
    expect(PUBLIC_LEAK_FORBIDDEN_TOKENS).toContain('Nam-dev-SBSI');
    expect(scanTextForPublicLeaks('clean overview bundle text')).toEqual([]);
    expect(scanTextForPublicLeaks('contains TwoFactorSessionManager and codeRefs')).toEqual([
      'codeRefs',
      'TwoFactorSessionManager',
    ].sort((a, b) =>
      PUBLIC_LEAK_FORBIDDEN_TOKENS.indexOf(a) - PUBLIC_LEAK_FORBIDDEN_TOKENS.indexOf(b),
    ));
  });

  it('loads and validates Nam-dev-SBSI branch with Call Survey #3 and Project User State updates', () => {
    const branches = listAvailableBranches(process.cwd());
    expect(branches.map((b) => b.id)).toEqual(['Nam-dev', 'Nam-dev-SBSI']);

    const sbsiDataset = loadMergedDatasetForBranch(process.cwd(), 'Nam-dev-SBSI');
    expect(sbsiDataset.app.techBranch).toBe('Nam-dev-SBSI');

    const sbsiMiniAppReport = auditMiniAppConsistency(
      sbsiDataset,
      MINI_APP_CATALOG,
      MINI_APP_PERMISSION_PROFILES,
      ALL_SANDBOX_COMMANDS,
      CORE_BRIDGE_SPECS,
    );
    expect(sbsiMiniAppReport.errors).toEqual([]);

    const surveyNode = findNodeById(sbsiDataset, 'call-ctrl-survey');
    expect(surveyNode?.audience).toBe('all');
    expect(findNodeById(sbsiDataset, 'as-manage-reason-templates')).toBeDefined();
    expect(findNodeById(sbsiDataset, 'as-auto-resume-reconnect')).toBeDefined();
  });
});
