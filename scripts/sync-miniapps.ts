// scripts/sync-miniapps.ts
import fs from 'node:fs';
import path from 'node:path';
import { diffMiniAppApiSnapshot } from '../src/core/auditSyncEngine';
import { MINI_APP_CATALOG } from '../src/data/miniAppBridgeCatalog';

const args = process.argv.slice(2);
const fileFlagIdx = args.indexOf('--file');
const filePath =
  fileFlagIdx >= 0 && fileFlagIdx + 1 < args.length
    ? args[fileFlagIdx + 1]
    : args.find((a) => !a.startsWith('-'));

if (!filePath) {
  console.error('Cách dùng: pnpm sync:miniapps --file <duong-dan-snapshot-api-apps.json>');
  process.exit(1);
}

const resolved = path.resolve(process.cwd(), filePath);
if (!fs.existsSync(resolved)) {
  console.error(`❌ Không tìm thấy file snapshot: ${resolved}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
const diff = diffMiniAppApiSnapshot(raw, MINI_APP_CATALOG);

console.log('=== Đối chiếu Snapshot /api/apps với MINI_APP_CATALOG ===');
console.log(`Khớp: ${diff.matchedCount} / ${MINI_APP_CATALOG.length} app`);

if (diff.added.length > 0) {
  console.log(`\n➕ App mới trên Production chưa có trong Catalog (${diff.added.length}):`);
  diff.added.forEach((a) => console.log(`  - ${a.id} (${a.name}) [${a.category ?? 'n/a'}]`));
}
if (diff.removed.length > 0) {
  console.log(`\n➖ App có trong Catalog nhưng không có trong Snapshot (${diff.removed.length}):`);
  diff.removed.forEach((a) => console.log(`  - ${a.id} (${a.nameVi}) [${a.category}]`));
}
if (diff.categoryChanged.length > 0) {
  console.log(`\n🔀 Đổi nhóm danh mục (${diff.categoryChanged.length}):`);
  diff.categoryChanged.forEach((c) =>
    console.log(`  - ${c.id}: "${c.catalogCategory}" → "${c.apiCategory}"`),
  );
}
if (diff.added.length === 0 && diff.removed.length === 0 && diff.categoryChanged.length === 0) {
  console.log('✅ Catalog hoàn toàn khớp với snapshot.');
}
