<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  HelpCircle,
  Keyboard,
  Layers,
  Lightbulb,
  Play,
  Search,
  Sparkles,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import {
  filterFeatureCategories,
  filterWorkflowRecipes,
  normalizeGuideSearch,
  type GuideFeatureCategory,
  type GuideQuickAction,
  type GuideWorkflowRecipe,
} from '../core/appTourEngine';
import {
  PUBLIC_CONCEPTS,
  PUBLIC_FEATURE_CATEGORIES,
  PUBLIC_GUIDE_STEPS,
  PUBLIC_WORKFLOW_RECIPES,
} from '../data/publicGuideData';

export type GuideTab = 'start' | 'features' | 'recipes' | 'onboarding' | 'glossary';

const props = defineProps<{
  open: boolean;
  initialTab?: GuideTab;
  tourCompleted?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  openMiniAppStudio: [];
  runAction: [action: GuideQuickAction];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const TechGuidePanel = __ENABLE_TECH_MODE__
  ? defineAsyncComponent(() => import('./TechGuidePanel.vue'))
  : null;

const enableTechMode = __ENABLE_TECH_MODE__;
const techBranch = computed(() =>
  __ENABLE_TECH_MODE__ ? explorer.dataset.app.techBranch : undefined,
);

const activeTab = ref<GuideTab>('start');
const searchQuery = ref('');
const selectedCategoryId = ref<string>('all');
const glossaryCount = ref(13);
const techFeatureCategories = ref<GuideFeatureCategory[]>([]);
const techWorkflowRecipes = ref<GuideWorkflowRecipe[]>([]);

const KEYBOARD_SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: '⌘K / Ctrl+K', desc: 'Mở tìm kiếm nhanh & bảng lệnh' },
  { keys: '↑ ↓ ← →', desc: 'Di chuyển qua lại giữa các bước trên cây' },
  { keys: 'Enter', desc: 'Bung / thu gọn nhánh con của thẻ đang chọn' },
  { keys: 'F', desc: 'Căn vừa toàn bộ sơ đồ vào màn hình' },
  { keys: '[ / ]', desc: 'Chuyển bước trước / tiếp theo khi chạy kịch bản' },
  { keys: 'Z', desc: 'Bật / tắt chế độ trình chiếu (Zen Mode)' },
  { keys: '?', desc: 'Mở Sổ tay Hướng dẫn & Phím tắt' },
  { keys: 'Esc', desc: 'Thoát Zen Mode hoặc đóng khung chi tiết' },
];

const allFeatureCategories = computed<GuideFeatureCategory[]>(() =>
  enableTechMode && techFeatureCategories.value.length > 0
    ? [...PUBLIC_FEATURE_CATEGORIES, ...techFeatureCategories.value]
    : PUBLIC_FEATURE_CATEGORIES,
);

const allWorkflowRecipes = computed<GuideWorkflowRecipe[]>(() =>
  enableTechMode && techWorkflowRecipes.value.length > 0
    ? [...PUBLIC_WORKFLOW_RECIPES, ...techWorkflowRecipes.value]
    : PUBLIC_WORKFLOW_RECIPES,
);

const filteredFeatureCategories = computed(() =>
  filterFeatureCategories(allFeatureCategories.value, searchQuery.value, selectedCategoryId.value),
);

const totalFilteredFeatures = computed(() =>
  filterFeatureCategories(allFeatureCategories.value, searchQuery.value, 'all').reduce(
    (sum, cat) => sum + cat.items.length,
    0,
  ),
);

const filteredRecipes = computed(() =>
  filterWorkflowRecipes(allWorkflowRecipes.value, searchQuery.value),
);

const filteredPublicConcepts = computed(() => {
  const q = normalizeGuideSearch(searchQuery.value);
  if (!q) return PUBLIC_CONCEPTS;
  return PUBLIC_CONCEPTS.filter((item) =>
    normalizeGuideSearch(`${item.term} ${item.description}`).includes(q),
  );
});

const totalFeaturesCount = computed(() =>
  allFeatureCategories.value.reduce((sum, cat) => sum + cat.items.length, 0),
);

const close = () => {
  emit('update:open', false);
};

const triggerAction = (action: GuideQuickAction) => {
  close();
  emit('runAction', action);
};

const startPrimaryTour = () => {
  const track = enableTechMode && explorer.audienceMode.value === 'tech' ? 'tech' : 'overview';
  triggerAction({ type: 'start_tour', track });
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

const handleOpenMiniAppStudio = () => {
  if (!__ENABLE_TECH_MODE__) return;
  close();
  emit('openMiniAppStudio');
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
        const [glossaryMod, handbookMod] = await Promise.all([
          import('../data/techGlossaryData'),
          import('../data/techGuideHandbookData'),
        ]);
        glossaryCount.value = glossaryMod.TECH_GLOSSARY_TERMS.length;
        techFeatureCategories.value = handbookMod.TECH_FEATURE_CATEGORIES;
        techWorkflowRecipes.value = handbookMod.TECH_WORKFLOW_RECIPES;
      }
      if (props.initialTab && (enableTechMode || props.initialTab !== 'onboarding')) {
        activeTab.value = props.initialTab;
      } else {
        activeTab.value = 'start';
      }
      selectedCategoryId.value = 'all';
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-3 py-4 backdrop-blur-xs sm:px-6 sm:py-6 dark:bg-black/70"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sổ tay hướng dẫn sử dụng toàn tập VBot"
          class="vbot-modal-panel flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-cyan-500/15 dark:text-cyan-300">
                <HelpCircle class="h-5 w-5" />
              </span>
              <div>
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                  {{
                    enableTechMode
                      ? 'Sổ tay Hướng dẫn Toàn tập & Từ điển VBot'
                      : 'Sổ tay Hướng dẫn sử dụng VBot App Flow'
                  }}
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{
                    enableTechMode
                      ? 'Hướng dẫn từng bước cho người mới, tra cứu nhanh theo nhu cầu và giải thích toàn bộ công cụ Dev.'
                      : 'Hướng dẫn thao tác toàn bộ chức năng trên web để người mới dùng thành thạo chỉ trong vài phút.'
                  }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-500 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                @click="startPrimaryTour"
              >
                <Play class="h-3.5 w-3.5 fill-current" />
                {{ enableTechMode && explorer.audienceMode.value === 'tech' ? 'Tour trực quan (10 bước)' : 'Bắt đầu Tour (6 bước)' }}
              </button>

              <button
                type="button"
                aria-label="Đóng hướng dẫn"
                class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                @click="close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div class="space-y-2.5 border-b border-slate-200 bg-slate-50/75 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div class="relative">
              <Search class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Tìm nhanh hướng dẫn sử dụng (ví dụ: kich ban, xuat anh, log, task vbm, backup, parity)..."
                class="w-full rounded-xl border border-slate-200 bg-white py-2 pr-9 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500"
              />
              <button
                v-if="searchQuery"
                type="button"
                aria-label="Xóa từ khóa tìm kiếm"
                class="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                @click="searchQuery = ''"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  activeTab === 'start'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                "
                @click="activeTab = 'start'"
              >
                <Compass class="h-3.5 w-3.5" />
                Bắt đầu nhanh &amp; Tour
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  activeTab === 'features'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                "
                @click="activeTab = 'features'"
              >
                <Layers class="h-3.5 w-3.5" />
                Toàn bộ Chức năng
                <span
                  class="rounded-full px-1.5 py-0 font-mono text-[10px] font-bold"
                  :class="
                    activeTab === 'features'
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  "
                >
                  {{ searchQuery.trim() ? totalFilteredFeatures : totalFeaturesCount }}
                </span>
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  activeTab === 'recipes'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                "
                @click="activeTab = 'recipes'"
              >
                <Lightbulb class="h-3.5 w-3.5" />
                Tôi muốn...
                <span
                  class="rounded-full px-1.5 py-0 font-mono text-[10px] font-bold"
                  :class="
                    activeTab === 'recipes'
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  "
                >
                  {{ searchQuery.trim() ? filteredRecipes.length : allWorkflowRecipes.length }}
                </span>
              </button>

              <button
                v-if="enableTechMode"
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
                Lộ trình Dev (10 phút)
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
                {{ enableTechMode ? `Khái niệm & Từ điển (${glossaryCount + PUBLIC_CONCEPTS.length})` : `Khái niệm (${PUBLIC_CONCEPTS.length})` }}
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div
              v-if="searchQuery.trim() && activeTab === 'start'"
              class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-xs text-indigo-950 dark:border-cyan-500/35 dark:bg-cyan-500/10 dark:text-cyan-200"
            >
              <span>
                Kết quả cho <strong>"{{ searchQuery }}"</strong>:
                {{ totalFilteredFeatures }} chức năng · {{ filteredRecipes.length }} tình huống · {{ filteredPublicConcepts.length }} khái niệm
              </span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="rounded-lg bg-white px-2.5 py-1 font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-100 dark:bg-slate-800 dark:text-cyan-300"
                  @click="activeTab = 'features'"
                >
                  Xem Chức năng ({{ totalFilteredFeatures }})
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-white px-2.5 py-1 font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-100 dark:bg-slate-800 dark:text-cyan-300"
                  @click="activeTab = 'recipes'"
                >
                  Xem Tình huống ({{ filteredRecipes.length }})
                </button>
              </div>
            </div>

            <!-- TAB 1: START & TOUR -->
            <div v-if="activeTab === 'start'" class="space-y-6">
              <section class="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-cyan-50/70 p-4 dark:border-cyan-500/30 dark:from-indigo-950/40 dark:via-slate-900 dark:to-cyan-950/30">
                <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div class="space-y-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10.5px] font-bold text-white dark:bg-cyan-500 dark:text-slate-950">
                        <Sparkles class="h-3 w-3" />
                        Interactive Spotlight Tour
                      </span>
                      <span
                        v-if="props.tourCompleted"
                        class="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                      >
                        <CheckCircle2 class="h-3 w-3" />
                        Đã xem xong
                      </span>
                      <span
                        v-else
                        class="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300"
                      >
                        Khuyên dùng cho người mới
                      </span>
                    </div>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Chỉ từng bước trực tiếp ngay trên giao diện thật
                    </h3>
                    <p class="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      Hệ thống sẽ lần lượt khoanh sáng từng thanh công cụ, nút điều khiển và giải thích tác dụng cụ thể ngay trên màn hình hiện tại.
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-wrap gap-2">
                    <button
                      v-if="enableTechMode"
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                      @click="triggerAction({ type: 'start_tour', track: 'tech' })"
                    >
                      <Play class="h-3.5 w-3.5 fill-current" />
                      Tour Dev Toàn tập (10 bước)
                    </button>

                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition"
                      :class="
                        enableTechMode
                          ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                          : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500'
                      "
                      @click="triggerAction({ type: 'start_tour', track: 'overview' })"
                    >
                      <Play class="h-3.5 w-3.5 fill-current" />
                      {{ enableTechMode ? 'Tour Tổng quan (6 bước)' : 'Bắt đầu Tour 1 phút (6 bước)' }}
                    </button>
                  </div>
                </div>
              </section>

              <section class="space-y-2.5">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    4 thao tác cốt lõi cần biết ngay
                  </h3>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-cyan-400 dark:hover:text-cyan-300"
                    @click="activeTab = 'features'"
                  >
                    Xem toàn bộ {{ totalFeaturesCount }} chức năng
                    <ArrowRight class="h-3.5 w-3.5" />
                  </button>
                </div>
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
            </div>

            <!-- TAB 2: ALL FEATURES HANDBOOK -->
            <div v-else-if="activeTab === 'features'" class="space-y-4">
              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs font-semibold transition"
                  :class="
                    selectedCategoryId === 'all'
                      ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  "
                  @click="selectedCategoryId = 'all'"
                >
                  Tất cả nhóm ({{ totalFeaturesCount }})
                </button>
                <button
                  v-for="cat in allFeatureCategories"
                  :key="cat.id"
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs font-semibold transition"
                  :class="
                    selectedCategoryId === cat.id
                      ? 'border-indigo-600 bg-indigo-600 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  "
                  @click="selectedCategoryId = cat.id"
                >
                  {{ cat.label }} ({{ cat.items.length }})
                </button>
              </div>

              <div
                v-if="filteredFeatureCategories.length === 0"
                class="rounded-xl border border-dashed border-slate-300 py-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
              >
                Không tìm thấy chức năng nào khớp với "{{ searchQuery }}". Hãy thử xóa bộ lọc hoặc đổi từ khóa.
              </div>

              <div v-else class="space-y-6">
                <section
                  v-for="cat in filteredFeatureCategories"
                  :key="cat.id"
                  class="space-y-3"
                >
                  <div class="border-b border-slate-200 pb-2 dark:border-slate-800">
                    <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {{ cat.label }}
                    </h3>
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {{ cat.description }}
                    </p>
                  </div>

                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <article
                      v-for="item in cat.items"
                      :key="item.id"
                      class="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-cyan-500/40"
                    >
                      <div class="space-y-2.5">
                        <div class="flex flex-wrap items-start justify-between gap-2">
                          <h4 class="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {{ item.title }}
                          </h4>
                          <div class="flex shrink-0 items-center gap-1">
                            <span
                              v-if="item.badge"
                              class="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                            >
                              {{ item.badge }}
                            </span>
                            <kbd
                              v-if="item.shortcut"
                              class="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {{ item.shortcut }}
                            </kbd>
                          </div>
                        </div>

                        <p class="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          {{ item.summary }}
                        </p>

                        <div class="rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-[11px] leading-snug text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                          <span class="font-bold">Dùng khi nào: </span>{{ item.whenToUse }}
                        </div>

                        <ol class="space-y-1 text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                          <li
                            v-for="(stepText, idx) in item.steps"
                            :key="idx"
                            class="flex items-start gap-2"
                          >
                            <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {{ idx + 1 }}
                            </span>
                            <span>{{ stepText }}</span>
                          </li>
                        </ol>
                      </div>

                      <div
                        v-if="item.action && item.actionLabel"
                        class="border-t border-slate-100 pt-2.5 dark:border-slate-800"
                      >
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-cyan-500/35 dark:bg-cyan-500/12 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                          @click="triggerAction(item.action)"
                        >
                          {{ item.actionLabel }}
                          <ArrowRight class="h-3 w-3" />
                        </button>
                      </div>
                    </article>
                  </div>
                </section>
              </div>
            </div>

            <!-- TAB 3: GOAL-ORIENTED RECIPES -->
            <div v-else-if="activeTab === 'recipes'" class="space-y-3">
              <p class="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                Chọn đúng nhu cầu của bạn bên dưới để biết ngay cách làm và bấm nút mở thẳng tới khu vực cần dùng.
              </p>

              <div
                v-if="filteredRecipes.length === 0"
                class="rounded-xl border border-dashed border-slate-300 py-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
              >
                Không tìm thấy tình huống nào phù hợp với "{{ searchQuery }}".
              </div>

              <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <article
                  v-for="rec in filteredRecipes"
                  :key="rec.id"
                  class="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80"
                >
                  <div class="space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <h3 class="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {{ rec.goal }}
                      </h3>
                      <span
                        v-if="rec.badge"
                        class="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      >
                        {{ rec.badge }}
                      </span>
                    </div>

                    <p class="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {{ rec.answer }}
                    </p>

                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                      <span
                        v-for="(step, idx) in rec.steps"
                        :key="idx"
                        class="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
                      >
                        <strong class="font-mono text-indigo-600 dark:text-cyan-400">{{ idx + 1 }}.</strong>
                        {{ step }}
                      </span>
                    </div>
                  </div>

                  <div class="border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-indigo-500 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                      @click="triggerAction(rec.action)"
                    >
                      {{ rec.actionLabel }}
                      <ArrowRight class="h-3 w-3" />
                    </button>
                  </div>
                </article>
              </div>
            </div>

            <!-- TAB 4: DEV 10-MINUTE ONBOARDING -->
            <component
              :is="TechGuidePanel"
              v-else-if="activeTab === 'onboarding' && TechGuidePanel && enableTechMode"
              tab="onboarding"
              :tech-branch="techBranch"
              @jump-tech="jumpToTechNode"
              @open-mini-app-studio="handleOpenMiniAppStudio"
            />

            <!-- TAB 5: CONCEPTS & GLOSSARY -->
            <div v-else class="space-y-6">
              <section class="space-y-2.5">
                <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  Khái niệm cơ bản trên VBot ({{ filteredPublicConcepts.length }})
                </h3>
                <p
                  v-if="filteredPublicConcepts.length === 0"
                  class="rounded-xl border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
                >
                  Không có khái niệm cơ bản nào khớp "{{ searchQuery }}".
                </p>
                <ul v-else class="space-y-2">
                  <li
                    v-for="concept in filteredPublicConcepts"
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

              <section v-if="TechGuidePanel && enableTechMode" class="space-y-2.5 border-t border-slate-200 pt-5 dark:border-slate-800">
                <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  Từ điển kỹ thuật nội bộ ({{ glossaryCount }})
                </h3>
                <component
                  :is="TechGuidePanel"
                  tab="glossary"
                  :tech-branch="techBranch"
                  :external-query="searchQuery"
                  @jump-tech="jumpToTechNode"
                  @open-mini-app-studio="handleOpenMiniAppStudio"
                />
              </section>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
