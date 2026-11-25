// scripts/audit-sync.ts
import fs from 'node:fs';
import path from 'node:path';
import {
  collectExistingMediaPaths,
  listAvailableBranches,
  loadMergedDatasetForBranch,
} from '../plugins/flowDataPlugin';
import {
  auditCodeRefs,
  auditMediaCoverage,
  auditMiniAppConsistency,
} from '../src/core/auditSyncEngine';
import { ALL_SANDBOX_COMMANDS } from '../src/core/miniAppContractBuilder';
import {
  CORE_BRIDGE_SPECS,
  MINI_APP_CATALOG,
} from '../src/data/miniAppBridgeCatalog';
import { MINI_APP_PERMISSION_PROFILES } from '../src/data/miniAppPermissionMatrix';

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const prefixed = args.find((a) => a.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

const args = process.argv.slice(2);
const isJson = args.includes('--json');
const strictRefs = args.includes('--strict-refs');
const requestedBranch = getArgValue(args, '--branch');
const iosDir = getArgValue(args, '--ios-dir') ?? process.env.VBOT_IOS_DIR;
const androidDir = getArgValue(args, '--android-dir') ?? process.env.VBOT_ANDROID_DIR;

const rootDir = process.cwd();
const availableBranches = listAvailableBranches(rootDir);
if (requestedBranch && !availableBranches.some((b) => b.id === requestedBranch)) {
  console.error(
    `❌ Không tìm thấy nhánh "${requestedBranch}". Các nhánh hợp lệ: ${availableBranches.map((b) => b.id).join(', ')}`,
  );
  process.exit(1);
}

const targetBranchIds = requestedBranch
  ? [requestedBranch]
  : availableBranches.map((b) => b.id);

const reports = targetBranchIds.map((branchId) => {
  const dataset = loadMergedDatasetForBranch(rootDir, branchId);
  const existingMedia = collectExistingMediaPaths(rootDir, dataset);

  const miniAppReport = auditMiniAppConsistency(
    dataset,
    MINI_APP_CATALOG,
    MINI_APP_PERMISSION_PROFILES,
    ALL_SANDBOX_COMMANDS,
    CORE_BRIDGE_SPECS,
  );
  const mediaReport = auditMediaCoverage(dataset, existingMedia);
  const codeRefReport = auditCodeRefs(dataset, {
    iosDir,
    androidDir,
    fileExists: (abs) => fs.existsSync(abs),
    joinPath: (base, rel) => path.resolve(base, rel),
  });

  const hasMissingCodeRefs =
    strictRefs &&
    (codeRefReport.missingIos.length > 0 || codeRefReport.missingAndroid.length > 0);
  const branchFailed = miniAppReport.errors.length > 0 || hasMissingCodeRefs;

  return {
    branchId,
    miniAppReport,
    mediaReport: {
      total: mediaReport.total,
      present: mediaReport.present,
      missing: mediaReport.missing,
    },
    codeRefReport,
    failed: branchFailed,
  };
});

const failed = reports.some((r) => r.failed);

if (isJson) {
  if (reports.length === 1) {
    const [single] = reports;
    console.log(
      JSON.stringify(
        {
          branchId: single.branchId,
          miniAppReport: single.miniAppReport,
          mediaReport: single.mediaReport,
          codeRefReport: single.codeRefReport,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      JSON.stringify(
        {
          branches: reports.map(({ branchId, miniAppReport, mediaReport, codeRefReport }) => ({
            branchId,
            miniAppReport,
            mediaReport,
            codeRefReport,
          })),
        },
        null,
        2,
      ),
    );
  }
} else {
  for (const r of reports) {
    console.log(`=== VBot Flow Explorer · Audit & Sync [${r.branchId}] ===`);
    console.log(
      `Mini App Consistency: ${r.miniAppReport.stats.catalogCount} catalog / ${r.miniAppReport.stats.profileCount} profiles / ${r.miniAppReport.stats.datasetMiniAppRefs} node refs`,
    );
    if (r.miniAppReport.errors.length > 0) {
      console.error('❌ Errors:');
      r.miniAppReport.errors.forEach((e) => console.error(`  - ${e}`));
    }
    if (r.miniAppReport.warnings.length > 0) {
      console.warn('⚠️  Warnings:');
      r.miniAppReport.warnings.forEach((w) => console.warn(`  - ${w}`));
    }

    console.log(
      `Media Coverage: ${r.mediaReport.present}/${r.mediaReport.total} ảnh/video đã có trong public/ (thiếu ${r.mediaReport.missing})`,
    );

    console.log(
      `Code Refs: ${r.codeRefReport.totalRefs} file (${r.codeRefReport.iosCount} iOS, ${r.codeRefReport.androidCount} Android)`,
    );
    for (const w of r.codeRefReport.warnings) {
      console.log(`ℹ️  ${w}`);
    }
    if (r.codeRefReport.missingIos.length > 0) {
      console.warn(`⚠️  Missing iOS codeRefs (${r.codeRefReport.missingIos.length}):`);
      r.codeRefReport.missingIos.forEach((m) =>
        console.warn(`  - ${m.ref} (nodes: ${m.nodeIds.join(', ')})`),
      );
    }
    if (r.codeRefReport.missingAndroid.length > 0) {
      console.warn(`⚠️  Missing Android codeRefs (${r.codeRefReport.missingAndroid.length}):`);
      r.codeRefReport.missingAndroid.forEach((m) =>
        console.warn(`  - ${m.ref} (nodes: ${m.nodeIds.join(', ')})`),
      );
    }

    if (!r.failed) {
      console.log(`✅ [${r.branchId}] Audit hoàn tất — dữ liệu đồng bộ.`);
    }
  }
}

if (failed) {
  process.exit(1);
}
