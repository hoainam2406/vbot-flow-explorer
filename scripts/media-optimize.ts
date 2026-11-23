// scripts/media-optimize.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectExistingMediaPaths,
  loadMergedDataset,
} from '../plugins/flowDataPlugin';
import { auditMediaCoverage } from '../src/core/auditSyncEngine';

const rootDir = process.cwd();
const dataset = loadMergedDataset(rootDir);
const existing = collectExistingMediaPaths(rootDir, dataset);
const coverage = auditMediaCoverage(dataset, existing);

const args = process.argv.slice(2);
const sourceDirArg = args.find((a) => !a.startsWith('-'));

console.log('=== VBot Media Coverage & WebP Optimizer ===');
console.log(`Đã có: ${coverage.present}/${coverage.total} file trong public/media/`);

if (sourceDirArg) {
  const sourceDir = path.resolve(rootDir, sourceDirArg);
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ Không tìm thấy thư mục ảnh nguồn: ${sourceDir}`);
    process.exit(1);
  }

  let hasCwebp = true;
  try {
    execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
  } catch {
    hasCwebp = false;
  }

  if (!hasCwebp) {
    console.warn('⚠️  Chưa cài `cwebp` trên máy (macOS: `brew install webp`). Bỏ qua bước chuyển đổi.');
  } else {
    let converted = 0;
    for (const item of coverage.items) {
      const targetRel = item.src.replace(/^\/+/, '');
      const targetAbs = path.resolve(rootDir, 'public', targetRel);
      const baseName = path.basename(targetRel, path.extname(targetRel));
      for (const ext of ['.png', '.jpg', '.jpeg']) {
        const candidate = path.join(sourceDir, `${baseName}${ext}`);
        if (fs.existsSync(candidate)) {
          fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
          execFileSync('cwebp', ['-q', '84', candidate, '-o', targetAbs], { stdio: 'inherit' });
          converted += 1;
          break;
        }
      }
    }
    console.log(`✅ Đã chuyển đổi ${converted} ảnh sang .webp.`);
  }
}

const missingItems = coverage.items.filter((i) => !i.exists);
if (missingItems.length > 0) {
  console.log(`\n📸 Danh sách ${missingItems.length} file media chưa có:`);
  for (const m of missingItems) {
    console.log(`  - public${m.src}  (${m.nodeId} · ${m.audience}): ${m.caption}`);
  }
}
