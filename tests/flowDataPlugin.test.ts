// tests/flowDataPlugin.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyDevPatchesToDisk,
  buildSourceFileMap,
  collectExistingMediaPaths,
  collectTechOnlyMediaPaths,
  createVbotWorkTaskOnServer,
  DevPatchError,
  hasRealMediaFiles,
  resolveVbotWorkAuthHeader,
} from '../plugins/flowDataPlugin';
import type { AppManifest, FlowModuleFile, MergedFlowDataset } from '../src/data/schema';

describe('collectTechOnlyMediaPaths', () => {
  it('excludes media paths also referenced by audience=all items', () => {
    const dataset: MergedFlowDataset = {
      app: { name: 'VBot', tagline: 'Test' },
      rootNode: {
        id: 'root',
        label: 'Root',
        kind: 'module',
        audience: 'all',
        summary: { overview: 'R' },
        media: [
          { src: '/media/shared.webp', caption: 'Shared', audience: 'all' },
          { src: '/media/tech-only.webp', caption: 'Tech', audience: 'tech' },
        ],
      },
      branches: [
        {
          id: 'b-tech',
          label: 'Tech Branch',
          kind: 'process',
          audience: 'tech',
          summary: { overview: 'T' },
          media: [{ src: '/media/shared.webp', caption: 'Also shared' }],
        },
      ],
      branchEdges: [],
      subtreesByParentId: {},
    };

    const paths = collectTechOnlyMediaPaths(dataset);
    expect(paths).toEqual(['/media/tech-only.webp']);
  });

  it('collects media inside nested tech node subtrees as tech-only', () => {
    const dataset: MergedFlowDataset = {
      app: { name: 'VBot', tagline: 'Test' },
      rootNode: {
        id: 'root',
        label: 'Root',
        kind: 'module',
        audience: 'all',
        summary: { overview: 'R' },
      },
      branches: [
        {
          id: 'b-all',
          label: 'Public Branch',
          kind: 'module',
          audience: 'all',
          summary: { overview: 'P' },
        },
      ],
      branchEdges: [],
      subtreesByParentId: {
        'b-all': {
          title: 'Sub',
          layoutHint: 'flow',
          entryNodeIds: ['n-tech'],
          nodes: [
            {
              id: 'n-tech',
              label: 'Tech Parent',
              kind: 'process',
              audience: 'tech',
              summary: { overview: 'T' },
            },
          ],
          edges: [],
        },
        'n-tech': {
          title: 'Nested under tech',
          layoutHint: 'flow',
          entryNodeIds: ['n-deep'],
          nodes: [
            {
              id: 'n-deep',
              label: 'Deep Child',
              kind: 'action',
              audience: 'all',
              summary: { overview: 'D' },
              media: [{ src: '/media/nested-tech.webp', caption: 'Hidden by parent' }],
            },
          ],
          edges: [],
        },
      },
    };

    expect(collectTechOnlyMediaPaths(dataset)).toEqual(['/media/nested-tech.webp']);
  });

  it('detects whether any referenced media files actually exist under public/', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-media-test-'));
    try {
      const publicMediaDir = path.join(tmpRoot, 'public', 'media', 'app');
      fs.mkdirSync(publicMediaDir, { recursive: true });

      const dataset: MergedFlowDataset = {
        app: { name: 'VBot', tagline: 'Test' },
        rootNode: {
          id: 'root',
          label: 'Root',
          kind: 'module',
          audience: 'all',
          summary: { overview: 'R' },
          media: [
            { src: '/media/app/vbot-home.webp', caption: 'Home', audience: 'all' },
            { src: '../../package.json', caption: 'Outside traversal' },
          ],
        },
        branches: [],
        branchEdges: [],
        subtreesByParentId: {},
      };

      expect(hasRealMediaFiles(tmpRoot, dataset)).toBe(false);

      fs.writeFileSync(path.join(publicMediaDir, 'vbot-home.webp'), 'stub-webp');
      expect(hasRealMediaFiles(tmpRoot, dataset)).toBe(true);
      expect(collectExistingMediaPaths(tmpRoot, dataset)).toEqual(['/media/app/vbot-home.webp']);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('maps inlineSubtrees and module subtrees back to their source files', () => {
    const manifest: AppManifest = {
      schemaVersion: '1.0',
      app: { name: 'VBot', tagline: 'Test' },
      rootNode: { id: 'root', label: 'Root', kind: 'module', audience: 'all', summary: { overview: 'R' } },
      branches: [{ id: 'mod-a', label: 'A', kind: 'module', audience: 'all', summary: { overview: 'A' } }],
      branchEdges: [],
      moduleFiles: ['calling'],
      inlineSubtrees: {
        'mod-inline': {
          title: 'Inline',
          layoutHint: 'tree',
          entryNodeIds: ['i1'],
          nodes: [{ id: 'i1', label: 'I1', kind: 'action', audience: 'all', summary: { overview: 'I1' } }],
          edges: [],
        },
      },
    };
    const modCalling: FlowModuleFile = {
      schemaVersion: '1.0',
      moduleId: 'mod-a',
      subtrees: {
        'mod-a': {
          title: 'Calling',
          layoutHint: 'flow',
          entryNodeIds: ['c1'],
          nodes: [{ id: 'c1', label: 'C1', kind: 'action', audience: 'all', summary: { overview: 'C1' } }],
          edges: [],
        },
      },
    };
    const map = buildSourceFileMap(manifest, [modCalling]);
    expect(map.moduleFiles).toEqual(['calling']);
    expect(map.subtrees).toEqual({
      'mod-inline': 'app.json',
      'mod-a': 'modules/calling.json',
    });
  });

  it('applies valid patches atomically to disk and rejects invalid/path-traversal payloads', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-dev-patch-'));
    try {
      const dataDir = path.join(tmpRoot, 'data');
      const modulesDir = path.join(dataDir, 'modules');
      fs.mkdirSync(modulesDir, { recursive: true });

      const manifest: AppManifest = {
        schemaVersion: '1.0',
        app: { name: 'VBot', tagline: 'Test' },
        rootNode: { id: 'root', label: 'Root', kind: 'module', audience: 'all', summary: { overview: 'R' } },
        branches: [{ id: 'mod-a', label: 'A', kind: 'module', audience: 'all', summary: { overview: 'A' } }],
        branchEdges: [],
        moduleFiles: ['calling'],
      };
      const modCalling: FlowModuleFile = {
        schemaVersion: '1.0',
        moduleId: 'mod-a',
        subtrees: {
          'mod-a': {
            title: 'Calling',
            layoutHint: 'flow',
            entryNodeIds: ['c1'],
            nodes: [{ id: 'c1', label: 'C1', kind: 'action', audience: 'all', summary: { overview: 'C1' } }],
            edges: [],
          },
        },
      };

      fs.writeFileSync(path.join(dataDir, 'app.json'), JSON.stringify(manifest, null, 2));
      fs.writeFileSync(path.join(modulesDir, 'calling.json'), JSON.stringify(modCalling, null, 2));

      const res = applyDevPatchesToDisk(tmpRoot, [
        {
          id: 'p1',
          timestamp: 1000,
          kind: 'update_node',
          nodeId: 'c1',
          node: {
            id: 'c1',
            label: 'C1 Updated',
            kind: 'action',
            audience: 'all',
            summary: { overview: 'Updated C1' },
          },
        },
      ]);
      expect(res.ok).toBe(true);
      expect(res.changedFiles).toEqual(['modules/calling.json']);

      const updatedMod = JSON.parse(
        fs.readFileSync(path.join(modulesDir, 'calling.json'), 'utf8'),
      ) as FlowModuleFile;
      expect(updatedMod.subtrees['mod-a'].nodes[0].label).toBe('C1 Updated');

      // Reject invalid dataset edge (dangling target) without touching disk
      expect(() =>
        applyDevPatchesToDisk(tmpRoot, [
          {
            id: 'p2',
            timestamp: 2000,
            kind: 'add_edge',
            parentId: 'mod-a',
            edge: { id: 'e-bad', source: 'c1', target: 'non-existent' },
          },
        ]),
      ).toThrowError(DevPatchError);

      const unchangedMod = JSON.parse(
        fs.readFileSync(path.join(modulesDir, 'calling.json'), 'utf8'),
      ) as FlowModuleFile;
      expect(unchangedMod.subtrees['mod-a'].edges).toEqual([]);

      // Reject path traversal in moduleFiles whitelist
      const badManifest: AppManifest = {
        ...manifest,
        moduleFiles: ['../secret'],
      };
      fs.writeFileSync(path.join(dataDir, 'app.json'), JSON.stringify(badManifest, null, 2));
      expect(() =>
        applyDevPatchesToDisk(tmpRoot, [
          {
            id: 'p3',
            timestamp: 3000,
            kind: 'update_node',
            nodeId: 'c1',
            node: {
              id: 'c1',
              label: 'Should fail',
              kind: 'action',
              audience: 'all',
              summary: { overview: 'Fail' },
            },
          },
        ]),
      ).toThrowError(DevPatchError);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('resolves VBot Work auth headers and creates tasks with fixed vbot-mobile & Hoài Nam defaults', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-work-root-'));
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vbot-work-home-'));

    try {
      expect(resolveVbotWorkAuthHeader(tmpRoot, {}, tmpHome)).toBeNull();
      expect(resolveVbotWorkAuthHeader(tmpRoot, { VBOT_WORK_TOKEN: 'raw-tok' }, tmpHome)).toBe(
        'Bearer raw-tok',
      );
      expect(
        resolveVbotWorkAuthHeader(tmpRoot, { VBOT_WORK_TOKEN: 'Bearer keep-tok' }, tmpHome),
      ).toBe('Bearer keep-tok');

      const geminiCfgDir = path.join(tmpHome, '.gemini', 'antigravity');
      fs.mkdirSync(geminiCfgDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiCfgDir, 'mcp_config.json'),
        JSON.stringify({
          mcpServers: {
            'vbot-work': {
              headers: { Authorization: 'Bearer mcp-secret-token' },
            },
          },
        }),
      );
      expect(resolveVbotWorkAuthHeader(tmpRoot, {}, tmpHome)).toBe('Bearer mcp-secret-token');

      fs.writeFileSync(path.join(tmpRoot, '.env.local'), 'VBOT_WORK_TOKEN="env-local-tok"\n');
      expect(resolveVbotWorkAuthHeader(tmpRoot, {}, tmpHome)).toBe('Bearer env-local-tok');

      let capturedUrl = '';
      let capturedAuth = '';
      let capturedBody: Record<string, unknown> = {};

      const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        const headers = init?.headers as Record<string, string>;
        capturedAuth = headers.Authorization;
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: 'task-700',
            number: 700,
            title: 'Parity Task Title',
            projectSlug: 'VbM',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch;

      const created = await createVbotWorkTaskOnServer(
        tmpRoot,
        {
          title: 'Parity Task Title',
          description: 'Detail body',
          priority: 'high',
        },
        { env: {}, homeDir: tmpHome, fetchImpl: mockFetch },
      );

      expect(capturedUrl).toBe('https://work.vpmedia.vn/api/task/us0ldnoyj97idvvhjm7wjnfs');
      expect(capturedAuth).toBe('Bearer env-local-tok');
      expect(capturedBody).toEqual({
        title: 'Parity Task Title',
        description: 'Detail body',
        priority: 'high',
        status: 'to-do',
        userId: 'tam2836x9f3Icten824YV2UDcuQX4WDx',
      });
      expect(created.ok).toBe(true);
      expect(created.task.key).toBe('VbM-700');
      expect(created.task.projectName).toBe('vbot-mobile');
      expect(created.task.assigneeName).toBe('Hoài Nam');
      expect(created.task.url).toBe(
        'https://work.vpmedia.vn/dashboard/workspace/hWPuKo7SL4lPvs176L5epSN3OStLwhtl/project/us0ldnoyj97idvvhjm7wjnfs/task/task-700',
      );

      await expect(
        createVbotWorkTaskOnServer(tmpRoot, { title: '   ' }, { env: {}, homeDir: tmpHome }),
      ).rejects.toMatchObject({ statusCode: 400 });

      fs.rmSync(path.join(tmpRoot, '.env.local'));
      fs.rmSync(path.join(geminiCfgDir, 'mcp_config.json'));
      await expect(
        createVbotWorkTaskOnServer(
          tmpRoot,
          { title: 'Valid title' },
          { env: {}, homeDir: tmpHome },
        ),
      ).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
