<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeftRight } from 'lucide-vue-next';
import type { BridgeMessage, FlowNodeData, MiniAppBridge } from '../../data/schema';

const props = defineProps<{
  node: FlowNodeData;
}>();

const techSummary = computed(() => props.node.summary.tech ?? null);

const miniAppBridgeView = computed(() => {
  const bridge: MiniAppBridge | undefined = props.node.techDetail?.miniAppBridge;
  if (!bridge) return null;

  const embedLabels: Record<MiniAppBridge['embedMode'], string> = {
    inline_tab: 'Inline Tab',
    modal: 'Modal',
    sdk_global: 'Global SDK',
  };

  const dirMeta: Record<BridgeMessage['direction'], { label: string; cls: string }> = {
    host_init: {
      label: 'Host → Mini App (Init)',
      cls: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    },
    host_to_miniapp: {
      label: 'Host → Mini App (Event)',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    miniapp_to_host: {
      label: 'Mini App → Host (Action)',
      cls: 'border-blue-200 bg-blue-50 text-blue-700',
    },
  };

  return {
    miniAppId: bridge.miniAppId,
    embedLabel: embedLabels[bridge.embedMode],
    transport: bridge.transport,
    messages: bridge.messages.map((msg) => ({
      ...msg,
      dirLabel: dirMeta[msg.direction].label,
      dirCls: dirMeta[msg.direction].cls,
    })),
  };
});

const techSections = computed(() => {
  const detail = props.node.techDetail;
  if (!detail) return [];
  return [
    { key: 'inputs', title: 'Inputs', items: detail.inputs ?? [], mono: false },
    { key: 'outputs', title: 'Outputs', items: detail.outputs ?? [], mono: false },
    { key: 'apisOrEvents', title: 'APIs / Events', items: detail.apisOrEvents ?? [], mono: true },
    { key: 'edgeCases', title: 'Edge Cases', items: detail.edgeCases ?? [], mono: false },
    { key: 'codeRefs', title: 'Code Refs', items: detail.codeRefs ?? [], mono: true },
  ].filter((section) => section.items.length > 0);
});
</script>

<template>
  <section
    v-if="techSummary"
    class="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
  >
    <h3 class="text-xs font-bold tracking-wide text-slate-700 uppercase">
      Chi tiết xử lý kỹ thuật
    </h3>
    <p class="text-xs leading-relaxed text-slate-700">
      {{ techSummary }}
    </p>
  </section>

  <section
    v-if="miniAppBridgeView"
    class="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3.5"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-cyan-900 uppercase">
        <ArrowLeftRight class="h-3.5 w-3.5 text-cyan-700" />
        Giao tiếp Host App ↔ Mini App
      </h3>
      <span class="rounded-md border border-cyan-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-cyan-800">
        {{ miniAppBridgeView.embedLabel }}
      </span>
    </div>

    <div class="space-y-1 text-xs">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="font-medium text-slate-600">Mini App ID:</span>
        <code class="rounded border border-cyan-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
          {{ miniAppBridgeView.miniAppId }}
        </code>
      </div>
      <p v-if="miniAppBridgeView.transport" class="text-[11px] leading-relaxed text-slate-600">
        {{ miniAppBridgeView.transport }}
      </p>
    </div>

    <ul class="space-y-2">
      <li
        v-for="(msg, idx) in miniAppBridgeView.messages"
        :key="`${msg.direction}-${msg.name}-${idx}`"
        class="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
      >
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <span
            class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold"
            :class="msg.dirCls"
          >
            {{ msg.dirLabel }}
          </span>
          <code class="font-mono text-[11px] font-bold break-all text-slate-900">
            {{ msg.name }}
          </code>
        </div>

        <div v-if="msg.hostFn" class="text-[11px] text-slate-600">
          <span class="font-semibold text-indigo-700">Host fn:</span>
          <code class="ml-1 font-mono break-all text-slate-800">{{ msg.hostFn }}</code>
        </div>

        <div v-if="msg.miniAppFn" class="text-[11px] text-slate-600">
          <span class="font-semibold text-cyan-700">Mini App fn:</span>
          <code class="ml-1 font-mono break-all text-slate-800">{{ msg.miniAppFn }}</code>
        </div>

        <div v-if="msg.payload" class="text-[11px] text-slate-600">
          <span class="font-semibold text-slate-700">Payload:</span>
          <code class="ml-1 font-mono break-all text-slate-800">{{ msg.payload }}</code>
        </div>

        <div v-if="msg.response" class="text-[11px] text-slate-600">
          <span class="font-semibold text-slate-700">Response:</span>
          <code class="ml-1 font-mono break-all text-slate-800">{{ msg.response }}</code>
        </div>

        <p v-if="msg.note" class="text-[11px] leading-relaxed text-slate-600">
          {{ msg.note }}
        </p>
      </li>
    </ul>
  </section>

  <template v-if="techSections.length > 0">
    <section
      v-for="section in techSections"
      :key="section.key"
      class="space-y-1.5"
    >
      <h3 class="text-xs font-bold tracking-wide text-slate-500 uppercase">
        {{ section.title }}
      </h3>
      <ul class="space-y-1.5">
        <li
          v-for="item in section.items"
          :key="item"
          class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          :class="section.mono ? 'font-mono break-all text-slate-800' : 'leading-relaxed'"
        >
          {{ item }}
        </li>
      </ul>
    </section>
  </template>
</template>
