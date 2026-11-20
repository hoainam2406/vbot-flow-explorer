<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import { resolveMediaUrl } from '../../core/mediaUrl';
import type { MediaItem } from '../../data/schema';

const props = defineProps<{
  items: MediaItem[];
  activeIndex: number | null;
}>();

const emit = defineEmits<{
  close: [];
  'update:activeIndex': [index: number];
}>();

const activeItem = computed(() =>
  props.activeIndex !== null ? (props.items[props.activeIndex] ?? null) : null,
);

const step = (delta: number) => {
  if (props.activeIndex === null || props.items.length <= 1) return;
  const next = (props.activeIndex + delta + props.items.length) % props.items.length;
  emit('update:activeIndex', next);
};

const onKeyDown = (event: KeyboardEvent) => {
  if (!activeItem.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    step(1);
  }
};

watch(
  () => props.activeIndex !== null,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onKeyDown);
    } else {
      window.removeEventListener('keydown', onKeyDown);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="activeItem"
      class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 p-4 backdrop-blur-xs"
      @click.self="emit('close')"
    >
      <button
        type="button"
        aria-label="Đóng ảnh phóng to"
        class="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        @click="emit('close')"
      >
        <X class="h-5 w-5" />
      </button>

      <div class="relative flex max-h-[82vh] max-w-4xl items-center justify-center">
        <button
          v-if="props.items.length > 1"
          type="button"
          aria-label="Ảnh trước"
          class="mr-3 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          @click.stop="step(-1)"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>

        <video
          v-if="activeItem.type === 'video'"
          :src="resolveMediaUrl(activeItem.src)"
          controls
          autoplay
          loop
          muted
          playsinline
          class="max-h-[78vh] max-w-full rounded-2xl bg-black shadow-2xl"
        />
        <img
          v-else
          :src="resolveMediaUrl(activeItem.src)"
          :alt="activeItem.caption"
          class="max-h-[78vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
        />

        <button
          v-if="props.items.length > 1"
          type="button"
          aria-label="Ảnh tiếp theo"
          class="ml-3 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          @click.stop="step(1)"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>

      <p class="mt-3 max-w-2xl text-center text-sm text-slate-200">
        {{ activeItem.caption }}
      </p>
    </div>
  </Teleport>
</template>
