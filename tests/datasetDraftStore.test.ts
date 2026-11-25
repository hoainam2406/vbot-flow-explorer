// tests/datasetDraftStore.test.ts
import { describe, expect, it } from 'vitest';
import {
  applyDraftPatchesToDataset,
  applyDraftPatchesToRawFiles,
  buildDraftDiffSummary,
  DRAFT_PATCHES_STORAGE_KEY,
  getDraftStorageKey,
  parseImportedPatchesJson,
  summarizeDraftPatch,
  type DraftPatch,
} from '../src/core/datasetDraftStore';
import { mergeDataset } from '../src/core/graphEngine';
import type { AppManifest, FlowModuleFile } from '../src/data/schema';

const sampleManifest: AppManifest = {
  schemaVersion: '1.0',
  app: { name: 'VBot', tagline: 'Test' },
  rootNode: {
    id: 'vbot-app',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root' },
  },
  branches: [
    {
      id: 'mod-a',
      label: 'Nhánh A',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Module A' },
    },
    {
      id: 'mod-inline',
      label: 'Nhánh Inline',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Inline' },
    },
  ],
  branchEdges: [
    { id: 'e-root-a', source: 'vbot-app', target: 'mod-a' },
    { id: 'e-root-inline', source: 'vbot-app', target: 'mod-inline' },
  ],
  moduleFiles: ['a'],
  inlineSubtrees: {
    'mod-inline': {
      title: 'Inline',
      layoutHint: 'tree',
      entryNodeIds: ['in-1'],
      nodes: [
        {
          id: 'in-1',
          label: 'Inline Step 1',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Step 1' },
        },
      ],
      edges: [],
    },
  },
};

const sampleModA: FlowModuleFile = {
  schemaVersion: '1.0',
  moduleId: 'mod-a',
  subtrees: {
    'mod-a': {
      title: 'Sub A',
      layoutHint: 'flow',
      entryNodeIds: ['a-1'],
      nodes: [
        {
          id: 'a-1',
          label: 'Bước A1',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'A1' },
          relatedNodeIds: ['a-2'],
        },
        {
          id: 'a-2',
          label: 'Bước A2',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'A2' },
        },
      ],
      edges: [{ id: 'e-a12', source: 'a-1', target: 'a-2' }],
      scenarios: [
        {
          id: 'sc-a',
          name: 'Scenario A',
          nodeIds: ['a-1', 'a-2'],
          edgeIds: ['e-a12'],
        },
      ],
    },
  },
};

describe('datasetDraftStore', () => {
  it('applies update_node, add_node, and delete_node patches cleanly to runtime dataset and raw files', () => {
    const base = mergeDataset(sampleManifest, [sampleModA]);
    const patches: DraftPatch[] = [
      {
        id: 'p1',
        timestamp: 1000,
        kind: 'update_node',
        nodeId: 'a-1',
        node: {
          ...sampleModA.subtrees['mod-a'].nodes[0],
          label: 'Bước A1 (Đã sửa)',
          meta: { status: 'wip', owner: 'Nam' },
        },
      },
      {
        id: 'p2',
        timestamp: 2000,
        kind: 'add_node',
        parentId: 'mod-a',
        connectFromNodeId: 'a-1',
        edgeLabel: 'Tiếp',
        node: {
          id: 'a-3',
          label: 'Bước A3 mới',
          kind: 'action',
          audience: 'tech',
          summary: { overview: 'New step' },
        },
      },
      {
        id: 'p3',
        timestamp: 3000,
        kind: 'delete_node',
        nodeId: 'a-2',
      },
    ];

    expect(summarizeDraftPatch(patches[0])).toContain('Bước A1 (Đã sửa)');

    const runtime = applyDraftPatchesToDataset(base, patches);
    expect(runtime.errors).toEqual([]);
    const subNodes = runtime.dataset.subtreesByParentId['mod-a'].nodes;
    expect(subNodes.map((n) => n.id)).toEqual(['a-1', 'a-3']);
    expect(subNodes[0].label).toBe('Bước A1 (Đã sửa)');
    expect(subNodes[0].relatedNodeIds).toBeUndefined();
    expect(runtime.dataset.subtreesByParentId['mod-a'].scenarios?.[0].nodeIds).toEqual(['a-1']);

    const raw = applyDraftPatchesToRawFiles(sampleManifest, { a: sampleModA }, patches);
    expect(raw.errors).toEqual([]);
    expect(raw.changedFiles).toEqual(['modules/a.json']);
    expect(raw.modulesByFile.a.subtrees['mod-a'].nodes.map((n) => n.id)).toEqual(['a-1', 'a-3']);
    expect(raw.modulesByFile.a.subtrees['mod-a'].edges.map((e) => e.id)).toEqual(['e-a-1-a-3']);
  });

  it('routes newly created nested subtrees to the owning module file and rejects deleting rootNode', () => {
    const patches: DraftPatch[] = [
      {
        id: 'p-nest',
        timestamp: 1000,
        kind: 'add_node',
        parentId: 'a-1',
        node: {
          id: 'a-1-child',
          label: 'Con của A1',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'Child' },
        },
      },
    ];
    const raw = applyDraftPatchesToRawFiles(sampleManifest, { a: sampleModA }, patches);
    expect(raw.errors).toEqual([]);
    expect(raw.changedFiles).toEqual(['modules/a.json']);
    expect(raw.modulesByFile.a.subtrees['a-1'].nodes).toHaveLength(1);

    const badDelete = applyDraftPatchesToRawFiles(
      sampleManifest,
      { a: sampleModA },
      [{ id: 'p-root', timestamp: 1, kind: 'delete_node', nodeId: 'vbot-app' }],
    );
    expect(badDelete.errors.length).toBeGreaterThan(0);
  });

  it('handles update_edge, upsert_scenario, delete_scenario, patch import and diff summary', () => {
    const base = mergeDataset(sampleManifest, [sampleModA]);
    const patches: DraftPatch[] = [
      {
        id: 'pe',
        timestamp: 100,
        kind: 'update_edge',
        parentId: 'mod-a',
        edgeId: 'e-a12',
        edge: { id: 'e-a12', source: 'a-1', target: 'a-2', label: 'Điều kiện mới' },
      },
      {
        id: 'ps1',
        timestamp: 200,
        kind: 'upsert_scenario',
        parentId: 'mod-a',
        scenario: {
          id: 'sc-new',
          name: 'Kịch bản mới',
          nodeIds: ['a-1', 'a-2'],
          edgeIds: ['e-a12'],
        },
      },
    ];

    const imported = parseImportedPatchesJson(JSON.stringify({ patches }));
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.patches).toHaveLength(2);
    }
    expect(parseImportedPatchesJson('{bad').ok).toBe(false);

    const runtime = applyDraftPatchesToDataset(base, patches);
    expect(runtime.errors).toEqual([]);
    expect(runtime.dataset.subtreesByParentId['mod-a'].edges[0].label).toBe('Điều kiện mới');
    expect(runtime.dataset.subtreesByParentId['mod-a'].scenarios).toHaveLength(2);

    const diff = buildDraftDiffSummary(base, runtime.dataset);
    expect(diff.edgesChanged).toBe(1);
    expect(diff.scenariosChanged).toBe(1);

    const raw = applyDraftPatchesToRawFiles(sampleManifest, { a: sampleModA }, [
      ...patches,
      { id: 'ps2', timestamp: 300, kind: 'delete_scenario', parentId: 'mod-a', scenarioId: 'sc-a' },
    ]);
    expect(raw.errors).toEqual([]);
    expect(raw.modulesByFile.a.subtrees['mod-a'].scenarios?.map((s) => s.id)).toEqual(['sc-new']);
  });

  it('scopes draft patch storage key per branch while preserving default Nam-dev key', () => {
    expect(getDraftStorageKey()).toBe(DRAFT_PATCHES_STORAGE_KEY);
    expect(getDraftStorageKey('Nam-dev')).toBe(DRAFT_PATCHES_STORAGE_KEY);
    expect(getDraftStorageKey('Nam-dev-SBSI')).toBe(`${DRAFT_PATCHES_STORAGE_KEY}:Nam-dev-SBSI`);
  });
});
