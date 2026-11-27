// src/core/sourcePeekClient.ts
import { detectCodeRefPlatform, loadDevWorkspaceSettings } from './workspaceSettings';
import type { FlowNodeData, Platform } from '../data/schema';

export interface SourcePeekRequest {
  codeRef: string;
  platform?: Platform;
  symbolQuery?: string;
  includeGitDiff?: boolean;
}

export interface SourcePeekResult {
  ok: true;
  platform: Platform;
  resolvedRelPath: string;
  language: 'swift' | 'kotlin' | 'ts' | 'json' | 'text';
  totalLines: number;
  truncated: boolean;
  content: string;
  matchedLines: number[];
  primaryLine: number | null;
  gitDiff?: string;
}

export interface RepoGitStatusSummary {
  branch: string;
  dirtyCount: number;
  changedFiles: string[];
  error?: string;
}

export interface LocalGitStatusResult {
  ok: true;
  ios?: RepoGitStatusSummary;
  android?: RepoGitStatusSummary;
}

export interface SourcePeekLaunchContext {
  title?: string;
  nodeId?: string;
  iosRef?: string;
  androidRef?: string;
  iosRefs?: string[];
  androidRefs?: string[];
  symbolQuery?: string;
}

export function extractCodeRefsByPlatform(node: FlowNodeData): {
  ios: string[];
  android: string[];
} {
  const iosSet = new Set<string>(node.techDetail?.byPlatform?.ios?.codeRefs ?? []);
  const androidSet = new Set<string>(node.techDetail?.byPlatform?.android?.codeRefs ?? []);

  for (const ref of node.techDetail?.codeRefs ?? []) {
    if (detectCodeRefPlatform(ref) === 'android') {
      androidSet.add(ref);
    } else {
      iosSet.add(ref);
    }
  }

  return {
    ios: [...iosSet],
    android: [...androidSet],
  };
}

export async function fetchLocalSourceFile(
  params: SourcePeekRequest,
): Promise<{ ok: true; data: SourcePeekResult } | { ok: false; error: string }> {
  const settings = loadDevWorkspaceSettings();
  const inferredPlatform = params.platform ?? detectCodeRefPlatform(params.codeRef);
  const targetRepo =
    inferredPlatform === 'android'
      ? settings.localAndroidRepoPath.trim()
      : settings.localIosRepoPath.trim();

  if (!targetRepo) {
    return {
      ok: false,
      error: `Chưa cấu hình đường dẫn local ${inferredPlatform === 'android' ? 'VBot-Android' : 'VBot-iOS'} trong Cài đặt Dev.`,
    };
  }

  try {
    const resp = await fetch('/__vbot-dev/source/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        iosRepoPath: settings.localIosRepoPath,
        androidRepoPath: settings.localAndroidRepoPath,
        codeRef: params.codeRef,
        platform: inferredPlatform,
        symbolQuery: params.symbolQuery,
        includeGitDiff: params.includeGitDiff ?? true,
      }),
    });
    const data = (await resp.json()) as Partial<SourcePeekResult> & {
      ok?: boolean;
      error?: string;
    };
    if (!resp.ok || !data.ok || typeof data.content !== 'string') {
      return {
        ok: false,
        error: data.error ?? `Không thể đọc file (${resp.status})`,
      };
    }
    return { ok: true, data: data as SourcePeekResult };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Không kết nối được local dev middleware (cần chạy pnpm dev).',
    };
  }
}

export async function fetchLocalGitStatus(): Promise<
  { ok: true; data: LocalGitStatusResult } | { ok: false; error: string }
> {
  const settings = loadDevWorkspaceSettings();
  if (!settings.localIosRepoPath.trim() && !settings.localAndroidRepoPath.trim()) {
    return {
      ok: false,
      error: 'Chưa cấu hình đường dẫn local VBot-iOS hoặc VBot-Android.',
    };
  }
  try {
    const resp = await fetch('/__vbot-dev/git/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        iosRepoPath: settings.localIosRepoPath,
        androidRepoPath: settings.localAndroidRepoPath,
      }),
    });
    const data = (await resp.json()) as Partial<LocalGitStatusResult> & {
      ok?: boolean;
      error?: string;
    };
    if (!resp.ok || !data.ok) {
      return { ok: false, error: data.error ?? 'Không đọc được git status.' };
    }
    return { ok: true, data: data as LocalGitStatusResult };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Lỗi kết nối git status.',
    };
  }
}
