<script setup lang="ts">
import { defineAsyncComponent, inject, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowRight,
  BookOpen,
  Compass,
  HelpCircle,
  Keyboard,
  Sparkles,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { PUBLIC_CONCEPTS, PUBLIC_GUIDE_STEPS } from '../data/publicGuideData';

type GuideTab = 'overview' | 'onboarding' | 'glossary';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const TechGuidePanel = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechGuidePanel.vue'))
  : null;

const enableTechMode = __ENABLE_TECH_MODE__;
const techBranch = __ENABLE_TECH_MODE__ ? explorer.dataset.app.techBranch : undefined;
const activeTab = ref<GuideTab>('overview');
const glossaryCount = ref(13);

const KEYBOARD_SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: '⌘K / Ctrl+K', desc: 'Mở tìm kiếm nhanh & bảng lệnh' },
  { keys: '↑ ↓ ← →', desc: 'Di chuyển qua lại giữa các bước trên cây' },
  { keys: 'Enter', desc: 'Bung / thu gọn nhánh con của thẻ đang chọn' },
  { keys: 'F', desc: 'Căn vừa toàn bộ sơ đồ vào màn hình' },
  { keys: '[ / ]', desc: 'Chuyển bước trước / tiếp theo khi chạy kịch bản' },
  { keys: 'Z', desc: 'Bật / tắt chế độ trình chiếu (Zen Mode)' },
  { keys: '?', desc: 'Mở cửa sổ hướng dẫn & phím tắt' },
  { keys: 'Esc', desc: 'Thoát Zen Mode hoặc đóng khung chi tiết' },
];

const close = () => {
  emit('update:open', false);
};

const jumpToPublicNode = (nodeId: string) => {
  if (!explorer.findNode(nodeId)) return;
  explorer.jumpToNode(nodeId);
  close();
};

const jumpToTechNode = (
  nodeId: string,
  recommendedPlatform?: 'compare' | 'ios' | 'android',
) => {
  if (!__ENABLE_TECH_MODE__ || !explorer.findNode(nodeId)) return;
  explorer.setAudienceMode('tech');
  if (recommendedPlatform) {
    explorer.setPlatformMode(recommendedPlatform);
  }
  explorer.jumpToNode(nodeId);
  close();
};

const onWindowKeyDown = (event: KeyboardEvent) => {
  if (props.open && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
};

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onWindowKeyDown);
      if (__ENABLE_TECH_MODE__) {
        const mod = await import('../data/techGlossaryData');
        glossaryCount.value = mod.TECH_GLOSSARY_TERMS.length;
        activeTab.value = explorer.audienceMode.value === 'tech' ? 'glossary' : 'overview';
      } else {
        activeTab.value = 'overview';
      }
    } else {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-xs dark:bg-black/65"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hướng dẫn sử dụng và thuật ngữ VBot"
          class="vbot-modal-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-cyan-500/15 dark:text-cyan-300">
                <HelpCircle class="h-5 w-5" />
              </span>
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                  {{
                    enableTechMode
                      ? 'Hướng dẫn sử dụng & Từ điển kỹ thuật VBot'
                      : 'Hướng dẫn xem sơ đồ VBot App'
                  }}
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{
                    enableTechMode
                      ? 'Giúp người dùng mới thao tác nhanh và giúp lập trình viên mới nắm kiến trúc trong 10 phút.'
                      : 'Hướng dẫn thao tác nhanh trên sơ đồ và giải thích các khái niệm chính trong VBot.'
                  }}
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label="Đóng hướng dẫn"
              class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div
            v-if="enableTechMode"
            class="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50/70 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-900/60"
          >
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              "
              @click="activeTab = 'overview'"
            >
              <Compass class="h-3.5 w-3.5" />
              Hướng dẫn xem
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'onboarding'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              "
              @click="activeTab = 'onboarding'"
            >
              <Sparkles class="h-3.5 w-3.5" />
              Lộ trình Dev mới (10 phút)
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              :class="
                activeTab === 'glossary'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              "
              @click="activeTab = 'glossary'"
            >
              <BookOpen class="h-3.5 w-3.5" />
              Từ điển kỹ thuật VBot ({{ glossaryCount }})
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div v-if="!enableTechMode || activeTab === 'overview'" class="space-y-6">
              <section class="space-y-2.5">
                <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  Cách đọc & thao tác sơ đồ
                </h3>
                <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div
                    v-for="step in PUBLIC_GUIDE_STEPS"
                    :key="step.title"
                    class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <div class="text-xs font-bold text-slate-900 dark:text-slate-100">{{ step.title }}</div>
                    <p class="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{{ step.description }}</p>
                  </div>
                </div>
              </section>

              <section class="space-y-2.5">
                <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  <Keyboard class="h-3.5 w-3.5" />
                  Phím tắt điều hướng
                </h3>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div
                    v-for="sc in KEYBOARD_SHORTCUTS"
                    :key="sc.keys"
                    class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <span class="text-slate-600 dark:text-slate-300">{{ sc.desc }}</span>
                    <kbd class="shrink-0 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300">
                      {{ sc.keys }}
                    </kbd>
                  </div>
                </div>
              </section>

              <section class="space-y-2.5">
                <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  Khái niệm cơ bản trên VBot
                </h3>
                <ul class="space-y-2">
                  <li
                    v-for="concept in PUBLIC_CONCEPTS"
                    :key="concept.term"
                    class="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-start dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div class="space-y-1">
                      <div class="text-xs font-bold text-slate-900 dark:text-slate-100">{{ concept.term }}</div>
                      <p class="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{{ concept.description }}</p>
                    </div>
                    <button
                      v-if="concept.relatedNodeId"
                      type="button"
                      class="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                      @click="jumpToPublicNode(concept.relatedNodeId)"
                    >
                      Xem luồng
                      <ArrowRight class="h-3 w-3" />
                    </button>
                  </li>
                </ul>
              </section>
            </div>

            <component
              :is="TechGuidePanel"
              v-else-if="TechGuidePanel && enableTechMode"
              :tab="activeTab"
              :tech-branch="techBranch"
              @jump-tech="jumpToTechNode"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
