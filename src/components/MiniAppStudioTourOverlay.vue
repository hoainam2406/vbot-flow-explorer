<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-vue-next';
import type { StudioTourStep } from '../core/miniAppStudioGuide';

const props = defineProps<{
  open: boolean;
  steps: StudioTourStep[];
  stepIndex: number;
}>();

const emit = defineEmits<{
  'update:stepIndex': [index: number];
  close: [completed: boolean];
}>();

const currentStep = computed<StudioTourStep | null>(
  () => props.steps[props.stepIndex] ?? props.steps[0] ?? null,
);

const targetRect = ref<{ top: number; left: number; width: number; height: number } | null>(null);
const cardRef = ref<HTMLElement | null>(null);

const measureTarget = () => {
  if (!props.open || !currentStep.value) {
    targetRect.value = null;
    return;
  }
  const el = document.querySelector<HTMLElement>(currentStep.value.targetSelector);
  if (!el) {
    targetRect.value = null;
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) {
    targetRect.value = null;
    return;
  }
  const pad = 6;
  targetRect.value = {
    top: Math.max(4, r.top - pad),
    left: Math.max(4, r.left - pad),
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
};

const scheduleMeasure = async () => {
  await nextTick();
  requestAnimationFrame(() => {
    measureTarget();
    requestAnimationFrame(() => {
      measureTarget();
    });
  });
};

const handleWindowChange = () => {
  if (props.open) {
    measureTarget();
  }
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (!props.open) return;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (props.stepIndex < props.steps.length - 1) {
      emit('update:stepIndex', props.stepIndex + 1);
    } else {
      emit('close', true);
    }
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (props.stepIndex > 0) {
      emit('update:stepIndex', props.stepIndex - 1);
    }
  }
};

watch(
  () => [props.open, props.stepIndex] as const,
  ([isOpen]) => {
    if (isOpen) {
      void scheduleMeasure();
      window.addEventListener('resize', handleWindowChange);
      window.addEventListener('scroll', handleWindowChange, true);
      window.addEventListener('keydown', handleKeyDown);
    } else {
      targetRect.value = null;
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      window.removeEventListener('keydown', handleKeyDown);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowChange);
  window.removeEventListener('scroll', handleWindowChange, true);
  window.removeEventListener('keydown', handleKeyDown);
});

const cardStyle = computed<Record<string, string>>(() => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const margin = 12;
  const cardWidth = Math.min(380, vw - margin * 2);
  const estHeight = cardRef.value?.offsetHeight || 260;

  if (!targetRect.value) {
    return {
      width: `${cardWidth}px`,
      top: `${Math.max(margin, (vh - estHeight) / 2)}px`,
      left: `${Math.max(margin, (vw - cardWidth) / 2)}px`,
    };
  }

  const r = targetRect.value;
  const spaceBelow = vh - (r.top + r.height) - margin;
  const spaceAbove = r.top - margin;

  let top = r.top + r.height + 12;
  if (spaceBelow < estHeight && spaceAbove >= estHeight) {
    top = r.top - estHeight - 12;
  } else if (spaceBelow < estHeight && spaceAbove < estHeight) {
    // Target chiếm phần lớn chiều cao (như cột dọc): đặt thẻ sang bên trái/phải hoặc trong góc an toàn
    const spaceRight = vw - (r.left + r.width) - margin;
    const spaceLeft = r.left - margin;
    if (spaceRight >= cardWidth + 12) {
      const sideTop = Math.min(Math.max(margin, r.top), vh - estHeight - margin);
      return {
        width: `${cardWidth}px`,
        top: `${sideTop}px`,
        left: `${r.left + r.width + 12}px`,
      };
    }
    if (spaceLeft >= cardWidth + 12) {
      const sideTop = Math.min(Math.max(margin, r.top), vh - estHeight - margin);
      return {
        width: `${cardWidth}px`,
        top: `${sideTop}px`,
        left: `${r.left - cardWidth - 12}px`,
      };
    }
    top = Math.min(Math.max(margin, r.top + 16), vh - estHeight - margin);
  }

  const clampedTop = Math.min(Math.max(margin, top), vh - estHeight - margin);
  const clampedLeft = Math.min(Math.max(margin, r.left), vw - cardWidth - margin);

  return {
    width: `${cardWidth}px`,
    top: `${clampedTop}px`,
    left: `${clampedLeft}px`,
  };
});

const isFirst = computed(() => props.stepIndex <= 0);
const isLast = computed(() => props.stepIndex >= props.steps.length - 1);
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open && currentStep" class="fixed inset-0 z-[70]">
      <!-- Backdrop layer when no rect (fallback dim) or click blocker -->
      <div
        class="fixed inset-0"
        :class="targetRect ? 'bg-transparent' : 'bg-slate-950/75'"
        @click="emit('close', false)"
      />

      <!-- Spotlight cutout ring -->
      <div
        v-if="targetRect"
        class="pointer-events-none fixed rounded-xl ring-2 ring-cyan-400 transition-all duration-200"
        :style="{
          top: `${targetRect.top}px`,
          left: `${targetRect.left}px`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`,
          boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.74)',
        }"
      />

      <!-- Floating explanation card -->
      <div
        ref="cardRef"
        role="dialog"
        aria-modal="true"
        :aria-label="`Hướng dẫn bước ${currentStep.stepNumber}: ${currentStep.title}`"
        class="fixed z-10 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-all duration-200 dark:border-slate-700 dark:bg-slate-900"
        :style="cardStyle"
        @click.stop
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-[11px] font-bold text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300">
              <Sparkles class="h-3 w-3" />
              Bước {{ stepIndex + 1 }} / {{ steps.length }}
            </span>
          </div>
          <button
            type="button"
            aria-label="Đóng tour hướng dẫn"
            class="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            @click="emit('close', false)"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <h3 class="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          {{ currentStep.title }}
        </h3>

        <p class="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {{ currentStep.description }}
        </p>

        <div class="mt-2.5 rounded-lg border border-cyan-200 bg-cyan-50/70 px-2.5 py-2 text-[11px] leading-snug text-cyan-950 dark:border-cyan-500/35 dark:bg-cyan-500/10 dark:text-cyan-200">
          <span class="font-bold">Mẹo: </span>{{ currentStep.tip }}
        </div>

        <!-- Progress dots & Navigation buttons -->
        <div class="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div class="flex items-center gap-1">
            <button
              v-for="(st, idx) in steps"
              :key="st.id"
              type="button"
              :aria-label="`Chuyển tới bước ${idx + 1}`"
              class="h-1.5 rounded-full transition-all"
              :class="
                idx === stepIndex
                  ? 'w-5 bg-cyan-600 dark:bg-cyan-400'
                  : 'w-1.5 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-500'
              "
              @click="emit('update:stepIndex', idx)"
            />
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="emit('close', false)"
            >
              Bỏ qua
            </button>
            <button
              v-if="!isFirst"
              type="button"
              class="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              @click="emit('update:stepIndex', stepIndex - 1)"
            >
              <ChevronLeft class="h-3.5 w-3.5" />
              Trước
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-0.5 rounded-lg bg-cyan-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-cyan-500"
              @click="isLast ? emit('close', true) : emit('update:stepIndex', stepIndex + 1)"
            >
              {{ isLast ? 'Hoàn tất' : 'Tiếp theo' }}
              <ChevronRight v-if="!isLast" class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
