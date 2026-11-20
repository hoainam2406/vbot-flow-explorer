<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info } from 'lucide-vue-next';
import { useToast } from '../composables/useToast';

const { toasts, dismissToast } = useToast();
</script>

<template>
  <Teleport to="body">
    <div
      aria-live="polite"
      class="pointer-events-none fixed top-16 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 px-4"
    >
      <TransitionGroup name="vbot-toast">
        <button
          v-for="item in toasts"
          :key="item.id"
          type="button"
          class="pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md transition"
          :class="
            item.variant === 'error'
              ? 'border-rose-300 bg-rose-50/95 text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/90 dark:text-rose-200'
              : item.variant === 'info'
                ? 'border-cyan-300 bg-white/95 text-slate-800 dark:border-cyan-500/40 dark:bg-slate-900/95 dark:text-slate-100'
                : 'border-emerald-300 bg-white/95 text-slate-800 dark:border-emerald-500/40 dark:bg-slate-900/95 dark:text-slate-100'
          "
          @click="dismissToast(item.id)"
        >
          <AlertCircle
            v-if="item.variant === 'error'"
            class="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400"
          />
          <Info
            v-else-if="item.variant === 'info'"
            class="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400"
          />
          <CheckCircle2
            v-else
            class="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <span>{{ item.message }}</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
