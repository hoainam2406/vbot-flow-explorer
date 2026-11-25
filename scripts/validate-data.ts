// scripts/validate-data.ts
import {
  listAvailableBranches,
  loadMergedDatasetForBranch,
} from '../plugins/flowDataPlugin';

const rootDir = process.cwd();
const branches = listAvailableBranches(rootDir);
let hasError = false;

for (const branch of branches) {
  try {
    const merged = loadMergedDatasetForBranch(rootDir, branch.id);
    const branchCount = merged.branches.length;
    const subtreeCount = Object.keys(merged.subtreesByParentId).length;
    console.log(
      `✅ [${branch.id}] Flow dataset hợp lệ (${branchCount} nhánh chính, ${subtreeCount} subtree).`,
    );
  } catch (err) {
    hasError = true;
    console.error(
      `❌ [${branch.id}] Data validation failed:\n  - ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

if (hasError) {
  process.exit(1);
}
