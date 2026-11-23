// tests/miniAppWireSession.test.ts
import { describe, expect, it } from 'vitest';
import {
  createDefaultHostConfig,
  createInitialHostState,
  executeHostCommand,
} from '../src/core/miniAppSandboxEngine';
import {
  parseWireSessionJson,
  redactSensitivePayload,
  replayWireSessionOnEngine,
  serializeWireSession,
} from '../src/core/miniAppWireSession';

describe('miniAppWireSession', () => {
  it('redacts tokens and authorization headers before serializing session JSON', () => {
    const redacted = redactSensitivePayload({
      token: 'vbt_ma_eyJhbGciOiJIUzI1NiJ9.secret_demo',
      nested: { Authorization: 'Bearer super_secret_token_9999' },
      safeField: 'hello',
    }) as Record<string, unknown>;

    expect(redacted.token).toBe('vbt_***demo');
    expect((redacted.nested as Record<string, unknown>).Authorization).toBe('Bear***9999');
    expect(redacted.safeField).toBe('hello');
  });

  it('serializes, parses, and replays recorded wire logs through sandbox engine', () => {
    const cfg = createDefaultHostConfig('vb-ma-autodial');
    let state = createInitialHostState(cfg);
    const res1 = executeHostCommand('ready', { sdk_version: '1.4.2' }, cfg, state);
    state = res1.nextState;
    const res2 = executeHostCommand(
      'start_autodial',
      { autoDialId: 151, hotline: '02499998888' },
      cfg,
      state,
    );

    const logs = [...res1.wireFrames, ...res2.wireFrames];
    const json = serializeWireSession(cfg, logs, { passed: 2, warnings: 0, failed: 0, total: 2 });
    const parsed = parseWireSessionJson(json);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.session.appId).toBe('vb-ma-autodial');
    const replay = replayWireSessionOnEngine(parsed.session);
    expect(replay.totalCommands).toBe(2);
    expect(replay.matchedCount).toBe(2);
    expect(replay.changedCount).toBe(0);
  });

  it('rejects oversized or malformed session files safely', () => {
    expect(parseWireSessionJson('not json').ok).toBe(false);
    expect(parseWireSessionJson('{"schemaVersion":"wrong"}').ok).toBe(false);
    const huge = 'x'.repeat(2 * 1024 * 1024 + 10);
    expect(parseWireSessionJson(huge).ok).toBe(false);
  });
});
