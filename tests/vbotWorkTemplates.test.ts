// tests/vbotWorkTemplates.test.ts
import { describe, expect, it } from "vitest";
import {
  buildNodeTaskDraft,
  buildNodeTaskMarkdown,
  buildParityTaskDraft,
  buildParityTaskMarkdown,
  buildQaBugTaskMarkdown,
  resolveVbotWorkUrl,
} from "../src/core/vbotWorkTemplates";
import { createDefaultDevSettings } from "../src/core/workspaceSettings";
import type { ParityItem } from "../src/core/parityAnalyzer";
import type { FlowNodeData } from "../src/data/schema";

describe("vbotWorkTemplates", () => {
  it("resolves VBot Work URL from settings override, repoConfig, or fallback safely", () => {
    const defaults = createDefaultDevSettings();
    expect(resolveVbotWorkUrl(defaults)).toBe("https://work.vpmedia.vn");
    expect(
      resolveVbotWorkUrl(
        defaults,
        {
          vbotWorkBaseUrl: "https://work.vpmedia.vn",
          vbotWorkProjectUrls: {
            ios: "https://work.vpmedia.vn/projects/vbot-ios",
          },
        },
        "ios",
      ),
    ).toBe("https://work.vpmedia.vn/projects/vbot-ios");
    expect(
      resolveVbotWorkUrl({
        ...defaults,
        vbotWorkBaseUrlOverride: "javascript:alert(1)",
      }),
    ).toBe("https://work.vpmedia.vn");
  });

  it("formats Markdown task templates for Node, Parity Item, and QA Bug", () => {
    const node: FlowNodeData = {
      id: "n-test",
      label: "Gọi ra",
      techLabel: "make_call Bridge",
      kind: "action",
      audience: "all",
      summary: { overview: "Thực hiện cuộc gọi ra", tech: "SIP INVITE" },
      techDetail: {
        platformDiffNote: "Android mở BottomSheet chọn hotline.",
        edgeCases: ["Thiếu quyền Micro"],
        codeRefs: ["VBot/Service/MiniAppService.swift"],
      },
      meta: { owner: "Mobile Core" },
    };

    const nodeMd = buildNodeTaskMarkdown(node, {
      pageUrl: "https://example.com/#/?node=n-test",
      branchLabel: "Gọi thoại",
      platformMode: "compare",
    });
    expect(nodeMd).toContain("make_call Bridge");
    expect(nodeMd).toContain("Mobile Core");
    expect(nodeMd).toContain("MiniAppService.swift");
    expect(nodeMd).toContain("- [ ] Thiếu quyền Micro");

    const parityItem: ParityItem = {
      code: "CALL-12",
      nodeId: "n-test",
      nodeLabel: "make_call Bridge",
      nodeKind: "action",
      branchId: "mod-calling",
      branchLabel: "Gọi thoại",
      breadcrumb: ["VBot App", "Gọi thoại", "make_call Bridge"],
      categories: ["behavior_diff"],
      primaryCategory: "behavior_diff",
      platformDiffNote: "Android mở sheet chọn hotline.",
      bridgeParityNotes: [
        { messageName: "make_call", parityNote: "Trả USER_CANCELLED" },
      ],
      assessment: {
        verdict: "logic_diff",
        sameLogic: false,
        sameOutcome: false,
        needsFix: "consider",
        fixTarget: "tbd",
        explanation:
          "Android đợi BottomSheet chọn hotline trước khi trả call_result.",
        recommendation: "Cân nhắc đồng bộ mã lỗi trả về khi hủy chọn hotline.",
        isInferred: false,
      },
    };

    const parityMd = buildParityTaskMarkdown(parityItem, {
      techBranch: "Nam-dev",
      triageStatus: "in_progress",
    });
    expect(parityMd).toContain("[CALL-12]");
    expect(parityMd).toContain("[Parity iOS ↔ Android]");
    expect(parityMd).toContain("Đang đồng bộ");
    expect(parityMd).toContain("USER_CANCELLED");
    expect(parityMd).toContain("Khác logic / Kết quả");
    expect(parityMd).toContain("Cân nhắc đồng bộ");
    expect(parityMd).toContain("Chờ chốt bên chuẩn");
    expect(parityMd).toContain("Android đợi BottomSheet");

    const qaMd = buildQaBugTaskMarkdown(
      "Kịch bản gọi đi",
      {
        id: "tc-1",
        stepNumber: 2,
        nodeId: "n-test",
        nodeLabel: "make_call",
        category: "edge_case",
        title: "Thiếu hotline Android",
        platformScope: "android",
      },
      { ios: "untested", android: "fail", note: "Bị crash BottomSheet" },
    );
    expect(qaMd).toContain("[QA Bug] Thiếu hotline Android");
    expect(qaMd).toContain("Android (fail)");
    expect(qaMd).toContain("Bị crash BottomSheet");

    const parityDraft = buildParityTaskDraft(parityItem, {
      techBranch: "Nam-dev",
      fallbackUrl: "https://work.vpmedia.vn",
    });
    expect(parityDraft.itemKey).toBe("parity:n-test");
    expect(parityDraft.priority).toBe("medium");
    expect(parityDraft.title).toContain("[CALL-12]");
    expect(parityDraft.title).toContain("make_call Bridge");
    expect(parityDraft.description).toContain("Android đợi BottomSheet");

    const actionParityDraft = buildParityTaskDraft(
      {
        ...parityItem,
        assessment: {
          ...parityItem.assessment,
          verdict: "action_needed",
          needsFix: "yes",
        },
      },
      {},
    );
    expect(actionParityDraft.priority).toBe("high");

    const osOnlyDraft = buildParityTaskDraft(
      {
        ...parityItem,
        assessment: {
          ...parityItem.assessment,
          verdict: "os_impl_only",
          needsFix: "no",
        },
      },
      {},
    );
    expect(osOnlyDraft.priority).toBe("low");

    const nodeDraft = buildNodeTaskDraft(node, { platformMode: "compare" });
    expect(nodeDraft.itemKey).toBe("node:n-test");
    expect(nodeDraft.priority).toBe("medium");
    expect(nodeDraft.title).toBe("[VBot Flow] make_call Bridge");
  });
});
