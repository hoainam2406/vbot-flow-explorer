<script setup lang="ts">
import { computed, defineAsyncComponent, inject } from 'vue';
import {
  ChevronRight,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Search,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { getNodeDisplayLabel } from '../core/graphEngine';
import ExportMenu from './ExportMenu.vue';

const emit = defineEmits<{
  openSearch: [];
  openParity: [];
  openGuide: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const enableTechMode = __ENABLE_TECH_MODE__;
const techBranchLabel = computed(() =>
  __ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech'
    ? (explorer.dataset.app.techBranch ?? null)
    : null,
);
const TechPlatformSwitcher = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechPlatformSwitcher.vue'))
  : null;

const onBreadcrumbClick = (nodeId: string) => {
  if (nodeId === explorer.dataset.rootNode.id) {
    explorer.setFocusRoot(null);
    explorer.selectedNodeId.value = null;
    return;
  }
  if (explorer.focusRootId.value) {
    explorer.setFocusRoot(nodeId);
  }
  explorer.jumpToNode(nodeId);
};
</script>

<template>
  <header class="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <button
        type="button"
        class="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-100"
        @click="onBreadcrumbClick(explorer.dataset.rootNode.id)"
      >
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white shadow-xs">
          V
        </span>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-bold text-slate-900">{{ explorer.dataset.app.name }}</span>
            <span
              v-if="explorer.dataset.app.version"
              class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {{ explorer.dataset.app.version }}
            </span>
            <span
              v-if="enableTechMode && techBranchLabel"
              class="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
              :title="`Dữ liệu kỹ thuật đối soát theo nhánh ${techBranchLabel} của VBot-iOS & VBot-Android`"
            >
              <GitBranch class="h-2.5 w-2.5" />
              {{ techBranchLabel }}
            </span>
          </div>
          <p class="hidden text-[11px] text-slate-500 xl:block">
            {{ explorer.dataset.app.tagline }}
          </p>
        </div>
      </button>

      <nav
        aria-label="Breadcrumb"
        class="hidden min-w-0 items-center gap-1 overflow-x-auto text-xs text-slate-500 md:flex"
      >
        <template v-for="(node, idx) in explorer.breadcrumbNodes.value" :key="node.id">
          <ChevronRight v-if="idx > 0" class="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <button
            type="button"
            class="max-w-44 truncate rounded-md px-2 py-1 font-medium transition hover:bg-slate-100 hover:text-slate-900"
            :class="
              idx === explorer.breadcrumbNodes.value.length - 1
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-600'
            "
            @click="onBreadcrumbClick(node.id)"
          >
            {{ getNodeDisplayLabel(node, explorer.audienceMode.value) }}
          </button>
        </template>

        <button
          v-if="explorer.focusRootId.value"
          type="button"
          class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-200"
          @click="explorer.setFocusRoot(null)"
        >
          <RotateCcw class="h-3 w-3" />
          Xem toàn bộ
        </button>
      </nav>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
        @click="emit('openSearch')"
      >
        <Search class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">Tìm kiếm</span>
        <kbd class="hidden rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        :aria-pressed="explorer.accordionMode.value"
        class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition"
        :class="
          explorer.accordionMode.value
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        "
        title="Tự thu gọn nhánh anh em cùng cấp khi mở nhánh mới"
        @click="explorer.accordionMode.value = !explorer.accordionMode.value"
      >
        <Layers class="h-3.5 w-3.5" />
        <span class="hidden lg:inline">Chỉ mở 1 nhánh</span>
      </button>

      <button
        v-if="explorer.dataset.hasRealMedia !== false"
        type="button"
        :aria-pressed="explorer.showCanvasMedia.value"
        class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition"
        :class="
          explorer.showCanvasMedia.value
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        "
        title="Hiển thị ảnh thu gọn ngay trên thẻ sơ đồ"
        @click="explorer.showCanvasMedia.value = !explorer.showCanvasMedia.value"
      >
        <ImageIcon class="h-3.5 w-3.5" />
        <span class="hidden lg:inline">Hiện ảnh trên sơ đồ</span>
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        title="Hướng dẫn thao tác & giải thích thuật ngữ"
        @click="emit('openGuide')"
      >
        <HelpCircle class="h-3.5 w-3.5 text-indigo-600" />
        <span class="hidden sm:inline">Hướng dẫn</span>
      </button>

      <ExportMenu />

      <component
        :is="TechPlatformSwitcher"
        v-if="TechPlatformSwitcher && explorer.audienceMode.value === 'tech'"
        @open-parity="emit('openParity')"
      />

      <div
        v-if="enableTechMode"
        class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold"
      >
        <button
          type="button"
          class="rounded-md px-2.5 py-1 transition"
          :class="
            explorer.audienceMode.value === 'overview'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          "
          @click="explorer.setAudienceMode('overview')"
        >
          Tổng quan
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
          :class="
            explorer.audienceMode.value === 'tech'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          "
          @click="explorer.setAudienceMode('tech')"
        >
          <GitBranch class="h-3 w-3" />
          Kỹ thuật
        </button>
      </div>
    </div>
  </header>
</template>
