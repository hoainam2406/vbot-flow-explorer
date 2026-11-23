// tests/miniAppTypeCodegen.test.ts
import { describe, expect, it } from 'vitest';
import { buildMiniAppContract } from '../src/core/miniAppContractBuilder';
import {
  generateTypedContractFile,
  generateVitestMockHostFile,
} from '../src/core/miniAppTypeCodegen';

describe('miniAppTypeCodegen', () => {
  it('generates typed client contract and Vitest mock for vb-ma-autodial', () => {
    const contract = buildMiniAppContract('vb-ma-autodial');
    const typedTs = generateTypedContractFile(contract);
    const mockTs = generateVitestMockHostFile(contract);

    expect(typedTs).toContain("export const MINI_APP_ID = 'vb-ma-autodial' as const;");
    expect(typedTs).toContain('export interface IncomingHostEventMap');
    expect(typedTs).toContain("'autodial_finished'");
    expect(typedTs).toContain('createVBotBridgeClient');
    expect(typedTs).toContain('startAutodial(');
    expect(typedTs).toContain('makeCall(');
    expect(typedTs).not.toContain('undefined');

    expect(mockTs).toContain('createMockVBotHost');
    expect(mockTs).toContain('simulateHostPush');
    expect(mockTs).toContain('setPermissionGrant');
    expect(mockTs).toContain("from './vbot-contract.vb-ma-autodial'");
  });

  it('includes toggle_actions_menu and contacts actions for vb-ma-user-contact', () => {
    const contract = buildMiniAppContract('vb-ma-user-contact');
    expect(contract.incomingEvents.some((e) => e.eventName === 'toggle_actions_menu')).toBe(true);

    const typedTs = generateTypedContractFile(contract);
    expect(typedTs).toContain("'toggle_actions_menu'");
    expect(typedTs).toContain('userContactGetLocal(');
  });

  it('generates valid typed contract for CRM mini app', () => {
    const contract = buildMiniAppContract('vb-ma-crm');
    const typedTs = generateTypedContractFile(contract);
    expect(typedTs).toContain('openMiniApp(');
    expect(typedTs).toContain('checkPermissions(');
  });
});
