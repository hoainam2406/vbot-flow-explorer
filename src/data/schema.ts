// src/data/schema.ts
import { z } from "zod";

export const NodeKindSchema = z.enum([
  "module",
  "miniapp",
  "action",
  "process",
  "decision",
  "external",
  "error",
]);

export const NodeStatusSchema = z.enum([
  "stable",
  "wip",
  "needs_review",
  "deprecated",
]);

export const NodeMetaSchema = z
  .object({
    status: NodeStatusSchema.optional(),
    owner: z.string().min(1).optional(),
    lastVerifiedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "lastVerifiedAt must use YYYY-MM-DD")
      .optional(),
    workTaskUrl: z
      .string()
      .refine((v) => /^https?:\/\//i.test(v), "workTaskUrl must be http(s) URL")
      .optional(),
  })
  .strict();

export const AppRepoConfigSchema = z
  .object({
    iosRepoWebUrl: z.string().min(1).optional(),
    androidRepoWebUrl: z.string().min(1).optional(),
    vbotWorkBaseUrl: z.string().min(1).optional(),
    vbotWorkProjectUrls: z
      .object({
        ios: z.string().min(1).optional(),
        android: z.string().min(1).optional(),
        miniapp: z.string().min(1).optional(),
        general: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AudienceScopeSchema = z.enum(["all", "tech"]);

export const PlatformSchema = z.enum(["ios", "android"]);
export type Platform = z.infer<typeof PlatformSchema>;
export type PlatformViewMode = "ios" | "android" | "compare";

export const PlatformTechDetailSchema = z
  .object({
    summary: z.string().min(1).optional(),
    transport: z.string().min(1).optional(),
    inputs: z.array(z.string()).optional(),
    outputs: z.array(z.string()).optional(),
    apisOrEvents: z.array(z.string()).optional(),
    edgeCases: z.array(z.string()).optional(),
    codeRefs: z.array(z.string()).optional(),
  })
  .strict();

export const MediaItemSchema = z.object({
  src: z.string().min(1),
  caption: z.string().min(1),
  type: z.enum(["image", "video"]).optional(),
  frame: z.enum(["phone", "none"]).optional(),
  audience: AudienceScopeSchema.optional(),
});

export const BridgeMessageSchema = z
  .object({
    direction: z.enum(["host_init", "host_to_miniapp", "miniapp_to_host"]),
    name: z.string().min(1),
    hostFn: z.string().min(1).optional(),
    hostFnByPlatform: z
      .object({
        ios: z.string().min(1).optional(),
        android: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    miniAppFn: z.string().min(1).optional(),
    payload: z.string().optional(),
    response: z.string().optional(),
    examplePayload: z.string().min(1).optional(),
    exampleResponse: z.string().min(1).optional(),
    note: z.string().optional(),
    parityNote: z.string().min(1).optional(),
  })
  .strict();

export const MiniAppBridgeSchema = z
  .object({
    miniAppId: z.string().min(1),
    embedMode: z.enum(["inline_tab", "modal", "sdk_global"]),
    transport: z.string().optional(),
    transportByPlatform: z
      .object({
        ios: z.string().min(1).optional(),
        android: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    messages: z.array(BridgeMessageSchema).min(1),
  })
  .strict();

export const ParityVerdictSchema = z.enum([
  "action_needed",
  "logic_diff",
  "os_impl_only",
  "synced",
]);

export const ParityNeedsFixSchema = z.enum(["yes", "consider", "no"]);

export const ParityFixTargetSchema = z.enum([
  "ios",
  "android",
  "both",
  "tbd",
  "none",
]);

export const ParityAssessmentSchema = z
  .object({
    code: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9]{1,7}-\d{2,4}$/,
        "parityAssessment.code must match format like CALL-01",
      )
      .optional(),
    verdict: ParityVerdictSchema,
    sameLogic: z.boolean(),
    sameOutcome: z.boolean(),
    needsFix: ParityNeedsFixSchema,
    fixTarget: ParityFixTargetSchema.optional(),
    explanation: z.string().min(1),
    recommendation: z.string().min(1),
  })
  .strict();

export const TechDetailSchema = z
  .object({
    platformDiffNote: z.string().min(1).optional(),
    parityAssessment: ParityAssessmentSchema.optional(),
    inputs: z.array(z.string()).optional(),
    outputs: z.array(z.string()).optional(),
    apisOrEvents: z.array(z.string()).optional(),
    edgeCases: z.array(z.string()).optional(),
    codeRefs: z.array(z.string()).optional(),
    byPlatform: z
      .object({
        ios: PlatformTechDetailSchema.optional(),
        android: PlatformTechDetailSchema.optional(),
      })
      .strict()
      .optional(),
    miniAppBridge: MiniAppBridgeSchema.optional(),
  })
  .strict();

export const FlowNodeDataSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    techLabel: z.string().min(1).optional(),
    kind: NodeKindSchema,
    audience: AudienceScopeSchema,
    platforms: z.array(PlatformSchema).min(1).optional(),
    summary: z.object({
      overview: z.string().min(1),
      tech: z.string().optional(),
    }),
    media: z.array(MediaItemSchema).optional(),
    techDetail: TechDetailSchema.optional(),
    relatedNodeIds: z.array(z.string()).optional(),
    meta: NodeMetaSchema.optional(),
  })
  .strict();

export const FlowEdgeDataSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    label: z.string().optional(),
    techLabel: z.string().min(1).optional(),
    audience: AudienceScopeSchema.optional(),
    platforms: z.array(PlatformSchema).min(1).optional(),
  })
  .strict();

export const ScenarioSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    audience: AudienceScopeSchema.optional(),
    platforms: z.array(PlatformSchema).min(1).optional(),
    nodeIds: z.array(z.string()),
    edgeIds: z.array(z.string()),
  })
  .strict();

export const SubtreeDefinitionSchema = z.object({
  title: z.string().min(1),
  layoutHint: z.enum(["tree", "flow"]),
  direction: z.enum(["LR", "TB"]).optional(),
  entryNodeIds: z.array(z.string().min(1)).min(1),
  nodes: z.array(FlowNodeDataSchema).min(1),
  edges: z.array(FlowEdgeDataSchema),
  scenarios: z.array(ScenarioSchema).optional(),
});

export const FlowModuleFileSchema = z.object({
  schemaVersion: z.literal("1.0"),
  moduleId: z.string().min(1),
  subtrees: z.record(z.string(), SubtreeDefinitionSchema),
});

export const AppManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  app: z.object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    version: z.string().optional(),
    techBranch: z.string().min(1).optional(),
    repoConfig: AppRepoConfigSchema.optional(),
  }),
  rootNode: FlowNodeDataSchema,
  branches: z.array(FlowNodeDataSchema).min(1),
  branchEdges: z.array(FlowEdgeDataSchema),
  moduleFiles: z.array(z.string()),
  inlineSubtrees: z.record(z.string(), SubtreeDefinitionSchema).optional(),
});

export const BranchManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: z
      .string()
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        "Branch id must contain only letters, digits, ., _, -",
      ),
    label: z.string().min(1),
    description: z.string().optional(),
    extends: z.string().min(1).optional(),
    appOverrides: z
      .object({
        name: z.string().min(1).optional(),
        tagline: z.string().min(1).optional(),
        version: z.string().optional(),
        techBranch: z.string().min(1).optional(),
        repoConfig: AppRepoConfigSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type NodeMeta = z.infer<typeof NodeMetaSchema>;
export type AppRepoConfig = z.infer<typeof AppRepoConfigSchema>;
export type AudienceScope = z.infer<typeof AudienceScopeSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;
export type MiniAppBridge = z.infer<typeof MiniAppBridgeSchema>;
export type PlatformTechDetail = z.infer<typeof PlatformTechDetailSchema>;
export type ParityVerdict = z.infer<typeof ParityVerdictSchema>;
export type ParityNeedsFix = z.infer<typeof ParityNeedsFixSchema>;
export type ParityFixTarget = z.infer<typeof ParityFixTargetSchema>;
export type ParityAssessment = z.infer<typeof ParityAssessmentSchema>;
export type TechDetail = z.infer<typeof TechDetailSchema>;
export type FlowNodeData = z.infer<typeof FlowNodeDataSchema>;
export type FlowEdgeData = z.infer<typeof FlowEdgeDataSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type SubtreeDefinition = z.infer<typeof SubtreeDefinitionSchema>;
export type FlowModuleFile = z.infer<typeof FlowModuleFileSchema>;
export type AppManifest = z.infer<typeof AppManifestSchema>;
export type BranchManifest = z.infer<typeof BranchManifestSchema>;

export interface FlowBranchInfo {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
}

export interface SourceFileMap {
  subtrees: Record<string, string>;
  moduleFiles: string[];
}

export interface MergedFlowDataset {
  app: AppManifest["app"];
  rootNode: FlowNodeData;
  branches: FlowNodeData[];
  branchEdges: FlowEdgeData[];
  subtreesByParentId: Record<string, SubtreeDefinition>;
  hasRealMedia?: boolean;
  existingMediaPaths?: string[];
  sourceFileMap?: SourceFileMap;
}
