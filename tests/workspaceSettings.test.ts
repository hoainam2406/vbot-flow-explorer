// tests/workspaceSettings.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildGitWebFileUrl,
  buildIdeFileUrl,
  createDefaultDevSettings,
  detectCodeRefPlatform,
  isSafeExternalUrl,
} from '../src/core/workspaceSettings';

describe('workspaceSettings', () => {
  it('validates allowed external URL schemes and rejects dangerous schemes', () => {
    expect(isSafeExternalUrl('https://work.vpmedia.vn/projects')).toBe(true);
    expect(isSafeExternalUrl('antigravity-ide://file/Users/dev/VBot/App.swift')).toBe(true);
    expect(isSafeExternalUrl('antigravity://file/Users/dev/VBot/App.swift')).toBe(true);
    expect(isSafeExternalUrl('vscode://file/Users/dev/VBot/App.swift')).toBe(true);
    expect(isSafeExternalUrl('cursor://file/Users/dev/VBot/Main.kt')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>')).toBe(false);
  });

  it('builds IDE URLs cleanly and avoids duplicate repo folder prefixes', () => {
    expect(createDefaultDevSettings().preferredIde).toBe('antigravity-ide');

    const settings = {
      ...createDefaultDevSettings(),
      localIosRepoPath: '/Users/dev/VBot-iOS',
      localAndroidRepoPath: '/Users/dev/VBot-Android',
      preferredIde: 'cursor' as const,
    };

    expect(detectCodeRefPlatform('VBot/Service/MiniAppService.swift')).toBe('ios');
    expect(detectCodeRefPlatform('VBot-Android/app/src/main/java/MainActivity.kt')).toBe('android');

    expect(
      buildIdeFileUrl('VBot/Service/MiniAppService.swift', {
        ...settings,
        preferredIde: 'antigravity-ide',
      }),
    ).toBe('antigravity-ide://file/Users/dev/VBot-iOS/VBot/Service/MiniAppService.swift');

    expect(
      buildIdeFileUrl('VBot-Android/app/src/main/java/MainActivity.kt', {
        ...settings,
        preferredIde: 'antigravity',
      }),
    ).toBe('antigravity://file/Users/dev/VBot-Android/app/src/main/java/MainActivity.kt');

    expect(buildIdeFileUrl('VBot/Service/MiniAppService.swift', settings)).toBe(
      'cursor://file/Users/dev/VBot-iOS/VBot/Service/MiniAppService.swift',
    );
    expect(
      buildIdeFileUrl('VBot-Android/app/src/main/java/MainActivity.kt', settings),
    ).toBe('cursor://file/Users/dev/VBot-Android/app/src/main/java/MainActivity.kt');
    expect(buildIdeFileUrl('VBot/Service/MiniAppService.swift', createDefaultDevSettings())).toBeNull();
  });

  it('builds GitHub and GitLab web file URLs using branch and repoConfig', () => {
    const settings = createDefaultDevSettings();
    const repoConfig = {
      iosRepoWebUrl: 'https://github.com/vpmedia/VBot-iOS',
      androidRepoWebUrl: 'https://gitlab.vpmedia.vn/mobile/VBot-Android',
    };

    expect(
      buildGitWebFileUrl('VBot/Service/MiniAppService.swift', settings, repoConfig, 'Nam-dev'),
    ).toBe('https://github.com/vpmedia/VBot-iOS/blob/Nam-dev/VBot/Service/MiniAppService.swift');

    expect(
      buildGitWebFileUrl(
        'VBot-Android/app/src/main/java/MainActivity.kt',
        settings,
        repoConfig,
        'Nam-dev',
      ),
    ).toBe(
      'https://gitlab.vpmedia.vn/mobile/VBot-Android/-/blob/Nam-dev/app/src/main/java/MainActivity.kt',
    );
  });
});
