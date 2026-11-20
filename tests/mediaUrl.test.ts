import { describe, expect, it } from 'vitest';
import { resolveMediaUrl } from '../src/core/mediaUrl';
import { normalizeBasePath } from '../vite.config';

describe('normalizeBasePath', () => {
  it('normalizes empty, root, relative, and subpath inputs', () => {
    expect(normalizeBasePath(undefined)).toBe('/');
    expect(normalizeBasePath('')).toBe('/');
    expect(normalizeBasePath('/')).toBe('/');
    expect(normalizeBasePath('./')).toBe('./');
    expect(normalizeBasePath('/vbot-flow-explorer')).toBe('/vbot-flow-explorer/');
    expect(normalizeBasePath('/vbot-flow-explorer/')).toBe('/vbot-flow-explorer/');
    expect(normalizeBasePath('vbot-flow-explorer')).toBe('/vbot-flow-explorer/');
    expect(normalizeBasePath('  /org/subpath/  ')).toBe('/org/subpath/');
  });
});

describe('resolveMediaUrl', () => {
  it('resolves local media paths against root, subpath, and relative base URLs', () => {
    expect(resolveMediaUrl('/media/app/vbot-home.webp', '/')).toBe('/media/app/vbot-home.webp');
    expect(resolveMediaUrl('/media/app/vbot-home.webp', '/vbot-flow-explorer/')).toBe(
      '/vbot-flow-explorer/media/app/vbot-home.webp',
    );
    expect(resolveMediaUrl('/media/app/vbot-home.webp', '/vbot-flow-explorer')).toBe(
      '/vbot-flow-explorer/media/app/vbot-home.webp',
    );
    expect(resolveMediaUrl('/media/app/vbot-home.webp', './')).toBe('./media/app/vbot-home.webp');
  });

  it('preserves external, data, already-prefixed, and empty URLs', () => {
    expect(resolveMediaUrl('https://cdn.example.com/demo.webp', '/vbot-flow-explorer/')).toBe(
      'https://cdn.example.com/demo.webp',
    );
    expect(resolveMediaUrl('data:image/png;base64,AAAA', '/vbot-flow-explorer/')).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(
      resolveMediaUrl('/vbot-flow-explorer/media/app/vbot-home.webp', '/vbot-flow-explorer/'),
    ).toBe('/vbot-flow-explorer/media/app/vbot-home.webp');
    expect(resolveMediaUrl('', '/vbot-flow-explorer/')).toBe('');
  });
});
