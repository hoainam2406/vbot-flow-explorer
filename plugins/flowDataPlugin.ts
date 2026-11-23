// plugins/flowDataPlugin.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { z } from 'zod';
import { mergeDataset, sanitizeForPublic } from '../src/core/graphEngine';
import {
  applyDraftPatchesToRawFiles,
  DraftPatchSchema,
  type DraftPatch,
} from '../src/core/datasetDraftStore';
import { validateDataset } from '../src/data/validateDataset';
import type {
  AppManifest,
  FlowModuleFile,
  FlowNodeData,
  MergedFlowDataset,
  SourceFileMap,
} from '../src/data/schema';

const VIRTUAL_ID = 'virtual:flow-dataset';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

export function collectTechOnlyMediaPaths(dataset: MergedFlowDataset): string[] {
  const publicSrcs = new Set<string>();
  const techSrcs = new Set<string>();
  const visitedParents = new Set<string>();

  const inspectNode = (node: FlowNodeData, parentIsTech = false) => {
    const nodeIsTech = parentIsTech || node.audience === 'tech';
    for (const m of node.media ?? []) {
      if (nodeIsTech || m.audience === 'tech') {
        techSrcs.add(m.src);
      } else {
        publicSrcs.add(m.src);
      }
    }
    const childSubtree = dataset.subtreesByParentId[node.id];
    if (childSubtree && !visitedParents.has(node.id)) {
      visitedParents.add(node.id);
      for (const child of childSubtree.nodes) {
        inspectNode(child, nodeIsTech);
      }
    }
  };

  inspectNode(dataset.rootNode);
  for (const branch of dataset.branches) {
    inspectNode(branch);
  }
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    if (visitedParents.has(parentId)) continue;
    visitedParents.add(parentId);
    for (const node of sub.nodes) {
      inspectNode(node, false);
    }
  }

  return [...techSrcs].filter((src) => !publicSrcs.has(src));
}

export function collectExistingMediaPaths(
  rootDir: string,
  dataset: MergedFlowDataset,
): string[] {
  const publicDir = path.resolve(rootDir, 'public');
  const found = new Set<string>();

  const inspectNodes = (nodes: FlowNodeData[]) => {
    for (const node of nodes) {
      for (const m of node.media ?? []) {
        const cleanRel = m.src.replace(/^\/+/, '');
        if (!cleanRel) continue;
        const fullPath = path.resolve(publicDir, cleanRel);
        if (fullPath.startsWith(publicDir + path.sep) && fs.existsSync(fullPath)) {
          found.add(`/${cleanRel.replace(/\\/g, '/')}`);
        }
      }
    }
  };

  inspectNodes([dataset.rootNode, ...dataset.branches]);
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    inspectNodes(sub.nodes);
  }
  return [...found].sort();
}

export function hasRealMediaFiles(rootDir: string, dataset: MergedFlowDataset): boolean {
  return collectExistingMediaPaths(rootDir, dataset).length > 0;
}

export function buildSourceFileMap(
  manifest: AppManifest,
  modules: FlowModuleFile[],
): SourceFileMap {
  const subtrees: Record<string, string> = {};
  for (const parentId of Object.keys(manifest.inlineSubtrees ?? {})) {
    subtrees[parentId] = 'app.json';
  }
  modules.forEach((mod, idx) => {
    const modNameFromIndex =
      manifest.moduleFiles.length === modules.length ? manifest.moduleFiles[idx] : undefined;
    const modNameFromId = manifest.moduleFiles.find(
      (f) => f === mod.moduleId || `mod-${f}` === mod.moduleId,
    );
    const fileBase = modNameFromIndex ?? modNameFromId ?? mod.moduleId;
    for (const parentId of Object.keys(mod.subtrees)) {
      subtrees[parentId] = `modules/${fileBase}.json`;
    }
  });
  return {
    subtrees,
    moduleFiles: [...manifest.moduleFiles],
  };
}

export function loadMergedDataset(rootDir: string): MergedFlowDataset {
  const dataDir = path.join(rootDir, 'data');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'app.json'), 'utf8'),
  ) as AppManifest;
  const modules = manifest.moduleFiles.map((name) =>
    JSON.parse(
      fs.readFileSync(path.join(dataDir, 'modules', `${name}.json`), 'utf8'),
    ) as FlowModuleFile,
  );

  const errors = validateDataset(manifest, modules);
  if (errors.length > 0) {
    throw new Error(`Flow dataset validation error:\n${errors.join('\n')}`);
  }
  return {
    ...mergeDataset(manifest, modules),
    sourceFileMap: buildSourceFileMap(manifest, modules),
  };
}

export class DevPatchError extends Error {
  statusCode: number;
  details?: string[];

  constructor(message: string, statusCode = 400, details?: string[]) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const SAFE_MODULE_NAME_RE = /^[a-z0-9-]+$/i;
const MAX_PATCH_BODY_BYTES = 5 * 1024 * 1024;
const MAX_VBOT_WORK_BODY_BYTES = 256 * 1024;

const DEFAULT_VBOT_WORK_API_BASE = 'https://work.vpmedia.vn';
const DEFAULT_VBOT_WORK_WORKSPACE_ID = 'hWPuKo7SL4lPvs176L5epSN3OStLwhtl';
const DEFAULT_VBOT_WORK_PROJECT_ID = 'us0ldnoyj97idvvhjm7wjnfs';
const DEFAULT_VBOT_WORK_ASSIGNEE_ID = 'tam2836x9f3Icten824YV2UDcuQX4WDx';
const DEFAULT_VBOT_WORK_PROJECT_NAME = 'vbot-mobile';
const DEFAULT_VBOT_WORK_PROJECT_SLUG = 'VbM';
const DEFAULT_VBOT_WORK_ASSIGNEE_NAME = 'Hoài Nam';

const CreateVbotWorkTaskInputSchema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề task không được để trống').max(240),
  description: z.string().max(20000).default(''),
  priority: z
    .enum(['no-priority', 'low', 'medium', 'high', 'urgent'])
    .default('no-priority'),
  status: z
    .enum(['to-do', 'in-progress', 'in-review', 'done', 'pedding', 'archived'])
    .default('to-do'),
});

function normalizeBearerToken(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^Bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}

function readTokenFromEnvFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key !== 'VBOT_WORK_TOKEN') continue;
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      const normalized = normalizeBearerToken(val);
      if (normalized) return normalized;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveVbotWorkAuthHeader(
  rootDir: string,
  env: Record<string, string | undefined> = process.env,
  homeDir: string = os.homedir(),
): string | null {
  const fromEnv = normalizeBearerToken(env.VBOT_WORK_TOKEN);
  if (fromEnv) return fromEnv;

  const fromEnvLocal = readTokenFromEnvFile(path.join(rootDir, '.env.local'));
  if (fromEnvLocal) return fromEnvLocal;

  const mcpFiles = [
    path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json'),
    path.join(homeDir, '.cursor', 'mcp.json'),
    path.join(homeDir, '.claude.json'),
  ];
  for (const cfgPath of mcpFiles) {
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        mcpServers?: Record<string, { headers?: Record<string, string> }>;
      };
      const auth = parsed?.mcpServers?.['vbot-work']?.headers?.Authorization;
      const normalized = normalizeBearerToken(auth);
      if (normalized) return normalized;
    } catch {
      // ignore malformed external config
    }
  }
  return null;
}

export async function createVbotWorkTaskOnServer(
  rootDir: string,
  rawBody: unknown,
  options?: {
    env?: Record<string, string | undefined>;
    homeDir?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<{
  ok: true;
  task: {
    id: string;
    number?: number;
    key: string;
    title: string;
    projectName: string;
    assigneeName: string;
    url: string;
  };
}> {
  const parsedInput = CreateVbotWorkTaskInputSchema.safeParse(rawBody);
  if (!parsedInput.success) {
    const firstMsg = parsedInput.error.issues[0]?.message || 'Dữ liệu task không hợp lệ.';
    throw new DevPatchError(firstMsg, 400);
  }

  const env = options?.env ?? process.env;
  const authHeader = resolveVbotWorkAuthHeader(rootDir, env, options?.homeDir);
  if (!authHeader) {
    throw new DevPatchError(
      'Chưa cấu hình token VBot Work. Hãy thêm VBOT_WORK_TOKEN vào file .env.local hoặc kiểm tra mcp_config.json rồi chạy lại pnpm dev.',
      503,
    );
  }

  const apiBase = (env.VBOT_WORK_API_BASE?.trim() || DEFAULT_VBOT_WORK_API_BASE).replace(
    /\/+$/,
    '',
  );
  const workspaceId =
    env.VBOT_WORK_WORKSPACE_ID?.trim() || DEFAULT_VBOT_WORK_WORKSPACE_ID;
  const projectId = env.VBOT_WORK_PROJECT_ID?.trim() || DEFAULT_VBOT_WORK_PROJECT_ID;
  const userId = env.VBOT_WORK_ASSIGNEE_ID?.trim() || DEFAULT_VBOT_WORK_ASSIGNEE_ID;
  const fetchFn = options?.fetchImpl ?? fetch;

  const resp = await fetchFn(`${apiBase}/api/task/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: parsedInput.data.title,
      description: parsedInput.data.description,
      priority: parsedInput.data.priority,
      status: parsedInput.data.status,
      userId,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    throw new DevPatchError(
      `VBot Work API trả về lỗi HTTP ${resp.status}. Hãy kiểm tra lại token VBOT_WORK_TOKEN.`,
      status,
    );
  }

  const respJson = (await resp.json()) as {
    id?: string;
    number?: number;
    title?: string;
    projectSlug?: string;
    data?: {
      id?: string;
      number?: number;
      title?: string;
      projectSlug?: string;
    };
  };
  const taskObj = respJson?.data ?? respJson ?? {};
  const taskId = typeof taskObj.id === 'string' ? taskObj.id : '';
  const number = typeof taskObj.number === 'number' ? taskObj.number : undefined;
  const slug =
    typeof taskObj.projectSlug === 'string' && taskObj.projectSlug
      ? taskObj.projectSlug
      : DEFAULT_VBOT_WORK_PROJECT_SLUG;
  const key = number !== undefined ? `${slug}-${number}` : slug;
  const url = taskId
    ? `${apiBase}/dashboard/workspace/${workspaceId}/project/${projectId}/task/${taskId}`
    : `${apiBase}/dashboard/workspace/${workspaceId}/project/${projectId}/board`;

  return {
    ok: true,
    task: {
      id: taskId,
      ...(number !== undefined ? { number } : {}),
      key,
      title: typeof taskObj.title === 'string' && taskObj.title ? taskObj.title : parsedInput.data.title,
      projectName: DEFAULT_VBOT_WORK_PROJECT_NAME,
      assigneeName: DEFAULT_VBOT_WORK_ASSIGNEE_NAME,
      url,
    },
  };
}

function writeFileAtomic(targetPath: string, content: string): void {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    throw err;
  }
}

export function applyDevPatchesToDisk(
  rootDir: string,
  rawPatches: unknown,
): { ok: true; changedFiles: string[]; appliedCount: number } {
  if (!Array.isArray(rawPatches) || rawPatches.length === 0) {
    throw new DevPatchError('Danh sách patch phải là mảng không rỗng.', 400);
  }

  const patches: DraftPatch[] = [];
  for (let i = 0; i < rawPatches.length; i += 1) {
    const parsed = DraftPatchSchema.safeParse(rawPatches[i]);
    if (!parsed.success) {
      throw new DevPatchError(
        `Patch thứ ${i + 1} không đúng định dạng: ${parsed.error.message}`,
        400,
      );
    }
    patches.push(parsed.data);
  }

  const dataDir = path.resolve(rootDir, 'data');
  const modulesDir = path.resolve(dataDir, 'modules');
  const manifestPath = path.resolve(dataDir, 'app.json');
  if (!fs.existsSync(manifestPath)) {
    throw new DevPatchError('Không tìm thấy data/app.json.', 404);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AppManifest;
  const whitelistedModules = new Set(manifest.moduleFiles);
  const modulesByFile: Record<string, FlowModuleFile> = {};

  for (const modName of manifest.moduleFiles) {
    if (!SAFE_MODULE_NAME_RE.test(modName)) {
      throw new DevPatchError(`Tên module không hợp lệ: "${modName}"`, 400);
    }
    const modPath = path.resolve(modulesDir, `${modName}.json`);
    if (!modPath.startsWith(modulesDir + path.sep)) {
      throw new DevPatchError(`Đường dẫn module vượt phạm vi cho phép: "${modName}"`, 400);
    }
    modulesByFile[modName] = JSON.parse(fs.readFileSync(modPath, 'utf8')) as FlowModuleFile;
  }

  const applied = applyDraftPatchesToRawFiles(manifest, modulesByFile, patches);
  if (applied.errors.length > 0) {
    throw new DevPatchError(applied.errors[0], 400, applied.errors);
  }

  for (const relFile of applied.changedFiles) {
    if (relFile === 'app.json') {
      writeFileAtomic(manifestPath, JSON.stringify(applied.manifest, null, 2) + '\n');
      continue;
    }
    const match = /^modules\/([a-z0-9-]+)\.json$/i.exec(relFile);
    if (!match || !whitelistedModules.has(match[1])) {
      throw new DevPatchError(`File đích không nằm trong danh sách cho phép: "${relFile}"`, 400);
    }
    const modName = match[1];
    const targetPath = path.resolve(modulesDir, `${modName}.json`);
    if (!targetPath.startsWith(modulesDir + path.sep)) {
      throw new DevPatchError(`Đường dẫn ghi file không hợp lệ: "${relFile}"`, 400);
    }
    const modContent = applied.modulesByFile[modName];
    if (!modContent) {
      throw new DevPatchError(`Thiếu dữ liệu module "${modName}" để ghi.`, 400);
    }
    writeFileAtomic(targetPath, JSON.stringify(modContent, null, 2) + '\n');
  }

  return {
    ok: true,
    changedFiles: applied.changedFiles,
    appliedCount: patches.length,
  };
}

export function flowDataPlugin(buildTarget: 'public' | 'internal'): Plugin {
  let resolvedConfig: ResolvedConfig;
  let techOnlyMedia: string[] = [];

  return {
    name: 'vbot-flow-data',
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      if (buildTarget !== 'internal') return;

      server.middlewares.use('/__vbot-dev/status', (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            writable: true,
            buildTarget,
            vbotWork: {
              configured: Boolean(resolveVbotWorkAuthHeader(resolvedConfig.root)),
              projectName: DEFAULT_VBOT_WORK_PROJECT_NAME,
              projectSlug: DEFAULT_VBOT_WORK_PROJECT_SLUG,
              assigneeName: DEFAULT_VBOT_WORK_ASSIGNEE_NAME,
            },
          }),
        );
      });

      server.middlewares.use('/__vbot-dev/vbot-work/create-task', (req, res, next) => {
        if (req.method !== 'POST') return next();

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        let overflowed = false;

        req.on('data', (chunk: Uint8Array | string) => {
          if (overflowed) return;
          const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
          totalBytes += buf.byteLength;
          if (totalBytes > MAX_VBOT_WORK_BODY_BYTES) {
            overflowed = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Payload vượt quá giới hạn 256KB.' }));
            return;
          }
          chunks.push(buf);
        });

        req.on('end', () => {
          if (overflowed) return;
          void (async () => {
            try {
              const rawText = Buffer.concat(chunks).toString('utf8');
              const parsedBody = rawText ? (JSON.parse(rawText) as unknown) : {};
              const result = await createVbotWorkTaskOnServer(resolvedConfig.root, parsedBody);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err) {
              if (err instanceof DevPatchError) {
                res.statusCode = err.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: err.message }));
                return;
              }
              const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi tạo task.';
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: msg }));
            }
          })();
        });
      });

      server.middlewares.use('/__vbot-dev/apply-patches', (req, res, next) => {
        if (req.method !== 'POST') return next();

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        let overflowed = false;

        req.on('data', (chunk: Uint8Array | string) => {
          if (overflowed) return;
          const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
          totalBytes += buf.byteLength;
          if (totalBytes > MAX_PATCH_BODY_BYTES) {
            overflowed = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: 'Payload vượt quá giới hạn 5MB.',
              }),
            );
            return;
          }
          chunks.push(buf);
        });

        req.on('end', () => {
          if (overflowed) return;
          try {
            const rawText = Buffer.concat(chunks).toString('utf8');
            const parsedBody = rawText ? (JSON.parse(rawText) as unknown) : null;
            const rawPatches = Array.isArray(parsedBody)
              ? parsedBody
              : (parsedBody as { patches?: unknown } | null)?.patches;
            const result = applyDevPatchesToDisk(resolvedConfig.root, rawPatches);

            const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err) {
            if (err instanceof DevPatchError) {
              res.statusCode = err.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  ok: false,
                  error: err.message,
                  errors: err.details ?? [err.message],
                }),
              );
              return;
            }
            const msg = err instanceof Error ? err.message : 'Lỗi không xác định khi ghi patch.';
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: msg, errors: [msg] }));
          }
        });
      });
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const merged = loadMergedDataset(resolvedConfig.root);
      techOnlyMedia = collectTechOnlyMediaPaths(merged);
      const output = buildTarget === 'public' ? sanitizeForPublic(merged) : merged;
      const existingMediaPaths = collectExistingMediaPaths(resolvedConfig.root, output);
      const payload: MergedFlowDataset =
        buildTarget === 'internal'
          ? {
              ...output,
              hasRealMedia: existingMediaPaths.length > 0,
              existingMediaPaths,
              sourceFileMap: merged.sourceFileMap,
            }
          : {
              ...output,
              hasRealMedia: existingMediaPaths.length > 0,
            };
      return `export default ${JSON.stringify(payload)};`;
    },
    handleHotUpdate({ file, server }) {
      const dataPrefix = path.join(resolvedConfig.root, 'data') + path.sep;
      if (file.startsWith(dataPrefix) && file.endsWith('.json')) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    closeBundle() {
      if (buildTarget !== 'public') return;
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      for (const relSrc of techOnlyMedia) {
        const cleanRel = relSrc.replace(/^\/+/, '');
        const targetFile = path.resolve(outDir, cleanRel);
        if (targetFile.startsWith(outDir + path.sep) && fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile);
        }
      }
    },
  };
}
