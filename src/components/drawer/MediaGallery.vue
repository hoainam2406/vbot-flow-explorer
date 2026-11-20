<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-vue-next';
import type { ViewMode } from '../../core/graphEngine';
import { resolveMediaUrl } from '../../core/mediaUrl';
import type { MediaItem } from '../../data/schema';
import MediaLightbox from './MediaLightbox.vue';

const props = defineProps<{
  media?: MediaItem[];
  audienceMode: ViewMode;
}>();

const isDev = import.meta.env.DEV;
const brokenSrcs = ref<Set<string>>(new Set());
const currentIndex = ref(0);
const lightboxIndex = ref<number | null>(null);

const filteredItems = computed(() => {
  const items = props.media ?? [];
  if (__ENABLE_TECH_MODE__ && props.audienceMode === 'tech') {
    return items;
  }
  return items.filter((m) => (m.audience ?? 'all') === 'all');
});

watch(
  () => [props.media, props.audienceMode],
  () => {
    brokenSrcs.value = new Set();
    currentIndex.value = 0;
    lightboxIndex.value = null;
  },
);

const visibleItems = computed(() =>
  isDev
    ? filteredItems.value
    : filteredItems.value.filter((item) => !brokenSrcs.value.has(item.src)),
);

const safeIndex = computed(() =>
  visibleItems.value.length === 0
    ? 0
    : Math.min(currentIndex.value, visibleItems.value.length - 1),
);

const currentItem = computed(() => visibleItems.value[safeIndex.value] ?? null);
const currentBroken = computed(() =>
  currentItem.value ? brokenSrcs.value.has(currentItem.value.src) : false,
);

const loadedItems = computed(() =>
  visibleItems.value.filter((item) => !brokenSrcs.value.has(item.src)),
);

const markBroken = (src: string) => {
  if (brokenSrcs.value.has(src)) return;
  const next = new Set(brokenSrcs.value);
  next.add(src);
  brokenSrcs.value = next;
};

const openLightbox = () => {
  if (!currentItem.value || currentBroken.value) return;
  const idx = loadedItems.value.findIndex((item) => item.src === currentItem.value?.src);
  if (idx >= 0) {
    lightboxIndex.value = idx;
  }
};
</script>

<template>
  <div v-if="currentItem" class="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
    <div class="flex justify-center">
      <div
        v-if="currentBroken"
        class="w-full rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center text-xs text-slate-500"
      >
        Chưa có ảnh minh họa — đặt file tại
        <code class="mt-1 block font-mono text-[11px] text-slate-700">public{{ currentItem.src }}</code>
      </div>

      <div
        v-else-if="currentItem.frame === 'phone'"
        class="group relative w-52 overflow-hidden rounded-[26px] border-[5px] border-slate-900 bg-slate-900 shadow-lg"
      >
        <div class="mx-auto mt-1 mb-1 h-1 w-12 rounded-full bg-slate-700" />
        <div class="relative overflow-hidden rounded-[20px] bg-white">
          <video
            v-if="currentItem.type === 'video'"
            :src="resolveMediaUrl(currentItem.src)"
            autoplay
            loop
            muted
            playsinline
            class="max-h-88 w-full cursor-zoom-in object-cover"
            @click="openLightbox"
            @error="markBroken(currentItem.src)"
          />
          <img
            v-else
            :src="resolveMediaUrl(currentItem.src)"
            :alt="currentItem.caption"
            loading="lazy"
            class="max-h-88 w-full cursor-zoom-in object-cover"
            @click="openLightbox"
            @error="markBroken(currentItem.src)"
          />
          <button
            type="button"
            aria-label="Phóng to ảnh"
            class="absolute right-2 bottom-2 rounded-full bg-slate-900/70 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
            @click="openLightbox"
          >
            <Maximize2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        v-else
        class="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
      >
        <video
          v-if="currentItem.type === 'video'"
          :src="resolveMediaUrl(currentItem.src)"
          autoplay
          loop
          muted
          playsinline
          class="max-h-64 w-full cursor-zoom-in object-contain"
          @click="openLightbox"
          @error="markBroken(currentItem.src)"
        />
        <img
          v-else
          :src="resolveMediaUrl(currentItem.src)"
          :alt="currentItem.caption"
          loading="lazy"
          class="max-h-64 w-full cursor-zoom-in object-contain"
          @click="openLightbox"
          @error="markBroken(currentItem.src)"
        />
        <button
          type="button"
          aria-label="Phóng to ảnh"
          class="absolute right-2 bottom-2 rounded-full bg-slate-900/70 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
          @click="openLightbox"
        >
          <Maximize2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <p class="mt-2.5 text-center text-xs leading-relaxed text-slate-600">
      {{ currentItem.caption }}
    </p>

    <div
      v-if="visibleItems.length > 1"
      class="mt-2 flex items-center justify-center gap-2"
    >
      <button
        type="button"
        aria-label="Mục trước"
        class="rounded-md border border-slate-200 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
        @click="currentIndex = (safeIndex - 1 + visibleItems.length) % visibleItems.length"
      >
        <ChevronLeft class="h-3.5 w-3.5" />
      </button>
      <span class="text-[11px] font-medium text-slate-500">
        {{ safeIndex + 1 }} / {{ visibleItems.length }}
      </span>
      <button
        type="button"
        aria-label="Mục sau"
        class="rounded-md border border-slate-200 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
        @click="currentIndex = (safeIndex + 1) % visibleItems.length"
      >
        <ChevronRight class="h-3.5 w-3.5" />
      </button>
    </div>

    <MediaLightbox
      :items="loadedItems"
      :active-index="lightboxIndex"
      @close="lightboxIndex = null"
      @update:active-index="lightboxIndex = $event"
    />
  </div>
</template>
