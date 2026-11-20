<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { AlertTriangle, Check, Copy } from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard } from '../core/downloadHelper';
import { detectCodeRefLanguage } from '../core/jsonHighlight';
import type { ScenarioStep } from '../core/scenarioFlowEngine';
import type { BridgeMessage, PlatformViewMode } from '../data/schema';
import JsonCodeBlock from './JsonCodeBlock.vue';

const props = defineProps<{
  step: ScenarioStep;
  platformMode: PlatformViewMode;
}>();

const { pushToast } = useToast();
const copiedKey = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const copyText = async (key: string, text: string) => {
  const ok = await copyTextToClipboard(text);
  if (ok) {
    copiedKey.value = key;
    pushToast('Đã sao chép vào clipboard', 'success');
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  }
};

watch(
  () => props.step.node.id,
  () => {
    copiedKey.value = null;
  },
);

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

const detail = computed(() => props.step.node.techDetail);

const apis = computed(() => {
  const merged: string[] = [];
  const seen = new Set<string>();
  const add = (list?: string[]) => {
    for (const item of list ?? []) {
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  };
  if (props.platformMode === 'android') {
    add(detail.value?.byPlatform?.android?.apisOrEvents);
    add(detail.value?.apisOrEvents);
  } else if (props.platformMode === 'ios') {
    add(detail.value?.byPlatform?.ios?.apisOrEvents);
    add(detail.value?.apisOrEvents);
  } else {
    add(detail.value?.apisOrEvents);
    add(detail.value?.byPlatform?.ios?.apisOrEvents);
    add(detail.value?.byPlatform?.android?.apisOrEvents);
  }
  return merged;
});

const codeRefs = computed(() => {
  const merged: string[] = [];
  const seen = new Set<string>();
  const add = (list?: string[]) => {
    for (const item of list ?? []) {
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  };
  if (props.platformMode === 'android') {
    add(detail.value?.byPlatform?.android?.codeRefs);
  } else if (props.platformMode === 'ios') {
    add(detail.value?.codeRefs);
    add(detail.value?.byPlatform?.ios?.codeRefs);
  } else {
    add(detail.value?.codeRefs);
    add(detail.value?.byPlatform?.ios?.codeRefs);
    add(detail.value?.byPlatform?.android?.codeRefs);
  }
  return merged;
});

const bridgeMessages = computed<BridgeMessage[]>(() => {
  const all = detail.value?.miniAppBridge?.messages ?? [];
  return all.slice(0, 3);
});

const resolveHostFn = (msg: BridgeMessage): string | undefined => {
  if (props.platformMode === 'android') {
    return msg.hostFnByPlatform?.android ?? msg.hostFn;
  }
  if (props.platformMode === 'ios') {
    return msg.hostFnByPlatform?.ios ?? msg.hostFn;
  }
  return msg.hostFn ?? msg.hostFnByPlatform?.ios ?? msg.hostFnByPlatform?.android;
};
</script>

<template>
  <div class="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
    <div
      v-if="props.step.node.summary.tech"
      class="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10"
    >
      <div class="text-[11px] font-bold tracking-wide text-indigo-800 uppercase dark:text-indigo-300">
        Xử lý kỹ thuật
      </div>
      <p class="mt-1 text-xs leading-relaxed text-slate-800 dark:text-slate-200">
        {{ props.step.node.summary.tech }}
      </p>
    </div>

    <div
      v-if="detail?.platformDiffNote"
      class="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <div class="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 uppercase dark:text-amber-300">
        <AlertTriangle class="h-3.5 w-3.5" />
        Khác biệt iOS ↔ Android
      </div>
      <p class="mt-1 leading-relaxed">
        {{ detail.platformDiffNote }}
      </p>
    </div>

    <div
      v-if="props.platformMode === 'compare' && detail?.byPlatform?.android?.summary"
      class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-slate-200"
    >
      <div class="text-[11px] font-bold text-emerald-800 uppercase dark:text-emerald-300">
        Android chi tiết
      </div>
      <p class="mt-1 leading-relaxed">{{ detail.byPlatform.android.summary }}</p>
    </div>

    <div v-if="apis.length > 0" class="space-y-1.5">
      <div class="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        API / Event liên quan
      </div>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="api in apis"
          :key="api"
          class="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
        >
          {{ api }}
        </span>
      </div>
    </div>

    <div v-if="bridgeMessages.length > 0" class="space-y-2">
      <div class="text-[11px] font-bold tracking-wide text-cyan-800 uppercase dark:text-cyan-300">
        Mini App Bridge ({{ detail?.miniAppBridge?.miniAppId }})
      </div>
      <div
        v-for="(msg, mIdx) in bridgeMessages"
        :key="`${msg.name}-${mIdx}`"
        class="space-y-1.5 rounded-xl border border-cyan-200 bg-cyan-50/50 p-2.5 text-xs dark:border-cyan-500/30 dark:bg-cyan-500/8"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs font-bold text-cyan-950 dark:text-cyan-200">{{ msg.name }}</span>
          <span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800 dark:bg-slate-900 dark:text-cyan-300">
            {{
              msg.direction === 'host_init'
                ? 'Host Init'
                : msg.direction === 'host_to_miniapp'
                  ? 'Host → Mini App'
                  : 'Mini App → Host'
            }}
          </span>
        </div>
        <div v-if="resolveHostFn(msg)" class="font-mono text-[11px] break-all text-slate-700 dark:text-slate-300">
          Host: {{ resolveHostFn(msg) }}
        </div>
        <div v-if="msg.miniAppFn" class="font-mono text-[11px] break-all text-slate-700 dark:text-slate-300">
          JS: {{ msg.miniAppFn }}
        </div>

        <div v-if="msg.examplePayload" class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-slate-500 uppercase dark:text-slate-400">Payload mẫu</span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              @click="copyText(`pay-${mIdx}`, msg.examplePayload)"
            >
              <Check v-if="copiedKey === `pay-${mIdx}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <Copy v-else class="h-3 w-3" />
              Copy
            </button>
          </div>
          <JsonCodeBlock :code="msg.examplePayload" />
        </div>

        <div v-if="msg.exampleResponse" class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-slate-500 uppercase dark:text-slate-400">Response mẫu</span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              @click="copyText(`res-${mIdx}`, msg.exampleResponse)"
            >
              <Check v-if="copiedKey === `res-${mIdx}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <Copy v-else class="h-3 w-3" />
              Copy
            </button>
          </div>
          <JsonCodeBlock :code="msg.exampleResponse" />
        </div>

        <p v-if="msg.parityNote" class="text-[11px] leading-relaxed text-amber-900 dark:text-amber-300">
          {{ msg.parityNote }}
        </p>
      </div>
    </div>

    <div v-if="codeRefs.length > 0" class="space-y-1.5">
      <div class="text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        Code References
      </div>
      <div class="space-y-1">
        <div
          v-for="(refPath, rIdx) in codeRefs"
          :key="refPath"
          class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900/70"
        >
          <div class="flex min-w-0 items-center gap-1.5">
            <span
              v-if="detectCodeRefLanguage(refPath)"
              class="shrink-0 rounded border px-1.5 py-0.2 text-[9.5px] font-bold"
              :class="detectCodeRefLanguage(refPath)!.cls"
            >
              {{ detectCodeRefLanguage(refPath)!.label }}
            </span>
            <span class="min-w-0 truncate font-mono text-[11px] text-slate-800 dark:text-slate-200" :title="refPath">
              {{ refPath }}
            </span>
          </div>
          <button
            type="button"
            aria-label="Copy đường dẫn file"
            class="shrink-0 rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            @click="copyText(`ref-${rIdx}`, refPath)"
          >
            <Check v-if="copiedKey === `ref-${rIdx}`" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <Copy v-else class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
