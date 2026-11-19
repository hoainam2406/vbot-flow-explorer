// scripts/validate-data.ts
import fs from 'node:fs';
import path from 'node:path';
import { validateDataset } from '../src/data/validateDataset';

const dataDir = path.resolve(process.cwd(), 'data');
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'app.json'), 'utf8'));
const modules = (manifest.moduleFiles as string[]).map((name) =>
  JSON.parse(fs.readFileSync(path.join(dataDir, 'modules', `${name}.json`), 'utf8')),
);
const errors = validateDataset(manifest, modules);
if (errors.length > 0) {
  console.error('❌ Data validation failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('✅ All flow data JSON files are valid.');
