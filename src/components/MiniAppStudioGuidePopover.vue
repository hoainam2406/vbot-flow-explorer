<script setup lang="ts">
import {
  ArrowRight,
  Compass,
  Eye,
  HelpCircle,
  Map,
  Play,
  PlayCircle,
  Sparkles,
  X,
  Zap,
} from 'lucide-vue-next';
import {
  BRIDGE_MODAL_TABS_GUIDE,
  MINI_APP_WORKFLOW_STEPS,
  STUDIO_QUICK_RECIPES,
  type BridgeModalTabId,
  type StudioQuickRecipe,
} from '../core/miniAppStudioGuide';

const props = defineProps<{
  open: boolean;
  bannerDismissed: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  startTour: [];
  runRecipe: [recipe: StudioQuickRecipe];
  jumpTab: [tab: BridgeModalTabId];
  restoreBanner: [];
}>();

const close = () => {
  emit('update:open', false);
};
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 px-3 py-5 backdrop-blur-xs dark:bg-black/70"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hướng dẫn Mini App Dev Studio và Kịch bản thực hành"
          class="vbot-modal-panel flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/35">
                <HelpCircle class="h-5 w-5" />
              </span>
              <div>
                <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Hướng dẫn dùng Mini App Dev Studio &amp; 5 Kịch bản thực hành
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Luôn mở lại được bất cứ lúc nào từ nút <strong>? Hướng dẫn</strong> — chạy thử không cần viết code trước.
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

          <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <!-- Hero Action Bar -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3.5 dark:border-cyan-500/35 dark:bg-cyan-500/10">
              <div class="flex items-start gap-2.5">
                <Sparkles class="mt-0.5 h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" />
                <div class="text-xs text-cyan-950 dark:text-cyan-100">
                  <div class="font-bold">Chưa quen giao diện 3 cột?</div>
                  <p class="mt-0.5 opacity-85">
                    Bấm nút bên cạnh để chạy lại Tour tương tác 6 bước chỉ trực tiếp vào từng khu vực trên màn hình.
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  v-if="props.bannerDismissed"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-lg border border-cyan-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-500/40 dark:bg-slate-900 dark:text-cyan-300 dark:hover:bg-slate-800"
                  @click="emit('restoreBanner')"
                >
                  <Eye class="h-3.5 w-3.5" />
                  Hiện lại thanh gợi ý đầu trang
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-cyan-500"
                  @click="emit('startTour')"
                >
                  <PlayCircle class="h-3.5 w-3.5" />
                  Chạy lại Tour tương tác (6 bước)
                </button>
              </div>
            </div>

            <!-- 5 Quick 1-Click Recipes -->
            <section class="space-y-2.5">
              <div class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-600 uppercase dark:text-slate-300">
                <Zap class="h-3.5 w-3.5 text-amber-500" />
                5 Kịch bản thực hành 1-Click (Bấm là Studio tự cấu hình &amp; chạy thử)
              </div>
              <div class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <div
                  v-for="recipe in STUDIO_QUICK_RECIPES"
                  :key="recipe.id"
                  class="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/75"
                >
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                      <span class="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {{ recipe.badge }}
                      </span>
                      <span class="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        {{ recipe.platform.toUpperCase() }} · {{ recipe.appId }}
                      </span>
                    </div>
                    <h3 class="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {{ recipe.title }}
                    </h3>
                    <p class="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                      {{ recipe.summary }}
                    </p>
                    <p class="rounded-lg bg-white/80 px-2 py-1.5 text-[10px] leading-snug text-slate-600 dark:bg-slate-950/70 dark:text-slate-300">
                      <strong class="text-cyan-700 dark:text-cyan-300">Quan sát: </strong>{{ recipe.whatToObserve }}
                    </p>
                  </div>

                  <button
                    type="button"
                    class="mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                    @click="emit('runRecipe', recipe)"
                  >
                    <Play class="h-3 w-3" />
                    Chạy thử ngay
                  </button>
                </div>
              </div>
            </section>

            <!-- 4-Step Workflow for New Devs -->
            <section class="space-y-2.5">
              <div class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-600 uppercase dark:text-slate-300">
                <Compass class="h-3.5 w-3.5 text-cyan-500" />
                Quy trình 4 bước cho Dev Mini App mới
              </div>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div
                  v-for="item in MINI_APP_WORKFLOW_STEPS"
                  :key="item.step"
                  class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/75"
                >
                  <div class="flex items-center gap-1.5">
                    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 font-mono text-[10px] font-bold text-white">
                      {{ item.step }}
                    </span>
                    <span class="text-xs font-bold text-slate-900 dark:text-slate-100">{{ item.title }}</span>
                  </div>
                  <p class="mt-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    {{ item.description }}
                  </p>
                </div>
              </div>
            </section>

            <!-- 6-Tab Map -->
            <section class="space-y-2.5">
              <div class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-600 uppercase dark:text-slate-300">
                <Map class="h-3.5 w-3.5 text-indigo-500" />
                Bản đồ 6 Tab — Bấm để mở nhanh
              </div>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  v-for="tabItem in BRIDGE_MODAL_TABS_GUIDE"
                  :key="tabItem.tab"
                  type="button"
                  class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-400 hover:bg-cyan-50/40 dark:border-slate-800 dark:bg-slate-900/75 dark:hover:border-cyan-500/50 dark:hover:bg-slate-800/70"
                  @click="emit('jumpTab', tabItem.tab)"
                >
                  <div>
                    <div class="flex items-center justify-between gap-1 text-xs font-bold text-slate-900 dark:text-slate-100">
                      <span>{{ tabItem.label }}</span>
                      <ArrowRight class="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <p class="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                      {{ tabItem.whenToUse }}
                    </p>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
