// tests/devWorkspaceMiddleware.test.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DevMiddlewareError,
  inspectLocalGitRepo,
  inspectLocalGitStatus,
  isAllowedProxyUrl,
  listRecentDatasetCommits,
  readDatasetSnapshotFromGit,
  readLocalSourceFile,
  saveUploadedMediaFile,
  validateGitRef,
} from '../plugins/devWorkspaceMiddleware';

describe('devWorkspaceMiddleware security & helpers', () => {
  it('validates proxy URLs against SSRF and allowlist', () => {
    expect(isAllowedProxyUrl('https://api-dev.vbot.vn/v1/customers').ok).toBe(true);
    expect(isAllowedProxyUrl('https://work.vpmedia.vn/api/health').ok).toBe(true);
    expect(
      isAllowedProxyUrl('http://127.0.0.1:4000/api/test', ['http://127.0.0.1:4000']).ok,
    ).toBe(true);

    expect(isAllowedProxyUrl('http://169.254.169.254/latest/meta-data').ok).toBe(false);
    expect(isAllowedProxyUrl('http://127.0.0.1:8080/internal').ok).toBe(false);
    expect(isAllowedProxyUrl('http://10.0.0.5/admin').ok).toBe(false);
    expect(isAllowedProxyUrl('http://[::1]:3000/').ok).toBe(false);
    expect(isAllowedProxyUrl('file:///etc/passwd').ok).toBe(false);
    expect(isAllowedProxyUrl('https://evil.com/steal').ok).toBe(false);
    expect(isAllowedProxyUrl('https://user:pass@api-dev.vbot.vn/').ok).toBe(false);
  });

  it('validates git refs and blocks flag injection', () => {
    expect(validateGitRef('Nam-dev')).toBe(true);
    expect(validateGitRef('HEAD~1')).toBe(true);
    expect(validateGitRef('origin/main')).toBe(true);
    expect(validateGitRef('v2.4.0')).toBe(true);

    expect(validateGitRef('--upload-pack=sh')).toBe(false);
    expect(validateGitRef('-n')).toBe(false);
    expect(validateGitRef('main..evil')).toBe(false);
    expect(validateGitRef('HEAD;rm -rf /')).toBe(false);
    expect(validateGitRef('')).toBe(false);
  });

  it('saves uploaded media files safely inside public/media and rejects traversal', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-upload-media-'));
    try {
      const tinyWebp = Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8 ', 'binary').toString('base64');
      const saved = saveUploadedMediaFile(tmpRoot, {
        targetSrc: '/media/test/sample.webp',
        dataBase64: `data:image/webp;base64,${tinyWebp}`,
      });
      expect(saved.ok).toBe(true);
      expect(saved.src).toBe('/media/test/sample.webp');
      expect(
        fs.existsSync(path.join(tmpRoot, 'public', 'media', 'test', 'sample.webp')),
      ).toBe(true);

      expect(() =>
        saveUploadedMediaFile(tmpRoot, {
          targetSrc: '/media/../../etc/passwd.webp',
          dataBase64: tinyWebp,
        }),
      ).toThrowError(DevMiddlewareError);

      expect(() =>
        saveUploadedMediaFile(tmpRoot, {
          targetSrc: '/media/test/bad.svg',
          dataBase64: tinyWebp,
        }),
      ).toThrowError(DevMiddlewareError);

      const overLimit = Buffer.alloc(10 * 1024 * 1024 + 8).toString('base64');
      expect(() =>
        saveUploadedMediaFile(tmpRoot, {
          targetSrc: '/media/test/huge.webp',
          dataBase64: overLimit,
        }),
      ).toThrowError(DevMiddlewareError);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('inspects a local git repository for diff and code drift', () => {
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-git-inspect-'));
    try {
      execFileSync('git', ['init'], { cwd: tmpRepo, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'test@vbot.vn'], { cwd: tmpRepo });
      execFileSync('git', ['config', 'user.name', 'Test Dev'], { cwd: tmpRepo });

      fs.mkdirSync(path.join(tmpRepo, 'VBot', 'Service'), { recursive: true });
      fs.writeFileSync(path.join(tmpRepo, 'VBot', 'Service', 'MiniAppService.swift'), '// v1\n');
      execFileSync('git', ['add', '.'], { cwd: tmpRepo });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpRepo, stdio: 'ignore' });

      // Modify file in working tree
      fs.writeFileSync(path.join(tmpRepo, 'VBot', 'Service', 'MiniAppService.swift'), '// v2\n');

      const diffRes = inspectLocalGitRepo({
        repoPath: tmpRepo,
        mode: 'diff',
        platform: 'ios',
      });
      expect(diffRes.ok).toBe(true);
      if (diffRes.mode === 'diff') {
        expect(diffRes.changedFiles).toContain('VBot/Service/MiniAppService.swift');
      }

      const driftRes = inspectLocalGitRepo({
        repoPath: tmpRepo,
        mode: 'drift',
        platform: 'ios',
        codeRefs: ['VBot/Service/MiniAppService.swift', 'VBot/Service/DeletedFile.swift'],
      });
      expect(driftRes.ok).toBe(true);
      if (driftRes.mode === 'drift') {
        expect(driftRes.files['VBot/Service/MiniAppService.swift']?.exists).toBe(true);
        expect(driftRes.files['VBot/Service/MiniAppService.swift']?.lastCommitDate).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
        expect(driftRes.files['VBot/Service/DeletedFile.swift']?.exists).toBe(false);
      }
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('reads dataset snapshot from HEAD of current repo', () => {
    const repoRoot = process.cwd();
    const commits = listRecentDatasetCommits(repoRoot, 5);
    expect(commits.length).toBeGreaterThan(0);

    const snap = readDatasetSnapshotFromGit(repoRoot, 'HEAD');
    expect(snap.ok).toBe(true);
    expect(snap.dataset.rootNode.id).toBe('vbot-app');
    expect(snap.dataset.branches.length).toBeGreaterThan(0);

    expect(() => readDatasetSnapshotFromGit(repoRoot, '--evil')).toThrowError(DevMiddlewareError);
  });

  it('reads local source files safely with symbol search, git diff, and symlink escape protection', () => {
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-src-peek-'));
    const outsideFile = path.join(os.tmpdir(), `vbot-outside-${Date.now()}.swift`);
    fs.writeFileSync(outsideFile, 'let secret = "outside"\n');

    try {
      execFileSync('git', ['init'], { cwd: tmpRepo, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'test@vbot.vn'], { cwd: tmpRepo });
      execFileSync('git', ['config', 'user.name', 'Test Dev'], { cwd: tmpRepo });

      fs.mkdirSync(path.join(tmpRepo, 'VBot', 'Call'), { recursive: true });
      const targetFile = path.join(tmpRepo, 'VBot', 'Call', 'CallSurveyHelper.swift');
      fs.writeFileSync(
        targetFile,
        ['import Foundation', '', 'final class CallSurveyHelper {', '  func surveyCall() {', '    print("ok")', '  }', '}'].join('\n'),
      );
      execFileSync('git', ['add', '.'], { cwd: tmpRepo });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpRepo, stdio: 'ignore' });

      // Modify line to verify gitDiff inclusion
      fs.writeFileSync(
        targetFile,
        ['import Foundation', '', 'final class CallSurveyHelper {', '  func surveyCall() {', '    print("updated")', '  }', '}'].join('\n'),
      );

      const readRes = readLocalSourceFile({
        repoPath: tmpRepo,
        codeRef: 'VBot/Call/CallSurveyHelper.swift',
        platform: 'ios',
        symbolQuery: 'surveyCall',
        includeGitDiff: true,
      });
      expect(readRes.ok).toBe(true);
      expect(readRes.language).toBe('swift');
      expect(readRes.primaryLine).toBe(4);
      expect(readRes.matchedLines).toContain(4);
      expect(readRes.gitDiff).toContain('print("updated")');

      // Symlink pointing outside repo must be blocked with 403
      const symlinkPath = path.join(tmpRepo, 'VBot', 'Call', 'EscapeLink.swift');
      fs.symlinkSync(outsideFile, symlinkPath);
      expect(() =>
        readLocalSourceFile({
          repoPath: tmpRepo,
          codeRef: 'VBot/Call/EscapeLink.swift',
          platform: 'ios',
        }),
      ).toThrowError(DevMiddlewareError);

      // Binary file must be rejected
      const binPath = path.join(tmpRepo, 'VBot', 'Call', 'blob.swift');
      fs.writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
      expect(() =>
        readLocalSourceFile({
          repoPath: tmpRepo,
          codeRef: 'VBot/Call/blob.swift',
          platform: 'ios',
        }),
      ).toThrowError(DevMiddlewareError);

      const statusRes = inspectLocalGitStatus({
        iosRepoPath: tmpRepo,
        androidRepoPath: '/non-existent-path-vbot-test',
      });
      expect(statusRes.ok).toBe(true);
      expect(statusRes.ios?.dirtyCount).toBeGreaterThan(0);
      expect(statusRes.ios?.changedFiles).toContain('VBot/Call/CallSurveyHelper.swift');
      expect(statusRes.android?.error).toBeTruthy();
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
      if (fs.existsSync(outsideFile)) fs.unlinkSync(outsideFile);
    }
  });
});
