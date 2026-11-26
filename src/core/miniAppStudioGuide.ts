// src/core/miniAppStudioGuide.ts
import type { RolePresetId } from '../data/miniAppPermissionMatrix';
import type { SandboxFaultId, SandboxPlatform } from './miniAppSandboxEngine';

export const STUDIO_BANNER_DISMISSED_KEY = 'vbot-miniapp-studio-banner-v1';

function getDefaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadStudioBannerDismissed(
  storage: Pick<Storage, 'getItem'> | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(STUDIO_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveStudioBannerDismissed(
  dismissed: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    if (dismissed) {
      storage.setItem(STUDIO_BANNER_DISMISSED_KEY, '1');
    } else {
      storage.removeItem(STUDIO_BANNER_DISMISSED_KEY);
    }
  } catch {
    // Bỏ qua lỗi quota hoặc chế độ ẩn danh chặn storage
  }
}

export interface StudioTourStep {
  id: string;
  stepNumber: number;
  targetSelector: string;
  title: string;
  description: string;
  tip: string;
  requiredView: 'sandbox' | 'contract';
  preferredPhoneMode?: 'mock' | 'iframe';
}

export const STUDIO_TOUR_STEPS: StudioTourStep[] = [
  {
    id: 'modal-tabs',
    stepNumber: 1,
    targetSelector: '[data-studio-tour="modal-tabs"]',
    title: 'Bản đồ 6 Tab của Cầu nối Mini App',
    description:
      'Thanh này chia rõ từng công cụ: Dev Studio · Mô phỏng (thử trực tiếp), Chạy thử luồng (sơ đồ tuần tự), Tra cứu Hàm & Event, Danh mục 41 Mini App, Quản lý Quyền (RBAC) và Lệch iOS ↔ Android.',
    tip: 'Nếu mới bắt đầu làm Mini App, bạn chỉ cần ở tab "Dev Studio · Mô phỏng" và xem thêm tab "Lệch iOS ↔ Android".',
    requiredView: 'sandbox',
  },
  {
    id: 'studio-header',
    stepNumber: 2,
    targetSelector: '[data-studio-tour="studio-header"]',
    title: 'Chọn Mini App & Xem Hợp đồng 2 Chiều',
    description:
      'Chọn đúng Mini App bạn phụ trách trong 41 app, chuyển sang "Hợp đồng 2 Chiều & Starter Code" để biết Host truyền gì vào (Launch Params / Push Event) và nhận gì lên, hoặc bấm Copy Starter (.ts) / Tải Spec (.md).',
    tip: 'Bấm "Copy link gửi Dev" để gửi link mở thẳng đúng Mini App đó cho thành viên mới.',
    requiredView: 'sandbox',
  },
  {
    id: 'env-bar',
    stepNumber: 3,
    targetSelector: '[data-studio-tour="env-bar"]',
    title: 'Thiết lập Môi trường Host (iOS / Android / Lỗi)',
    description:
      'Đổi qua lại giữa iOS (Swift) và Android (Kotlin), chọn Role Preset (Admin, Sales, Giám sát...) để test RBAC 2 tầng và chọn "Giả lập lỗi" (401 Refresh fail, Android Hotline Sheet, Timeout 5000ms...).',
    tip: 'Luôn test cả 2 nền tảng iOS và Android trước khi bàn giao để bắt các điểm lệch như show_toast hay request_mini_app_token.',
    requiredView: 'sandbox',
  },
  {
    id: 'composer-col',
    stepNumber: 4,
    targetSelector: '[data-studio-tour="composer-col"]',
    title: 'Gửi lệnh Mini App → Host & Bắn Host Push Event',
    description:
      'Khung trên giúp chọn lệnh SDK/Host Action, nạp nhanh "Mẫu chuẩn" hoặc "Mẫu lỗi" và chỉnh JSON trước khi bấm "Gửi lên Host". Khung dưới giả lập sự kiện 1 chiều Host chủ động đẩy xuống onEvent(...) của Mini App.',
    tip: 'Thử bấm "Mẫu lỗi" để xem Host trả mã lỗi chuẩn thế nào khi Mini App truyền thiếu tham số.',
    requiredView: 'sandbox',
    preferredPhoneMode: 'mock',
  },
  {
    id: 'console-col',
    stepNumber: 5,
    targetSelector: '[data-studio-tour="console-col"]',
    title: 'Live Wire Console & 3-Tab Frame Inspector',
    description:
      'Theo dõi từng gói tin chạy 2 chiều (TX JS → Host, NATIVE, RX Host → JS). Chọn một dòng bất kỳ để soi JSON chi tiết, copy code @vbotma/sdk tạo sẵn hoặc xem đúng tên hàm Native iOS/Android xử lý.',
    tip: 'Tab "Code @vbotma/sdk" tự cập nhật theo đúng JSON bạn vừa nhập ở cột trái.',
    requiredView: 'sandbox',
    preferredPhoneMode: 'mock',
  },
  {
    id: 'phone-preview',
    stepNumber: 6,
    targetSelector: '[data-studio-tour="phone-preview"]',
    title: 'Mock Phone UI & Nối Iframe Localhost thật',
    description:
      'Ở chế độ "Mock UI (Sẵn)", bạn xem banner cuộc gọi, Android Toast hay ChooseHotlineCallBottomSheet. Khi chuyển sang "Iframe Localhost", copy "Dev Bridge Shim JS" dán vào index.html để test trực tiếp Mini App đang chạy trên máy bạn.',
    tip: 'Url Iframe tự gắn sẵn Launch Params (#vbma_data=...&vbma_theme=...) giống hệt Host app thật.',
    requiredView: 'sandbox',
    preferredPhoneMode: 'iframe',
  },
];

export interface StudioQuickRecipe {
  id: string;
  title: string;
  badge: string;
  summary: string;
  whatToObserve: string;
  appId: string;
  platform: SandboxPlatform;
  rolePreset: RolePresetId;
  fault: SandboxFaultId;
  phoneMode: 'mock' | 'iframe';
  command?: {
    method: string;
    payload: Record<string, unknown>;
  };
}

export const STUDIO_QUICK_RECIPES: StudioQuickRecipe[] = [
  {
    id: 'recipe-android-hotline-sheet',
    title: 'Gọi ra Android thiếu Hotline → Sheet chọn Hotline',
    badge: 'Android UX',
    summary:
      'Mô phỏng Mini App CRM gọi make_call trên Android nhưng không truyền hotline; Native sẽ tạm dừng ở pending để hiện ChooseHotlineCallBottomSheet.',
    whatToObserve:
      'Hãy thử chọn 1 hotline trên khung điện thoại bên phải để nối máy, hoặc bấm Huỷ để xem mã lỗi USER_CANCELLED trả về JS.',
    appId: 'vb-ma-crm',
    platform: 'android',
    rolePreset: 'member_sales',
    fault: 'none',
    phoneMode: 'mock',
    command: {
      method: 'make_call',
      payload: {
        phone: '0901234567',
        name: 'Nguyễn Văn A',
      },
    },
  },
  {
    id: 'recipe-token-401-logout',
    title: 'Giả lập 401 Refresh Token fail → Android Logout',
    badge: '401 Fail',
    summary:
      'Bật lỗi token_401_refresh_fail và gọi request_module_token(force: true) để kiểm tra cách App và SDK xử lý khi refresh token thất bại.',
    whatToObserve:
      'Thanh cảnh báo đỏ "Host đã gọi logout 1 lần vì 401" hiện trên điện thoại Android và response trả REFRESH_TOKEN_FAILED.',
    appId: 'vb-ma-crm',
    platform: 'android',
    rolePreset: 'member_sales',
    fault: 'token_401_refresh_fail',
    phoneMode: 'mock',
    command: {
      method: 'request_module_token',
      payload: {
        module: 'crm',
        force: true,
      },
    },
  },
  {
    id: 'recipe-ios-toast-parity',
    title: 'Bắt lỗi lệch iOS ↔ Android với show_toast',
    badge: 'Parity',
    summary:
      'Chạy lệnh show_toast trên môi trường iOS (Swift) — nơi Native hiện chưa cài đặt handler cho lệnh này.',
    whatToObserve:
      'Wire Console báo warning UNSUPPORTED_ON_IOS kèm gợi ý Mini App Web phải tự render Toast fallback trên iOS.',
    appId: 'vb-ma-crm',
    platform: 'ios',
    rolePreset: 'member_sales',
    fault: 'none',
    phoneMode: 'mock',
    command: {
      method: 'show_toast',
      payload: {
        message: 'Lưu khách hàng thành công',
        type: 'success',
      },
    },
  },
  {
    id: 'recipe-host-fetch-auth-strip',
    title: 'Kiểm chứng host_fetch tự chặn Authorization từ JS',
    badge: 'Security',
    summary:
      'Thử truyền kèm header Authorization giả mạo từ JS vào host_fetch để xem cơ chế bảo vệ của Host Native.',
    whatToObserve:
      'Response đánh dấu stripped_js_authorization: true và injected_native_bearer: true vì Native luôn ghi đè token an toàn.',
    appId: 'vb-ma-crm',
    platform: 'ios',
    rolePreset: 'member_sales',
    fault: 'none',
    phoneMode: 'mock',
    command: {
      method: 'host_fetch',
      payload: {
        url: 'https://api-dev.vbot.vn/v1/customers',
        method: 'GET',
        headers: {
          Authorization: 'Bearer spoofed_js_token',
        },
      },
    },
  },
  {
    id: 'recipe-localhost-iframe-shim',
    title: 'Mở hướng dẫn nối Mini App Localhost bằng Dev Shim',
    badge: 'Localhost',
    summary:
      'Chuyển khung điện thoại sang chế độ Iframe Localhost và mở sẵn thẻ Dev Bridge Shim JS để bắt tay 2 chiều với code đang chạy ở localhost.',
    whatToObserve:
      'Bấm "Copy Shim" ở cột phải, dán vào index.html của Mini App local rồi nhập http://localhost:5173 và bấm Nạp.',
    appId: 'vb-ma-autodial',
    platform: 'ios',
    rolePreset: 'member_sales',
    fault: 'none',
    phoneMode: 'iframe',
  },
];

export type BridgeModalTabId =
  | 'sandbox'
  | 'simulator'
  | 'protocol'
  | 'catalog'
  | 'permissions'
  | 'parity';

export interface BridgeTabGuideItem {
  tab: BridgeModalTabId;
  label: string;
  whenToUse: string;
}

export const BRIDGE_MODAL_TABS_GUIDE: BridgeTabGuideItem[] = [
  {
    tab: 'sandbox',
    label: 'Dev Studio · Mô phỏng',
    whenToUse: 'Nơi làm việc chính: thử JSON 2 chiều, xem Contract, copy Starter code và test Iframe Localhost.',
  },
  {
    tab: 'simulator',
    label: 'Chạy thử luồng',
    whenToUse: 'Xem Sequence Diagram từng bước (JS → SDK → Host Swift/Kotlin → Server) cho 8 luồng nghiệp vụ lớn.',
  },
  {
    tab: 'protocol',
    label: 'Tra cứu Hàm & Event',
    whenToUse: 'Từ điển đầy đủ mọi hàm Core SDK, Custom Host Action và Push Event kèm code native hai HĐH.',
  },
  {
    tab: 'catalog',
    label: 'Danh mục 41 Mini App',
    whenToUse: 'Tìm app theo vị trí hiển thị (Hub, Tab cố định, In-call, Ẩn) và bấm "Mở Dev Studio" nhanh.',
  },
  {
    tab: 'permissions',
    label: 'Quản lý Quyền (RBAC)',
    whenToUse: 'Kiểm tra ma trận phân quyền 2 tầng (Host hiển thị ∩ manifest.json ∩ Role User) theo từng vai trò.',
  },
  {
    tab: 'parity',
    label: 'Lệch iOS ↔ Android',
    whenToUse: 'Danh sách cảnh báo khác biệt thực tế giữa VBot iOS và VBot Android mà code Web cần phòng tránh.',
  },
];

export interface MiniAppWorkflowStep {
  step: number;
  title: string;
  description: string;
}

export const MINI_APP_WORKFLOW_STEPS: MiniAppWorkflowStep[] = [
  {
    step: 1,
    title: 'Chọn Mini App & đọc Hợp đồng 2 Chiều',
    description:
      'Chọn đúng app trong dropdown trên đầu Studio rồi mở tab "Hợp đồng 2 Chiều & Starter Code" để nắm rõ Launch Params nhận lúc mở và các lệnh được gọi.',
  },
  {
    step: 2,
    title: 'Copy Starter Code (.ts) & manifest.json',
    description:
      'Dán đoạn parseVBotLaunchHash(), đăng ký onEvent() trước khi gọi ready() và khai báo đủ module quyền trong manifest.json.',
  },
  {
    step: 3,
    title: 'Mô phỏng Happy Path & Giả lập lỗi (401 / RBAC / Parity)',
    description:
      'Đổi iOS ↔ Android, thử Role Member tối giản và chọn các kịch bản "Giả lập lỗi" trong Sandbox để kiểm tra app có xử lý mượt khi gặp sự cố.',
  },
  {
    step: 4,
    title: 'Nhúng Mini App localhost bằng Dev Bridge Shim',
    description:
      'Chuyển khung điện thoại sang "Iframe Localhost", copy đoạn Dev Bridge Shim JS dán vào index.html lúc dev rồi bấm Nạp để test app thật.',
  },
];
