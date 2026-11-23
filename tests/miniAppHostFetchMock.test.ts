// tests/miniAppHostFetchMock.test.ts
import { describe, expect, it } from 'vitest';
import {
  evaluateHostFetchMockRule,
  matchHostFetchMockRule,
  type HostFetchMockRule,
} from '../src/core/miniAppHostFetchMock';
import {
  createDefaultHostConfig,
  createInitialHostState,
  executeHostCommand,
} from '../src/core/miniAppSandboxEngine';

describe('miniAppHostFetchMock', () => {
  const rules: HostFetchMockRule[] = [
    {
      id: 'r-disabled',
      enabled: false,
      name: 'Disabled rule',
      method: 'GET',
      urlPattern: '*',
      status: 503,
      delayMs: 0,
      responseJson: '{"disabled":true}',
    },
    {
      id: 'r-customers',
      enabled: true,
      name: 'Empty customers',
      method: 'GET',
      urlPattern: '*/customers*',
      status: 200,
      delayMs: 250,
      responseJson: '{"items":[],"total":0}',
    },
    {
      id: 'r-bad-json',
      enabled: true,
      name: 'Malformed JSON',
      method: 'POST',
      urlPattern: '/tickets',
      status: 500,
      delayMs: 0,
      responseJson: '{not-valid-json',
    },
  ];

  it('skips disabled rules and matches method + wildcard url', () => {
    const m1 = matchHostFetchMockRule(rules, 'get', 'https://api-dev.vbot.vn/v1/customers?limit=10');
    expect(m1?.id).toBe('r-customers');

    const m2 = matchHostFetchMockRule(rules, 'POST', 'https://api-dev.vbot.vn/v1/customers');
    expect(m2).toBeNull();

    const m3 = matchHostFetchMockRule(rules, 'POST', '/v1/tickets');
    expect(m3?.id).toBe('r-bad-json');
  });

  it('evaluates malformed JSON safely without throwing', () => {
    const evalBad = evaluateHostFetchMockRule(rules[2]);
    expect(evalBad.ok).toBe(false);
    expect(evalBad.status).toBe(500);
    expect(evalBad.error).toBeTruthy();
    expect(evalBad.data).toBe('{not-valid-json');
  });

  it('integrates with executeHostCommand for host_fetch', () => {
    const cfg = createDefaultHostConfig('vb-ma-crm');
    const st = createInitialHostState(cfg);

    const res = executeHostCommand(
      'host_fetch',
      { url: 'https://api-dev.vbot.vn/v1/customers?page=1', method: 'GET' },
      cfg,
      st,
      { mockRules: rules },
    );

    expect(res.ok).toBe(true);
    expect(res.responsePayload.status).toBe(200);
    expect(res.responsePayload.matched_mock_rule).toBe('Empty customers');
    expect(res.responsePayload.delay_ms).toBe(250);
    expect(res.responsePayload.data).toEqual({ items: [], total: 0 });
  });
});
