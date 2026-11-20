// src/composables/useKeyboardNavigation.ts
import { onBeforeUnmount, onMounted } from 'vue';
import {
  resolveKeyboardNavTarget,
  type FlowExplorerState,
  type KeyboardNavKey,
} from './useFlowExplorer';
import { useToast } from './useToast';

export interface KeyboardNavigationOptions {
  explorer: FlowExplorerState;
  isAnyModalOpen: () => boolean;
  onToggleSearch: () => void;
  onOpenGuide: () => void;
}

const ARROW_KEYS = new Set<string>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isEditableElement(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const { pushToast } = useToast();

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      options.onToggleSearch();
      return;
    }

    if (event.defaultPrevented || options.isAnyModalOpen()) {
      return;
    }

    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    if (isEditableElement(activeEl) || isEditableElement(event.target as Element | null)) {
      return;
    }

    if (event.key === 'Escape') {
      if (options.explorer.zenMode.value) {
        event.preventDefault();
        options.explorer.setZenMode(false);
        pushToast('Đã thoát Zen Mode', 'info');
        return;
      }
      if (options.explorer.selectedNodeId.value) {
        options.explorer.selectedNodeId.value = null;
      }
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (ARROW_KEYS.has(event.key)) {
      event.preventDefault();
      const nextId = resolveKeyboardNavTarget(
        options.explorer.visibleFlow.value,
        options.explorer.selectedNodeId.value,
        event.key as KeyboardNavKey,
        options.explorer.layoutDirection.value,
      );
      if (nextId) {
        options.explorer.selectNode(nextId);
      }
      return;
    }

    if (event.key === 'Enter') {
      const tag = activeEl?.tagName;
      if (tag === 'BUTTON' || tag === 'A') return;
      const selectedId = options.explorer.selectedNodeId.value;
      if (selectedId && options.explorer.hasSubtree(selectedId)) {
        event.preventDefault();
        options.explorer.toggleExpand(selectedId);
      }
      return;
    }

    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      options.explorer.requestFitView();
      return;
    }

    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      const next = options.explorer.toggleZenMode();
      pushToast(next ? 'Đã bật Zen Mode (Esc hoặc Z để thoát)' : 'Đã thoát Zen Mode', 'info');
      return;
    }

    if (event.key === '[' && options.explorer.activeScenario.value) {
      event.preventDefault();
      options.explorer.stepScenario(-1);
      return;
    }

    if (event.key === ']' && options.explorer.activeScenario.value) {
      event.preventDefault();
      options.explorer.stepScenario(1);
      return;
    }

    if (event.key === '?') {
      event.preventDefault();
      options.onOpenGuide();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
  });
}
