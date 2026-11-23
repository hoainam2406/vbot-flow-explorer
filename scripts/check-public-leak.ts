// scripts/check-public-leak.ts
import fs from 'node:fs';
import path from 'node:path';
import { scanTextForPublicLeaks } from '../src/core/auditSyncEngine';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const targetDir = path.resolve(
  process.cwd(),
  dirIdx >= 0 && dirIdx + 1 < args.length ? args[dirIdx + 1] : 'dist-public',
);

if (!fs.existsSync(targetDir)) {
  console.error(`❌ Không tìm thấy thư mục build public: ${targetDir}`);
  process.exit(1);
}

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.css', '.json']);
const findings: Array<{ file: string; tokens: string[] }> = [];

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const content = fs.readFileSync(full, 'utf8');
      const hits = scanTextForPublicLeaks(content);
      if (hits.length > 0) {
        findings.push({
          file: path.relative(targetDir, full),
          tokens: hits,
        });
      }
    }
  }
}

walk(targetDir);

if (findings.length > 0) {
  console.error('❌ PHÁT HIỆN RÒ RỈ DỮ LIỆU NỘI BỘ TRONG BẢN PUBLIC:');
  for (const f of findings) {
    console.error(`  - ${f.file}: ${f.tokens.join(', ')}`);
  }
  process.exit(1);
}

console.log('✅ CLEAN_PUBLIC_BUNDLE — Không phát hiện thuật ngữ hay metadata kỹ thuật nội bộ.');
