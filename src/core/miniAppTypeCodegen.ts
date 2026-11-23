// src/core/miniAppTypeCodegen.ts
import type {
  ContractCommandSpec,
  ContractEventSpec,
  ContractFieldSpec,
  MiniAppContract,
} from './miniAppContractBuilder';

function toCamelCase(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function toPascalCase(raw: string): string {
  const camel = toCamelCase(raw);
  return camel ? camel[0].toUpperCase() + camel.slice(1) : 'Value';
}

function mapSchemaTypeToTs(rawType: string): string {
  const t = rawType.trim();
  if (!t) return 'unknown';
  if (
    t === 'string' ||
    t === 'number' ||
    t === 'boolean' ||
    t === 'string[]' ||
    t === 'number[]' ||
    t.startsWith('Record<') ||
    t.includes('|')
  ) {
    return t;
  }
  if (t === 'object') return 'Record<string, unknown>';
  if (t === 'PermissionModuleCode') return 'string';
  return 'unknown';
}

function inferValueTsType(val: unknown): string {
  if (val === null || val === undefined) return 'unknown';
  if (Array.isArray(val)) {
    if (val.length === 0) return 'unknown[]';
    const firstType = inferValueTsType(val[0]);
    return `${firstType}[]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return 'Record<string, unknown>';
    const parts = entries.map(
      ([k, v]) => `${/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k)}: ${inferValueTsType(v)}`,
    );
    return `{ ${parts.join('; ')} }`;
  }
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return typeof val;
  }
  return 'unknown';
}

function formatSchemaFields(fields: readonly ContractFieldSpec[], fallbackObj?: Record<string, unknown>): string {
  if (fields.length === 0) {
    if (fallbackObj && Object.keys(fallbackObj).length > 0) {
      return inferValueTsType(fallbackObj);
    }
    return 'Record<string, never>';
  }

  const lines = fields.map((f) => {
    const propName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(f.name) ? f.name : JSON.stringify(f.name);
    const opt = f.required ? '' : '?';
    return `  /** ${f.description.replace(/\*\//g, '* /')} */\n  ${propName}${opt}: ${mapSchemaTypeToTs(f.type)};`;
  });
  return `{\n${lines.join('\n')}\n}`;
}

function buildEventPayloadType(evt: ContractEventSpec): string {
  if (evt.payloadSchema.length > 0) {
    return formatSchemaFields(evt.payloadSchema, evt.samplePayload);
  }
  return inferValueTsType(evt.samplePayload);
}

function buildCommandMethodSnippet(cmd: ContractCommandSpec): string {
  const fnName = toCamelCase(cmd.method);
  const hasInput = cmd.requestSchema.length > 0;
  const paramSig = hasInput
    ? `payload: OutgoingCommandInputMap['${cmd.method}']`
    : `payload: OutgoingCommandInputMap['${cmd.method}'] = {}`;

  if (cmd.isHostAction) {
    return [
      `    /** ${cmd.title} */`,
      `    ${fnName}(${paramSig}): Promise<OutgoingCommandResponseMap['${cmd.method}']> {`,
      `      return callHostAction('${cmd.method}', payload as Record<string, unknown>);`,
      `    },`,
    ].join('\n');
  }

  return [
    `    /** ${cmd.title} */`,
    `    ${fnName}(${paramSig}): Promise<OutgoingCommandResponseMap['${cmd.method}']> {`,
    `      return callCoreCommand('${cmd.method}', payload as Record<string, unknown>);`,
    `    },`,
  ].join('\n');
}

export function generateTypedContractFile(contract: MiniAppContract): string {
  const { app, launchParams, incomingEvents, outgoingCommands } = contract;
  const appPascal = toPascalCase(app.id);

  const launchFields = launchParams.map((lp) => {
    const key = lp.key.replace(/^#/, '');
    const prop = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
    const opt = lp.required ? '' : '?';
    return `  /** ${lp.description.replace(/\*\//g, '* /')} */\n  ${prop}${opt}: string;`;
  });

  const eventMapEntries = incomingEvents.map((evt) => {
    const body = buildEventPayloadType(evt);
    const indented = body.includes('\n') ? body.replace(/\n/g, '\n  ') : body;
    return `  '${evt.eventName}': ${indented};`;
  });

  const inputMapEntries = outgoingCommands.map((cmd) => {
    if (cmd.requestSchema.length === 0) {
      return `  '${cmd.method}': Record<string, unknown>;`;
    }
    const body = formatSchemaFields(cmd.requestSchema);
    return `  '${cmd.method}': ${body.replace(/\n/g, '\n  ')};`;
  });

  const responseMapEntries = outgoingCommands.map((cmd) => {
    const typeStr = inferValueTsType(cmd.responseOk);
    return `  '${cmd.method}': ${typeStr};`;
  });

  const clientMethods = outgoingCommands.map(buildCommandMethodSnippet);

  return [
    `/**`,
    ` * Auto-generated Typed Contract for Mini App: ${app.nameVi} (${app.id})`,
    ` * Nguồn: VBot Flow Explorer · Mini App Dev Studio`,
    ` */`,
    `import { onEvent, postEvent } from '@vbotma/sdk';`,
    ``,
    `export const MINI_APP_ID = '${app.id}' as const;`,
    ``,
    `export interface ${appPascal}LaunchParams {`,
    ...launchFields,
    `}`,
    ``,
    `export interface IncomingHostEventMap {`,
    ...eventMapEntries,
    `}`,
    ``,
    `export interface OutgoingCommandInputMap {`,
    ...inputMapEntries,
    `}`,
    ``,
    `export interface OutgoingCommandResponseMap {`,
    ...responseMapEntries,
    `}`,
    ``,
    `export interface VBotBridgeClientOptions {`,
    `  timeoutMs?: number;`,
    `}`,
    ``,
    `export function createVBotBridgeClient(options: VBotBridgeClientOptions = {}) {`,
    `  const timeoutMs = options.timeoutMs ?? 5000;`,
    ``,
    `  function callHostAction<TRes>(action: string, payload: Record<string, unknown>): Promise<TRes> {`,
    `    return new Promise<TRes>((resolve, reject) => {`,
    `      const requestId = \`req-\${Date.now()}-\${Math.random().toString(16).slice(2, 6)}\`;`,
    `      const timer = setTimeout(() => {`,
    `        off();`,
    `        reject(new Error(\`Host action "\${action}" timeout sau \${timeoutMs}ms\`));`,
    `      }, timeoutMs);`,
    `      const off = onEvent('host_action_result', (res: Record<string, unknown>) => {`,
    `        if (res.request_id !== requestId) return;`,
    `        clearTimeout(timer);`,
    `        off();`,
    `        if (res.success === false) {`,
    `          reject(res);`,
    `          return;`,
    `        }`,
    `        resolve(res as TRes);`,
    `      });`,
    `      postEvent('request_host_action', { request_id: requestId, action, payload });`,
    `    });`,
    `  }`,
    ``,
    `  function callCoreCommand<TRes>(method: string, payload: Record<string, unknown>): Promise<TRes> {`,
    `    postEvent(method, payload);`,
    `    return Promise.resolve({ success: true } as TRes);`,
    `  }`,
    ``,
    `  return {`,
    `    on<K extends keyof IncomingHostEventMap>(`,
    `      event: K,`,
    `      handler: (payload: IncomingHostEventMap[K]) => void,`,
    `    ): () => void {`,
    `      return onEvent(event, handler as (payload: unknown) => void);`,
    `    },`,
    ...clientMethods,
    `  };`,
    `}`,
    ``,
  ].join('\n');
}

export function generateVitestMockHostFile(contract: MiniAppContract): string {
  const { app, incomingEvents, outgoingCommands, permissionProfile } = contract;
  const defaultResponses = Object.fromEntries(
    outgoingCommands.map((cmd) => [cmd.method, cmd.responseOk]),
  );
  const defaultIncoming = Object.fromEntries(
    incomingEvents.map((evt) => [evt.eventName, evt.samplePayload]),
  );
  const defaultCaps = permissionProfile?.manifestCapabilities ?? [];

  return [
    `/**`,
    ` * Auto-generated Unit Test Host Mock for Mini App: ${app.nameVi} (${app.id})`,
    ` * Dùng trong Vitest / Jest để kiểm thử logic Mini App không cần Native iOS/Android.`,
    ` */`,
    `import type { IncomingHostEventMap, OutgoingCommandResponseMap } from './vbot-contract.${app.id}';`,
    ``,
    `export interface RecordedBridgeCall {`,
    `  method: string;`,
    `  payload: Record<string, unknown>;`,
    `  timestamp: number;`,
    `}`,
    ``,
    `const DEFAULT_RESPONSES: Record<string, unknown> = ${JSON.stringify(defaultResponses, null, 2)};`,
    ``,
    `const DEFAULT_EVENTS: Record<string, unknown> = ${JSON.stringify(defaultIncoming, null, 2)};`,
    ``,
    `const DEFAULT_GRANTS: Record<string, Record<string, boolean>> = ${JSON.stringify(
      Object.fromEntries(
        defaultCaps.map((cap) => [
          cap.module,
          Object.fromEntries((cap.actions.length > 0 ? cap.actions : ['XEM']).map((a) => [a, true])),
        ]),
      ),
      null,
      2,
    )};`,
    ``,
    `export function createMockVBotHost(`,
    `  initialOverrides: Partial<OutgoingCommandResponseMap> = {},`,
    `) {`,
    `  const listeners = new Map<string, Set<(payload: unknown) => void>>();`,
    `  const recorded: RecordedBridgeCall[] = [];`,
    `  const responseOverrides: Record<string, unknown> = { ...initialOverrides };`,
    `  const grants: Record<string, Record<string, boolean>> = JSON.parse(JSON.stringify(DEFAULT_GRANTS));`,
    ``,
    `  return {`,
    `    onEvent<K extends keyof IncomingHostEventMap>(`,
    `      event: K,`,
    `      cb: (payload: IncomingHostEventMap[K]) => void,`,
    `    ): () => void {`,
    `      const key = String(event);`,
    `      const set = listeners.get(key) ?? new Set();`,
    `      set.add(cb as (payload: unknown) => void);`,
    `      listeners.set(key, set);`,
    `      return () => set.delete(cb as (payload: unknown) => void);`,
    `    },`,
    `    simulateHostPush<K extends keyof IncomingHostEventMap>(`,
    `      event: K,`,
    `      payload?: Partial<IncomingHostEventMap[K]>,`,
    `    ): void {`,
    `      const key = String(event);`,
    `      const base = (DEFAULT_EVENTS[key] as Record<string, unknown>) ?? {};`,
    `      const merged = { ...base, ...(payload as Record<string, unknown>) };`,
    `      for (const cb of listeners.get(key) ?? []) {`,
    `        cb(merged);`,
    `      }`,
    `    },`,
    `    handlePostEvent(method: string, payload: Record<string, unknown> = {}): unknown {`,
    `      recorded.push({ method, payload, timestamp: Date.now() });`,
    `      if (method === 'check_permissions') {`,
    `        const mod = String(payload.module ?? '');`,
    `        const actions = Array.isArray(payload.actions) ? payload.actions.map(String) : [];`,
    `        const granted: Record<string, boolean> = {};`,
    `        for (const act of actions) {`,
    `          granted[act] = grants[mod]?.[act] ?? false;`,
    `        }`,
    `        return { module: mod, granted };`,
    `      }`,
    `      return responseOverrides[method] ?? DEFAULT_RESPONSES[method] ?? { success: true };`,
    `    },`,
    `    setPermissionGrant(module: string, action: string, allowed: boolean): void {`,
    `      grants[module] = grants[module] ?? {};`,
    `      grants[module][action] = allowed;`,
    `    },`,
    `    mockCommandResponse<K extends keyof OutgoingCommandResponseMap>(`,
    `      method: K,`,
    `      response: OutgoingCommandResponseMap[K],`,
    `    ): void {`,
    `      responseOverrides[String(method)] = response;`,
    `    },`,
    `    getRecordedCommands(): RecordedBridgeCall[] {`,
    `      return [...recorded];`,
    `    },`,
    `    clearCommands(): void {`,
    `      recorded.length = 0;`,
    `    },`,
    `    reset(): void {`,
    `      recorded.length = 0;`,
    `      listeners.clear();`,
    `    },`,
    `  };`,
    `}`,
    ``,
  ].join('\n');
}
