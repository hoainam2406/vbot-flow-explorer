// tests/impactAnalyzer.test.ts
import { describe, expect, it } from 'vitest';
import { loadMergedDataset } from '../plugins/flowDataPlugin';
import { buildImpactIndex, queryImpact } from '../src/core/impactAnalyzer';
import { CORE_BRIDGE_SPECS, MINI_APP_CATALOG } from '../src/data/miniAppBridgeCatalog';
import { MINI_APP_PERMISSION_PROFILES } from '../src/data/miniAppPermissionMatrix';

describe('impactAnalyzer', () => {
  const dataset = loadMergedDataset(process.cwd());
  const index = buildImpactIndex(
    dataset,
    MINI_APP_CATALOG,
    CORE_BRIDGE_SPECS,
    MINI_APP_PERMISSION_PROFILES,
  );

  it('indexes bridge methods, codeRefs, and Mini Apps across dataset and finds downstream scenarios', () => {
    const makeCallImpact = queryImpact(index, 'make_call', 'bridge_method');
    expect(makeCallImpact.nodes.length).toBeGreaterThan(0);
    expect(makeCallImpact.miniApps.some((a) => a.id === 'vb-ma-autodial')).toBe(true);

    const fileImpact = queryImpact(index, 'TwoFactorSessionManager', 'code_ref');
    expect(fileImpact.nodes.length).toBeGreaterThan(0);
    expect(fileImpact.scenarios.length).toBeGreaterThan(0);

    const rbacImpact = queryImpact(index, 'CHIEN_DICH', 'rbac_permission');
    expect(rbacImpact.miniApps.some((a) => a.id === 'vb-ma-autodial')).toBe(true);
  });

  it('returns empty results cleanly when query is empty', () => {
    const empty = queryImpact(index, '   ');
    expect(empty.nodes).toEqual([]);
    expect(empty.scenarios).toEqual([]);
    expect(empty.miniApps).toEqual([]);
  });
});
