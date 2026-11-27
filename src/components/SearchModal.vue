<script setup lang="ts">
import { computed, inject, nextTick, ref, watch, type Component } from 'vue';
import {
  ArrowLeftRight,
  ArrowUpDown,
  Bug,
  Clock,
  Command,
  CornerDownRight,
  FileCode2,
  FileImage,
  FileText,
  GitBranch,
  HelpCircle,
  Layers,
  Maximize,
  Maximize2,
  Moon,
  Network,
  Pin,
  Play,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Upload,
  Webhook,
  X,
} from 'lucide-vue-next';
import { FLOW_EXPLORER_KEY } from '../composables/useFlowExplorer';
import { searchFlowNodes, type SearchHit } from '../composables/useSearch';
import { useTheme } from '../composables/useTheme';
import { useToast } from '../composables/useToast';
import type { AppTourTrack } from '../core/appTourEngine';
import { saveLayoutDirection } from '../core/explorerPreferences';
import { getNodeDisplayLabel } from '../core/graphEngine';
import type { GovernanceHubTab } from './GovernanceHubModal.vue';
import type { FlowNodeData } from '../data/schema';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  openParity: [];
  openGuide: [];
  startTour: [track?: AppTourTrack];
  openSettings: [];
  openImpact: [];
  openMiniappBridge: [];
  openGovernance: [tab?: GovernanceHubTab];
  importPatch: [];
  exportPng: [];
  exportSvg: [];
  exportMd: [];
  exportMermaid: [];
}>();

const explorer = inject(FLOW_EXPLORER_KEY);
if (!explorer) {
  throw new Error('FLOW_EXPLORER_KEY must be provided');
}

const { isDark, toggleTheme } = useTheme();
const { pushToast } = useToast();

const enableTechMode = __ENABLE_TECH_MODE__;
const query = ref('');
const highlightedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const itemRefs = ref<Record<number, HTMLElement | null>>({});

interface PaletteCommand {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  badge?: string;
  shortcut?: string;
  icon: Component;
  run: () => void;
}

type FlatPaletteItem =
  | { kind: 'recent'; node: FlowNodeData }
  | { kind: 'command'; command: PaletteCommand }
  | { kind: 'node'; hit: SearchHit };

const close = () => {
  emit('update:open', false);
};

const searchPlaceholder = computed(() => {
  if (__ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech') {
    return 'Tìm node, hàm, file (.swift / .kt) hoặc gõ > để lọc lệnh nhanh...';
  }
  return 'Tìm tên chức năng, bước xử lý hoặc gõ > để lọc lệnh nhanh...';
});

const parsedQuery = computed(() => {
  const raw = query.value.trim();
  if (raw.startsWith('>')) {
    return { commandOnly: true, text: raw.slice(1).trim() };
  }
  return { commandOnly: false, text: raw };
});

const allCommands = computed<PaletteCommand[]>(() => {
  const list: PaletteCommand[] = [
    {
      id: 'cmd-theme',
      title: isDark.value ? 'Chuyển sang giao diện Sáng (Light)' : 'Chuyển sang giao diện Tối (Dark)',
      subtitle: 'Đổi tông màu toàn bộ ứng dụng',
      keywords: 'theme dark light sang toi giao dien',
      icon: isDark.value ? Sun : Moon,
      run: () => {
        const next = toggleTheme();
        pushToast(next === 'dark' ? 'Đã chuyển sang giao diện Tối' : 'Đã chuyển sang giao diện Sáng', 'info');
      },
    },
    {
      id: 'cmd-dir',
      title:
        explorer.layoutDirection.value === 'LR'
          ? 'Đổi hướng sơ đồ sang Dọc (TB)'
          : 'Đổi hướng sơ đồ sang Ngang (LR)',
      subtitle: 'Sắp xếp lại cây biểu đồ trên canvas',
      keywords: 'huong so do doc ngang lr tb layout direction',
      icon: explorer.layoutDirection.value === 'LR' ? ArrowUpDown : ArrowLeftRight,
      run: () => {
        const next = explorer.toggleLayoutDirection();
        saveLayoutDirection(next);
        pushToast(next === 'TB' ? 'Sơ đồ hướng dọc (TB)' : 'Sơ đồ hướng ngang (LR)', 'info');
      },
    },
    {
      id: 'cmd-accordion',
      title: explorer.accordionMode.value
        ? 'Tắt chế độ Chỉ mở 1 nhánh'
        : 'Bật chế độ Chỉ mở 1 nhánh',
      subtitle: 'Cho phép mở song song nhiều nhánh hoặc tự thu gọn nhánh anh em',
      keywords: 'accordion chi mo 1 nhanh nhieu nhanh',
      icon: Layers,
      run: () => {
        explorer.accordionMode.value = !explorer.accordionMode.value;
        pushToast(
          explorer.accordionMode.value ? 'Đã bật Chỉ mở 1 nhánh' : 'Đã tắt Chỉ mở 1 nhánh',
          'info',
        );
      },
    },
    {
      id: 'cmd-fit',
      title: 'Căn vừa toàn bộ sơ đồ vào màn hình',
      subtitle: 'Tự động thu phóng khung nhìn',
      keywords: 'fit view can vua zoom reset',
      shortcut: 'F',
      icon: Maximize,
      run: () => {
        explorer.requestFitView();
      },
    },
    {
      id: 'cmd-zen',
      title: explorer.zenMode.value ? 'Thoát chế độ trình chiếu (Zen Mode)' : 'Bật chế độ trình chiếu (Zen Mode)',
      subtitle: 'Ẩn thanh trên cùng để tập trung tối đa vào sơ đồ',
      keywords: 'zen mode fullscreen trinh chieu',
      shortcut: 'Z',
      icon: Maximize2,
      run: () => {
        const next = explorer.toggleZenMode();
        pushToast(next ? 'Đã bật Zen Mode (Esc hoặc Z để thoát)' : 'Đã thoát Zen Mode', 'info');
      },
    },
    {
      id: 'cmd-start-tour',
      title: 'Bắt đầu Tour hướng dẫn tương tác',
      subtitle: 'Khoanh sáng từng khu vực giao diện và giải thích cho người mới',
      keywords: 'tour walkthrough huong dan nguoi moi spotlight onboarding',
      icon: Play,
      run: () => {
        const track: AppTourTrack =
          __ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech' ? 'tech' : 'overview';
        emit('startTour', track);
      },
    },
    {
      id: 'cmd-guide',
      title: 'Mở Sổ tay Hướng dẫn Toàn tập & Phím tắt',
      subtitle: 'Hướng dẫn đầy đủ mọi chức năng, tình huống nhanh, phím tắt & từ điển',
      keywords: 'huong dan help phim tat shortcut glossary so tay',
      shortcut: '?',
      icon: HelpCircle,
      run: () => {
        emit('openGuide');
      },
    },
  ];

  if (__ENABLE_TECH_MODE__) {
    list.push(
      {
        id: 'cmd-audience',
        title:
          explorer.audienceMode.value === 'tech'
            ? 'Chuyển sang chế độ Tổng quan'
            : 'Chuyển sang chế độ Kỹ thuật',
        subtitle: 'Ẩn hoặc hiển thị lớp dữ liệu triển khai chi tiết',
        keywords: 'che do tong quan ky thuat mode tech overview',
        badge: 'Tech',
        icon: GitBranch,
        run: () => {
          const next = explorer.audienceMode.value === 'tech' ? 'overview' : 'tech';
          explorer.setAudienceMode(next);
        },
      },
      {
        id: 'cmd-platform-compare',
        title: 'Đối chiếu song song iOS ↔ Android (So sánh)',
        subtitle: 'Xem đồng thời xử lý cả 2 nền tảng',
        keywords: 'so sanh compare ios android platform',
        badge: 'Tech',
        icon: Smartphone,
        run: () => {
          explorer.setAudienceMode('tech');
          explorer.setPlatformMode('compare');
        },
      },
      {
        id: 'cmd-platform-ios',
        title: 'Lọc luồng nền tảng iOS (Swift)',
        subtitle: 'Chỉ hiển thị các bước thuộc iOS',
        keywords: 'ios swift platform nen tang',
        badge: 'Tech',
        icon: Smartphone,
        run: () => {
          explorer.setAudienceMode('tech');
          explorer.setPlatformMode('ios');
        },
      },
      {
        id: 'cmd-platform-android',
        title: 'Lọc luồng nền tảng Android (Kotlin)',
        subtitle: 'Chỉ hiển thị các bước thuộc Android',
        keywords: 'android kotlin platform nen tang',
        badge: 'Tech',
        icon: Smartphone,
        run: () => {
          explorer.setAudienceMode('tech');
          explorer.setPlatformMode('android');
        },
      },
      {
        id: 'cmd-miniapp-bridge',
        title: 'Mở Cầu nối Mini App (@vbotma/sdk)',
        subtitle: 'Chạy thử 8 luồng 4 làn, tra cứu hàm, 42 Mini App & Quyền RBAC',
        keywords: 'mini app bridge sdk simulator rbac catalog',
        badge: 'Tech',
        icon: ArrowLeftRight,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openMiniappBridge');
        },
      },
      {
        id: 'cmd-parity',
        title: 'Mở Bảng Chênh lệch iOS ↔ Android',
        subtitle: 'Lọc toàn bộ điểm khác biệt giữa 2 nền tảng',
        keywords: 'chenh lech parity ios android khac biet',
        badge: 'Tech',
        icon: Scale,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openParity');
        },
      },
      {
        id: 'cmd-impact',
        title: 'Phân tích ảnh hưởng (Impact Analysis)',
        subtitle: 'Tra cứu ngược mọi Node, Kịch bản & Mini App phụ thuộc vào API/File/Quyền',
        keywords: 'phan tich anh huong impact reverse lookup api code ref rbac',
        badge: 'Tech',
        icon: Network,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openImpact');
        },
      },
      {
        id: 'cmd-settings',
        title: 'Cài đặt Workspace & Độ phủ Media',
        subtitle: 'Cấu hình đường dẫn local VBot-iOS/Android và kiểm tra ảnh thiếu',
        keywords: 'cai dat settings media coverage antigravity vscode cursor git path',
        badge: 'Tech',
        icon: Settings,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openSettings');
        },
      },
      {
        id: 'cmd-gov-dashboard',
        title: 'Mở Dev Home Dashboard (Tổng quan việc)',
        subtitle: 'Xem hàng đợi Parity iOS/Android, Node đang ghim, WIP & Task VbM-*',
        keywords: 'dev home dashboard tong quan viec parity wip pin',
        badge: 'Dev',
        icon: Layers,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'dashboard');
        },
      },
      {
        id: 'cmd-gov-nodes',
        title: 'Mở Bảng Quản lý Node hàng loạt',
        subtitle: 'Lọc toàn bộ node và cập nhật hàng loạt status, ngày kiểm, task URL',
        keywords: 'quan ly node bang bulk table status lastVerifiedAt owner',
        badge: 'Dev',
        icon: ShieldCheck,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'nodes');
        },
      },
      {
        id: 'cmd-gov-workboard',
        title: 'Mở Dev Workboard (Task VbM-*)',
        subtitle: 'Bảng Kanban cá nhân gắn mã VbM-* trực tiếp lên node',
        keywords: 'workboard kanban task vbm todo doing review done',
        badge: 'Dev',
        icon: ShieldCheck,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'workboard');
        },
      },
      {
        id: 'cmd-gov-atlas',
        title: 'Mở API, WebSocket, SIP & Error Atlas',
        subtitle: 'Tra cứu ngược endpoint, WS event, Bridge & mục lệch iOS/Android',
        keywords: 'api atlas websocket sip dtmf error code endpoint',
        badge: 'Dev',
        icon: Webhook,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'atlas');
        },
      },
      {
        id: 'cmd-gov-tracer',
        title: 'Mở Debug Log-to-Flow Tracer',
        subtitle: 'Dán log Xcode / Logcat / WS để tô đường chạy lỗi lên sơ đồ',
        keywords: 'log tracer debug xcode logcat crash stacktrace',
        badge: 'Dev',
        icon: Bug,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'tracer');
        },
      },
      {
        id: 'cmd-gov-diff',
        title: 'So sánh nhánh & Phiên bản luồng (Branch / Snapshot Diff)',
        subtitle: 'Đối chiếu trực tiếp Nam-dev ↔ Nam-dev-SBSI hoặc commit git',
        keywords: 'branch snapshot diff changelog phien ban so sanh git sbsi',
        badge: 'Dev',
        icon: ShieldCheck,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'diff');
        },
      },
      {
        id: 'cmd-gov-health',
        title: 'Mở Sức khỏe Dữ liệu & Upload Media',
        subtitle: 'Xem độ phủ media, parity theo module và kéo-thả ảnh WebP',
        keywords: 'suc khoe du lieu data health media upload webp',
        badge: 'Tech',
        icon: ShieldCheck,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'health');
        },
      },
      {
        id: 'cmd-gov-qa',
        title: 'Mở QA Release Hub',
        subtitle: 'Theo dõi tiến độ Pass/Fail toàn app theo đợt phát hành & xuất Sign-off',
        keywords: 'qa release hub checklist signoff test dot phat hanh',
        badge: 'QA',
        icon: ShieldCheck,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('openGovernance', 'qa');
        },
      },
      {
        id: 'cmd-pinned-prompt',
        title: 'Copy Multi-Node AI Prompt (Node đang ghim)',
        subtitle: `Đóng gói ${explorer.pinnedNodeIds.value.length} node đang ghim kèm ghi chú Dev`,
        keywords: 'pin dang lam multi node ai prompt copy context',
        badge: 'Dev',
        icon: Sparkles,
        run: () => {
          const pinned = explorer.pinnedNodeIds.value
            .map((id) => explorer.findNode(id))
            .filter((n): n is FlowNodeData => Boolean(n));
          if (pinned.length === 0) {
            pushToast('Chưa ghim node nào vào Đang làm', 'info');
            return;
          }
          void Promise.all([
            import('../core/aiContextExport'),
            import('../core/workspaceSettings'),
            import('../core/downloadHelper'),
          ]).then(async ([{ buildMultiNodeAiContextPrompt }, { loadDevWorkspaceSettings }, { copyTextToClipboard }]) => {
            const prompt = buildMultiNodeAiContextPrompt(pinned, explorer.dataset, {
              title: `Ngữ cảnh Đang làm (${pinned.length} node)`,
              platformMode: explorer.platformMode.value,
              settings: loadDevWorkspaceSettings(),
              personalNotesByNodeId: explorer.devNotesByNodeId.value,
            });
            const ok = await copyTextToClipboard(prompt);
            pushToast(
              ok ? `Đã copy Multi-Node AI Prompt (${pinned.length} node)` : 'Không thể copy',
              ok ? 'success' : 'error',
            );
          });
        },
      },
      {
        id: 'cmd-import-patch',
        title: 'Nhập Draft Patch (.json)',
        subtitle: 'Nạp file thay đổi nháp từ thành viên khác lên sơ đồ',
        keywords: 'nhap import patch json draft ban nhap',
        badge: 'Tech',
        icon: Upload,
        run: () => {
          explorer.setAudienceMode('tech');
          emit('importPatch');
        },
      },
    );
  }

  for (const sc of explorer.visibleFlow.value.activeScenarios) {
    list.push({
      id: `cmd-sc-${sc.id}`,
      title: `Chạy kịch bản: ${sc.name}`,
      subtitle: sc.description || 'Kích hoạt trình chạy từng bước trên sơ đồ',
      keywords: `kich ban scenario chay thu ${sc.name}`,
      badge: 'Kịch bản',
      icon: Play,
      run: () => {
        explorer.selectScenario(sc.id);
      },
    });
  }

  list.push(
    {
      id: 'cmd-export-png',
      title: 'Xuất sơ đồ hiện tại ra ảnh PNG (2×)',
      subtitle: 'Tải xuống file PNG sắc nét',
      keywords: 'xuat export tai png anh image',
      icon: FileImage,
      run: () => emit('exportPng'),
    },
    {
      id: 'cmd-export-svg',
      title: 'Xuất sơ đồ hiện tại ra SVG (Vector)',
      subtitle: 'Tải xuống file vector dùng cho slide / Figma',
      keywords: 'xuat export tai svg vector',
      icon: FileCode2,
      run: () => emit('exportSvg'),
    },
    {
      id: 'cmd-export-md',
      title: 'Xuất tài liệu Markdown (.md)',
      subtitle: 'Tải xuống tài liệu nhánh hoặc mục đang chọn',
      keywords: 'xuat export tai markdown md tai lieu',
      icon: FileText,
      run: () => emit('exportMd'),
    },
    {
      id: 'cmd-export-mermaid',
      title: 'Copy sơ đồ dạng Mermaid',
      subtitle: 'Sao chép cú pháp flowchart để dán vào PR / Wiki / Task',
      keywords: 'xuat export copy mermaid mmd flowchart',
      icon: FileCode2,
      run: () => emit('exportMermaid'),
    },
  );

  return list;
});

const matchingCommands = computed(() => {
  const { commandOnly, text } = parsedQuery.value;
  if (!text) {
    return commandOnly ? allCommands.value : allCommands.value.slice(0, 7);
  }
  const q = text.toLowerCase();
  const filtered = allCommands.value.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(q) ||
      cmd.subtitle.toLowerCase().includes(q) ||
      cmd.keywords.toLowerCase().includes(q),
  );
  return commandOnly ? filtered : filtered.slice(0, 5);
});

const recentItems = computed(() => {
  if (parsedQuery.value.commandOnly || parsedQuery.value.text) return [];
  const merged: FlowNodeData[] = [];
  const seen = new Set<string>();
  if (__ENABLE_TECH_MODE__ && explorer.audienceMode.value === 'tech') {
    for (const id of explorer.pinnedNodeIds.value.slice(0, 3)) {
      const node = explorer.findNode(id);
      if (node && !seen.has(node.id)) {
        seen.add(node.id);
        merged.push(node);
      }
    }
  }
  for (const node of explorer.recentNodes.value) {
    if (merged.length >= 5) break;
    if (!seen.has(node.id)) {
      seen.add(node.id);
      merged.push(node);
    }
  }
  return merged;
});

const hits = computed(() => {
  if (parsedQuery.value.commandOnly || !parsedQuery.value.text) return [];
  return searchFlowNodes(
    explorer.dataset,
    parsedQuery.value.text,
    explorer.audienceMode.value,
    explorer.platformMode.value,
  );
});

const flatEntries = computed<FlatPaletteItem[]>(() => {
  const items: FlatPaletteItem[] = [];
  for (const node of recentItems.value) {
    items.push({ kind: 'recent', node });
  }
  for (const command of matchingCommands.value) {
    items.push({ kind: 'command', command });
  }
  for (const hit of hits.value) {
    items.push({ kind: 'node', hit });
  }
  return items;
});

const recentEndIndex = computed(() => recentItems.value.length);
const commandEndIndex = computed(() => recentEndIndex.value + matchingCommands.value.length);

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      query.value = '';
      highlightedIndex.value = 0;
      itemRefs.value = {};
      await nextTick();
      inputRef.value?.focus();
    }
  },
);

watch(flatEntries, (list) => {
  if (highlightedIndex.value >= list.length) {
    highlightedIndex.value = 0;
  }
});

watch(highlightedIndex, async (idx) => {
  await nextTick();
  itemRefs.value[idx]?.scrollIntoView?.({ block: 'nearest' });
});

const setItemRef = (el: unknown, idx: number) => {
  itemRefs.value[idx] = el instanceof HTMLElement ? el : null;
};

const executeEntry = (entry: FlatPaletteItem) => {
  close();
  if (entry.kind === 'recent') {
    explorer.jumpToNode(entry.node.id);
    return;
  }
  if (entry.kind === 'node') {
    explorer.jumpToNode(entry.hit.node.id);
    return;
  }
  entry.command.run();
};

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  const len = flatEntries.value.length;
  if (len === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    highlightedIndex.value = (highlightedIndex.value + 1) % len;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlightedIndex.value = (highlightedIndex.value - 1 + len) % len;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const target = flatEntries.value[highlightedIndex.value];
    if (target) executeEntry(target);
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="vbot-modal">
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 px-4 pt-16 backdrop-blur-xs dark:bg-black/65"
        @click.self="close"
        @keydown="onKeyDown"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tìm kiếm nhanh và bảng lệnh"
          class="vbot-modal-panel w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0f172a]"
        >
          <div class="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <Command
              v-if="parsedQuery.commandOnly"
              class="h-4 w-4 shrink-0 text-indigo-600 dark:text-cyan-400"
            />
            <Search v-else class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              :placeholder="searchPlaceholder"
              class="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              aria-label="Đóng bảng tìm kiếm"
              class="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="max-h-[26rem] overflow-y-auto p-2">
            <p
              v-if="flatEntries.length === 0"
              class="px-3 py-8 text-center text-xs text-slate-500 dark:text-slate-400"
            >
              Không tìm thấy kết quả hay lệnh phù hợp với "{{ query }}".
            </p>

            <div v-else class="space-y-3">
              <!-- Recent / Pinned Nodes -->
              <section v-if="recentItems.length > 0">
                <div class="px-3 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                  {{ enableTechMode && explorer.pinnedNodeIds.value.length > 0 ? 'Đang làm & Xem gần đây' : 'Vừa xem gần đây' }}
                </div>
                <ul class="space-y-0.5">
                  <li v-for="(node, rIdx) in recentItems" :key="`recent-${node.id}`">
                    <button
                      :ref="(el) => setItemRef(el, rIdx)"
                      type="button"
                      class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition"
                      :class="
                        rIdx === highlightedIndex
                          ? 'bg-indigo-50 text-indigo-950 dark:bg-cyan-500/15 dark:text-cyan-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      "
                      @mouseenter="highlightedIndex = rIdx"
                      @click="executeEntry({ kind: 'recent', node })"
                    >
                      <div class="flex min-w-0 items-center gap-2.5">
                        <Pin
                          v-if="enableTechMode && explorer.pinnedNodeIds.value.includes(node.id)"
                          class="h-3.5 w-3.5 shrink-0 text-amber-500"
                        />
                        <Clock v-else class="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                        <span class="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {{ getNodeDisplayLabel(node, explorer.audienceMode.value) }}
                        </span>
                      </div>
                      <CornerDownRight class="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </button>
                  </li>
                </ul>
              </section>

              <!-- Commands -->
              <section v-if="matchingCommands.length > 0">
                <div class="px-3 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                  Lệnh nhanh
                </div>
                <ul class="space-y-0.5">
                  <li v-for="(cmd, cIdx) in matchingCommands" :key="cmd.id">
                    <button
                      :ref="(el) => setItemRef(el, recentEndIndex + cIdx)"
                      type="button"
                      class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition"
                      :class="
                        recentEndIndex + cIdx === highlightedIndex
                          ? 'bg-indigo-50 text-indigo-950 dark:bg-cyan-500/15 dark:text-cyan-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      "
                      @mouseenter="highlightedIndex = recentEndIndex + cIdx"
                      @click="executeEntry({ kind: 'command', command: cmd })"
                    >
                      <div class="flex min-w-0 items-center gap-2.5">
                        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300">
                          <component :is="cmd.icon" class="h-3.5 w-3.5" />
                        </span>
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {{ cmd.title }}
                            </span>
                            <span
                              v-if="cmd.badge"
                              class="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-cyan-300"
                            >
                              {{ cmd.badge }}
                            </span>
                          </div>
                          <p class="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {{ cmd.subtitle }}
                          </p>
                        </div>
                      </div>
                      <kbd
                        v-if="cmd.shortcut"
                        class="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      >
                        {{ cmd.shortcut }}
                      </kbd>
                    </button>
                  </li>
                </ul>
              </section>

              <!-- Matching Nodes -->
              <section v-if="hits.length > 0">
                <div class="px-3 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                  Mục trên sơ đồ ({{ hits.length }})
                </div>
                <ul class="space-y-1">
                  <li v-for="(hit, idx) in hits" :key="hit.node.id">
                    <button
                      :ref="(el) => setItemRef(el, commandEndIndex + idx)"
                      type="button"
                      class="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition"
                      :class="
                        commandEndIndex + idx === highlightedIndex
                          ? 'bg-indigo-50 text-indigo-950 dark:bg-cyan-500/15 dark:text-cyan-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                      "
                      @mouseenter="highlightedIndex = commandEndIndex + idx"
                      @click="executeEntry({ kind: 'node', hit })"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {{ getNodeDisplayLabel(hit.node, explorer.audienceMode.value) }}
                          </span>
                          <span
                            v-if="enableTechMode && hit.node.audience === 'tech'"
                            class="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            Kỹ thuật
                          </span>
                        </div>
                        <p class="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                          {{ hit.node.summary.overview }}
                        </p>
                      </div>

                      <div class="flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                        <span class="max-w-36 truncate">{{ hit.groupTitle }}</span>
                        <CornerDownRight class="h-3.5 w-3.5" />
                      </div>
                    </button>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <div
            class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400"
          >
            <span>Gõ <code class="font-mono font-semibold text-indigo-600 dark:text-cyan-300">&gt;</code> để chỉ lọc lệnh</span>
            <span class="font-mono">↑↓ chọn · Enter mở · Esc đóng</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
