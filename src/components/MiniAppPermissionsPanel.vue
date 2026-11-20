<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  Lock,
  PlayCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
  X,
} from 'lucide-vue-next';
import { useToast } from '../composables/useToast';
import { copyTextToClipboard, downloadTextFile } from '../core/downloadHelper';
import { MINI_APP_CATALOG } from '../data/miniAppBridgeCatalog';
import {
  buildManifestPermissionsJson,
  buildModuleManifestSnippet,
  buildModuleSdkSnippet,
  buildSdkCheckPermissionsSnippet,
  createRoleStateFromPreset,
  evaluateAppVisibility,
  evaluateProfileActions,
  exportMiniAppPermissionsMarkdown,
  getMiniAppsUsingModule,
  MEMBER_FILTERABLE_MODULE_CODES,
  MINI_APP_PERMISSION_PROFILES,
  PERMISSION_MODULES,
  ROLE_PRESETS,
  type PermissionModuleCode,
  type RolePresetId,
  type SimulatedUserRoleState,
} from '../data/miniAppPermissionMatrix';
import type { PlatformViewMode } from '../data/schema';

const props = defineProps<{
  platformMode: PlatformViewMode;
  initialAppFilter?: string;
}>();

const emit = defineEmits<{
  openFlow: [flowId: string, subFlowId?: string];
  jumpNode: [nodeId: string];
}>();

const { pushToast } = useToast();
type SubView = 'matrix' | 'modules';
type AccessFilter = 'all' | 'admin_only' | 'member_perm' | 'everyone' | 'hidden_or_call' | 'parity';

const subView = ref<SubView>('matrix');
const simulatorExpanded = ref(true);
const activePreset = ref<RolePresetId>('member_sales');
const roleState = ref<SimulatedUserRoleState>(createRoleStateFromPreset('member_sales'));

const query = ref('');
const accessFilter = ref<AccessFilter>('all');
const moduleFilter = ref<'all' | PermissionModuleCode>('all');

const copiedKey = ref<string | null>(null);
const copiedMd = ref(false);
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
let mdResetTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.initialAppFilter,
  (val) => {
    if (val && val.trim()) {
      query.value = val.trim();
      accessFilter.value = 'all';
      moduleFilter.value = 'all';
      subView.value = 'matrix';
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
  if (mdResetTimer) clearTimeout(mdResetTimer);
});

const applyPreset = (presetId: RolePresetId) => {
  activePreset.value = presetId;
  roleState.value = createRoleStateFromPreset(presetId);
};

const toggleModuleAccess = (modCode: PermissionModuleCode) => {
  const modSpec = PERMISSION_MODULES.find((m) => m.code === modCode);
  const nextVal = !roleState.value.modules[modCode];
  roleState.value.modules[modCode] = nextVal;
  if (modSpec) {
    for (const act of modSpec.actions) {
      roleState.value.actions[`${modCode}-${act.code}`] = nextVal;
    }
  }
  if (modCode === 'KHACH_HANG' && !nextVal) {
    roleState.value.canViewCustomerPhone = false;
  }
};

const toggleActionAccess = (modCode: PermissionModuleCode, actCode: string) => {
  const key = `${modCode}-${actCode}`;
  const nextVal = !roleState.value.actions[key];
  roleState.value.actions[key] = nextVal;
  if (nextVal) {
    roleState.value.modules[modCode] = true;
  }
  if (modCode === 'KHACH_HANG' && actCode === 'HIEN_SO_DIEN_THOAI') {
    roleState.value.canViewCustomerPhone = nextVal;
  }
};

const toggleViewCustomerPhone = () => {
  const nextVal = !roleState.value.canViewCustomerPhone;
  roleState.value.canViewCustomerPhone = nextVal;
  roleState.value.actions['KHACH_HANG-HIEN_SO_DIEN_THOAI'] = nextVal;
  if (nextVal) {
    roleState.value.modules.KHACH_HANG = true;
  }
};

const memberModuleSpecs = computed(() =>
  PERMISSION_MODULES.filter((m) => MEMBER_FILTERABLE_MODULE_CODES.includes(m.code)),
);

const evaluatedRows = computed(() => {
  return MINI_APP_CATALOG.map((app) => {
    const profile = MINI_APP_PERMISSION_PROFILES[app.id];
    const visibility = evaluateAppVisibility(app.id, roleState.value);
    const actions = profile ? evaluateProfileActions(profile, roleState.value) : [];
    const groupedActions = new Map<PermissionModuleCode, typeof actions>();
    for (const item of actions) {
      const bucket = groupedActions.get(item.module) ?? [];
      bucket.push(item);
      groupedActions.set(item.module, bucket);
    }
    return {
      app,
      profile,
      visibility,
      actions,
      groupedActions: Array.from(groupedActions.entries()),
    };
  });
});

const summaryStats = computed(() => {
  let iosVisibleCount = 0;
  let androidVisibleCount = 0;
  let runtimeDiffCount = 0;
  for (const row of evaluatedRows.value) {
    if (row.visibility.iosVisible) iosVisibleCount += 1;
    if (row.visibility.androidVisible) androidVisibleCount += 1;
    if (row.visibility.hasRuntimeParityDiff) runtimeDiffCount += 1;
  }
  return {
    total: evaluatedRows.value.length,
    iosVisibleCount,
    androidVisibleCount,
    runtimeDiffCount,
  };
});

const filteredRows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return evaluatedRows.value.filter((row) => {
    const { app, profile, visibility } = row;

    if (accessFilter.value === 'admin_only' && app.accessLevel !== 'admin_only') return false;
    if (accessFilter.value === 'member_perm' && app.accessLevel !== 'member_perm') return false;
    if (accessFilter.value === 'everyone' && app.accessLevel !== 'everyone') return false;
    if (
      accessFilter.value === 'hidden_or_call' &&
      app.placement !== 'hidden_setting' &&
      app.placement !== 'in_call' &&
      app.placement !== 'inline_tab'
    ) {
      return false;
    }
    if (
      accessFilter.value === 'parity' &&
      !visibility.hasRuntimeParityDiff &&
      !visibility.hasStaticParityDiff
    ) {
      return false;
    }

    if (moduleFilter.value !== 'all') {
      const usesModule =
        profile?.visibilityModule === moduleFilter.value ||
        profile?.manifestCapabilities.some((c) => c.module === moduleFilter.value);
      if (!usesModule) return false;
    }

    if (!q) return true;
    const hay = [
      app.id,
      app.nameVi,
      app.nameEn,
      app.category,
      app.iosPermissionRule,
      app.androidPermissionRule,
      profile?.inAppNotes ?? '',
      profile?.manifestCapabilities.map((c) => `${c.module} ${c.actions.join(' ')}`).join(' ') ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const FILTER_PILLS: Array<{ id: AccessFilter; label: string }> = [
  { id: 'all', label: `Tất cả (${MINI_APP_CATALOG.length})` },
  { id: 'admin_only', label: 'Chỉ Admin (7)' },
  { id: 'member_perm', label: 'Theo quyền Member' },
  { id: 'everyone', label: 'Mọi tài khoản' },
  { id: 'hidden_or_call', label: 'Tab chính / In-call / Ẩn' },
  { id: 'parity', label: '⚠️ Lệch iOS ↔ Android' },
];

const SOURCE_BADGE: Record<'verified_manifest' | 'host_rbac_spec' | 'admin_or_open', { label: string; cls: string }> = {
  verified_manifest: {
    label: 'manifest.json thật',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  host_rbac_spec: {
    label: 'RBAC Host + Docs',
    cls: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  admin_or_open: {
    label: 'Nền tảng / Admin',
    cls: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300',
  },
};

const copyText = async (key: string, text: string) => {
  const ok = await copyTextToClipboard(text);
  if (ok) {
    copiedKey.value = key;
    pushToast('Đã sao chép vào clipboard', 'success');
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copiedKey.value = null;
    }, 1600);
  }
};

const copyPermissionsMarkdown = async () => {
  const ok = await copyTextToClipboard(exportMiniAppPermissionsMarkdown());
  if (ok) {
    copiedMd.value = true;
    pushToast('Đã sao chép bảng quyền Markdown', 'success');
    if (mdResetTimer) clearTimeout(mdResetTimer);
    mdResetTimer = setTimeout(() => {
      copiedMd.value = false;
    }, 2000);
  }
};

const downloadPermissionsMarkdown = () => {
  downloadTextFile(
    'vbot-miniapp-permissions-matrix.md',
    exportMiniAppPermissionsMarkdown(),
    'text/markdown;charset=utf-8',
  );
  pushToast('Đã tải file bảng quyền (.md)', 'success');
};

const focusAppInMatrix = (appId: string) => {
  query.value = appId;
  accessFilter.value = 'all';
  moduleFilter.value = 'all';
  subView.value = 'matrix';
};
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/40 dark:bg-[#090d16]">
    <!-- Top Sub-view Switcher & Actions -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-5 py-2.5 dark:border-slate-800 dark:bg-[#0d1424]">
      <div class="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700/80 dark:bg-slate-900">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 transition"
          :class="subView === 'matrix' ? 'bg-white text-emerald-800 shadow-xs dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'"
          @click="subView = 'matrix'"
        >
          <ShieldCheck class="h-3.5 w-3.5" />
          Ma trận {{ MINI_APP_CATALOG.length }} Mini App (Hiển thị + Action)
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 transition"
          :class="subView === 'modules' ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-700 dark:text-cyan-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'"
          @click="subView = 'modules'"
        >
          <SlidersHorizontal class="h-3.5 w-3.5" />
          Tra cứu {{ PERMISSION_MODULES.length }} Module & Action (check_permissions)
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
          @click="emit('openFlow', 'flow-permissions')"
        >
          <PlayCircle class="h-3.5 w-3.5" />
          Chạy thử check_permissions
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          @click="copyPermissionsMarkdown"
        >
          <Check v-if="copiedMd" class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <FileText v-else class="h-3.5 w-3.5" />
          {{ copiedMd ? 'Đã copy Quyền MD' : 'Copy Quyền MD' }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
          @click="downloadPermissionsMarkdown"
        >
          <Download class="h-3.5 w-3.5" />
          Tải Quyền .md
        </button>
      </div>
    </div>

    <!-- Interactive Role Simulator Card -->
    <div class="border-b border-slate-200 bg-slate-50/90 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="mr-1 text-xs font-bold text-slate-800 dark:text-slate-200">
            Giả lập Vai trò người dùng:
          </span>
          <button
            v-for="preset in ROLE_PRESETS"
            :key="preset.id"
            type="button"
            :title="preset.description"
            class="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
            :class="
              activePreset === preset.id
                ? preset.id === 'admin'
                  ? 'border-amber-600 bg-amber-600 text-white shadow-2xs'
                  : 'border-emerald-600 bg-emerald-600 text-white shadow-2xs'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            "
            @click="applyPreset(preset.id)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            v-if="props.platformMode !== 'android'"
            class="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-800 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300"
          >
            iOS hiện: {{ summaryStats.iosVisibleCount }} / {{ summaryStats.total }}
          </span>
          <span
            v-if="props.platformMode !== 'ios'"
            class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            Android hiện: {{ summaryStats.androidVisibleCount }} / {{ summaryStats.total }}
          </span>
          <span
            class="rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold"
            :class="
              summaryStats.runtimeDiffCount > 0
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
                : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
            "
          >
            ⚠️ Lệch hiển thị: {{ summaryStats.runtimeDiffCount }}
          </span>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            @click="simulatorExpanded = !simulatorExpanded"
          >
            {{ simulatorExpanded ? 'Thu gọn bộ tick' : 'Mở bộ tick quyền Member' }}
            <ChevronUp v-if="simulatorExpanded" class="h-3.5 w-3.5" />
            <ChevronDown v-else class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div v-if="simulatorExpanded" class="mt-2.5">
        <div
          v-if="roleState.isAdmin"
          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <span>
            <strong>Chế độ Admin / Manager (`isAdmin() === true`):</strong> Bỏ qua danh sách chặn 7 <code>adminOnlyApps</code> và <code>memberAppPermissions</code>; toàn quyền mọi action khai báo trong <code>manifest.json</code>.
          </span>
          <button
            type="button"
            class="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-500/20"
            @click="applyPreset('member_sales')"
          >
            Thử chuyển sang Member (CSKH) →
          </button>
        </div>

        <div v-else class="space-y-2">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div
              v-for="mod in memberModuleSpecs"
              :key="mod.code"
              class="rounded-xl border bg-white p-2.5 transition dark:bg-slate-900/90"
              :class="roleState.modules[mod.code] ? 'border-emerald-300 shadow-2xs dark:border-emerald-500/40' : 'border-slate-200 opacity-85 dark:border-slate-800'"
            >
              <label class="flex cursor-pointer items-center justify-between gap-1.5">
                <span class="font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">
                  {{ mod.code }}
                </span>
                <input
                  type="checkbox"
                  :checked="roleState.modules[mod.code]"
                  class="h-3.5 w-3.5 accent-emerald-600"
                  @change="toggleModuleAccess(mod.code)"
                />
              </label>
              <div class="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                {{ mod.labelVi }}
              </div>
              <div class="mt-1.5 flex flex-wrap gap-1">
                <button
                  v-for="act in mod.actions"
                  :key="act.code"
                  type="button"
                  :title="act.labelVi"
                  class="rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium transition"
                  :class="
                    roleState.modules[mod.code] && roleState.actions[`${mod.code}-${act.code}`]
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:text-slate-300'
                  "
                  @click="toggleActionAccess(mod.code, act.code)"
                >
                  {{ act.code }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-900">
            <label class="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                :checked="roleState.canViewCustomerPhone"
                class="h-3.5 w-3.5 accent-emerald-600"
                @change="toggleViewCustomerPhone"
              />
              <span>
                Cho phép xem số điện thoại đầy đủ (<code>canViewCustomerPhone</code> / <code>KHACH_HANG-HIEN_SO_DIEN_THOAI</code>)
              </span>
            </label>
            <span class="text-slate-500 dark:text-slate-400">
              Công thức SDK: <code>granted = (manifestGranted || wildcard) && userGranted</code>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- SUB-VIEW 1: 36-MiniApp 2-Tier Matrix -->
    <template v-if="subView === 'matrix'">
      <div class="space-y-2 border-b border-slate-200 bg-white px-5 py-2.5 dark:border-slate-800 dark:bg-[#0d1424]">
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative min-w-60 flex-1">
            <Search class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              v-model="query"
              type="text"
              placeholder="Lọc theo appId (vb-ma-...), tên app, rule hoặc action (VD: DANG_DIEN_RA, HIEN_SO_DIEN_THOAI)..."
              class="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-8 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              v-if="query"
              type="button"
              aria-label="Xóa từ khóa lọc"
              class="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="query = ''"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <select
            v-model="moduleFilter"
            aria-label="Lọc theo Module quyền"
            class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Tất cả Module quyền (9)</option>
            <option v-for="mod in PERMISSION_MODULES" :key="mod.code" :value="mod.code">
              {{ mod.code }} — {{ mod.labelVi }}
            </option>
          </select>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="pill in FILTER_PILLS"
            :key="pill.id"
            type="button"
            class="rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition"
            :class="
              accessFilter === pill.id
                ? 'border-slate-900 bg-slate-900 text-white dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-300'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            "
            @click="accessFilter = pill.id"
          >
            {{ pill.label }}
          </button>
          <span class="ml-auto font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Đang hiện {{ filteredRows.length }} / {{ MINI_APP_CATALOG.length }} Mini App
          </span>
        </div>
      </div>

      <div class="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-5">
        <p v-if="filteredRows.length === 0" class="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
          Không tìm thấy Mini App nào khớp bộ lọc quyền hiện tại.
        </p>

        <div
          v-for="row in filteredRows"
          :key="row.app.id"
          class="grid grid-cols-1 gap-3 rounded-xl border bg-white p-3.5 shadow-2xs transition lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.15fr)_minmax(0,1.4fr)] dark:bg-slate-900/80"
          :class="
            row.visibility.hasRuntimeParityDiff
              ? 'border-amber-300 ring-1 ring-amber-200/70 dark:border-amber-500/45 dark:ring-amber-500/25'
              : 'border-slate-200 hover:border-emerald-300 dark:border-slate-800 dark:hover:border-emerald-500/45'
          "
        >
          <!-- Column 1: App identity & source -->
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-sm font-bold text-slate-900 dark:text-slate-100">
                {{ row.app.nameVi }}
              </span>
              <span
                v-if="row.profile"
                class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                :class="SOURCE_BADGE[row.profile.manifestSource].cls"
              >
                {{ SOURCE_BADGE[row.profile.manifestSource].label }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300 dark:hover:border-emerald-500/40"
                title="Copy Mini App ID"
                @click="copyText(`id-${row.app.id}`, row.app.id)"
              >
                {{ row.app.id }}
                <Check v-if="copiedKey === `id-${row.app.id}`" class="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                <Copy v-else class="h-2.5 w-2.5 text-slate-400" />
              </button>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">{{ row.app.category }}</span>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                @click="copyText(`manifest-${row.app.id}`, buildManifestPermissionsJson(row.app.id))"
              >
                <Check v-if="copiedKey === `manifest-${row.app.id}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <FileJson v-else class="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                {{ copiedKey === `manifest-${row.app.id}` ? 'Đã copy manifest' : 'Copy manifest.json' }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
                @click="copyText(`sdk-${row.app.id}`, buildSdkCheckPermissionsSnippet(row.app.id))"
              >
                <Check v-if="copiedKey === `sdk-${row.app.id}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <Code2 v-else class="h-3 w-3" />
                {{ copiedKey === `sdk-${row.app.id}` ? 'Đã copy SDK' : 'Copy SDK' }}
              </button>
              <button
                v-if="row.app.relatedNodeId"
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                @click="emit('jumpNode', row.app.relatedNodeId)"
              >
                Sơ đồ
                <ExternalLink class="h-2.5 w-2.5" />
              </button>
            </div>
          </div>

          <!-- Column 2: Tier 1 Host Visibility -->
          <div class="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
            <div class="flex flex-wrap items-center justify-between gap-1">
              <span class="text-[10px] font-bold tracking-wide text-slate-600 uppercase dark:text-slate-400">
                Tầng 1 · Hiển thị trên Host App
              </span>
              <span
                v-if="row.visibility.hasRuntimeParityDiff || row.visibility.hasStaticParityDiff"
                class="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
              >
                <AlertTriangle class="h-2.5 w-2.5" />
                {{ row.visibility.hasRuntimeParityDiff ? 'Lệch hiển thị live' : 'Lệch Parity' }}
              </span>
            </div>

            <div class="flex flex-wrap gap-1.5 text-[11px]">
              <span
                v-if="props.platformMode !== 'android'"
                :title="row.visibility.iosReason"
                class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold"
                :class="
                  row.visibility.iosVisible
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                "
              >
                <Eye v-if="row.visibility.iosVisible" class="h-3 w-3" />
                <EyeOff v-else class="h-3 w-3" />
                iOS: {{ row.visibility.iosStatusLabel }}
              </span>

              <span
                v-if="props.platformMode !== 'ios'"
                :title="row.visibility.androidReason"
                class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold"
                :class="
                  row.visibility.androidVisible
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                "
              >
                <Eye v-if="row.visibility.androidVisible" class="h-3 w-3" />
                <EyeOff v-else class="h-3 w-3" />
                Android: {{ row.visibility.androidStatusLabel }}
              </span>
            </div>

            <div class="space-y-0.5 text-[10px] leading-snug text-slate-600 dark:text-slate-400">
              <div v-if="props.platformMode !== 'android'">
                <strong class="text-indigo-700 dark:text-indigo-300">Rule iOS:</strong> {{ row.app.iosPermissionRule }}
              </div>
              <div v-if="props.platformMode !== 'ios'">
                <strong class="text-emerald-700 dark:text-emerald-300">Rule Android:</strong> {{ row.app.androidPermissionRule }}
              </div>
              <div v-if="row.profile?.visibilityParityNote" class="font-medium text-amber-900 dark:text-amber-300">
                {{ row.profile.visibilityParityNote }}
              </div>
            </div>
          </div>

          <!-- Column 3: Tier 2 In-App Actions (manifest ∩ user) -->
          <div class="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
            <div class="text-[10px] font-bold tracking-wide text-slate-600 uppercase dark:text-slate-400">
              Tầng 2 · Quyền Action bên trong (manifest.json ∩ Vai trò)
            </div>

            <div v-if="row.groupedActions.length === 0" class="text-[11px] text-slate-500 dark:text-slate-400">
              <span v-if="row.app.accessLevel === 'admin_only'">
                Kiểm tra đồng bộ <code class="font-mono font-semibold text-amber-800 dark:text-amber-300">isAdmin() === true</code> (độc quyền Admin/Manager).
              </span>
              <span v-else>
                Không khai báo module quyền chi tiết; sử dụng Core SDK (`MiniAppToken` / `isAdmin()`).
              </span>
            </div>

            <div v-else class="space-y-1.5">
              <div
                v-for="[modCode, modActions] in row.groupedActions"
                :key="modCode"
                class="flex flex-wrap items-center gap-1"
              >
                <span class="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white dark:bg-slate-700">
                  {{ modCode }}
                </span>
                <span
                  v-for="item in modActions"
                  :key="`${item.module}-${item.action}`"
                  class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                  :class="
                    item.finalGranted
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/12 dark:text-rose-300'
                  "
                  :title="
                    item.wildcard
                      ? `Wildcard ${item.module}: [] — ${item.finalGranted ? 'Được phép' : 'Bị từ chối (thiếu quyền module)'}`
                      : `${item.module}-${item.action}: ${item.finalGranted ? 'Được phép (true)' : 'Bị từ chối (false)'}`
                  "
                >
                  <Unlock v-if="item.finalGranted" class="h-2.5 w-2.5 shrink-0" />
                  <Lock v-else class="h-2.5 w-2.5 shrink-0" />
                  <span>{{ item.wildcard && item.action === '*' ? 'wildcard []' : item.action }}</span>
                </span>
              </div>
            </div>

            <p v-if="row.profile?.inAppNotes" class="text-[10px] leading-snug text-slate-600 dark:text-slate-400">
              {{ row.profile.inAppNotes }}
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- SUB-VIEW 2: 9 Module Enum & Action Reference -->
    <template v-else>
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 text-xs text-slate-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-200">
          <div class="flex flex-wrap items-center gap-2 font-bold text-indigo-950 dark:text-indigo-300">
            <ShieldAlert class="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
            Quy tắc vàng khi gọi kiểm tra quyền qua `@vbotma/sdk`
          </div>
          <ul class="mt-1.5 list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
            <li>
              <strong>Công thức đánh giá SDK:</strong>
              <code>granted = (manifestGranted || moduleWildcard) &amp;&amp; userGranted</code> (tối đa 5000ms timeout, mặc định trả <code>false</code> — <em>deny-by-default</em>).
            </li>
            <li>
              <strong>Luôn truyền key Enum tiếng Việt chuẩn</strong> (VD: <code>KHACH_HANG</code>, <code>HIEN_SO_DIEN_THOAI</code>, <code>DANG_DIEN_RA</code>) để khớp <code>manifest.json</code> và hoạt động đồng nhất cả iOS lẫn Android.
            </li>
            <li>
              <strong>Gọi <code>isAdmin()</code> đồng bộ (0ms)</strong> kết hợp <code>await checkPermissions(module, actions)</code> khi mount màn hình để tránh chớp tắt nút giao diện.
            </li>
          </ul>
        </div>

        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div
            v-for="mod in PERMISSION_MODULES"
            :key="mod.code"
            class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80"
          >
            <div class="space-y-2.5">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white dark:bg-slate-700">
                      {{ mod.code }}
                    </span>
                    <span class="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {{ mod.labelVi }}
                    </span>
                  </div>
                  <div class="mt-1 space-y-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <div v-if="props.platformMode !== 'android'">
                      <span class="font-sans font-bold text-indigo-700 dark:text-indigo-300">iOS:</span> {{ mod.iosEnum }}
                      <span v-if="mod.iosModuleAliases.length" class="font-sans text-slate-500 dark:text-slate-400">
                        · Alias: {{ mod.iosModuleAliases.join(', ') }}
                      </span>
                    </div>
                    <div v-if="props.platformMode !== 'ios'">
                      <span class="font-sans font-bold text-emerald-700 dark:text-emerald-300">Android:</span> {{ mod.androidEnum }}
                      <span v-if="mod.androidModuleAliases.length" class="font-sans text-slate-500 dark:text-slate-400">
                        · Alias: {{ mod.androidModuleAliases.join(', ') }}
                      </span>
                    </div>
                  </div>
                </div>

                <span
                  class="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  :class="
                    mod.wildcardSupported
                      ? 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  "
                >
                  {{ mod.wildcardSupported ? 'Hỗ trợ wildcard []' : 'Kiểm từng action' }}
                </span>
              </div>

              <p
                v-if="mod.parityNote"
                class="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] leading-snug text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200"
              >
                <AlertTriangle class="mr-1 inline h-3 w-3 text-amber-700 dark:text-amber-400" />
                {{ mod.parityNote }}
              </p>

              <div class="space-y-1.5">
                <div
                  v-for="act in mod.actions"
                  :key="act.code"
                  class="rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div class="flex flex-wrap items-center justify-between gap-1.5">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <code class="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-slate-900 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                        {{ act.code }}
                      </code>
                      <span class="font-semibold text-slate-800 dark:text-slate-200">{{ act.labelVi }}</span>
                    </div>
                    <span
                      class="rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold"
                      :class="
                        roleState.isAdmin ||
                        (act.isSpecialPhoneFlag
                          ? roleState.modules.KHACH_HANG && roleState.canViewCustomerPhone
                          : roleState.modules[mod.code] && roleState.actions[`${mod.code}-${act.code}`])
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                      "
                    >
                      {{
                        roleState.isAdmin ||
                        (act.isSpecialPhoneFlag
                          ? roleState.modules.KHACH_HANG && roleState.canViewCustomerPhone
                          : roleState.modules[mod.code] && roleState.actions[`${mod.code}-${act.code}`])
                          ? 'Vai trò test: true'
                          : 'Vai trò test: false'
                      }}
                    </span>
                  </div>
                  <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    <span v-if="act.androidAliases.length">
                      <strong class="text-emerald-700 dark:text-emerald-300">Alias Android:</strong> {{ act.androidAliases.join(', ') }}
                    </span>
                    <span>
                      <strong class="text-indigo-700 dark:text-indigo-300">iOS:</strong> {{ act.iosSupportNote }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="getMiniAppsUsingModule(mod.code).length" class="space-y-1">
                <div class="text-[10px] font-bold text-slate-500 uppercase dark:text-slate-400">
                  Mini App sử dụng module này ({{ getMiniAppsUsingModule(mod.code).length }}):
                </div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="app in getMiniAppsUsingModule(mod.code)"
                    :key="app.id"
                    type="button"
                    class="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
                    :title="`Xem ${app.nameVi} trong Ma trận quyền`"
                    @click="focusAppInMatrix(app.id)"
                  >
                    {{ app.id }}
                  </button>
                </div>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                @click="copyText(`mod-manifest-${mod.code}`, buildModuleManifestSnippet(mod))"
              >
                <Check v-if="copiedKey === `mod-manifest-${mod.code}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <FileJson v-else class="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                {{ copiedKey === `mod-manifest-${mod.code}` ? 'Đã copy manifest' : 'Copy manifest.json' }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
                @click="copyText(`mod-sdk-${mod.code}`, buildModuleSdkSnippet(mod))"
              >
                <Check v-if="copiedKey === `mod-sdk-${mod.code}`" class="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <Code2 v-else class="h-3 w-3" />
                {{ copiedKey === `mod-sdk-${mod.code}` ? 'Đã copy SDK' : 'Copy checkPermissions()' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
