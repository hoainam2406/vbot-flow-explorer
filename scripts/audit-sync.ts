// scripts/audit-sync.ts
import fs from 'node:fs';
import path from 'node:path';
import {
  collectExistingMediaPaths,
  loadMergedDataset,
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
const iosDir = getArgValue(args, '--ios-dir') ?? process.env.VBOT_IOS_DIR;
const androidDir = getArgValue(args, '--android-dir') ?? process.env.VBOT_ANDROID_DIR;

const rootDir = process.cwd();
const dataset = loadMergedDataset(rootDir);
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
const failed = miniAppReport.errors.length > 0 || hasMissingCodeRefs;

if (isJson) {
  console.log(
    JSON.stringify(
      {
        miniAppReport,
        mediaReport: {
          total: mediaReport.total,
          present: mediaReport.present,
          missing: mediaReport.missing,
        },
        codeRefReport,
      },
      null,
      2,
    ),
  );
} else {
  console.log('=== VBot Flow Explorer · Audit & Sync ===');
  console.log(
    `Mini App Consistency: ${miniAppReport.stats.catalogCount} catalog / ${miniAppReport.stats.profileCount} profiles / ${miniAppReport.stats.datasetMiniAppRefs} node refs`,
  );
  if (miniAppReport.errors.length > 0) {
    console.error('❌ Errors:');
    miniAppReport.errors.forEach((e) => console.error(`  - ${e}`));
  }
  if (miniAppReport.warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    miniAppReport.warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  console.log(
    `Media Coverage: ${mediaReport.present}/${mediaReport.total} ảnh/video đã có trong public/ (thiếu ${mediaReport.missing})`,
  );

  console.log(
    `Code Refs: ${codeRefReport.totalRefs} file (${codeRefReport.iosCount} iOS, ${codeRefReport.androidCount} Android)`,
  );
  for (const w of codeRefReport.warnings) {
    console.log(`ℹ️  ${w}`);
  }
  if (codeRefReport.missingIos.length > 0) {
    console.warn(`⚠️  Missing iOS codeRefs (${codeRefReport.missingIos.length}):`);
    codeRefReport.missingIos.forEach((m) =>
      console.warn(`  - ${m.ref} (nodes: ${m.nodeIds.join(', ')})`),
    );
  }
  if (codeRefReport.missingAndroid.length > 0) {
    console.warn(`⚠️  Missing Android codeRefs (${codeRefReport.missingAndroid.length}):`);
    codeRefReport.missingAndroid.forEach((m) =>
      console.warn(`  - ${m.ref} (nodes: ${m.nodeIds.join(', ')})`),
    );
  }

  if (!failed) {
    console.log('✅ Audit hoàn tất — dữ liệu đồng bộ.');
  }
}

if (failed) {
  process.exit(1);
}
