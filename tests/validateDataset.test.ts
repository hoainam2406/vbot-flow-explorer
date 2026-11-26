// tests/validateDataset.test.ts
import { describe, expect, it } from "vitest";
import { validateDataset } from "../src/data/validateDataset";
import {
  BridgeMessageSchema,
  type AppManifest,
  type FlowModuleFile,
} from "../src/data/schema";

const validManifest: AppManifest = {
  schemaVersion: "1.0",
  app: { name: "VBot", tagline: "Test" },
  rootNode: {
    id: "vbot-app",
    label: "VBot App",
    kind: "module",
    audience: "all",
    summary: { overview: "Root" },
  },
  branches: [
    {
      id: "mod-a",
      label: "Module A",
      kind: "module",
      audience: "all",
      summary: { overview: "Mod A" },
    },
  ],
  branchEdges: [{ id: "e-root-a", source: "vbot-app", target: "mod-a" }],
  moduleFiles: ["a"],
};

const validModule: FlowModuleFile = {
  schemaVersion: "1.0",
  moduleId: "mod-a",
  subtrees: {
    "mod-a": {
      title: "Chi tiết A",
      layoutHint: "flow",
      entryNodeIds: ["a-1"],
      nodes: [
        {
          id: "a-1",
          label: "Bước 1",
          kind: "action",
          audience: "all",
          summary: { overview: "Bước 1" },
          relatedNodeIds: ["non-existent-node"],
        },
      ],
      edges: [],
    },
  },
};

describe("validateDataset", () => {
  it("detects broken relatedNodeIds and duplicate node IDs", () => {
    const errors = validateDataset(validManifest, [validModule]);
    expect(errors.some((e) => e.includes("non-existent-node"))).toBe(true);
  });

  it("returns zero errors for valid dataset", () => {
    const cleanModule: FlowModuleFile = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Bước 1",
              kind: "action",
              audience: "all",
              summary: { overview: "Bước 1" },
            },
          ],
        },
      },
    };
    expect(validateDataset(validManifest, [cleanModule])).toEqual([]);
  });

  it("validates techDetail.miniAppBridge schema and rejects invalid bridge metadata", () => {
    const withValidBridge = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Mini App Node",
              kind: "action",
              audience: "all",
              summary: { overview: "Bước 1" },
              techDetail: {
                miniAppBridge: {
                  miniAppId: "vb-ma-user-contact",
                  embedMode: "inline_tab",
                  transport: "VbMaDelegate.onHostActionRequested",
                  messages: [
                    {
                      direction: "miniapp_to_host",
                      name: "user_contact_get_local",
                      hostFn:
                        "MiniAppService.onHostActionRequested → UserContactMiniAppBridgeHelper.executeGetLocal",
                      miniAppFn:
                        'getLocalContactsState() → postEvent("request_host_action")',
                      payload: "{ request_id }",
                      response: "{ success, contacts[] }",
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
    expect(validateDataset(validManifest, [withValidBridge])).toEqual([]);

    const parsedMessage = BridgeMessageSchema.parse({
      direction: "miniapp_to_host",
      name: "user_contact_get_local",
      hostFn:
        "MiniAppService.onHostActionRequested → UserContactMiniAppBridgeHelper.executeGetLocal",
      miniAppFn: 'getLocalContactsState() → postEvent("request_host_action")',
    });
    expect(parsedMessage.hostFn).toBe(
      "MiniAppService.onHostActionRequested → UserContactMiniAppBridgeHelper.executeGetLocal",
    );
    expect(parsedMessage.miniAppFn).toBe(
      'getLocalContactsState() → postEvent("request_host_action")',
    );

    const withEmptyHostFn = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Empty hostFn",
              kind: "action",
              audience: "all",
              summary: { overview: "Bad" },
              techDetail: {
                miniAppBridge: {
                  miniAppId: "vb-ma-test",
                  embedMode: "modal",
                  messages: [
                    {
                      direction: "miniapp_to_host",
                      name: "test_action",
                      hostFn: "",
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
    expect(
      validateDataset(validManifest, [withEmptyHostFn]).length,
    ).toBeGreaterThan(0);

    const withInvalidBridge = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Bad Bridge",
              kind: "action",
              audience: "all",
              summary: { overview: "Bad" },
              techDetail: {
                miniAppBridge: {
                  miniAppId: "vb-ma-test",
                  embedMode: "invalid_mode",
                  messages: [],
                },
              },
            },
          ],
        },
      },
    };
    expect(
      validateDataset(validManifest, [withInvalidBridge]).length,
    ).toBeGreaterThan(0);
  });

  it("supports kind miniapp and optional examplePayload / exampleResponse JSON examples", () => {
    const withMiniAppKind = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Mini App: Danh bạ cá nhân",
              kind: "miniapp",
              audience: "tech",
              summary: { overview: "Đại diện Mini App" },
              techDetail: {
                miniAppBridge: {
                  miniAppId: "vb-ma-user-contact",
                  embedMode: "inline_tab",
                  messages: [
                    {
                      direction: "miniapp_to_host",
                      name: "user_contact_delete_local",
                      hostFn:
                        "UserContactMiniAppBridgeHelper.executeDeleteLocal",
                      miniAppFn:
                        "deleteLocalContactsViaHost(syncedIds, unsyncedLocalKeys)",
                      examplePayload:
                        '{\n  "request_id": "req_04",\n  "action": "user_contact_delete_local"\n}',
                      exampleResponse:
                        '{\n  "request_id": "req_04",\n  "success": true,\n  "deletedCount": 2\n}',
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
    expect(validateDataset(validManifest, [withMiniAppKind])).toEqual([]);

    const parsedWithExample = BridgeMessageSchema.parse({
      direction: "miniapp_to_host",
      name: "user_contact_delete_local",
      examplePayload: '{"request_id":"req_04"}',
      exampleResponse: '{"success":true}',
    });
    expect(parsedWithExample.examplePayload).toBe('{"request_id":"req_04"}');
    expect(parsedWithExample.exampleResponse).toBe('{"success":true}');

    const withEmptyExamplePayload = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Empty Example",
              kind: "miniapp",
              audience: "tech",
              summary: { overview: "Bad" },
              techDetail: {
                miniAppBridge: {
                  miniAppId: "vb-ma-user-contact",
                  embedMode: "inline_tab",
                  messages: [
                    {
                      direction: "miniapp_to_host",
                      name: "user_contact_get_local",
                      examplePayload: "",
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
    expect(
      validateDataset(validManifest, [withEmptyExamplePayload]).length,
    ).toBeGreaterThan(0);
  });

  it("validates platform-aware tech fields (platforms, byPlatform, hostFnByPlatform, parityNote) and rejects invalid platform values", () => {
    const withPlatformMeta = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Android FSI Lockscreen",
              kind: "process",
              audience: "tech",
              platforms: ["android"],
              summary: { overview: "Lockscreen" },
              techDetail: {
                platformDiffNote:
                  "iOS dùng PushKit+CallKit; Android dùng FCM+FullScreenIntent",
                byPlatform: {
                  ios: {
                    summary: "PushKit + CallKit",
                    codeRefs: ["CallKitProviderDelegate.swift"],
                  },
                  android: {
                    summary:
                      "FCM + Notification.CallStyle + Foreground CallService",
                    codeRefs: ["VBotNotifications.kt", "CallService.kt"],
                  },
                },
                miniAppBridge: {
                  miniAppId: "vb-ma-user-contact",
                  embedMode: "inline_tab",
                  transportByPlatform: {
                    ios: "WKScriptMessageHandler vbma",
                    android: "@JavascriptInterface VbMABridge",
                  },
                  messages: [
                    {
                      direction: "miniapp_to_host",
                      name: "user_contact_get_local",
                      hostFnByPlatform: {
                        ios: "UserContactMiniAppBridgeHelper.executeGetLocal",
                        android: "UserContactMiniAppBridgeHelper.handleAction",
                      },
                      parityNote:
                        "Android dùng computeContactsSignature để chống loop thay Notification source.",
                    },
                  ],
                },
              },
            },
          ],
          edges: [],
        },
      },
    };
    expect(validateDataset(validManifest, [withPlatformMeta])).toEqual([]);

    const parsedBridgeMsg = BridgeMessageSchema.parse({
      direction: "miniapp_to_host",
      name: "user_contact_get_local",
      hostFnByPlatform: {
        ios: "UserContactMiniAppBridgeHelper.executeGetLocal",
        android: "UserContactMiniAppBridgeHelper.handleAction",
      },
      parityNote: "Loop guard diff",
    });
    expect(parsedBridgeMsg.hostFnByPlatform).toEqual({
      ios: "UserContactMiniAppBridgeHelper.executeGetLocal",
      android: "UserContactMiniAppBridgeHelper.handleAction",
    });
    expect(parsedBridgeMsg.parityNote).toBe("Loop guard diff");

    const withInvalidPlatform = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Invalid Platform",
              kind: "process",
              audience: "tech",
              platforms: ["windows"],
              summary: { overview: "Bad" },
            },
          ],
        },
      },
    };
    expect(
      validateDataset(validManifest, [withInvalidPlatform]).length,
    ).toBeGreaterThan(0);
  });

  it("validates node.meta and app.repoConfig while rejecting unsafe workTaskUrl or bad date", () => {
    const manifestWithRepo: AppManifest = {
      ...validManifest,
      app: {
        ...validManifest.app,
        repoConfig: {
          iosRepoWebUrl: "https://github.com/vpmedia/VBot-iOS",
          vbotWorkBaseUrl: "https://work.vpmedia.vn",
        },
      },
    };
    const moduleWithMeta: FlowModuleFile = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Bước 1",
              kind: "action",
              audience: "all",
              summary: { overview: "OK" },
              meta: {
                status: "wip",
                owner: "Team iOS",
                lastVerifiedAt: "2026-11-23",
                workTaskUrl: "https://work.vpmedia.vn/tasks/99",
              },
            },
          ],
        },
      },
    };
    expect(validateDataset(manifestWithRepo, [moduleWithMeta])).toEqual([]);

    const badMetaModule = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [
            {
              id: "a-1",
              label: "Bad Meta",
              kind: "action",
              audience: "all",
              summary: { overview: "Bad" },
              meta: {
                lastVerifiedAt: "23/11/2026",
                workTaskUrl: "javascript:alert(1)",
              },
            },
          ],
        },
      },
    };
    expect(
      validateDataset(validManifest, [badMetaModule]).length,
    ).toBeGreaterThan(0);
  });

  it("rejects duplicate parityAssessment.code across nodes and accepts unique codes", () => {
    const mkNode = (id: string, code: string) => ({
      id,
      label: id,
      kind: "action" as const,
      audience: "tech" as const,
      summary: { overview: "Test" },
      techDetail: {
        parityAssessment: {
          code,
          verdict: "logic_diff" as const,
          sameLogic: false,
          sameOutcome: false,
          needsFix: "consider" as const,
          fixTarget: "android" as const,
          explanation: "Test diff",
          recommendation: "Test fix",
        },
      },
    });

    const duplicateMod: FlowModuleFile = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [mkNode("a-1", "CALL-01"), mkNode("a-2", "CALL-01")],
        },
      },
    };
    const dupErrors = validateDataset(validManifest, [duplicateMod]);
    expect(
      dupErrors.some((e) => e.includes('Duplicate parity code "CALL-01"')),
    ).toBe(true);

    const uniqueMod: FlowModuleFile = {
      ...validModule,
      subtrees: {
        "mod-a": {
          ...validModule.subtrees["mod-a"],
          nodes: [mkNode("a-1", "CALL-01"), mkNode("a-2", "CALL-02")],
        },
      },
    };
    expect(validateDataset(validManifest, [uniqueMod])).toEqual([]);
  });
});
