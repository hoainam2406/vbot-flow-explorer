// src/core/miniAppContractBuilder.ts
import {
  BRIDGE_PARITY_ALERTS,
  CORE_BRIDGE_SPECS,
  MINI_APP_CATALOG,
  type BridgeParityAlert,
  type CoreBridgeSpecItem,
  type MiniAppCatalogEntry,
} from '../data/miniAppBridgeCatalog';
import {
  buildManifestPermissionsJson,
  MINI_APP_PERMISSION_PROFILES,
  type MiniAppPermissionProfile,
} from '../data/miniAppPermissionMatrix';

export const FEATURED_STUDIO_APP_IDS: readonly string[] = [
  'vb-ma-autodial',
  'vb-ma-monitoring',
  'vb-ma-user-contact',
  'vb-ma-crm',
  'vb-ma-ticket',
  'vb-ma-user-history-call',
  'vb-ma-contact-forward',
  'vb-ma-2fa-setting',
];

export interface LaunchParamFieldSpec {
  key: string;
  sourceField: string;
  required: boolean;
  type: string;
  description: string;
  exampleValue: string;
  parityNote?: string;
}

export interface ContractFieldSpec {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
}

export interface ContractCommandSpec {
  method: string;
  category: 'lifecycle' | 'auth' | 'calling' | 'contacts' | 'navigation' | 'ui';
  title: string;
  summary: string;
  isHostAction: boolean;
  sdkCallSummary: string;
  requestSchema: ContractFieldSpec[];
  validExample: Record<string, unknown>;
  invalidExample: Record<string, unknown>;
  responseOk: Record<string, unknown>;
  responseError?: Record<string, unknown>;
  iosHandler: string;
  androidHandler: string;
  parityNote?: string;
}

export interface ContractEventSpec {
  eventName: string;
  source: 'host_push' | 'sdk_reply';
  title: string;
  summary: string;
  payloadSchema: ContractFieldSpec[];
  samplePayload: Record<string, unknown>;
  iosNote?: string;
  androidNote?: string;
  parityNote?: string;
}

export interface MiniAppContract {
  app: MiniAppCatalogEntry;
  isFeatured: boolean;
  launchParams: LaunchParamFieldSpec[];
  launchNotes: string[];
  incomingEvents: ContractEventSpec[];
  outgoingCommands: ContractCommandSpec[];
  allAvailableCommands: ContractCommandSpec[];
  permissionProfile: MiniAppPermissionProfile | undefined;
  parityAlerts: BridgeParityAlert[];
  manifestPermissionsJson: string;
}

const CORE_SPEC_BY_ID = new Map<string, CoreBridgeSpecItem>(
  CORE_BRIDGE_SPECS.map((spec) => [spec.id, spec]),
);

function findSpecHandler(idHint: string, fallbackIos: string, fallbackAndroid: string) {
  for (const [id, spec] of CORE_SPEC_BY_ID.entries()) {
    if (id === idHint || spec.name.includes(idHint)) {
      return {
        iosHandler: spec.iosHandler || fallbackIos,
        androidHandler: spec.androidHandler || fallbackAndroid,
      };
    }
  }
  return { iosHandler: fallbackIos, androidHandler: fallbackAndroid };
}

export const ALL_SANDBOX_COMMANDS: ContractCommandSpec[] = [
  {
    method: 'ready',
    category: 'lifecycle',
    title: 'Báo WebView đã khởi tạo xong (ready)',
    summary:
      'Mini App bắt buộc gọi sớm ngay sau khi mount xong listener để Host xả hàng đợi sự kiện (iOS queuedHostEvents) và ẩn loading.',
    isHostAction: false,
    sdkCallSummary: 'await sdk.ready()',
    requestSchema: [
      {
        name: 'sdk_version',
        type: 'string',
        required: false,
        description: 'Phiên bản @vbotma/sdk đang chạy trong Mini App',
        example: '1.4.2',
      },
    ],
    validExample: { sdk_version: '1.4.2' },
    invalidExample: { invalid_flag: 123 },
    responseOk: { success: true, ready: true, flushed_queued_events: 1 },
    ...findSpecHandler(
      'ready',
      'VbMaViewController.handleReady() → xả queuedHostEvents',
      'VbMABridge.post("ready") → onWebViewReady()',
    ),
    parityNote: 'iOS giữ hàng đợi queuedHostEvents nếu Host emit trước khi WebView gọi ready().',
  },
  {
    method: 'request_mini_app_token',
    category: 'auth',
    title: 'Lấy MiniApp Access Token',
    summary:
      'Yêu cầu Host cấp access token scoped theo appId hiện tại để Mini App gọi API VBot hoặc backend riêng.',
    isHostAction: false,
    sdkCallSummary: 'const { token } = await sdk.requestMiniAppToken()',
    requestSchema: [
      {
        name: 'force',
        type: 'boolean',
        required: false,
        description: 'Bỏ qua cache token hiện tại trên Native và xin cấp mới',
        example: 'false',
      },
    ],
    validExample: { force: false },
    invalidExample: { force: 'yes' },
    responseOk: {
      success: true,
      token: 'vbt_ma_eyJhbGciOiJIUzI1NiJ9.demo',
      expires_in: 3600,
    },
    responseError: {
      success: false,
      error_code: 'TOKEN_EXPIRED_LOGOUT',
      message: 'Refresh token thất bại — phiên đăng nhập hết hạn',
    },
    ...findSpecHandler(
      'request_mini_app_token',
      'MiniAppService.getMiniAppToken(appId:)',
      'MiniAppHelper.requestMiniAppToken(appId)',
    ),
  },
  {
    method: 'request_module_token',
    category: 'auth',
    title: 'Lấy & làm mới Module Token (vbot / crm / ticket)',
    summary:
      'Xin token theo module. Khi API trả HTTP 401, gọi lại với force: true để Host chạy single-flight refresh token.',
    isHostAction: false,
    sdkCallSummary: "const res = await sdk.requestModuleToken({ module: 'crm', force: true })",
    requestSchema: [
      {
        name: 'module',
        type: 'string',
        required: true,
        description: 'Tên module backend (vbot | crm | ticket | autodial)',
        example: 'crm',
      },
      {
        name: 'force',
        type: 'boolean',
        required: false,
        description: 'true khi retry sau lỗi 401 Unauthorized',
        example: 'true',
      },
    ],
    validExample: { module: 'crm', force: false },
    invalidExample: { module: '', force: 'invalid' },
    responseOk: {
      success: true,
      module: 'crm',
      token: 'vbt_mod_crm_live_token',
      refreshed: false,
    },
    responseError: {
      success: false,
      error_code: 'REFRESH_TOKEN_FAILED',
      session_logout_triggered: true,
      message: 'Refresh token thất bại (Android tự kích hoạt logout 1 lần)',
    },
    ...findSpecHandler(
      'request_module_token',
      'MiniAppService.requestModuleToken(module:force:)',
      'MiniAppHelper.refreshModuleTokenSingleFlight(module, force)',
    ),
    parityNote: 'Khi refresh token thất bại (401), Android kích hoạt logout session 1 lần toàn app.',
  },
  {
    method: 'host_fetch',
    category: 'auth',
    title: 'Proxy HTTP qua Native Host (host_fetch)',
    summary:
      'Nhờ Host thực thi HTTP request với SSL pinning + token nội bộ. Host tự loại bỏ header Authorization nếu JS truyền lậu.',
    isHostAction: false,
    sdkCallSummary: "const res = await sdk.hostFetch('/crm/customers', { method: 'GET' })",
    requestSchema: [
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'Endpoint URL đầy đủ hoặc đường dẫn tương đối tới api_base_url',
        example: 'https://api-dev.vbot.vn/v1/customers',
      },
      {
        name: 'method',
        type: 'string',
        required: false,
        description: 'HTTP method (GET | POST | PUT | DELETE)',
        example: 'GET',
      },
      {
        name: 'headers',
        type: 'Record<string, string>',
        required: false,
        description: 'Headers tuỳ chỉnh (Host sẽ chặn và ghi đè Authorization)',
        example: '{ "X-Client": "miniapp" }',
      },
    ],
    validExample: {
      url: 'https://api-dev.vbot.vn/v1/customers?limit=20',
      method: 'GET',
      headers: { 'X-Source': 'mini-app' },
    },
    invalidExample: {
      url: 'https://api-dev.vbot.vn/v1/customers',
      method: 'GET',
      headers: { Authorization: 'Bearer spoofed_js_token' },
    },
    responseOk: {
      success: true,
      status: 200,
      data: { items: [{ id: 'CUS-101', name: 'Nguyễn Văn A' }] },
    },
    responseError: {
      success: false,
      error_code: 'INVALID_FETCH_URL',
      message: 'Thiếu hoặc sai định dạng URL',
    },
    ...findSpecHandler(
      'host_fetch',
      'VbMaNetworkProxy.execute(request:) — strip Authorization header',
      'MiniAppNetworkBridge.hostFetch(params) — ghi đè Bearer token Native',
    ),
    parityNote: 'Bảo mật: Header Authorization từ JS bị Native loại bỏ trước khi gửi đi.',
  },
  {
    method: 'check_permissions',
    category: 'auth',
    title: 'Kiểm tra quyền 2 tầng (manifest ∩ Role User)',
    summary:
      'Hỏi Host trạng thái quyền thực tế cho module & danh sách action dựa trên giao của manifest.json và phân quyền user hiện tại.',
    isHostAction: false,
    sdkCallSummary: "const grants = await sdk.checkPermissions('KHACH_HANG', ['XEM', 'TAO', 'HIEN_SO_DIEN_THOAI'])",
    requestSchema: [
      {
        name: 'module',
        type: 'PermissionModuleCode',
        required: true,
        description: 'Mã module quyền VBot (KHACH_HANG, CUOC_GOI, CHIEN_DICH, THANH_VIEN...)',
        example: 'KHACH_HANG',
      },
      {
        name: 'actions',
        type: 'string[]',
        required: true,
        description: 'Danh sách action cần kiểm tra',
        example: "['XEM', 'TAO', 'CHINH_SUA', 'XOA']",
      },
    ],
    validExample: {
      module: 'KHACH_HANG',
      actions: ['XEM', 'TAO', 'HIEN_SO_DIEN_THOAI'],
    },
    invalidExample: {
      module: 'UNKNOWN_MOD',
      actions: [],
    },
    responseOk: {
      module: 'KHACH_HANG',
      isAdmin: false,
      granted: { XEM: true, TAO: true, HIEN_SO_DIEN_THOAI: false },
    },
    ...findSpecHandler(
      'check_permissions',
      'VPMRoleManager.checkPermissions(appId:module:actions:)',
      'MiniAppPermissionEvaluator.evaluate(appId, module, actions)',
    ),
  },
  {
    method: 'get_supported_actions',
    category: 'calling',
    title: 'Lấy danh sách Host Actions hỗ trợ',
    summary: 'Kiểm tra app Host phiên bản hiện tại hỗ trợ những custom action nào trước khi gọi.',
    isHostAction: true,
    sdkCallSummary: "const res = await sendCustomAction('get_supported_actions', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: { unexpected: true },
    responseOk: {
      success: true,
      actions: [
        'make_call',
        'start_autodial',
        'pause_autodial',
        'resume_autodial',
        'stop_autodial',
        'get_autodial_state',
        'get_supported_actions',
        'get_session_info',
        'monitor_call',
      ],
    },
    iosHandler: 'VbMaViewController.handleRequestHostAction("get_supported_actions")',
    androidHandler: 'MiniAppHelper.dispatchHostAction("get_supported_actions")',
  },
  {
    method: 'get_session_info',
    category: 'calling',
    title: 'Lấy thông tin phiên Host hiện tại',
    summary: 'Trả về userId, projectCode, quyền Admin, trạng thái cuộc gọi/Autodial đang chạy trên Host.',
    isHostAction: true,
    sdkCallSummary: "const session = await sendCustomAction('get_session_info', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: {
      success: true,
      user_id: 'u_9812',
      project_code: 'vbot-demo',
      is_admin: false,
      platform: 'ios',
    },
    iosHandler: 'MiniAppService.getSessionInfo()',
    androidHandler: 'MiniAppHelper.buildSessionInfo()',
  },
  {
    method: 'make_call',
    category: 'calling',
    title: 'Thực hiện cuộc gọi ra qua VBot SIP (make_call)',
    summary:
      'Kích hoạt Host quay số SIP tới khách hàng. Nếu Android thiếu hotline (hoặc bật fault), Native mở sheet chọn hotline.',
    isHostAction: true,
    sdkCallSummary:
      "const res = await sendCustomAction('make_call', { phone: '0901234567', hotline: '02499998888', name: 'Nguyễn Văn A' })",
    requestSchema: [
      {
        name: 'phone',
        type: 'string',
        required: true,
        description: 'Số điện thoại đích cần gọi ra',
        example: '0901234567',
      },
      {
        name: 'hotline',
        type: 'string',
        required: false,
        description: 'Hotline gọi ra; bỏ trống trên Android sẽ bật ChooseHotlineCallBottomSheet',
        example: '02499998888',
      },
      {
        name: 'name',
        type: 'string',
        required: false,
        description: 'Tên khách hàng hiển thị trên màn hình CallKit / InCall UI',
        example: 'Nguyễn Văn A',
      },
    ],
    validExample: {
      phone: '0901234567',
      hotline: '02499998888',
      name: 'Nguyễn Văn A',
    },
    invalidExample: {
      phone: '',
      hotline: '02499998888',
    },
    responseOk: {
      success: true,
      call_id: 'call_demo_01',
      phone: '0901234567',
      hotline: '02499998888',
      state: 'ringing',
    },
    responseError: {
      success: false,
      error_code: 'USER_CANCELLED',
      reason: 'Người dùng huỷ chọn hotline trên BottomSheet Android',
    },
    iosHandler: 'MiniAppService.handleMakeCall() → Telephone.sharedInstance.startOutgoingCall()',
    androidHandler: 'MiniAppHelper.handleMakeCall() → ChooseHotlineCallBottomSheet / SIP Dial',
    parityNote: 'Android thiếu hotline sẽ mở ChooseHotlineCallBottomSheet và trả USER_CANCELLED nếu huỷ.',
  },
  {
    method: 'start_autodial',
    category: 'calling',
    title: 'Bắt đầu chiến dịch Autodial (start_autodial)',
    summary:
      'Khởi động AutodialManager trên Native với autoDialId và hotline. Native tự giữ kết nối WebSocket vbot.auto.dial và quay nối tiếp.',
    isHostAction: true,
    sdkCallSummary:
      "const res = await sendCustomAction('start_autodial', { autoDialId: 151, hotline: '02499998888', campaignName: 'CSKH Tháng 11' })",
    requestSchema: [
      {
        name: 'autoDialId',
        type: 'number',
        required: true,
        description: 'ID chiến dịch Autodial (> 0)',
        example: '151',
      },
      {
        name: 'hotline',
        type: 'string',
        required: true,
        description: 'Số hotline quay chiến dịch',
        example: '02499998888',
      },
      {
        name: 'campaignName',
        type: 'string',
        required: false,
        description: 'Tên chiến dịch hiển thị trên thanh trạng thái Native',
        example: 'CSKH Tháng 11',
      },
    ],
    validExample: {
      autoDialId: 151,
      hotline: '02499998888',
      campaignName: 'CSKH Tháng 11',
    },
    invalidExample: {
      autoDialId: 0,
      hotline: '',
    },
    responseOk: {
      success: true,
      state: 'running',
      autoDialId: 151,
      hotline: '02499998888',
    },
    responseError: {
      success: false,
      error_code: 'CALL_BUSY',
      message: 'Đang có cuộc gọi active — không thể khởi động Autodial',
    },
    iosHandler: 'AutodialManager.shared.start(autoDialId:hotline:campaignName:)',
    androidHandler: 'AutodialManager.start(context, autoDialId, hotline, campaignName)',
  },
  {
    method: 'pause_autodial',
    category: 'calling',
    title: 'Tạm dừng Autodial (pause_autodial)',
    summary: 'Tạm dừng quay số tiếp theo khi chiến dịch đang chạy (running → paused).',
    isHostAction: true,
    sdkCallSummary: "await sendCustomAction('pause_autodial', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: { force: 'invalid' },
    responseOk: { success: true, state: 'paused' },
    responseError: { success: false, error_code: 'INVALID_STATE', message: 'Autodial chưa ở trạng thái running' },
    iosHandler: 'AutodialManager.shared.pause()',
    androidHandler: 'AutodialManager.pause()',
  },
  {
    method: 'resume_autodial',
    category: 'calling',
    title: 'Tiếp tục Autodial (resume_autodial)',
    summary: 'Tiếp tục chiến dịch Autodial từ trạng thái paused (paused → running).',
    isHostAction: true,
    sdkCallSummary: "await sendCustomAction('resume_autodial', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: { success: true, state: 'running' },
    responseError: { success: false, error_code: 'INVALID_STATE', message: 'Autodial chưa ở trạng thái paused' },
    iosHandler: 'AutodialManager.shared.resume()',
    androidHandler: 'AutodialManager.resume()',
  },
  {
    method: 'stop_autodial',
    category: 'calling',
    title: 'Dừng hẳn Autodial (stop_autodial)',
    summary: 'Dừng chiến dịch Autodial, đóng WebSocket vbot.auto.dial và phát event autodial_finished về Mini App.',
    isHostAction: true,
    sdkCallSummary: "await sendCustomAction('stop_autodial', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: { success: true, state: 'stopped' },
    iosHandler: 'AutodialManager.shared.stop() + emit("autodial_finished")',
    androidHandler: 'AutodialManager.stop() + emitEvent("autodial_finished")',
  },
  {
    method: 'get_autodial_state',
    category: 'calling',
    title: 'Truy vấn trạng thái Autodial hiện tại',
    summary: 'Đồng bộ lại UI Mini App khi người dùng thoát ra rồi mở lại chiến dịch Autodial đang chạy nền.',
    isHostAction: true,
    sdkCallSummary: "const state = await sendCustomAction('get_autodial_state', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: {
      success: true,
      state: 'running',
      autoDialId: 151,
      dialedCount: 3,
      totalCount: 12,
    },
    iosHandler: 'AutodialManager.shared.currentStateSnapshot()',
    androidHandler: 'AutodialManager.getStateSnapshot()',
  },
  {
    method: 'monitor_call',
    category: 'calling',
    title: 'Giám sát cuộc gọi Live (monitor_call)',
    summary:
      'Gửi lệnh giám sát cuộc gọi đang diễn ra với các chế độ: 1 (Nghe lén), 2 (Cướp máy), 4 (Cướp bot), 5 (Nhắc thầm).',
    isHostAction: true,
    sdkCallSummary:
      "const res = await sendCustomAction('monitor_call', { call_id: 'call_live_77', mode: 1 })",
    requestSchema: [
      {
        name: 'call_id',
        type: 'string',
        required: true,
        description: 'ID cuộc gọi đang diễn ra từ API danh sách cuộc gọi live',
        example: 'call_live_77',
      },
      {
        name: 'mode',
        type: '1 | 2 | 4 | 5',
        required: true,
        description: '1=Listen, 2=Capture, 4=CaptureBot, 5=Whisper',
        example: '1',
      },
    ],
    validExample: { call_id: 'call_live_77', mode: 1 },
    invalidExample: { call_id: '', mode: 99 },
    responseOk: {
      success: true,
      call_id: 'call_live_77',
      mode: 1,
      mode_name: 'listen',
    },
    responseError: {
      success: false,
      error_code: 'INVALID_MONITOR_PARAMS',
      message: 'mode phải thuộc {1, 2, 4, 5} và call_id không được rỗng',
    },
    iosHandler: 'MonitorCallBridgeHandler → emit monitor_call_state_changed',
    androidHandler: 'MiniAppHelper.onMonitorCall() → Native PiP + sendMonitorCallStateChanged (emit monitor_call_state_changed)',
    parityNote: 'Cả iOS và Android đều phát monitor_call_state_changed (ACTIVE / DISCONNECTED) về JS; Android hiển thị thêm Native PiP UI.',
  },
  {
    method: 'user_contact_get_local',
    category: 'contacts',
    title: 'Đọc danh bạ lưu cục bộ (SQLite Host)',
    summary: 'Lấy danh sách danh bạ đã đồng bộ sẵn trong SQLite/CoreData của Host App.',
    isHostAction: true,
    sdkCallSummary: "const res = await sendCustomAction('user_contact_get_local', { limit: 20 })",
    requestSchema: [
      {
        name: 'limit',
        type: 'number',
        required: false,
        description: 'Số bản ghi tối đa cần trả về',
        example: '20',
      },
    ],
    validExample: { limit: 20 },
    invalidExample: { limit: -5 },
    responseOk: {
      success: true,
      total: 18,
      permission_status: 'granted',
      contacts: [{ id: 'c_01', name: 'Trần Minh Tâm', phone: '0912345678' }],
    },
    iosHandler: 'UserContactBridge.getLocalContacts()',
    androidHandler: 'UserContactDatabase.getAll()',
  },
  {
    method: 'user_contact_refresh_server',
    category: 'contacts',
    title: 'Đồng bộ lại danh bạ từ Server VBot',
    summary: 'Kích hoạt Host kéo danh bạ mới nhất từ server về SQLite và phát sự kiện user_contacts_updated.',
    isHostAction: true,
    sdkCallSummary: "await sendCustomAction('user_contact_refresh_server', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: { success: true, synced: 24 },
    iosHandler: 'UserContactSyncService.syncFromServer() → emit user_contacts_updated',
    androidHandler: 'ContactRepository.refreshFromServer() → emit user_contacts_updated',
  },
  {
    method: 'user_contact_import_device',
    category: 'contacts',
    title: 'Nhập danh bạ từ Thiết bị OS (iOS/Android)',
    summary: 'Đọc danh bạ điện thoại hệ thống. Trên iOS 18+ có thể trả trạng thái limited (người dùng chỉ cấp vài số).',
    isHostAction: true,
    sdkCallSummary: "const res = await sendCustomAction('user_contact_import_device', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: { success: true, imported: 5, permission_status: 'granted' },
    iosHandler: 'CNContactStore → xử lý cả .authorized và .limited (iOS 18+)',
    androidHandler: 'ContactsContract + check READ_CONTACTS permission',
    parityNote: 'iOS 18+ có quyền limited (CNAuthorizationStatus.limited); Android dùng hasPromptedReadContacts.',
  },
  {
    method: 'user_contact_delete_local',
    category: 'contacts',
    title: 'Xoá dữ liệu danh bạ cục bộ',
    summary: 'Xoá một hoặc toàn bộ danh bạ cache cục bộ trên Host.',
    isHostAction: true,
    sdkCallSummary: "await sendCustomAction('user_contact_delete_local', { delete_all: false, contact_id: 'c_01' })",
    requestSchema: [
      {
        name: 'contact_id',
        type: 'string',
        required: false,
        description: 'ID danh bạ cần xoá (bỏ trống nếu delete_all=true)',
        example: 'c_01',
      },
      {
        name: 'delete_all',
        type: 'boolean',
        required: false,
        description: 'Xoá toàn bộ cache local',
        example: 'false',
      },
    ],
    validExample: { contact_id: 'c_01', delete_all: false },
    invalidExample: {},
    responseOk: { success: true, remaining: 17 },
    iosHandler: 'UserContactBridge.deleteLocalContact()',
    androidHandler: 'UserContactDatabase.delete()',
  },
  {
    method: 'user_contact_open_settings',
    category: 'contacts',
    title: 'Mở Cài đặt quyền Danh bạ của OS',
    summary: 'Điều hướng người dùng ra Settings hệ thống để cấp quyền Contacts khi bị từ chối hoặc ở trạng thái limited.',
    isHostAction: true,
    sdkCallSummary: "await sendCustomAction('user_contact_open_settings', {})",
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: { success: true, opened_os_settings: true },
    iosHandler: 'UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)',
    androidHandler: 'startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS))',
  },
  {
    method: 'open_mini_app',
    category: 'navigation',
    title: 'Mở Mini App con & truyền vbma_extra_data',
    summary:
      'Mở một Mini App khác xếp chồng lên Stack của Host và truyền payload qua vbma_extra_data trong Launch Params của app con.',
    isHostAction: false,
    sdkCallSummary:
      "await sdk.openMiniApp('vb-ma-activity-history', { customerId: 'CUS-1042', phone: '0901234567' })",
    requestSchema: [
      {
        name: 'app_id',
        type: 'string',
        required: true,
        description: 'Mini App ID đích cần mở (ví dụ: vb-ma-activity-history)',
        example: 'vb-ma-activity-history',
      },
      {
        name: 'extra_data',
        type: 'Record<string, unknown>',
        required: false,
        description: 'Dữ liệu ngữ cảnh truyền sang app con qua vbma_extra_data',
        example: '{ "customerId": "CUS-1042" }',
      },
    ],
    validExample: {
      app_id: 'vb-ma-activity-history',
      extra_data: { customerId: 'CUS-1042', phone: '0901234567' },
    },
    invalidExample: { app_id: '' },
    responseOk: {
      success: true,
      opened_app_id: 'vb-ma-activity-history',
    },
    responseError: {
      success: false,
      error_code: 'MISSING_APP_ID',
      message: 'Thiếu app_id để mở Mini App con',
    },
    iosHandler: 'VbMaCoordinator.presentMiniApp(appId:extraData:)',
    androidHandler: 'MiniAppActivity.launchChild(appId, extraData)',
  },
  {
    method: 'setup_closing_behavior',
    category: 'ui',
    title: 'Bật/Tắt xác nhận trước khi đóng Mini App',
    summary: 'Yêu cầu Host hỏi xác nhận người dùng khi bấm nút Đóng Native nếu form đang nhập dở.',
    isHostAction: false,
    sdkCallSummary: 'await sdk.setupClosingBehavior({ need_confirm: true })',
    requestSchema: [
      {
        name: 'need_confirm',
        type: 'boolean',
        required: true,
        description: 'true để Host hiện modal xác nhận khi bấm X',
        example: 'true',
      },
    ],
    validExample: { need_confirm: true },
    invalidExample: {},
    responseOk: { success: true, closingConfirmation: true },
    iosHandler: 'VbMaViewController.isClosingConfirmationEnabled = needConfirm',
    androidHandler: 'MiniAppActivity.setClosingConfirmation(needConfirm)',
  },
  {
    method: 'expand',
    category: 'ui',
    title: 'Mở rộng WebView toàn màn hình (expand)',
    summary: 'Mở rộng Mini App từ bottom-sheet lên toàn màn hình.',
    isHostAction: false,
    sdkCallSummary: 'await sdk.expand()',
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: { success: true, is_expanded: true, viewport_height: 760 },
    iosHandler: 'VbMaSheetController.expandToFull()',
    androidHandler: 'BottomSheetBehavior.STATE_EXPANDED',
  },
  {
    method: 'close',
    category: 'lifecycle',
    title: 'Đóng Mini App & trả dữ liệu về App cha (close)',
    summary:
      'Đóng Mini App hiện tại. Nếu là app con, payload data sẽ được Host đẩy lại cho app cha qua sự kiện mini_app_closed.',
    isHostAction: false,
    sdkCallSummary: "await sdk.close({ status: 'success', updated: true })",
    requestSchema: [
      {
        name: 'data',
        type: 'Record<string, unknown>',
        required: false,
        description: 'Dữ liệu kết quả gửi trả app cha khi đóng',
        example: '{ "updated": true }',
      },
    ],
    validExample: { data: { status: 'success', updated: true } },
    invalidExample: {},
    responseOk: { success: true, closed: true },
    iosHandler: 'VbMaViewController.dismiss() + sendEvent("mini_app_closed")',
    androidHandler: 'MiniAppActivity.finishWithResult(data)',
  },
  {
    method: 'open_link',
    category: 'navigation',
    title: 'Mở liên kết ngoài bằng trình duyệt OS (open_link)',
    summary: 'Mở URL bằng Safari/Chrome mặc định ngoài app.',
    isHostAction: false,
    sdkCallSummary: "await sdk.openLink('https://vbot.vn/docs')",
    requestSchema: [
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'URL http/https hợp lệ',
        example: 'https://vbot.vn/docs',
      },
    ],
    validExample: { url: 'https://vbot.vn/docs' },
    invalidExample: { url: 'javascript:alert(1)' },
    responseOk: { success: true, url: 'https://vbot.vn/docs' },
    responseError: { success: false, error_code: 'INVALID_URL' },
    iosHandler: 'UIApplication.shared.open(url)',
    androidHandler: 'Intent(Intent.ACTION_VIEW, Uri.parse(url))',
  },
  {
    method: 'open_vb_link',
    category: 'navigation',
    title: 'Mở liên kết trong In-App Browser VBot (open_vb_link)',
    summary: 'Mở URL bằng WebView / SFSafariViewController / CustomTabs trong app VBot.',
    isHostAction: false,
    sdkCallSummary: "await sdk.openVbLink('https://vbot.vn/huong-dan')",
    requestSchema: [
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'URL http/https cần mở trong app',
        example: 'https://vbot.vn/huong-dan',
      },
    ],
    validExample: { url: 'https://vbot.vn/huong-dan' },
    invalidExample: { url: '' },
    responseOk: { success: true, mode: 'in_app_webview', url: 'https://vbot.vn/huong-dan' },
    iosHandler: 'SFSafariViewController(url:)',
    androidHandler: 'CustomTabsIntent.launchUrl()',
  },
  {
    method: 'trigger_haptic',
    category: 'ui',
    title: 'Rung phản hồi vật lý (trigger_haptic)',
    summary: 'Kích hoạt rung nhẹ/thông báo qua Taptic Engine / Vibrator.',
    isHostAction: false,
    sdkCallSummary: "sdk.triggerHaptic('impact_medium')",
    requestSchema: [
      {
        name: 'style',
        type: 'string',
        required: false,
        description: 'impact_light | impact_medium | impact_heavy | notification_success',
        example: 'impact_medium',
      },
    ],
    validExample: { style: 'impact_medium' },
    invalidExample: { style: 999 },
    responseOk: { success: true, style: 'impact_medium' },
    iosHandler: 'UIImpactFeedbackGenerator.impactOccurred()',
    androidHandler: 'View.performHapticFeedback()',
  },
  {
    method: 'show_toast',
    category: 'ui',
    title: 'Hiển thị Native Toast (chỉ Android)',
    summary: 'Hiển thị Android Toast ngắn hạn. Cảnh báo: Host iOS hiện chưa implement lệnh này.',
    isHostAction: false,
    sdkCallSummary: "sdk.showToast({ message: 'Đã lưu dữ liệu', type: 'success' })",
    requestSchema: [
      {
        name: 'message',
        type: 'string',
        required: true,
        description: 'Nội dung thông báo',
        example: 'Đã lưu thành công',
      },
      {
        name: 'type',
        type: 'info | success | error',
        required: false,
        description: 'Loại thông báo',
        example: 'success',
      },
    ],
    validExample: { message: 'Đã lưu thay đổi', type: 'success' },
    invalidExample: { message: '' },
    responseOk: { success: true, platform: 'android', message: 'Đã lưu thay đổi' },
    responseError: {
      success: false,
      error_code: 'UNSUPPORTED_ON_IOS',
      message: 'Host iOS hiện chưa hỗ trợ show_toast — cần tự render toast UI trong Mini App Web.',
    },
    iosHandler: 'Chưa hỗ trợ (log warning UNSUPPORTED_ON_IOS)',
    androidHandler: 'MiniAppHelper.handleShowToast() → Toast.makeText(...).show()',
    parityNote: 'Lệch Parity quan trọng: chỉ Android có show_toast; Mini App nên tự có web Toast fallback trên iOS.',
  },
  {
    method: 'request_theme',
    category: 'ui',
    title: 'Hỏi cấu hình giao diện Sáng/Tối (request_theme)',
    summary: 'Lấy bảng màu hiện tại từ Host App để đồng bộ Dark/Light mode.',
    isHostAction: false,
    sdkCallSummary: 'const theme = await sdk.requestTheme()',
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: {
      theme: 'dark',
      theme_params: { bg_color: '#0f172a', text_color: '#f8fafc', button_color: '#06b6d4' },
    },
    iosHandler: 'VbMaThemeProvider.currentThemeParams()',
    androidHandler: 'MiniAppThemeHelper.getThemeParams()',
    parityNote: 'Android vb-ma-android-sdk (MiniAppRenderer.getThemeParams + VbMABridge.handleRequestTheme) tự động trả về bảng màu theo uiMode; iOS khóa Light mode toàn cục.',
  },
  {
    method: 'request_viewport',
    category: 'ui',
    title: 'Hỏi kích thước khung hiển thị (request_viewport)',
    summary: 'Trả về chiều rộng, chiều cao và trạng thái mở rộng hiện tại của WebView.',
    isHostAction: false,
    sdkCallSummary: 'const vp = await sdk.requestViewport()',
    requestSchema: [],
    validExample: {},
    invalidExample: {},
    responseOk: { height: 760, width: 390, is_expanded: true },
    iosHandler: 'webView.bounds.size',
    androidHandler: 'webView.width / height',
  },
];

const COMMAND_BY_METHOD = new Map<string, ContractCommandSpec>(
  ALL_SANDBOX_COMMANDS.map((cmd) => [cmd.method, cmd]),
);

const PUSH_EVENTS_CATALOG: Record<string, ContractEventSpec> = {
  theme_changed: {
    eventName: 'theme_changed',
    source: 'host_push',
    title: 'Giao diện Host đổi Sáng ↔ Tối',
    summary: 'Host chủ động đẩy khi user chuyển Dark/Light mode trong OS hoặc app.',
    payloadSchema: [
      { name: 'theme', type: "'dark' | 'light'", required: true, description: 'Chế độ giao diện mới' },
      { name: 'theme_params', type: 'object', required: true, description: 'Bảng màu HEX đồng bộ với Host' },
    ],
    samplePayload: {
      theme: 'dark',
      theme_params: { bg_color: '#0f172a', text_color: '#f8fafc', button_color: '#06b6d4' },
    },
    parityNote: 'Android vb-ma-android-sdk tự phát theme_changed khi ready và khi onConfigurationChanged; iOS khóa Light mode toàn cục.',
  },
  refresh_data: {
    eventName: 'refresh_data',
    source: 'host_push',
    title: 'Yêu cầu Mini App tải lại dữ liệu',
    summary: 'Host đẩy xuống khi người dùng kéo làm mới (pull-to-refresh) hoặc chuyển tab ngoài shell native.',
    payloadSchema: [
      { name: 'reason', type: 'string', required: false, description: 'Nguồn kích hoạt refresh' },
      { name: 'timestamp', type: 'number', required: true, description: 'Unix timestamp ms' },
    ],
    samplePayload: { reason: 'native_tab_resumed', timestamp: 1763605000000 },
  },
  filter_changed: {
    eventName: 'filter_changed',
    source: 'host_push',
    title: 'Đổi bộ lọc Tất cả / Gọi nhỡ (History Call)',
    summary: 'Thanh segmented control trên header Native của màn Lịch sử cuộc gọi gửi bộ lọc xuống Mini App.',
    payloadSchema: [
      { name: 'filter', type: "'all' | 'missed'", required: true, description: 'Bộ lọc đang chọn trên header native' },
    ],
    samplePayload: { filter: 'missed' },
  },
  autodial_finished: {
    eventName: 'autodial_finished',
    source: 'host_push',
    title: 'Chiến dịch Autodial hoàn tất / đã dừng',
    summary: 'Host báo về JS ngay khi AutodialManager hết danh sách hoặc bị stop_autodial.',
    payloadSchema: [
      { name: 'autoDialId', type: 'number', required: true, description: 'ID chiến dịch Autodial' },
      { name: 'reason', type: 'string', required: true, description: 'completed | stopped_by_user' },
      { name: 'dialed_count', type: 'number', required: true, description: 'Số cuộc gọi đã quay' },
    ],
    samplePayload: { autoDialId: 151, reason: 'completed', dialed_count: 12 },
  },
  autodial_error: {
    eventName: 'autodial_error',
    source: 'host_push',
    title: 'Lỗi runtime Autodial (WS / SIP)',
    summary: 'AutodialManager phát hiện lỗi mất socket hoặc lỗi SIP khi đang chạy nền.',
    payloadSchema: [
      { name: 'code', type: 'string', required: true, description: 'Mã lỗi từ Native' },
      { name: 'message', type: 'string', required: true, description: 'Mô tả chi tiết lỗi' },
    ],
    samplePayload: { code: 'WS_DISCONNECTED', message: 'Mất kết nối WebSocket vbot.auto.dial quá 3 lần thử' },
  },
  monitor_call_state_changed: {
    eventName: 'monitor_call_state_changed',
    source: 'host_push',
    title: 'Trạng thái giám sát cuộc gọi thay đổi',
    summary: 'Host iOS & Android báo khi cuộc gọi giám sát chuyển trạng thái ACTIVE hoặc DISCONNECTED (kèm reason).',
    payloadSchema: [
      { name: 'call_id', type: 'string', required: true, description: 'ID cuộc gọi' },
      { name: 'mode', type: 'number', required: true, description: '1=Listen, 2=Capture, 4=CaptureBot, 5=Whisper' },
      { name: 'state', type: 'string', required: true, description: 'monitoring | ended' },
    ],
    samplePayload: { call_id: 'call_live_77', mode: 1, state: 'monitoring' },
    parityNote: 'Cả Host iOS (MiniAppService) và Android (MiniAppHelper) đều phát event này; Android đồng thời cập nhật PiP overlay native.',
  },
  user_contacts_updated: {
    eventName: 'user_contacts_updated',
    source: 'host_push',
    title: 'Danh bạ local đã cập nhật',
    summary: 'Host thông báo Mini App Danh bạ cá nhân đọc lại danh sách mới từ SQLite.',
    payloadSchema: [
      { name: 'source', type: 'string', required: true, description: 'server_refresh | device_import | local_delete' },
      { name: 'total', type: 'number', required: true, description: 'Tổng số liên hệ hiện có' },
    ],
    samplePayload: { source: 'server_refresh', total: 24 },
  },
  toggle_actions_menu: {
    eventName: 'toggle_actions_menu',
    source: 'host_push',
    title: 'Bật/Tắt menu thao tác danh bạ (+)',
    summary: 'Host đẩy xuống khi người dùng chạm nút + trên thanh điều hướng native của Tab Danh bạ cá nhân.',
    payloadSchema: [
      { name: 'visible', type: 'boolean', required: false, description: 'Trạng thái mong muốn (nếu có)' },
    ],
    samplePayload: { visible: true },
  },
  setup_2fa: {
    eventName: 'setup_2fa',
    source: 'host_push',
    title: 'Đồng bộ trạng thái 2FA từ WebSocket Server',
    summary: 'Host dedup WebSocket SETUP_2FA trong 1000ms rồi đẩy xuống vb-ma-2fa-setting.',
    payloadSchema: [
      { name: 'is_enable', type: 'boolean', required: true, description: 'Trạng thái bật/tắt 2FA mới nhất' },
      { name: 'timestamp', type: 'number', required: true, description: 'Thời điểm nhận socket' },
    ],
    samplePayload: { is_enable: true, timestamp: 1763605000000 },
    parityNote: 'Cả iOS và Android đều lọc đúng appId qua MiniAppActiveTracker + emitEventIfMiniAppOpen trước khi đẩy setup_2fa.',
  },
  mini_app_closed: {
    eventName: 'mini_app_closed',
    source: 'host_push',
    title: 'Mini App con vừa đóng và trả dữ liệu',
    summary: 'Host chuyển tiếp payload từ lệnh close({ data }) của app con về cho app cha.',
    payloadSchema: [
      { name: 'app_id', type: 'string', required: true, description: 'ID của Mini App con vừa đóng' },
      { name: 'data', type: 'Record<string, unknown>', required: false, description: 'Payload kết quả từ app con' },
    ],
    samplePayload: { app_id: 'vb-ma-activity-history', data: { status: 'success', updated: true } },
  },
  mini_app_error: {
    eventName: 'mini_app_error',
    source: 'host_push',
    title: 'Cảnh báo lỗi vòng đời từ Native Host',
    summary: 'Host đẩy xuống khi có lỗi giải mã launch params hoặc lỗi bridge nội bộ.',
    payloadSchema: [
      { name: 'code', type: 'string', required: true, description: 'Mã lỗi' },
      { name: 'message', type: 'string', required: true, description: 'Chi tiết lỗi' },
    ],
    samplePayload: { code: 'BRIDGE_WARNING', message: 'Một hành động mất nhiều thời gian phản hồi' },
  },
  back_button_pressed: {
    eventName: 'back_button_pressed',
    source: 'host_push',
    title: 'Người dùng bấm nút Quay lại (Native Back)',
    summary:
      'Host đẩy xuống khi người dùng bấm nút Back hệ thống / thanh tiêu đề để Mini App đóng sheet/dialog theo thứ tự trước khi gọi close().',
    payloadSchema: [],
    samplePayload: {},
  },
};

const BASE_CORE_METHODS = [
  'ready',
  'request_mini_app_token',
  'request_module_token',
  'host_fetch',
  'check_permissions',
  'setup_closing_behavior',
  'expand',
  'close',
  'open_link',
  'open_vb_link',
  'trigger_haptic',
  'show_toast',
  'request_theme',
  'request_viewport',
];

function resolveAppCommandMethods(app: MiniAppCatalogEntry): string[] {
  const methods = new Set<string>(BASE_CORE_METHODS);

  if (app.id === 'vb-ma-autodial') {
    for (const m of [
      'get_supported_actions',
      'get_session_info',
      'make_call',
      'start_autodial',
      'pause_autodial',
      'resume_autodial',
      'stop_autodial',
      'get_autodial_state',
    ]) {
      methods.add(m);
    }
  } else if (app.id === 'vb-ma-monitoring') {
    methods.add('monitor_call');
    methods.add('get_supported_actions');
    methods.add('get_session_info');
  } else if (app.id === 'vb-ma-user-contact') {
    for (const m of [
      'user_contact_get_local',
      'user_contact_refresh_server',
      'user_contact_import_device',
      'user_contact_delete_local',
      'user_contact_open_settings',
    ]) {
      methods.add(m);
    }
  }

  for (const act of app.customActions ?? []) {
    if (COMMAND_BY_METHOD.has(act)) {
      methods.add(act);
    }
  }

  if (app.placement !== 'child_app') {
    if (['vb-ma-crm', 'vb-ma-crm-v2', 'vb-ma-ticket', 'vb-ma-contact-forward'].includes(app.id)) {
      methods.add('open_mini_app');
    }
  }

  return Array.from(methods);
}

function resolveAppIncomingEvents(app: MiniAppCatalogEntry): ContractEventSpec[] {
  const names = new Set<string>(['theme_changed', 'refresh_data', 'mini_app_closed', 'mini_app_error']);

  if (app.id === 'vb-ma-autodial') {
    names.add('autodial_finished');
    names.add('autodial_error');
  } else if (app.id === 'vb-ma-monitoring') {
    names.add('monitor_call_state_changed');
  } else if (app.id === 'vb-ma-user-contact') {
    names.add('user_contacts_updated');
    names.add('toggle_actions_menu');
  } else if (app.id === 'vb-ma-user-history-call') {
    names.add('filter_changed');
  } else if (app.id === 'vb-ma-2fa-setting') {
    names.add('setup_2fa');
  } else if (app.id === 'vb-ma-work-schedule') {
    names.add('back_button_pressed');
  }

  return Array.from(names)
    .map((name) => PUSH_EVENTS_CATALOG[name])
    .filter((item): item is ContractEventSpec => Boolean(item));
}

function buildLaunchParamsForApp(app: MiniAppCatalogEntry): LaunchParamFieldSpec[] {
  const fields: LaunchParamFieldSpec[] = [
    {
      key: '#vbma_data',
      sourceField: 'URL Fragment (JSON Base64 / URL-encoded)',
      required: true,
      type: 'LaunchInitData',
      description: 'Chứa user_id, project_code, app_id, platform, is_admin, language.',
      exampleValue: `{"user_id":"u_9812","project_code":"vbot-demo","app_id":"${app.id}"}`,
    },
    {
      key: '#vbma_theme',
      sourceField: 'theme & theme_params',
      required: true,
      type: "'dark' | 'light' + ThemeParams",
      description: 'Cấu hình màu nền, màu chữ, màu nút chủ đạo của Host lúc mở Mini App.',
      exampleValue: 'dark',
    },
    {
      key: '#vbma_api_base_url',
      sourceField: 'api_base_url',
      required: true,
      type: 'string',
      description: 'Base URL môi trường hiện tại (Dev/Staging/Prod) từ Host App.',
      exampleValue: 'https://api-dev.vbot.vn/v1',
    },
    {
      key: '#vbma_extra_data',
      sourceField: 'extra_data',
      required: false,
      type: 'Record<string, unknown>',
      description:
        app.placement === 'child_app'
          ? 'Payload ngữ cảnh bắt buộc do app cha truyền sang qua open_mini_app(appId, extraData).'
          : 'Ngữ cảnh tuỳ chọn khi mở từ deep link hoặc Mini App khác.',
      exampleValue:
        app.placement === 'child_app'
          ? '{"customerId":"CUS-1042","phone":"0901234567"}'
          : '{}',
    },
  ];
  return fields;
}

export function buildMiniAppContract(appId: string): MiniAppContract {
  const app = MINI_APP_CATALOG.find((item) => item.id === appId) ?? MINI_APP_CATALOG[0];
  const commandMethods = resolveAppCommandMethods(app);
  const outgoingCommands = commandMethods
    .map((m) => COMMAND_BY_METHOD.get(m))
    .filter((cmd): cmd is ContractCommandSpec => Boolean(cmd));

  const permissionProfile = MINI_APP_PERMISSION_PROFILES[app.id];
  const manifestPermissionsJson = buildManifestPermissionsJson(app.id);

  const parityAlerts = BRIDGE_PARITY_ALERTS.filter((alert) => {
    if (app.simulatorFlowId && alert.simulatorFlowId === app.simulatorFlowId) return true;
    const text = `${alert.scope} ${alert.title} ${alert.recommendationForMiniApp}`.toLowerCase();
    return text.includes(app.id.replace('vb-ma-', '')) || text.includes(app.id);
  });

  const launchNotes: string[] = [
    `Host truyền toàn bộ dữ liệu khởi tạo qua URL Fragment (#vbma_data=...&vbma_api_base_url=...) ngay lúc nạp WebView.`,
    `Tầng 1 (Hiển thị): iOS [${app.iosPermissionRule}] · Android [${app.androidPermissionRule}].`,
  ];
  if (app.parityNote) {
    launchNotes.push(`Lưu ý Parity: ${app.parityNote}`);
  }

  return {
    app,
    isFeatured: FEATURED_STUDIO_APP_IDS.includes(app.id),
    launchParams: buildLaunchParamsForApp(app),
    launchNotes,
    incomingEvents: resolveAppIncomingEvents(app),
    outgoingCommands,
    allAvailableCommands: ALL_SANDBOX_COMMANDS,
    permissionProfile,
    parityAlerts,
    manifestPermissionsJson,
  };
}

export function buildCommandSdkSnippet(
  method: string,
  payload: Record<string, unknown>,
  isHostAction: boolean,
): string {
  const jsonPayload = JSON.stringify(payload, null, 2);

  if (isHostAction) {
    return [
      `import { postEvent, onEvent } from '@vbotma/sdk';`,
      ``,
      `const requestId = \`req-\${Date.now()}\`;`,
      ``,
      `// 1. Lắng nghe kết quả Native trả về theo request_id`,
      `const offResult = onEvent('host_action_result', (res) => {`,
      `  if (res.request_id !== requestId) return;`,
      `  offResult();`,
      `  if (!res.success) {`,
      `    console.error('[${method}] Lỗi từ Host:', res.error_code ?? res.reason);`,
      `    return;`,
      `  }`,
      `  console.log('[${method}] Kết quả:', res);`,
      `});`,
      ``,
      `// 2. Gửi yêu cầu Host Action lên Native`,
      `postEvent('request_host_action', {`,
      `  request_id: requestId,`,
      `  action: '${method}',`,
      `  payload: ${jsonPayload.replace(/\n/g, '\n  ')},`,
      `});`,
    ].join('\n');
  }

  switch (method) {
    case 'ready':
      return `import { ready } from '@vbotma/sdk';\n\n// Gọi ngay sau khi gắn xong các onEvent listener\nawait ready();`;
    case 'close':
      return `import { close } from '@vbotma/sdk';\n\nawait close(${jsonPayload});`;
    case 'expand':
      return `import { expand } from '@vbotma/sdk';\n\nawait expand();`;
    case 'setup_closing_behavior':
      return `import { setupClosingBehavior } from '@vbotma/sdk';\n\nawait setupClosingBehavior(${jsonPayload});`;
    case 'request_mini_app_token':
      return `import { requestMiniAppToken } from '@vbotma/sdk';\n\nconst { token } = await requestMiniAppToken();`;
    case 'request_module_token':
      return `import { requestModuleToken } from '@vbotma/sdk';\n\nconst { token } = await requestModuleToken(${jsonPayload});`;
    case 'host_fetch':
      return `import { hostFetch } from '@vbotma/sdk';\n\n// Lưu ý: Không cần truyền header Authorization — Host tự gắn Token an toàn\nconst res = await hostFetch(${jsonPayload});`;
    case 'check_permissions':
      return `import { checkPermissions } from '@vbotma/sdk';\n\nconst granted = await checkPermissions(${jsonPayload});`;
    case 'open_mini_app':
      return `import { openMiniApp } from '@vbotma/sdk';\n\nawait openMiniApp(${jsonPayload});`;
    case 'open_link':
      return `import { openLink } from '@vbotma/sdk';\n\nawait openLink(${jsonPayload});`;
    case 'open_vb_link':
      return `import { openVbLink } from '@vbotma/sdk';\n\nawait openVbLink(${jsonPayload});`;
    case 'show_toast':
      return `import { showToast } from '@vbotma/sdk';\n\n// Lưu ý Parity: iOS chưa hỗ trợ show_toast — cần fallback Toast trên Web\nshowToast(${jsonPayload});`;
    default:
      return `import { postEvent } from '@vbotma/sdk';\n\npostEvent('${method}', ${jsonPayload});`;
  }
}

export function buildStarterSdkCode(contract: MiniAppContract): string {
  const { app, incomingEvents, outgoingCommands, permissionProfile } = contract;
  const hostActions = outgoingCommands.filter((c) => c.isHostAction);
  const hasCaps = (permissionProfile?.manifestCapabilities.length ?? 0) > 0;
  const firstCap = permissionProfile?.manifestCapabilities[0];

  const lines: string[] = [
    `/**`,
    ` * Starter Integration cho Mini App: ${app.nameVi} (${app.id})`,
    ` * Tự động sinh từ VBot Dev Studio Contract`,
    ` */`,
    `import {`,
    `  ready,`,
    `  onEvent,`,
    `  requestMiniAppToken,`,
    hasCaps ? `  checkPermissions,` : `  isAdmin,`,
    hostActions.length > 0 ? `  postEvent,` : `  requestTheme,`,
    `} from '@vbotma/sdk';`,
    ``,
    `// 1. Đọc Launch Params Host truyền qua URL Hash (#vbma_data=...)`,
    `export function parseVBotLaunchHash() {`,
    `  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));`,
    `  const rawData = params.get('vbma_data');`,
    `  return {`,
    `    launchData: rawData ? JSON.parse(decodeURIComponent(rawData)) : null,`,
    `    theme: params.get('vbma_theme') ?? 'light',`,
    `    apiBaseUrl: params.get('vbma_api_base_url') ?? '',`,
    `    extraData: params.get('vbma_extra_data') ? JSON.parse(decodeURIComponent(params.get('vbma_extra_data')!)) : {},`,
    `  };`,
    `}`,
    ``,
    `// 2. Đăng ký nhận sự kiện Host đẩy xuống TRƯỚC khi gọi ready()`,
    `export function bootstrapMiniApp() {`,
    `  const launch = parseVBotLaunchHash();`,
    `  console.log('[${app.id}] Khởi tạo từ Host:', launch);`,
    ``,
  ];

  for (const evt of incomingEvents) {
    lines.push(`  onEvent('${evt.eventName}', (payload) => {`);
    lines.push(`    console.log('[Host Push → ${evt.eventName}]', payload);`);
    lines.push(`  });`);
  }

  lines.push(``);
  lines.push(`  // Báo Host WebView sẵn sàng nhận sự kiện`);
  lines.push(`  ready().then(async () => {`);
  lines.push(`    const { token } = await requestMiniAppToken();`);

  if (hasCaps && firstCap) {
    const actionsList = firstCap.actions.length > 0 ? firstCap.actions : ['XEM'];
    lines.push(
      `    const grants = await checkPermissions('${firstCap.module}', ${JSON.stringify(actionsList)});`,
    );
    lines.push(`    console.log('Token & Grants:', { hasToken: Boolean(token), grants });`);
  } else {
    lines.push(`    console.log('Token & isAdmin:', { hasToken: Boolean(token), admin: isAdmin() });`);
  }
  lines.push(`  });`);
  lines.push(`}`);

  if (hostActions.length > 0) {
    lines.push(``);
    lines.push(`// 3. Helper gọi Host Actions đặc thù cho ${app.id}`);
    lines.push(
      `export function callHostAction(action: string, payload: Record<string, unknown> = {}) {`,
    );
    lines.push(`  return new Promise((resolve, reject) => {`);
    lines.push(`    const requestId = \`req-\${Date.now()}-\${Math.random().toString(16).slice(2, 6)}\`;`);
    lines.push(`    const timer = setTimeout(() => {`);
    lines.push(`      off();`);
    lines.push(`      reject(new Error(\`Host action \${action} timeout sau 5000ms\`));`);
    lines.push(`    }, 5000);`);
    lines.push(`    const off = onEvent('host_action_result', (res) => {`);
    lines.push(`      if (res.request_id !== requestId) return;`);
    lines.push(`      clearTimeout(timer);`);
    lines.push(`      off();`);
    lines.push(`      res.success ? resolve(res) : reject(res);`);
    lines.push(`    });`);
    lines.push(`    postEvent('request_host_action', { request_id: requestId, action, payload });`);
    lines.push(`  });`);
    lines.push(`}`);
  }

  return lines.join('\n');
}

export function exportAppIntegrationMarkdown(contract: MiniAppContract): string {
  const { app, launchParams, incomingEvents, outgoingCommands, parityAlerts, manifestPermissionsJson } = contract;
  const sections: string[] = [
    `# Spec Tích Hợp Mini App: ${app.nameVi} (\`${app.id}\`)`,
    ``,
    `- **Tên tiếng Anh:** ${app.nameEn}`,
    `- **Nhóm:** ${app.category} · **Vị trí hiển thị:** \`${app.placement}\``,
    `- **Phân quyền tầng 1:** iOS (${app.iosPermissionRule}) | Android (${app.androidPermissionRule})`,
    ``,
    `## 1. Host → Mini App (Dữ liệu Host truyền khi khởi tạo Launch Params)`,
    ``,
    `| Tham số URL Hash | Bắt buộc | Kiểu dữ liệu | Mô tả |`,
    `| --- | :---: | --- | --- |`,
    ...launchParams.map(
      (lp) =>
        `| \`${lp.key}\` | ${lp.required ? 'Có' : 'Tuỳ chọn'} | \`${lp.type}\` | ${lp.description}${lp.parityNote ? ` (**Parity:** ${lp.parityNote})` : ''} |`,
    ),
    ``,
    `## 2. Host → Mini App (Sự kiện Host đẩy chủ động qua onEvent)`,
    ``,
    ...incomingEvents.flatMap((evt) => [
      `### \`${evt.eventName}\` — ${evt.title}`,
      `${evt.summary}${evt.parityNote ? ` (${evt.parityNote})` : ''}`,
      '```json',
      JSON.stringify(evt.samplePayload, null, 2),
      '```',
      ``,
    ]),
    `## 3. Mini App → Host (Lệnh gửi lên Host & Giá trị trả về)`,
    ``,
    ...outgoingCommands.flatMap((cmd) => [
      `### \`${cmd.method}\` (${cmd.isHostAction ? 'Host Action' : 'Core SDK'})`,
      `${cmd.summary}`,
      `- **SDK:** \`${cmd.sdkCallSummary}\``,
      `- **iOS:** \`${cmd.iosHandler}\``,
      `- **Android:** \`${cmd.androidHandler}\``,
      cmd.parityNote ? `- **Lưu ý Parity:** ${cmd.parityNote}` : '',
      `**Payload mẫu gửi lên:**`,
      '```json',
      JSON.stringify(cmd.validExample, null, 2),
      '```',
      `**Kết quả Host trả về:**`,
      '```json',
      JSON.stringify(cmd.responseOk, null, 2),
      '```',
      ``,
    ].filter(Boolean)),
  ];

  if (parityAlerts.length > 0) {
    sections.push(`## 4. Cảnh báo lệch iOS ↔ Android liên quan`);
    for (const alert of parityAlerts) {
      sections.push(`- **${alert.title}** (\`${alert.scope}\`): ${alert.recommendationForMiniApp}`);
    }
    sections.push('');
  }

  sections.push(`## 5. manifest.json (Khai báo quyền)`);
  sections.push('```json');
  sections.push(manifestPermissionsJson);
  sections.push('```');
  sections.push('');
  sections.push(`## 6. Starter Code (@vbotma/sdk)`);
  sections.push('```typescript');
  sections.push(buildStarterSdkCode(contract));
  sections.push('```');

  return sections.join('\n');
}
