<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
} from 'lucide-vue-next';
import { copyTextToClipboard } from '../../core/downloadHelper';
import type {
  BridgeMessage,
  FlowNodeData,
  MiniAppBridge,
  PlatformTechDetail,
  PlatformViewMode,
} from '../../data/schema';

const props = defineProps<{
  node: FlowNodeData;
  platformMode: PlatformViewMode;
}>();

const expandedMap = ref<Record<number, boolean>>({});
const copiedKey = ref<string | null>(null);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

const copyValue = async (key: string, value: string) => {
  const ok = await copyTextToClipboard(value);
  if (ok) {
    copiedKey.value = key;
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  }
};

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

watch(
  () => props.node.id,
  () => {
    expandedMap.value = {};
    copiedKey.value = null;
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

const mergeUnique = (...lists: Array<string[] | undefined>): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }
  return result;
};

const isCompare = computed(() => props.platformMode === 'compare');
const activeSinglePlatform = computed<'ios' | 'android'>(() =>
  props.platformMode === 'android' ? 'android' : 'ios',
);
const singleOnlyPlatform = computed<'ios' | 'android' | null>(() =>
  props.node.platforms?.length === 1 ? props.node.platforms[0] : null,
);

const platformDiffNote = computed(() => props.node.techDetail?.platformDiffNote ?? null);

const singlePlatformNotice = computed(() => {
  if (!isCompare.value || !singleOnlyPlatform.value) return null;
  return singleOnlyPlatform.value === 'ios'
    ? 'Bước này chỉ tồn tại trong luồng iOS (không chạy trên Android).'
    : 'Bước này chỉ tồn tại trong luồng Android (không chạy trên iOS).';
});

const iosSummary = computed(() => {
  if (singleOnlyPlatform.value === 'android') return null;
  return props.node.techDetail?.byPlatform?.ios?.summary ?? props.node.summary.tech ?? null;
});

const androidSummary = computed(() => {
  if (singleOnlyPlatform.value === 'ios') return null;
  return props.node.techDetail?.byPlatform?.android?.summary ?? props.node.summary.tech ?? null;
});

const singleTechSummary = computed(() => {
  if (activeSinglePlatform.value === 'ios') {
    return iosSummary.value;
  }
  return (
    props.node.techDetail?.byPlatform?.android?.summary ?? props.node.summary.tech ?? null
  );
});

const singleHostLabel = computed(() =>
  activeSinglePlatform.value === 'ios'
    ? 'Hàm phía Host (iOS / Swift)'
    : 'Hàm phía Host (Android / Kotlin)',
);

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
      from: 'Host App',
      to: 'Mini App (JS)',
      tag: 'Khởi tạo',
      cls: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    },
    host_to_miniapp: {
      from: 'Host App',
      to: 'Mini App (JS)',
      tag: 'Sự kiện',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    miniapp_to_host: {
      from: 'Mini App (JS)',
      to: 'Host App',
      tag: 'Gọi lệnh',
      cls: 'border-blue-200 bg-blue-50 text-blue-700',
    },
  };

  const transportIos =
    bridge.transportByPlatform?.ios ??
    (singleOnlyPlatform.value === 'android' ? undefined : bridge.transport);
  const transportAndroid =
    bridge.transportByPlatform?.android ??
    (singleOnlyPlatform.value === 'ios' ? undefined : bridge.transport);

  return {
    miniAppId: bridge.miniAppId,
    embedLabel: embedLabels[bridge.embedMode],
    transportIos,
    transportAndroid,
    hasTransportDiff: Boolean(
      bridge.transportByPlatform?.ios || bridge.transportByPlatform?.android,
    ),
    singleTransport:
      activeSinglePlatform.value === 'ios' ? transportIos : transportAndroid,
    messages: bridge.messages.map((msg) => {
      const iosHostFn =
        singleOnlyPlatform.value === 'android'
          ? undefined
          : (msg.hostFnByPlatform?.ios ?? msg.hostFn);
      const androidHostFn =
        singleOnlyPlatform.value === 'ios'
          ? undefined
          : (msg.hostFnByPlatform?.android ??
            (singleOnlyPlatform.value === 'android' ? msg.hostFn : undefined));
      const singleHostFn =
        activeSinglePlatform.value === 'ios'
          ? iosHostFn
          : (msg.hostFnByPlatform?.android ??
            (msg.parityNote ? undefined : msg.hostFn));

      return {
        ...msg,
        iosHostFn,
        androidHostFn,
        singleHostFn,
        dirFrom: dirMeta[msg.direction].from,
        dirTo: dirMeta[msg.direction].to,
        dirTag: dirMeta[msg.direction].tag,
        dirCls: dirMeta[msg.direction].cls,
      };
    }),
  };
});

type SectionKey = keyof Pick<
  PlatformTechDetail,
  'inputs' | 'outputs' | 'apisOrEvents' | 'edgeCases' | 'codeRefs'
>;

interface RenderedTechSection {
  key: SectionKey;
  title: string;
  mono: boolean;
  isSplit: boolean;
  sharedItems: string[];
  iosItems: string[];
  androidItems: string[];
}

const techSections = computed<RenderedTechSection[]>(() => {
  const detail = props.node.techDetail;
  if (!detail) return [];

  const specs: Array<{ key: SectionKey; title: string; mono: boolean }> = [
    { key: 'inputs', title: 'Inputs', mono: false },
    { key: 'outputs', title: 'Outputs', mono: false },
    { key: 'apisOrEvents', title: 'APIs / Events', mono: true },
    { key: 'edgeCases', title: 'Edge Cases', mono: false },
    { key: 'codeRefs', title: 'Code Refs', mono: true },
  ];

  const iosDetail = detail.byPlatform?.ios;
  const androidDetail = detail.byPlatform?.android;

  return specs
    .map((spec): RenderedTechSection | null => {
      const shared = detail[spec.key] ?? [];
      const iosExtra = iosDetail?.[spec.key] ?? [];
      const androidExtra = androidDetail?.[spec.key] ?? [];

      if (isCompare.value) {
        const hasPlatformSplit =
          iosExtra.length > 0 ||
          androidExtra.length > 0 ||
          (spec.key === 'codeRefs' && shared.length > 0 && androidExtra.length > 0);

        if (hasPlatformSplit) {
          const iosItems =
            spec.key === 'codeRefs'
              ? iosExtra.length > 0
                ? iosExtra
                : singleOnlyPlatform.value === 'android'
                  ? []
                  : shared
              : mergeUnique(shared, iosExtra);
          const androidItems =
            spec.key === 'codeRefs'
              ? androidExtra.length > 0
                ? androidExtra
                : singleOnlyPlatform.value === 'android'
                  ? shared
                  : []
              : mergeUnique(shared, androidExtra);

          if (iosItems.length === 0 && androidItems.length === 0) return null;
          return {
            key: spec.key,
            title: spec.title,
            mono: spec.mono,
            isSplit: true,
            sharedItems: [],
            iosItems,
            androidItems,
          };
        }

        const merged = mergeUnique(shared, iosExtra, androidExtra);
        if (merged.length === 0) return null;
        return {
          key: spec.key,
          title: spec.title,
          mono: spec.mono,
          isSplit: false,
          sharedItems: merged,
          iosItems: [],
          androidItems: [],
        };
      }

      if (activeSinglePlatform.value === 'ios') {
        const items =
          spec.key === 'codeRefs' && iosExtra.length > 0
            ? iosExtra
            : mergeUnique(shared, iosExtra);
        if (items.length === 0) return null;
        return {
          key: spec.key,
          title: spec.title,
          mono: spec.mono,
          isSplit: false,
          sharedItems: items,
          iosItems: [],
          androidItems: [],
        };
      }

      const androidItems =
        spec.key === 'codeRefs'
          ? androidExtra.length > 0
            ? androidExtra
            : singleOnlyPlatform.value === 'android'
              ? shared
              : []
          : mergeUnique(shared, androidExtra);
      if (androidItems.length === 0) return null;
      return {
        key: spec.key,
        title: spec.title,
        mono: spec.mono,
        isSplit: false,
        sharedItems: androidItems,
        iosItems: [],
        androidItems: [],
      };
    })
    .filter((s): s is RenderedTechSection => Boolean(s));
});
</script>

<template>
  <div
    v-if="isCompare"
    class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 text-xs text-indigo-950"
  >
    <span class="inline-flex items-center gap-1.5 font-bold">
      <Columns2 class="h-3.5 w-3.5 text-indigo-600" />
      Chế độ đối chiếu iOS (Swift) ↔ Android (Kotlin/Java)
    </span>
    <span class="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
      Cột trái: iOS · Cột phải: Android
    </span>
  </div>

  <div
    v-if="singlePlatformNotice"
    class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900"
  >
    {{ singlePlatformNotice }}
  </div>

  <div
    v-if="platformDiffNote"
    class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-950"
  >
    <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
    <div>
      <div class="text-[11px] font-bold tracking-wide text-amber-800 uppercase">
        Điểm khác biệt iOS ↔ Android
      </div>
      <p class="mt-0.5">{{ platformDiffNote }}</p>
    </div>
  </div>

  <section
    v-if="isCompare && (iosSummary || androidSummary)"
    class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
  >
    <h3 class="text-xs font-bold tracking-wide text-slate-700 uppercase">
      Chi tiết xử lý kỹ thuật (iOS vs Android)
    </h3>
    <div class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      <div class="rounded-lg border border-slate-300 bg-white p-3">
        <div class="mb-1 text-[10px] font-bold tracking-wide text-slate-700 uppercase">
          iOS (Swift)
        </div>
        <p v-if="iosSummary" class="text-xs leading-relaxed text-slate-700">
          {{ iosSummary }}
        </p>
        <p v-else class="text-xs italic text-slate-400">
          Không áp dụng trên iOS (chỉ Android)
        </p>
      </div>

      <div class="rounded-lg border border-emerald-200 bg-emerald-50/35 p-3">
        <div class="mb-1 text-[10px] font-bold tracking-wide text-emerald-700 uppercase">
          Android (Kotlin / Java)
        </div>
        <p v-if="androidSummary" class="text-xs leading-relaxed text-slate-700">
          {{ androidSummary }}
        </p>
        <p v-else class="text-xs italic text-slate-400">
          Không áp dụng trên Android (chỉ iOS)
        </p>
      </div>
    </div>
  </section>

  <section
    v-else-if="!isCompare && singleTechSummary"
    class="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
  >
    <h3 class="text-xs font-bold tracking-wide text-slate-700 uppercase">
      Chi tiết xử lý kỹ thuật ({{ activeSinglePlatform === 'ios' ? 'iOS' : 'Android' }})
    </h3>
    <p class="text-xs leading-relaxed text-slate-700">
      {{ singleTechSummary }}
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

    <div class="space-y-1.5 text-xs">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="font-medium text-slate-600">Mini App ID:</span>
        <code class="rounded border border-cyan-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
          {{ miniAppBridgeView.miniAppId }}
        </code>
      </div>

      <div
        v-if="isCompare && miniAppBridgeView.hasTransportDiff"
        class="grid grid-cols-1 gap-2 md:grid-cols-2"
      >
        <div class="rounded border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-700">
          <span class="font-bold text-slate-700">Transport iOS:</span>
          <span class="ml-1">{{ miniAppBridgeView.transportIos || 'Không áp dụng' }}</span>
        </div>
        <div class="rounded border border-emerald-200 bg-emerald-50/50 px-2.5 py-1.5 text-[11px] text-slate-700">
          <span class="font-bold text-emerald-700">Transport Android:</span>
          <span class="ml-1">{{ miniAppBridgeView.transportAndroid || 'Không áp dụng' }}</span>
        </div>
      </div>

      <p
        v-else-if="isCompare ? miniAppBridgeView.transportIos : miniAppBridgeView.singleTransport"
        class="text-[11px] leading-relaxed text-slate-600"
      >
        {{ isCompare ? miniAppBridgeView.transportIos : miniAppBridgeView.singleTransport }}
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
              <span
                v-if="msg.parityNote"
                class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
              >
                Lệch parity
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
          <div v-if="isCompare" class="space-y-1.5">
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div class="rounded-md border border-indigo-100 bg-indigo-50/50 px-2.5 py-1.5">
                <div class="text-[10px] font-bold tracking-wide text-indigo-700 uppercase">
                  Hàm Host iOS (Swift)
                </div>
                <code
                  v-if="msg.iosHostFn"
                  class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800"
                >
                  {{ msg.iosHostFn }}
                </code>
                <span v-else class="mt-0.5 block text-[11px] italic text-slate-400">
                  Không áp dụng trên iOS
                </span>
              </div>

              <div class="rounded-md border border-emerald-200 bg-emerald-50/45 px-2.5 py-1.5">
                <div class="text-[10px] font-bold tracking-wide text-emerald-700 uppercase">
                  Hàm Host Android (Kotlin / Java)
                </div>
                <code
                  v-if="msg.androidHostFn"
                  class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800"
                >
                  {{ msg.androidHostFn }}
                </code>
                <span v-else-if="msg.parityNote" class="mt-0.5 block text-[11px] font-medium text-rose-700">
                  Chưa triển khai / Không gọi trên Android
                </span>
                <span v-else class="mt-0.5 block text-[11px] italic text-slate-400">
                  {{ singleOnlyPlatform === 'ios' ? 'Không áp dụng trên Android' : 'Chưa tách riêng' }}
                </span>
              </div>
            </div>

            <div
              v-if="msg.miniAppFn"
              class="rounded-md border border-cyan-100 bg-cyan-50/50 px-2.5 py-1.5"
            >
              <div class="text-[10px] font-bold tracking-wide text-cyan-700 uppercase">
                Hàm phía Mini App (JS / SDK — dùng chung iOS & Android)
              </div>
              <code class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800">
                {{ msg.miniAppFn }}
              </code>
            </div>
          </div>

          <div v-else class="space-y-1.5">
            <div
              v-if="msg.singleHostFn || msg.parityNote"
              class="rounded-md border px-2.5 py-1.5"
              :class="
                activeSinglePlatform === 'ios'
                  ? 'border-indigo-100 bg-indigo-50/50'
                  : 'border-emerald-200 bg-emerald-50/45'
              "
            >
              <div
                class="text-[10px] font-bold tracking-wide uppercase"
                :class="activeSinglePlatform === 'ios' ? 'text-indigo-700' : 'text-emerald-700'"
              >
                {{ singleHostLabel }}
              </div>
              <code
                v-if="msg.singleHostFn"
                class="mt-0.5 block font-mono text-[11px] leading-snug break-all text-slate-800"
              >
                {{ msg.singleHostFn }}
              </code>
              <span v-else class="mt-0.5 block text-[11px] font-medium text-rose-700">
                Chưa triển khai / Không gọi trên Android
              </span>
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

          <p
            v-if="msg.parityNote"
            class="rounded-md border border-rose-200 bg-rose-50/75 px-2.5 py-1.5 text-[11px] leading-relaxed text-rose-900"
          >
            <span class="font-bold">Ghi chú Parity iOS ↔ Android: </span>
            {{ msg.parityNote }}
          </p>

          <div v-if="msg.examplePayload || msg.payload" class="space-y-1">
            <div class="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span class="font-semibold text-slate-700">
                {{ msg.examplePayload ? 'Ví dụ dữ liệu truyền vào (JSON)' : 'Tham số truyền (Schema)' }}
              </span>
              <button
                v-if="msg.examplePayload"
                type="button"
                class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                @click="copyValue(`payload-${idx}`, msg.examplePayload)"
              >
                <Check v-if="copiedKey === `payload-${idx}`" class="h-3 w-3 text-emerald-600" />
                <Copy v-else class="h-3 w-3" />
                {{ copiedKey === `payload-${idx}` ? 'Đã copy' : 'Copy' }}
              </button>
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
            <div class="flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span class="font-semibold text-slate-700">
                {{ msg.exampleResponse ? 'Ví dụ dữ liệu trả về (JSON)' : 'Dữ liệu trả về (Schema)' }}
              </span>
              <button
                v-if="msg.exampleResponse"
                type="button"
                class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                @click="copyValue(`response-${idx}`, msg.exampleResponse)"
              >
                <Check v-if="copiedKey === `response-${idx}`" class="h-3 w-3 text-emerald-600" />
                <Copy v-else class="h-3 w-3" />
                {{ copiedKey === `response-${idx}` ? 'Đã copy' : 'Copy' }}
              </button>
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

      <div v-if="section.isSplit" class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <div class="space-y-1.5">
          <div class="text-[10px] font-bold tracking-wide text-slate-600 uppercase">
            iOS
          </div>
          <ul v-if="section.iosItems.length > 0" class="space-y-1.5">
            <li
              v-for="item in section.iosItems"
              :key="`ios-${item}`"
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
              :class="[
                section.mono ? 'font-mono break-all text-slate-800' : 'leading-relaxed',
                section.key === 'codeRefs' ? 'flex items-start justify-between gap-2' : '',
              ]"
            >
              <span :class="section.key === 'codeRefs' ? 'min-w-0 flex-1 break-all' : ''">{{ item }}</span>
              <button
                v-if="section.key === 'codeRefs'"
                type="button"
                class="mt-0.5 shrink-0 rounded p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                :title="copiedKey === `ios-ref-${item}` ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn file'"
                @click="copyValue(`ios-ref-${item}`, item)"
              >
                <Check v-if="copiedKey === `ios-ref-${item}`" class="h-3.5 w-3.5 text-emerald-600" />
                <Copy v-else class="h-3.5 w-3.5" />
              </button>
            </li>
          </ul>
          <p v-else class="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs italic text-slate-400">
            Không có
          </p>
        </div>

        <div class="space-y-1.5">
          <div class="text-[10px] font-bold tracking-wide text-emerald-700 uppercase">
            Android
          </div>
          <ul v-if="section.androidItems.length > 0" class="space-y-1.5">
            <li
              v-for="item in section.androidItems"
              :key="`and-${item}`"
              class="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs text-slate-700"
              :class="[
                section.mono ? 'font-mono break-all text-slate-800' : 'leading-relaxed',
                section.key === 'codeRefs' ? 'flex items-start justify-between gap-2' : '',
              ]"
            >
              <span :class="section.key === 'codeRefs' ? 'min-w-0 flex-1 break-all' : ''">{{ item }}</span>
              <button
                v-if="section.key === 'codeRefs'"
                type="button"
                class="mt-0.5 shrink-0 rounded p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                :title="copiedKey === `and-ref-${item}` ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn file'"
                @click="copyValue(`and-ref-${item}`, item)"
              >
                <Check v-if="copiedKey === `and-ref-${item}`" class="h-3.5 w-3.5 text-emerald-600" />
                <Copy v-else class="h-3.5 w-3.5" />
              </button>
            </li>
          </ul>
          <p v-else class="rounded-lg border border-dashed border-emerald-200 px-3 py-2 text-xs italic text-slate-400">
            Không có
          </p>
        </div>
      </div>

      <ul v-else class="space-y-1.5">
        <li
          v-for="item in section.sharedItems"
          :key="item"
          class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          :class="[
            section.mono ? 'font-mono break-all text-slate-800' : 'leading-relaxed',
            section.key === 'codeRefs' ? 'flex items-start justify-between gap-2' : '',
          ]"
        >
          <span :class="section.key === 'codeRefs' ? 'min-w-0 flex-1 break-all' : ''">{{ item }}</span>
          <button
            v-if="section.key === 'codeRefs'"
            type="button"
            class="mt-0.5 shrink-0 rounded p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
            :title="copiedKey === `shared-ref-${item}` ? 'Đã sao chép đường dẫn' : 'Sao chép đường dẫn file'"
            @click="copyValue(`shared-ref-${item}`, item)"
          >
            <Check v-if="copiedKey === `shared-ref-${item}`" class="h-3.5 w-3.5 text-emerald-600" />
            <Copy v-else class="h-3.5 w-3.5" />
          </button>
        </li>
      </ul>
    </section>
  </template>
</template>
