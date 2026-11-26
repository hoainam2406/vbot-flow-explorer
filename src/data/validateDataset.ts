// src/data/validateDataset.ts
import {
  AppManifestSchema,
  FlowModuleFileSchema,
  type AppManifest,
  type FlowModuleFile,
  type SubtreeDefinition,
} from "./schema";

export function validateDataset(
  rawManifest: unknown,
  rawModules: unknown[],
): string[] {
  const errors: string[] = [];
  const manifestParsed = AppManifestSchema.safeParse(rawManifest);
  if (!manifestParsed.success) {
    return [`Invalid app.json: ${manifestParsed.error.message}`];
  }
  const manifest: AppManifest = manifestParsed.data;
  const modules: FlowModuleFile[] = [];

  rawModules.forEach((raw, idx) => {
    const modParsed = FlowModuleFileSchema.safeParse(raw);
    if (!modParsed.success) {
      errors.push(`Invalid module[${idx}]: ${modParsed.error.message}`);
    } else {
      modules.push(modParsed.data);
    }
  });
  if (errors.length > 0) return errors;

  const allNodeIds = new Set<string>();
  const registerNode = (id: string, ctx: string) => {
    if (allNodeIds.has(id)) {
      errors.push(`Duplicate node id "${id}" at ${ctx}`);
    }
    allNodeIds.add(id);
  };

  registerNode(manifest.rootNode.id, "rootNode");
  manifest.branches.forEach((b) => registerNode(b.id, `branches/${b.id}`));

  const subtrees: Record<string, SubtreeDefinition> = {
    ...(manifest.inlineSubtrees ?? {}),
  };
  const branchIds = new Set(manifest.branches.map((b) => b.id));

  for (const mod of modules) {
    if (!branchIds.has(mod.moduleId)) {
      errors.push(`Module "${mod.moduleId}" does not match any branch id`);
    }
    Object.assign(subtrees, mod.subtrees);
  }

  for (const [parentId, subtree] of Object.entries(subtrees)) {
    subtree.nodes.forEach((n) => registerNode(n.id, `subtree/${parentId}`));
  }

  // Validate references
  manifest.branchEdges.forEach((e) => {
    if (!allNodeIds.has(e.source) || !allNodeIds.has(e.target)) {
      errors.push(`Broken branchEdge "${e.id}": ${e.source} -> ${e.target}`);
    }
  });

  for (const [parentId, subtree] of Object.entries(subtrees)) {
    if (!allNodeIds.has(parentId)) {
      errors.push(`Subtree parent "${parentId}" does not exist`);
    }
    const localIds = new Set(subtree.nodes.map((n) => n.id));
    const localEdgeIds = new Set(subtree.edges.map((e) => e.id));

    for (const entryId of subtree.entryNodeIds) {
      if (!localIds.has(entryId)) {
        errors.push(
          `Subtree "${parentId}" entryNodeId "${entryId}" missing in local nodes`,
        );
      }
    }
    for (const edge of subtree.edges) {
      if (!localIds.has(edge.source) || !localIds.has(edge.target)) {
        errors.push(
          `Subtree "${parentId}" edge "${edge.id}" references missing node`,
        );
      }
    }
    for (const sc of subtree.scenarios ?? []) {
      sc.nodeIds.forEach((nid) => {
        if (!allNodeIds.has(nid)) {
          errors.push(`Scenario "${sc.id}" references missing node "${nid}"`);
        }
      });
      sc.edgeIds.forEach((eid) => {
        if (!localEdgeIds.has(eid)) {
          errors.push(
            `Scenario "${sc.id}" references missing edge "${eid}" in "${parentId}"`,
          );
        }
      });
    }
  }

  const checkRelated = (nodes: { id: string; relatedNodeIds?: string[] }[]) => {
    for (const n of nodes) {
      for (const rel of n.relatedNodeIds ?? []) {
        if (!allNodeIds.has(rel)) {
          errors.push(`Node "${n.id}" has broken relatedNodeId "${rel}"`);
        }
      }
    }
  };
  checkRelated([manifest.rootNode, ...manifest.branches]);
  Object.values(subtrees).forEach((s) => checkRelated(s.nodes));

  const seenParityCodes = new Map<string, string>();
  const checkParityCodes = (
    nodes: {
      id: string;
      techDetail?: { parityAssessment?: { code?: string } };
    }[],
  ) => {
    for (const n of nodes) {
      const code = n.techDetail?.parityAssessment?.code;
      if (!code) continue;
      const existingId = seenParityCodes.get(code);
      if (existingId) {
        errors.push(
          `Duplicate parity code "${code}" on node "${n.id}" (already used by "${existingId}")`,
        );
      } else {
        seenParityCodes.set(code, n.id);
      }
    }
  };
  checkParityCodes([manifest.rootNode, ...manifest.branches]);
  Object.values(subtrees).forEach((s) => checkParityCodes(s.nodes));

  return errors;
}
