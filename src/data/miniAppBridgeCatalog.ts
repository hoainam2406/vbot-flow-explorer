// src/data/miniAppBridgeCatalog.ts
// Spec & Trình mô phỏng cầu nối Host App ↔ Mini App (chỉ đóng gói trong Internal / Tech chunk).

export type BridgeLaneId = 'miniapp' | 'sdk' | 'host' | 'server';

export type BridgeStepPhase =
  | 'miniapp_call'
  | 'sdk_bridge'
  | 'host_process'
  | 'server_os'
  | 'host_reply'
  | 'host_push';

export interface BridgeTraceStep {
  stepNumber: number;
  title: string;
  phase: BridgeStepPhase;
  from: BridgeLaneId;
  to: BridgeLaneId;
  dashed: boolean;
  arrowLabel: string;
  explanation: string;
  miniAppCode?: string;
  wirePacket?: {
    channel: string;
    json: string;
  };
  hostIos: {
    fn: string;
    detail: string;
    codeRef?: string;
  };
  hostAndroid: {
    fn: string;
    detail: string;
    codeRef?: string;
  };
  responsePacket?: {
    eventName: string;
    json: string;
  };
  parityWarning?: string;
}

export interface BridgeSubFlow {
  id: string;
  label: string;
  eventBadge: string;
  summary: string;
  relatedNodeId?: string;
  steps: BridgeTraceStep[];
}

export interface ActionFlowTarget {
  flowId: string;
  subFlowId?: string;
}

export interface BridgeInteractiveFlow {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  miniAppId: string;
  categoryBadge: string;
  summary: string;
  relatedNodeId?: string;
  steps: BridgeTraceStep[];
  subFlows?: BridgeSubFlow[];
}

export interface CoreBridgeSpecItem {
  id: string;
  name: string;
  direction: 'launch_param' | 'miniapp_to_host' | 'host_to_miniapp' | 'host_action';
  category:
    | 'lifecycle'
    | 'auth'
    | 'permissions'
    | 'call'
    | 'autodial'
    | 'contacts'
    | 'navigation'
    | 'ui';
  summary: string;
  miniAppCode: string;
  requestJson?: string;
  responseEvent?: string;
  responseJson?: string;
  iosHandler: string;
  androidHandler: string;
  parityNote?: string;
  usedByApps: string[];
}

export interface MiniAppCatalogEntry {
  id: string;
  nameVi: string;
  nameEn: string;
  category: string;
  placement: 'inline_tab' | 'features_hub' | 'in_call' | 'child_app' | 'hidden_setting';
  accessLevel: 'everyone' | 'member_perm' | 'admin_only';
  iosPermissionRule: string;
  androidPermissionRule: string;
  bridgeTier: 'core_sdk' | 'custom_bridge';
  customActions?: string[];
  simulatorFlowId?: string;
  relatedNodeId?: string;
  parityNote?: string;
}

export interface BridgeParityAlert {
  id: string;
  title: string;
  severity: 'high' | 'medium';
  scope: string;
  iosBehavior: string;
  androidBehavior: string;
  recommendationForMiniApp: string;
  simulatorFlowId?: string;
  relatedNodeId?: string;
}

export interface BridgeLaneMeta {
  id: BridgeLaneId;
  label: string;
  sublabel: string;
  bg: string;
  border: string;
  accent: string;
}

export const BRIDGE_LANE_META: BridgeLaneMeta[] = [
  {
    id: 'miniapp',
    label: 'Mini App (Web)',
    sublabel: '@vbotma/sdk (JS/TS)',
    bg: '#ecfeff',
    border: '#22d3ee',
    accent: '#0e7490',
  },
  {
    id: 'sdk',
    label: 'Cầu nối VbMaSDK',
    sublabel: 'WKScriptMessage / VbMABridge',
    bg: '#eef2ff',
    border: '#818cf8',
    accent: '#4338ca',
  },
  {
    id: 'host',
    label: 'Host App Native',
    sublabel: 'Swift / Kotlin Delegate',
    bg: '#eff6ff',
    border: '#60a5fa',
    accent: '#1d4ed8',
  },
  {
    id: 'server',
    label: 'Server / SIP / OS',
    sublabel: 'REST · WebSocket · SQLite',
    bg: '#ecfdf5',
    border: '#34d399',
    accent: '#047857',
  },
];

export const MINI_APP_SIMULATOR_FLOWS: BridgeInteractiveFlow[] = [
  {
    id: 'flow-autodial',
    title: 'Quay số tự động theo chiến dịch (vb-ma-autodial)',
    shortTitle: 'Autodial (Gọi tự động)',
    subtitle: 'vb-ma-autodial ↔ 6 sơ đồ sự kiện: Khởi tạo · Quay số lẻ · Start · Pause/Resume · Stop/State · Finish/Error',
    miniAppId: 'vb-ma-autodial',
    categoryBadge: '6 sự kiện · Bridge + WS vbot.auto.dial',
    summary:
      'Mini App vb-ma-autodial giao tiếp với Host App qua 6 nhóm hành động/sự kiện tách biệt. Chọn từng sơ đồ con bên trên để xem luồng hàm, JSON và xử lý iOS/Android tương ứng.',
    relatedNodeId: 'ma-autodial',
    subFlows: [
      {
        id: 'autodial-start',
        label: 'Bắt đầu (start_autodial)',
        eventBadge: 'start_autodial → WS vbot.auto.dial & SIP',
        summary:
          'Mini App phát lệnh start_autodial (autoDialId, hotline, campaignName?); Host kiểm tra không bận cuộc gọi khác, mở WebSocket ws/call (method vbot.auto.dial), quay SIP tuần tự kèm cooldown 2000ms và phản hồi snapshot qua host_action_result.',
        relatedNodeId: 'maad-start',
        steps: [
          {
            stepNumber: 1,
            title: 'Mini App đăng ký listener & gửi lệnh start_autodial',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'sdk',
            dashed: false,
            arrowLabel: "postEvent('request_host_action', 'start_autodial')",
            explanation:
              'Mini App đăng ký host_action_result (khớp request_id), autodial_finished, autodial_error rồi gọi postEvent("request_host_action", { action: "start_autodial", payload }). SDK Host trên iOS/Android cũng hỗ trợ gọi thẳng method "start_autodial" qua handleDirectHostAction (VbMaViewController.swift:1021 / VbMABridge.kt:830).',
            miniAppCode: `import { on, postEvent } from '@vbotma/sdk';

const requestId = crypto.randomUUID();
const offResult = on('host_action_result' as any, (res: any) => {
  if (res.request_id !== requestId) return;
  offResult();
  console.log('Autodial state:', res.state, 'hotline:', res.hotline);
});

postEvent('request_host_action' as any, {
  request_id: requestId,
  action: 'start_autodial',
  payload: {
    autoDialId: 151,
    hotline: '02499998888',
    campaignName: 'CSKH Tháng 11',
  },
});`,
            wirePacket: {
              channel: 'VbMABridge.post("request_host_action", jsonString)',
              json: JSON.stringify(
                {
                  eventType: 'request_host_action',
                  eventData: {
                    request_id: 'req-ad-01',
                    action: 'start_autodial',
                    payload: {
                      autoDialId: 151,
                      hotline: '02499998888',
                      campaignName: 'CSKH Tháng 11',
                    },
                  },
                },
                null,
                2,
              ),
            },
            hostIos: {
              fn: 'VbMaViewController.userContentController(_:didReceive:) → handleRequestHostAction(_:)',
              detail:
                'Nhận message "vbma", kiểm tra "start_autodial" nằm trong delegate.supportedHostActions (hoặc nhánh handleDirectHostAction).',
              codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
            },
            hostAndroid: {
              fn: 'VbMABridge.post(method, paramsStr) → handleRequestHostAction(data)',
              detail:
                'Parse JSONObject từ @JavascriptInterface post() và kiểm tra VbMaSDK.delegate?.supportedHostActions.contains("start_autodial").',
              codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
            },
          },
          {
            stepNumber: 2,
            title: 'VbMaSDK định tuyến lệnh vào Host AutodialManager',
            phase: 'sdk_bridge',
            from: 'sdk',
            to: 'host',
            dashed: false,
            arrowLabel: 'onHostActionRequested(requestId, "start_autodial", payload)',
            explanation:
              'SDK kiểm tra tính hợp lệ Delegate ("NO_DELEGATE" / "UNSUPPORTED_ACTION") và chuyển payload cho Host Delegate trích xuất autoDialId (> 0), hotline (không rỗng) và campaignName.',
            hostIos: {
              fn: 'MiniAppService.onHostActionRequested(...) → AutodialManager.shared.handleAction(...)',
              detail:
                'parseStartPayload(payload) kiểm tra autoDialId > 0 và !hotline.isEmpty; trả "Missing autoDialId or hotline" nếu thiếu.',
              codeRef: 'VBot/Service/MiniAppService.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.dispatchHostAction(...) → handleStartAutodial(context, requestId, payload, callback)',
              detail:
                'Kiểm tra autoDialId == 0 || hotline.isEmpty rồi gọi AutodialManager.start(context, autoDialId, hotline, campaignName).',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
          },
          {
            stepNumber: 3,
            title: 'Host kiểm tra bận, mở WebSocket vbot.auto.dial & quay SIP',
            phase: 'host_process',
            from: 'host',
            to: 'server',
            dashed: false,
            arrowLabel: 'WS ws/call?session_id= → method: "vbot.auto.dial" & SIP Dial',
            explanation:
              'AutodialManager từ chối nếu đang có cuộc gọi active. Khi rảnh, Host mở WebSocket (ping 10s), gửi method "vbot.auto.dial" lấy phone/name/autoDialPhoneId, quay SIP định dạng "$hotline*$idProject*$phone", chờ hết cuộc gọi → cooldown 2000ms rồi lặp lại.',
            wirePacket: {
              channel: 'WebSocket wss://<socket_url>/ws/call?session_id=<sid>',
              json: JSON.stringify(
                {
                  id: '1763604900123',
                  method: 'vbot.auto.dial',
                  data: {
                    uid: 'u_9812',
                    projectCode: 'vbot',
                    autoDialId: 151,
                    hotline: '02499998888',
                  },
                },
                null,
                2,
              ),
            },
            hostIos: {
              fn: 'AutodialManager.start(autoDialId:hotline:campaignName:) + dispatchOutgoingCall(...)',
              detail:
                'Mở URLSessionWebSocketTask, gắn CallModel.suppliedCallerName, quay Telephone.sharedInstance.startOutgoingCall() và hẹn cooldown 2.0s.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'AutodialManager.start(context, autoDialId, hotline, campaignName)',
              detail:
                'Mở OkHttp WebSocket (backoff 2s/4s/8s), gán CallModel.miniAppDisplayName, mở NewCallActivity + VBotPhone.startOutgoingCall() và delay 2000ms.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
          },
          {
            stepNumber: 4,
            title: 'Host trả snapshot state tức thì qua host_action_result',
            phase: 'host_reply',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'sendEvent("host_action_result", { request_id, ...toStateMap() })',
            explanation:
              'Host gộp request_id + success + toStateMap() đẩy về WebView qua VbMA.receive("host_action_result", ...), giúp Mini App chuyển UI sang trạng thái "connecting" (hoặc hiện lỗi nếu máy đang bận cuộc gọi khác).',
            miniAppCode: `on('host_action_result' as any, (res: any) => {
  if (res.request_id !== requestId) return;
  if (!res.success) return showToast(res.message);
  setCampaignState(res.state); // "connecting"
});`,
            hostIos: {
              fn: 'VbMaViewController.sendEvent("host_action_result", payload: result)',
              detail: 'Inject JS gọi VBot.WebView.receiveEvent & VbMA.receive kèm toStateMap().',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'VbMABridge.sendEvent("host_action_result", resultJson)',
              detail: 'Đẩy evaluateJavascript("VbMA.receive(\'host_action_result\', ...)") trên Main Looper.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
            responsePacket: {
              eventName: 'host_action_result',
              json: JSON.stringify(
                {
                  request_id: 'req-ad-01',
                  success: true,
                  state: 'connecting',
                  autoDialId: 151,
                  campaignName: 'CSKH Tháng 11',
                  hotline: '02499998888',
                  totalCalled: 0,
                  currentPhone: null,
                  currentName: null,
                  autoDialPhoneId: null,
                  error: null,
                },
                null,
                2,
              ),
            },
          },
        ],
      },
      {
        id: 'autodial-make-call',
        label: 'Quay số lẻ (make_call)',
        eventBadge: 'make_call → call_result',
        summary:
          'Khi nhân viên bấm gọi trực tiếp 1 khách hàng lẻ trong danh sách chiến dịch (không chạy vòng lặp WebSocket), vb-ma-autodial gọi makeCall() qua Bridge Core để Host quay PJSIP và bảo toàn tên hiển thị.',
        relatedNodeId: 'maad-make-call',
        steps: [
          {
            stepNumber: 1,
            title: 'Mini App gọi makeCall() với callee_info & hotline chiến dịch',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'sdk',
            dashed: false,
            arrowLabel: "postEvent('make_call', { request_id, callee_info })",
            explanation:
              'Mini App gọi makeCall() từ @vbotma/sdk. SDK tự sinh request_id, gửi event "make_call" chứa callee_info (phoneNumber, displayName, hotline, typeCall) và lắng nghe call_result khớp request_id.',
            miniAppCode: `import { makeCall } from '@vbotma/sdk';

const res = await makeCall({
  phoneNumber: '0901234567',
  displayName: 'Trần Văn B',
  hotline: '02499998888',
  typeCall: 'app_to_phone',
});
console.log('makeCall:', res.success, res.reason);`,
            wirePacket: {
              channel: 'VbMABridge.post("make_call", jsonString)',
              json: JSON.stringify(
                {
                  eventType: 'make_call',
                  eventData: {
                    request_id: 'req-call-01',
                    callee_info: {
                      phoneNumber: '0901234567',
                      displayName: 'Trần Văn B',
                      hotline: '02499998888',
                      typeCall: 'app_to_phone',
                    },
                  },
                },
                null,
                2,
              ),
            },
            hostIos: {
              fn: 'VbMaViewController.handleRequestCall(_:)',
              detail: 'Parse callee_info (hoặc payload phẳng cũ) chuyển lên MiniAppService.onRequestCall.',
              codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
            },
            hostAndroid: {
              fn: 'VbMABridge.handleRequestCall(data)',
              detail: 'Parse request_id + callee_info trên Main Thread rồi gọi VbMaSDK.delegate.onRequestCall().',
              codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
            },
          },
          {
            stepNumber: 2,
            title: 'VbMaSDK kiểm tra số điện thoại & chuyển Delegate quay số',
            phase: 'sdk_bridge',
            from: 'sdk',
            to: 'host',
            dashed: false,
            arrowLabel: 'onRequestCall(phone, typeCall, hotline, displayName)',
            explanation:
              'Nếu phoneNumber rỗng SDK tự trả call_result reason: "MISSING_PHONE_NUMBER". Nếu hợp lệ, Delegate phía Host tiếp nhận để chuẩn bị CallModel và Hotline.',
            hostIos: {
              fn: 'MiniAppService.onRequestCall(...)',
              detail: 'Đọc callee_info.phoneNumber, hotline, displayName và nạp VPMAppService.shared.oneCallModel.',
              codeRef: 'VBot/Service/MiniAppService.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.onRequestCall(...)',
              detail: 'Kiểm tra hotline truyền vào hoặc hotline mặc định; gán CallModel.miniAppDisplayName trước khi quay.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
          },
          {
            stepNumber: 3,
            title: 'Host mở màn hình gọi & phát SIP INVITE',
            phase: 'host_process',
            from: 'host',
            to: 'server',
            dashed: false,
            arrowLabel: 'VPMAppService.makeCall / VBotPhone.startOutgoingCall()',
            explanation:
              'Host khởi tạo cuộc gọi PJSIP lên tổng đài. Trên iOS đặt suppliedCallerName; trên Android đặt miniAppDisplayName để các bước CRM lookup không ghi đè tên khách hàng.',
            hostIos: {
              fn: 'VPMAppService.makeCall + CallModel.suppliedCallerName',
              detail: 'Gọi thẳng VPMAppService.makeCall với hotline chỉ định hoặc hotline mặc định của dự án.',
              codeRef: 'VBot/Service/MiniAppService.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.handleRequestCall → showHotlinePicker / makeDirectCall()',
              detail: 'Nếu chưa có hotline mặc định & dự án không phải 1 hotline duy nhất, Android bật ChooseHotlineCallBottomSheet (showHotlinePicker) chờ user chọn hoặc Hủy trước khi gọi makeDirectCall() trả Result<Unit>.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
          },
          {
            stepNumber: 4,
            title: 'Host trả call_result về khớp request_id',
            phase: 'host_reply',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'sendEvent("call_result", { request_id, success })',
            explanation:
              'Host gửi event call_result mang request_id về VbMaSDK để resolve Promise cho lệnh makeCall() bên Mini App.',
            miniAppCode: `// SDK tự resolve Promise của makeCall():
// { request_id: 'req-call-01', success: true }`,
            hostIos: {
              fn: 'VbMaViewController.sendEvent("call_result", payload: response)',
              detail: 'Chỉ trả success=true sau khi VPMAppService.makeCall xác nhận khởi tạo cuộc gọi.',
              codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.handleRequestCall → settle(...) → VbMABridge.sendEvent("call_result", json)',
              detail: 'Dùng AtomicBoolean one-shot (đã bỏ timer 200ms): chỉ trả success=true ngay sau khi makeDirectCall() thành công; đóng ChooseHotlineCallBottomSheet không chọn trả USER_CANCELLED, thiếu hotline trả NO_HOTLINE, lỗi khởi tạo trả ERROR.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
            responsePacket: {
              eventName: 'call_result',
              json: JSON.stringify(
                { request_id: 'req-call-01', success: true, reason: null },
                null,
                2,
              ),
            },
          },
        ],
      },
      {
        id: 'autodial-pause-resume',
        label: 'Tạm dừng & Tiếp tục',
        eventBadge: 'pause_autodial / resume_autodial',
        summary:
          'pause_autodial đặt cờ isPaused=true (nếu đang CALLING sẽ đợi hết cuộc hiện tại mới sang state=paused, còn đang cooldown/connecting sẽ pause ngay); resume_autodial gỡ cờ và tiếp tục gọi số kế tiếp.',
        relatedNodeId: 'maad-control',
        steps: [
          {
            stepNumber: 1,
            title: 'Mini App gửi pause_autodial qua request_host_action',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'host',
            dashed: false,
            arrowLabel: "postEvent('request_host_action', 'pause_autodial')",
            explanation:
              'Người dùng bấm nút Tạm dừng trên Mini App. Lệnh pause_autodial không cần payload; VbMaSDK định tuyến qua supportedHostActions tới AutodialManager.pause().',
            miniAppCode: `postEvent('request_host_action' as any, {
  request_id: crypto.randomUUID(),
  action: 'pause_autodial',
});`,
            wirePacket: {
              channel: 'VbMABridge.post("request_host_action", json)',
              json: JSON.stringify(
                { request_id: 'req-ad-pause', action: 'pause_autodial', payload: {} },
                null,
                2,
              ),
            },
            hostIos: {
              fn: 'AutodialManager.shared.handleAction("pause_autodial") → pause()',
              detail: 'Chỉ nhận khi state ∈ {connecting, requesting_next, calling, cooldown}.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.handlePauseAutodial → AutodialManager.pause()',
              detail: 'Đặt isPaused=true, hủy cooldownJob và kiểm tra state != CALLING.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
          },
          {
            stepNumber: 2,
            title: 'AutodialManager xử lý chờ hết cuộc gọi & đổi state=paused',
            phase: 'host_process',
            from: 'host',
            to: 'host',
            dashed: false,
            arrowLabel: 'isPaused = true (nếu đang calling thì đợi handleCallEnded)',
            explanation:
              'Nếu đang có cuộc gọi diễn ra (state=calling), AutodialManager KHÔNG cúp máy đột ngột mà đợi cuộc đó kết thúc rồi mới chuyển state sang paused. Nếu đang ở cooldown/connecting, chuyển sang paused ngay lập tức.',
            hostIos: {
              fn: 'AutodialManager.pause() & handleCallEnded()',
              detail: 'Hủy cooldownWorkItem; trong handleCallEnded() thấy isPaused == true sẽ gọi updateState(.paused).',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'AutodialManager.pause() & handleCallEnded()',
              detail: 'Hủy cooldownJob; trong handleCallEnded() kiểm tra isPaused → updateState(State.PAUSED).',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
          },
          {
            stepNumber: 3,
            title: 'Host phản hồi snapshot trạng thái sau pause',
            phase: 'host_reply',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'host_action_result { state: "paused" | "calling" }',
            explanation:
              'Host trả toStateMap() qua host_action_result. Nếu vừa pause lúc đang gọi dở thì snapshot lúc đó vẫn là "calling" cho tới khi cuộc hiện tại kết thúc.',
            hostIos: {
              fn: 'buildSuccessActionResponse(requestId)',
              detail: 'Trả success=true kèm toStateMap().',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'handlePauseAutodial callback → sendEvent("host_action_result")',
              detail: 'Callback request_id + success=true + AutodialManager.toStateMap().',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
            responsePacket: {
              eventName: 'host_action_result',
              json: JSON.stringify(
                {
                  request_id: 'req-ad-pause',
                  success: true,
                  state: 'paused',
                  autoDialId: 151,
                  totalCalled: 4,
                  currentPhone: '0901234567',
                },
                null,
                2,
              ),
            },
          },
          {
            stepNumber: 4,
            title: 'Mini App gửi resume_autodial để xin số kế tiếp',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'server',
            dashed: false,
            arrowLabel: 'resume_autodial → connectWebSocket() / requestNextPhone()',
            explanation:
              'Khi user bấm Tiếp tục (state đang là paused), Host gỡ isPaused=false: nếu socket bị ngắt trong lúc tạm dừng (shouldReconnect) thì gọi connectWebSocket(), còn nếu socket vẫn mở thì gọi thẳng requestNextPhone() gửi vbot.auto.dial.',
            miniAppCode: `postEvent('request_host_action' as any, {
  request_id: crypto.randomUUID(),
  action: 'resume_autodial',
});`,
            hostIos: {
              fn: 'AutodialManager.resume()',
              detail: 'Guard state == .paused → isPaused = false → connectWebSocket() hoặc requestNextPhone().',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.handleResumeAutodial → AutodialManager.resume()',
              detail: 'Kiểm tra State.PAUSED → nếu shouldReconnect || webSocket == null thì kết nối lại WS, ngược lại requestNextPhone().',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
            responsePacket: {
              eventName: 'host_action_result (resume)',
              json: JSON.stringify(
                { request_id: 'req-ad-resume', success: true, state: 'requesting_next', autoDialId: 151, totalCalled: 4 },
                null,
                2,
              ),
            },
          },
        ],
      },
      {
        id: 'autodial-stop-state',
        label: 'Dừng & Lấy trạng thái',
        eventBadge: 'stop_autodial / get_autodial_state',
        summary:
          'Mini App dùng get_autodial_state lúc mở lại màn hình để đồng bộ tiến độ chiến dịch đang chạy ngầm ở Host, và dùng stop_autodial để kết thúc hẳn, đóng WebSocket (code 1000) và giải phóng timer.',
        relatedNodeId: 'maad-stop-state',
        steps: [
          {
            stepNumber: 1,
            title: 'Mini App gọi get_autodial_state để đồng bộ UI khi vừa mở',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'host',
            dashed: false,
            arrowLabel: "postEvent('request_host_action', 'get_autodial_state')",
            explanation:
              'Vì AutodialManager chạy singleton phía Host (vẫn chạy kể cả khi đóng WebView), Mini App gọi get_autodial_state trong onMount/resume để biết chiến dịch có đang chạy, đang gọi ai hoặc có lỗi error != null hay không.',
            miniAppCode: `postEvent('request_host_action' as any, {
  request_id: crypto.randomUUID(),
  action: 'get_autodial_state',
});`,
            wirePacket: {
              channel: 'VbMABridge.post("request_host_action", json)',
              json: JSON.stringify(
                { request_id: 'req-ad-state', action: 'get_autodial_state', payload: {} },
                null,
                2,
              ),
            },
            hostIos: {
              fn: 'AutodialManager.shared.handleAction("get_autodial_state") → toStateMap()',
              detail: 'Trả trực tiếp snapshot 9 field hiện tại của AutodialManager.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.handleGetAutodialState → AutodialManager.toStateMap()',
              detail: 'Đọc _state, currentPhone, currentName, totalCalled, autoDialPhoneId, hotline, autoDialId, error.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
          },
          {
            stepNumber: 2,
            title: 'Host phản hồi snapshot state đầy đủ qua host_action_result',
            phase: 'host_reply',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'host_action_result { state, totalCalled, currentPhone, error? }',
            explanation:
              'Mini App khôi phục UI thanh tiến độ hoặc phát hiện state === "error" khi vừa mở lại WebView sau khi chạy ngầm.',
            hostIos: {
              fn: 'buildSuccessActionResponse(requestId)',
              detail: 'Trả snapshot toStateMap() kèm request_id.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'VbMABridge.sendEvent("host_action_result", json)',
              detail: 'Trả snapshot toStateMap() kèm request_id.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
            responsePacket: {
              eventName: 'host_action_result',
              json: JSON.stringify(
                {
                  request_id: 'req-ad-state',
                  success: true,
                  state: 'calling',
                  autoDialId: 151,
                  campaignName: 'CSKH Tháng 11',
                  hotline: '02499998888',
                  totalCalled: 12,
                  currentPhone: '0912345678',
                  currentName: 'Nguyễn Văn A',
                  autoDialPhoneId: '8859',
                  error: null,
                },
                null,
                2,
              ),
            },
          },
          {
            stepNumber: 3,
            title: 'Mini App gửi stop_autodial để dừng hẳn chiến dịch',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'host',
            dashed: false,
            arrowLabel: "postEvent('request_host_action', 'stop_autodial')",
            explanation:
              'Khi nhân viên bấm Dừng chiến dịch, Mini App gọi stop_autodial. Host chuyển ngay sang state="stopped" và tiến hành dọn dẹp tài nguyên.',
            miniAppCode: `postEvent('request_host_action' as any, {
  request_id: crypto.randomUUID(),
  action: 'stop_autodial',
});`,
            hostIos: {
              fn: 'AutodialManager.shared.stop() → cleanup()',
              detail: 'Set state = .stopped, hủy timer cooldown/reconnect/ping, đóng WS code .normalClosure (1000) và gỡ delegate Telephone.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.handleStopAutodial → AutodialManager.stop() → cleanup()',
              detail: 'Set State.STOPPED, hủy cooldownJob/reconnectJob, ws.close(1000, "Autodial cleanup") và removePhoneListener().',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
          },
          {
            stepNumber: 4,
            title: 'Host xác nhận state="stopped" & reset thông số phiên',
            phase: 'host_reply',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'host_action_result { state: "stopped", currentPhone: null }',
            explanation:
              'Sau cleanup(), toStateMap() trả về state="stopped" cùng các biến currentPhone/autoDialId đã dọn sạch để Mini App đóng giao diện chạy chiến dịch.',
            hostIos: {
              fn: 'buildSuccessActionResponse(requestId)',
              detail: 'Trả success=true, state="stopped".',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'handleStopAutodial callback',
              detail: 'Trả success=true, state="stopped".',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
            responsePacket: {
              eventName: 'host_action_result',
              json: JSON.stringify(
                {
                  request_id: 'req-ad-stop',
                  success: true,
                  state: 'stopped',
                  autoDialId: null,
                  totalCalled: 12,
                  currentPhone: null,
                  error: null,
                },
                null,
                2,
              ),
            },
          },
        ],
      },
      {
        id: 'autodial-init-session',
        label: 'Khởi tạo & Session',
        eventBadge: 'get_supported_actions / get_session_info',
        summary:
          'Ngay khi mở vb-ma-autodial, Mini App kiểm tra phiên bản Host hiện tại có hỗ trợ bộ action Autodial không qua get_supported_actions, đồng thời xin session_id + socket_url qua get_session_info.',
        relatedNodeId: 'maad-init',
        steps: [
          {
            stepNumber: 1,
            title: 'Mini App gọi get_supported_actions kiểm tra năng lực Host',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'sdk',
            dashed: false,
            arrowLabel: "postEvent('get_supported_actions', { request_id })",
            explanation:
              'Mini App gửi get_supported_actions để tránh gọi start_autodial trên bản app Host cũ chưa tích hợp AutodialManager.',
            miniAppCode: `import { on, postEvent } from '@vbotma/sdk';

const capReqId = crypto.randomUUID();
on('supported_actions_result' as any, (res: any) => {
  if (res.request_id !== capReqId) return;
  const ready = ['start_autodial', 'stop_autodial', 'get_autodial_state']
    .every((a) => res.actions.includes(a));
  console.log('Autodial supported:', ready);
});
postEvent('get_supported_actions' as any, { request_id: capReqId });`,
            wirePacket: {
              channel: 'VbMABridge.post("get_supported_actions", json)',
              json: JSON.stringify({ request_id: 'req-cap-01' }, null, 2),
            },
            hostIos: {
              fn: 'VbMaViewController.handleGetSupportedActions(_:)',
              detail: 'Đọc VbMa.shared.delegate?.supportedHostActions.',
              codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
            },
            hostAndroid: {
              fn: 'VbMABridge.handleGetSupportedActions(data)',
              detail: 'Đọc VbMaSDK.delegate?.supportedHostActions.',
              codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
            },
          },
          {
            stepNumber: 2,
            title: 'Host trả supported_actions_result liệt kê danh sách action',
            phase: 'host_reply',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'sendEvent("supported_actions_result", { request_id, actions })',
            explanation:
              'Cả MiniAppService.swift và MiniAppHelper.kt đều trả về make_call, get_session_info cùng 5 action Autodial và các action danh bạ.',
            hostIos: {
              fn: 'MiniAppService.supportedHostActions',
              detail: 'Gộp ["make_call", "get_session_info"] + AutodialManager.supportedActions + UserContact actions.',
              codeRef: 'VBot/Service/MiniAppService.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.buildSupportedHostActions()',
              detail: 'Gộp listOf("make_call", "get_session_info") + AutodialManager.SUPPORTED_ACTIONS + UserContact actions.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
            responsePacket: {
              eventName: 'supported_actions_result',
              json: JSON.stringify(
                {
                  request_id: 'req-cap-01',
                  actions: [
                    'make_call',
                    'get_session_info',
                    'start_autodial',
                    'stop_autodial',
                    'pause_autodial',
                    'resume_autodial',
                    'get_autodial_state',
                  ],
                },
                null,
                2,
              ),
            },
          },
          {
            stepNumber: 3,
            title: 'Mini App gọi get_session_info qua request_host_action',
            phase: 'miniapp_call',
            from: 'miniapp',
            to: 'host',
            dashed: false,
            arrowLabel: "postEvent('request_host_action', 'get_session_info')",
            explanation:
              'Mini App xin session_id (socket session) và socket_url từ Host để đồng bộ trạng thái hoặc mở kết nối realtime phía Web nếu cần.',
            miniAppCode: `postEvent('request_host_action' as any, {
  request_id: crypto.randomUUID(),
  action: 'get_session_info',
});`,
            wirePacket: {
              channel: 'VbMABridge.post("request_host_action", json)',
              json: JSON.stringify({ request_id: 'req-sess-01', action: 'get_session_info', payload: {} }, null, 2),
            },
            hostIos: {
              fn: 'MiniAppService.onHostActionRequested("get_session_info")',
              detail: 'Fallback theo thứ tự fetchSocketSession() -> fetchRefreshKey() -> fetchAccessToken() và trích host từ AppEnvironment.socketURL.',
              codeRef: 'VBot/Service/MiniAppService.swift',
            },
            hostAndroid: {
              fn: 'MiniAppHelper.handleGetSessionInfo(requestId, callback)',
              detail: 'Đọc TOKEN_SOCKET từ SharePrefsEncode + Parse host từ BuildConfig.WS_URL + checkAdmin().',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
          },
          {
            stepNumber: 4,
            title: 'Host phản hồi { session_id, socket_url, isAdmin }',
            phase: 'host_reply',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'host_action_result { session_id, socket_url, isAdmin }',
            explanation:
              'Host đẩy host_action_result chứa session_id, tên miền socket_url đã chuẩn hóa và cờ quyền isAdmin về Mini App.',
            hostIos: {
              fn: 'VbMaViewController.sendEvent("host_action_result", ...)',
              detail: 'Trả request_id, success=true, session_id, socket_url, isAdmin.',
              codeRef: 'VBot/Service/MiniAppService.swift',
            },
            hostAndroid: {
              fn: 'VbMABridge.sendEvent("host_action_result", ...)',
              detail: 'Trả request_id, success=true, session_id, socket_url, isAdmin.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
            },
            responsePacket: {
              eventName: 'host_action_result',
              json: JSON.stringify(
                {
                  request_id: 'req-sess-01',
                  success: true,
                  session_id: 'sid_abc123',
                  socket_url: 'ws.vbot.vn',
                  isAdmin: true,
                },
                null,
                2,
              ),
            },
          },
        ],
      },
      {
        id: 'autodial-finish-error',
        label: 'Hoàn tất & Lỗi',
        eventBadge: 'autodial_finished / autodial_error',
        summary:
          '2 sự kiện bất đồng bộ do Host chủ động phát về Mini App: autodial_finished khi server báo hết danh sách số, và autodial_error khi server trả lỗi hoặc WebSocket mất kết nối.',
        relatedNodeId: 'maad-error',
        steps: [
          {
            stepNumber: 1,
            title: 'Server WS báo kết thúc chiến dịch hoặc hết số điện thoại',
            phase: 'server_os',
            from: 'server',
            to: 'host',
            dashed: true,
            arrowLabel: 'eventName="AUTODIAL_CAMPAIGN_ENDED" | innerData == null',
            explanation:
              'Backend gửi eventName="AUTODIAL_CAMPAIGN_ENDED" hoặc trả phản hồi vbot.auto.dial không còn phone kế tiếp.',
            hostIos: {
              fn: 'AutodialManager.parseSocketMessage(_:) → handleAutoDialFinished()',
              detail: 'Chuyển state = .finished, đóng socket và chuẩn bị payload { autoDialId, campaignName }.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'AutodialManager.onSocketMessage(...) → handleAutoDialFinished()',
              detail: 'Chuyển State.FINISHED, stopRuntimeResourcesForTerminalState() và chuẩn bị payload.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
          },
          {
            stepNumber: 2,
            title: 'Host chủ động đẩy autodial_finished về Mini App',
            phase: 'host_push',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'emitEvent("autodial_finished", { autoDialId, campaignName })',
            explanation:
              'Host gọi emitEvent đẩy thẳng autodial_finished vào WebView đang mở (không cần request_id) để Mini App báo hoàn thành chiến dịch.',
            miniAppCode: `on('autodial_finished', ({ autoDialId, campaignName }) => {
  showCampaignCompletedBanner(autoDialId, campaignName);
});`,
            hostIos: {
              fn: 'MiniAppService.shared.emitMiniAppEvent("autodial_finished", data:)',
              detail: 'Đẩy qua VbMa.shared.emitEvent xuống VbMaViewController.activeInstance.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'VbMaSDK.emitEvent("autodial_finished", mapOf(...))',
              detail: 'Gọi VbMaSDK.activeBridge.sendEvent("autodial_finished", payload).',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
            responsePacket: {
              eventName: 'autodial_finished',
              json: JSON.stringify(
                { autoDialId: 151, campaignName: 'CSKH Tháng 11' },
                null,
                2,
              ),
            },
          },
          {
            stepNumber: 3,
            title: 'Server báo lỗi (error != 0) hoặc rớt WebSocket quá 3 lần retry',
            phase: 'host_process',
            from: 'server',
            to: 'host',
            dashed: true,
            arrowLabel: 'WS error != 0 hoặc hết backoff 2s → 4s → 8s',
            explanation:
              'Nếu mất kết nối khi đang không bận gọi, Host tự reconnect tối đa 3 lần theo cấp số nhân (2s, 4s, 8s); nếu server trả error != 0 hoặc hết 3 lần thử, chiến dịch dừng ở trạng thái error.',
            hostIos: {
              fn: 'AutodialManager.handleConnectionFailure() / connectWebSocket() / parseSocketMessage() → handleAutoDialError(_:)',
              detail: 'Đều gọi handleAutoDialError() ở cả nhánh lỗi server, thiếu session_id, WS URL không hợp lệ lẫn hết 3 lần reconnect (2s/4s/8s).',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'AutodialManager.handleConnectionFailure() → handleAutoDialError(...)',
              detail: 'Đều gọi handleAutoDialError() ở cả nhánh lỗi server, thiếu session_id lẫn hết 3 lần reconnect.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
          },
          {
            stepNumber: 4,
            title: 'Host đẩy autodial_error về Mini App',
            phase: 'host_push',
            from: 'host',
            to: 'miniapp',
            dashed: true,
            arrowLabel: 'emitEvent("autodial_error", { autoDialId, message })',
            explanation:
              'Cả Host iOS và Android đều đẩy sự kiện autodial_error về Mini App ở mọi nhánh lỗi (server error, thiếu session_id, WS URL không hợp lệ và hết 3 lần reconnect). Mini App vẫn nên gọi get_autodial_state khi mở lại màn hình để đồng bộ nếu lỗi xảy ra lúc WebView đang đóng.',
            miniAppCode: `on('autodial_error', ({ autoDialId, message }) => {
  showErrorToast(message);
});`,
            hostIos: {
              fn: 'AutodialManager.handleAutoDialError(_:) → emitMiniAppEvent("autodial_error")',
              detail: 'Phát đầy đủ event autodial_error cho mọi kịch bản lỗi server, thiếu session_id, WS URL không hợp lệ và hết 3 lần reconnect.',
              codeRef: 'VBot/Service/AutodialManager.swift',
            },
            hostAndroid: {
              fn: 'AutodialManager.handleAutoDialError(msg) → VbMaSDK.emitEvent("autodial_error")',
              detail: 'Phát đầy đủ event autodial_error cho mọi kịch bản lỗi WS/server.',
              codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
            },
            responsePacket: {
              eventName: 'autodial_error',
              json: JSON.stringify(
                { autoDialId: 151, message: 'Failed to connect to server after 3 attempts' },
                null,
                2,
              ),
            },
          },
        ],
      },
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Mini App đăng ký listener & gửi lệnh start_autodial',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: "postEvent('request_host_action', 'start_autodial')",
        explanation:
          'Mini App đăng ký host_action_result (khớp request_id), autodial_finished, autodial_error rồi gọi postEvent("request_host_action", { action: "start_autodial", payload }). SDK Host trên iOS/Android cũng hỗ trợ gọi thẳng method "start_autodial" qua handleDirectHostAction.',
        miniAppCode: `import { on, postEvent } from '@vbotma/sdk';

const requestId = crypto.randomUUID();
const offResult = on('host_action_result' as any, (res: any) => {
  if (res.request_id !== requestId) return;
  offResult();
  console.log('Autodial state:', res.state, 'hotline:', res.hotline);
});

postEvent('request_host_action' as any, {
  request_id: requestId,
  action: 'start_autodial',
  payload: {
    autoDialId: 151,
    hotline: '02499998888',
    campaignName: 'CSKH Tháng 11',
  },
});`,
        wirePacket: {
          channel: 'VbMABridge.post("request_host_action", jsonString)',
          json: JSON.stringify(
            {
              eventType: 'request_host_action',
              eventData: {
                request_id: 'req-ad-01',
                action: 'start_autodial',
                payload: {
                  autoDialId: 151,
                  hotline: '02499998888',
                  campaignName: 'CSKH Tháng 11',
                },
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.userContentController(_:didReceive:) → handleRequestHostAction(_:)',
          detail:
            'Nhận message "vbma", kiểm tra "start_autodial" nằm trong delegate.supportedHostActions.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.post(method, paramsStr) → handleRequestHostAction(data)',
          detail:
            'Parse JSONObject từ @JavascriptInterface post() và kiểm tra VbMaSDK.delegate?.supportedHostActions.contains("start_autodial").',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'VbMaSDK định tuyến lệnh vào Host AutodialManager',
        phase: 'sdk_bridge',
        from: 'sdk',
        to: 'host',
        dashed: false,
        arrowLabel: 'onHostActionRequested(requestId, "start_autodial", payload)',
        explanation:
          'SDK kiểm tra tính hợp lệ Delegate ("NO_DELEGATE" / "UNSUPPORTED_ACTION") và chuyển payload cho Host Delegate trích xuất autoDialId (> 0), hotline và campaignName.',
        hostIos: {
          fn: 'MiniAppService.onHostActionRequested(...) → AutodialManager.shared.handleAction(...)',
          detail:
            'parseStartPayload(payload) kiểm tra autoDialId > 0 và !hotline.isEmpty.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.dispatchHostAction(...) → handleStartAutodial(context, requestId, payload, callback)',
          detail:
            'Kiểm tra autoDialId == 0 || hotline.isEmpty rồi gọi AutodialManager.start(context, autoDialId, hotline, campaignName).',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'Host kiểm tra bận, mở WebSocket vbot.auto.dial & quay SIP',
        phase: 'host_process',
        from: 'host',
        to: 'server',
        dashed: false,
        arrowLabel: 'WS ws/call?session_id= → method: "vbot.auto.dial" & SIP Dial',
        explanation:
          'AutodialManager từ chối nếu đang có cuộc gọi active. Khi rảnh, Host mở WebSocket (ping 10s), gửi method "vbot.auto.dial" lấy phone/name/autoDialPhoneId, quay SIP định dạng "$hotline*$idProject*$phone", chờ hết cuộc gọi → cooldown 2000ms rồi lặp lại.',
        wirePacket: {
          channel: 'WebSocket wss://<socket_url>/ws/call?session_id=<sid>',
          json: JSON.stringify(
            {
              id: '1763604900123',
              method: 'vbot.auto.dial',
              data: {
                uid: 'u_9812',
                projectCode: 'vbot',
                autoDialId: 151,
                hotline: '02499998888',
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'AutodialManager.start(autoDialId:hotline:campaignName:) + dispatchOutgoingCall(...)',
          detail:
            'Mở URLSessionWebSocketTask, gắn CallModel.suppliedCallerName, quay Telephone.sharedInstance.startOutgoingCall() và hẹn cooldown 2.0s.',
          codeRef: 'VBot/Service/AutodialManager.swift',
        },
        hostAndroid: {
          fn: 'AutodialManager.start(context, autoDialId, hotline, campaignName)',
          detail:
            'Mở OkHttp WebSocket (backoff 2s/4s/8s), gán CallModel.miniAppDisplayName, mở NewCallActivity + VBotPhone.startOutgoingCall() và delay 2000ms.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/manager/AutodialManager.kt',
        },
      },
      {
        stepNumber: 4,
        title: 'Host trả snapshot state tức thì qua host_action_result',
        phase: 'host_reply',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'sendEvent("host_action_result", { request_id, ...toStateMap() })',
        explanation:
          'Host gộp request_id + success + toStateMap() đẩy về WebView qua VbMA.receive("host_action_result", ...), giúp Mini App chuyển UI sang trạng thái "connecting".',
        miniAppCode: `on('host_action_result' as any, (res: any) => {
  if (res.request_id !== requestId) return;
  if (!res.success) return showToast(res.message);
  setCampaignState(res.state);
});`,
        hostIos: {
          fn: 'VbMaViewController.sendEvent("host_action_result", payload: result)',
          detail: 'Inject JS gọi VBot.WebView.receiveEvent & VbMA.receive kèm toStateMap().',
          codeRef: 'VBot/Service/AutodialManager.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.sendEvent("host_action_result", resultJson)',
          detail: 'Đẩy evaluateJavascript("VbMA.receive(\'host_action_result\', ...)") trên Main Looper.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
        responsePacket: {
          eventName: 'host_action_result',
          json: JSON.stringify(
            {
              request_id: 'req-ad-01',
              success: true,
              state: 'connecting',
              autoDialId: 151,
              campaignName: 'CSKH Tháng 11',
              hotline: '02499998888',
              totalCalled: 0,
              currentPhone: null,
              currentName: null,
              autoDialPhoneId: null,
              error: null,
            },
            null,
            2,
          ),
        },
      },
    ],
  },
  {
    id: 'flow-token-401',
    title: 'Launch Params, Xin Token & Tự phục hồi khi 401',
    shortTitle: 'Token & Tự phục hồi 401',
    subtitle: 'retrieveLaunchParams() + requestMiniAppToken / requestModuleToken(force)',
    miniAppId: 'VbMaSDK (Global)',
    categoryBadge: 'Auth & Security',
    summary:
      'Mini App đọc context khởi chạy từ URL hash (theme, isAdmin, apiBaseUrl), xin MiniAppToken / ModuleToken qua Host mà không lộ root refresh token, và tự ép Host cấp lại token mới (force = true) khi API trả HTTP 401.',
    relatedNodeId: 'vbot-app',
    steps: [
      {
        stepNumber: 1,
        title: 'Mini App đọc Launch Params & auth bootstrap khi vừa tải trang',
        phase: 'miniapp_call',
        from: 'host',
        to: 'miniapp',
        dashed: false,
        arrowLabel: 'URL Hash #vbma_data=...&vbma_theme=...&vbma_api_base_url=...',
        explanation:
          'Khi mở WebView (inline hoặc modal), Host nạp launch params vào hash fragment (#) và bơm sẵn VbMABridge vào window. Mini App đọc ngay synchronously bằng retrieveLaunchParams(), retrieveAuthData() và isAdmin() để có theme, locale, projectCode, apiBaseUrl và cờ isAdmin.',
        miniAppCode: `import { retrieveLaunchParams, retrieveAuthData, isAdmin, postEvent } from '@vbotma/sdk';

const launch = retrieveLaunchParams();
const auth = retrieveAuthData();
const adminMode = isAdmin(); // auth?.isAdmin === true

const apiBaseUrl = launch.apiBaseUrl; // VD: https://api-h01.vbot.vn
postEvent('ready'); // Báo Native tắt loading skeleton`,
        hostIos: {
          fn: 'MiniAppService.openMiniApp(...) / VbMa.shared.createMiniAppViewController(...)',
          detail:
            'Truyền isAdmin, theme_params, themeParams vào extraData; inject WKUserScript bridge "vbma" ở documentStart; phục vụ local bundle qua scheme miniapp://.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.openMiniApp(...) / MiniAppFragment.newInstance(...)',
          detail:
            'Đóng gói themeParams + isAdmin qua MiniAppThemeParams.mergeThemeExtraData, gắn WebView @JavascriptInterface "VbMABridge".',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'Mini App xin MiniAppToken hoặc ModuleToken từ Host Bridge',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: 'requestMiniAppToken() / requestModuleToken("CRM")',
        explanation:
          'Mini App KHÔNG dùng root token mà gọi requestMiniAppToken() (cho API gốc như Danh bạ) hoặc requestModuleToken("CRM") (cho API gắn module). SDK tạo request_id UUID, gửi lệnh lên bridge và chờ event kết quả.',
        miniAppCode: `import { requestMiniAppToken, requestModuleToken } from '@vbotma/sdk';

// Cho API không gắn module (VD: User Contact CRUD)
const baseToken = await requestMiniAppToken();

// Cho API theo module (CRM, TICKET, REPORT...)
const crmToken = await requestModuleToken('CRM');`,
        wirePacket: {
          channel: 'VbMABridge.post("request_module_token", jsonString)',
          json: JSON.stringify({ request_id: 'req-tok-1', module: 'CRM' }, null, 2),
        },
        hostIos: {
          fn: 'VbMaViewController.handleRequestMiniAppToken / handleRequestModuleToken',
          detail:
            'Kiểm tra RAM cache (tính TTL theo expiresAt / JWT exp, fallback 900s trừ hao 300s). Trên iOS đã được MiniAppService.prewarmMiniAppTokenIfNeeded() làm ấm từ lúc app mở (throttle 600s).',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.handleRequestMiniAppToken / handleRequestModuleToken → VbMaMiniAppTokenService',
          detail:
            'Nếu cache còn hạn trả ngay qua sendEvent; nếu hết hạn mới gọi GET /api/User/getTokenMiniApp (Android chưa pre-warm MiniAppToken lúc khởi động).',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'API nghiệp vụ trả 401 → Mini App gọi force refresh (force = true)',
        phase: 'server_os',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: 'requestModuleToken("CRM", 5000, true)',
        explanation:
          'Nếu token hết hạn hoặc bị thu hồi giữa chừng khiến API trả 401, Mini App gọi lại với tham số thứ 3 force = true. Khi nhận force: true, VbMaSDK buộc phải bỏ qua RAM cache và xin lại từ Server.',
        miniAppCode: `let res = await fetch(\`\${apiBaseUrl}/api/Customer/list\`, {
  headers: { Authorization: \`Bearer \${token}\` },
});
if (res.status === 401) {
  // Ép SDK & Host bỏ cache lấy token mới
  const freshToken = await requestModuleToken('CRM', 5000, true);
  res = await fetch(\`\${apiBaseUrl}/api/Customer/list\`, {
    headers: { Authorization: \`Bearer \${freshToken}\` },
  });
}`,
        wirePacket: {
          channel: 'VbMABridge.post("request_module_token", jsonString)',
          json: JSON.stringify({ request_id: 'req-tok-2', module: 'CRM', force: true }, null, 2),
        },
        hostIos: {
          fn: 'VbMaViewController + MiniAppService.refreshHostToken()',
          detail:
            'Xóa cache module token, gọi lại API cấp token; nếu chính root access token của Host hết hạn thì gọi BaseService.reLoginWithToken() rồi prewarm lại.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge → MiniAppHelper.delegate.refreshHostToken()',
          detail:
            'Xóa cache token module, nếu cần gọi API.service.refreshToken(refreshKey).blockingFirst() + syncCallSDKSession().',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 4,
        title: 'Host gọi Backend làm mới token & xử lý nếu Refresh Token chết hẳn',
        phase: 'host_process',
        from: 'host',
        to: 'server',
        dashed: false,
        arrowLabel: 'GET getTokenMiniApp / refreshToken',
        explanation:
          'Host dùng root access token / refresh key gọi backend VBot để đổi MiniAppToken/ModuleToken mới. Nếu chính refresh_token đã bị thu hồi (HTTP 400/401/403), Android lập tức dọn SharedPrefs + ModuleTokenCache + VbMaSDK.logout() và đưa app về màn Login 1 lần duy nhất (sessionExpiredNavigated).',
        hostIos: {
          fn: 'BaseService.reLoginWithToken + VbMaMiniAppTokenService',
          detail: 'Cấp lại token mới và cập nhật TokenManager; gọi lại prewarmMiniAppTokenIfNeeded(force: true).',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.refreshHostToken() + ensureNotForceLoggingOutBeforeRefresh()',
          detail:
            'Chặn refresh nếu đang force-logout. Nếu HTTP 400/401/403 xóa credential, reset AutodialManager, VbMaSDK.logout() và chuyển màn Login.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 5,
        title: 'SDK trả token mới về cho Promise của Mini App',
        phase: 'host_reply',
        from: 'sdk',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'module_token_result / mini_app_token_result',
        explanation:
          'Native gọi sendEvent("module_token_result" | "mini_app_token_result", { request_id, token, expiresAt }). Hàm requestModuleToken / requestMiniAppToken khớp request_id và resolve Promise cho Mini App retry request.',
        responsePacket: {
          eventName: 'module_token_result',
          json: JSON.stringify(
            {
              request_id: 'req-tok-2',
              module: 'CRM',
              token: 'eyJhbGciOiJIUzI1NiIs...',
              tokenType: 'Bearer',
              expiresAt: '2026-11-20T03:00:00.000Z',
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.sendEvent("module_token_result", payload: ...)',
          detail: 'Phản hồi khớp request_id để Promise resolve.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.sendEvent("module_token_result", response)',
          detail: 'Phản hồi khớp request_id để Promise resolve.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
        parityWarning:
          'Lệch Parity: iOS chủ động pre-warm MiniAppToken từ sớm (throttle 600s); Android lấy lazy ở lần gọi đầu và VbMaMiniAppTokenService chưa tự gắn callRefreshTokenAPI khi endpoint trả 401 — Mini App nên luôn giữ nhánh fallback retry khi HTTP 401.',
      },
    ],
  },
  {
    id: 'flow-make-call',
    title: 'Khởi tạo cuộc gọi đi từ Mini App (make_call)',
    shortTitle: 'make_call (Gọi đi)',
    subtitle: 'vb-ma-crm / vb-ma-user-contact / vb-ma-user-history-call → CallKit / PJSIP',
    miniAppId: 'vb-ma-crm',
    categoryBadge: 'Core SDK Call',
    summary:
      'Mini App gọi hàm makeCall({ phoneNumber, displayName, typeCall, hotline }) để nhờ Host App dựng giao diện cuộc gọi native và quay số SIP qua TelephoneSDK / PJSIP mà giữ nguyên được tên khách hàng.',
    relatedNodeId: 'call-out-start',
    steps: [
      {
        stepNumber: 1,
        title: 'Mini App gọi makeCall() của @vbotma/sdk',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: 'makeCall({ phoneNumber, displayName, hotline? })',
        explanation:
          'Mini App dùng hàm chuẩn makeCall() (hỗ trợ cả kiểu object mới lẫn makeCall(phone, opts) cũ). SDK tự sinh UUID request_id, timeout 15s và bọc tham số vào object callee_info.',
        miniAppCode: `import { makeCall } from '@vbotma/sdk';

const res = await makeCall({
  phoneNumber: '0987654321',
  displayName: 'Nguyễn Văn A',
  typeCall: 'app_to_phone', // hoặc 'app_to_app'
  hotline: '02499998888',   // optional
  payload: { customerId: 1024 },
});

if (!res.success) {
  console.warn('Gọi thất bại:', res.reason, res.message);
}`,
        wirePacket: {
          channel: 'VbMABridge.post("make_call", jsonString)',
          json: JSON.stringify(
            {
              eventType: 'make_call',
              eventData: {
                request_id: 'req-call-99',
                callee_info: {
                  phoneNumber: '0987654321',
                  displayName: 'Nguyễn Văn A',
                  typeCall: 'app_to_phone',
                  hotline: '02499998888',
                  payload: { customerId: 1024 },
                },
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.handleRequestCall(_:) → delegate.onRequestCall(payload:)',
          detail: 'Chuyển tiếp payload sang MiniAppService.shared.onRequestCall(payload:).',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.handleRequestCall(data) → delegate.onRequestCall(requestId, payload, callback)',
          detail: 'Chuyển tiếp JSONObject payload sang MiniAppHelper.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'Host phân giải Hotline, tên khách hàng & điều phối quay số',
        phase: 'host_process',
        from: 'host',
        to: 'server',
        dashed: false,
        arrowLabel: 'VPMAppService.makeCall / ChooseHotlineCallBottomSheet + PJSIP INVITE',
        explanation:
          'Host tách callee_info (hoặc đọc payload phẳng nếu app cũ như vb-ma-crm gửi thẳng phoneNumber), kiểm tra SĐT hợp lệ. Nếu là app_to_phone: iOS gọi VPMAppService.makeCall và lưu suppliedCallerName; Android kiểm tra hotline mặc định — nếu chưa có và dự án có ≥2 hotline sẽ bật ChooseHotlineCallBottomSheet trước khi gọi makeDirectCall() + gán CallModel.miniAppDisplayName.',
        hostIos: {
          fn: 'MiniAppService.onRequestCall(payload:) → VPMAppService.makeCall(name:phone:isVPM:...)',
          detail:
            'Hỗ trợ cả format callee_info lồng lẫn payload phẳng. Nếu thiếu phoneNumber trả MISSING_PHONE_NUMBER; ngược lại gọi TelephoneSDK quay SIP.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.handleRequestCall → showHotlinePicker (ChooseHotlineCallBottomSheet) / makeDirectCall(...)',
          detail:
            'Dùng AtomicBoolean one-shot guard; nếu chưa có hotline mặc định & không phải 1 hotline duy nhất sẽ bật ChooseHotlineCallBottomSheet đợi user chọn/hủy. Khi gọi: nếu active call đang tồn tại thì endCall() chờ 200ms; gắn CallModel.miniAppDisplayName, mở NewCallActivity + VBotPhone.startOutgoingCall("$hotline*$idProject*$phone") và trả Result<Unit>.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'Host App đẩy call_result về khớp request_id',
        phase: 'host_reply',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'sendEvent("call_result", { request_id, success })',
        explanation:
          'Host phát call_result. SDK khớp request_id để resolve CallResult { success, reason, message } cho Promise makeCall().',
        responsePacket: {
          eventName: 'call_result',
          json: JSON.stringify(
            {
              request_id: 'req-call-99',
              success: true,
              reason: null,
              message: null,
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'MiniAppService.onRequestCall → response(requestId:success:true)',
          detail: 'Trả về sau khi đã dispatch VPMAppService.makeCall trên MainActor.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.handleRequestCall → settle(...) → VbMABridge.sendEvent("call_result", json)',
          detail:
            'Đã bỏ timer 200ms. Settle đúng 1 lần (AtomicBoolean): trả success: true ngay khi makeDirectCall() thành công; trả success: false với reason "USER_CANCELLED" nếu đóng ChooseHotlineCallBottomSheet, "NO_HOTLINE" nếu không có hotline, hoặc "ERROR" nếu lỗi.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
        parityWarning:
          'Khác biệt mã reason: iOS validate MISSING_PHONE_NUMBER rồi trả success=true ngay sau khi dispatch VPMAppService.makeCall; Android (đã bỏ timer 200ms) chờ ChooseHotlineCallBottomSheet rồi trả success=true hoặc reason USER_CANCELLED / NO_HOTLINE / ERROR.',
      },
      {
        stepNumber: 4,
        title: 'Sau khi cuộc gọi kết thúc: đồng bộ lại dữ liệu',
        phase: 'host_push',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'refresh_data { reason: "call_ended" } / NewCallActivity',
        explanation:
          'Trong lúc gọi, màn đàm thoại dùng UI Native (cả iOS và Android cố tình không đăng ký CallActionBridgeHelper.SUPPORTED_ACTIONS). Khi dập máy ở Tab Lịch sử, Host đẩy event refresh_data để Mini App tải lại lịch sử mới mà không mất vị trí lọc.',
        hostIos: {
          fn: 'VPMAppService / UserHistoryCallViewController → emitMiniAppEvent("refresh_data")',
          detail: 'Thông báo Mini App làm mới nhật ký khi quay về từ cuộc gọi.',
          codeRef: 'VBot/Controller/NewController/Recents/UserHistoryCallViewController.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.handleCallEndedForMiniApps()',
          detail: 'Ghi nhận thời điểm kết thúc cuộc gọi và đóng in-call state nếu có.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
    ],
  },
  {
    id: 'flow-monitoring',
    title: 'Giám sát & Can thiệp cuộc gọi (vb-ma-monitoring)',
    shortTitle: 'Giám sát (Monitor Call)',
    subtitle: 'listen / whisper / capture / capture_bot → SIP 1# / 2# / 4# / 5#',
    miniAppId: 'vb-ma-monitoring',
    categoryBadge: 'Dedicated Bridge + SIP',
    summary:
      'Mini App Giám sát gửi lệnh monitor_call kèm action & transId; Host khóa slot nguyên tử chống bấm đúp, miễn quyền Micro nếu chỉ Nghe lén ("listen"), nối SIP bằng mã 1#/2#/4#/5# + transId và báo trạng thái về.',
    relatedNodeId: 'ma-monitoring',
    steps: [
      {
        stepNumber: 1,
        title: 'Mini App gọi monitor_call & lắng nghe monitor_call_result',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: "postEvent('monitor_call', { action, transId })",
        explanation:
          'Mini App chọn 1 trong 4 hành động hợp lệ: "listen" (Nghe lén), "whisper" (Nhắc thầm), "capture" (Giành cuộc gọi), "capture_bot" (Giành từ Bot) kèm transId của cuộc gọi đang diễn ra.',
        miniAppCode: `import { on, postEvent } from '@vbotma/sdk';

const requestId = crypto.randomUUID();
on('monitor_call_result' as any, (res: any) => {
  if (res.request_id !== requestId) return;
  if (!res.success && res.reason === 'CALL_BUSY') {
    alert('Bạn đang có cuộc gọi hoặc phiên giám sát khác');
  }
});
on('monitor_call_state_changed' as any, (ev: any) => {
  console.log('Trạng thái giám sát:', ev.state, ev.reason);
});

postEvent('monitor_call' as any, {
  request_id: requestId,
  action: 'whisper',
  transId: 'tr_9045218a',
  callerName: '0912345678',
  calleeName: 'Nguyễn Thị C (Agent)',
});`,
        wirePacket: {
          channel: 'VbMABridge.post("monitor_call", jsonString)',
          json: JSON.stringify(
            {
              eventType: 'monitor_call',
              eventData: {
                request_id: 'req-mon-1',
                action: 'whisper',
                transId: 'tr_9045218a',
                callerName: '0912345678',
                calleeName: 'Nguyễn Thị C',
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.handleMonitorCall(_:) → delegate.onMonitorCall(...)',
          detail: 'Validate transId/action tại SDK rồi chuyển tới MiniAppService.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.handleMonitorCall(data) → delegate.onMonitorCall(...)',
          detail: 'Kiểm tra transId không rỗng, action thuộc 4 giá trị hợp lệ (nếu sai trả INVALID_ACTION).',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'Host kiểm tra quyền Admin & Khóa slot nguyên tử (Anti-Double-Tap)',
        phase: 'host_process',
        from: 'host',
        to: 'host',
        dashed: false,
        arrowLabel: 'Admin check + tryAcquireMonitoringSlot()',
        explanation:
          'Host kiểm tra quyền (Release yêu cầu Admin/Manager trên iOS & Android) và thử giành slot giám sát nguyên tử. Nếu thiết bị đang gọi SIP hoặc đang giám sát cuộc khác, Host trả CALL_BUSY; nếu phát hiện cờ kẹt cũ (isMonitoringCall=true nhưng không có cuộc gọi thật), Host tự dọn stale_cleanup trước khi cấp slot mới.',
        hostIos: {
          fn: 'VbMonitoringCallHelper.validateMonitorRequest + MiniAppMonitoringCoordinator.tryAcquireMonitoringSlot',
          detail: 'Reserve VPMAppService.isMonitoringCall = true ngay trên @MainActor để chặn bấm đúp.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.tryAcquireMonitoringSlot(isPhoneCallActive) (synchronized monitorLock)',
          detail: 'Kiểm tra isAdmin + VBotPhone.isCallActive() + dọn phiên stale nếu bị treo.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'Host trả monitor_call_result (CONNECTING / CALL_BUSY) ngay lập tức',
        phase: 'host_reply',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'monitor_call_result { status: "CONNECTING" }',
        explanation:
          'Ngay sau khi khóa được slot (hoặc từ chối CALL_BUSY), Host phản hồi tức thì status = "CONNECTING" kèm action & transId để Mini App hiển thị trạng thái đang kết nối.',
        responsePacket: {
          eventName: 'monitor_call_result',
          json: JSON.stringify(
            {
              request_id: 'req-mon-1',
              action: 'whisper',
              transId: 'tr_9045218a',
              success: true,
              status: 'CONNECTING',
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMonitoringCallHelper.buildMonitorCallResultPayload(..., status: .CONNECTING)',
          detail: 'Trả CONNECTING hoặc CALL_BUSY về VbMaViewController.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.buildMonitorCallConnectingResult / buildMonitorCallBusyResult',
          detail: 'Trả CONNECTING ngay trước khi hỏi quyền RECORD_AUDIO (nếu cần).',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 4,
        title: 'Xin quyền Micro (miễn cho listen) & Quay SIP mã can thiệp',
        phase: 'server_os',
        from: 'host',
        to: 'server',
        dashed: false,
        arrowLabel: 'SIP INVITE 1#/2#/4#/5#<transId>',
        explanation:
          'Riêng action "listen" (Nghe lén 1 chiều) KHÔNG hỏi quyền Micro trên cả iOS lẫn Android. Các action nói được ("capture", "capture_bot", "whisper") bắt buộc kiểm tra/xin quyền Micro; nếu user từ chối thì giải phóng slot và Cleanup. Khi hợp lệ, quay SIP tới: listen="1#<transId>", capture="2#<transId>", capture_bot="4#<transId>", whisper="5#<transId>".',
        hostIos: {
          fn: 'MiniAppMonitoringCoordinator.checkOrRequestMicAndStart → VPMAppService.startMonitoringCall(...)',
          detail: 'Chạy PJSIP qua TelephoneSDK và mở giao diện giám sát native.',
          codeRef: 'VBot/Service/MiniAppMonitoringCoordinator.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.requiresMicForMonitoring / buildMonitoringRawTarget → startMonitoringSipCall',
          detail:
            'Đăng ký VBotPhoneListener, update VbMaCallStateManager (tắt mic ở native AudioManager nếu listen) và mở PiP native.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 5,
        title: 'Cập nhật trạng thái kết nối & ngắt giám sát về Mini App',
        phase: 'host_push',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'monitor_call_state_changed (iOS & Android)',
        explanation:
          'Khi cuộc gọi giám sát chuyển sang ACTIVE hoặc DISCONNECTED (kèm reason), cả iOS và Android đều đẩy sự kiện monitor_call_state_changed xuống Mini App. Android đồng thời cập nhật VbMaCallStateManager để hiển thị trên native PiP.',
        hostIos: {
          fn: 'MiniAppService.sendMonitorCallStateChanged(requestId:state:reason:)',
          detail: 'Emit "monitor_call_state_changed" xuống Mini App mỗi khi đổi state hoặc cleanupMonitoring.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.onMonitoringCallStateChanged / cleanupMonitoring → sendMonitorCallStateChanged(...)',
          detail:
            'Phát tối đa 1 lần ACTIVE và 1 lần DISCONNECTED (kèm reason) qua VbMaSDK.emitEvent("monitor_call_state_changed"), đồng thời cập nhật VbMaCallStateManager cho native PiP.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
    ],
  },
  {
    id: 'flow-user-contact',
    title: 'Đồng bộ Danh bạ cá nhân & Chống lặp (vb-ma-user-contact)',
    shortTitle: 'Danh bạ (SQLite & Anti-Loop)',
    subtitle: 'Tab 3 Inline · 5 action user_contact_* ↔ SQLite theo uid',
    miniAppId: 'vb-ma-user-contact',
    categoryBadge: 'Inline Tab + SQLite',
    summary:
      'Mini App Danh bạ cá nhân nhúng cố định ở Tab 3 (startParam="embedded"), dùng 5 lệnh user_contact_* để đọc/nhập/xóa danh bạ trong SQLite nội bộ (phân vùng theo uid) mà không chạm API trùng lặp, kèm cơ chế chống vòng lặp khi phát user_contacts_updated.',
    relatedNodeId: 'contact-personal',
    steps: [
      {
        stepNumber: 1,
        title: 'Host nhúng Tab 3 với startParam = "embedded" & thanh tìm kiếm native',
        phase: 'miniapp_call',
        from: 'host',
        to: 'miniapp',
        dashed: false,
        arrowLabel: 'createMiniAppViewController(appId="vb-ma-user-contact", startParam="embedded")',
        explanation:
          'MainActivity / TabBar giữ sống WebView Danh bạ (Android add/show/hide Fragment). Khi chuyển tab sang Tab 3, Host đẩy event refresh_data và có thể đẩy toggle_actions_menu khi user bấm nút + trên header native.',
        hostIos: {
          fn: 'UserContactsMiniAppViewController → VbMa.shared.createMiniAppViewController(...)',
          detail: 'Nhúng nội tuyến UIKit, nhận thông báo cập nhật danh bạ để đồng bộ hai chiều.',
          codeRef: 'VBot/Controller/NewController/Contact/UserContactsMiniAppViewController.swift',
        },
        hostAndroid: {
          fn: 'UserContactsFragment → MiniAppFragment.newInstance(appId = "vb-ma-user-contact", startParam = "embedded")',
          detail: 'Đăng ký Activity permission launcher READ_CONTACTS cho UserContactMiniAppBridgeHelper.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/phone/UserContactsFragment.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'Mini App gọi 5 action user_contact_* qua request_host_action',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: 'user_contact_get_local / import_device / delete_local / ...',
        explanation:
          'Thay vì tự đọc danh bạ điện thoại (WebView không truy cập được danh bạ OS), Mini App gửi 5 lệnh chuẩn: user_contact_get_local (lấy SQLite + status quyền danh bạ), user_contact_import_device (mở xin quyền OS & nhập danh bạ máy), user_contact_refresh_server, user_contact_delete_local (gửi localKeys/syncedIds), và user_contact_open_settings.',
        miniAppCode: `// 1. Lấy danh sách danh bạ local + trạng thái quyền OS
postEvent('request_host_action' as any, {
  request_id: reqId,
  action: 'user_contact_get_local',
  payload: {},
});

// 2. Xóa bản ghi trong SQLite sau khi đã gọi API xóa trên Server
postEvent('request_host_action' as any, {
  request_id: reqDelId,
  action: 'user_contact_delete_local',
  payload: { syncedIds: [1201, 1202], localKeys: ['loc_abc'] },
});`,
        wirePacket: {
          channel: 'VbMABridge.post("request_host_action", jsonString)',
          json: JSON.stringify(
            {
              eventType: 'request_host_action',
              eventData: {
                request_id: 'req-uc-01',
                action: 'user_contact_delete_local',
                payload: { syncedIds: [1201], localKeys: ['loc_abc'] },
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'MiniAppService → UserContactMiniAppBridgeHelper.handleAction(requestId:action:payload:)',
          detail: 'Parse delete payload bằng parseDeletePayload(payload) và thao tác SQLite/CNContactStore.',
          codeRef: 'VBot/Service/UserContactMiniAppBridgeHelper.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper → UserContactMiniAppBridgeHelper.handleAction(hostCtx, requestId, action, payload, callback)',
          detail: 'Chạy trên SingleThread IO Executor, cập nhật SQLite (vbot_user_contact.db) rồi trả callback về Main Handler.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/UserContactMiniAppBridgeHelper.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'Host thao tác SQLite (phân vùng theo uid) & Xin quyền danh bạ OS',
        phase: 'host_process',
        from: 'host',
        to: 'server',
        dashed: false,
        arrowLabel: 'SQLite (local_key, uid) + CNContactStore / ContactsContract',
        explanation:
          'Host đọc/ghi SQLite phân biệt theo uid hiện tại để tránh rò danh bạ khi đổi tài khoản. Với user_contact_import_device: kiểm tra quyền CNContactStore (iOS hỗ trợ trạng thái "limited") hoặc Android READ_CONTACTS; nếu bị từ chối trả denied/restricted hoặc hasPromptedReadContacts.',
        hostIos: {
          fn: 'UserContactDatabaseHelper + CNContactStore.authorizationStatus(for: .contacts)',
          detail: 'Map trạng thái quyền (authorized/limited/denied/not_determined) và serialize Contact.',
          codeRef: 'VBot/Service/UserContactMiniAppBridgeHelper.swift',
        },
        hostAndroid: {
          fn: 'UserContactDatabaseHelper (PK local_key, uid) + UserContactManager',
          detail:
            'Đồng bộ READ_CONTACTS bằng permissionLock; bảo toàn chính xác số nguyên 64-bit MAX_EXACT_LONG_EXCLUSIVE_AS_DOUBLE.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/UserContactMiniAppBridgeHelper.kt',
        },
        parityWarning:
          'Lệch Parity: iOS 18+ có permissionStatus = "limited" và trả thêm trường limited trong payload; Android chỉ có granted / denied (kèm logic hasPromptedReadContacts).',
      },
      {
        stepNumber: 4,
        title: 'Host trả dữ liệu danh bạ về qua host_action_result',
        phase: 'host_reply',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'host_action_result { success, permissionStatus, contacts[] }',
        explanation:
          'Mọi lệnh user_contact_* trả về trong host_action_result kèm request_id, permissionStatus hiện tại và mảng contacts (với id, localKey, uid, fullName, phone, avatarColor, isSynced, sectionLetter).',
        responsePacket: {
          eventName: 'host_action_result (user_contact_get_local)',
          json: JSON.stringify(
            {
              request_id: 'req-uc-01',
              success: true,
              permissionStatus: 'authorized',
              contacts: [
                {
                  id: 1201,
                  localKey: 'loc_99',
                  uid: 'u_9812',
                  fullName: 'Lê Minh D',
                  phone: '0909111222',
                  avatarColor: '#1076BE',
                  isSynced: true,
                  sectionLetter: 'L',
                },
              ],
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'UserContactMiniAppBridgeHelper.serializeContacts(_:)',
          detail: 'Chuẩn hóa danh sách JSON đồng bộ 8 trường sang Swift -> WebView.',
          codeRef: 'VBot/Service/UserContactMiniAppBridgeHelper.swift',
        },
        hostAndroid: {
          fn: 'UserContactMiniAppBridgeHelper → callback(resultMap)',
          detail: 'Trả JSONObject cùng schema 8 trường mỗi contact.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/UserContactMiniAppBridgeHelper.kt',
        },
      },
      {
        stepNumber: 5,
        title: 'Chống vòng lặp vô tận khi đồng bộ user_contacts_updated',
        phase: 'host_push',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'user_contacts_updated { contacts[], reason }',
        explanation:
          'Khi cuộc gọi hoặc màn khác sửa SQLite, Host phát event "user_contacts_updated" để WebView cập nhật mà không cần gọi lại API. Để tránh vòng lặp vô tận (WebView xóa -> Host báo NotificationCenter -> WebView lại reload), 2 OS xử lý khác nhau nhưng Mini App chỉ cần lắng nghe event này để render lại.',
        hostIos: {
          fn: 'UserContactsMiniAppViewController (gắn userInfo["source"] = "miniapp_bridge")',
          detail: 'Bỏ qua Notification do chính miniapp_bridge vừa phát ra, chỉ đẩy lên JS khi thay đổi đến từ nguồn bên ngoài.',
          codeRef: 'VBot/Service/UserContactMiniAppBridgeHelper.swift',
        },
        hostAndroid: {
          fn: 'UserContactMiniAppBridgeHelper (so khớp chữ ký lastDeliveredSignature)',
          detail: 'Hash toàn bộ danh sách đang có bằng computeContactsSignature(); nếu trùng chữ ký lần giao trước thì không emit nữa.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/UserContactMiniAppBridgeHelper.kt',
        },
        parityWarning:
          'Cơ chế chặn lặp khác nhau giữa 2 OS (iOS gắn source tag Notification; Android hash signature danh sách), nhưng kết quả hợp đồng về JS đều an toàn như nhau.',
      },
    ],
  },
  {
    id: 'flow-permissions',
    title: 'Kiểm tra quyền 2 tầng (Manifest + Host RBAC)',
    shortTitle: 'Kiểm tra quyền (RBAC 2 tầng)',
    subtitle: 'isAdmin() + checkPermissions(module, actions) → permissions_result',
    miniAppId: 'VbMaSDK (Global Hub)',
    categoryBadge: 'Core SDK RBAC',
    summary:
      'Mini App kiểm tra quyền thao tác (Xem, Thêm, Sửa, Xóa, Hiện SĐT...) an toàn dựa trên 2 tầng: Tầng 1 kiểm tra khai báo trong Manifest của Mini App trên Platform, Tầng 2 kiểm tra bảng quyền RBAC của tài khoản trên Host App.',
    relatedNodeId: 'miniapp-list',
    steps: [
      {
        stepNumber: 1,
        title: 'Mini App dùng isAdmin() đồng bộ hoặc gọi checkPermissions()',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: "checkPermissions('CRM', ['VIEW', 'ADD', 'HIEN_SO_DIEN_THOAI'])",
        explanation:
          'Với kiểm tra vai trò chủ dự án dùng isAdmin() (không cần await). Với quyền chi tiết từng action (VD ẩn nút Thêm hoặc che số điện thoại khách hàng), gọi checkPermission() hoặc checkPermissions(module, actions[]).',
        miniAppCode: `import { isAdmin, checkPermissions } from '@vbotma/sdk';

if (isAdmin()) {
  // Admin dự án luôn có toàn quyền
} else {
  const perms = await checkPermissions('CRM', [
    'VIEW',
    'ADD',
    'DELETE',
    'HIEN_SO_DIEN_THOAI',
  ]);
  canShowPhone.value = perms.HIEN_SO_DIEN_THOAI;
}`,
        wirePacket: {
          channel: 'VbMABridge.post("check_permissions", jsonString)',
          json: JSON.stringify(
            {
              eventType: 'check_permissions',
              eventData: {
                request_id: 'req-perm-7',
                module: 'CRM',
                actions: ['VIEW', 'ADD', 'DELETE', 'HIEN_SO_DIEN_THOAI'],
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.handleCheckPermissions(_:)',
          detail: 'Kiểm tra Tầng 1 (App Manifest nếu có) trước khi gọi Delegate checkPermissionsBatch.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.handleCheckPermissions(data)',
          detail: 'Kiểm tra Manifest (v1.3+) rồi chuyển xuống MiniAppService/MiniAppHelper onCheckPermissions.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'Host ánh xạ tên module song ngữ & tra cứu bảng quyền RBAC',
        phase: 'host_process',
        from: 'sdk',
        to: 'host',
        dashed: false,
        arrowLabel: 'onCheckPermissions(module, actions) → CRM ⇒ KHACH_HANG',
        explanation:
          'Host ánh xạ tên chuẩn tiếng Anh của Mini App sang mã module nội bộ: "CRM"/"CUSTOMER" → CUSTOMER/KHACH_HANG, "CALL" → CUOC_GOI, "CAMPAIGN" → CHIEN_DICH, "VIEW" → "SHOW". Riêng HIEN_SO_DIEN_THOAI được tra trực tiếp ở nhánh quyền khách hàng.',
        hostIos: {
          fn: 'MiniAppService.onCheckPermissions(module:actions:) → VPMRoleService',
          detail:
            'Nếu isAdminProject() trả true toàn bộ; ngược lại tra VPMRoleService.getRawPermissions(for:) & map VIEW -> SHOW.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.onCheckPermissions → MiniAppPermissionHelper.checkPermissionsBatch',
          detail:
            'Tra quyền từ LoadDataManager (Realm) + tách riêng UtilsKotlin.checkPermissionHienSoDienThoai() cho quyền xem SĐT.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'Giao kết công thức 2 tầng (Manifest AND Host RBAC)',
        phase: 'server_os',
        from: 'host',
        to: 'sdk',
        dashed: true,
        arrowLabel: 'granted = manifestAllows && (isAdmin || userHasPermission)',
        explanation:
          'Ngay cả khi User là Admin dự án, nếu file manifest của Mini App không khai báo quyền đó thì SDK tầng 1 vẫn từ chối (trừ phi manifest không giới hạn), đảm bảo nguyên tắc đặc quyền tối thiểu.',
        hostIos: {
          fn: 'VbMaViewController permission evaluator',
          detail: 'Kết hợp manifest declaration + host dictionary kết quả.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.handleCheckPermissions',
          detail: 'Merge permission kết quả kèm request_id echo.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 4,
        title: 'Trả permissions_result về WebView khớp request_id',
        phase: 'host_reply',
        from: 'sdk',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'permissions_result { request_id, permissions }',
        explanation:
          'Trả map Boolean cho từng action. Nếu gọi song song nhiều checkPermissions() cùng lúc, SDK tự lọc bằng request_id nên không bị lẫn kết quả giữa các component.',
        responsePacket: {
          eventName: 'permissions_result',
          json: JSON.stringify(
            {
              request_id: 'req-perm-7',
              module: 'CRM',
              permissions: {
                VIEW: true,
                ADD: true,
                DELETE: false,
                HIEN_SO_DIEN_THOAI: true,
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'sendEvent("permissions_result", payload)',
          detail: 'Trả object { request_id, module, permissions }.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'sendEvent("permissions_result", resultJson)',
          detail: 'Trả object { request_id, module, permissions }.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
    ],
  },
  {
    id: 'flow-open-child-and-features',
    title: 'Nạp Mini App trang Tính năng & Mở Mini App con (open_mini_app)',
    shortTitle: 'Trang Tính năng & Mini App con',
    subtitle: 'fetchGlobalMiniApps() + Lọc quyền Host + vb-ma-ticket -> vb-ma-activity-history',
    miniAppId: 'vb-ma-ticket',
    categoryBadge: 'Features Hub + Chained Launch',
    summary:
      'Giải thích cách các Mini App được tải động từ vb-ma-platform (/api/apps/global) lên Trang Tính năng theo 6 nhóm, 4 lớp lọc quyền của Host, và cách 1 Mini App cha (vd vb-ma-ticket) mở Mini App con (vd vb-ma-activity-history) kèm nhận kết quả khi app con đóng.',
    relatedNodeId: 'miniapp-list',
    steps: [
      {
        stepNumber: 1,
        title: 'Host tải danh sách Mini App từ vb-ma-platform (/api/apps/global)',
        phase: 'host_process',
        from: 'host',
        to: 'server',
        dashed: false,
        arrowLabel: 'VbMaSDK.fetchGlobalMiniApps() → vb-ma.vbplatform.workers.dev',
        explanation:
          'Trang Tính năng không hardcode cứng các nút mà gọi SDK tải metadata (id, nameVi, nameEn, category, icon, isHidden, version, bundleUrl) của 35 Mini App Global từ server platform.',
        hostIos: {
          fn: 'MiniAppService.fetchFilteredGlobalMiniApps(completion:)',
          detail: 'Dùng API Key sandbox/staging/prod theo AppEnvironment.apiBaseURL.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'FeatureFragment → MiniAppHelper.fetchFilteredMiniAppsResult()',
          detail: 'Chạy song song với GetAllPermissionMemberViewModel để rút ngắn thời gian mở tab Tính năng.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'Host lọc 4 tầng quyền & gom nhóm theo MiniAppCategoryName',
        phase: 'host_process',
        from: 'host',
        to: 'host',
        dashed: false,
        arrowLabel: 'hiddenApps -> adminOnlyApps (7) -> memberAppPermissions (15)',
        explanation:
          'Host loại: (1) hiddenApps (vb-ma-user-contact, vb-ma-2fa-setting trên iOS; Android thêm 4 app inCallOnlyMiniApps) và is_hidden=true (vb-ma-contact-forward, vb-ma-activity-history), (2) 7 app adminOnlyApps nếu không phải Admin, (3) 15 app memberAppPermissions theo từng quyền Realm/VPMRoleService, (4) Các app nạp động còn lại qua nhánh mặc định return true (vd vb-ma-crm, vb-ma-crm-v2, vb-ma-autodial, vb-ma-blacklist, vb-ma-ipcall-control, vb-ma-ticket, vb-ma-todo) mở bình thường.',
        hostIos: {
          fn: 'MiniAppService + FeaturesViewControllerV2 + MiniAppCategoryName',
          detail: 'iOS dùng chung 7 adminOnlyApps và 15 memberAppPermissions với Android (đã gỡ cả vb-ma-user-history-call và vb-ma-crm khỏi memberAppPermissions ở commit 0fcf3390).',
          codeRef: 'VBot/Controller/NewController/Features/V2/FeaturesViewControllerV2.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.filterMiniApps() + FeatureFragment (Realm FeatureView)',
          detail: 'Android dùng chung 7 adminOnlyApps và 15 memberAppPermissions với iOS (mở cả vb-ma-crm và vb-ma-user-history-call cho mọi Member), đồng thời lọc riêng 4 inCallOnlyMiniApps và hỗ trợ kéo-thả phím tắt.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/feature/FeatureFragment.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'Mini App cha gọi open_mini_app để mở Mini App con kèm params',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'sdk',
        dashed: false,
        arrowLabel: "postEvent('open_mini_app', { app_id, path, params })",
        explanation:
          'Ví dụ trong Ticket (vb-ma-ticket), khi bấm vào chi tiết lịch sử tương tác khách hàng, Mini App cha gọi open_mini_app để mở vb-ma-activity-history. VbMaSDK tự động tải bundle app con nếu máy chưa cache, rồi truyền params vào vbma_extra_data của WebView mới.',
        miniAppCode: `import { on, postEvent } from '@vbotma/sdk';

on('mini_app_closed', ({ app_id, data }) => {
  if (app_id === 'vb-ma-activity-history' && data?.updated) {
    reloadTicketActivityList();
  }
});

postEvent('open_mini_app', {
  app_id: 'vb-ma-activity-history',
  path: '/customer/9012',
  params: { customerId: 9012, source: 'vb-ma-ticket' },
});`,
        wirePacket: {
          channel: 'VbMABridge.post("open_mini_app", jsonString)',
          json: JSON.stringify(
            {
              eventType: 'open_mini_app',
              eventData: {
                app_id: 'vb-ma-activity-history',
                path: '/customer/9012',
                params: { customerId: 9012, source: 'vb-ma-ticket' },
              },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.handleOpenVbMa(_:) → VbMa.shared.openMiniApp(...)',
          detail: 'Nếu app con chưa có cache cục bộ, SDK tự fetch bundle từ platform rồi đẩy trình bày Modal mới.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.handleOpenMiniApp(data) → MiniAppActivity mới',
          detail: 'Khởi chạy Activity con, truyền vbma_extra_data chứa params từ app cha sang.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 4,
        title: 'Mini App con đọc vbma_extra_data, xử lý & đóng trả dữ liệu về cha',
        phase: 'server_os',
        from: 'sdk',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'retrieveLaunchParams().extraData → close() / data_send()',
        explanation:
          'WebView của Mini App con khởi chạy và đọc customerId ngay từ retrieveLaunchParams().extraData. Khi thao tác xong, app con gọi close().',
        miniAppCode: `// Bên trong Mini App con (vb-ma-activity-history)
const { extraData } = retrieveLaunchParams();
console.log('Params từ cha:', extraData);`,
        hostIos: {
          fn: 'VbMaViewController.performClose(returnBack:)',
          detail: 'Đóng màn con và trigger closure trả kết quả về WebView cha đang chờ bên dưới.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'MiniAppActivity.finish() + Activity Result Callback',
          detail: 'Đóng Activity con và chuyển dữ liệu đóng về VbMABridge của cha.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
      {
        stepNumber: 5,
        title: 'Host phát event mini_app_closed (hoặc mini_app_error) về Mini App cha',
        phase: 'host_reply',
        from: 'host',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'mini_app_closed { app_id, data }',
        explanation:
          'Mini App cha nhận thông báo mini_app_closed để cập nhật danh sách mà không phải load lại toàn trang.',
        responsePacket: {
          eventName: 'mini_app_closed',
          json: JSON.stringify(
            {
              app_id: 'vb-ma-activity-history',
              data: { status: 'success', updated: true },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.sendEvent("mini_app_closed", ...)',
          detail: 'Trả app_id và data từ màn con về WebView cha.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.sendEvent("mini_app_closed", ...)',
          detail: 'Trả app_id và data từ MiniAppActivity con về WebView cha.',
          codeRef: 'vb-ma-android-sdk/vbotma-sdk/src/main/java/com/vbot/miniapp/sdk/VbMABridge.kt',
        },
      },
    ],
  },
  {
    id: 'flow-2fa-history',
    title: 'Sự kiện Host đẩy chủ động (setup_2fa, filter_changed, theme)',
    shortTitle: 'Host Push (2FA / Filter / Theme)',
    subtitle: 'WebSocket SETUP_2FA · Tab Lịch sử cuộc gọi · Dark/Light Theme',
    miniAppId: 'vb-ma-2fa-setting',
    categoryBadge: 'Host → Mini App Push',
    summary:
      'Tổng hợp các sự kiện một chiều Host chủ động đẩy xuống WebView khi có thay đổi ngoài Mini App: WebSocket SETUP_2FA (2FA), chọn bộ lọc Tất cả/Gọi nhỡ trên header native Lịch sử (vb-ma-user-history-call), và đổi giao diện Sáng/Tối.',
    relatedNodeId: 'auth-2fa-socket',
    steps: [
      {
        stepNumber: 1,
        title: 'Thay đổi phát sinh từ Server WebSocket hoặc UI Native của Host',
        phase: 'server_os',
        from: 'server',
        to: 'host',
        dashed: true,
        arrowLabel: 'WS SETUP_2FA / Nút Filter Tất cả-Nhỡ / NightMode',
        explanation:
          'Ví dụ: Tài khoản bật/tắt 2FA trên Web Console khiến Server bắn WebSocket SETUP_2FA về App; hoặc user bấm tab "Gọi nhỡ" trên thanh lọc native của màn Lịch sử cuộc gọi (Android tvSelect2 / iOS segmented control).',
        hostIos: {
          fn: 'VbTwoFactorSocketHandler.handleSocketEvent / UserHistoryCallViewController filter bar',
          detail: 'Khử trùng WebSocket SETUP_2FA trong cửa sổ 1000ms; đổi filter ở Tab 2 phát filter_changed.',
          codeRef: 'VBot/Service/VbTwoFactorSocketHandler.swift',
        },
        hostAndroid: {
          fn: 'VbTwoFactorSocketHandler (3 socket sources) / CallHistoryFragment tvSelect1-2',
          detail: 'Gắn dedup 1000ms qua 3 socket (PhoneModule, UtilsKotlin, SocketManager); CallHistoryFragment phát filter_changed.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/phone/CallHistoryFragment.kt',
        },
      },
      {
        stepNumber: 2,
        title: 'Host kiểm tra Mini App đích có đang mở & chuẩn bị payload',
        phase: 'host_process',
        from: 'host',
        to: 'sdk',
        dashed: false,
        arrowLabel: 'emitEventIfMiniAppOpen(appId) / VbMaSDK.emitEvent(...)',
        explanation:
          'Nếu WebSocket SETUP_2FA có logout_other_devices=true thì Host ép đăng xuất toàn app; ngược lại Host đóng gói { is_enable, timestamp } để báo vào vb-ma-2fa-setting. Cả iOS và Android đều có MiniAppActiveTracker kiểm tra đúng appId đang mở trên đỉnh stack trước khi emit.',
        hostIos: {
          fn: 'MiniAppService.emitEventIfMiniAppOpen(appId: "vb-ma-2fa-setting", eventName: "setup_2fa", payload:)',
          detail: 'Kiểm tra MiniAppActiveTracker.shared.isMiniAppOpen() tránh phát nhầm vào Mini App khác đang mở.',
          codeRef: 'VBot/Service/MiniAppService.swift',
        },
        hostAndroid: {
          fn: 'MiniAppHelper.emitEventIfMiniAppOpen(MINI_APP_2FA_SETTING_ID, "setup_2fa", payload) → VbMaSDK.emitEvent(...)',
          detail: 'Kiểm tra MiniAppActiveTracker.shared.isMiniAppOpen() và double-check trên Main Thread trước khi gọi VbMaSDK.emitEvent.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/utils/MiniAppHelper.kt',
        },
      },
      {
        stepNumber: 3,
        title: 'Native WebView chạy VbMA.receive() đẩy event xuống JS',
        phase: 'host_push',
        from: 'sdk',
        to: 'miniapp',
        dashed: true,
        arrowLabel: 'setup_2fa / filter_changed / theme_changed',
        explanation:
          'SDK đẩy payload JSON vào WebView qua hàm JS global. Nếu WebView chưa gọi "ready", iOS có hàng đợi queuedHostEvents tự xả ngay sau khi nhận ready.',
        responsePacket: {
          eventName: 'setup_2fa & filter_changed & theme_changed',
          json: JSON.stringify(
            {
              setup_2fa: { is_enable: true, timestamp: 1763604950 },
              filter_changed: { type: 'missed' },
              refresh_data: { reason: 'tab_activated', force: false },
            },
            null,
            2,
          ),
        },
        hostIos: {
          fn: 'VbMaViewController.sendEvent(...) + queuedHostEvents',
          detail: 'Lưu ý iOS ép app Light mode toàn cục nên không phát Dark theme_changed.',
          codeRef: 'vb-ma-ios-sdk/VbMaSDK/UI/VbMaViewController.swift',
        },
        hostAndroid: {
          fn: 'VbMABridge.sendEvent(...) / MiniAppHelper.emitEvent',
          detail:
            'SettingActivity Android hỗ trợ Dark/Light mode; MiniAppFragment & VbMABridge.handleRequestTheme tự động phát theme_changed khi ready hoặc đổi cấu hình Sáng/Tối.',
          codeRef: 'VBot-Android/app/src/main/java/com/vpmedia/vbot/ui/phone/CallHistoryFragment.kt',
        },
      },
      {
        stepNumber: 4,
        title: 'Mini App cập nhật UI tức thì mà giữ nguyên trang/scroll',
        phase: 'miniapp_call',
        from: 'miniapp',
        to: 'miniapp',
        dashed: false,
        arrowLabel: 'on(event) → Cập nhật state Svelte/Vue/React',
        explanation:
          'Mini App dùng on("filter_changed"), on("refresh_data"), on("setup_2fa") của @vbotma/sdk để đồng bộ lại trạng thái UI mà giữ nguyên bộ lọc/vị trí cuộn khi phù hợp.',
        miniAppCode: `import { on } from '@vbotma/sdk';

// 1. Đồng bộ 2FA realtime
on('setup_2fa' as any, ({ is_enable }: { is_enable: boolean }) => {
  twoFactorEnabled.value = is_enable;
});

// 2. Đồng bộ tab Lịch sử (all | missed)
on('filter_changed', ({ type }) => {
  activeCallFilter.value = type; // 'all' | 'missed'
  fetchHistory(1);
});

// 3. Làm mới khi user chuyển tab hoặc mới dập máy
on('refresh_data', ({ reason, force }) => {
  if (force || reason === 'call_ended') refreshCurrentList();
});`,
        hostIos: {
          fn: 'WebView JS runtime nhận callback',
          detail: 'Không mất state DOM vì chỉ là evaluateJavaScript gọi handler.',
          codeRef: 'vb-ma-sdk/src/events.ts',
        },
        hostAndroid: {
          fn: 'WebView JS runtime nhận callback',
          detail: 'MainActivity & AHBottomNavigation giữ sống Fragment bằng add/show/hide.',
          codeRef: 'vb-ma-sdk/src/events.ts',
        },
      },
    ],
  },
];

export const CORE_BRIDGE_SPECS: CoreBridgeSpecItem[] = [
  // ── Launch Params ───────────────────────────────────────────────
  {
    id: 'lp-auth-init',
    name: 'Launch Params (#vbma_data, vbma_theme, vbma_extra_data, isAdmin)',
    direction: 'launch_param',
    category: 'lifecycle',
    summary:
      'Toàn bộ ngữ cảnh ban đầu được Host mã hóa trong URL hash (#) lúc mở WebView. Mini App đọc đồng bộ qua retrieveLaunchParams(), retrieveAuthData() và isAdmin().',
    miniAppCode: `import { retrieveLaunchParams, retrieveAuthData, isAdmin } from '@vbotma/sdk';

const { apiBaseUrl, locale, platform, startParam, themeParams, extraData } = retrieveLaunchParams();
const auth = retrieveAuthData(); // { projectCode, uid, sessionId, isAdmin }
console.log('Admin?', isAdmin(), 'Embed param:', startParam);`,
    responseJson: JSON.stringify(
      {
        projectCode: 'vbot',
        uid: 'u_9812',
        sessionId: 'sess_456',
        apiBaseUrl: 'https://api-h01.vbot.vn',
        locale: 'vi',
        platform: 'ios',
        startParam: 'embedded',
        extraData: { isAdmin: true, theme_params: { bg_color: '#ffffff' } },
      },
      null,
      2,
    ),
    iosHandler: 'MiniAppService.openMiniApp / VbMa.shared.createMiniAppViewController (luôn merge theme_params Light & isAdmin)',
    androidHandler: 'MiniAppHelper.openMiniApp / MiniAppFragment.newInstance (vb-ma-android-sdk tự inject vbma_theme theo uiMode)',
    parityNote: 'iOS ép Light theme toàn cục; Android tự đồng bộ Light/Dark qua vb-ma-android-sdk.',
    usedByApps: ['Tất cả Mini App'],
  },
  // ── Lifecycle & UI Methods ──────────────────────────────────────
  {
    id: 'm-ready',
    name: 'ready',
    direction: 'miniapp_to_host',
    category: 'lifecycle',
    summary:
      'Báo Native SDK rằng Mini App đã dựng xong giao diện đầu tiên. Host tắt loading skeleton, hiển thị WebView và xả hàng đợi queuedHostEvents (iOS).',
    miniAppCode: `import { postEvent } from '@vbotma/sdk';\npostEvent('ready');`,
    requestJson: JSON.stringify({ eventType: 'ready' }, null, 2),
    iosHandler: 'VbMaViewController.handleMethod("ready") → flushQueuedHostEvents()',
    androidHandler: 'VbMABridge.handleReady() (chấp nhận cả "web_app_ready")',
    usedByApps: ['Tất cả Mini App'],
  },
  {
    id: 'm-close',
    name: 'close',
    direction: 'miniapp_to_host',
    category: 'lifecycle',
    summary: 'Đóng màn hình Mini App hiện tại; return_back=true để quay lại màn hình/app cha trước đó.',
    miniAppCode: `postEvent('close', { return_back: true });`,
    requestJson: JSON.stringify({ eventType: 'close', eventData: { return_back: true } }, null, 2),
    iosHandler: 'VbMaViewController.performClose(returnBack:)',
    androidHandler: 'VbMABridge.handleClose() → finish MiniAppActivity',
    usedByApps: ['Tất cả Mini App mở dạng Modal / Child'],
  },
  {
    id: 'm-expand',
    name: 'expand',
    direction: 'miniapp_to_host',
    category: 'ui',
    summary: 'Yêu cầu mở rộng khung chứa Mini App lên chiều cao tối đa (full height sheet/activity).',
    miniAppCode: `postEvent('expand');`,
    requestJson: JSON.stringify({ eventType: 'expand' }, null, 2),
    iosHandler: 'VbMaViewController.handleMethod("expand")',
    androidHandler: 'VbMABridge.handleExpand()',
    usedByApps: ['Modal Mini App'],
  },
  {
    id: 'm-closing-behavior',
    name: 'setup_closing_behavior',
    direction: 'miniapp_to_host',
    category: 'ui',
    summary: 'Bật/tắt hộp thoại xác nhận "Bạn có chắc muốn đóng?" trước khi thoát Mini App (hữu ích khi form đang nhập dở).',
    miniAppCode: `postEvent('setup_closing_behavior', { need_confirmation: true });`,
    requestJson: JSON.stringify({ eventType: 'setup_closing_behavior', eventData: { need_confirmation: true } }, null, 2),
    iosHandler: 'VbMaViewController.handleMethod("setup_closing_behavior") → AlertController',
    androidHandler: 'VbMABridge.handleSetupClosingBehavior()',
    usedByApps: ['Form Mini App (vd CRM, Survey, Call Script)'],
  },
  {
    id: 'm-open-link',
    name: 'open_link / open_vb_link',
    direction: 'miniapp_to_host',
    category: 'navigation',
    summary:
      'Mở URL https bên ngoài bằng trình duyệt OS (open_link — do WebView sandbox chặn điều hướng trực tiếp khỏi miniapp://) hoặc nhảy deeplink nội bộ VBot (open_vb_link — tự đóng Mini App).',
    miniAppCode: `postEvent('open_link', { url: 'https://docs.vbot.vn' });\n// Hoặc deeplink nội bộ:\npostEvent('open_vb_link', { path_full: '/user/12345' });`,
    requestJson: JSON.stringify({ eventType: 'open_link', eventData: { url: 'https://docs.vbot.vn' } }, null, 2),
    iosHandler: 'UIApplication.shared.open(url) / DeepLinkRouter',
    androidHandler: 'VbMABridge.handleOpenLink / handleOpenVbLink',
    usedByApps: ['Tất cả Mini App'],
  },
  {
    id: 'm-open-miniapp',
    name: 'open_mini_app',
    direction: 'miniapp_to_host',
    category: 'navigation',
    summary: 'Mở một Mini App con từ Mini App cha (vd Ticket mở Lịch sử tương tác), tự tải bundle nếu chưa cache và báo về qua mini_app_closed.',
    miniAppCode: `postEvent('open_mini_app', {\n  app_id: 'vb-ma-activity-history',\n  path: '/customer/9012',\n  params: { customerId: 9012 },\n});`,
    requestJson: JSON.stringify({ eventType: 'open_mini_app', eventData: { app_id: 'vb-ma-activity-history', params: { customerId: 9012 } } }, null, 2),
    responseEvent: 'mini_app_closed | mini_app_error',
    responseJson: JSON.stringify({ app_id: 'vb-ma-activity-history', data: { updated: true } }, null, 2),
    iosHandler: 'VbMaViewController.handleOpenVbMa → VbMa.shared.openMiniApp',
    androidHandler: 'VbMABridge.handleOpenMiniApp → MiniAppActivity mới',
    usedByApps: ['vb-ma-ticket', 'vb-ma-contact-forward', 'vb-ma-crm'],
  },
  {
    id: 'm-haptic-toast',
    name: 'trigger_haptic / show_toast',
    direction: 'miniapp_to_host',
    category: 'ui',
    summary: 'Tạo phản hồi rung native (impact / notification / selection_change) và thông báo Toast native (Android).',
    miniAppCode: `postEvent('trigger_haptic', { type: 'notification', notification_type: 'success' });`,
    requestJson: JSON.stringify({ eventType: 'trigger_haptic', eventData: { type: 'notification', notification_type: 'success' } }, null, 2),
    iosHandler: 'UIImpactFeedbackGenerator / UINotificationFeedbackGenerator (chưa có handler "show_toast")',
    androidHandler: 'VbMABridge.handleTriggerHaptic (VibrationEffect) / handleShowToast',
    parityNote: 'Method "show_toast" hiện mới xử lý trong VbMABridge Android, chưa có trong switch của VbMaViewController iOS.',
    usedByApps: ['Tất cả Mini App'],
  },
  {
    id: 'm-theme-viewport',
    name: 'request_theme / request_viewport',
    direction: 'miniapp_to_host',
    category: 'ui',
    summary: 'Chủ động hỏi lại màu theme hoặc kích thước WebView hiện tại; SDK dùng request() khớp event theme_changed / viewport_changed.',
    miniAppCode: `import { request } from '@vbotma/sdk';\nconst { theme_params } = await request('request_theme', 'theme_changed');`,
    responseEvent: 'theme_changed | viewport_changed',
    responseJson: JSON.stringify({ theme_params: { bg_color: '#ffffff', text_color: '#000000' } }, null, 2),
    iosHandler: 'VbMaViewController → sendThemeEvent / sendViewportEvent',
    androidHandler: 'VbMABridge.handleRequestTheme / handleRequestViewport',
    usedByApps: ['Tất cả Mini App'],
  },
  // ── Auth & Token ────────────────────────────────────────────────
  {
    id: 'm-miniapp-token',
    name: 'request_mini_app_token',
    direction: 'miniapp_to_host',
    category: 'auth',
    summary:
      'Xin Base MiniApp Token để gọi các API dùng chung không gắn module (tránh lỗi 403 của root token). SDK hỗ trợ cache RAM theo JWT exp.',
    miniAppCode: `import { requestMiniAppToken } from '@vbotma/sdk';\nconst token = await requestMiniAppToken(5000);`,
    requestJson: JSON.stringify({ request_id: 'req-tok-1' }, null, 2),
    responseEvent: 'mini_app_token_result',
    responseJson: JSON.stringify({ request_id: 'req-tok-1', token: 'eyJ...', tokenType: 'Bearer', expiresAt: '2026-11-20T03:00:00.000Z' }, null, 2),
    iosHandler: 'MiniAppService.prewarmMiniAppTokenIfNeeded (throttle 600s) + VbMaMiniAppTokenService',
    androidHandler: 'VbMABridge.handleRequestMiniAppToken → GET /api/User/getTokenMiniApp (lazy, không pre-warm)',
    parityNote: 'iOS pre-warm sẵn khi mở app; Android lazy fetch khi Mini App gọi và VbMaMiniAppTokenService chưa có callRefreshTokenAPI.',
    usedByApps: ['vb-ma-user-contact', 'vb-ma-2fa-setting', 'vb-ma-crm', 'vb-ma-user-history-call'],
  },
  {
    id: 'm-module-token',
    name: 'request_module_token (force refresh 401)',
    direction: 'miniapp_to_host',
    category: 'auth',
    summary:
      'Xin token riêng cho module nghiệp vụ (UPPER_SNAKE_CASE như CRM, TICKET). Truyền force = true khi API vừa trả 401 để ép bỏ cache và gọi Host refreshHostToken().',
    miniAppCode: `import { requestModuleToken } from '@vbotma/sdk';\nconst token = await requestModuleToken('CRM');\n// Khi API trả 401:\nconst fresh = await requestModuleToken('CRM', 5000, true);`,
    requestJson: JSON.stringify({ request_id: 'req-mod-1', module: 'CRM', force: true }, null, 2),
    responseEvent: 'module_token_result',
    responseJson: JSON.stringify({ request_id: 'req-mod-1', module: 'CRM', token: 'eyJ...', expiresAt: '2026-11-20T03:00:00.000Z' }, null, 2),
    iosHandler: 'VbMaViewController.handleRequestModuleToken + MiniAppService.refreshHostToken()',
    androidHandler: 'VbMABridge.handleRequestModuleToken + MiniAppHelper.delegate.refreshHostToken()',
    parityNote: 'Trên Android nếu refresh thất bại 400/401/403 sẽ xóa credential, logout VbMaSDK và ép về Login 1 lần.',
    usedByApps: ['vb-ma-crm', 'vb-ma-ticket', 'vb-ma-report', 'vb-ma-member'],
  },
  {
    id: 'm-host-fetch',
    name: 'host_fetch / data_send',
    direction: 'miniapp_to_host',
    category: 'auth',
    summary:
      'host_fetch ủy quyền cho Native Host thực hiện HTTP request kèm Bearer root token (chặn header Authorization giả từ JS); data_send gửi payload ≤4KB và tự đóng Mini App.',
    miniAppCode: `const res = await request('host_fetch', 'host_fetch_result', {\n  request_id: crypto.randomUUID(),\n  method: 'GET',\n  path: '/api/user/profile',\n});`,
    requestJson: JSON.stringify({ request_id: 'req-hf-1', method: 'GET', path: '/api/user/profile' }, null, 2),
    responseEvent: 'host_fetch_result',
    responseJson: JSON.stringify({ request_id: 'req-hf-1', status: 200, headers: {}, body: { name: 'User A' } }, null, 2),
    iosHandler: 'VbMaViewController.handleHostFetch(_:)',
    androidHandler: 'VbMABridge.handleHostFetch (có telemetry trackAuthLegacyFallback)',
    usedByApps: ['Legacy / Proxy API calls'],
  },
  // ── Permissions & Discovery ─────────────────────────────────────
  {
    id: 'm-check-permissions',
    name: 'check_permissions',
    direction: 'miniapp_to_host',
    category: 'permissions',
    summary:
      'Kiểm tra quyền 2 tầng (App Manifest + Host RBAC). Hỗ trợ alias "CRM"→KHACH_HANG, "VIEW"→"SHOW", quyền xem SĐT "HIEN_SO_DIEN_THOAI" và Admin dự án luôn trả true.',
    miniAppCode: `import { checkPermissions } from '@vbotma/sdk';\nconst p = await checkPermissions('CRM', ['VIEW', 'ADD', 'HIEN_SO_DIEN_THOAI']);`,
    requestJson: JSON.stringify({ request_id: 'req-perm-1', module: 'CRM', actions: ['VIEW', 'ADD', 'HIEN_SO_DIEN_THOAI'] }, null, 2),
    responseEvent: 'permissions_result',
    responseJson: JSON.stringify({ request_id: 'req-perm-1', module: 'CRM', permissions: { VIEW: true, ADD: true, HIEN_SO_DIEN_THOAI: true } }, null, 2),
    iosHandler: 'MiniAppService.onCheckPermissions → VPMRoleService',
    androidHandler: 'MiniAppHelper.onCheckPermissions → MiniAppPermissionHelper.checkPermissionsBatch',
    usedByApps: ['Tất cả Mini App có phân quyền (CRM, Hotline, Call History, Contact Forward...)'],
  },
  {
    id: 'm-get-supported-actions',
    name: 'get_supported_actions / get_session_info',
    direction: 'host_action',
    category: 'lifecycle',
    summary:
      'get_supported_actions kiểm tra phiên bản Host hiện tại hỗ trợ những custom action nào; get_session_info lấy socket session_id & socket_url cho kết nối thời gian thực.',
    miniAppCode: `postEvent('get_supported_actions' as any, { request_id: reqId });\npostEvent('request_host_action' as any, { request_id: reqId2, action: 'get_session_info' });`,
    requestJson: JSON.stringify({ request_id: 'req-sess-1', action: 'get_session_info' }, null, 2),
    responseEvent: 'supported_actions_result | host_action_result',
    responseJson: JSON.stringify({ request_id: 'req-sess-1', success: true, session_id: 'sid_abc', socket_url: 'ws.vbot.vn', isAdmin: true }, null, 2),
    iosHandler: 'MiniAppService.supportedHostActions & handleGetSessionInfo',
    androidHandler: 'MiniAppHelper.buildSupportedHostActions() & handleGetSessionInfo',
    usedByApps: ['vb-ma-autodial', 'vb-ma-user-contact', 'Tất cả Mini App dùng Custom Host Action'],
  },
  // ── Calling & Monitoring ────────────────────────────────────────
  {
    id: 'm-make-call',
    name: 'make_call',
    direction: 'miniapp_to_host',
    category: 'call',
    summary:
      'Yêu cầu Host quay số đi qua PJSIP. Nhận cả format chuẩn callee_info lồng lẫn payload phẳng (CRM cũ). Hỗ trợ gọi ngoại tuyến (app_to_phone) và nội bộ (app_to_app).',
    miniAppCode: `import { makeCall } from '@vbotma/sdk';\nconst r = await makeCall({ phoneNumber: '0987654321', displayName: 'Khách VIP', typeCall: 'app_to_phone' });`,
    requestJson: JSON.stringify({ request_id: 'req-c1', callee_info: { phoneNumber: '0987654321', displayName: 'Khách VIP', typeCall: 'app_to_phone' } }, null, 2),
    responseEvent: 'call_result',
    responseJson: JSON.stringify({ request_id: 'req-c1', success: true, reason: null }, null, 2),
    iosHandler: 'MiniAppService.onRequestCall → VPMAppService.makeCall',
    androidHandler: 'MiniAppHelper.onRequestCall → handleRequestCall → showHotlinePicker (ChooseHotlineCallBottomSheet) / makeDirectCall',
    parityNote:
      'Android đã bỏ timer 200ms: dùng AtomicBoolean one-shot chờ ChooseHotlineCallBottomSheet rồi trả success=true sau makeDirectCall hoặc reason USER_CANCELLED / NO_HOTLINE / ERROR. iOS validate MISSING_PHONE_NUMBER rồi trả success=true sau khi dispatch VPMAppService.makeCall.',
    usedByApps: ['vb-ma-autodial', 'vb-ma-crm', 'vb-ma-user-contact', 'vb-ma-user-history-call', 'vb-ma-contact-forward'],
  },
  {
    id: 'm-monitor-call',
    name: 'monitor_call',
    direction: 'miniapp_to_host',
    category: 'call',
    summary:
      'Thực hiện Giám sát cuộc gọi đang diễn ra: listen (1# - miễn quyền Mic), capture (2#), capture_bot (4#), whisper (5#). Khóa slot nguyên tử chống bấm đúp.',
    miniAppCode: `postEvent('monitor_call' as any, { request_id: reqId, action: 'whisper', transId: 'tr_9045' });`,
    requestJson: JSON.stringify({ request_id: 'req-m1', action: 'whisper', transId: 'tr_9045' }, null, 2),
    responseEvent: 'monitor_call_result | monitor_call_state_changed',
    responseJson: JSON.stringify({ request_id: 'req-m1', action: 'whisper', transId: 'tr_9045', success: true, status: 'CONNECTING' }, null, 2),
    iosHandler: 'MiniAppService.onMonitorCall → MiniAppMonitoringCoordinator + VPMAppService.startMonitoringCall',
    androidHandler: 'MiniAppHelper.onMonitorCall → tryAcquireMonitoringSlot + startMonitoringSipCall (PiP) + sendMonitorCallStateChanged',
    parityNote: 'Cả iOS và Android đều phát monitor_call_state_changed (ACTIVE / DISCONNECTED kèm reason) về JS; Android hiển thị thêm native PiP.',
    usedByApps: ['vb-ma-monitoring'],
  },
  // ── Autodial Actions & Events ───────────────────────────────────
  {
    id: 'ha-start-autodial',
    name: 'start_autodial',
    direction: 'host_action',
    category: 'autodial',
    summary: 'Bắt đầu chiến dịch quay số tự động qua WebSocket vbot.auto.dial; từ chối nếu đang bận cuộc gọi khác.',
    miniAppCode: `postEvent('request_host_action' as any, {\n  request_id: reqId,\n  action: 'start_autodial',\n  payload: { autoDialId: 151, hotline: '02499998888', campaignName: 'CSKH' },\n});`,
    requestJson: JSON.stringify({ request_id: 'req-ad1', action: 'start_autodial', payload: { autoDialId: 151, hotline: '02499998888', campaignName: 'CSKH' } }, null, 2),
    responseEvent: 'host_action_result',
    responseJson: JSON.stringify({ request_id: 'req-ad1', success: true, state: 'connecting', autoDialId: 151, totalCalled: 0 }, null, 2),
    iosHandler: 'AutodialManager.shared.handleAction("start_autodial")',
    androidHandler: 'MiniAppHelper.handleStartAutodial → AutodialManager.start(...)',
    usedByApps: ['vb-ma-autodial'],
  },
  {
    id: 'ha-control-autodial',
    name: 'pause_autodial / resume_autodial / stop_autodial / get_autodial_state',
    direction: 'host_action',
    category: 'autodial',
    summary: '4 lệnh điều khiển và đồng bộ state machine của phiên quay số tự động (chờ hết cuộc gọi đang active nếu pause giữa chừng).',
    miniAppCode: `postEvent('request_host_action' as any, { request_id: reqId, action: 'get_autodial_state' });`,
    requestJson: JSON.stringify({ request_id: 'req-ad2', action: 'pause_autodial' }, null, 2),
    responseEvent: 'host_action_result',
    responseJson: JSON.stringify({ request_id: 'req-ad2', success: true, state: 'paused', autoDialId: 151, totalCalled: 4, currentPhone: '0901234567' }, null, 2),
    iosHandler: 'AutodialManager.shared.pause() / resume() / stop() / toStateMap()',
    androidHandler: 'MiniAppHelper.handlePauseAutodial / handleResumeAutodial / handleStopAutodial / handleGetAutodialState',
    usedByApps: ['vb-ma-autodial'],
  },
  {
    id: 'ev-autodial-lifecycle',
    name: 'autodial_finished / autodial_error',
    direction: 'host_to_miniapp',
    category: 'autodial',
    summary: 'Sự kiện bất đồng bộ do Host chủ động đẩy khi server báo AUTODIAL_CAMPAIGN_ENDED hoặc gặp lỗi kết nối/lỗi từ server.',
    miniAppCode: `on('autodial_finished', ({ autoDialId, campaignName }) => console.log('Xong:', autoDialId));\non('autodial_error', ({ autoDialId, message }) => console.error(message));`,
    responseJson: JSON.stringify({ autoDialId: 151, campaignName: 'CSKH', message: 'Mất kết nối WebSocket' }, null, 2),
    iosHandler: 'AutodialManager.handleAutoDialFinished / handleAutoDialError → MiniAppService.emitMiniAppEvent',
    androidHandler: 'AutodialManager.handleAutoDialFinished / handleAutoDialError → VbMaSDK.emitEvent',
    usedByApps: ['vb-ma-autodial'],
  },
  // ── User Contact Actions & Events ───────────────────────────────
  {
    id: 'ha-user-contact',
    name: 'user_contact_get_local / refresh_server / import_device / delete_local / open_settings',
    direction: 'host_action',
    category: 'contacts',
    summary: 'Nhóm 5 Host Action độc quyền giúp Tab 3 vb-ma-user-contact đọc SQLite theo uid, xin quyền danh bạ máy OS, nhập danh bạ điện thoại, xóa local và mở Cài đặt hệ thống.',
    miniAppCode: `postEvent('request_host_action' as any, { request_id: reqId, action: 'user_contact_get_local', payload: {} });`,
    requestJson: JSON.stringify({ request_id: 'req-uc1', action: 'user_contact_import_device', payload: {} }, null, 2),
    responseEvent: 'host_action_result',
    responseJson: JSON.stringify({ request_id: 'req-uc1', success: true, permissionStatus: 'authorized', contacts: [] }, null, 2),
    iosHandler: 'UserContactMiniAppBridgeHelper.handleAction (Swift + CNContactStore)',
    androidHandler: 'UserContactMiniAppBridgeHelper.handleAction (Kotlin + ContactsContract + SQLite)',
    parityNote: 'iOS hỗ trợ trạng thái permissionStatus = "limited" (iOS 18+); Android phân biệt hasPromptedReadContacts.',
    usedByApps: ['vb-ma-user-contact'],
  },
  {
    id: 'ev-user-contacts-updated',
    name: 'user_contacts_updated',
    direction: 'host_to_miniapp',
    category: 'contacts',
    summary: 'Host thông báo cho Tab 3 tải lại danh sách local khi SQLite thay đổi từ bên ngoài (kèm cơ chế chặn tự lặp).',
    miniAppCode: `on('user_contacts_updated' as any, ({ contacts }) => renderContacts(contacts));`,
    responseJson: JSON.stringify({ contacts: [{ id: 1201, fullName: 'Lê Minh D', phone: '0909111222' }] }, null, 2),
    iosHandler: 'UserContactsMiniAppViewController (lọc userInfo["source"] == "miniapp_bridge")',
    androidHandler: 'UserContactMiniAppBridgeHelper (lọc trùng computeContactsSignature())',
    usedByApps: ['vb-ma-user-contact'],
  },
  {
    id: 'toggle_actions_menu',
    name: 'toggle_actions_menu',
    direction: 'host_to_miniapp',
    category: 'ui',
    summary:
      'Host đẩy sự kiện toggle_actions_menu xuống Tab 3 vb-ma-user-contact khi người dùng bấm nút + trên header native để bật/tắt menu thao tác danh bạ.',
    miniAppCode: `on('toggle_actions_menu' as any, () => setMenuOpen((prev) => !prev));`,
    responseJson: JSON.stringify({ visible: true }, null, 2),
    iosHandler: 'UserContactsMiniAppViewController → miniAppVC.emitEvent("toggle_actions_menu")',
    androidHandler: 'UserContactsFragment → miniAppFragment.emitEvent("toggle_actions_menu")',
    usedByApps: ['vb-ma-user-contact'],
  },
  // ── Spontaneous Host Events ─────────────────────────────────────
  {
    id: 'ev-host-push',
    name: 'refresh_data / filter_changed / theme_changed / setup_2fa',
    direction: 'host_to_miniapp',
    category: 'navigation',
    summary:
      'Các event Host tự đẩy xuống khi chuyển Tab, nhấn bộ lọc header native Lịch sử ("all"/"missed"), đổi Dark/Light theme hoặc nhận WebSocket SETUP_2FA.',
    miniAppCode: `on('refresh_data', ({ reason, force }) => reloadIfNeeded(reason, force));\non('filter_changed', ({ type }) => applyFilter(type));\non('theme_changed', ({ theme_params }) => applyCssVars(theme_params));`,
    responseJson: JSON.stringify({ reason: 'call_ended', force: true }, null, 2),
    iosHandler: 'MiniAppService.emitEventIfMiniAppOpen (qua MiniAppActiveTracker)',
    androidHandler: 'MiniAppHelper.emitEventIfMiniAppOpen (qua MiniAppActiveTracker) / CallHistoryFragment',
    parityNote: 'Cả iOS và Android đã lọc emitEvent theo appId qua MiniAppActiveTracker; Android vb-ma-android-sdk tự phát theme_changed khi đổi Sáng/Tối.',
    usedByApps: ['vb-ma-user-history-call', 'vb-ma-user-contact', 'vb-ma-contact-forward', 'vb-ma-2fa-setting', 'vb-ma-work-schedule'],
  },
];

export const MINI_APP_CATALOG: MiniAppCatalogEntry[] = [
  // ── 3 Mini App nhúng Tab chính (2 utility + 1 Cuộc gọi) ─────────
  {
    id: 'vb-ma-contact-forward',
    nameVi: 'Danh bạ chuyển tiếp (Chưa dùng luồng chính)',
    nameEn: 'Danh bạ chuyển tiếp',
    category: 'Tiện ích (utility)',
    placement: 'inline_tab',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (nút + chỉ hiện cho Admin: isAdminProject() == true; Prod is_hidden=true)',
    androidPermissionRule: 'Mọi user (nút + chỉ hiện cho Admin: UtilsKotlin.checkAdmin() == true; Prod is_hidden=true)',
    bridgeTier: 'custom_bridge',
    customActions: ['open_mini_app', 'refresh_data', 'theme_changed', 'check_permissions', 'make_call'],
    simulatorFlowId: 'flow-make-call',
    relatedNodeId: 'ma-contact-forward',
  },
  {
    id: 'vb-ma-user-history-call',
    nameVi: 'Lịch sử cuộc gọi',
    nameEn: 'History call',
    category: 'Cuộc gọi',
    placement: 'inline_tab',
    accessLevel: 'everyone',
    iosPermissionRule: 'Tab 2 & mục Cuộc gọi Tab 0 LUÔN hiển thị cho mọi user (đã bỏ lọc .call trên iOS Nam-dev)',
    androidPermissionRule: 'Tab 2 & mục Cuộc gọi Tab 0 LUÔN hiển thị cho mọi user',
    bridgeTier: 'custom_bridge',
    customActions: ['filter_changed', 'refresh_data', 'make_call', 'check_permissions'],
    simulatorFlowId: 'flow-2fa-history',
    relatedNodeId: 'ma-history-call',
    parityNote: 'Quyền hiển thị, phát ghi âm và đồng bộ Sáng/Tối (qua vb-ma-android-sdk trên Android) đã nhất quán trên cả 2 HĐH.',
  },
  {
    id: 'vb-ma-user-contact',
    nameVi: 'Danh bạ cá nhân',
    nameEn: 'Danh bạ cá nhân',
    category: 'Tiện ích (utility)',
    placement: 'inline_tab',
    accessLevel: 'everyone',
    iosPermissionRule: 'Ẩn khỏi Features Hub (hiddenApps + Prod is_hidden=true); mở cố định tại Tab 3',
    androidPermissionRule: 'Ẩn khỏi Features Hub (Prod is_hidden=true); mở cố định tại Tab 3 (startParam="embedded")',
    bridgeTier: 'custom_bridge',
    customActions: [
      'user_contact_get_local',
      'user_contact_refresh_server',
      'user_contact_import_device',
      'user_contact_delete_local',
      'user_contact_open_settings',
      'user_contacts_updated',
      'toggle_actions_menu',
    ],
    simulatorFlowId: 'flow-user-contact',
    relatedNodeId: 'ma-user-contact',
    parityNote: 'Chống loop khác nhau (notification source vs signature hash) & quyền iOS có "limited".',
  },

  // ── 7 Mini App Admin Only (3 Cuộc gọi/CRM + 4 Cài đặt nhóm) ─────
  {
    id: 'vb-ma-permission',
    nameVi: 'Phân quyền',
    nameEn: 'Permission',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'admin_only',
    iosPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    androidPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-permissions',
    relatedNodeId: 'ma-permission',
  },
  {
    id: 'vb-ma-crm-custom-field',
    nameVi: 'Tuỳ chỉnh thông tin',
    nameEn: 'Custom field',
    category: 'CRM',
    placement: 'features_hub',
    accessLevel: 'admin_only',
    iosPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    androidPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-crm-custom-field',
  },
  {
    id: 'vb-ma-survey',
    nameVi: 'Khảo sát đánh giá',
    nameEn: 'Survey',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'admin_only',
    iosPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    androidPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-survey',
  },
  {
    id: 'vb-ma-webhook',
    nameVi: 'Webhook',
    nameEn: 'Webhook',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'admin_only',
    iosPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    androidPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-webhook',
  },
  {
    id: 'vb-ma-api-key',
    nameVi: 'Api Key',
    nameEn: 'API Key',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'admin_only',
    iosPermissionRule: 'adminOnlyApps (chỉ Admin/Manager; có trên /api/apps, chưa public global)',
    androidPermissionRule: 'adminOnlyApps (chỉ Admin/Manager; có trên /api/apps, chưa public global)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-api-key',
  },
  {
    id: 'vb-ma-add-on',
    nameVi: 'Tiện ích bổ sung',
    nameEn: 'Add on',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'admin_only',
    iosPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    androidPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-open-child-and-features',
    relatedNodeId: 'ma-add-on',
  },
  {
    id: 'vb-ma-call-automation-config',
    nameVi: 'Cấu hình tự động',
    nameEn: 'Call Automation',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'admin_only',
    iosPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    androidPermissionRule: 'adminOnlyApps (chỉ Admin/Manager)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-call-automation-config',
  },

  // ── 14 Mini App lọc theo quyền Member trên Hub ──────────────────
  {
    id: 'vb-ma-member',
    nameVi: 'Thành viên',
    nameEn: 'Members',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.member',
    androidPermissionRule: 'EnumPermission.THANH_VIEN',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-permissions',
    relatedNodeId: 'ma-member',
  },
  {
    id: 'vb-ma-user-hotline',
    nameVi: 'Hotline',
    nameEn: 'Hotline',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.hotline',
    androidPermissionRule: 'EnumPermission.HOTLINE',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-permissions',
    relatedNodeId: 'ma-user-hotline',
  },
  {
    id: 'vb-ma-alias-hotline',
    nameVi: 'Alias hotline',
    nameEn: 'Alias hotline',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.hotline',
    androidPermissionRule: 'EnumPermission.HOTLINE',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-permissions',
    relatedNodeId: 'ma-alias-hotline',
  },
  {
    id: 'vb-ma-tagging',
    nameVi: 'Tagging',
    nameEn: 'Tagging',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.call',
    androidPermissionRule: 'EnumPermission.CUOC_GOI',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-tagging',
  },
  {
    id: 'vb-ma-monitoring',
    nameVi: 'Giám sát',
    nameEn: 'Monitoring',
    category: 'Nổi bật',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleAction.rightNow trên .call',
    androidPermissionRule: 'EnumPermissionCall.DANG_DIEN_RA',
    bridgeTier: 'custom_bridge',
    customActions: ['monitor_call', 'monitor_call_result', 'monitor_call_state_changed'],
    simulatorFlowId: 'flow-monitoring',
    relatedNodeId: 'ma-monitoring',
    parityNote: 'Cả iOS và Android đều phát monitor_call_state_changed (ACTIVE / DISCONNECTED) xuống JS; Android hiển thị thêm native PiP.',
  },
  {
    id: 'vb-ma-report',
    nameVi: 'Báo cáo',
    nameEn: 'Report',
    category: 'Nổi bật',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.report',
    androidPermissionRule: 'EnumPermission.BAO_CAO',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-report',
  },
  {
    id: 'vb-ma-call-script',
    nameVi: 'Kịch bản tổng đài',
    nameEn: 'Call Script',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.switchboard',
    androidPermissionRule: 'EnumPermission.CAU_HINH_TONG_DAI',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-call-script',
  },
  {
    id: 'vb-ma-bot-ivr',
    nameVi: 'Bot cuộc gọi',
    nameEn: 'Call Bot',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.switchboard',
    androidPermissionRule: 'EnumPermission.CAU_HINH_TONG_DAI',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-bot-ivr',
  },
  {
    id: 'vb-ma-auto-call-campaign',
    nameVi: 'Chiến dịch gọi tự động',
    nameEn: 'Campaign',
    category: 'Gọi tự động',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.callCampaign',
    androidPermissionRule: 'EnumPermission.CHIEN_DICH',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-auto-call-campaign',
  },
  {
    id: 'vb-ma-auto-call-schedule',
    nameVi: 'Chiến dịch đặt lịch',
    nameEn: 'Schedule',
    category: 'Gọi tự động',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.callCampaign',
    androidPermissionRule: 'EnumPermission.CHIEN_DICH',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-auto-call-schedule',
  },
  {
    id: 'vb-ma-auto-call-history-call',
    nameVi: 'Lịch sử gọi tự động',
    nameEn: 'Call History',
    category: 'Gọi tự động',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.callCampaign',
    androidPermissionRule: 'EnumPermission.CHIEN_DICH',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-auto-call-history',
  },
  {
    id: 'vb-ma-auto-call-template',
    nameVi: 'Mẫu kịch bản',
    nameEn: 'Script Template',
    category: 'Gọi tự động',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.callCampaign',
    androidPermissionRule: 'EnumPermission.CHIEN_DICH',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-auto-call-template',
  },
  {
    id: 'vb-ma-auto-call-group-campaign',
    nameVi: 'Nhóm chiến dịch',
    nameEn: 'Campaign Group',
    category: 'Gọi tự động',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.callCampaign',
    androidPermissionRule: 'EnumPermission.CHIEN_DICH',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-auto-call-group-campaign',
  },
  {
    id: 'vb-ma-auto-call-custom-field',
    nameVi: 'Thông tin tuỳ chỉnh',
    nameEn: 'Custom field',
    category: 'Gọi tự động',
    placement: 'features_hub',
    accessLevel: 'member_perm',
    iosPermissionRule: 'VPMRoleVC.callCampaign',
    androidPermissionRule: 'EnumPermission.CHIEN_DICH',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-auto-call-custom-field',
  },

  // ── 13 Mini App mở mặc định / nạp động từ Production ───────────
  {
    id: 'vb-ma-work-schedule',
    nameVi: 'Lịch làm việc',
    nameEn: 'Work Schedule',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule:
      'Mọi user (chưa đưa vào adminOnlyApps / memberAppPermissions trên Host; bên trong phân vai Manager vs Member bằng isAdmin())',
    androidPermissionRule:
      'Mọi user (chưa đưa vào adminOnlyApps / memberAppPermissions trên Host; bên trong phân vai Manager vs Member bằng isAdmin())',
    bridgeTier: 'core_sdk',
    customActions: ['request_mini_app_token', 'refresh_data', 'theme_changed', 'close'],
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-work-schedule',
  },
  {
    id: 'vb-ma-autodial',
    nameVi: 'Quay số tự động',
    nameEn: 'Auto Dial',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule:
      'Mọi user (nạp động từ vb-ma-platform, không nằm trong adminOnlyApps / memberAppPermissions)',
    androidPermissionRule:
      'Mọi user (nạp động từ vb-ma-platform, không nằm trong adminOnlyApps / memberAppPermissions)',
    bridgeTier: 'custom_bridge',
    customActions: [
      'get_supported_actions',
      'get_session_info',
      'make_call',
      'start_autodial',
      'pause_autodial',
      'resume_autodial',
      'stop_autodial',
      'get_autodial_state',
      'autodial_finished',
      'autodial_error',
    ],
    simulatorFlowId: 'flow-autodial',
    relatedNodeId: 'ma-autodial',
  },
  {
    id: 'vb-ma-blacklist',
    nameVi: 'Danh sách đen',
    nameEn: 'Blacklist',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (đã gỡ khỏi adminOnlyApps ở commit 637b6edf)',
    androidPermissionRule: 'Mọi user (không nằm trong adminOnlyApps / memberAppPermissions)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-blacklist',
  },
  {
    id: 'vb-ma-ipcall-control',
    nameVi: 'Kiểm soát IP cuộc gọi',
    nameEn: 'IP call control',
    category: 'Cuộc gọi',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps / memberAppPermissions trên Host)',
    androidPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps / memberAppPermissions trên Host)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-ipcall-control',
  },
  {
    id: 'vb-ma-group-member',
    nameVi: 'Nhóm thành viên',
    nameEn: 'Members Group',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (chưa đưa vào memberAppPermissions trên Host; check THANH_VIEN bên trong)',
    androidPermissionRule: 'Mọi user (chưa đưa vào memberAppPermissions trên Host; check THANH_VIEN bên trong)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-permissions',
    relatedNodeId: 'ma-group-member',
  },
  {
    id: 'vb-ma-storage-management',
    nameVi: 'Quản lý lưu trữ',
    nameEn: 'Storage Management',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps trên Host)',
    androidPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps trên Host)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-storage-management',
  },
  {
    id: 'vb-ma-sdk-mobile-push',
    nameVi: 'SDK Mobile Push',
    nameEn: 'SDK Mobile Push',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps trên Host)',
    androidPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps trên Host)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-sdk-mobile-push',
  },
  {
    id: 'vb-ma-widget',
    nameVi: 'Widget gọi nhanh',
    nameEn: 'Quick dial widget',
    category: 'Cài đặt nhóm',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps trên Host)',
    androidPermissionRule: 'Mọi user (chưa đưa vào adminOnlyApps trên Host)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'ma-widget',
  },
  {
    id: 'vb-ma-crm',
    nameVi: 'Khách hàng',
    nameEn: 'Customer',
    category: 'CRM',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Trang Tính năng LUÔN hiển thị cho mọi Member (đã gỡ khỏi memberAppPermissions trên iOS Nam-dev)',
    androidPermissionRule: 'Trang Tính năng LUÔN hiển thị cho mọi Member (không lọc KHACH_HANG)',
    bridgeTier: 'core_sdk',
    customActions: ['make_call', 'check_permissions', 'open_mini_app'],
    simulatorFlowId: 'flow-make-call',
    relatedNodeId: 'ma-crm',
  },
  {
    id: 'vb-ma-crm-v2',
    nameVi: 'Khách hàng (v2 · utility)',
    nameEn: 'Khách hàng',
    category: 'Tiện ích (utility)',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (Prod is_hidden=false, không lọc trên Host)',
    androidPermissionRule: 'Mọi user (Prod is_hidden=false, không lọc trên Host)',
    bridgeTier: 'core_sdk',
    customActions: ['make_call', 'check_permissions', 'open_mini_app'],
    simulatorFlowId: 'flow-make-call',
    relatedNodeId: 'ma-crm-v2',
  },
  {
    id: 'vb-ma-ticket',
    nameVi: 'Ticket',
    nameEn: 'Ticket',
    category: 'Nổi bật',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (mở từ fetchGlobalMiniApps, tự lọc module bên trong)',
    androidPermissionRule: 'Mọi user (mở từ FeatureFragment)',
    bridgeTier: 'core_sdk',
    customActions: ['open_mini_app', 'request_module_token', 'check_permissions'],
    simulatorFlowId: 'flow-open-child-and-features',
    relatedNodeId: 'ma-ticket',
  },
  {
    id: 'vb-ma-activity-history',
    nameVi: 'Lịch sử tương tác khách hàng',
    nameEn: 'User activity history',
    category: 'Nổi bật',
    placement: 'child_app',
    accessLevel: 'everyone',
    iosPermissionRule: 'Prod is_hidden=true; mở lồng từ vb-ma-ticket / CRM qua open_mini_app',
    androidPermissionRule: 'Prod is_hidden=true; mở lồng từ vb-ma-ticket / CRM qua open_mini_app',
    bridgeTier: 'core_sdk',
    customActions: ['vbma_extra_data', 'close'],
    simulatorFlowId: 'flow-open-child-and-features',
    relatedNodeId: 'ma-activity-history',
  },
  {
    id: 'vb-ma-todo',
    nameVi: 'Công việc',
    nameEn: 'Todo',
    category: 'Nổi bật',
    placement: 'features_hub',
    accessLevel: 'everyone',
    iosPermissionRule: 'Mọi user (theo cấu hình vb-ma-platform)',
    androidPermissionRule: 'Mọi user (theo cấu hình vb-ma-platform)',
    bridgeTier: 'core_sdk',
    simulatorFlowId: 'flow-open-child-and-features',
    relatedNodeId: 'ma-todo',
  },

  // ── 4 Mini App chuyên biệt trong cuộc gọi (Chưa dùng Nam-dev) ───
  {
    id: 'vb-ma-call-note',
    nameVi: 'Ghi chú trong cuộc gọi (Chưa dùng)',
    nameEn: 'Call Note',
    category: 'Trong cuộc gọi',
    placement: 'in_call',
    accessLevel: 'everyone',
    iosPermissionRule: 'Chưa dùng trên Nam-dev (UI cuộc gọi dùng Native)',
    androidPermissionRule: 'inCallOnlyMiniApps — ẩn khỏi Trang Tính năng; UI cuộc gọi dùng Native',
    bridgeTier: 'core_sdk',
    relatedNodeId: 'ma-call-note',
  },
  {
    id: 'vb-ma-call-tag',
    nameVi: 'Gắn thẻ trong cuộc gọi (Chưa dùng)',
    nameEn: 'Call Tag',
    category: 'Trong cuộc gọi',
    placement: 'in_call',
    accessLevel: 'everyone',
    iosPermissionRule: 'Chưa dùng trên Nam-dev (UI cuộc gọi dùng Native)',
    androidPermissionRule: 'inCallOnlyMiniApps — ẩn khỏi Trang Tính năng; UI cuộc gọi dùng Native',
    bridgeTier: 'core_sdk',
    relatedNodeId: 'ma-call-tag',
  },
  {
    id: 'vb-ma-call-transfer',
    nameVi: 'Chuyển tiếp cuộc gọi (Chưa dùng)',
    nameEn: 'Call Transfer',
    category: 'Trong cuộc gọi',
    placement: 'in_call',
    accessLevel: 'everyone',
    iosPermissionRule: 'Chưa dùng trên Nam-dev (chuyển tiếp dùng Native + DTMF #1/*2/*9/*1)',
    androidPermissionRule: 'inCallOnlyMiniApps — chuyển tiếp hiện dùng CallForwardBottomSheet Native + DTMF',
    bridgeTier: 'core_sdk',
    relatedNodeId: 'ma-call-transfer',
  },
  {
    id: 'vb-ma-call-add-member',
    nameVi: 'Thêm thành viên vào cuộc gọi (Chưa dùng)',
    nameEn: 'Add Member to Call',
    category: 'Trong cuộc gọi',
    placement: 'in_call',
    accessLevel: 'everyone',
    iosPermissionRule: 'Chưa dùng trên Nam-dev (chuẩn bị qua CallActionBridgeHelper)',
    androidPermissionRule: 'inCallOnlyMiniApps — ẩn khỏi Trang Tính năng',
    bridgeTier: 'core_sdk',
    relatedNodeId: 'ma-call-add-member',
  },

  // ── 1 Mini App Cài đặt ẩn ──────────────────────────────────────
  {
    id: 'vb-ma-2fa-setting',
    nameVi: 'Cài đặt bảo mật 2 lớp (2FA)',
    nameEn: 'Two-factor authentication',
    category: 'Cài đặt nhóm',
    placement: 'hidden_setting',
    accessLevel: 'everyone',
    iosPermissionRule: 'hiddenApps (ẩn khỏi Trang Tính năng; entry trong Cài đặt đang comment)',
    androidPermissionRule: 'Ẩn trong SettingActivity (llTwoFactorAuthMiniApp đang comment)',
    bridgeTier: 'custom_bridge',
    customActions: ['setup_2fa', 'request_mini_app_token'],
    simulatorFlowId: 'flow-2fa-history',
    relatedNodeId: 'ma-2fa-setting',
    parityNote: 'Cả iOS và Android đều theo dõi mở màn qua MiniAppActiveTracker + emitEventIfMiniAppOpen trước khi đẩy setup_2fa.',
  },
];

export const BRIDGE_PARITY_ALERTS: BridgeParityAlert[] = [
  {
    id: 'pa-token-prewarm',
    title: 'Android chưa pre-warm MiniAppToken lúc mở app',
    severity: 'medium',
    scope: 'request_mini_app_token / request_module_token',
    iosBehavior:
      'MiniAppService.prewarmMiniAppTokenIfNeeded() làm ấm sẵn ngay sau configure() & refreshHostToken() (throttle 600s).',
    androidBehavior:
      'Không có pre-warm MiniAppToken lúc boot; lần request đầu gọi GET /api/User/getTokenMiniApp và VbMaMiniAppTokenService chưa tự gắn callRefreshTokenAPI.',
    recommendationForMiniApp:
      'Luôn chuẩn bị interceptor bắt HTTP 401 để gọi lại requestModuleToken(module, 5000, true) trước khi báo lỗi phiên.',
    simulatorFlowId: 'flow-token-401',
    relatedNodeId: 'vbot-app',
  },
  {
    id: 'pa-contacts-perm',
    title: 'Quyền danh bạ iOS có "limited" & cơ chế chống loop khác Android',
    severity: 'medium',
    scope: 'vb-ma-user-contact',
    iosBehavior:
      'CNAuthorizationStatus có trạng thái "limited" (iOS 18+); chặn vòng lặp Notification bằng tag userInfo["source"] = "miniapp_bridge".',
    androidBehavior:
      'READ_CONTACTS chỉ có granted/denied (kèm cờ hasPromptedReadContacts); chặn lặp bằng hash computeContactsSignature().',
    recommendationForMiniApp:
      'Xử lý cả permissionStatus === "limited" (hiển thị banner cho phép chọn thêm danh bạ hoặc mở Cài đặt).',
    simulatorFlowId: 'flow-user-contact',
    relatedNodeId: 'contact-personal',
  },
];

export function resolveActionFlowTarget(
  actionName: string,
  miniAppId?: string,
): ActionFlowTarget | null {
  switch (actionName) {
    case 'start_autodial':
      return { flowId: 'flow-autodial', subFlowId: 'autodial-start' };
    case 'pause_autodial':
    case 'resume_autodial':
      return { flowId: 'flow-autodial', subFlowId: 'autodial-pause-resume' };
    case 'stop_autodial':
    case 'get_autodial_state':
      return { flowId: 'flow-autodial', subFlowId: 'autodial-stop-state' };
    case 'get_supported_actions':
    case 'get_session_info':
      return { flowId: 'flow-autodial', subFlowId: 'autodial-init-session' };
    case 'autodial_finished':
    case 'autodial_error':
      return { flowId: 'flow-autodial', subFlowId: 'autodial-finish-error' };
    case 'make_call':
      return miniAppId === 'vb-ma-autodial'
        ? { flowId: 'flow-autodial', subFlowId: 'autodial-make-call' }
        : { flowId: 'flow-make-call' };
    case 'monitor_call':
    case 'monitor_call_result':
    case 'monitor_call_state_changed':
      return { flowId: 'flow-monitoring' };
    case 'user_contact_get_local':
    case 'user_contact_refresh_server':
    case 'user_contact_import_device':
    case 'user_contact_delete_local':
    case 'user_contact_open_settings':
    case 'user_contacts_updated':
    case 'toggle_actions_menu':
      return { flowId: 'flow-user-contact' };
    case 'check_permissions':
      return { flowId: 'flow-permissions' };
    case 'request_module_token':
    case 'request_mini_app_token':
      return { flowId: 'flow-token-401' };
    case 'open_mini_app':
    case 'vbma_extra_data':
    case 'close':
      return { flowId: 'flow-open-child-and-features' };
    case 'setup_2fa':
    case 'filter_changed':
    case 'refresh_data':
    case 'theme_changed':
      return { flowId: 'flow-2fa-history' };
    default:
      return null;
  }
}

export function exportMiniAppBridgeMarkdown(): string {
  const lines: string[] = [
    '# Tài liệu Cầu nối Host App ↔ Mini App (VBot Nam-dev)',
    '',
    '## 1. Kiến trúc tổng quan & Vòng đời',
    '- **Mini App Web (`@vbotma/sdk`)**: đọc ngữ cảnh `#vbma_data` / `vbma_theme` qua `retrieveLaunchParams()`, gửi lệnh qua `postEvent()` / `request()` và nhận phản hồi từ `on(event, cb)`.',
    '- **Kênh Native SDK (`VbMaSDK`)**: iOS dùng `WKWebView` `WKScriptMessageHandler ("vbma")`; Android dùng `WebView` `@JavascriptInterface ("VbMABridge.post()")`. Cả hai trả về WebView qua `VbMA.receive(event, data)`.',
    '- **Host App (`MiniAppService.swift` / `MiniAppHelper.kt`)**: xử lý token, kiểm tra RBAC 2 tầng, quay số SIP (PJSIP), WebSocket Autodial và SQLite danh bạ.',
    '',
    '## 2. Luồng chạy thử chi tiết',
  ];

  for (const flow of MINI_APP_SIMULATOR_FLOWS) {
    lines.push(`### ${flow.title} (\`${flow.miniAppId}\`)`, '', flow.summary, '');
    if (flow.subFlows?.length) {
      for (const sf of flow.subFlows) {
        lines.push(`#### ${sf.label} (\`${sf.eventBadge}\`)`, '', sf.summary, '');
        for (const st of sf.steps) {
          lines.push(
            `${st.stepNumber}. **${st.title}** (\`${st.from} → ${st.to}\`: \`${st.arrowLabel}\`)`,
            `   - ${st.explanation}`,
            `   - iOS: \`${st.hostIos.fn}\``,
            `   - Android: \`${st.hostAndroid.fn}\``,
          );
          if (st.parityWarning) {
            lines.push(`   - ⚠️ ${st.parityWarning}`);
          }
        }
        lines.push('');
      }
    } else {
      for (const st of flow.steps) {
        lines.push(
          `${st.stepNumber}. **${st.title}** (\`${st.from} → ${st.to}\`: \`${st.arrowLabel}\`)`,
          `   - ${st.explanation}`,
          `   - iOS: \`${st.hostIos.fn}\``,
          `   - Android: \`${st.hostAndroid.fn}\``,
        );
        if (st.parityWarning) {
          lines.push(`   - ⚠️ ${st.parityWarning}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('## 3. Bảng tra cứu Core Protocol & Custom Host Action');
  for (const item of CORE_BRIDGE_SPECS) {
    lines.push(
      `- **\`${item.name}\`** (${item.direction} · ${item.category}): ${item.summary}`,
      `  - iOS: \`${item.iosHandler}\` | Android: \`${item.androidHandler}\``,
    );
  }
  lines.push('');

  lines.push(`## 4. Danh mục đầy đủ ${MINI_APP_CATALOG.length} Mini App`);
  for (const app of MINI_APP_CATALOG) {
    const acts = app.customActions?.length ? ` · Actions: \`${app.customActions.join('`, `')}\`` : '';
    lines.push(
      `- **\`${app.id}\`** (${app.nameVi} / ${app.nameEn}) — *${app.category}* · Vị trí: \`${app.placement}\` · Quyền iOS: ${app.iosPermissionRule} | Android: ${app.androidPermissionRule}${acts}`,
    );
  }
  lines.push('');

  lines.push('## 5. Điểm lệch Parity iOS ↔ Android cần lưu ý');
  for (const alert of BRIDGE_PARITY_ALERTS) {
    lines.push(
      `- **[${alert.severity.toUpperCase()}] ${alert.title}** (${alert.scope})`,
      `  - iOS: ${alert.iosBehavior}`,
      `  - Android: ${alert.androidBehavior}`,
      `  - Khuyến nghị Mini App: ${alert.recommendationForMiniApp}`,
    );
  }

  return lines.join('\n');
}
