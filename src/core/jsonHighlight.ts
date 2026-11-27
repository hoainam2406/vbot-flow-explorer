// src/core/jsonHighlight.ts

export interface CodeRefLanguageMeta {
  label: string;
  cls: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const JSON_TOKEN_RE =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:])/g;

/**
 * Tô màu cú pháp JSON an toàn (escape HTML trước khi bọc span).
 */
export function highlightJson(raw: string): string {
  if (!raw) return '';
  let result = '';
  let lastIndex = 0;

  for (const match of raw.matchAll(JSON_TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      result += escapeHtml(raw.slice(lastIndex, idx));
    }

    const token = match[0];
    let cls = 'text-slate-400';

    if (token.startsWith('"')) {
      if (token.endsWith(':')) {
        const colonIdx = token.lastIndexOf(':');
        const keyPart = token.slice(0, colonIdx);
        const colonPart = token.slice(colonIdx);
        result += `<span class="text-sky-300">${escapeHtml(keyPart)}</span><span class="text-slate-400">${escapeHtml(colonPart)}</span>`;
        lastIndex = idx + token.length;
        continue;
      }
      cls = 'text-emerald-300';
    } else if (token === 'true' || token === 'false') {
      cls = 'text-violet-300 font-medium';
    } else if (token === 'null') {
      cls = 'text-rose-300 italic';
    } else if (/^-?\d/.test(token)) {
      cls = 'text-amber-300';
    } else {
      cls = 'text-slate-400';
    }

    result += `<span class="${cls}">${escapeHtml(token)}</span>`;
    lastIndex = idx + token.length;
  }

  if (lastIndex < raw.length) {
    result += escapeHtml(raw.slice(lastIndex));
  }

  return result;
}

const LANGUAGE_RULES: Array<{ pattern: RegExp; meta: CodeRefLanguageMeta }> = [
  {
    pattern: /\.swift(?:[:#)\s]|$)/i,
    meta: {
      label: 'Swift',
      cls: 'border-orange-300/80 bg-orange-50 text-orange-700 dark:border-orange-500/35 dark:bg-orange-500/15 dark:text-orange-300',
    },
  },
  {
    pattern: /\.kts?(?:[:#)\s]|$)/i,
    meta: {
      label: 'Kotlin',
      cls: 'border-violet-300/80 bg-violet-50 text-violet-700 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-300',
    },
  },
  {
    pattern: /\.java(?:[:#)\s]|$)/i,
    meta: {
      label: 'Java',
      cls: 'border-amber-300/80 bg-amber-50 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300',
    },
  },
  {
    pattern: /\.tsx?(?:[:#)\s]|$)/i,
    meta: {
      label: 'TS',
      cls: 'border-sky-300/80 bg-sky-50 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300',
    },
  },
  {
    pattern: /\.mjs|\.jsx?(?:[:#)\s]|$)/i,
    meta: {
      label: 'JS',
      cls: 'border-yellow-300/80 bg-yellow-50 text-yellow-800 dark:border-yellow-500/35 dark:bg-yellow-500/15 dark:text-yellow-300',
    },
  },
  {
    pattern: /\.vue(?:[:#)\s]|$)/i,
    meta: {
      label: 'Vue',
      cls: 'border-emerald-300/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
  },
];

export function detectCodeRefLanguage(refText: string): CodeRefLanguageMeta | null {
  for (const rule of LANGUAGE_RULES) {
    if (rule.pattern.test(refText)) {
      return rule.meta;
    }
  }
  return null;
}

export type SourceHighlightLang = 'swift' | 'kotlin' | 'ts' | 'json' | 'text';

const CODE_KEYWORDS = new Set([
  'import', 'package', 'class', 'struct', 'enum', 'protocol', 'interface', 'extension',
  'object', 'data', 'sealed', 'open', 'final', 'private', 'public', 'internal', 'protected',
  'fileprivate', 'override', 'func', 'fun', 'suspend', 'inline', 'var', 'let', 'val', 'const',
  'typealias', 'init', 'deinit', 'return', 'if', 'else', 'guard', 'switch', 'when', 'case',
  'default', 'for', 'while', 'in', 'try', 'catch', 'throw', 'throws', 'async', 'await',
  'true', 'false', 'nil', 'null', 'self', 'this', 'super', 'weak', 'unowned', 'companion',
]);

const CODE_LINE_TOKEN_RE =
  /(\/\/.*$|"(?:\\.|[^"\\])*"|@[A-Za-z_][A-Za-z0-9_]*|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b)/g;

/**
 * Tô màu cú pháp nhẹ, an toàn XSS cho từng dòng Swift/Kotlin/TS trong Source Peek.
 */
export function highlightCodeLine(line: string, lang: SourceHighlightLang): string {
  if (!line) return '';
  if (lang === 'json') return highlightJson(line);
  if (lang === 'text') return escapeHtml(line);

  let result = '';
  let lastIndex = 0;

  for (const match of line.matchAll(CODE_LINE_TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      result += escapeHtml(line.slice(lastIndex, idx));
    }

    const token = match[0];
    let cls = '';
    if (token.startsWith('//')) {
      cls = 'text-slate-500 italic';
    } else if (token.startsWith('"')) {
      cls = 'text-emerald-300';
    } else if (token.startsWith('@')) {
      cls = 'text-amber-300';
    } else if (/^\d/.test(token)) {
      cls = 'text-amber-300';
    } else if (CODE_KEYWORDS.has(token)) {
      cls = 'text-fuchsia-300 font-semibold';
    }

    result += cls ? `<span class="${cls}">${escapeHtml(token)}</span>` : escapeHtml(token);
    lastIndex = idx + token.length;
  }

  if (lastIndex < line.length) {
    result += escapeHtml(line.slice(lastIndex));
  }

  return result;
}
