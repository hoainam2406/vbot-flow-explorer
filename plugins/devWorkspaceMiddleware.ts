// plugins/devWorkspaceMiddleware.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import { z } from 'zod';
import { mergeDataset } from '../src/core/graphEngine';
import type { AppManifest, FlowModuleFile, MergedFlowDataset } from '../src/data/schema';

export class DevMiddlewareError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024;
const MAX_GIT_INSPECT_BODY_BYTES = 256 * 1024;
const MAX_GIT_SNAPSHOT_BODY_BYTES = 64 * 1024;
const MAX_MEDIA_UPLOAD_RAW_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_UPLOAD_BODY_BYTES = 14 * 1024 * 1024;

const ALLOWED_MEDIA_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.mp4', '.webm']);
const SAFE_MODULE_NAME_RE = /^[a-z0-9-]+$/i;
const SAFE_GIT_REF_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/@~^-]{0,119}$/;

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  // IPv6 loopback, link-local, unique local, IPv4-mapped
  if (host.includes(':')) {
    if (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('::ffff:')
    ) {
      const v4Suffix = host.startsWith('::ffff:') ? host.slice('::ffff:'.length) : '';
      if (!v4Suffix || isPrivateOrLocalHostname(v4Suffix)) {
        return true;
      }
      return false;
    }
    return false;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4Match) return false;
  const octets = ipv4Match.slice(1).map((n) => Number(n));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isAllowedProxyUrl(
  rawUrl: string,
  extraAllowedOrigins: readonly string[] = [],
): { ok: true; url: URL } | { ok: false; reason: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, reason: 'URL đích không được để trống.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'URL proxy không đúng định dạng.' };
  }

  const proto = parsed.protocol.toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') {
    return { ok: false, reason: 'Chỉ hỗ trợ giao thức http/https.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Không cho phép nhúng username/password trong URL.' };
  }

  const allowedOriginSet = new Set<string>();
  for (const originCandidate of extraAllowedOrigins) {
    const cleaned = originCandidate.trim();
    if (!cleaned) continue;
    try {
      const originUrl = new URL(cleaned);
      if (originUrl.protocol === 'http:' || originUrl.protocol === 'https:') {
        allowedOriginSet.add(originUrl.origin);
      }
    } catch {
      // Bỏ qua origin không hợp lệ
    }
  }

  const explicitlyAllowed = allowedOriginSet.has(parsed.origin);
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    if (!explicitlyAllowed) {
      return {
        ok: false,
        reason: 'Chặn truy cập địa chỉ nội bộ/localhost nếu chưa khai báo rõ trong Allowed Origins.',
      };
    }
    return { ok: true, url: parsed };
  }

  if (explicitlyAllowed) {
    return { ok: true, url: parsed };
  }

  const hostLower = parsed.hostname.toLowerCase();
  const isVbotDomain =
    proto === 'https:' && (/(^|\.)vbot\.vn$/i.test(hostLower) || /(^|\.)vpmedia\.vn$/i.test(hostLower));
  if (isVbotDomain) {
    return { ok: true, url: parsed };
  }

  return {
    ok: false,
    reason: `Domain "${parsed.hostname}" chưa nằm trong allowlist (*.vbot.vn, *.vpmedia.vn hoặc Allowed Origins).`,
  };
}

export function validateGitRef(ref: string): boolean {
  const trimmed = ref.trim();
  if (!trimmed || trimmed.startsWith('-')) return false;
  if (trimmed.includes('..') || trimmed.includes('@{') || trimmed.includes('\\') || /\s/.test(trimmed)) {
    return false;
  }
  return SAFE_GIT_REF_RE.test(trimmed);
}

function runGit(repoPath: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function assertValidGitRepo(repoPath: string): string {
  const resolved = path.resolve(repoPath.trim());
  if (!resolved || !fs.existsSync(resolved)) {
    throw new DevMiddlewareError(`Không tìm thấy thư mục repo: "${repoPath}"`, 400);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new DevMiddlewareError(`Đường dẫn không phải thư mục: "${repoPath}"`, 400);
  }
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    throw new DevMiddlewareError(`Thư mục chưa khởi tạo git (.git): "${repoPath}"`, 400);
  }
  return resolved;
}

function parsePorcelainLine(line: string): string | null {
  if (!line || line.length < 4) return null;
  let pathPart = line.slice(3).trim();
  if (!pathPart) return null;
  const renameIdx = pathPart.indexOf(' -> ');
  if (renameIdx >= 0) {
    pathPart = pathPart.slice(renameIdx + 4).trim();
  }
  if (pathPart.startsWith('"') && pathPart.endsWith('"')) {
    pathPart = pathPart.slice(1, -1);
  }
  return pathPart.replace(/\\/g, '/');
}

function buildCodeRefCandidates(rawRef: string, platform?: 'ios' | 'android'): string[] {
  const normalized = rawRef.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const candidates = new Set<string>();
  if (normalized) candidates.add(normalized);
  if (platform === 'android' || normalized.startsWith('VBot-Android/')) {
    candidates.add(normalized.replace(/^VBot-Android\//, ''));
  }
  if (platform === 'ios' || normalized.startsWith('VBot-iOS/')) {
    candidates.add(normalized.replace(/^VBot-iOS\//, ''));
  }
  return [...candidates].filter(Boolean);
}

export function inspectLocalGitRepo(options: {
  repoPath: string;
  mode: 'diff' | 'drift';
  baseRef?: string;
  codeRefs?: string[];
  platform?: 'ios' | 'android';
}):
  | { ok: true; mode: 'diff'; branch: string; changedFiles: string[] }
  | {
      ok: true;
      mode: 'drift';
      branch: string;
      files: Record<string, { exists: boolean; lastCommitDate?: string }>;
    } {
  const repoRoot = assertValidGitRepo(options.repoPath);

  let branch = 'HEAD';
  try {
    branch = runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim() || 'HEAD';
  } catch {
    branch = 'HEAD';
  }

  if (options.mode === 'diff') {
    const fileSet = new Set<string>();
    const baseRef = options.baseRef?.trim();
    if (baseRef) {
      if (!validateGitRef(baseRef)) {
        throw new DevMiddlewareError(`Git ref không hợp lệ: "${baseRef}"`, 400);
      }
      let diffOut = '';
      try {
        diffOut = runGit(repoRoot, ['diff', '--name-only', `${baseRef}...HEAD`]);
      } catch {
        try {
          diffOut = runGit(repoRoot, ['diff', '--name-only', baseRef]);
        } catch (err) {
          throw new DevMiddlewareError(
            `Không thể chạy git diff với ref "${baseRef}": ${err instanceof Error ? err.message : 'lỗi git'}`,
            400,
          );
        }
      }
      for (const line of diffOut.split(/\r?\n/)) {
        const clean = line.trim().replace(/\\/g, '/');
        if (clean) fileSet.add(clean);
      }
    }

    try {
      const statusOut = runGit(repoRoot, ['status', '--porcelain']);
      for (const line of statusOut.split(/\r?\n/)) {
        const parsed = parsePorcelainLine(line);
        if (parsed) fileSet.add(parsed);
      }
    } catch {
      // Bỏ qua nếu repo bare hoặc không có working tree
    }

    const prefix =
      options.platform === 'android'
        ? 'VBot-Android/'
        : options.platform === 'ios'
          ? ''
          : '';
    const changedFiles = [...fileSet]
      .sort()
      .map((f) => (prefix && !f.startsWith(prefix) && !f.startsWith('vb-ma-') ? `${prefix}${f}` : f));

    return {
      ok: true,
      mode: 'diff',
      branch,
      changedFiles,
    };
  }

  const latestDateByRel = new Map<string, string>();
  try {
    const logOut = runGit(repoRoot, ['log', '-n', '250', '--name-only', '--format=COMMIT:%cs']);
    let currentDate = '';
    for (const rawLine of logOut.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('COMMIT:')) {
        currentDate = line.slice('COMMIT:'.length).trim();
        continue;
      }
      const norm = line.replace(/\\/g, '/');
      if (currentDate && !latestDateByRel.has(norm)) {
        latestDateByRel.set(norm, currentDate);
      }
    }
  } catch {
    // Repo mới chưa có commit
  }

  const files: Record<string, { exists: boolean; lastCommitDate?: string }> = {};
  for (const rawRef of options.codeRefs ?? []) {
    const candidates = buildCodeRefCandidates(rawRef, options.platform);
    let exists = false;
    let lastCommitDate: string | undefined;

    for (const rel of candidates) {
      const resolved = path.resolve(repoRoot, rel);
      if (resolved.startsWith(repoRoot + path.sep) && fs.existsSync(resolved)) {
        exists = true;
      }
      const commitDate = latestDateByRel.get(rel);
      if (commitDate && (!lastCommitDate || commitDate > lastCommitDate)) {
        lastCommitDate = commitDate;
      }
    }

    files[rawRef] = {
      exists,
      ...(lastCommitDate ? { lastCommitDate } : {}),
    };
  }

  return {
    ok: true,
    mode: 'drift',
    branch,
    files,
  };
}

export function listRecentDatasetCommits(
  rootDir: string,
  limit = 15,
): Array<{ hash: string; date: string; subject: string }> {
  try {
    const out = runGit(rootDir, [
      'log',
      '-n',
      String(Math.min(Math.max(limit, 1), 30)),
      '--format=%h|%cs|%s',
      '--',
      'data/',
    ]);
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [hash = '', date = '', ...rest] = line.split('|');
        return { hash, date, subject: rest.join('|') };
      })
      .filter((item) => Boolean(item.hash));
  } catch {
    return [];
  }
}

export function readDatasetSnapshotFromGit(
  rootDir: string,
  gitRef: string,
): { ok: true; ref: string; commitDate?: string; dataset: MergedFlowDataset } {
  const cleanRef = gitRef.trim();
  if (!validateGitRef(cleanRef)) {
    throw new DevMiddlewareError(`Git ref không hợp lệ: "${gitRef}"`, 400);
  }

  let manifestRaw: string;
  try {
    manifestRaw = runGit(rootDir, ['show', `${cleanRef}:data/app.json`]);
  } catch (err) {
    throw new DevMiddlewareError(
      `Không đọc được data/app.json tại ref "${cleanRef}": ${err instanceof Error ? err.message : 'lỗi git'}`,
      404,
    );
  }

  const manifest = JSON.parse(manifestRaw) as AppManifest;
  const modules: FlowModuleFile[] = [];
  for (const modName of manifest.moduleFiles) {
    if (!SAFE_MODULE_NAME_RE.test(modName)) {
      throw new DevMiddlewareError(`Tên module không hợp lệ: "${modName}"`, 400);
    }
    try {
      const modRaw = runGit(rootDir, ['show', `${cleanRef}:data/modules/${modName}.json`]);
      modules.push(JSON.parse(modRaw) as FlowModuleFile);
    } catch (err) {
      throw new DevMiddlewareError(
        `Không đọc được data/modules/${modName}.json tại ref "${cleanRef}": ${err instanceof Error ? err.message : 'lỗi git'}`,
        404,
      );
    }
  }

  let commitDate: string | undefined;
  try {
    commitDate = runGit(rootDir, ['show', '-s', '--format=%cs', cleanRef]).trim() || undefined;
  } catch {
    commitDate = undefined;
  }

  return {
    ok: true,
    ref: cleanRef,
    ...(commitDate ? { commitDate } : {}),
    dataset: mergeDataset(manifest, modules),
  };
}

function writeBufferAtomic(targetPath: string, data: Buffer): void {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    throw err;
  }
}

function isWebpBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function isPngOrJpegBuffer(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return isPng || isJpeg;
}

export function saveUploadedMediaFile(
  rootDir: string,
  input: { targetSrc: string; dataBase64: string; mimeType?: string },
): { ok: true; src: string; bytes: number; convertedWithCwebp: boolean } {
  const normalizedInput = input.targetSrc.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedInput.startsWith('media/')) {
    throw new DevMiddlewareError('Đường dẫn media phải nằm trong /media/.', 400);
  }

  const mediaRoot = path.resolve(rootDir, 'public', 'media');
  const targetAbs = path.resolve(rootDir, 'public', normalizedInput);
  if (!targetAbs.startsWith(mediaRoot + path.sep)) {
    throw new DevMiddlewareError('Đường dẫn lưu media vượt phạm vi public/media/.', 400);
  }

  const ext = path.extname(targetAbs).toLowerCase();
  if (!ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
    throw new DevMiddlewareError(`Định dạng media không được hỗ trợ: "${ext}"`, 400);
  }

  const strippedBase64 = input.dataBase64
    .trim()
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s+/g, '');
  if (!strippedBase64) {
    throw new DevMiddlewareError('Nội dung file media trống.', 400);
  }

  const buffer = Buffer.from(strippedBase64, 'base64');
  if (buffer.byteLength === 0) {
    throw new DevMiddlewareError('Dữ liệu base64 không hợp lệ.', 400);
  }
  if (buffer.byteLength > MAX_MEDIA_UPLOAD_RAW_BYTES) {
    throw new DevMiddlewareError('Kích thước file media vượt quá giới hạn 10MB.', 413);
  }

  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });

  let convertedWithCwebp = false;
  if (ext === '.webp' && !isWebpBuffer(buffer) && isPngOrJpegBuffer(buffer)) {
    const tmpIn = path.join(os.tmpdir(), `vbot-media-in-${process.pid}-${Date.now()}`);
    const tmpOut = `${targetAbs}.cwebp-${process.pid}-${Date.now()}.webp`;
    try {
      fs.writeFileSync(tmpIn, buffer);
      execFileSync('cwebp', ['-q', '84', tmpIn, '-o', tmpOut], {
        stdio: 'ignore',
        timeout: 15000,
      });
      if (fs.existsSync(tmpOut)) {
        fs.renameSync(tmpOut, targetAbs);
        convertedWithCwebp = true;
      }
    } catch {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } finally {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    }
  }

  if (!convertedWithCwebp) {
    writeBufferAtomic(targetAbs, buffer);
  }

  const finalStat = fs.statSync(targetAbs);
  return {
    ok: true,
    src: `/${normalizedInput}`,
    bytes: finalStat.size,
    convertedWithCwebp,
  };
}

function readJsonBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number,
  handler: (parsed: unknown) => Promise<void> | void,
): void {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let overflowed = false;

  req.on('data', (chunk: Uint8Array | string) => {
    if (overflowed) return;
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    totalBytes += buf.byteLength;
    if (totalBytes > maxBytes) {
      overflowed = true;
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Payload vượt quá giới hạn kích thước.' }));
      return;
    }
    chunks.push(buf);
  });

  req.on('end', () => {
    if (overflowed) return;
    void (async () => {
      try {
        const rawText = Buffer.concat(chunks).toString('utf8');
        const parsed = rawText ? (JSON.parse(rawText) as unknown) : {};
        await handler(parsed);
      } catch (err) {
        if (err instanceof DevMiddlewareError) {
          res.statusCode = err.statusCode;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
        const msg = err instanceof Error ? err.message : 'Lỗi xử lý yêu cầu local dev.';
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: msg }));
      }
    })();
  });
}

const ProxyInputSchema = z.object({
  url: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  allowedOrigins: z.array(z.string()).optional(),
});

const GitInspectInputSchema = z.object({
  mode: z.enum(['diff', 'drift']),
  iosRepoPath: z.string().optional(),
  androidRepoPath: z.string().optional(),
  baseRef: z.string().optional(),
  codeRefs: z.array(z.string()).optional(),
});

const GitSnapshotInputSchema = z.object({
  mode: z.enum(['snapshot', 'list_refs']).default('snapshot'),
  gitRef: z.string().optional(),
});

const MediaUploadInputSchema = z.object({
  targetSrc: z.string().min(1),
  dataBase64: z.string().min(1),
  mimeType: z.string().optional(),
});

export function registerDevWorkspaceMiddleware(
  server: ViteDevServer,
  rootDir: string,
  onMediaUpdated?: () => string[],
): void {
  server.middlewares.use('/__vbot-dev/host-fetch-proxy', (req, res, next) => {
    if (req.method !== 'POST') return next();
    readJsonBody(req, res, MAX_PROXY_BODY_BYTES, async (raw) => {
      const parsed = ProxyInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new DevMiddlewareError(parsed.error.issues[0]?.message ?? 'Yêu cầu proxy không hợp lệ.', 400);
      }

      const check = isAllowedProxyUrl(parsed.data.url, parsed.data.allowedOrigins);
      if (!check.ok) {
        throw new DevMiddlewareError(check.reason, 403);
      }

      const forwardHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.data.headers ?? {})) {
        const lower = k.toLowerCase();
        if (lower === 'authorization' || lower === 'cookie' || lower === 'host') continue;
        forwardHeaders[k] = v;
      }

      const hasBody = parsed.data.method !== 'GET' && parsed.data.body !== undefined;
      let bodyPayload: string | undefined;
      if (hasBody) {
        bodyPayload =
          typeof parsed.data.body === 'string'
            ? parsed.data.body
            : JSON.stringify(parsed.data.body);
        if (!Object.keys(forwardHeaders).some((k) => k.toLowerCase() === 'content-type')) {
          forwardHeaders['Content-Type'] = 'application/json';
        }
      }

      const resp = await fetch(check.url.toString(), {
        method: parsed.data.method,
        headers: forwardHeaders,
        ...(bodyPayload !== undefined ? { body: bodyPayload } : {}),
        signal: AbortSignal.timeout(15000),
      });

      const contentType = resp.headers.get('content-type') ?? '';
      const rawText = await resp.text();
      let data: unknown = rawText;
      if (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = rawText;
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          status: resp.status,
          url: check.url.toString(),
          headers: Object.fromEntries(resp.headers.entries()),
          data,
        }),
      );
    });
  });

  server.middlewares.use('/__vbot-dev/git/inspect', (req, res, next) => {
    if (req.method !== 'POST') return next();
    readJsonBody(req, res, MAX_GIT_INSPECT_BODY_BYTES, (raw) => {
      const parsed = GitInspectInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new DevMiddlewareError(parsed.error.issues[0]?.message ?? 'Tham số git inspect không hợp lệ.', 400);
      }

      const { mode, iosRepoPath, androidRepoPath, baseRef, codeRefs } = parsed.data;
      if (!iosRepoPath?.trim() && !androidRepoPath?.trim()) {
        throw new DevMiddlewareError(
          'Chưa cấu hình đường dẫn local VBot-iOS hoặc VBot-Android trong Cài đặt Dev.',
          400,
        );
      }

      if (mode === 'diff') {
        const changedSet = new Set<string>();
        const branches: Record<string, string> = {};
        if (iosRepoPath?.trim()) {
          const iosRes = inspectLocalGitRepo({
            repoPath: iosRepoPath,
            mode: 'diff',
            baseRef,
            platform: 'ios',
          });
          if (iosRes.mode === 'diff') {
            branches.ios = iosRes.branch;
            iosRes.changedFiles.forEach((f) => changedSet.add(f));
          }
        }
        if (androidRepoPath?.trim()) {
          const andRes = inspectLocalGitRepo({
            repoPath: androidRepoPath,
            mode: 'diff',
            baseRef,
            platform: 'android',
          });
          if (andRes.mode === 'diff') {
            branches.android = andRes.branch;
            andRes.changedFiles.forEach((f) => changedSet.add(f));
          }
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            mode: 'diff',
            branches,
            changedFiles: [...changedSet].sort(),
          }),
        );
        return;
      }

      const mergedFiles: Record<string, { exists: boolean; lastCommitDate?: string }> = {};
      const branches: Record<string, string> = {};
      const allRefs = codeRefs ?? [];
      const iosRefs = allRefs.filter(
        (r) =>
          !r.startsWith('VBot-Android/') &&
          !r.startsWith('vb-ma-android-sdk/') &&
          !/\.(kt|java|xml|gradle)(\b|$)/i.test(r),
      );
      const androidRefs = allRefs.filter((r) => !iosRefs.includes(r));

      if (iosRepoPath?.trim() && iosRefs.length > 0) {
        const iosRes = inspectLocalGitRepo({
          repoPath: iosRepoPath,
          mode: 'drift',
          codeRefs: iosRefs,
          platform: 'ios',
        });
        if (iosRes.mode === 'drift') {
          branches.ios = iosRes.branch;
          Object.assign(mergedFiles, iosRes.files);
        }
      }
      if (androidRepoPath?.trim() && androidRefs.length > 0) {
        const andRes = inspectLocalGitRepo({
          repoPath: androidRepoPath,
          mode: 'drift',
          codeRefs: androidRefs,
          platform: 'android',
        });
        if (andRes.mode === 'drift') {
          branches.android = andRes.branch;
          Object.assign(mergedFiles, andRes.files);
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          mode: 'drift',
          branches,
          files: mergedFiles,
        }),
      );
    });
  });

  server.middlewares.use('/__vbot-dev/git/dataset-snapshot', (req, res, next) => {
    if (req.method !== 'POST') return next();
    readJsonBody(req, res, MAX_GIT_SNAPSHOT_BODY_BYTES, (raw) => {
      const parsed = GitSnapshotInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new DevMiddlewareError('Tham số snapshot không hợp lệ.', 400);
      }

      if (parsed.data.mode === 'list_refs') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, commits: listRecentDatasetCommits(rootDir) }));
        return;
      }

      if (!parsed.data.gitRef?.trim()) {
        throw new DevMiddlewareError('Thiếu gitRef cần đọc snapshot.', 400);
      }

      const snap = readDatasetSnapshotFromGit(rootDir, parsed.data.gitRef);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(snap));
    });
  });

  server.middlewares.use('/__vbot-dev/media/upload', (req, res, next) => {
    if (req.method !== 'POST') return next();
    readJsonBody(req, res, MAX_MEDIA_UPLOAD_BODY_BYTES, (raw) => {
      const parsed = MediaUploadInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new DevMiddlewareError(parsed.error.issues[0]?.message ?? 'Dữ liệu upload media không hợp lệ.', 400);
      }

      const result = saveUploadedMediaFile(rootDir, parsed.data);
      const existingMediaPaths = onMediaUpdated ? onMediaUpdated() : [];
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ...result, existingMediaPaths }));
    });
  });
}
