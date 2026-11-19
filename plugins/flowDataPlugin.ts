// plugins/flowDataPlugin.ts
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { mergeDataset, sanitizeForPublic } from '../src/core/graphEngine';
import { validateDataset } from '../src/data/validateDataset';
import type { AppManifest, FlowModuleFile, FlowNodeData, MergedFlowDataset } from '../src/data/schema';

const VIRTUAL_ID = 'virtual:flow-dataset';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

export function collectTechOnlyMediaPaths(dataset: MergedFlowDataset): string[] {
  const publicSrcs = new Set<string>();
  const techSrcs = new Set<string>();
  const visitedParents = new Set<string>();

  const inspectNode = (node: FlowNodeData, parentIsTech = false) => {
    const nodeIsTech = parentIsTech || node.audience === 'tech';
    for (const m of node.media ?? []) {
      if (nodeIsTech || m.audience === 'tech') {
        techSrcs.add(m.src);
      } else {
        publicSrcs.add(m.src);
      }
    }
    const childSubtree = dataset.subtreesByParentId[node.id];
    if (childSubtree && !visitedParents.has(node.id)) {
      visitedParents.add(node.id);
      for (const child of childSubtree.nodes) {
        inspectNode(child, nodeIsTech);
      }
    }
  };

  inspectNode(dataset.rootNode);
  for (const branch of dataset.branches) {
    inspectNode(branch);
  }
  for (const [parentId, sub] of Object.entries(dataset.subtreesByParentId)) {
    if (visitedParents.has(parentId)) continue;
    visitedParents.add(parentId);
    for (const node of sub.nodes) {
      inspectNode(node, false);
    }
  }

  return [...techSrcs].filter((src) => !publicSrcs.has(src));
}

export function hasRealMediaFiles(rootDir: string, dataset: MergedFlowDataset): boolean {
  const publicDir = path.resolve(rootDir, 'public');
  const inspectNodes = (nodes: FlowNodeData[]): boolean => {
    for (const node of nodes) {
      for (const m of node.media ?? []) {
        const cleanRel = m.src.replace(/^\/+/, '');
        if (!cleanRel) continue;
        const fullPath = path.resolve(publicDir, cleanRel);
        if (fullPath.startsWith(publicDir + path.sep) && fs.existsSync(fullPath)) {
          return true;
        }
      }
    }
    return false;
  };

  if (inspectNodes([dataset.rootNode, ...dataset.branches])) {
    return true;
  }
  for (const sub of Object.values(dataset.subtreesByParentId)) {
    if (inspectNodes(sub.nodes)) {
      return true;
    }
  }
  return false;
}

export function loadMergedDataset(rootDir: string): MergedFlowDataset {
  const dataDir = path.join(rootDir, 'data');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'app.json'), 'utf8'),
  ) as AppManifest;
  const modules = manifest.moduleFiles.map((name) =>
    JSON.parse(
      fs.readFileSync(path.join(dataDir, 'modules', `${name}.json`), 'utf8'),
    ) as FlowModuleFile,
  );

  const errors = validateDataset(manifest, modules);
  if (errors.length > 0) {
    throw new Error(`Flow dataset validation error:\n${errors.join('\n')}`);
  }
  return mergeDataset(manifest, modules);
}

export function flowDataPlugin(buildTarget: 'public' | 'internal'): Plugin {
  let resolvedConfig: ResolvedConfig;
  let techOnlyMedia: string[] = [];

  return {
    name: 'vbot-flow-data',
    configResolved(config) {
      resolvedConfig = config;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      const merged = loadMergedDataset(resolvedConfig.root);
      techOnlyMedia = collectTechOnlyMediaPaths(merged);
      const output = buildTarget === 'public' ? sanitizeForPublic(merged) : merged;
      const payload: MergedFlowDataset = {
        ...output,
        hasRealMedia: hasRealMediaFiles(resolvedConfig.root, output),
      };
      return `export default ${JSON.stringify(payload)};`;
    },
    handleHotUpdate({ file, server }) {
      const dataPrefix = path.join(resolvedConfig.root, 'data') + path.sep;
      if (file.startsWith(dataPrefix) && file.endsWith('.json')) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    closeBundle() {
      if (buildTarget !== 'public') return;
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      for (const relSrc of techOnlyMedia) {
        const cleanRel = relSrc.replace(/^\/+/, '');
        const targetFile = path.resolve(outDir, cleanRel);
        if (targetFile.startsWith(outDir + path.sep) && fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile);
        }
      }
    },
  };
}
