<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { CornerDownRight, Search, X } from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { searchFlowNodes, type SearchHit } from '../composables/useSearch';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const enableTechMode = __ENABLE_TECH_MODE__;
const query = ref('');
const highlightedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const searchPlaceholder = computed(() => {
  if (__ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech') {
    return 'Tìm tên chức năng, mô tả, API, tên hàm hoặc file (.swift / .kt)...';
  }
  return 'Tìm tên chức năng, màn hình hoặc bước xử lý...';
});

const hits = computed(() =>
  searchFlowNodes(
    explorer.dataset,
    query.value,
    explorer.audienceMode.value,
    explorer.platformMode.value,
  ),
);

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      query.value = '';
      highlightedIndex.value = 0;
      await nextTick();
      inputRef.value?.focus();
    }
  },
);

watch(hits, () => {
  highlightedIndex.value = 0;
});

const close = () => {
  emit('update:open', false);
};

const selectHit = (hit: SearchHit) => {
  explorer.jumpToNode(hit.node.id);
  close();
};

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (hits.value.length === 0) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlightedIndex.value = (highlightedIndex.value + 1) % hits.value.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlightedIndex.value = (highlightedIndex.value - 1 + hits.value.length) % hits.value.length;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const target = hits.value[highlightedIndex.value];
    if (target) selectHit(target);
  }
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-20 backdrop-blur-xs"
      @click.self="close"
      @keydown="onKeyDown"
    >
      <div class="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div class="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search class="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            :placeholder="searchPlaceholder"
            class="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            class="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            @click="close"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="max-h-96 overflow-y-auto p-2">
          <p v-if="!query.trim()" class="px-3 py-6 text-center text-xs text-slate-500">
            Nhập từ khóa để nhảy thẳng tới bất kỳ bước nào trong sơ đồ VBot App.
          </p>

          <p
            v-else-if="hits.length === 0"
            class="px-3 py-6 text-center text-xs text-slate-500"
          >
            Không tìm thấy kết quả phù hợp với "{{ query }}".
          </p>

          <ul v-else class="space-y-1">
            <li v-for="(hit, idx) in hits" :key="hit.node.id">
              <button
                type="button"
                class="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition"
                :class="
                  idx === highlightedIndex
                    ? 'bg-indigo-50 text-indigo-950'
                    : 'hover:bg-slate-50'
                "
                @mouseenter="highlightedIndex = idx"
                @click="selectHit(hit)"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-semibold text-slate-900">
                      {{ hit.node.label }}
                    </span>
                    <span
                      v-if="enableTechMode && hit.node.audience === 'tech'"
                      class="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                    >
                      Kỹ thuật
                    </span>
                  </div>
                  <p class="mt-0.5 line-clamp-1 text-xs text-slate-500">
                    {{ hit.node.summary.overview }}
                  </p>
                </div>

                <div class="flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] font-medium text-slate-400">
                  <span class="max-w-36 truncate">{{ hit.groupTitle }}</span>
                  <CornerDownRight class="h-3.5 w-3.5" />
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>
