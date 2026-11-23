<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Code2, Copy, Download, FlaskConical } from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard, downloadTextFile } from '../core/downloadHelper';
import type { MiniAppContract } from '../core/miniAppContractBuilder';
import {
  generateTypedContractFile,
  generateVitestMockHostFile,
} from '../core/miniAppTypeCodegen';

const props = defineProps<{
  contract: MiniAppContract;
  starterCode: string;
}>();

const { pushToast } = useToast();
const activeTab = ref<'starter' | 'typed' | 'mock'>('typed');
const copied = ref(false);

const typedCode = computed(() => generateTypedContractFile(props.contract));
const mockCode = computed(() => generateVitestMockHostFile(props.contract));

const currentCode = computed(() => {
  if (activeTab.value === 'starter') return props.starterCode;
  if (activeTab.value === 'mock') return mockCode.value;
  return typedCode.value;
});

const currentFilename = computed(() => {
  const id = props.contract.app.id;
  if (activeTab.value === 'starter') return `vbot-starter.${id}.ts`;
  if (activeTab.value === 'mock') return `vbot-mock-host.${id}.ts`;
  return `vbot-contract.${id}.ts`;
});

const copyCode = async () => {
  const ok = await copyTextToClipboard(currentCode.value);
  if (!ok) {
    pushToast('Không thể sao chép vào clipboard', 'error');
    return;
  }
  copied.value = true;
  pushToast(`Đã copy ${currentFilename.value}`, 'success');
  setTimeout(() => {
    copied.value = false;
  }, 1600);
};

const downloadCode = () => {
  downloadTextFile(currentFilename.value, currentCode.value, 'text/typescript;charset=utf-8');
  pushToast(`Đã tải ${currentFilename.value}`, 'success');
};
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
    <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
          :class="
            activeTab === 'typed'
              ? 'bg-white text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-cyan-300'
              : 'text-slate-600 dark:text-slate-300'
          "
          @click="activeTab = 'typed'"
        >
          <Code2 class="h-3 w-3" />
          Typed Client (.ts)
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition"
          :class="
            activeTab === 'mock'
              ? 'bg-white text-emerald-700 shadow-2xs dark:bg-slate-900 dark:text-emerald-300'
              : 'text-slate-600 dark:text-slate-300'
          "
          @click="activeTab = 'mock'"
        >
          <FlaskConical class="h-3 w-3" />
          Unit Test Mock (.ts)
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 transition"
          :class="
            activeTab === 'starter'
              ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-300'
          "
          @click="activeTab = 'starter'"
        >
          Starter Code
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="copyCode"
        >
          <Check v-if="copied" class="h-3 w-3 text-emerald-500" />
          <Copy v-else class="h-3 w-3" />
          {{ copied ? 'Đã copy' : 'Copy' }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-0.5 text-[10.5px] font-semibold text-white hover:bg-indigo-500 dark:bg-cyan-500 dark:text-slate-950"
          @click="downloadCode"
        >
          <Download class="h-3 w-3" />
          Tải {{ currentFilename }}
        </button>
      </div>
    </div>

    <pre class="max-h-80 overflow-auto rounded-lg border border-slate-800 bg-[#0b1120] p-3 font-mono text-[11px] leading-relaxed text-cyan-100"><code>{{ currentCode }}</code></pre>
  </div>
</template>
