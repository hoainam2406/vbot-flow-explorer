// tests/markdownExport.test.ts
import { describe, expect, it } from 'vitest';
import { exportNodeOverviewMarkdown } from '../src/core/publicMarkdownExport';
import { exportNodeTechMarkdown } from '../src/core/techMarkdownExport';
import type { FlowNodeData, MergedFlowDataset } from '../src/data/schema';

const parentNode: FlowNodeData = {
  id: 'mod-sample',
  label: 'Xử lý cuộc gọi',
  kind: 'module',
  audience: 'all',
  summary: {
    overview: 'Nhân viên nghe và chuyển tiếp cuộc gọi khách hàng.',
    tech: 'iOS Linphone CallKit vs Android PJSIP CallService.',
  },
  techDetail: {
    platformDiffNote: 'iOS dùng HTTP bgapi trước rồi fallback DTMF; Android phát DTMF #1 trực tiếp.',
    inputs: ['phone', 'hotline'],
    outputs: ['CallSession'],
    apisOrEvents: ['POST /api/call/start'],
    edgeCases: ['Mất mạng nền -1005'],
    codeRefs: ['VBot/Service/SecretSwiftHandler.swift'],
    byPlatform: {
      android: {
        summary: 'Android chạy PJSIP và CallService foreground.',
        apisOrEvents: ['VBotPhone.startOutgoingCall'],
        edgeCases: ['API 34 cần canUseFullScreenIntent'],
        codeRefs: ['VBot-Android/app/src/main/java/SecretAndroidHandler.kt'],
      },
    },
    miniAppBridge: {
      miniAppId: 'vb-ma-calling',
      embedMode: 'sdk_global',
      transportByPlatform: {
        ios: 'VbMaDelegate.onRequestCall',
        android: 'VbMaHostCallback.onRequestCall',
      },
      messages: [
        {
          direction: 'miniapp_to_host',
          name: 'make_call',
          hostFnByPlatform: {
            ios: 'MiniAppService.onRequestCall',
            android: 'MiniAppHelper.makeDirectCall',
          },
          miniAppFn: 'makeCall(params)',
          payload: '{ phoneNumber }',
          response: '{ success }',
          examplePayload: '{"phoneNumber":"0901234567"}',
          exampleResponse: '{"success":true}',
          parityNote: 'Android delay 200ms trước khi gọi callback.',
        },
      ],
    },
  },
  relatedNodeIds: ['rel-public', 'rel-tech'],
};

const dataset: MergedFlowDataset = {
  app: { name: 'VBot', tagline: 'Test' },
  rootNode: {
    id: 'root',
    label: 'VBot App',
    kind: 'module',
    audience: 'all',
    summary: { overview: 'App' },
  },
  branches: [
    parentNode,
    {
      id: 'rel-public',
      label: 'Danh bạ công khai',
      kind: 'module',
      audience: 'all',
      summary: { overview: 'Public contact' },
    },
    {
      id: 'rel-tech',
      label: 'Bảng kỹ thuật nội bộ',
      kind: 'process',
      audience: 'tech',
      summary: { overview: 'Tech secret node' },
    },
  ],
  branchEdges: [],
  subtreesByParentId: {
    'mod-sample': {
      title: 'Sub',
      layoutHint: 'flow',
      entryNodeIds: ['step-1'],
      nodes: [
        {
          id: 'step-1',
          label: 'Bấm nút gọi',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Người dùng bấm gọi ra.' },
        },
        {
          id: 'step-tech-ios',
          label: 'SecretPushKit Step',
          kind: 'process',
          audience: 'tech',
          platforms: ['ios'],
          summary: { overview: 'Hidden Tech Step', tech: 'PKPushRegistry internal' },
        },
        {
          id: 'step-tech-and',
          label: 'SecretFsi Step',
          kind: 'process',
          audience: 'tech',
          platforms: ['android'],
          summary: { overview: 'Android only step', tech: 'FullScreenIntent internal' },
        },
        {
          id: 'step-2',
          label: 'Mở màn hình đàm thoại',
          kind: 'action',
          audience: 'all',
          summary: { overview: 'Bắt đầu nghe gọi.' },
        },
      ],
      edges: [
        { id: 'e1', source: 'step-1', target: 'step-tech-ios', platforms: ['ios'] },
        { id: 'e2', source: 'step-tech-ios', target: 'step-2', platforms: ['ios'] },
        { id: 'e3', source: 'step-1', target: 'step-tech-and', platforms: ['android'] },
        { id: 'e4', source: 'step-tech-and', target: 'step-2', platforms: ['android'] },
      ],
      scenarios: [
        {
          id: 'sc-ios',
          name: 'Kịch bản iOS PushKit',
          audience: 'tech',
          platforms: ['ios'],
          nodeIds: ['step-1', 'step-tech-ios', 'step-2'],
          edgeIds: ['e1', 'e2'],
        },
        {
          id: 'sc-and',
          name: 'Kịch bản Android FSI',
          audience: 'tech',
          platforms: ['android'],
          nodeIds: ['step-1', 'step-tech-and', 'step-2'],
          edgeIds: ['e3', 'e4'],
        },
      ],
    },
  },
};

describe('markdownExport', () => {
  it('exportNodeOverviewMarkdown emits only overview content and strips all tech/platform secrets', () => {
    const md = exportNodeOverviewMarkdown(parentNode, dataset, { includeSubtree: true });

    expect(md).toContain('# Xử lý cuộc gọi');
    expect(md).toContain('Nhân viên nghe và chuyển tiếp cuộc gọi khách hàng.');
    expect(md).toContain('Bấm nút gọi');
    expect(md).toContain('Mở màn hình đàm thoại');
    expect(md).toContain('Bấm nút gọi → Mở màn hình đàm thoại');
    expect(md).toContain('Danh bạ công khai');

    const forbidden = [
      'Linphone CallKit',
      'SecretSwiftHandler',
      'SecretAndroidHandler',
      'platformDiffNote',
      'iOS dùng HTTP bgapi',
      'makeDirectCall',
      'vb-ma-calling',
      'Hidden Tech Step',
      'SecretPushKit',
      'SecretFsi',
      'Bảng kỹ thuật nội bộ',
      'make_call',
    ];
    for (const token of forbidden) {
      expect(md).not.toContain(token);
    }
  });

  it('exportNodeTechMarkdown renders both platforms in compare mode and filters properly per single OS', () => {
    const compareMd = exportNodeTechMarkdown(parentNode, dataset, 'compare', { includeSubtree: true });
    expect(compareMd).toContain('## Điểm khác biệt iOS ↔ Android');
    expect(compareMd).toContain('### iOS (Swift)');
    expect(compareMd).toContain('### Android (Kotlin / Java)');
    expect(compareMd).toContain('SecretSwiftHandler.swift');
    expect(compareMd).toContain('SecretAndroidHandler.kt');
    expect(compareMd).toContain('## Giao tiếp Host ↔ Mini App');
    expect(compareMd).toContain('```json');
    expect(compareMd).toContain('Android delay 200ms');
    expect(compareMd).toContain('SecretPushKit Step');
    expect(compareMd).toContain('SecretFsi Step');
    expect(compareMd).toContain('Kịch bản iOS PushKit');
    expect(compareMd).toContain('Kịch bản Android FSI');

    const iosMd = exportNodeTechMarkdown(parentNode, dataset, 'ios', { includeSubtree: true });
    expect(iosMd).toContain('### iOS (Swift)');
    expect(iosMd).not.toContain('### Android (Kotlin / Java)');
    expect(iosMd).toContain('SecretPushKit Step');
    expect(iosMd).not.toContain('SecretFsi Step');
    expect(iosMd).toContain('Kịch bản iOS PushKit');
    expect(iosMd).not.toContain('Kịch bản Android FSI');

    const androidMd = exportNodeTechMarkdown(parentNode, dataset, 'android', { includeSubtree: true });
    expect(androidMd).toContain('### Android (Kotlin / Java)');
    expect(androidMd).not.toContain('### iOS (Swift)');
    expect(androidMd).toContain('SecretFsi Step');
    expect(androidMd).not.toContain('SecretPushKit Step');
    expect(androidMd).toContain('Kịch bản Android FSI');
    expect(androidMd).not.toContain('Kịch bản iOS PushKit');
  });
});
