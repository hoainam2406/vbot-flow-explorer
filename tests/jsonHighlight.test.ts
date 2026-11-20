// tests/jsonHighlight.test.ts
import { describe, expect, it } from 'vitest';
import { detectCodeRefLanguage, escapeHtml, highlightJson } from '../src/core/jsonHighlight';

describe('jsonHighlight', () => {
  it('highlights JSON keys, strings, numbers, booleans, and null accurately', () => {
    const raw = JSON.stringify(
      {
        call_id: 'abc-123',
        retries: 3,
        active: true,
        failed: false,
        note: null,
      },
      null,
      2,
    );
    const html = highlightJson(raw);
    expect(html).toContain('<span class="text-sky-300">&quot;call_id&quot;</span>');
    expect(html).toContain('<span class="text-emerald-300">&quot;abc-123&quot;</span>');
    expect(html).toContain('<span class="text-amber-300">3</span>');
    expect(html).toContain('<span class="text-violet-300 font-medium">true</span>');
    expect(html).toContain('<span class="text-violet-300 font-medium">false</span>');
    expect(html).toContain('<span class="text-rose-300 italic">null</span>');
  });

  it('escapes HTML characters inside strings and plain text to prevent XSS', () => {
    const raw = '{"msg": "<script>alert(1)</script> & \'quote\'"}';
    const html = highlightJson(raw);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#39;quote&#39;');
    expect(escapeHtml('<img src=x>')).toBe('&lt;img src=x&gt;');
  });

  it('detects programming language badges from code reference filenames', () => {
    expect(detectCodeRefLanguage('VBotPhone/TwoFactorSessionManager.swift:120')?.label).toBe('Swift');
    expect(detectCodeRefLanguage('app/CallService.kt#L45')?.label).toBe('Kotlin');
    expect(detectCodeRefLanguage('src/core/graphEngine.ts')?.label).toBe('TS');
    expect(detectCodeRefLanguage('src/App.vue')?.label).toBe('Vue');
    expect(detectCodeRefLanguage('General description without file ext')).toBeNull();
  });
});
