// src/data/miniAppPermissionMatrix.ts
// Ma trận quản lý 2 tầng quyền Mini App (Tầng 1: Hiển thị trên Host iOS/Android · Tầng 2: Action check_permissions & manifest.json).
// Chỉ đóng gói trong Internal / Tech chunk; KHÔNG import từ mã Public.

import { MINI_APP_CATALOG, type MiniAppCatalogEntry } from './miniAppBridgeCatalog';

export type PermissionModuleCode =
  | 'KHACH_HANG'
  | 'CUOC_GOI'
  | 'THANH_VIEN'
  | 'HOTLINE'
  | 'CAU_HINH_TONG_DAI'
  | 'CHIEN_DICH'
  | 'BAO_CAO'
  | 'CHIEN_DICH_SMS'
  | 'HIEN_CUOC';

export type RolePresetId =
  | 'admin'
  | 'member_full'
  | 'member_sales'
  | 'member_supervisor'
  | 'member_minimal';

export interface PermissionActionSpec {
  code: string;
  labelVi: string;
  androidAliases: string[];
  iosSupportNote: string;
  isSpecialPhoneFlag?: boolean;
}

export interface PermissionModuleSpec {
  code: PermissionModuleCode;
  labelVi: string;
  iosEnum: string;
  androidEnum: string;
  androidModuleAliases: string[];
  iosModuleAliases: string[];
  wildcardSupported: boolean;
  actions: PermissionActionSpec[];
  parityNote?: string;
}

export interface MiniAppManifestCapability {
  module: PermissionModuleCode;
  actions: string[];
  wildcard?: boolean;
  note?: string;
}

export type VisibilityRuleKind =
  | 'always_visible'
  | 'hidden_hub'
  | 'admin_only'
  | 'member_module'
  | 'member_action'
  | 'in_call_native';

export interface MiniAppPermissionProfile {
  appId: string;
  iosVisibilityRule: VisibilityRuleKind;
  androidVisibilityRule: VisibilityRuleKind;
  visibilityModule?: PermissionModuleCode;
  visibilityAction?: string;
  visibilityParityNote?: string;
  manifestSource: 'verified_manifest' | 'host_rbac_spec' | 'admin_or_open';
  manifestCapabilities: MiniAppManifestCapability[];
  inAppNotes?: string;
}

export interface SimulatedUserRoleState {
  isAdmin: boolean;
  modules: Record<PermissionModuleCode, boolean>;
  actions: Record<string, boolean>;
  canViewCustomerPhone: boolean;
}

export interface AppVisibilityResult {
  iosVisible: boolean;
  androidVisible: boolean;
  iosStatusLabel: string;
  androidStatusLabel: string;
  iosReason: string;
  androidReason: string;
  hasRuntimeParityDiff: boolean;
  hasStaticParityDiff: boolean;
}

export interface ActionGrantResult {
  module: PermissionModuleCode;
  action: string;
  manifestGranted: boolean;
  userGranted: boolean;
  finalGranted: boolean;
  wildcard?: boolean;
}

export interface RolePresetMeta {
  id: RolePresetId;
  label: string;
  description: string;
}

export const PERMISSION_MODULES: PermissionModuleSpec[] = [
  {
    code: 'KHACH_HANG',
    labelVi: 'Quản lý khách hàng (CRM)',
    iosEnum: 'VPMRoleVC.customer ("KHACH_HANG")',
    androidEnum: 'EnumPermission.KHACH_HANG',
    androidModuleAliases: ['CRM'],
    iosModuleAliases: ['CRM', 'CUSTOMER'],
    wildcardSupported: false,
    parityNote:
      'Android MiniAppPermissionHelper.kt map cả tiếng Việt lẫn tiếng Anh (VIEW/CREATE/EDIT/DELETE/SHOW_PHONE) và kiểm tra cờ canViewCustomerPhone riêng cho HIEN_SO_DIEN_THOAI. iOS MiniAppService.swift chỉ alias VIEW → SHOW và map VPMRoleAction, nên Mini App bắt buộc dùng key tiếng Việt chuẩn.',
    actions: [
      {
        code: 'XEM',
        labelVi: 'Xem danh sách & chi tiết khách hàng',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST'],
        iosSupportNote: 'Khớp VPMRoleAction.show ("XEM") hoặc isRoleVCAllowed(.customer)',
      },
      {
        code: 'TAO',
        labelVi: 'Thêm mới khách hàng',
        androidAliases: ['CREATE', 'ADD', 'POST', 'INSERT'],
        iosSupportNote: 'Khớp VPMRoleAction.create ("TAO")',
      },
      {
        code: 'CHINH_SUA',
        labelVi: 'Chỉnh sửa thông tin khách hàng',
        androidAliases: ['EDIT', 'UPDATE', 'PUT', 'PATCH'],
        iosSupportNote: 'Khớp VPMRoleAction.edit ("CHINH_SUA")',
      },
      {
        code: 'XOA',
        labelVi: 'Xóa khách hàng',
        androidAliases: ['DELETE', 'REMOVE', 'DESTROY'],
        iosSupportNote: 'Khớp VPMRoleAction.delete ("XOA")',
      },
      {
        code: 'HIEN_SO_DIEN_THOAI',
        labelVi: 'Xem số điện thoại đầy đủ (không che ***)',
        androidAliases: ['SHOW_PHONE', 'PHONE', 'CALL'],
        iosSupportNote: 'Khớp VPMRoleAction.showCustomerNumber ("HIEN_SO_DIEN_THOAI")',
        isSpecialPhoneFlag: true,
      },
      {
        code: 'LICH_SU',
        labelVi: 'Xem lịch sử tương tác / cuộc gọi của khách',
        androidAliases: ['HISTORY'],
        iosSupportNote: 'Khớp VPMRoleAction.recent ("LICH_SU")',
      },
      {
        code: 'NGHE_LAI',
        labelVi: 'Nghe lại file ghi âm cuộc gọi',
        androidAliases: ['PLAYBACK', 'LISTEN', 'RECORDING'],
        iosSupportNote: 'Khớp VPMRoleAction.record ("NGHE_LAI")',
      },
    ],
  },
  {
    code: 'CUOC_GOI',
    labelVi: 'Quản lý cuộc gọi & Giám sát',
    iosEnum: 'VPMRoleVC.call ("CUOC_GOI")',
    androidEnum: 'EnumPermission.CUOC_GOI',
    androidModuleAliases: ['CALL_HISTORY', 'HISTORY_CALL'],
    iosModuleAliases: ['CALL', 'CALLS'],
    wildcardSupported: true,
    parityNote:
      'Trên Android, MiniAppHelper.checkUserPermission("CUOC_GOI") kiểm tra riêng permissionCall[LICH_SU] cho module access và EnumPermissionCall.DANG_DIEN_RA để hiển thị vb-ma-monitoring. Hỗ trợ wildcard CUOC_GOI: [] cho phép makeCall() không cần quyền DANG_DIEN_RA.',
    actions: [
      {
        code: 'LICH_SU',
        labelVi: 'Xem lịch sử cuộc gọi',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST', 'HISTORY'],
        iosSupportNote: 'Khớp VPMRoleAction.recent ("LICH_SU")',
      },
      {
        code: 'DANG_DIEN_RA',
        labelVi: 'Theo dõi & can thiệp cuộc gọi đang diễn ra',
        androidAliases: ['LIVE', 'ONGOING', 'ACTIVE'],
        iosSupportNote: 'Khớp VPMRoleAction.rightNow ("DANG_DIEN_RA") — bắt buộc để mở vb-ma-monitoring',
      },
      {
        code: 'NGHE_LAI',
        labelVi: 'Nghe lại ghi âm cuộc gọi',
        androidAliases: ['PLAYBACK', 'LISTEN', 'RECORDING'],
        iosSupportNote: 'Khớp VPMRoleAction.record ("NGHE_LAI")',
      },
    ],
  },
  {
    code: 'THANH_VIEN',
    labelVi: 'Quản lý thành viên / Nhân viên',
    iosEnum: 'VPMRoleVC.member ("THANH_VIEN")',
    androidEnum: 'EnumPermission.THANH_VIEN',
    androidModuleAliases: ['MEMBER', 'MEMBER_MGMT'],
    iosModuleAliases: ['MEMBER', 'MEMBERS', 'MEMBER_MGMT'],
    wildcardSupported: false,
    parityNote:
      'Cả iOS (VPMRoleAction.addMoney / .extend + MiniAppPermissionHelper/MiniAppService) và Android (EnumPermissionMember.THEM_TIEN / GIA_HAN) đều hỗ trợ đầy đủ 6 sub-permission của THANH_VIEN và các alias tiếng Anh (TOPUP/ADD_MONEY/DEPOSIT, RENEW/EXTEND).',
    actions: [
      {
        code: 'XEM',
        labelVi: 'Xem danh sách thành viên',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST'],
        iosSupportNote: 'Khớp VPMRoleAction.show ("XEM")',
      },
      {
        code: 'TAO',
        labelVi: 'Thêm thành viên mới',
        androidAliases: ['CREATE', 'ADD', 'POST'],
        iosSupportNote: 'Khớp VPMRoleAction.create ("TAO")',
      },
      {
        code: 'CHINH_SUA',
        labelVi: 'Chỉnh sửa thông tin thành viên',
        androidAliases: ['EDIT', 'UPDATE', 'PUT', 'PATCH'],
        iosSupportNote: 'Khớp VPMRoleAction.edit ("CHINH_SUA")',
      },
      {
        code: 'XOA',
        labelVi: 'Xóa thành viên',
        androidAliases: ['DELETE', 'REMOVE'],
        iosSupportNote: 'Khớp VPMRoleAction.delete ("XOA")',
      },
      {
        code: 'THEM_TIEN',
        labelVi: 'Nạp / thêm tiền cho thành viên',
        androidAliases: ['TOPUP', 'ADD_MONEY', 'DEPOSIT'],
        iosSupportNote: 'Khớp VPMRoleAction.addMoney ("THEM_TIEN")',
      },
      {
        code: 'GIA_HAN',
        labelVi: 'Gia hạn tài khoản thành viên',
        androidAliases: ['RENEW', 'EXTEND'],
        iosSupportNote: 'Khớp VPMRoleAction.extend ("GIA_HAN") và alias RENEW/EXTEND qua MiniAppPermissionHelper',
      },
    ],
  },
  {
    code: 'HOTLINE',
    labelVi: 'Quản lý Hotline',
    iosEnum: 'VPMRoleVC.hotline ("HOTLINE")',
    androidEnum: 'EnumPermission.HOTLINE',
    androidModuleAliases: [],
    iosModuleAliases: ['HOTLINE'],
    wildcardSupported: false,
    actions: [
      {
        code: 'XEM',
        labelVi: 'Xem danh sách Hotline',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST'],
        iosSupportNote: 'Khớp VPMRoleAction.show ("XEM")',
      },
      {
        code: 'TAO',
        labelVi: 'Thêm mới Hotline / Alias',
        androidAliases: ['CREATE', 'ADD', 'POST'],
        iosSupportNote: 'Khớp VPMRoleAction.create ("TAO")',
      },
      {
        code: 'CHINH_SUA',
        labelVi: 'Cập nhật cấu hình Hotline',
        androidAliases: ['EDIT', 'UPDATE'],
        iosSupportNote: 'Khớp VPMRoleAction.edit ("CHINH_SUA")',
      },
      {
        code: 'XOA',
        labelVi: 'Xóa Hotline',
        androidAliases: ['DELETE', 'REMOVE'],
        iosSupportNote: 'Khớp VPMRoleAction.delete ("XOA")',
      },
    ],
  },
  {
    code: 'CAU_HINH_TONG_DAI',
    labelVi: 'Cấu hình tổng đài / Bot IVR',
    iosEnum: 'VPMRoleVC.switchboard ("CAU_HINH_TONG_DAI")',
    androidEnum: 'EnumPermission.CAU_HINH_TONG_DAI',
    androidModuleAliases: ['CALL_SCRIPT', 'SWITCHBOARD'],
    iosModuleAliases: [],
    wildcardSupported: false,
    parityNote:
      'Android nhận thêm alias module "CALL_SCRIPT" và "SWITCHBOARD" trong MiniAppPermissionHelper.kt; iOS nhận trực tiếp "CAU_HINH_TONG_DAI".',
    actions: [
      {
        code: 'XEM',
        labelVi: 'Xem kịch bản tổng đài / Bot IVR',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST'],
        iosSupportNote: 'Khớp VPMRoleAction.show ("XEM")',
      },
      {
        code: 'TAO',
        labelVi: 'Tạo kịch bản / luồng IVR',
        androidAliases: ['CREATE', 'ADD', 'POST'],
        iosSupportNote: 'Khớp VPMRoleAction.create ("TAO")',
      },
      {
        code: 'CHINH_SUA',
        labelVi: 'Chỉnh sửa kịch bản tổng đài',
        androidAliases: ['EDIT', 'UPDATE'],
        iosSupportNote: 'Khớp VPMRoleAction.edit ("CHINH_SUA")',
      },
      {
        code: 'XOA',
        labelVi: 'Xóa kịch bản tổng đài',
        androidAliases: ['DELETE', 'REMOVE'],
        iosSupportNote: 'Khớp VPMRoleAction.delete ("XOA")',
      },
    ],
  },
  {
    code: 'CHIEN_DICH',
    labelVi: 'Chiến dịch gọi tự động (Marketing)',
    iosEnum: 'VPMRoleVC.callCampaign ("CHIEN_DICH")',
    androidEnum: 'EnumPermission.CHIEN_DICH',
    androidModuleAliases: ['CAMPAIGN', 'CALL_CAMPAIGN', 'AUTO_CALL'],
    iosModuleAliases: ['CAMPAIGN'],
    wildcardSupported: true,
    actions: [
      {
        code: 'XEM',
        labelVi: 'Xem & thao tác chiến dịch gọi tự động (6 Mini App vb-ma-auto-call-*)',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST'],
        iosSupportNote: 'Khớp VPMRoleVC.callCampaign hoặc XEM',
      },
    ],
  },
  {
    code: 'BAO_CAO',
    labelVi: 'Báo cáo thống kê',
    iosEnum: 'VPMRoleVC.report ("BAO_CAO")',
    androidEnum: 'EnumPermission.BAO_CAO',
    androidModuleAliases: ['REPORT'],
    iosModuleAliases: ['REPORT', 'REPORTS'],
    wildcardSupported: true,
    actions: [
      {
        code: 'XEM',
        labelVi: 'Xem biểu đồ & báo cáo tổng đài',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST'],
        iosSupportNote: 'Khớp VPMRoleVC.report hoặc XEM',
      },
    ],
  },
  {
    code: 'CHIEN_DICH_SMS',
    labelVi: 'Chiến dịch SMS',
    iosEnum: 'VPMRoleVC.smsCampaign ("CHIEN_DICH_SMS")',
    androidEnum: 'EnumPermission.CHIEN_DICH_SMS',
    androidModuleAliases: ['SMS_CAMPAIGN'],
    iosModuleAliases: [],
    wildcardSupported: true,
    actions: [
      {
        code: 'XEM',
        labelVi: 'Xem & gửi chiến dịch SMS Marketing',
        androidAliases: ['VIEW', 'READ', 'GET', 'LIST'],
        iosSupportNote: 'Khớp VPMRoleVC.smsCampaign hoặc XEM',
      },
    ],
  },
  {
    code: 'HIEN_CUOC',
    labelVi: 'Hiển thị cước gọi chiến dịch',
    iosEnum: 'VPMRoleVC.showMoney ("HIEN_CUOC")',
    androidEnum: 'EnumPermission.HIEN_CUOC (Realm module permission)',
    androidModuleAliases: [],
    iosModuleAliases: [],
    wildcardSupported: true,
    parityNote:
      'Thường khai báo ở dạng wildcard "HIEN_CUOC": [] trong manifest.json để mở rộng mọi action kiểm tra hiển thị cước cuộc gọi chiến dịch.',
    actions: [
      {
        code: 'XEM',
        labelVi: 'Hiển thị thông tin cước phí chiến dịch',
        androidAliases: ['VIEW'],
        iosSupportNote: 'Khớp VPMRoleVC.showMoney / rawPerms ("HIEN_CUOC")',
      },
    ],
  },
];

export const MEMBER_FILTERABLE_MODULE_CODES: PermissionModuleCode[] = [
  'KHACH_HANG',
  'CUOC_GOI',
  'THANH_VIEN',
  'HOTLINE',
  'CAU_HINH_TONG_DAI',
  'CHIEN_DICH',
  'BAO_CAO',
  'CHIEN_DICH_SMS',
];

export const ROLE_PRESETS: RolePresetMeta[] = [
  {
    id: 'admin',
    label: 'Admin / Manager',
    description: 'Chủ dự án / Admin — bỏ qua bộ lọc adminOnlyApps và toàn quyền mọi action.',
  },
  {
    id: 'member_full',
    label: 'Member: Toàn quyền',
    description: 'Member được cấp đầy đủ 8 module và mọi sub-action, thấy mọi app trừ 7 adminOnlyApps.',
  },
  {
    id: 'member_sales',
    label: 'Member: CSKH / Sales',
    description: 'Chỉ có KHACH_HANG (XEM, TAO, CHINH_SUA — không xóa, che SĐT) & CUOC_GOI (LICH_SU, NGHE_LAI).',
  },
  {
    id: 'member_supervisor',
    label: 'Member: Giám sát',
    description: 'Có CUOC_GOI (LICH_SU, DANG_DIEN_RA, NGHE_LAI), BAO_CAO (XEM) và xem KHACH_HANG + hiện SĐT.',
  },
  {
    id: 'member_minimal',
    label: 'Member: Chưa cấp quyền',
    description: 'Tài khoản Member rỗng quyền — giúp thấy rõ những app vẫn mở & điểm lệch Android/iOS.',
  },
];

export function createRoleStateFromPreset(presetId: RolePresetId): SimulatedUserRoleState {
  const modules: Record<PermissionModuleCode, boolean> = {
    KHACH_HANG: false,
    CUOC_GOI: false,
    THANH_VIEN: false,
    HOTLINE: false,
    CAU_HINH_TONG_DAI: false,
    CHIEN_DICH: false,
    BAO_CAO: false,
    CHIEN_DICH_SMS: false,
    HIEN_CUOC: false,
  };
  const actions: Record<string, boolean> = {};

  for (const mod of PERMISSION_MODULES) {
    for (const act of mod.actions) {
      actions[`${mod.code}-${act.code}`] = false;
    }
  }

  if (presetId === 'admin' || presetId === 'member_full') {
    for (const mod of PERMISSION_MODULES) {
      modules[mod.code] = true;
      for (const act of mod.actions) {
        actions[`${mod.code}-${act.code}`] = true;
      }
    }
    return {
      isAdmin: presetId === 'admin',
      modules,
      actions,
      canViewCustomerPhone: true,
    };
  }

  if (presetId === 'member_sales') {
    modules.KHACH_HANG = true;
    modules.CUOC_GOI = true;
    actions['KHACH_HANG-XEM'] = true;
    actions['KHACH_HANG-TAO'] = true;
    actions['KHACH_HANG-CHINH_SUA'] = true;
    actions['CUOC_GOI-LICH_SU'] = true;
    actions['CUOC_GOI-NGHE_LAI'] = true;
    return {
      isAdmin: false,
      modules,
      actions,
      canViewCustomerPhone: false,
    };
  }

  if (presetId === 'member_supervisor') {
    modules.CUOC_GOI = true;
    modules.BAO_CAO = true;
    modules.KHACH_HANG = true;
    actions['CUOC_GOI-LICH_SU'] = true;
    actions['CUOC_GOI-DANG_DIEN_RA'] = true;
    actions['CUOC_GOI-NGHE_LAI'] = true;
    actions['BAO_CAO-XEM'] = true;
    actions['KHACH_HANG-XEM'] = true;
    actions['KHACH_HANG-HIEN_SO_DIEN_THOAI'] = true;
    return {
      isAdmin: false,
      modules,
      actions,
      canViewCustomerPhone: true,
    };
  }

  return {
    isAdmin: false,
    modules,
    actions,
    canViewCustomerPhone: false,
  };
}

export const MINI_APP_PERMISSION_PROFILES: Record<string, MiniAppPermissionProfile> = {
  // ── 3 Mini App nhúng Tab chính ─────────────────────────────────
  'vb-ma-contact-forward': {
    appId: 'vb-ma-contact-forward',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU'] },
      { module: 'KHACH_HANG', actions: ['XEM', 'TAO', 'CHINH_SUA', 'XOA'] },
    ],
    inAppNotes:
      'Prod /api/apps/global trả is_hidden=true (utility); đang nhúng tại Tab 1 trên Nam-dev (nút + chỉ hiện cho Admin trên cả iOS & Android) nhưng chưa dùng chính thức ở luồng sản phẩm.',
  },
  'vb-ma-user-history-call': {
    appId: 'vb-ma-user-history-call',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['LICH_SU', 'NGHE_LAI'] },
      { module: 'HIEN_CUOC', actions: [], wildcard: true },
      { module: 'HOTLINE', actions: ['XEM'] },
      { module: 'KHACH_HANG', actions: ['HIEN_SO_DIEN_THOAI', 'LICH_SU', 'NGHE_LAI', 'XEM'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes:
      'Xác nhận từ Prod /api/apps: vừa nhúng ở Tab 2 vừa hiển thị trong nhóm Cuộc gọi ở Tab 0 cho mọi Member; gọi NGHE_LAI & HIEN_SO_DIEN_THOAI bên trong Mini App.',
  },
  'vb-ma-user-contact': {
    appId: 'vb-ma-user-contact',
    iosVisibilityRule: 'hidden_hub',
    androidVisibilityRule: 'hidden_hub',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      {
        module: 'CUOC_GOI',
        actions: [],
        wildcard: true,
        note: 'Wildcard CUOC_GOI: [] cho phép gọi makeCall() mà không cần quyền DANG_DIEN_RA',
      },
    ],
    inAppNotes:
      'Prod /api/apps/global trả is_hidden=true (utility); danh bạ cá nhân tách theo uid SQLite; cần quyền READ_CONTACTS / CNContactStore cấp OS để đồng bộ danh bạ máy.',
  },

  // ── 7 Mini App Admin Only ───────────────────────────────────────
  'vb-ma-permission': {
    appId: 'vb-ma-permission',
    iosVisibilityRule: 'admin_only',
    androidVisibilityRule: 'admin_only',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Prod /api/apps trả capabilities=null; Host chặn qua adminOnlyApps (chỉ Admin/Manager mở được).',
  },
  'vb-ma-crm-custom-field': {
    appId: 'vb-ma-crm-custom-field',
    iosVisibilityRule: 'admin_only',
    androidVisibilityRule: 'admin_only',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Prod /api/apps trả capabilities=null; Host chặn qua adminOnlyApps (nhóm CRM).',
  },
  'vb-ma-survey': {
    appId: 'vb-ma-survey',
    iosVisibilityRule: 'admin_only',
    androidVisibilityRule: 'admin_only',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Prod /api/apps trả category="Cuộc gọi", capabilities=null; Host chặn qua adminOnlyApps.',
  },
  'vb-ma-webhook': {
    appId: 'vb-ma-webhook',
    iosVisibilityRule: 'admin_only',
    androidVisibilityRule: 'admin_only',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Prod /api/apps trả capabilities=null; Host chặn qua adminOnlyApps (nhóm Cài đặt nhóm).',
  },
  'vb-ma-api-key': {
    appId: 'vb-ma-api-key',
    iosVisibilityRule: 'admin_only',
    androidVisibilityRule: 'admin_only',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Có trên Prod /api/apps (chưa public /api/apps/global), capabilities=null; Host chặn qua adminOnlyApps.',
  },
  'vb-ma-add-on': {
    appId: 'vb-ma-add-on',
    iosVisibilityRule: 'admin_only',
    androidVisibilityRule: 'admin_only',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Prod /api/apps trả capabilities=null; Host chặn qua adminOnlyApps (nhóm Cài đặt nhóm).',
  },
  'vb-ma-call-automation-config': {
    appId: 'vb-ma-call-automation-config',
    iosVisibilityRule: 'admin_only',
    androidVisibilityRule: 'admin_only',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CAU_HINH_TONG_DAI', actions: ['XEM', 'CHINH_SUA'] },
    ],
    inAppNotes: 'Prod /api/apps trả category="Cuộc gọi"; Host chặn qua adminOnlyApps (chỉ Admin/Manager thấy).',
  },

  // ── Mini App lọc theo quyền Member & Nạp động Production ────────
  'vb-ma-member': {
    appId: 'vb-ma-member',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'THANH_VIEN',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU', 'NGHE_LAI'] },
      { module: 'THANH_VIEN', actions: ['CHINH_SUA', 'GIA_HAN', 'TAO', 'THEM_TIEN', 'XEM', 'XOA'] },
    ],
    inAppNotes:
      'Prod /api/apps trả category="Cài đặt nhóm"; cả iOS (VPMRoleAction gồm cả .extend = "GIA_HAN") và Android (EnumPermissionMember) đều hỗ trợ đầy đủ 6 sub-permission của THANH_VIEN.',
  },
  'vb-ma-group-member': {
    appId: 'vb-ma-group-member',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'THANH_VIEN', actions: ['CHINH_SUA', 'GIA_HAN', 'TAO', 'THEM_TIEN', 'XEM', 'XOA'] },
    ],
    inAppNotes:
      'Có trên Prod /api/apps/global (category="Cài đặt nhóm"); Host iOS/Android chưa đưa vào memberAppPermissions nên hiển thị mở cho mọi Member trên Hub.',
  },
  'vb-ma-user-hotline': {
    appId: 'vb-ma-user-hotline',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'HOTLINE',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'HOTLINE', actions: ['CHINH_SUA', 'TAO', 'XEM', 'XOA'] },
    ],
  },
  'vb-ma-alias-hotline': {
    appId: 'vb-ma-alias-hotline',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'HOTLINE',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'HOTLINE', actions: ['CHINH_SUA', 'TAO', 'XEM', 'XOA'] },
      { module: 'THANH_VIEN', actions: ['CHINH_SUA', 'GIA_HAN', 'TAO', 'THEM_TIEN', 'XEM', 'XOA'] },
    ],
  },
  'vb-ma-tagging': {
    appId: 'vb-ma-tagging',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CUOC_GOI',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Prod /api/apps trả category="Cuộc gọi", capabilities=null; Host lọc theo CUOC_GOI.',
  },
  'vb-ma-monitoring': {
    appId: 'vb-ma-monitoring',
    iosVisibilityRule: 'member_action',
    androidVisibilityRule: 'member_action',
    visibilityModule: 'CUOC_GOI',
    visibilityAction: 'DANG_DIEN_RA',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA'] },
      { module: 'HIEN_CUOC', actions: [], wildcard: true },
      { module: 'HOTLINE', actions: ['XEM'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes:
      'Nghe lén (listen) miễn quyền Mic; Nhắc thầm (whisper) & Giành (capture) cần quyền Mic OS.',
  },
  'vb-ma-report': {
    appId: 'vb-ma-report',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'BAO_CAO',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'BAO_CAO', actions: [], wildcard: true },
    ],
  },
  'vb-ma-call-script': {
    appId: 'vb-ma-call-script',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CAU_HINH_TONG_DAI',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CAU_HINH_TONG_DAI', actions: ['XEM', 'TAO', 'CHINH_SUA', 'XOA'] },
      { module: 'HOTLINE', actions: ['CHINH_SUA', 'TAO', 'XEM', 'XOA'] },
      { module: 'THANH_VIEN', actions: ['CHINH_SUA', 'GIA_HAN', 'TAO', 'THEM_TIEN', 'XEM', 'XOA'] },
    ],
  },
  'vb-ma-bot-ivr': {
    appId: 'vb-ma-bot-ivr',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CAU_HINH_TONG_DAI',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes: 'Prod /api/apps trả category="Cuộc gọi", capabilities=null; Host lọc theo CAU_HINH_TONG_DAI.',
  },
  'vb-ma-autodial': {
    appId: 'vb-ma-autodial',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      {
        module: 'CHIEN_DICH',
        actions: [],
        wildcard: true,
        note: 'Prod /api/apps khai báo wildcard CHIEN_DICH: [] cùng HOTLINE: [XEM] & THANH_VIEN: [XEM]',
      },
      { module: 'HOTLINE', actions: ['XEM'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes:
      'Nạp động từ vb-ma-platform (category="Cuộc gọi", mở mặc định cho mọi user trên Host); điều khiển gọi qua AutodialManager.',
  },
  'vb-ma-blacklist': {
    appId: 'vb-ma-blacklist',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes:
      'Prod /api/apps trả category="Cuộc gọi", capabilities=null; đã gỡ khỏi adminOnlyApps trên iOS (commit 637b6edf) và mở cho mọi Member.',
  },
  'vb-ma-ipcall-control': {
    appId: 'vb-ma-ipcall-control',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes:
      'Prod /api/apps trả category="Cuộc gọi", capabilities=null; Host chưa chặn trong adminOnlyApps hoặc memberAppPermissions nên luôn hiển thị trên Hub.',
  },
  'vb-ma-auto-call-campaign': {
    appId: 'vb-ma-auto-call-campaign',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CHIEN_DICH',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CHIEN_DICH', actions: [], wildcard: true },
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU', 'NGHE_LAI'] },
      { module: 'KHACH_HANG', actions: ['XEM'] },
    ],
  },
  'vb-ma-auto-call-history-call': {
    appId: 'vb-ma-auto-call-history-call',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CHIEN_DICH',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CHIEN_DICH', actions: [], wildcard: true },
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU', 'NGHE_LAI'] },
      { module: 'HIEN_CUOC', actions: [], wildcard: true },
    ],
  },
  'vb-ma-auto-call-template': {
    appId: 'vb-ma-auto-call-template',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CHIEN_DICH',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CHIEN_DICH', actions: [], wildcard: true },
    ],
  },
  'vb-ma-auto-call-schedule': {
    appId: 'vb-ma-auto-call-schedule',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CHIEN_DICH',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CHIEN_DICH', actions: [], wildcard: true },
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU', 'NGHE_LAI'] },
      { module: 'KHACH_HANG', actions: ['XEM'] },
    ],
  },
  'vb-ma-auto-call-custom-field': {
    appId: 'vb-ma-auto-call-custom-field',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CHIEN_DICH',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CHIEN_DICH', actions: [], wildcard: true },
    ],
  },
  'vb-ma-auto-call-group-campaign': {
    appId: 'vb-ma-auto-call-group-campaign',
    iosVisibilityRule: 'member_module',
    androidVisibilityRule: 'member_module',
    visibilityModule: 'CHIEN_DICH',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CHIEN_DICH', actions: [], wildcard: true },
    ],
  },
  'vb-ma-crm': {
    appId: 'vb-ma-crm',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU', 'NGHE_LAI'] },
      {
        module: 'KHACH_HANG',
        actions: ['CHINH_SUA', 'HIEN_SO_DIEN_THOAI', 'LICH_SU', 'NGHE_LAI', 'XEM', 'XOA'],
      },
    ],
    inAppNotes:
      'Cả iOS (đã gỡ khỏi memberAppPermissions ở commit 0fcf3390) & Android đều luôn hiển thị CRM cho mọi Member ở Trang Tính năng; bên trong gọi checkPermissions("KHACH_HANG", [...]) để khóa/ẩn các nút không được cấp và che SĐT.',
  },
  'vb-ma-crm-v2': {
    appId: 'vb-ma-crm-v2',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU', 'NGHE_LAI'] },
      {
        module: 'KHACH_HANG',
        actions: ['CHINH_SUA', 'HIEN_SO_DIEN_THOAI', 'LICH_SU', 'NGHE_LAI', 'XEM', 'XOA'],
      },
    ],
    inAppNotes:
      'Prod /api/apps/global trả category="utility", is_hidden=false; không có rule lọc ở Host nên mở cho mọi Member song song với vb-ma-crm.',
  },

  // ── Mini App Platform / Mở lồng con / Nạp động Cài đặt nhóm ─────
  'vb-ma-ticket': {
    appId: 'vb-ma-ticket',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['LICH_SU', 'NGHE_LAI'] },
      { module: 'HOTLINE', actions: ['XEM'] },
      { module: 'KHACH_HANG', actions: ['CHINH_SUA', 'HIEN_SO_DIEN_THOAI', 'LICH_SU', 'NGHE_LAI', 'XEM'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes: 'Mở qua fetchGlobalMiniApps cho mọi user; tự lọc dữ liệu phiếu & khách hàng qua Module Token / check_permissions.',
  },
  'vb-ma-activity-history': {
    appId: 'vb-ma-activity-history',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['LICH_SU', 'NGHE_LAI'] },
      { module: 'KHACH_HANG', actions: ['HIEN_SO_DIEN_THOAI', 'LICH_SU', 'NGHE_LAI', 'XEM'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes: 'Prod /api/apps trả is_hidden=true; mở lồng từ Ticket hoặc CRM thông qua open_mini_app kèm customerId.',
  },
  'vb-ma-todo': {
    appId: 'vb-ma-todo',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CHIEN_DICH', actions: [], wildcard: true },
      { module: 'CUOC_GOI', actions: ['LICH_SU', 'NGHE_LAI'] },
      { module: 'HOTLINE', actions: ['XEM'] },
      { module: 'KHACH_HANG', actions: ['CHINH_SUA', 'HIEN_SO_DIEN_THOAI', 'LICH_SU', 'NGHE_LAI', 'XEM'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes: 'Prod /api/apps trả category="" (hiển thị đầu danh sách Trang Tính năng cho mọi user).',
  },
  'vb-ma-work-schedule': {
    appId: 'vb-ma-work-schedule',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes:
      'Xác nhận từ vb-ma-work-schedule/manifest.json (v0.1.0, hidden=false, capabilities.permissions={}). Host chưa đưa vào adminOnlyApps / memberAppPermissions nên hiển thị cho mọi Member trên Hub; bên trong phân 2 vai trò qua isAdmin() (Trưởng nhóm quản lý 3 tab Lịch làm việc · Thành viên · Mẫu lịch; Thành viên chỉ xem "Lịch trực của tôi").',
  },
  'vb-ma-storage-management': {
    appId: 'vb-ma-storage-management',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes:
      'Prod /api/apps trả category="Cài đặt nhóm", capabilities=null; Host chưa đưa vào adminOnlyApps nên luôn hiển thị cho mọi Member.',
  },
  'vb-ma-sdk-mobile-push': {
    appId: 'vb-ma-sdk-mobile-push',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes:
      'Prod /api/apps trả category="Cài đặt nhóm", capabilities=null; Host chưa đưa vào adminOnlyApps nên luôn hiển thị cho mọi Member.',
  },
  'vb-ma-widget': {
    appId: 'vb-ma-widget',
    iosVisibilityRule: 'always_visible',
    androidVisibilityRule: 'always_visible',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [],
    inAppNotes:
      'Prod /api/apps trả category="Cài đặt nhóm", capabilities=null; Host chưa đưa vào adminOnlyApps nên luôn hiển thị cho mọi Member.',
  },

  // ── 4 Mini App chuyên biệt trong cuộc gọi ──────────────────────
  'vb-ma-call-note': {
    appId: 'vb-ma-call-note',
    iosVisibilityRule: 'in_call_native',
    androidVisibilityRule: 'in_call_native',
    manifestSource: 'host_rbac_spec',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA'] },
    ],
    inAppNotes: 'Ẩn khỏi Trang Tính năng (inCallOnlyMiniApps); nhánh Nam-dev dùng UI cuộc gọi Native.',
  },
  'vb-ma-call-tag': {
    appId: 'vb-ma-call-tag',
    iosVisibilityRule: 'in_call_native',
    androidVisibilityRule: 'in_call_native',
    manifestSource: 'host_rbac_spec',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA'] },
    ],
    inAppNotes: 'Ẩn khỏi Trang Tính năng (inCallOnlyMiniApps); nhánh Nam-dev dùng UI cuộc gọi Native.',
  },
  'vb-ma-call-transfer': {
    appId: 'vb-ma-call-transfer',
    iosVisibilityRule: 'in_call_native',
    androidVisibilityRule: 'in_call_native',
    manifestSource: 'verified_manifest',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA', 'LICH_SU'] },
      { module: 'KHACH_HANG', actions: ['XEM'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes:
      'Xác nhận thực tế từ vb-ma-call-transfer/manifest.json; nhánh Nam-dev ẩn ở Trang Tính năng và chuyển tiếp dùng Native + DTMF.',
  },
  'vb-ma-call-add-member': {
    appId: 'vb-ma-call-add-member',
    iosVisibilityRule: 'in_call_native',
    androidVisibilityRule: 'in_call_native',
    manifestSource: 'host_rbac_spec',
    manifestCapabilities: [
      { module: 'CUOC_GOI', actions: ['DANG_DIEN_RA'] },
      { module: 'THANH_VIEN', actions: ['XEM'] },
    ],
    inAppNotes: 'Ẩn khỏi Trang Tính năng (inCallOnlyMiniApps); nhánh Nam-dev dùng UI cuộc gọi Native.',
  },

  // ── 1 Mini App Cài đặt ẩn ──────────────────────────────────────
  'vb-ma-2fa-setting': {
    appId: 'vb-ma-2fa-setting',
    iosVisibilityRule: 'hidden_hub',
    androidVisibilityRule: 'hidden_hub',
    manifestSource: 'admin_or_open',
    manifestCapabilities: [],
    inAppNotes: 'Nằm trong hiddenApps (không hiện ở Trang Tính năng); truy cập từ màn Cài đặt bảo mật khi được mở.',
  },
};

function evaluateSinglePlatformVisibility(
  rule: VisibilityRuleKind,
  profile: MiniAppPermissionProfile,
  role: SimulatedUserRoleState,
  platform: 'ios' | 'android',
): { visible: boolean; label: string; reason: string } {
  const platformTag = platform === 'ios' ? 'iOS' : 'Android';
  switch (rule) {
    case 'admin_only':
      return role.isAdmin
        ? {
            visible: true,
            label: 'Hiện (Admin)',
            reason: `${platformTag} adminOnlyApps: tài khoản Admin/Manager được phép hiển thị.`,
          }
        : {
            visible: false,
            label: 'Ẩn (Chỉ Admin)',
            reason: `${platformTag} adminOnlyApps: ẩn toàn bộ với tài khoản Member.`,
          };

    case 'hidden_hub':
      return {
        visible: false,
        label: profile.appId === 'vb-ma-user-contact' ? 'Tab 3 cố định' : 'Cài đặt ẩn',
        reason: `${platformTag} ẩn khỏi Trang Tính năng (hiddenApps); chỉ mở tại vị trí chuyên biệt.`,
      };

    case 'in_call_native':
      return {
        visible: false,
        label: platform === 'android' ? 'Ẩn Hub (In-call)' : 'In-call Native UI',
        reason:
          platform === 'android'
            ? 'Android inCallOnlyMiniApps — ẩn khỏi FeatureFragment (UI gọi dùng Native).'
            : 'iOS Nam-dev dùng UI cuộc gọi Native (không mở từ Trang Tính năng).',
      };

    case 'always_visible':
      return {
        visible: true,
        label: platform === 'android' && profile.iosVisibilityRule !== 'always_visible' ? 'Luôn hiện (Android)' : 'Hiện',
        reason: `${platformTag} không lọc quyền tại Trang Tính năng (mọi user thấy icon app).`,
      };

    case 'member_module': {
      const mod = profile.visibilityModule;
      if (role.isAdmin) {
        return {
          visible: true,
          label: 'Hiện (Admin)',
          reason: `${platformTag} bypass memberAppPermissions vì isAdmin == true.`,
        };
      }
      const allowed = Boolean(mod && role.modules[mod]);
      return allowed
        ? {
            visible: true,
            label: `Hiện (${mod})`,
            reason: `${platformTag} cho hiện vì Member có quyền module ${mod}.`,
          }
        : {
            visible: false,
            label: `Ẩn (Thiếu ${mod})`,
            reason: `${platformTag} ẩn khỏi Trang Tính năng vì Member thiếu quyền ${mod}.`,
          };
    }

    case 'member_action': {
      const mod = profile.visibilityModule ?? 'CUOC_GOI';
      const act = profile.visibilityAction ?? 'DANG_DIEN_RA';
      if (role.isAdmin) {
        return {
          visible: true,
          label: 'Hiện (Admin)',
          reason: `${platformTag} bypass kiểm tra sub-action vì isAdmin == true.`,
        };
      }
      const allowed = Boolean(role.modules[mod] && role.actions[`${mod}-${act}`]);
      return allowed
        ? {
            visible: true,
            label: `Hiện (${act})`,
            reason: `${platformTag} cho hiện vì Member có quyền ${mod}-${act}.`,
          }
        : {
            visible: false,
            label: `Ẩn (Thiếu ${act})`,
            reason: `${platformTag} ẩn vì Member thiếu quyền ${mod}-${act}.`,
          };
    }
  }
}

export function evaluateAppVisibility(
  appId: string,
  role: SimulatedUserRoleState,
): AppVisibilityResult {
  const profile = MINI_APP_PERMISSION_PROFILES[appId];
  if (!profile) {
    return {
      iosVisible: false,
      androidVisible: false,
      iosStatusLabel: 'Không rõ',
      androidStatusLabel: 'Không rõ',
      iosReason: 'Chưa khai báo profile phân quyền.',
      androidReason: 'Chưa khai báo profile phân quyền.',
      hasRuntimeParityDiff: false,
      hasStaticParityDiff: false,
    };
  }

  const iosRes = evaluateSinglePlatformVisibility(profile.iosVisibilityRule, profile, role, 'ios');
  const androidRes = evaluateSinglePlatformVisibility(
    profile.androidVisibilityRule,
    profile,
    role,
    'android',
  );

  return {
    iosVisible: iosRes.visible,
    androidVisible: androidRes.visible,
    iosStatusLabel: iosRes.label,
    androidStatusLabel: androidRes.label,
    iosReason: iosRes.reason,
    androidReason: androidRes.reason,
    hasRuntimeParityDiff: iosRes.visible !== androidRes.visible,
    hasStaticParityDiff:
      Boolean(profile.visibilityParityNote) ||
      profile.iosVisibilityRule !== profile.androidVisibilityRule,
  };
}

export function evaluateActionGrant(
  profile: MiniAppPermissionProfile,
  module: PermissionModuleCode,
  action: string,
  role: SimulatedUserRoleState,
): ActionGrantResult {
  const cap = profile.manifestCapabilities.find((item) => item.module === module);
  const manifestGranted = Boolean(cap && (cap.wildcard || cap.actions.includes(action)));
  const wildcard = Boolean(cap?.wildcard);

  let userGranted = false;
  if (role.isAdmin) {
    userGranted = true;
  } else if (module === 'KHACH_HANG' && action === 'HIEN_SO_DIEN_THOAI') {
    userGranted = Boolean(role.modules.KHACH_HANG && role.canViewCustomerPhone);
  } else {
    const key = `${module}-${action}`;
    if (key in role.actions) {
      userGranted = Boolean(role.modules[module] && role.actions[key]);
    } else {
      userGranted = Boolean(role.modules[module]);
    }
  }

  return {
    module,
    action,
    manifestGranted,
    userGranted,
    finalGranted: manifestGranted && userGranted,
    wildcard,
  };
}

export function evaluateProfileActions(
  profile: MiniAppPermissionProfile,
  role: SimulatedUserRoleState,
): ActionGrantResult[] {
  const results: ActionGrantResult[] = [];
  for (const cap of profile.manifestCapabilities) {
    if (cap.wildcard && cap.actions.length === 0) {
      const evaluated = evaluateActionGrant(profile, cap.module, '*', role);
      results.push({ ...evaluated, action: '*', wildcard: true });
      continue;
    }
    for (const act of cap.actions) {
      results.push(evaluateActionGrant(profile, cap.module, act, role));
    }
  }
  return results;
}

export function buildManifestPermissionsJson(appId: string): string {
  const profile = MINI_APP_PERMISSION_PROFILES[appId];
  const permissions: Record<string, string[]> = {};
  for (const cap of profile?.manifestCapabilities ?? []) {
    permissions[cap.module] = cap.wildcard && cap.actions.length === 0 ? [] : [...cap.actions];
  }
  return JSON.stringify(
    {
      capabilities: {
        permissions,
      },
    },
    null,
    2,
  );
}

export function buildSdkCheckPermissionsSnippet(appId: string): string {
  const profile = MINI_APP_PERMISSION_PROFILES[appId];
  const caps = profile?.manifestCapabilities ?? [];
  const isAdminOnly = profile?.iosVisibilityRule === 'admin_only';

  if (caps.length === 0) {
    return isAdminOnly
      ? `import { isAdmin } from '@vbotma/sdk';

// ${appId} chỉ mở cho Admin / Manager (adminOnlyApps)
if (!isAdmin()) {
  showNoAccessBanner();
}`
      : `import { isAdmin } from '@vbotma/sdk';

// ${appId} không khai báo module quyền riêng trong capabilities.permissions
const admin = isAdmin();`;
  }

  const lines: string[] = [
    `import { isAdmin, checkPermissions } from '@vbotma/sdk';`,
    ``,
    `// Deny-by-default trong onMount để tránh nhấp nháy UI`,
  ];

  caps.forEach((cap, index) => {
    const actionsToQuery = cap.wildcard && cap.actions.length === 0 ? ['XEM'] : cap.actions;
    const varName =
      caps.length === 1
        ? 'perms'
        : `perms${cap.module.charAt(0)}${cap.module.slice(1).toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
    const actionsList = actionsToQuery.map((a) => `'${a}'`).join(', ');
    lines.push(
      `const ${varName} = await checkPermissions('${cap.module}', [${actionsList}], { timeout: 5000 });`,
    );
    if (index === 0) {
      const sampleAct = actionsToQuery[0] ?? 'XEM';
      lines.push(
        `const can${sampleAct} = isAdmin() || ${varName}.${sampleAct} === true;`,
      );
    }
  });

  return lines.join('\n');
}

export function buildModuleManifestSnippet(mod: PermissionModuleSpec): string {
  const permissions = {
    [mod.code]: mod.wildcardSupported && mod.actions.length <= 1 ? [] : mod.actions.map((a) => a.code),
  };
  return JSON.stringify({ capabilities: { permissions } }, null, 2);
}

export function buildModuleSdkSnippet(mod: PermissionModuleSpec): string {
  const actList = mod.actions.map((a) => `'${a.code}'`).join(', ');
  const firstAct = mod.actions[0]?.code ?? 'XEM';
  return `import { isAdmin, checkPermissions } from '@vbotma/sdk';

const perms = await checkPermissions('${mod.code}', [${actList}], { timeout: 5000 });
const canExecute = isAdmin() || perms.${firstAct} === true;`;
}

export function getMiniAppsUsingModule(moduleCode: PermissionModuleCode): MiniAppCatalogEntry[] {
  return MINI_APP_CATALOG.filter((app) => {
    const profile = MINI_APP_PERMISSION_PROFILES[app.id];
    if (!profile) return false;
    return (
      profile.visibilityModule === moduleCode ||
      profile.manifestCapabilities.some((cap) => cap.module === moduleCode)
    );
  });
}

export function exportMiniAppPermissionsMarkdown(): string {
  const lines: string[] = [
    '# Ma trận Quản lý Quyền Mini App VBot (2 tầng RBAC)',
    '',
    '- **Tầng 1 (Hiển thị trên Host App):** `hiddenApps` / `inCallOnlyMiniApps` → `adminOnlyApps` (7 app) → `memberAppPermissions` (15 app) → nạp động `return true`.',
    '- **Tầng 2 (Trong Mini App):** `granted = (manifestGranted || moduleWildcard) && userGranted` qua `isAdmin()` (sync) & `checkPermissions(module, actions[])` (async, timeout 5000ms).',
    '',
    `## 1. Ma trận 2 tầng cho ${MINI_APP_CATALOG.length} Mini App`,
  ];

  for (const app of MINI_APP_CATALOG) {
    const profile = MINI_APP_PERMISSION_PROFILES[app.id];
    const capsText = profile?.manifestCapabilities.length
      ? profile.manifestCapabilities
          .map((c) => `${c.module}: [${c.wildcard && c.actions.length === 0 ? '' : c.actions.join(', ')}]`)
          .join(' · ')
      : 'Core SDK / isAdmin()';
    lines.push(
      `- **\`${app.id}\`** (${app.nameVi}) · Nguồn: \`${profile?.manifestSource ?? 'host_rbac_spec'}\``,
      `  - Tầng 1 Hiển thị — iOS: ${app.iosPermissionRule} | Android: ${app.androidPermissionRule}`,
      `  - Tầng 2 Action (\`manifest.json\`): ${capsText}`,
    );
    if (profile?.visibilityParityNote) {
      lines.push(`  - ⚠️ Lệch iOS ↔ Android: ${profile.visibilityParityNote}`);
    }
  }

  lines.push('', `## 2. Tra cứu ${PERMISSION_MODULES.length} Module Enum & Action chuẩn`);
  for (const mod of PERMISSION_MODULES) {
    lines.push(
      `### \`${mod.code}\` — ${mod.labelVi}`,
      `- iOS: \`${mod.iosEnum}\` | Android: \`${mod.androidEnum}\` | Wildcard: ${mod.wildcardSupported ? 'Có (`[]`)' : 'Không'}`,
      `- Actions: ${mod.actions.map((a) => `\`${a.code}\` (${a.labelVi})`).join(', ')}`,
    );
    if (mod.parityNote) {
      lines.push(`- ⚠️ Parity: ${mod.parityNote}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
