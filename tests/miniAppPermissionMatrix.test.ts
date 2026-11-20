// tests/miniAppPermissionMatrix.test.ts
import { describe, expect, it } from 'vitest';
import { MINI_APP_CATALOG } from '../src/data/miniAppBridgeCatalog';
import {
  buildManifestPermissionsJson,
  buildModuleManifestSnippet,
  buildModuleSdkSnippet,
  buildSdkCheckPermissionsSnippet,
  createRoleStateFromPreset,
  evaluateActionGrant,
  evaluateAppVisibility,
  evaluateProfileActions,
  exportMiniAppPermissionsMarkdown,
  MINI_APP_PERMISSION_PROFILES,
  PERMISSION_MODULES,
} from '../src/data/miniAppPermissionMatrix';

describe('miniAppPermissionMatrix', () => {
  it('maps every single Mini App in the 41-app catalog without orphan keys', () => {
    const catalogIds = MINI_APP_CATALOG.map((app) => app.id).sort();
    const profileKeys = Object.keys(MINI_APP_PERMISSION_PROFILES).sort();
    expect(profileKeys).toEqual(catalogIds);
    expect(profileKeys).toHaveLength(41);
  });

  it('defines all 9 standard permission modules with valid manifest and SDK snippets', () => {
    expect(PERMISSION_MODULES).toHaveLength(9);
    const expectedCodes = [
      'KHACH_HANG',
      'CUOC_GOI',
      'THANH_VIEN',
      'HOTLINE',
      'CAU_HINH_TONG_DAI',
      'CHIEN_DICH',
      'BAO_CAO',
      'CHIEN_DICH_SMS',
      'HIEN_CUOC',
    ];
    expect(PERMISSION_MODULES.map((m) => m.code)).toEqual(expectedCodes);

    for (const mod of PERMISSION_MODULES) {
      expect(mod.actions.length).toBeGreaterThanOrEqual(1);
      const manifestSnippet = JSON.parse(buildModuleManifestSnippet(mod)) as {
        capabilities?: { permissions?: Record<string, string[]> };
      };
      expect(manifestSnippet.capabilities?.permissions?.[mod.code]).toBeDefined();
      const sdkSnippet = buildModuleSdkSnippet(mod);
      expect(sdkSnippet).toContain('checkPermissions');
      expect(sdkSnippet).toContain(`'${mod.code}'`);
    }
  });

  it('evaluates Tier 1 host visibility accurately across role presets and platform parity diffs', () => {
    const adminRole = createRoleStateFromPreset('admin');
    const minimalMember = createRoleStateFromPreset('member_minimal');
    const supervisorMember = createRoleStateFromPreset('member_supervisor');
    const salesMember = createRoleStateFromPreset('member_sales');

    // Admin sees all 7 adminOnlyApps
    for (const app of MINI_APP_CATALOG.filter((a) => a.accessLevel === 'admin_only')) {
      const vis = evaluateAppVisibility(app.id, adminRole);
      expect(vis.iosVisible).toBe(true);
      expect(vis.androidVisible).toBe(true);
    }

    // Hidden / fixed tab apps remain hidden from Features Hub
    expect(evaluateAppVisibility('vb-ma-user-contact', adminRole).iosVisible).toBe(false);
    expect(evaluateAppVisibility('vb-ma-2fa-setting', adminRole).androidVisible).toBe(false);

    // Minimal member: admin apps hidden; autodial, ticket, CRM, history & contact-forward remain visible without parity diff
    for (const app of MINI_APP_CATALOG.filter((a) => a.accessLevel === 'admin_only')) {
      const vis = evaluateAppVisibility(app.id, minimalMember);
      expect(vis.iosVisible).toBe(false);
      expect(vis.androidVisible).toBe(false);
    }
    const crmVis = evaluateAppVisibility('vb-ma-crm', minimalMember);
    expect(crmVis.iosVisible).toBe(true);
    expect(crmVis.androidVisible).toBe(true);
    expect(crmVis.hasRuntimeParityDiff).toBe(false);
    expect(crmVis.hasStaticParityDiff).toBe(false);

    const historyVis = evaluateAppVisibility('vb-ma-user-history-call', minimalMember);
    expect(historyVis.iosVisible).toBe(true);
    expect(historyVis.androidVisible).toBe(true);
    expect(historyVis.hasRuntimeParityDiff).toBe(false);

    const contactForwardVis = evaluateAppVisibility('vb-ma-contact-forward', minimalMember);
    expect(contactForwardVis.iosVisible).toBe(true);
    expect(contactForwardVis.androidVisible).toBe(true);
    expect(contactForwardVis.hasRuntimeParityDiff).toBe(false);
    expect(contactForwardVis.hasStaticParityDiff).toBe(false);
    for (const appId of ['vb-ma-autodial', 'vb-ma-ticket']) {
      const vis = evaluateAppVisibility(appId, minimalMember);
      expect(vis.iosVisible).toBe(true);
      expect(vis.androidVisible).toBe(true);
    }
    expect(evaluateAppVisibility('vb-ma-monitoring', minimalMember).iosVisible).toBe(false);
    expect(evaluateAppVisibility('vb-ma-monitoring', minimalMember).androidVisible).toBe(false);
    expect(evaluateAppVisibility('vb-ma-monitoring', salesMember).androidVisible).toBe(false);

    // Supervisor has CUOC_GOI-DANG_DIEN_RA so monitoring becomes visible on both platforms
    const supMonitoring = evaluateAppVisibility('vb-ma-monitoring', supervisorMember);
    expect(supMonitoring.iosVisible).toBe(true);
    expect(supMonitoring.androidVisible).toBe(true);
  });

  it('evaluates Tier 2 manifest ∩ user action permissions including wildcard and HIEN_SO_DIEN_THOAI', () => {
    const adminRole = createRoleStateFromPreset('admin');
    const minimalMember = createRoleStateFromPreset('member_minimal');
    const salesMember = createRoleStateFromPreset('member_sales');
    const supervisorMember = createRoleStateFromPreset('member_supervisor');

    const contactForwardProfile = MINI_APP_PERMISSION_PROFILES['vb-ma-contact-forward'];
    expect(evaluateActionGrant(contactForwardProfile, 'KHACH_HANG', 'XEM', salesMember).finalGranted).toBe(true);
    expect(evaluateActionGrant(contactForwardProfile, 'KHACH_HANG', 'TAO', salesMember).finalGranted).toBe(true);
    expect(evaluateActionGrant(contactForwardProfile, 'KHACH_HANG', 'CHINH_SUA', salesMember).finalGranted).toBe(true);
    expect(evaluateActionGrant(contactForwardProfile, 'KHACH_HANG', 'XOA', salesMember).finalGranted).toBe(false);
    const undeclared = evaluateActionGrant(contactForwardProfile, 'THANH_VIEN', 'THEM_TIEN', adminRole);
    expect(undeclared.manifestGranted).toBe(false);
    expect(undeclared.finalGranted).toBe(false);

    // Wildcard CUOC_GOI: [] in vb-ma-user-contact
    const userContactProfile = MINI_APP_PERMISSION_PROFILES['vb-ma-user-contact'];
    const wildcardGrant = evaluateActionGrant(userContactProfile, 'CUOC_GOI', 'MAKE_CALL', salesMember);
    expect(wildcardGrant.wildcard).toBe(true);
    expect(wildcardGrant.manifestGranted).toBe(true);
    expect(evaluateProfileActions(userContactProfile, salesMember)[0]?.action).toBe('*');

    // HIEN_SO_DIEN_THOAI follows canViewCustomerPhone / Admin
    const crmProfile = MINI_APP_PERMISSION_PROFILES['vb-ma-crm'];
    expect(evaluateActionGrant(crmProfile, 'KHACH_HANG', 'HIEN_SO_DIEN_THOAI', salesMember).finalGranted).toBe(false);
    expect(evaluateActionGrant(crmProfile, 'KHACH_HANG', 'HIEN_SO_DIEN_THOAI', supervisorMember).finalGranted).toBe(true);
    expect(evaluateActionGrant(crmProfile, 'KHACH_HANG', 'HIEN_SO_DIEN_THOAI', adminRole).finalGranted).toBe(true);

    // Newly synced Production apps
    const blacklistVis = evaluateAppVisibility('vb-ma-blacklist', minimalMember);
    expect(blacklistVis.iosVisible).toBe(true);
    expect(blacklistVis.androidVisible).toBe(true);
    expect(blacklistVis.hasRuntimeParityDiff).toBe(false);

    const groupMemberProfile = MINI_APP_PERMISSION_PROFILES['vb-ma-group-member'];
    expect(evaluateActionGrant(groupMemberProfile, 'THANH_VIEN', 'XEM', minimalMember).finalGranted).toBe(false);
    expect(evaluateActionGrant(groupMemberProfile, 'THANH_VIEN', 'XEM', adminRole).finalGranted).toBe(true);
  });

  it('builds parseable manifest JSON, SDK snippets, and complete permission Markdown export', () => {
    const parsed = JSON.parse(buildManifestPermissionsJson('vb-ma-contact-forward')) as {
      capabilities: { permissions: Record<string, string[]> };
    };
    expect(parsed.capabilities.permissions.KHACH_HANG).toEqual(['XEM', 'TAO', 'CHINH_SUA', 'XOA']);
    expect(parsed.capabilities.permissions.CUOC_GOI).toEqual(['DANG_DIEN_RA', 'LICH_SU']);

    const sdkSnippet = buildSdkCheckPermissionsSnippet('vb-ma-crm');
    expect(sdkSnippet).toContain('isAdmin');
    expect(sdkSnippet).toContain("checkPermissions('KHACH_HANG'");

    const md = exportMiniAppPermissionsMarkdown();
    for (const app of MINI_APP_CATALOG) {
      expect(md).toContain(app.id);
    }
    for (const mod of PERMISSION_MODULES) {
      expect(md).toContain(mod.code);
    }
  });
});
