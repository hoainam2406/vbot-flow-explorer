// tests/aiContextExport.test.ts
import { describe, expect, it } from "vitest";
import {
  buildMiniAppAiContextPrompt,
  buildNodeAiContextPrompt,
  buildParityItemAiContextPrompt,
} from "../src/core/aiContextExport";
import { buildMiniAppContract } from "../src/core/miniAppContractBuilder";
import { extractParityReport } from "../src/core/parityAnalyzer";
import { createDefaultDevSettings } from "../src/core/workspaceSettings";
import type { MergedFlowDataset } from "../src/data/schema";

const TEST_DATASET: MergedFlowDataset = {
  app: { name: "VBot", tagline: "Test", techBranch: "Nam-dev" },
  rootNode: {
    id: "vbot-app",
    label: "VBot App",
    kind: "module",
    audience: "all",
    summary: { overview: "App root" },
  },
  branches: [
    {
      id: "mod-calling",
      label: "Gọi thoại",
      techLabel: "Calling Engine",
      kind: "module",
      audience: "all",
      summary: { overview: "Gọi qua SIP", tech: "PJSIP + CallKit" },
      techDetail: {
        platformDiffNote: "iOS dùng CallKit, Android dùng CallStyle",
        codeRefs: ["VBot/Service/VPMAppService.swift"],
        byPlatform: {
          ios: {
            summary: "iOS PJSIP",
            codeRefs: ["VBot/Service/VPMAppService.swift"],
          },
          android: {
            summary: "Android PJSIP",
            codeRefs: [
              "VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt",
            ],
          },
        },
        apisOrEvents: ["POST /api/call"],
        edgeCases: ["Mất mạng giữa cuộc gọi"],
        parityAssessment: {
          verdict: "logic_diff",
          sameLogic: false,
          sameOutcome: false,
          needsFix: "consider",
          fixTarget: "android",
          explanation: "Android thiếu event đồng bộ",
          recommendation: "Bổ sung event đồng bộ trên Android",
        },
      },
      relatedNodeIds: ["vbot-app"],
    },
  ],
  branchEdges: [{ id: "e1", source: "vbot-app", target: "mod-calling" }],
  subtreesByParentId: {},
};

describe("aiContextExport", () => {
  it("builds structured Node AI prompt with local repo paths when configured", () => {
    const settings = {
      ...createDefaultDevSettings(),
      localIosRepoPath: "/Users/dev/VBot-iOS",
      localAndroidRepoPath: "/Users/dev/VBot-Android",
    };
    const prompt = buildNodeAiContextPrompt(
      TEST_DATASET.branches[0],
      TEST_DATASET,
      "compare",
      settings,
    );

    expect(prompt).toContain("Calling Engine");
    expect(prompt).toContain(
      "/Users/dev/VBot-iOS/VBot/Service/VPMAppService.swift",
    );
    expect(prompt).toContain(
      "/Users/dev/VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt",
    );
    expect(prompt).toContain("Mất mạng giữa cuộc gọi");
    expect(prompt).toContain("POST /api/call");
  });

  it("builds dedicated Android Parity prompt isolated from iOS edits", () => {
    const settings = {
      ...createDefaultDevSettings(),
      localIosRepoPath: "/Users/dev/VBot-iOS",
      localAndroidRepoPath: "/Users/dev/VBot-Android",
    };
    const report = extractParityReport(TEST_DATASET);
    expect(report.items.length).toBeGreaterThan(0);

    const prompt = buildParityItemAiContextPrompt(
      report.items[0],
      TEST_DATASET,
      "android",
      settings,
    );

    expect(prompt).toContain("# [CALL-01 · Sửa Parity Android] Calling Engine");
    expect(prompt).toContain("- **Mã chênh lệch:** `CALL-01`");
    expect(prompt).toContain("Kotlin / Java");
    expect(prompt).toContain("VBot-Android");
    expect(prompt).toContain("KHÔNG** chỉnh sửa repo **VBot-iOS**");
    expect(prompt).toContain(
      "/Users/dev/VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt",
    );
    expect(prompt).toContain(
      "### File tham chiếu phía iOS (chỉ đọc đối chiếu)",
    );
    expect(prompt).toContain("VBot/Service/VPMAppService.swift");
    expect(prompt).not.toContain(
      "/Users/dev/VBot-iOS/VBot/Service/VPMAppService.swift",
    );
    expect(prompt).toContain("Android thiếu event đồng bộ");
    expect(prompt).toContain("Mất mạng giữa cuộc gọi");
  });

  it("builds dedicated iOS Parity prompt noting when fixTarget is Android", () => {
    const report = extractParityReport(TEST_DATASET);
    const prompt = buildParityItemAiContextPrompt(
      report.items[0],
      TEST_DATASET,
      "ios",
    );

    expect(prompt).toContain("# [CALL-01 · Sửa Parity iOS] Calling Engine");
    expect(prompt).toContain("- **Mã chênh lệch:** `CALL-01`");
    expect(prompt).toContain("Swift / UIKit");
    expect(prompt).toContain("VBot-iOS");
    expect(prompt).toContain("bên cần sửa chính là **Android**");
    expect(prompt).toContain("### File cần mở trong VBot-iOS");
    expect(prompt).toContain("- `VBot/Service/VPMAppService.swift`");
    expect(prompt).toContain(
      "### File tham chiếu phía Android (chỉ đọc đối chiếu)",
    );
    expect(prompt).toContain(
      "### File tham chiếu phía Android (chỉ đọc đối chiếu)",
    );
    expect(prompt).toContain(
      "VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/call/NewCallActivity.kt",
    );
  });

  it("builds Mini App Bridge parity section, tbd/none directives, and ios_only missing notice", () => {
    const customDataset: MergedFlowDataset = {
      ...TEST_DATASET,
      branches: [
        {
          id: "mod-bridge-tbd",
          label: "Bridge TBD",
          kind: "module",
          audience: "tech",
          summary: { overview: "Bridge test" },
          techDetail: {
            platformDiffNote: "Khác callback make_call",
            byPlatform: {
              ios: {
                summary: "iOS WKWebView",
                codeRefs: ["VBot/Bridge/MaBridge.swift"],
              },
              android: {
                summary: "Android @JavascriptInterface",
                codeRefs: ["VBot-Android/app/src/main/java/Bridge.kt"],
              },
            },
            miniAppBridge: {
              miniAppId: "vb-ma-contacts",
              embedMode: "inline_tab",
              transportByPlatform: {
                ios: "WKScriptMessageHandler",
                android: "JavascriptInterface",
              },
              messages: [
                {
                  direction: "miniapp_to_host",
                  name: "make_call",
                  hostFnByPlatform: {
                    ios: "handleMakeCall()",
                    android: "makeDirectCall()",
                  },
                  miniAppFn: "sdk.makeCall()",
                  parityNote:
                    "Android đợi BottomSheet trước khi trả call_result",
                },
              ],
            },
            parityAssessment: {
              verdict: "logic_diff",
              sameLogic: false,
              sameOutcome: false,
              needsFix: "consider",
              fixTarget: "tbd",
              explanation: "Chưa thống nhất thời điểm callback",
              recommendation: "Chốt 1 luồng callback chung",
            },
          },
        },
        {
          id: "mod-ios-only",
          label: "iOS Only Flow",
          kind: "process",
          audience: "tech",
          platforms: ["ios"],
          summary: { overview: "Only iOS" },
          techDetail: {
            byPlatform: {
              ios: {
                summary: "Chạy trên iOS",
                codeRefs: ["VBot/OnlyIos.swift"],
              },
            },
            parityAssessment: {
              verdict: "os_impl_only",
              sameLogic: true,
              sameOutcome: true,
              needsFix: "no",
              fixTarget: "none",
              explanation: "Đặc thù iOS",
              recommendation: "Không cần sửa",
            },
          },
        },
      ],
    };

    const report = extractParityReport(customDataset);
    const bridgeItem = report.items.find((i) => i.nodeId === "mod-bridge-tbd")!;
    const iosOnlyItem = report.items.find((i) => i.nodeId === "mod-ios-only")!;

    const tbdAndroidPrompt = buildParityItemAiContextPrompt(
      bridgeItem,
      customDataset,
      "android",
    );
    expect(tbdAndroidPrompt).toContain("Chờ chốt bên chuẩn");
    expect(tbdAndroidPrompt).toContain(
      "chưa sửa code trước khi người dùng chốt phương án",
    );
    expect(tbdAndroidPrompt).toContain("vb-ma-contacts");
    expect(tbdAndroidPrompt).toContain(
      "Transport Android:** JavascriptInterface",
    );
    expect(tbdAndroidPrompt).toContain("Host Android: `makeDirectCall()`");
    expect(tbdAndroidPrompt).toContain("Host iOS: `handleMakeCall()`");
    expect(tbdAndroidPrompt).toContain(
      "Android đợi BottomSheet trước khi trả call_result",
    );

    const iosOnlyAndroidPrompt = buildParityItemAiContextPrompt(
      iosOnlyItem,
      customDataset,
      "android",
    );
    expect(iosOnlyAndroidPrompt).toContain("chưa tồn tại trên Android");
    expect(iosOnlyAndroidPrompt).toContain("Chỉ đối soát / xác minh");
    expect(iosOnlyAndroidPrompt).toContain(
      "Không refactor làm mất đặc thù Kotlin / Java",
    );
  });

  it("builds MiniApp AI prompt from contract", () => {
    const contract = buildMiniAppContract("vb-ma-autodial");
    const prompt = buildMiniAppAiContextPrompt(contract);
    expect(prompt).toContain("vb-ma-autodial");
    expect(prompt).toContain("start_autodial");
    expect(prompt).toContain("autodial_finished");
  });
});
