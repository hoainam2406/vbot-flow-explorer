// tests/parityAnalyzer.test.ts
import { describe, expect, it } from "vitest";
import {
  loadMergedDataset,
  loadMergedDatasetForBranch,
} from "../plugins/flowDataPlugin";
import { findNodeById } from "../src/core/graphEngine";
import {
  compareParityAgainstBase,
  exportParityReportToMarkdown,
  extractParityReport,
} from "../src/core/parityAnalyzer";
import type { MergedFlowDataset } from "../src/data/schema";

const syntheticDataset: MergedFlowDataset = {
  app: { name: "VBot Test", tagline: "Test", version: "1.0" },
  rootNode: {
    id: "root",
    label: "VBot App",
    kind: "module",
    audience: "all",
    summary: { overview: "Root", tech: "Root tech" },
    techDetail: {
      platformDiffNote: "Khác kiến trúc nền tảng",
    },
  },
  branches: [
    {
      id: "branch-same",
      label: "Nhánh giống nhau",
      kind: "module",
      audience: "all",
      summary: { overview: "Same" },
    },
    {
      id: "branch-diff",
      label: "Nhánh có khác biệt",
      kind: "module",
      audience: "all",
      summary: { overview: "Diff" },
    },
  ],
  branchEdges: [
    { id: "e-r-1", source: "root", target: "branch-same" },
    { id: "e-r-2", source: "root", target: "branch-diff" },
  ],
  subtreesByParentId: {
    "branch-same": {
      title: "Same",
      layoutHint: "tree",
      entryNodeIds: ["same-1"],
      nodes: [
        {
          id: "same-1",
          label: "Bước giống hoàn toàn",
          kind: "action",
          audience: "all",
          summary: { overview: "Giống" },
        },
      ],
      edges: [],
    },
    "branch-diff": {
      title: "Diff",
      layoutHint: "flow",
      entryNodeIds: ["ios-step"],
      nodes: [
        {
          id: "ios-step",
          label: "Bước iOS PushKit",
          kind: "process",
          audience: "tech",
          platforms: ["ios"],
          summary: { overview: "iOS", tech: "PushKit" },
          techDetail: {
            platformDiffNote: "Chỉ chạy trên iOS PushKit",
          },
        },
        {
          id: "and-step",
          label: "Bước Android FSI",
          kind: "process",
          audience: "tech",
          platforms: ["android"],
          summary: { overview: "Android", tech: "FSI" },
        },
        {
          id: "bridge-step",
          label: "Bridge Mini App",
          kind: "miniapp",
          audience: "tech",
          summary: { overview: "Bridge", tech: "Bridge iOS" },
          techDetail: {
            byPlatform: {
              android: { summary: "Bridge Android" },
            },
            miniAppBridge: {
              miniAppId: "vb-ma-demo",
              embedMode: "inline_tab",
              messages: [
                {
                  direction: "miniapp_to_host",
                  name: "make_call",
                  parityNote: "Android callback trễ 200ms",
                },
              ],
            },
          },
        },
      ],
      edges: [
        { id: "e-d-1", source: "ios-step", target: "bridge-step" },
        { id: "e-d-2", source: "and-step", target: "bridge-step" },
      ],
    },
  },
};

describe("parityAnalyzer", () => {
  it("categorizes items, computes summary counts, and excludes empty branches", () => {
    const report = extractParityReport(syntheticDataset);

    expect(report.total).toBe(4);
    expect(report.iosOnly).toBe(1);
    expect(report.androidOnly).toBe(1);
    expect(report.behaviorDiff).toBe(2);
    expect(report.bridgeParity).toBe(1);
    expect(
      report.byVerdict.action_needed +
        report.byVerdict.logic_diff +
        report.byVerdict.os_impl_only +
        report.byVerdict.synced,
    ).toBe(report.total);
    expect(
      report.byFixTarget.ios +
        report.byFixTarget.android +
        report.byFixTarget.both +
        report.byFixTarget.tbd +
        report.byFixTarget.none,
    ).toBe(report.total);

    expect(report.byBranch).toEqual([
      { branchId: "root", branchLabel: "VBot App", count: 1 },
      { branchId: "branch-diff", branchLabel: "Nhánh có khác biệt", count: 3 },
    ]);

    const iosItem = report.items.find((i) => i.nodeId === "ios-step");
    expect(iosItem?.primaryCategory).toBe("ios_only");
    expect(iosItem?.categories).toContain("behavior_diff");
    expect(iosItem?.androidSummary).toBeUndefined();
    expect(iosItem?.assessment.verdict).toBe("logic_diff");
    expect(iosItem?.assessment.isInferred).toBe(true);

    const andItem = report.items.find((i) => i.nodeId === "and-step");
    expect(andItem?.primaryCategory).toBe("android_only");
    expect(andItem?.iosSummary).toBeUndefined();
    expect(andItem?.assessment.needsFix).toBe("consider");

    const bridgeItem = report.items.find((i) => i.nodeId === "bridge-step");
    expect(bridgeItem?.primaryCategory).toBe("bridge_parity");
    expect(bridgeItem?.bridgeParityNotes).toEqual([
      { messageName: "make_call", parityNote: "Android callback trễ 200ms" },
    ]);
    expect(bridgeItem?.iosSummary).toBe("Bridge iOS");
    expect(bridgeItem?.androidSummary).toBe("Bridge Android");

    expect(report.items.map((i) => i.code)).toEqual([
      "ROOT-01",
      "DIFF-01",
      "DIFF-02",
      "DIFF-03",
    ]);
    expect(new Set(report.items.map((i) => i.code)).size).toBe(
      report.items.length,
    );

    const md = exportParityReportToMarkdown(report, syntheticDataset.app);
    expect(md).toContain(
      "# Báo cáo chênh lệch iOS ↔ Android — VBot Test (1.0)",
    );
    expect(md).toContain("### [ROOT-01] VBot App (`root`)");
    expect(md).toContain("| Tổng số điểm ghi nhận | 4 |");
    expect(md).toContain(
      "| Chỉ khác OS / Ngôn ngữ (Cùng kết quả — Không cần sửa) |",
    );
    expect(md).toContain("- **Giải thích:**");
    expect(md).toContain("- **Khuyến nghị:**");
    expect(md).toContain("Android callback trễ 200ms");
  });

  it("extracts expected platform parity items from real VBot dataset", () => {
    const realDataset = loadMergedDataset(process.cwd());
    const report = extractParityReport(realDataset);

    expect(report.total).toBe(126);
    expect(report.iosOnly).toBeGreaterThan(0);
    expect(report.androidOnly).toBeGreaterThan(0);
    expect(report.behaviorDiff).toBeGreaterThan(0);
    expect(report.bridgeParity).toBeGreaterThan(0);
    expect(
      report.byVerdict.action_needed +
        report.byVerdict.logic_diff +
        report.byVerdict.os_impl_only +
        report.byVerdict.synced,
    ).toBe(report.total);
    expect(
      report.byFixTarget.ios +
        report.byFixTarget.android +
        report.byFixTarget.both +
        report.byFixTarget.tbd +
        report.byFixTarget.none,
    ).toBe(report.total);

    // 100% mục parity trong dataset thật phải được gắn parityAssessment + fixTarget + code tường minh & không trùng
    const inferredItems = report.items.filter((i) => i.assessment.isInferred);
    expect(inferredItems).toEqual([]);
    const missingFixTargets = report.items
      .filter(
        (i) =>
          !findNodeById(realDataset, i.nodeId)?.techDetail?.parityAssessment
            ?.fixTarget,
      )
      .map((i) => i.nodeId);
    expect(missingFixTargets).toEqual([]);
    const missingCodes = report.items
      .filter(
        (i) =>
          !findNodeById(realDataset, i.nodeId)?.techDetail?.parityAssessment
            ?.code,
      )
      .map((i) => i.nodeId);
    expect(missingCodes).toEqual([]);
    expect(report.items.every((i) => /^[A-Z]+-\d{2,}$/.test(i.code))).toBe(
      true,
    );
    expect(new Set(report.items.map((i) => i.code)).size).toBe(
      report.items.length,
    );

    const byId = new Map(report.items.map((item) => [item.nodeId, item]));

    expect(byId.get("call-in-android-fsi")?.primaryCategory).toBe(
      "android_only",
    );
    expect(byId.get("call-in-android-fsi")?.assessment.verdict).toBe(
      "os_impl_only",
    );
    expect(byId.get("call-in-android-fsi")?.assessment.needsFix).toBe("no");
    expect(byId.get("call-in-android-fsi")?.assessment.fixTarget).toBe("none");

    expect(byId.get("call-in-pushkit")?.assessment.verdict).toBe(
      "os_impl_only",
    );
    expect(byId.get("call-in-pushkit")?.assessment.sameLogic).toBe(true);
    expect(byId.get("call-in-pushkit")?.assessment.sameOutcome).toBe(true);
    expect(byId.get("call-in-pushkit")?.assessment.fixTarget).toBe("none");

    expect(byId.get("ct-sqlite-uid")?.assessment.verdict).toBe("os_impl_only");
    expect(byId.get("ma-autodial")?.assessment.verdict).toBe("synced");
    expect(byId.get("call-out-preserve-name")?.assessment.verdict).toBe(
      "logic_diff",
    );
    expect(byId.get("auth-signup")?.assessment.verdict).toBe("synced");
    expect(byId.get("auth-signup")?.assessment.fixTarget).toBe("none");
    expect(byId.get("su-verify-otp")?.assessment.verdict).toBe("synced");
    expect(byId.get("su-verify-otp")?.assessment.fixTarget).toBe("none");
    expect(byId.get("ma-monitoring")?.assessment.verdict).toBe("synced");
    expect(byId.get("ma-monitoring")?.assessment.fixTarget).toBe("none");
    expect(byId.get("mamon-state")?.assessment.verdict).toBe("synced");
    expect(byId.get("mamon-state")?.assessment.fixTarget).toBe("none");
    expect(byId.get("auth-ram-challenge")?.assessment.verdict).toBe("synced");
    expect(byId.get("auth-ram-challenge")?.assessment.fixTarget).toBe("none");
    expect(byId.get("call-controls")?.assessment.fixTarget).toBe("ios");
    expect(byId.get("qr-code-hub")?.assessment.verdict).toBe("synced");
    expect(byId.get("qr-code-hub")?.assessment.fixTarget).toBe("none");
    expect(byId.get("qr-scan-source")?.assessment.verdict).toBe("synced");
    expect(byId.get("qr-scan-source")?.assessment.fixTarget).toBe("none");
    expect(byId.get("account-settings")?.assessment.fixTarget).toBe("both");
    expect(byId.get("call-tr-att-confirm")?.assessment.fixTarget).toBe("tbd");

    expect(byId.get("call-ctrl-sip-code")?.primaryCategory).toBe(
      "android_only",
    );
    expect(byId.get("call-in-raw-log")?.primaryCategory).toBe("ios_only");
    expect(byId.get("prj-call-type-ios")?.primaryCategory).toBe("ios_only");
    expect(byId.get("acc-delete-ios")?.primaryCategory).toBe("ios_only");

    const loopGuard = byId.get("mauc-loop-guard");
    expect(loopGuard).toBeDefined();
    expect(loopGuard?.categories).toContain("bridge_parity");
    expect(loopGuard?.categories).toContain("behavior_diff");
    expect(loopGuard?.assessment.verdict).toBe("os_impl_only");

    const md = exportParityReportToMarkdown(report, realDataset.app);
    expect(md).toContain("call-in-android-fsi");
    expect(md).toContain("mauc-loop-guard");
    expect(md).toContain("Chỉ khác OS / Ngôn ngữ");
  });

  it("compares branch parity against base dataset without false-positives on branch-name text", () => {
    const baseDs: MergedFlowDataset = {
      ...syntheticDataset,
      app: { ...syntheticDataset.app, techBranch: "Nam-dev" },
      rootNode: {
        ...syntheticDataset.rootNode,
        techDetail: {
          platformDiffNote: "Khác kiến trúc trên nhánh Nam-dev",
          parityAssessment: {
            verdict: "os_impl_only",
            sameLogic: true,
            sameOutcome: true,
            needsFix: "no",
            fixTarget: "none",
            explanation: "Cùng logic trên Nam-dev.",
            recommendation: "Không cần sửa.",
          },
        },
      },
    };
    const branchDs: MergedFlowDataset = {
      ...baseDs,
      app: { ...baseDs.app, techBranch: "Nam-dev-SBSI" },
      rootNode: {
        ...baseDs.rootNode,
        techDetail: {
          platformDiffNote: "Khác kiến trúc trên nhánh Nam-dev-SBSI",
          parityAssessment: {
            verdict: "os_impl_only",
            sameLogic: true,
            sameOutcome: true,
            needsFix: "no",
            fixTarget: "none",
            explanation: "Cùng logic trên Nam-dev-SBSI.",
            recommendation: "Không cần sửa.",
          },
        },
      },
      subtreesByParentId: {
        ...baseDs.subtreesByParentId,
        "branch-diff": {
          ...baseDs.subtreesByParentId["branch-diff"],
          nodes: [
            ...baseDs.subtreesByParentId["branch-diff"].nodes.map((n) =>
              n.id === "ios-step"
                ? {
                    ...n,
                    techDetail: {
                      platformDiffNote: "Đã đổi hành vi trên nhánh mới",
                      parityAssessment: {
                        verdict: "action_needed" as const,
                        sameLogic: false,
                        sameOutcome: false,
                        needsFix: "yes" as const,
                        fixTarget: "both" as const,
                        explanation: "Cần đồng bộ.",
                        recommendation: "Sửa cả 2.",
                      },
                    },
                  }
                : n,
            ),
            {
              id: "sbsi-new-step",
              label: "Bước mới trên SBSI",
              kind: "action",
              audience: "all",
              summary: { overview: "Mới" },
              techDetail: {
                platformDiffNote: "Khác nhẹ hiển thị",
              },
            },
          ],
        },
      },
    };

    const delta = compareParityAgainstBase(
      extractParityReport(branchDs),
      extractParityReport(baseDs),
      { baseBranchLabel: "Nam-dev", currentBranchLabel: "Nam-dev-SBSI" },
    );

    expect(delta.addedCount).toBe(1);
    expect(delta.updatedCount).toBe(1);
    expect(delta.changedTotal).toBe(2);
    expect(delta.byNodeId.root.status).toBe("inherited");
    expect(delta.byNodeId["sbsi-new-step"].status).toBe("added");
    expect(delta.byNodeId["ios-step"]).toEqual({
      status: "updated",
      previousVerdict: "logic_diff",
      previousFixTarget: "android",
    });
  });

  it("highlights the exact 4 new and updated parity items on Nam-dev-SBSI vs Nam-dev", () => {
    const baseDataset = loadMergedDatasetForBranch(process.cwd(), "Nam-dev");
    const sbsiDataset = loadMergedDatasetForBranch(
      process.cwd(),
      "Nam-dev-SBSI",
    );
    const baseReport = extractParityReport(baseDataset);
    const sbsiReport = extractParityReport(sbsiDataset);

    expect(sbsiReport.items.filter((i) => i.assessment.isInferred)).toEqual([]);
    const missingFixTargets = sbsiReport.items
      .filter(
        (i) =>
          !findNodeById(sbsiDataset, i.nodeId)?.techDetail?.parityAssessment
            ?.fixTarget,
      )
      .map((i) => i.nodeId);
    expect(missingFixTargets).toEqual([]);

    const delta = compareParityAgainstBase(sbsiReport, baseReport, {
      baseBranchLabel: "Nam-dev",
      currentBranchLabel: "Nam-dev-SBSI",
    });

    expect(delta.addedCount).toBe(4);
    expect(delta.byNodeId["as-open-sheet"]?.status).toBe("added");
    expect(delta.byNodeId["as-set-status"]?.status).toBe("added");
    expect(delta.byNodeId["as-manage-reason-templates"]?.status).toBe("added");
    expect(delta.byNodeId["as-auto-resume-reconnect"]?.status).toBe("added");

    const sbsiById = new Map(sbsiReport.items.map((i) => [i.nodeId, i]));
    const baseById = new Map(baseReport.items.map((i) => [i.nodeId, i]));
    expect(sbsiReport.items.every((i) => /^[A-Z]+-\d{2,}$/.test(i.code))).toBe(
      true,
    );
    expect(new Set(sbsiReport.items.map((i) => i.code)).size).toBe(
      sbsiReport.items.length,
    );
    for (const [nodeId, baseItem] of baseById) {
      expect(sbsiById.get(nodeId)?.code).toBe(baseItem.code);
    }
    expect(sbsiById.get("as-open-sheet")?.code).toBe("HUB-22");
    expect(sbsiById.get("as-set-status")?.code).toBe("HUB-23");
    expect(sbsiById.get("as-manage-reason-templates")?.code).toBe("HUB-24");
    expect(sbsiById.get("as-auto-resume-reconnect")?.code).toBe("HUB-25");
    expect(sbsiById.get("as-open-sheet")?.assessment.verdict).toBe("synced");
    expect(sbsiById.get("as-open-sheet")?.assessment.fixTarget).toBe("none");
    expect(sbsiById.get("as-set-status")?.assessment.verdict).toBe("synced");
    expect(sbsiById.get("as-set-status")?.assessment.fixTarget).toBe("none");
    expect(sbsiById.get("as-manage-reason-templates")?.assessment.verdict).toBe(
      "synced",
    );
    expect(
      sbsiById.get("as-manage-reason-templates")?.assessment.fixTarget,
    ).toBe("none");

    expect(delta.byNodeId["call-ctrl-survey"]).toEqual({
      status: "updated",
      previousVerdict: "synced",
      previousFixTarget: "none",
    });
    expect(delta.byNodeId["agent-status-capsule"]).toEqual({
      status: "updated",
      previousVerdict: "logic_diff",
      previousFixTarget: "tbd",
    });
    expect(delta.byNodeId["call-incall-miniapps"]?.status).toBe("inherited");
  });
});
