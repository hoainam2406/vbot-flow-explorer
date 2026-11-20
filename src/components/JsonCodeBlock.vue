<script setup lang="ts">
import { computed } from 'vue';
import { highlightJson } from '../core/jsonHighlight';

const props = defineProps<{
  code: string;
  maxHeightClass?: string;
}>();

const highlightedHtml = computed(() => highlightJson(props.code));
</script>

<template>
  <pre
    class="overflow-x-auto rounded-lg border border-slate-800/90 bg-[#0b1120] p-2.5 font-mono text-[11px] leading-relaxed text-slate-200 shadow-inner dark:border-slate-700/75"
    :class="props.maxHeightClass"
  ><code v-html="highlightedHtml" /></pre>
</template>
