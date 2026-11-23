<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Grid2x2,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Search,
  ShieldCheck,
  Terminal,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard, downloadTextFile } from '../core/downloadHelper';
import {
  loadStudioBannerDismissed,
  saveStudioBannerDismissed,
  STUDIO_TOUR_STEPS,
  type BridgeModalTabId,
  type StudioQuickRecipe,
} from '../core/miniAppStudioGuide';
import {
  BRIDGE_PARITY_ALERTS,
  CORE_BRIDGE_SPECS,
  exportMiniAppBridgeMarkdown,
  MINI_APP_CATALOG,
  MINI_APP_SIMULATOR_FLOWS,
  resolveActionFlowTarget,
  type CoreBridgeSpecItem,
  type MiniAppCatalogEntry,
} from '../data/miniAppBridgeCatalog';
import BridgeFlowSimulator from './BridgeFlowSimulator.vue';
import JsonCodeBlock from './JsonCodeBlock.vue';
import MiniAppDevStudio from './MiniAppDevStudio.vue';
import MiniAppPermissionsPanel from './MiniAppPermissionsPanel.vue';
import MiniAppStudioGuidePopover from './MiniAppStudioGuidePopover.vue';
import MiniAppStudioTourOverlay from './MiniAppStudioTourOverlay.vue';
import TechPlatformSwitcher from './TechPlatformSwitcher.vue';

export interface MiniAppBridgeLaunchContext {
  tab?: 'sandbox' | 'simulator' | 'protocol' | 'catalog' | 'permissions' | 'parity';
  flowId?: string;
  subFlowId?: string;
  miniAppId?: string;
}

const props = defineProps<{
  open: boolean;
  initialContext?: MiniAppBridgeLaunchContext | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { pushToast } = useToast();

type ModalTab = 'sandbox' | 'simulator' | 'protocol' | 'catalog' | 'permissions' | 'parity';

const activeTab = ref<ModalTab>('sandbox');
const sidebarCollapsed = ref(false);
const studioAppId = ref<string>('vb-ma-autodial');
const devStudioRef = ref<InstanceType<typeof MiniAppDevStudio> | null>(null);
const guidePopoverOpen = ref(false);
const tourActive = ref(false);
const tourStepIndex = ref(0);
const studioBannerDismissed = ref(loadStudioBannerDismissed());
const selectedFlowId = ref<string>(MINI_APP_SIMULATOR_FLOWS[0]?.id ?? 'flow-autodial');
const selectedSubFlowId = ref<string | undefined>(undefined);
const permissionsFilterAppId = ref('');

const protocolQuery = ref('');
const selectedDirection = ref<'all' | CoreBridgeSpecItem['direction']>('all');
const selectedCategory = ref<'all' | CoreBridgeSpecItem['category']>('all');

const catalogQuery = ref('');
const selectedPlacement = ref<'all' | MiniAppCatalogEntry['placement']>('all');
const selectedBridgeTier = ref<'all' | MiniAppCatalogEntry['bridgeTier']>('all');

const copiedKey = ref<string | null>(null);
const copiedSpecMd = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
let specResetTimer: ReturnType<typeof setTimeout> | null = null;

const close = () => {
  emit('update:open', false);
};

const jumpToCanvasNode = (nodeId: string) => {
  close();
  explorer.jumpToNode(nodeId);
};

const openPermissionsForApp = (appId: string) => {
  permissionsFilterAppId.value = appId;
  activeTab.value = 'permissions';
};

const openDevStudioForApp = (appId: string) => {
  studioAppId.value = appId;
  activeTab.value = 'sandbox';
};

const startStudioTour = async () => {
  guidePopoverOpen.value = false;
  activeTab.value = 'sandbox';
  tourStepIndex.value = 0;
  await nextTick();
  const firstStep = STUDIO_TOUR_STEPS[0];
  if (firstStep) {
    await devStudioRef.value?.prepareForTourStep(firstStep);
  }
  tourActive.value = true;
};

const handleTourStepChange = async (nextIdx: number) => {
  tourStepIndex.value = nextIdx;
  await nextTick();
  const step = STUDIO_TOUR_STEPS[nextIdx];
  if (step) {
    await devStudioRef.value?.prepareForTourStep(step);
  }
};

const handleTourClose = (completed: boolean) => {
  tourActive.value = false;
  if (completed) {
    saveStudioBannerDismissed(true);
    studioBannerDismissed.value = true;
    devStudioRef.value?.setBannerDismissed(true);
  }
};

const handleRunQuickRecipe = async (recipe: StudioQuickRecipe) => {
  guidePopoverOpen.value = false;
  tourActive.value = false;
  activeTab.value = 'sandbox';
  await nextTick();
  await devStudioRef.value?.runQuickRecipe(recipe);
};

const handleRestoreBanner = async () => {
  saveStudioBannerDismissed(false);
  studioBannerDismissed.value = false;
  guidePopoverOpen.value = false;
  activeTab.value = 'sandbox';
  await nextTick();
  devStudioRef.value?.setBannerDismissed(false);
};

const handleGuideJumpTab = (tab: BridgeModalTabId) => {
  guidePopoverOpen.value = false;
  if (tab !== 'permissions') {
    permissionsFilterAppId.value = '';
  }
  activeTab.value = tab;
};

const getFlowSubCount = (flowId?: string): number => {
  if (!flowId) return 0;
  return MINI_APP_SIMULATOR_FLOWS.find((f) => f.id === flowId)?.subFlows?.length ?? 0;
};

const runSimulatorFlow = (flowId: string, subFlowId?: string) => {
  selectedFlowId.value = flowId;
  selectedSubFlowId.value = subFlowId;
  activeTab.value = 'simulator';
};

const runActionChip = (action: string, app: MiniAppCatalogEntry) => {
  const target = resolveActionFlowTarget(action, app.id);
  if (target) {
    runSimulatorFlow(target.flowId, target.subFlowId);
    return;
  }
  if (app.simulatorFlowId) {
    runSimulatorFlow(app.simulatorFlowId);
  }
};

const copyValue = async (key: string, value: string) => {
  const ok = await copyTextToClipboard(value);
  if (ok) {
    copiedKey.value = key;
    pushToast('Đã sao chép vào clipboard', 'success');
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  }
};

const copyMarkdownSpec = async () => {
  const ok = await copyTextToClipboard(exportMiniAppBridgeMarkdown());
  if (ok) {
    copiedSpecMd.value = true;
    pushToast('Đã sao chép Spec Markdown', 'success');
    if (specResetTimer) clearTimeout(specResetTimer);
    specResetTimer = setTimeout(() => {
      copiedSpecMd.value = false;
    }, 2000);
  }
};

const downloadMarkdownSpec = () => {
  downloadTextFile(
    'vbot-miniapp-bridge-spec.md',
    exportMiniAppBridgeMarkdown(),
    'text/markdown;charset=utf-8',
  );
  pushToast('Đã tải file Spec Markdown (.md)', 'success');
};

const DIRECTION_OPTIONS: Array<{
  id: 'all' | CoreBridgeSpecItem['direction'];
  label: string;
}> = [
  { id: 'all', label: 'Tất cả chiều' },
  { id: 'launch_param', label: 'Launch Params' },
  { id: 'miniapp_to_host', label: 'Mini App → Host' },
  { id: 'host_action', label: 'Custom Host Action' },
  { id: 'host_to_miniapp', label: 'Host → Mini App' },
];

const CATEGORY_OPTIONS: Array<{
  id: 'all' | CoreBridgeSpecItem['category'];
  label: string;
}> = [
  { id: 'all', label: 'Mọi nhóm' },
  { id: 'lifecycle', label: 'Vòng đời' },
  { id: 'auth', label: 'Token / Auth' },
  { id: 'permissions', label: 'Quyền RBAC' },
  { id: 'call', label: 'Cuộc gọi' },
  { id: 'autodial', label: 'Autodial' },
  { id: 'contacts', label: 'Danh bạ' },
  { id: 'navigation', label: 'Điều hướng' },
  { id: 'ui', label: 'UI / Haptic' },
];

const DIRECTION_BADGE: Record<CoreBridgeSpecItem['direction'], { label: string; cls: string }> = {
  launch_param: {
    label: 'Launch Params',
    cls: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  miniapp_to_host: {
    label: 'Mini App → Host',
    cls: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300',
  },
  host_action: {
    label: 'Custom Host Action',
    cls: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-300',
  },
  host_to_miniapp: {
    label: 'Host → Mini App',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
};

const PLACEMENT_OPTIONS: Array<{
  id: 'all' | MiniAppCatalogEntry['placement'];
  label: string;
}> = [
  { id: 'all', label: `Tất cả vị trí (${MINI_APP_CATALOG.length})` },
  { id: 'features_hub', label: 'Trang Tính năng' },
  { id: 'inline_tab', label: 'Tab chính' },
  { id: 'in_call', label: 'Trong cuộc gọi' },
  { id: 'child_app', label: 'Mini App con' },
  { id: 'hidden_setting', label: 'Cài đặt ẩn' },
];

const PLACEMENT_BADGE: Record<MiniAppCatalogEntry['placement'], { label: string; cls: string }> = {
  inline_tab: {
    label: 'Tab chính',
    cls: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300',
  },
  features_hub: {
    label: 'Trang Tính năng',
    cls: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  in_call: {
    label: 'Trong cuộc gọi',
    cls: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300',
  },
  child_app: {
    label: 'Mini App con',
    cls: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-300',
  },
  hidden_setting: {
    label: 'Cài đặt ẩn',
    cls: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
};

const ACCESS_BADGE: Record<MiniAppCatalogEntry['accessLevel'], { label: string; cls: string }> = {
  everyone: {
    label: 'Mọi tài khoản',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  member_perm: {
    label: 'Theo quyền Member',
    cls: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300',
  },
  admin_only: {
    label: 'Chỉ Admin',
    cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300',
  },
};

const filteredSpecs = computed(() => {
  const q = protocolQuery.value.trim().toLowerCase();
  return CORE_BRIDGE_SPECS.filter((item) => {
    if (selectedDirection.value !== 'all' && item.direction !== selectedDirection.value) {
      return false;
    }
    if (selectedCategory.value !== 'all' && item.category !== selectedCategory.value) {
      return false;
    }
    if (!q) return true;
    const hay = [
      item.name,
      item.summary,
      item.miniAppCode,
      item.iosHandler,
      item.androidHandler,
      item.responseEvent ?? '',
      item.usedByApps.join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const filteredCatalog = computed(() => {
  const q = catalogQuery.value.trim().toLowerCase();
  return MINI_APP_CATALOG.filter((app) => {
    if (selectedPlacement.value !== 'all' && app.placement !== selectedPlacement.value) {
      return false;
    }
    if (selectedBridgeTier.value !== 'all' && app.bridgeTier !== selectedBridgeTier.value) {
      return false;
    }
    if (!q) return true;
    const hay = [
      app.id,
      app.nameVi,
      app.nameEn,
      app.category,
      app.iosPermissionRule,
      app.androidPermissionRule,
      (app.customActions ?? []).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (tourActive.value) {
      handleTourClose(false);
      return;
    }
    if (guidePopoverOpen.value) {
      guidePopoverOpen.value = false;
      return;
    }
    close();
  }
};

const SIDEBAR_TABS: Array<{
  id: ModalTab;
  label: string;
  icon: typeof Terminal;
  badge?: number;
  activeCls: string;
  badgeCls?: string;
}> = [
  {
    id: 'sandbox',
    label: 'Dev Studio · Mô phỏng',
    icon: Terminal,
    activeCls:
      'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/35',
  },
  {
    id: 'simulator',
    label: 'Chạy thử luồng',
    icon: PlayCircle,
    badge: MINI_APP_SIMULATOR_FLOWS.length,
    activeCls:
      'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/35',
    badgeCls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  {
    id: 'protocol',
    label: 'Tra cứu Hàm & Event',
    icon: BookOpen,
    badge: CORE_BRIDGE_SPECS.length,
    activeCls:
      'bg-slate-100 text-slate-900 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700',
    badgeCls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  {
    id: 'catalog',
    label: 'Danh mục Mini App',
    icon: Grid2x2,
    badge: MINI_APP_CATALOG.length,
    activeCls:
      'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/35',
    badgeCls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  {
    id: 'permissions',
    label: 'Quản lý Quyền (RBAC)',
    icon: ShieldCheck,
    activeCls:
      'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/35',
  },
  {
    id: 'parity',
    label: 'Lệch iOS ↔ Android',
    icon: AlertTriangle,
    badge: BRIDGE_PARITY_ALERTS.length,
    activeCls:
      'bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/35',
    badgeCls:
      'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  },
];

const ACTIVE_TAB_META: Record<
  Exclude<ModalTab, 'sandbox'>,
  { title: string; subtitle: string }
> = {
  simulator: {
    title: 'Chạy thử luồng giao tiếp (4-lane SVG)',
    subtitle: 'Mô phỏng từng bước tuần tự giữa Mini App, @vbotma/sdk, Host Native và Backend',
  },
  protocol: {
    title: 'Tra cứu Hàm & Event (@vbotma/sdk)',
    subtitle: 'Danh sách hàm gửi lên Host, Host Action, sự kiện đẩy xuống và handler iOS/Android',
  },
  catalog: {
    title: `Danh mục ${MINI_APP_CATALOG.length} Mini App`,
    subtitle: 'Vị trí hiển thị, phân quyền và các Custom Host Action trên từng Mini App',
  },
  permissions: {
    title: 'Quản lý Quyền 2 tầng (RBAC)',
    subtitle: 'Đối chiếu giao của manifest.json và phân quyền vai trò User trên Host',
  },
  parity: {
    title: `Lệch iOS ↔ Android (${BRIDGE_PARITY_ALERTS.length})`,
    subtitle: 'Các điểm khác biệt giữa Swift Host và Kotlin Host ảnh hưởng trực tiếp tới Mini App',
  },
};

const selectSidebarTab = (tab: ModalTab) => {
  if (tab !== 'permissions') {
    permissionsFilterAppId.value = '';
  }
  activeTab.value = tab;
};

watch(
  () => [props.open, props.initialContext] as const,
  ([isOpen, ctx]) => {
    if (isOpen) {
      window.addEventListener('keydown', onWindowKeyDown, true);
      studioBannerDismissed.value = loadStudioBannerDismissed();
      if (ctx?.tab) {
        activeTab.value = ctx.tab;
      } else {
        activeTab.value = 'sandbox';
      }
      if (ctx?.miniAppId && ctx.miniAppId.startsWith('vb-ma-')) {
        studioAppId.value = ctx.miniAppId;
      }
      if (ctx?.flowId && MINI_APP_SIMULATOR_FLOWS.some((f) => f.id === ctx.flowId)) {
        selectedFlowId.value = ctx.flowId;
        const matchedFlow = MINI_APP_SIMULATOR_FLOWS.find((f) => f.id === ctx.flowId);
        selectedSubFlowId.value =
          ctx.subFlowId && matchedFlow?.subFlows?.some((sf) => sf.id === ctx.subFlowId)
            ? ctx.subFlowId
            : undefined;
      } else if (ctx?.subFlowId) {
        const currentFlow = MINI_APP_SIMULATOR_FLOWS.find((f) => f.id === selectedFlowId.value);
        selectedSubFlowId.value = currentFlow?.subFlows?.some((sf) => sf.id === ctx.subFlowId)
          ? ctx.subFlowId
          : undefined;
      } else {
        selectedSubFlowId.value = undefined;
      }
      if (ctx?.tab === 'catalog' && ctx.miniAppId && ctx.miniAppId.startsWith('vb-ma-')) {
        catalogQuery.value = ctx.miniAppId;
      } else {
        catalogQuery.value = '';
      }
      if (ctx?.tab === 'permissions' && ctx.miniAppId && ctx.miniAppId.startsWith('vb-ma-')) {
        permissionsFilterAppId.value = ctx.miniAppId;
      } else {
        permissionsFilterAppId.value = '';
      }
    } else {
      guidePopoverOpen.value = false;
      tourActive.value = false;
      window.removeEventListener('keydown', onWindowKeyDown, true);
    }
  },
  { immediate: true },
);

watch(activeTab, (tab) => {
  if (tab !== 'permissions') {
    permissionsFilterAppId.value = '';
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown, true);
  if (copyResetTimer) clearTimeout(copyResetTimer);
  if (specResetTimer) clearTimeout(specResetTimer);
});
</script>

<template>
  <div
    v-if="props.open"
    role="region"
    aria-label="Mini App Studio — Cầu nối Host App và Mini App"
    class="flex h-full w-full min-h-0 flex-col overflow-hidden bg-slate-50 lg:flex-row dark:bg-[#090d16]"
  >
    <!-- Vertical Sidebar (Horizontal bar on < lg, collapsible rail/drawer on lg+) -->
    <aside
      class="flex shrink-0 flex-col border-b border-slate-200 bg-white transition-all duration-200 lg:border-r lg:border-b-0 dark:border-slate-800 dark:bg-[#0b1120]"
      :class="sidebarCollapsed ? 'lg:w-16' : 'lg:w-60'"
    >
      <!-- Sidebar Header -->
      <div
        class="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5 dark:border-slate-800/80"
        :class="sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''"
      >
        <div
          v-if="!sidebarCollapsed"
          class="flex min-w-0 items-center gap-2.5"
        >
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/35">
            <ArrowLeftRight class="h-4 w-4" />
          </span>
          <div class="min-w-0">
            <div class="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
              Mini App Studio
            </div>
            <div class="truncate font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400">
              {{ MINI_APP_CATALOG.length }} app · {{ MINI_APP_SIMULATOR_FLOWS.length }} luồng
            </div>
          </div>
        </div>

        <button
          type="button"
          class="hidden shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:inline-flex dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          :title="sidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'"
          :aria-label="sidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <PanelLeftOpen v-if="sidebarCollapsed" class="h-4 w-4" />
          <PanelLeftClose v-else class="h-4 w-4" />
        </button>

        <!-- Mobile quick actions (< lg) -->
        <div class="flex items-center gap-1.5 lg:hidden">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
            @click="guidePopoverOpen = true"
          >
            <HelpCircle class="h-3.5 w-3.5" />
            Hướng dẫn
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            @click="close"
          >
            <ArrowLeft class="h-3.5 w-3.5" />
            Sơ đồ
          </button>
        </div>
      </div>

      <!-- 6 Navigation Items -->
      <nav
        data-studio-tour="modal-tabs"
        role="tablist"
        aria-label="Mục trong Cầu nối Mini App"
        class="flex flex-row gap-1 overflow-x-auto p-2 lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
      >
        <button
          v-for="tab in SIDEBAR_TABS"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :title="tab.label"
          class="group flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition"
          :class="[
            activeTab === tab.id
              ? tab.activeCls
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200',
            sidebarCollapsed ? 'lg:justify-center lg:px-2' : 'lg:w-full lg:justify-between',
          ]"
          @click="selectSidebarTab(tab.id)"
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <component :is="tab.icon" class="h-4 w-4 shrink-0" />
            <span
              class="truncate"
              :class="sidebarCollapsed ? 'lg:hidden' : ''"
            >
              {{ tab.label }}
            </span>
          </span>
          <span
            v-if="tab.badge !== undefined"
            class="rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold"
            :class="[
              tab.badgeCls ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              sidebarCollapsed ? 'lg:hidden' : '',
            ]"
          >
            {{ tab.badge }}
          </span>
        </button>
      </nav>

      <!-- Desktop Sidebar Footer -->
      <div
        class="hidden flex-col gap-1 border-t border-slate-200/80 p-2 lg:flex dark:border-slate-800/80"
      >
        <button
          type="button"
          class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/15"
          :class="sidebarCollapsed ? 'justify-center px-2' : 'w-full'"
          title="Mở hướng dẫn dùng Dev Studio, chạy lại Tour hoặc xem 5 kịch bản thực hành mẫu"
          @click="guidePopoverOpen = true"
        >
          <HelpCircle class="h-4 w-4 shrink-0" />
          <span v-if="!sidebarCollapsed" class="truncate">Hướng dẫn &amp; Tour</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          :class="sidebarCollapsed ? 'justify-center px-2' : 'w-full'"
          title="Quay lại Sơ đồ luồng"
          @click="close"
        >
          <ArrowLeft class="h-4 w-4 shrink-0" />
          <span v-if="!sidebarCollapsed" class="truncate">Quay lại Sơ đồ</span>
        </button>
      </div>
    </aside>

    <!-- Main Workspace Area -->
    <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#0f172a]">
      <!-- Thin Context Header for non-sandbox tabs -->
      <div
        v-if="activeTab !== 'sandbox'"
        class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5 dark:border-slate-800 dark:bg-slate-900/70"
      >
        <div class="min-w-0">
          <h2 class="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
            {{ ACTIVE_TAB_META[activeTab].title }}
          </h2>
          <p class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {{ ACTIVE_TAB_META[activeTab].subtitle }}
          </p>
        </div>
        <TechPlatformSwitcher :show-parity="false" />
      </div>

      <!-- TAB 1: Interactive Mini App Dev Studio & Sandbox -->
      <MiniAppDevStudio
        v-if="activeTab === 'sandbox'"
        ref="devStudioRef"
        :initial-app-id="studioAppId"
        :platform-mode="explorer.platformMode.value"
        @app-changed="studioAppId = $event"
        @open-flow="runSimulatorFlow"
        @start-tour="startStudioTour"
        @open-guide="guidePopoverOpen = true"
        @banner-dismissed-change="studioBannerDismissed = $event"
      />

          <!-- TAB 2: Interactive Simulator -->
          <div v-else-if="activeTab === 'simulator'" class="min-h-0 flex-1 overflow-hidden">
            <BridgeFlowSimulator
              :flows="MINI_APP_SIMULATOR_FLOWS"
              :selected-flow-id="selectedFlowId"
              :selected-sub-flow-id="selectedSubFlowId"
              :platform-mode="explorer.platformMode.value"
              @select-flow="
                (id) => {
                  selectedFlowId = id;
                  selectedSubFlowId = undefined;
                }
              "
              @select-sub-flow="selectedSubFlowId = $event"
              @jump-node="jumpToCanvasNode"
            />
          </div>

          <!-- TAB 2: Protocol Reference -->
          <div v-else-if="activeTab === 'protocol'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="space-y-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="relative min-w-64 flex-1">
                  <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    v-model="protocolQuery"
                    type="text"
                    placeholder="Tìm hàm hoặc event (VD: start_autodial, make_call, request_module_token, refresh_data)..."
                    class="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500"
                  />
                </div>

                <div class="flex flex-wrap items-center gap-1">
                  <button
                    v-for="opt in DIRECTION_OPTIONS"
                    :key="opt.id"
                    type="button"
                    class="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
                    :class="
                      selectedDirection === opt.id
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    "
                    @click="selectedDirection = opt.id"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1">
                <button
                  v-for="cat in CATEGORY_OPTIONS"
                  :key="cat.id"
                  type="button"
                  class="rounded-md border px-2 py-0.5 text-[11px] font-medium transition"
                  :class="
                    selectedCategory === cat.id
                      ? 'border-slate-800 bg-slate-800 text-white dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  "
                  @click="selectedCategory = cat.id"
                >
                  {{ cat.label }}
                </button>
                <span class="ml-auto font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Hiển thị {{ filteredSpecs.length }} / {{ CORE_BRIDGE_SPECS.length }} mục
                </span>
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/40 p-5 dark:bg-[#090d16]">
              <p v-if="filteredSpecs.length === 0" class="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                Không tìm thấy hàm hay sự kiện nào khớp bộ lọc hiện tại.
              </p>

              <div
                v-for="spec in filteredSpecs"
                :key="spec.id"
                class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span
                        class="rounded border px-2 py-0.5 text-[10px] font-bold"
                        :class="DIRECTION_BADGE[spec.direction].cls"
                      >
                        {{ DIRECTION_BADGE[spec.direction].label }}
                      </span>
                      <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {{ spec.category }}
                      </span>
                      <span
                        v-if="spec.responseEvent"
                        class="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300"
                      >
                        ↳ {{ spec.responseEvent }}
                      </span>
                    </div>
                    <h3 class="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                      {{ spec.name }}
                    </h3>
                  </div>

                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="appTag in spec.usedByApps"
                      :key="appTag"
                      class="rounded-md border border-cyan-200 bg-cyan-50/70 px-2 py-0.5 font-mono text-[10px] font-medium text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300"
                    >
                      {{ appTag }}
                    </span>
                  </div>
                </div>

                <p class="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {{ spec.summary }}
                </p>

                <div class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div class="space-y-1">
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="font-bold text-cyan-800 dark:text-cyan-300">Code Mini App (@vbotma/sdk)</span>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        @click="copyValue(`spec-code-${spec.id}`, spec.miniAppCode)"
                      >
                        <Check
                          v-if="copiedKey === `spec-code-${spec.id}`"
                          class="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                        />
                        <Copy v-else class="h-3 w-3" />
                        {{ copiedKey === `spec-code-${spec.id}` ? 'Đã copy' : 'Copy Code' }}
                      </button>
                    </div>
                    <pre class="overflow-x-auto rounded-lg border border-slate-800/90 bg-[#0b1120] p-2.5 font-mono text-[11px] leading-relaxed text-cyan-100 dark:border-slate-700/75"><code>{{ spec.miniAppCode }}</code></pre>
                  </div>

                  <div v-if="spec.requestJson || spec.responseJson" class="space-y-2">
                    <div v-if="spec.requestJson" class="space-y-1">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="font-bold text-indigo-800 dark:text-indigo-300">Payload gửi lên Host</span>
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          @click="copyValue(`spec-req-${spec.id}`, spec.requestJson)"
                        >
                          <Check
                            v-if="copiedKey === `spec-req-${spec.id}`"
                            class="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                          />
                          <Copy v-else class="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                      <JsonCodeBlock :code="spec.requestJson" />
                    </div>

                    <div v-if="spec.responseJson" class="space-y-1">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="font-bold text-emerald-800 dark:text-emerald-300">Payload Host trả về / đẩy xuống</span>
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          @click="copyValue(`spec-res-${spec.id}`, spec.responseJson)"
                        >
                          <Check
                            v-if="copiedKey === `spec-res-${spec.id}`"
                            class="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                          />
                          <Copy v-else class="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                      <JsonCodeBlock :code="spec.responseJson" />
                    </div>
                  </div>
                </div>

                <div
                  class="mt-3 grid grid-cols-1 gap-2"
                  :class="explorer.platformMode.value === 'compare' ? 'md:grid-cols-2' : ''"
                >
                  <div
                    v-if="explorer.platformMode.value !== 'android'"
                    class="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[11px] dark:border-indigo-500/30 dark:bg-indigo-500/10"
                  >
                    <span class="font-bold text-indigo-700 dark:text-indigo-300">Host iOS: </span>
                    <code class="font-mono text-slate-800 dark:text-slate-200">{{ spec.iosHandler }}</code>
                  </div>
                  <div
                    v-if="explorer.platformMode.value !== 'ios'"
                    class="rounded-lg border border-emerald-200 bg-emerald-50/45 px-3 py-2 text-[11px] dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  >
                    <span class="font-bold text-emerald-700 dark:text-emerald-300">Host Android: </span>
                    <code class="font-mono text-slate-800 dark:text-slate-200">{{ spec.androidHandler }}</code>
                  </div>
                </div>

                <p
                  v-if="spec.parityNote"
                  class="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-[11px] text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  <span class="font-bold">Lưu ý Parity: </span>{{ spec.parityNote }}
                </p>
              </div>
            </div>
          </div>

          <!-- TAB 3: Full Mini App Catalog -->
          <div v-else-if="activeTab === 'catalog'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="space-y-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="relative min-w-64 flex-1">
                  <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    v-model="catalogQuery"
                    type="text"
                    placeholder="Tìm theo appId (vb-ma-...), tên tiếng Việt/Anh, nhóm hoặc quyền..."
                    class="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div class="flex flex-wrap items-center gap-1">
                  <button
                    v-for="opt in PLACEMENT_OPTIONS"
                    :key="opt.id"
                    type="button"
                    class="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
                    :class="
                      selectedPlacement === opt.id
                        ? 'border-cyan-600 bg-cyan-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    "
                    @click="selectedPlacement = opt.id"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  class="rounded-md border px-2.5 py-0.5 font-semibold transition"
                  :class="
                    selectedBridgeTier === 'all'
                      ? 'border-slate-800 bg-slate-800 text-white dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  "
                  @click="selectedBridgeTier = 'all'"
                >
                  Mọi loại Bridge
                </button>
                <button
                  type="button"
                  class="rounded-md border px-2.5 py-0.5 font-semibold transition"
                  :class="
                    selectedBridgeTier === 'custom_bridge'
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  "
                  @click="selectedBridgeTier = 'custom_bridge'"
                >
                  Có Custom Host Action / Event riêng
                </button>
                <button
                  type="button"
                  class="rounded-md border px-2.5 py-0.5 font-semibold transition"
                  :class="
                    selectedBridgeTier === 'core_sdk'
                      ? 'border-slate-700 bg-slate-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  "
                  @click="selectedBridgeTier = 'core_sdk'"
                >
                  Dùng chuẩn Core SDK
                </button>
                <span class="ml-auto font-mono font-medium text-slate-500 dark:text-slate-400">
                  Đang hiện {{ filteredCatalog.length }} / {{ MINI_APP_CATALOG.length }} Mini App (từ vb-ma-platform & Host)
                </span>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-5 dark:bg-[#090d16]">
              <p v-if="filteredCatalog.length === 0" class="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                Không tìm thấy Mini App nào phù hợp với bộ lọc.
              </p>

              <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div
                  v-for="app in filteredCatalog"
                  :key="app.id"
                  class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-cyan-300 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-cyan-500/50"
                >
                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        class="rounded border px-2 py-0.5 text-[10px] font-bold"
                        :class="PLACEMENT_BADGE[app.placement].cls"
                      >
                        {{ PLACEMENT_BADGE[app.placement].label }}
                      </span>
                      <span
                        class="rounded border px-2 py-0.5 text-[10px] font-semibold"
                        :class="ACCESS_BADGE[app.accessLevel].cls"
                      >
                        {{ ACCESS_BADGE[app.accessLevel].label }}
                      </span>
                    </div>

                    <div>
                      <div class="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {{ app.nameVi }}
                      </div>
                      <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800 transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300 dark:hover:border-cyan-500/40"
                          title="Copy Mini App ID"
                          @click="copyValue(`app-id-${app.id}`, app.id)"
                        >
                          {{ app.id }}
                          <Check
                            v-if="copiedKey === `app-id-${app.id}`"
                            class="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400"
                          />
                          <Copy v-else class="h-2.5 w-2.5 text-slate-400" />
                        </button>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400">
                          {{ app.nameEn }} · {{ app.category }}
                        </span>
                      </div>
                    </div>

                    <div class="space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                      <div v-if="explorer.platformMode.value !== 'android'">
                        <span class="font-bold text-indigo-700 dark:text-indigo-300">iOS: </span>{{ app.iosPermissionRule }}
                      </div>
                      <div v-if="explorer.platformMode.value !== 'ios'">
                        <span class="font-bold text-emerald-700 dark:text-emerald-300">Android: </span>{{ app.androidPermissionRule }}
                      </div>
                    </div>

                    <div v-if="app.customActions?.length" class="space-y-1">
                      <div class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        Bấm từng sự kiện để mở sơ đồ riêng:
                      </div>
                      <div class="flex flex-wrap gap-1">
                        <button
                          v-for="act in app.customActions"
                          :key="act"
                          type="button"
                          title="Mở sơ đồ chạy thử cho sự kiện này"
                          class="inline-flex cursor-pointer items-center gap-1 rounded border border-indigo-200 bg-indigo-50/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-800 transition hover:border-indigo-400 hover:bg-indigo-100 hover:text-indigo-900 dark:border-cyan-500/30 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                          @click="runActionChip(act, app)"
                        >
                          <PlayCircle class="h-2.5 w-2.5 shrink-0 opacity-70" />
                          <span>{{ act }}</span>
                        </button>
                      </div>
                    </div>

                    <p
                      v-if="app.parityNote"
                      class="rounded border border-amber-200 bg-amber-50/70 px-2 py-1 text-[10px] leading-snug text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
                    >
                      {{ app.parityNote }}
                    </p>
                  </div>

                  <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
                      @click="openDevStudioForApp(app.id)"
                    >
                      <Terminal class="h-3 w-3" />
                      Mở Dev Studio
                    </button>
                    <button
                      v-if="app.simulatorFlowId"
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
                      @click="runSimulatorFlow(app.simulatorFlowId)"
                    >
                      <PlayCircle class="h-3 w-3" />
                      {{
                        getFlowSubCount(app.simulatorFlowId) > 0
                          ? `Chạy thử (${getFlowSubCount(app.simulatorFlowId)} sơ đồ)`
                          : 'Chạy thử luồng'
                      }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                      @click="openPermissionsForApp(app.id)"
                    >
                      <ShieldCheck class="h-3 w-3" />
                      Quyền RBAC
                    </button>
                    <button
                      v-if="app.relatedNodeId"
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      @click="jumpToCanvasNode(app.relatedNodeId)"
                    >
                      Xem trên sơ đồ
                      <ExternalLink class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 4: 2-Tier Mini App Permissions Manager -->
          <MiniAppPermissionsPanel
            v-else-if="activeTab === 'permissions'"
            :platform-mode="explorer.platformMode.value"
            :initial-app-filter="permissionsFilterAppId"
            @open-flow="runSimulatorFlow"
            @jump-node="jumpToCanvasNode"
          />

          <!-- TAB 5: Parity Alerts & Markdown Spec Export -->
          <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-amber-50/50 px-5 py-3 dark:border-slate-800 dark:bg-amber-500/10">
              <p class="text-xs text-slate-700 dark:text-slate-200">
                Tổng hợp các điểm lệch giữa Host iOS và Android ảnh hưởng trực tiếp tới logic code Mini App Web (`@vbotma/sdk`).
              </p>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  @click="copyMarkdownSpec"
                >
                  <Check v-if="copiedSpecMd" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <FileText v-else class="h-3.5 w-3.5" />
                  {{ copiedSpecMd ? 'Đã copy Spec MD' : 'Copy Spec Markdown' }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                  @click="downloadMarkdownSpec"
                >
                  <Download class="h-3.5 w-3.5" />
                  Tải Spec .md
                </button>
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/40 p-5 dark:bg-[#090d16]">
              <div
                v-for="alert in BRIDGE_PARITY_ALERTS"
                :key="alert.id"
                class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        class="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
                        :class="
                          alert.severity === 'high'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
                        "
                      >
                        {{ alert.severity === 'high' ? 'Cảnh báo cao' : 'Lưu ý' }}
                      </span>
                      <span class="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {{ alert.scope }}
                      </span>
                    </div>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {{ alert.title }}
                    </h3>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      v-if="alert.simulatorFlowId"
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
                      @click="runSimulatorFlow(alert.simulatorFlowId)"
                    >
                      <PlayCircle class="h-3.5 w-3.5" />
                      Chạy thử luồng
                    </button>
                    <button
                      v-if="alert.relatedNodeId"
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      @click="jumpToCanvasNode(alert.relatedNodeId)"
                    >
                      Xem node
                      <ExternalLink class="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <div class="rounded-lg border border-indigo-100 bg-indigo-50/45 p-2.5 text-xs text-slate-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-300">
                    <div class="text-[10px] font-bold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
                      Hành vi iOS (Swift)
                    </div>
                    <p class="mt-1 leading-relaxed">{{ alert.iosBehavior }}</p>
                  </div>
                  <div class="rounded-lg border border-emerald-200 bg-emerald-50/45 p-2.5 text-xs text-slate-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-slate-300">
                    <div class="text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
                      Hành vi Android (Kotlin)
                    </div>
                    <p class="mt-1 leading-relaxed">{{ alert.androidBehavior }}</p>
                  </div>
                </div>

                <div class="mt-2.5 rounded-lg border border-cyan-200 bg-cyan-50/60 px-3 py-2 text-xs text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200">
                  <span class="font-bold text-cyan-800 dark:text-cyan-300">Cách xử lý an toàn phía Mini App: </span>
                  {{ alert.recommendationForMiniApp }}
                </div>
              </div>
            </div>
          </div>
    </main>

    <MiniAppStudioGuidePopover
      v-model:open="guidePopoverOpen"
      :banner-dismissed="studioBannerDismissed"
      @start-tour="startStudioTour"
      @run-recipe="handleRunQuickRecipe"
      @jump-tab="handleGuideJumpTab"
      @restore-banner="handleRestoreBanner"
    />

    <MiniAppStudioTourOverlay
      :open="tourActive"
      :steps="STUDIO_TOUR_STEPS"
      :step-index="tourStepIndex"
      @update:step-index="handleTourStepChange"
      @close="handleTourClose"
    />
  </div>
</template>
