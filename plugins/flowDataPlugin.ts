// plugins/flowDataPlugin.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { z } from 'zod';
import { mergeDataset, sanitizeForPublic } from '../src/core/graphEngine';
import {
  applyDraftPatchesToRawFiles,
  DraftPatchSchema,
  type DraftPatch,
} from '../src/core/datasetDraftStore';
import { registerDevWorkspaceMiddleware } from './devWorkspaceMiddleware';
import { validateDataset } from '../src/data/validateDataset';
import {
  BranchManifestSchema,
  type AppManifest,
  type BranchManifest,
  type FlowBranchInfo,
  type FlowModuleFile,
  type FlowNodeData,
  type MergedFlowDataset,
  type SourceFileMap,
} from '../src/data/schema';

const VIRTUAL_ID = 'virtual:flow-dataset';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;
const VIRTUAL_BRANCHES_ID = 'virtual:flow-branches';
const RESOLVED_VIRTUAL_BRANCHES_ID = '\0' + VIRTUAL_BRANCHES_ID;
const VIRTUAL_BRANCH_PREFIX = 'virtual:flow-dataset-branch/';
const RESOLVED_VIRTUAL_BRANCH_PREFIX = '\0' + VIRTUAL_BRANCH_PREFIX;
const SAFE_BRANCH_ID_RE = /^[a-zA-Z0-9._-]+$/;

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

function readBaseManifest(dataDir: string): AppManifest {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'app.json'), 'utf8')) as AppManifest;
}

function resolveDefaultBranchId(manifest: AppManifest): string {
  return manifest.app.techBranch?.trim() || 'Nam-dev';
}

function resolveBranchDir(dataDir: string, branchId: string): string {
  const cleanId = branchId.trim();
  if (!SAFE_BRANCH_ID_RE.test(cleanId)) {
    throw new DevPatchError(`Tên nhánh không hợp lệ: "${branchId}"`, 400);
  }
  const branchesRoot = path.resolve(dataDir, 'branches');
  const branchDir = path.resolve(branchesRoot, cleanId);
  if (!branchDir.startsWith(branchesRoot + path.sep)) {
    throw new DevPatchError(`Đường dẫn nhánh vượt phạm vi cho phép: "${branchId}"`, 400);
  }
  return branchDir;
}

function readBranchManifest(branchDir: string, expectedId: string): BranchManifest {
  const branchJsonPath = path.join(branchDir, 'branch.json');
  if (!fs.existsSync(branchJsonPath)) {
    throw new DevPatchError(`Không tìm thấy cấu hình nhánh "${expectedId}/branch.json".`, 404);
  }
  const raw = JSON.parse(fs.readFileSync(branchJsonPath, 'utf8')) as unknown;
  const parsed = BranchManifestSchema.parse(raw);
  if (parsed.id !== expectedId) {
    throw new Error(
      `Branch id mismatch: directory "${expectedId}" contains branch.json with id "${parsed.id}"`,
    );
  }
  return parsed;
}

export function listAvailableBranches(rootDir: string): FlowBranchInfo[] {
  const dataDir = path.join(rootDir, 'data');
  const baseManifest = readBaseManifest(dataDir);
  const defaultId = resolveDefaultBranchId(baseManifest);
  const result: FlowBranchInfo[] = [
    {
      id: defaultId,
      label: defaultId,
      description: 'Nhánh chuẩn mặc định (iOS & Android)',
      isDefault: true,
    },
  ];

  const branchesDir = path.join(dataDir, 'branches');
  if (!fs.existsSync(branchesDir)) {
    return result;
  }

  const entries = fs
    .readdirSync(branchesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SAFE_BRANCH_ID_RE.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const branchDir = path.join(branchesDir, entry.name);
    const branchJsonPath = path.join(branchDir, 'branch.json');
    if (!fs.existsSync(branchJsonPath)) continue;
    const branchManifest = readBranchManifest(branchDir, entry.name);
    if (branchManifest.id === defaultId) continue;
    result.push({
      id: branchManifest.id,
      label: branchManifest.label,
      ...(branchManifest.description ? { description: branchManifest.description } : {}),
      isDefault: false,
    });
  }

  return result;
}

export function loadMergedDatasetForBranch(
  rootDir: string,
  branchId?: string,
): MergedFlowDataset {
  const dataDir = path.join(rootDir, 'data');
  const baseManifest = readBaseManifest(dataDir);
  const defaultId = resolveDefaultBranchId(baseManifest);
  const cleanBranchId = branchId?.trim();

  if (!cleanBranchId || cleanBranchId === defaultId) {
    const modules = baseManifest.moduleFiles.map((name) => {
      if (!SAFE_MODULE_NAME_RE.test(name)) {
        throw new Error(`Invalid module filename "${name}"`);
      }
      return JSON.parse(
        fs.readFileSync(path.join(dataDir, 'modules', `${name}.json`), 'utf8'),
      ) as FlowModuleFile;
    });

    const errors = validateDataset(baseManifest, modules);
    if (errors.length > 0) {
      throw new Error(`Flow dataset validation error:\n${errors.join('\n')}`);
    }
    return {
      ...mergeDataset(baseManifest, modules),
      sourceFileMap: buildSourceFileMap(baseManifest, modules),
    };
  }

  const branchDir = resolveBranchDir(dataDir, cleanBranchId);
  if (!fs.existsSync(branchDir)) {
    throw new DevPatchError(`Không tìm thấy thư mục nhánh "${cleanBranchId}".`, 404);
  }
  const branchManifest = readBranchManifest(branchDir, cleanBranchId);

  const branchAppPath = path.join(branchDir, 'app.json');
  const rawManifest = fs.existsSync(branchAppPath)
    ? (JSON.parse(fs.readFileSync(branchAppPath, 'utf8')) as AppManifest)
    : baseManifest;

  const effectiveManifest: AppManifest = {
    ...rawManifest,
    app: {
      ...rawManifest.app,
      ...(branchManifest.appOverrides ?? {}),
      techBranch: branchManifest.appOverrides?.techBranch ?? branchManifest.id,
    },
  };

  const modules = effectiveManifest.moduleFiles.map((name) => {
    if (!SAFE_MODULE_NAME_RE.test(name)) {
      throw new Error(`Invalid module filename "${name}"`);
    }
    const branchModPath = path.join(branchDir, 'modules', `${name}.json`);
    const baseModPath = path.join(dataDir, 'modules', `${name}.json`);
    const targetModPath = fs.existsSync(branchModPath) ? branchModPath : baseModPath;
    return JSON.parse(fs.readFileSync(targetModPath, 'utf8')) as FlowModuleFile;
  });

  const errors = validateDataset(effectiveManifest, modules);
  if (errors.length > 0) {
    throw new Error(`Flow dataset validation error (${cleanBranchId}):\n${errors.join('\n')}`);
  }
  return {
    ...mergeDataset(effectiveManifest, modules),
    sourceFileMap: buildSourceFileMap(effectiveManifest, modules),
  };
}

export function loadMergedDataset(rootDir: string): MergedFlowDataset {
  return loadMergedDatasetForBranch(rootDir);
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
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
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
  branchId?: string,
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

  const baseManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AppManifest;
  const defaultBranchId = resolveDefaultBranchId(baseManifest);
  const cleanBranchId = branchId?.trim();
  const isBranchOverride = Boolean(cleanBranchId && cleanBranchId !== defaultBranchId);

  let targetManifestPath = manifestPath;
  let targetModulesDir = modulesDir;
  let manifest: AppManifest = baseManifest;

  if (isBranchOverride && cleanBranchId) {
    const branchDir = resolveBranchDir(dataDir, cleanBranchId);
    if (!fs.existsSync(branchDir)) {
      throw new DevPatchError(`Không tìm thấy thư mục nhánh "${cleanBranchId}".`, 404);
    }
    const branchManifest = readBranchManifest(branchDir, cleanBranchId);
    const branchAppPath = path.resolve(branchDir, 'app.json');
    const rawBranchManifest = fs.existsSync(branchAppPath)
      ? (JSON.parse(fs.readFileSync(branchAppPath, 'utf8')) as AppManifest)
      : baseManifest;
    manifest = {
      ...rawBranchManifest,
      app: {
        ...rawBranchManifest.app,
        ...(branchManifest.appOverrides ?? {}),
        techBranch: branchManifest.appOverrides?.techBranch ?? branchManifest.id,
      },
    };
    targetManifestPath = branchAppPath;
    targetModulesDir = path.resolve(branchDir, 'modules');
  }

  const whitelistedModules = new Set(manifest.moduleFiles);
  const modulesByFile: Record<string, FlowModuleFile> = {};

  for (const modName of manifest.moduleFiles) {
    if (!SAFE_MODULE_NAME_RE.test(modName)) {
      throw new DevPatchError(`Tên module không hợp lệ: "${modName}"`, 400);
    }
    const baseModPath = path.resolve(modulesDir, `${modName}.json`);
    if (!baseModPath.startsWith(modulesDir + path.sep)) {
      throw new DevPatchError(`Đường dẫn module vượt phạm vi cho phép: "${modName}"`, 400);
    }
    let sourceModPath = baseModPath;
    if (isBranchOverride) {
      const branchModPath = path.resolve(targetModulesDir, `${modName}.json`);
      if (!branchModPath.startsWith(targetModulesDir + path.sep)) {
        throw new DevPatchError(`Đường dẫn module nhánh vượt phạm vi cho phép: "${modName}"`, 400);
      }
      if (fs.existsSync(branchModPath)) {
        sourceModPath = branchModPath;
      }
    }
    modulesByFile[modName] = JSON.parse(fs.readFileSync(sourceModPath, 'utf8')) as FlowModuleFile;
  }

  const applied = applyDraftPatchesToRawFiles(manifest, modulesByFile, patches);
  if (applied.errors.length > 0) {
    throw new DevPatchError(applied.errors[0], 400, applied.errors);
  }

  const reportedChangedFiles: string[] = [];
  for (const relFile of applied.changedFiles) {
    if (relFile === 'app.json') {
      writeFileAtomic(targetManifestPath, JSON.stringify(applied.manifest, null, 2) + '\n');
      reportedChangedFiles.push(
        isBranchOverride ? `branches/${cleanBranchId}/app.json` : 'app.json',
      );
      continue;
    }
    const match = /^modules\/([a-z0-9-]+)\.json$/i.exec(relFile);
    if (!match || !whitelistedModules.has(match[1])) {
      throw new DevPatchError(`File đích không nằm trong danh sách cho phép: "${relFile}"`, 400);
    }
    const modName = match[1];
    const targetPath = path.resolve(targetModulesDir, `${modName}.json`);
    if (!targetPath.startsWith(targetModulesDir + path.sep)) {
      throw new DevPatchError(`Đường dẫn ghi file không hợp lệ: "${relFile}"`, 400);
    }
    const modContent = applied.modulesByFile[modName];
    if (!modContent) {
      throw new DevPatchError(`Thiếu dữ liệu module "${modName}" để ghi.`, 400);
    }
    writeFileAtomic(targetPath, JSON.stringify(modContent, null, 2) + '\n');
    reportedChangedFiles.push(
      isBranchOverride
        ? `branches/${cleanBranchId}/modules/${modName}.json`
        : `modules/${modName}.json`,
    );
  }

  return {
    ok: true,
    changedFiles: reportedChangedFiles,
    appliedCount: patches.length,
  };
}

export function flowDataPlugin(buildTarget: 'public' | 'internal'): Plugin {
  let resolvedConfig: ResolvedConfig;
  let techOnlyMedia: string[] = [];

  const invalidateFlowModules = (server: ViteDevServer) => {
    for (const id of [RESOLVED_VIRTUAL_ID, RESOLVED_VIRTUAL_BRANCHES_ID]) {
      const mod = server.moduleGraph.getModuleById(id);
      if (mod) {
        server.moduleGraph.invalidateModule(mod);
      }
    }
    for (const [id, mod] of server.moduleGraph.idToModuleMap.entries()) {
      if (id.startsWith(RESOLVED_VIRTUAL_BRANCH_PREFIX)) {
        server.moduleGraph.invalidateModule(mod);
      }
    }
  };

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
            capabilities: {
              hostFetchProxy: true,
              gitInspect: true,
              mediaUpload: true,
              gitSnapshot: true,
              sourcePeek: true,
              gitStatus: true,
            },
            vbotWork: {
              configured: Boolean(resolveVbotWorkAuthHeader(resolvedConfig.root)),
              projectName: DEFAULT_VBOT_WORK_PROJECT_NAME,
              projectSlug: DEFAULT_VBOT_WORK_PROJECT_SLUG,
              assigneeName: DEFAULT_VBOT_WORK_ASSIGNEE_NAME,
            },
          }),
        );
      });

      registerDevWorkspaceMiddleware(server, resolvedConfig.root, () => {
        invalidateFlowModules(server);
        const merged = loadMergedDataset(resolvedConfig.root);
        return collectExistingMediaPaths(resolvedConfig.root, merged);
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
            const rawBranchId =
              !Array.isArray(parsedBody) && parsedBody && typeof parsedBody === 'object'
                ? (parsedBody as { branchId?: unknown }).branchId
                : undefined;
            const branchId = typeof rawBranchId === 'string' ? rawBranchId : undefined;
            const result = applyDevPatchesToDisk(resolvedConfig.root, rawPatches, branchId);

            invalidateFlowModules(server);

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
      if (id === VIRTUAL_BRANCHES_ID) return RESOLVED_VIRTUAL_BRANCHES_ID;
      if (id.startsWith(VIRTUAL_BRANCH_PREFIX) && buildTarget === 'internal') {
        const branchId = id.slice(VIRTUAL_BRANCH_PREFIX.length);
        if (SAFE_BRANCH_ID_RE.test(branchId)) {
          return '\0' + id;
        }
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_BRANCHES_ID) {
        if (buildTarget === 'public') {
          return [
            "export const defaultBranchId = '';",
            'export const branches = [];',
            'export async function loadBranchDataset() {',
            "  throw new Error('Branch switching is disabled in public build');",
            '}',
          ].join('\n');
        }
        const branches = listAvailableBranches(resolvedConfig.root);
        const defaultBranchId = branches[0]?.id ?? 'Nam-dev';
        const cases = branches
          .map((b) => {
            const importTarget =
              b.id === defaultBranchId ? VIRTUAL_ID : `${VIRTUAL_BRANCH_PREFIX}${b.id}`;
            return `    case ${JSON.stringify(b.id)}:\n      return (await import(${JSON.stringify(importTarget)})).default;`;
          })
          .join('\n');
        return [
          `export const defaultBranchId = ${JSON.stringify(defaultBranchId)};`,
          `export const branches = ${JSON.stringify(branches)};`,
          'export async function loadBranchDataset(branchId) {',
          '  switch (branchId) {',
          cases,
          '    default:',
          '      throw new Error(`Unknown branch: ${branchId}`);',
          '  }',
          '}',
        ].join('\n');
      }

      if (id.startsWith(RESOLVED_VIRTUAL_BRANCH_PREFIX)) {
        if (buildTarget !== 'internal') return;
        const branchId = id.slice(RESOLVED_VIRTUAL_BRANCH_PREFIX.length);
        const merged = loadMergedDatasetForBranch(resolvedConfig.root, branchId);
        const existingMediaPaths = collectExistingMediaPaths(resolvedConfig.root, merged);
        const payload: MergedFlowDataset = {
          ...merged,
          hasRealMedia: existingMediaPaths.length > 0,
          existingMediaPaths,
          sourceFileMap: merged.sourceFileMap,
        };
        return `export default ${JSON.stringify(payload)};`;
      }

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
        invalidateFlowModules(server);
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
