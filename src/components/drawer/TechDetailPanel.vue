<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeftRight, ArrowRight, ChevronDown, ChevronRight } from 'lucide-vue-next';
import type { BridgeMessage, FlowNodeData, MiniAppBridge } from '../../data/schema';

const props = defineProps<{
  node: FlowNodeData;
}>();

const expandedMap = ref<Record<number, boolean>>({});

watch(
  () => props.node.id,
  () => {
    expandedMap.value = {};
  },
);

const isMessageOpen = (idx: number, total: number): boolean => {
  const manual = expandedMap.value[idx];
  if (manual !== undefined) return manual;
  return total <= 2 || idx === 0;
};

const toggleMessage = (idx: number, total: number) => {
  expandedMap.value = {
    ...expandedMap.value,
    [idx]: !isMessageOpen(idx, total),
  };
};

const techSummary = computed(() => props.node.summary.tech ?? null);

const miniAppBridgeView = computed(() => {
  const bridge: MiniAppBridge | undefined = props.node.techDetail?.miniAppBridge;
  if (!bridge) return null;

  const embedLabels: Record<MiniAppBridge['embedMode'], string> = {
    inline_tab: 'Inline Tab',
    modal: 'Modal',
    sdk_global: 'Global SDK',
  };

  const dirMeta: Record<
    BridgeMessage['direction'],
    { from: string; to: string; tag: string; cls: string }
  > = {
    host_init: {
      from: 'Host App (iOS)',
      to: 'Mini App (JS)',
      tag: 'Khởi tạo',
      cls: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    },
    host_to_miniapp: {
      from: 'Host App (iOS)',
      to: 'Mini App (JS)',
      tag: 'Sự kiện',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    miniapp_to_host: {
      from: 'Mini App (JS)',
      to: 'Host App (iOS)',
      tag: 'Gọi lệnh',
      cls: 'border-blue-200 bg-blue-50 text-blue-700',
    },
  };

  return {
    miniAppId: bridge.miniAppId,
    embedLabel: embedLabels[bridge.embedMode],
    transport: bridge.transport,
    messages: bridge.messages.map((msg) => ({
      ...msg,
      dirFrom: dirMeta[msg.direction].from,
      dirTo: dirMeta[msg.direction].to,
      dirTag: dirMeta[msg.direction].tag,
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

    <ul class="space-y-2.5">
      <li
        v-for="(msg, idx) in miniAppBridgeView.messages"
        :key="`${msg.direction}-${msg.name}-${idx}`"
        class="overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-2xs"
      >
        <button
          type="button"
          class="flex w-full items-start justify-between gap-2 p-2.5 text-left transition hover:bg-slate-50"
          :aria-expanded="isMessageOpen(idx, miniAppBridgeView.messages.length)"
          @click="toggleMessage(idx, miniAppBridgeView.messages.length)"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                :class="msg.dirCls"
              >
                <span>{{ msg.dirFrom }}</span>
                <ArrowRight class="h-2.5 w-2.5 shrink-0" />
                <span>{{ msg.dirTo }}</span>
              </span>
              <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {{ msg.dirTag }}
              </span>
            </div>
            <div class="font-mono text-[12px] font-bold break-all text-slate-900">
              {{ msg.name }}
            </div>
          </div>

          <span class="mt-0.5 shrink-0 rounded p-0.5 text-slate-400">
            <ChevronDown
              v-if="isMessageOpen(idx, miniAppBridgeView.messages.length)"
              class="h-4 w-4"
            />
            <ChevronRight v-else class="h-4 w-4" />
          </span>
        </button>

        <div
          v-if="isMessageOpen(idx, miniAppBridgeView.messages.length)"
          class="space-y-2.5 border-t border-slate-100 px-2.5 pt-2.5 pb-3"
        >
          <div v-if="msg.hostFn || msg.miniAppFn" class="space-y-1.5">
            <div
              v-if="msg.hostFn"
              class="rounded-md border border-indigo-100 bg-indigo-50/50 px-2.5 py-1.5"
            >
              <div class="text-[10px] font-bold tracking-wide text-indigo-700 uppercase">
                Hàm phía Host (iOS / Swift)
              </div>
              <code class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800">
                {{ msg.hostFn }}
              </code>
            </div>

            <div
              v-if="msg.miniAppFn"
              class="rounded-md border border-cyan-100 bg-cyan-50/50 px-2.5 py-1.5"
            >
              <div class="text-[10px] font-bold tracking-wide text-cyan-700 uppercase">
                Hàm phía Mini App (JS / SDK)
              </div>
              <code class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800">
                {{ msg.miniAppFn }}
              </code>
            </div>
          </div>

          <div v-if="msg.examplePayload || msg.payload" class="space-y-1">
            <div class="flex flex-wrap items-baseline justify-between gap-1 text-[11px]">
              <span class="font-semibold text-slate-700">
                {{ msg.examplePayload ? 'Ví dụ dữ liệu truyền vào (JSON)' : 'Tham số truyền (Schema)' }}
              </span>
            </div>
            <pre
              v-if="msg.examplePayload"
              class="overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-slate-100"
            ><code>{{ msg.examplePayload }}</code></pre>
            <div
              v-if="msg.payload"
              class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600"
            >
              <span v-if="msg.examplePayload" class="font-medium text-slate-500">Schema: </span>
              <code class="font-mono break-all text-slate-700">{{ msg.payload }}</code>
            </div>
          </div>

          <div v-if="msg.exampleResponse || msg.response" class="space-y-1">
            <div class="text-[11px] font-semibold text-slate-700">
              {{ msg.exampleResponse ? 'Ví dụ dữ liệu trả về (JSON)' : 'Dữ liệu trả về (Schema)' }}
            </div>
            <pre
              v-if="msg.exampleResponse"
              class="overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-200"
            ><code>{{ msg.exampleResponse }}</code></pre>
            <div
              v-if="msg.response"
              class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600"
            >
              <span v-if="msg.exampleResponse" class="font-medium text-slate-500">Schema: </span>
              <code class="font-mono break-all text-slate-700">{{ msg.response }}</code>
            </div>
          </div>

          <p
            v-if="msg.note"
            class="rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-700"
          >
            {{ msg.note }}
          </p>
        </div>
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
