// src/data/schema.ts
import { z } from 'zod';

export const NodeKindSchema = z.enum([
  'module',
  'miniapp',
  'action',
  'process',
  'decision',
  'external',
  'error',
]);

export const AudienceScopeSchema = z.enum(['all', 'tech']);

export const MediaItemSchema = z.object({
  src: z.string().min(1),
  caption: z.string().min(1),
  type: z.enum(['image', 'video']).optional(),
  frame: z.enum(['phone', 'none']).optional(),
  audience: AudienceScopeSchema.optional(),
});

export const BridgeMessageSchema = z.object({
  direction: z.enum(['host_init', 'host_to_miniapp', 'miniapp_to_host']),
  name: z.string().min(1),
  hostFn: z.string().min(1).optional(),
  miniAppFn: z.string().min(1).optional(),
  payload: z.string().optional(),
  response: z.string().optional(),
  examplePayload: z.string().min(1).optional(),
  exampleResponse: z.string().min(1).optional(),
  note: z.string().optional(),
});

export const MiniAppBridgeSchema = z.object({
  miniAppId: z.string().min(1),
  embedMode: z.enum(['inline_tab', 'modal', 'sdk_global']),
  transport: z.string().optional(),
  messages: z.array(BridgeMessageSchema).min(1),
});

export const TechDetailSchema = z.object({
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  apisOrEvents: z.array(z.string()).optional(),
  edgeCases: z.array(z.string()).optional(),
  codeRefs: z.array(z.string()).optional(),
  miniAppBridge: MiniAppBridgeSchema.optional(),
});

export const FlowNodeDataSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: NodeKindSchema,
  audience: AudienceScopeSchema,
  summary: z.object({
    overview: z.string().min(1),
    tech: z.string().optional(),
  }),
  media: z.array(MediaItemSchema).optional(),
  techDetail: TechDetailSchema.optional(),
  relatedNodeIds: z.array(z.string()).optional(),
});

export const FlowEdgeDataSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  audience: AudienceScopeSchema.optional(),
});

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  audience: AudienceScopeSchema.optional(),
  nodeIds: z.array(z.string()),
  edgeIds: z.array(z.string()),
});

export const SubtreeDefinitionSchema = z.object({
  title: z.string().min(1),
  layoutHint: z.enum(['tree', 'flow']),
  direction: z.enum(['LR', 'TB']).optional(),
  entryNodeIds: z.array(z.string().min(1)).min(1),
  nodes: z.array(FlowNodeDataSchema).min(1),
  edges: z.array(FlowEdgeDataSchema),
  scenarios: z.array(ScenarioSchema).optional(),
});

export const FlowModuleFileSchema = z.object({
  schemaVersion: z.literal('1.0'),
  moduleId: z.string().min(1),
  subtrees: z.record(z.string(), SubtreeDefinitionSchema),
});

export const AppManifestSchema = z.object({
  schemaVersion: z.literal('1.0'),
  app: z.object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    version: z.string().optional(),
  }),
  rootNode: FlowNodeDataSchema,
  branches: z.array(FlowNodeDataSchema).min(1),
  branchEdges: z.array(FlowEdgeDataSchema),
  moduleFiles: z.array(z.string()),
  inlineSubtrees: z.record(z.string(), SubtreeDefinitionSchema).optional(),
});

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type AudienceScope = z.infer<typeof AudienceScopeSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;
export type MiniAppBridge = z.infer<typeof MiniAppBridgeSchema>;
export type TechDetail = z.infer<typeof TechDetailSchema>;
export type FlowNodeData = z.infer<typeof FlowNodeDataSchema>;
export type FlowEdgeData = z.infer<typeof FlowEdgeDataSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type SubtreeDefinition = z.infer<typeof SubtreeDefinitionSchema>;
export type FlowModuleFile = z.infer<typeof FlowModuleFileSchema>;
export type AppManifest = z.infer<typeof AppManifestSchema>;

export interface MergedFlowDataset {
  app: AppManifest['app'];
  rootNode: FlowNodeData;
  branches: FlowNodeData[];
  branchEdges: FlowEdgeData[];
  subtreesByParentId: Record<string, SubtreeDefinition>;
}
