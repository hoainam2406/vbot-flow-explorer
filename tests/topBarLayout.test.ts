// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TopBar from '../src/components/TopBar.vue';
import { createFlowExplorerState, FLOW_EXPLORER_KEY } from '../src/composables/useFlowExplorer';
import type { LocalGitStatusResult } from '../src/core/sourcePeekClient';
import type { FlowBranchInfo, MergedFlowDataset } from '../src/data/schema';

const minimalDataset: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test', version: '2.0', techBranch: 'Nam-dev-SBSI' },
  rootNode: {
    id: 'root',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'Root', tech: 'Root tech' },
    techDetail: {
      platformDiffNote: 'Khác biệt iOS và Android tại root',
    },
  },
  branches: [
    {
      id: 'b1',
      label: 'Gọi thoại',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Calling' },
    },
  ],
  branchEdges: [{ id: 'e-root-b1', source: 'root', target: 'b1' }],
  subtreesByParentId: {},
};

const availableBranches: FlowBranchInfo[] = [
  { id: 'Nam-dev', label: 'Nam-dev', isDefault: true },
  { id: 'Nam-dev-SBSI', label: 'Nam-dev-SBSI', description: 'Nhánh SBSI' },
];

const sampleGitStatus: LocalGitStatusResult = {
  ok: true,
  ios: {
    branch: 'Nam-dev-SBSI',
    dirtyCount: 10,
    changedFiles: [],
  },
  android: {
    branch: 'Nam-dev-other',
    dirtyCount: 8,
    changedFiles: [],
  },
};

function mountTopBar(options?: {
  audienceMode?: 'overview' | 'tech';
  localGitStatus?: LocalGitStatusResult | null;
}) {
  const explorer = createFlowExplorerState(minimalDataset, true);
  explorer.setAudienceMode(options?.audienceMode ?? 'tech');

  return mount(TopBar, {
    props: {
      availableBranches,
      activeBranchId: 'Nam-dev-SBSI',
      localGitStatus: options?.localGitStatus ?? sampleGitStatus,
    },
    global: {
      provide: {
        [FLOW_EXPLORER_KEY as symbol]: explorer,
      },
    },
  });
}

describe('TopBar single-row reorganized layout', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders all 4 Workspace tabs with parity count and emits openParity', async () => {
    const wrapper = mountTopBar({ audienceMode: 'tech' });
    await flushPromises();

    const workspaceGroup = wrapper.get('[data-tour="topbar-workspaces"]');
    const text = workspaceGroup.text();
    expect(text).toContain('Sơ đồ luồng');
    expect(text).toContain('Chênh lệch');
    expect(text).toContain('Mini App Studio');
    expect(text).toContain('Dev Tools');

    const parityBtn = workspaceGroup
      .findAll('button')
      .find((btn) => btn.text().includes('Chênh lệch'));
    expect(parityBtn).toBeDefined();
    await vi.waitFor(() => {
      expect(parityBtn!.text()).toContain('1');
    });

    await parityBtn!.trigger('click');
    expect(wrapper.emitted('openParity')).toHaveLength(1);
  });

  it('merges Local Git dirty badge & mismatch details into the branch dropdown', async () => {
    const wrapper = mountTopBar({ audienceMode: 'tech' });
    await flushPromises();

    const branchContainer = wrapper.get('[data-tour="topbar-branch"]');
    const triggerBtn = branchContainer.get('button[aria-haspopup="menu"]');
    expect(triggerBtn.text()).toContain('Nam-dev-SBSI');
    expect(triggerBtn.text()).toContain('18');
    expect(triggerBtn.classes().join(' ')).toContain('border-amber-300');

    await triggerBtn.trigger('click');

    const menu = branchContainer.get('[role="menu"]');
    expect(menu.text()).toContain('Git Local đang checkout');
    expect(menu.text()).toContain('iOS');
    expect(menu.text()).toContain('10 sửa');
    expect(menu.text()).toContain('Android');
    expect(menu.text()).toContain('Nam-dev-other');
    expect(menu.text()).toContain('8 sửa');
    expect(menu.text()).toContain('Nhánh local đang khác nhánh đối soát');

    const highlightBtn = menu
      .findAll('button')
      .find((btn) => btn.text().includes('Tô sáng 18 file đang sửa trên sơ đồ'));
    expect(highlightBtn).toBeDefined();

    await highlightBtn!.trigger('click');
    expect(wrapper.emitted('highlightGitDirty')).toHaveLength(1);
  });

  it('does not render ExportMenu or TechPlatformSwitcher inside TopBar', async () => {
    const wrapper = mountTopBar({ audienceMode: 'tech' });
    await flushPromises();

    expect(wrapper.find('[data-tour="topbar-export"]').exists()).toBe(false);
    expect(wrapper.find('[data-tour="topbar-platform"]').exists()).toBe(false);
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').exists()).toBe(false);
  });
});
