// src/data/techGlossaryData.ts
export interface DevOnboardingStep {
  step: number;
  title: string;
  description: string;
  nodeId: string;
  recommendedPlatform?: 'compare' | 'ios' | 'android';
}

export interface TechGlossaryItem {
  term: string;
  shortTag: string;
  explanation: string;
  relatedNodeId?: string;
}

export const DEV_ONBOARDING_STEPS: DevOnboardingStep[] = [
  {
    step: 1,
    title: 'Khung kiến trúc Host App & 4 Tab chính',
    description:
      'Xem tổng thể NewMainTabBarViewController (iOS UIKit) vs MainActivity (Android AHBottomNavigation + VBotPhone SDK + VbMaSDK).',
    nodeId: 'vbot-app',
    recommendedPlatform: 'compare',
  },
  {
    step: 2,
    title: 'Luồng Cuộc gọi đến (PushKit/CallKit vs FCM/CallStyle FSI)',
    description:
      'Hiểu cách đánh thức app từ trạng thái tắt hoàn toàn, phân biệt TelephoneSDK / PJSIP (iOS) với vbotphonesdk / PJSIP (Android) và thứ tự ưu tiên tra tên khách hàng.',
    nodeId: 'call-incoming',
    recommendedPlatform: 'compare',
  },
  {
    step: 3,
    title: 'Chuyển tiếp cuộc gọi thuần DTMF (#1 / *2 / *9 / *1)',
    description:
      'Cả iOS (file tên legacy VPMAppService+Linphone gọi TelephoneSDK) và Android (CallForwardDTMFHelper) đều phát DTMF delay 300ms qua kênh thoại; Android dùng thêm WebSocket/FCM type=10 và tự gửi *2 khi polling gặp ANSWER.',
    nodeId: 'call-transfer',
    recommendedPlatform: 'compare',
  },
  {
    step: 4,
    title: 'Giao tiếp Host App ↔ Mini App (VbMaSDK Bridge)',
    description:
      'Xem trọn bộ 11 Bridge messages, 4 luồng chạy mẫu với Payload/Response JSON thật và cơ chế chống lặp SQLite theo uid.',
    nodeId: 'ma-user-contact',
    recommendedPlatform: 'compare',
  },
  {
    step: 5,
    title: 'Đăng nhập, Khóa 429 & Đồng bộ phiên 2FA (SETUP_2FA)',
    description:
      'Kiểm tra luồng verify-login, khóa tạm thời theo username trong RAM và cơ chế force logout an toàn ngay cả khi đang gọi.',
    nodeId: 'mod-auth',
    recommendedPlatform: 'compare',
  },
];

export const TECH_GLOSSARY_TERMS: TechGlossaryItem[] = [
  {
    term: 'VPM vs Hotline / isVPM',
    shortTag: 'Định tuyến gọi',
    explanation:
      'Cờ phân biệt cuộc gọi nội bộ giữa tài khoản VPM với tài khoản VPM khác (isVPM = true, gọi qua extension/UID) với cuộc gọi ra/vào mạng viễn thông qua đầu số Hotline (isVPM = false). Ảnh hưởng trực tiếp đến quy tắc ưu tiên hiển thị tên người gọi.',
    relatedNodeId: 'call-incoming',
  },
  {
    term: 'transId',
    shortTag: 'VoIP / CRM',
    explanation:
      'Mã định danh duy nhất của một phiên cuộc gọi trên tổng đài VBot, dùng để tra cứu thông tin khách hàng (GET api/User/getInfoCall2), đối soát trạng thái WebSocket và khớp log chuyển tiếp.',
    relatedNodeId: 'call-incoming',
  },
  {
    term: 'TelephoneSDK / PJSIP (iOS) vs vbotphonesdk / PJSIP (Android)',
    shortTag: 'VoIP Engine',
    explanation:
      'Trên nhánh Nam-dev, CẢ iOS và Android đều chạy lõi PJSIP: iOS tích hợp TelephoneSDK (bọc VBotPhoneSDK.xcframework) nối CallKit (LinphoneAPI.swift và CallKitProviderDelegate.swift đã comment out 100%); Android tắt toàn bộ LinphoneManager.kt và chạy PJSIP (org.pjsip.pjsua2) trong vbotphonesdk.',
    relatedNodeId: 'mod-calling',
  },
  {
    term: 'PushKit & CallKit vs FCM & CallStyle FSI',
    shortTag: 'Incoming Call OS',
    explanation:
      'iOS nhận VoIP push qua PKPushRegistryDelegate trong AppDelegate và bắt buộc report CXProvider.reportNewIncomingCall ngay trong tick để hệ thống không thu hồi quyền. Android nhận FCM data-only (type == "3"), dựng CallService foreground và Notification.CallStyle kèm fullScreenIntent mở NewCallActivity.',
    relatedNodeId: 'call-in-pushkit',
  },
  {
    term: 'DTMF Transfer (#1 / *2 / *9 / *1) & FreeSwitchTransferHelper',
    shortTag: 'Chuyển tiếp',
    explanation:
      'Trên nhánh Nam-dev, cả iOS và Android đều thực hiện Blind Transfer (#1 + delay 300ms -> cleanTarget, không lặp #1) và Attended Transfer (*2 giữ/gọi hỏi, *9 bấm Xác nhận bàn giao, *1 CHỈ gửi khi bấm nút Hủy — không gửi khi nhận NOANSWER/MISSCALL/ENDCALL) thuần qua DTMF. Riêng Android tự gửi *2 khi polling gặp ANSWER (iOS không tự gửi). File FreeSwitchTransferHelper.swift trên iOS KHÔNG được gọi ở luồng thực tế.',
    relatedNodeId: 'call-transfer',
  },
  {
    term: 'VbMaSDK & embedMode (inline_tab / modal / sdk_global)',
    shortTag: 'Mini App SDK',
    explanation:
      'Cầu nối giữa Host Native và Mini App Web (Svelte/TS): iOS giao tiếp qua WKWebView WKScriptMessageHandler ("vbma"), Android qua @JavascriptInterface ("VbMABridge.post()"). embedMode cho biết Mini App được nhúng làm tab cố định (inline_tab), mở popup (modal), hay dùng dịch vụ SDK toàn cục (sdk_global).',
    relatedNodeId: 'vbot-app',
  },
  {
    term: 'HostToken vs MiniAppToken',
    shortTag: 'Xác thực',
    explanation:
      'HostToken là access token chính của tài khoản VBot App; MiniAppToken được Host lấy qua GET /api/User/getTokenMiniApp và cache RAM trong SDK (VbMaMiniAppTokenService trên cả iOS & Android) theo expiresAt / JWT exp (fallback 900s, trừ hao 300s). Riêng 600s (tách scope apiBaseURL|projectCode|uid) là throttle pre-warm phía Host iOS trong CallActionBridgeHelper.',
    relatedNodeId: 'vbot-app',
  },
  {
    term: 'local_key (srv_ vs dev_)',
    shortTag: 'SQLite Danh bạ',
    explanation:
      'Khóa chính trong SQLite danh bạ cá nhân (kết hợp cùng uid: PRIMARY KEY (local_key, uid)): tiền tố "srv_" đánh dấu bản ghi đã đồng bộ Server VBot, còn "dev_" là số chỉ mới lưu cục bộ trên máy và có icon Điện thoại.',
    relatedNodeId: 'contact-personal',
  },
  {
    term: "Loop Guard (userInfo['source'] vs computeContactsSignature)",
    shortTag: 'Chống lặp Bridge',
    explanation:
      'Cơ chế chặn vòng lặp vô hạn khi Mini App sửa SQLite và Host lắng nghe cập nhật: iOS gắn userInfo["source"] = "miniapp_bridge" để bỏ qua NotificationCenter tự phát; Android so khớp chữ ký dữ liệu computeContactsSignature(uid, items) với lastDeliveredSignature (và bỏ qua null ban đầu để chặn LiveData sticky replay).',
    relatedNodeId: 'mauc-loop-guard',
  },
  {
    term: 'Contact V2 vs User Contact',
    shortTag: '2 loại danh bạ',
    explanation:
      'Tab 1 (ContactForward) hiển thị danh bạ đơn vị/khách hàng phục vụ tra cứu & chuyển tiếp qua Mini App vb-ma-contact-forward (và SQLite ContactV2 khi đang gọi); Tab 3 (UserContacts) là danh bạ cá nhân riêng từng uid qua Mini App vb-ma-user-contact.',
    relatedNodeId: 'contact-forward-v2',
  },
  {
    term: 'failed_phones',
    shortTag: 'Đồng bộ danh bạ',
    explanation:
      'Mảng các số điện thoại bị Server từ chối vì sai định dạng trong quá trình đẩy danh bạ máy lên VBot. Mini App hiển thị Bottom Sheet tích sẵn tối đa 50 số lỗi để người dùng xóa gọn qua Bridge user_contact_delete_local.',
    relatedNodeId: 'ct-failed-phones',
  },
  {
    term: 'Khóa đăng nhập tạm thời 429 (locked_until)',
    shortTag: 'Auth Security',
    explanation:
      'Khi sai mật khẩu hoặc OTP quá 5 lần trong 15 phút, API trả HTTP 429 kèm locked_until (mặc định 900s). Android TwoFactorSessionManager.kt giữ map lockedAccountsUntilMs theo từng username trong RAM; còn iOS VPMSignInViewController chỉ lưu 1 cặp đơn lẻ (lockedUsername, lockExpiresAtMs) trên instance màn hình (nhập user khác bị 429 sẽ ghi đè).',
    relatedNodeId: 'auth-login-lock',
  },
  {
    term: 'Nhánh đồng bộ Nam-dev',
    shortTag: 'Baseline Code',
    explanation:
      'Toàn bộ sơ đồ kỹ thuật và danh sách codeRefs hiện tại được đối soát trực tiếp từ mã nguồn thực tế trên nhánh Nam-dev của cả VBot-iOS và VBot-Android (không trộn tính năng chỉ có ở nhánh thử nghiệm khác).',
    relatedNodeId: 'vbot-app',
  },
];
