<script setup lang="ts">
import { computed } from 'vue';
import { Globe, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-vue-next';
import {
  HOST_FETCH_MOCK_PRESETS,
  type HostFetchMockMethod,
  type HostFetchMockRule,
} from '../core/miniAppHostFetchMock';

const props = defineProps<{
  appId: string;
  rules: HostFetchMockRule[];
  proxyEnabled: boolean;
  allowedOriginsText: string;
  proxyAvailable: boolean;
}>();

const emit = defineEmits<{
  'update:rules': [rules: HostFetchMockRule[]];
  'update:proxyEnabled': [enabled: boolean];
  'update:allowedOriginsText': [value: string];
}>();

const METHODS: HostFetchMockMethod[] = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const activeCount = computed(() => props.rules.filter((r) => r.enabled).length);

const addEmptyRule = () => {
  const next: HostFetchMockRule = {
    id: `mock-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    enabled: true,
    name: `Mock rule #${props.rules.length + 1}`,
    method: 'GET',
    urlPattern: '*/customers*',
    status: 200,
    delayMs: 0,
    responseJson: JSON.stringify({ ok: true, items: [] }, null, 2),
  };
  emit('update:rules', [next, ...props.rules]);
};

const addPreset = (presetId: string) => {
  const preset = HOST_FETCH_MOCK_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  const next: HostFetchMockRule = {
    id: `mock-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    ...preset.rule,
  };
  emit('update:rules', [next, ...props.rules]);
};

const updateRule = (id: string, patch: Partial<HostFetchMockRule>) => {
  emit(
    'update:rules',
    props.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  );
};

const removeRule = (id: string) => {
  emit(
    'update:rules',
    props.rules.filter((r) => r.id !== id),
  );
};

const isJsonValid = (raw: string): boolean => {
  if (!raw.trim()) return true;
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
};
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
    <!-- Top Header + Presets -->
    <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
            Mock Rules cho <code class="font-mono text-cyan-700 dark:text-cyan-300">host_fetch</code> ({{ props.appId }})
          </h3>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Khi Sandbox hoặc Live Iframe gọi <code class="font-mono">sdk.hostFetch(url)</code>, rule khớp đầu tiên đang bật ({{ activeCount }}/{{ props.rules.length }}) sẽ trả về phản hồi tuỳ chỉnh.
          </p>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-cyan-500"
          @click="addEmptyRule"
        >
          <Plus class="h-3.5 w-3.5" />
          Thêm Mock Rule
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-1.5">
        <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Sparkles class="h-3 w-3 text-amber-500" />
          Mẫu nhanh:
        </span>
        <button
          v-for="preset in HOST_FETCH_MOCK_PRESETS"
          :key="preset.id"
          type="button"
          class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-cyan-500/40"
          @click="addPreset(preset.id)"
        >
          + {{ preset.label }}
        </button>
      </div>
    </div>

    <!-- Local Staging Proxy Box -->
    <div class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-xs dark:border-indigo-500/30 dark:bg-indigo-500/10">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Globe class="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
          <div>
            <div class="font-bold text-slate-900 dark:text-slate-100">
              Local Staging Proxy (gọi API thật không bị CORS)
            </div>
            <p class="text-[11px] text-slate-600 dark:text-slate-300">
              <template v-if="props.proxyAvailable">
                Khi không khớp Mock Rule nào ở trên, chuyển tiếp request qua server local <code class="font-mono">pnpm dev</code> tới domain trong allowlist.
              </template>
              <template v-else>
                Đang chạy chế độ tĩnh — Proxy Staging chỉ khả dụng khi chạy local (<code class="font-mono">pnpm dev</code>). Mock Rules phía dưới vẫn chạy bình thường trên trình duyệt.
              </template>
            </p>
          </div>
        </div>

        <label
          v-if="props.proxyAvailable"
          class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 font-semibold text-indigo-800 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-indigo-200"
        >
          <input
            type="checkbox"
            :checked="props.proxyEnabled"
            class="rounded"
            @change="emit('update:proxyEnabled', ($event.target as HTMLInputElement).checked)"
          />
          <span>Bật Proxy Staging</span>
        </label>
      </div>

      <div v-if="props.proxyAvailable && props.proxyEnabled" class="mt-3 space-y-1.5">
        <label class="block space-y-1">
          <span class="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            <ShieldCheck class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Allowed Origins bổ sung (cách nhau dấu phẩy; mặc định đã cho phép <code class="font-mono">*.vbot.vn</code> &amp; <code class="font-mono">*.vpmedia.vn</code>)
          </span>
          <input
            type="text"
            :value="props.allowedOriginsText"
            placeholder="VD: http://localhost:4000, https://staging-api.example.com"
            class="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            @input="emit('update:allowedOriginsText', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <!-- Rules List -->
    <div
      v-if="props.rules.length === 0"
      class="rounded-xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"
    >
      Chưa có Mock Rule nào cho <strong>{{ props.appId }}</strong>. Chọn 1 mẫu nhanh ở trên hoặc bấm <strong>Thêm Mock Rule</strong>.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="rule in props.rules"
        :key="rule.id"
        class="space-y-2.5 rounded-xl border bg-white p-3.5 text-xs transition dark:bg-slate-900/80"
        :class="
          rule.enabled
            ? 'border-cyan-300/80 dark:border-cyan-500/40'
            : 'border-slate-200 opacity-70 dark:border-slate-800'
        "
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="checkbox"
              :checked="rule.enabled"
              title="Bật/Tắt rule này"
              class="rounded"
              @change="updateRule(rule.id, { enabled: ($event.target as HTMLInputElement).checked })"
            />
            <input
              type="text"
              :value="rule.name"
              placeholder="Tên rule"
              class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              @input="updateRule(rule.id, { name: ($event.target as HTMLInputElement).value })"
            />
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/35 dark:text-rose-400"
            @click="removeRule(rule.id)"
          >
            <Trash2 class="h-3 w-3" />
            Xóa
          </button>
        </div>

        <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
          <label class="space-y-1 sm:col-span-2">
            <span class="text-[10.5px] font-semibold text-slate-500">Method</span>
            <select
              :value="rule.method"
              class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
              @change="updateRule(rule.id, { method: ($event.target as HTMLSelectElement).value as HostFetchMockMethod })"
            >
              <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>

          <label class="space-y-1 sm:col-span-6">
            <span class="text-[10.5px] font-semibold text-slate-500">URL Pattern (hỗ trợ wildcard <code class="font-mono">*</code>)</span>
            <input
              type="text"
              :value="rule.urlPattern"
              placeholder="*/v1/customers*"
              class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
              @input="updateRule(rule.id, { urlPattern: ($event.target as HTMLInputElement).value })"
            />
          </label>

          <label class="space-y-1 sm:col-span-2">
            <span class="text-[10.5px] font-semibold text-slate-500">HTTP Status</span>
            <input
              type="number"
              min="100"
              max="599"
              :value="rule.status"
              class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
              @input="updateRule(rule.id, { status: Number(($event.target as HTMLInputElement).value) || 200 })"
            />
          </label>

          <label class="space-y-1 sm:col-span-2">
            <span class="text-[10.5px] font-semibold text-slate-500">Delay (ms)</span>
            <input
              type="number"
              min="0"
              max="30000"
              step="100"
              :value="rule.delayMs"
              class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
              @input="updateRule(rule.id, { delayMs: Math.max(0, Number(($event.target as HTMLInputElement).value) || 0) })"
            />
          </label>
        </div>

        <label class="block space-y-1">
          <span class="text-[10.5px] font-semibold text-slate-500">Response Body (JSON)</span>
          <textarea
            :value="rule.responseJson"
            rows="4"
            spellcheck="false"
            class="w-full rounded-lg border border-slate-300 bg-[#0b1120] p-2.5 font-mono text-[11px] text-cyan-100 focus:border-cyan-500 focus:outline-none dark:border-slate-700"
            @input="updateRule(rule.id, { responseJson: ($event.target as HTMLTextAreaElement).value })"
          />
          <p v-if="!isJsonValid(rule.responseJson)" class="text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Cảnh báo: Chuỗi chưa phải JSON chuẩn — sẽ trả về dạng text thô.
          </p>
        </label>
      </div>
    </div>
  </div>
</template>
