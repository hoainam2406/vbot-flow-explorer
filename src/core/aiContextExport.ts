// src/core/aiContextExport.ts
import { findNodeById, getNodeDisplayLabel } from "./graphEngine";
import type { MiniAppContract } from "./miniAppContractBuilder";
import {
  PARITY_FIX_TARGET_LABELS,
  PARITY_NEEDS_FIX_LABELS,
  PARITY_VERDICT_LABELS,
  type ParityItem,
} from "./parityAnalyzer";
import {
  detectCodeRefPlatform,
  type DevWorkspaceSettings,
} from "./workspaceSettings";
import type {
  FlowNodeData,
  MergedFlowDataset,
  Platform,
  PlatformViewMode,
} from "../data/schema";

function joinLocalPath(base: string, rel: string): string {
  const cleanBase = base.trim().replace(/\/+$/, "");
  let cleanRel = rel.trim().replace(/^\/+/, "");
  if (!cleanBase) return rel;
  if (
    cleanBase.endsWith("/VBot-Android") &&
    cleanRel.startsWith("VBot-Android/")
  ) {
    cleanRel = cleanRel.slice("VBot-Android/".length);
  } else if (
    cleanBase.endsWith("/VBot-iOS") &&
    cleanRel.startsWith("VBot-iOS/")
  ) {
    cleanRel = cleanRel.slice("VBot-iOS/".length);
  }
  return `${cleanBase}/${cleanRel}`;
}

function formatCodeRefLine(
  ref: string,
  settings?: DevWorkspaceSettings,
): string {
  const plat = detectCodeRefPlatform(ref);
  if (!settings) return `- \`${ref}\``;
  const repoBase =
    plat === "ios" ? settings.localIosRepoPath : settings.localAndroidRepoPath;
  if (!repoBase?.trim()) return `- [${plat.toUpperCase()}] \`${ref}\``;
  return `- [${plat.toUpperCase()}] \`${ref}\` → \`${joinLocalPath(repoBase, ref)}\``;
}

function collectNodeCodeRefs(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.codeRefs ?? []);
  for (const r of node.techDetail?.byPlatform?.ios?.codeRefs ?? []) set.add(r);
  for (const r of node.techDetail?.byPlatform?.android?.codeRefs ?? [])
    set.add(r);
  return [...set];
}

function collectNodeApis(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.apisOrEvents ?? []);
  for (const a of node.techDetail?.byPlatform?.ios?.apisOrEvents ?? [])
    set.add(a);
  for (const a of node.techDetail?.byPlatform?.android?.apisOrEvents ?? [])
    set.add(a);
  return [...set];
}

function collectNodeEdgeCases(node: FlowNodeData): string[] {
  const set = new Set<string>(node.techDetail?.edgeCases ?? []);
  for (const e of node.techDetail?.byPlatform?.ios?.edgeCases ?? []) set.add(e);
  for (const e of node.techDetail?.byPlatform?.android?.edgeCases ?? [])
    set.add(e);
  return [...set];
}

export function buildNodeAiContextPrompt(
  node: FlowNodeData,
  dataset: MergedFlowDataset,
  platformMode: PlatformViewMode,
  settings?: DevWorkspaceSettings,
): string {
  const overviewLabel = getNodeDisplayLabel(node, "overview");
  const techLabel = getNodeDisplayLabel(node, "tech");
  const codeRefs = collectNodeCodeRefs(node);
  const apis = collectNodeApis(node);
  const edgeCases = collectNodeEdgeCases(node);
  const pa = node.techDetail?.parityAssessment;

  const lines: string[] = [
    `# Ngữ cảnh kỹ thuật VBot — ${techLabel}`,
    "",
    "Hãy sử dụng ngữ cảnh dưới đây khi phân tích, sửa lỗi hoặc đối chiếu luồng trong mã nguồn VBot.",
    "",
    "## 1. Định danh & Mô tả luồng",
    `- **Node ID:** \`${node.id}\` (kind: \`${node.kind}\`)`,
    `- **Tên hiển thị:** ${overviewLabel}${techLabel !== overviewLabel ? ` · **Tên kỹ thuật:** ${techLabel}` : ""}`,
    `- **Nền tảng đang xem:** \`${platformMode}\` (nhánh đối soát: \`${dataset.app.techBranch ?? "Nam-dev"}\`)`,
    `- **Nghiệp vụ (Overview):** ${node.summary.overview}`,
    ...(node.summary.tech
      ? [`- **Kỹ thuật (Tech):** ${node.summary.tech}`]
      : []),
  ];

  if (node.techDetail?.platformDiffNote || pa) {
    lines.push("", "## 2. Chênh lệch iOS ↔ Android & Parity");
    if (node.techDetail?.platformDiffNote) {
      lines.push(
        `- **Ghi chú khác biệt:** ${node.techDetail.platformDiffNote}`,
      );
    }
    if (pa) {
      lines.push(
        ...(pa.code ? [`- **Mã chênh lệch:** \`${pa.code}\``] : []),
        `- **Đánh giá:** ${PARITY_VERDICT_LABELS[pa.verdict]} · ${PARITY_NEEDS_FIX_LABELS[pa.needsFix]}`,
        `- **Bên cần xử lý:** ${PARITY_FIX_TARGET_LABELS[pa.fixTarget ?? "none"]}`,
        `- **Giải thích:** ${pa.explanation}`,
        `- **Khuyến nghị:** ${pa.recommendation}`,
      );
    }
  }

  if (
    node.techDetail?.byPlatform?.ios ||
    node.techDetail?.byPlatform?.android
  ) {
    lines.push("", "## 3. Triển khai theo nền tảng");
    if (node.techDetail.byPlatform?.ios?.summary) {
      lines.push(`- **iOS:** ${node.techDetail.byPlatform.ios.summary}`);
    }
    if (node.techDetail.byPlatform?.android?.summary) {
      lines.push(
        `- **Android:** ${node.techDetail.byPlatform.android.summary}`,
      );
    }
  }

  if (codeRefs.length > 0) {
    lines.push("", "## 4. File mã nguồn cần đọc (`codeRefs`)");
    lines.push(...codeRefs.map((ref) => formatCodeRefLine(ref, settings)));
  }

  if (apis.length > 0) {
    lines.push("", "## 5. APIs / WebSocket / Sự kiện liên quan");
    lines.push(...apis.map((a) => `- \`${a}\``));
  }

  if (edgeCases.length > 0) {
    lines.push("", "## 6. Edge Cases & Ràng buộc cần giữ nguyên");
    lines.push(...edgeCases.map((e) => `- ${e}`));
  }

  if (node.techDetail?.miniAppBridge) {
    const b = node.techDetail.miniAppBridge;
    lines.push(
      "",
      `## 7. Cầu nối Mini App (\`${b.miniAppId}\`, mode: \`${b.embedMode}\`)`,
    );
    if (b.transportByPlatform?.ios)
      lines.push(`- **iOS Transport:** ${b.transportByPlatform.ios}`);
    if (b.transportByPlatform?.android)
      lines.push(`- **Android Transport:** ${b.transportByPlatform.android}`);
    for (const msg of b.messages) {
      lines.push(
        `- \`[${msg.direction}] ${msg.name}\`: ${msg.miniAppFn ?? msg.hostFn ?? ""}`,
      );
    }
  }

  const related = (node.relatedNodeIds ?? [])
    .map((id) => findNodeById(dataset, id))
    .filter((n): n is FlowNodeData => Boolean(n));
  if (related.length > 0) {
    lines.push("", "## 8. Node liên kết chéo");
    lines.push(
      ...related.map(
        (r) => `- \`${r.id}\` — ${getNodeDisplayLabel(r, "tech")}`,
      ),
    );
  }

  return lines.join("\n") + "\n";
}

interface PlatformMeta {
  platform: Platform;
  name: string;
  techStack: string;
  repoName: string;
  other: Platform;
}

function getPlatformMeta(platform: Platform): PlatformMeta {
  if (platform === "ios") {
    return {
      platform: "ios",
      name: "iOS",
      techStack: "Swift / UIKit",
      repoName: "VBot-iOS",
      other: "android",
    };
  }
  return {
    platform: "android",
    name: "Android",
    techStack: "Kotlin / Java",
    repoName: "VBot-Android",
    other: "ios",
  };
}

function collectPlatformCodeRefs(
  node: FlowNodeData | undefined,
  platform: Platform,
): string[] {
  if (!node) return [];
  const set = new Set<string>(
    node.techDetail?.byPlatform?.[platform]?.codeRefs ?? [],
  );
  for (const ref of node.techDetail?.codeRefs ?? []) {
    if (detectCodeRefPlatform(ref) === platform) {
      set.add(ref);
    }
  }
  return [...set];
}

function formatPlatformCodeRefLine(
  ref: string,
  platform: Platform,
  settings?: DevWorkspaceSettings,
): string {
  const repoBase =
    platform === "ios"
      ? settings?.localIosRepoPath
      : settings?.localAndroidRepoPath;
  if (!repoBase?.trim()) return `- \`${ref}\``;
  return `- \`${ref}\` → \`${joinLocalPath(repoBase, ref)}\``;
}

function collectPlatformList(
  shared: string[] | undefined,
  specific: string[] | undefined,
): string[] {
  const set = new Set<string>();
  for (const item of specific ?? []) set.add(item);
  for (const item of shared ?? []) set.add(item);
  return [...set];
}

function buildParityMissionLine(item: ParityItem, platform: Platform): string {
  const target = getPlatformMeta(platform);
  const other = getPlatformMeta(target.other);
  const { fixTarget, verdict } = item.assessment;

  if (fixTarget === platform) {
    return `**Nhiệm vụ chính:** Sửa mã nguồn trên **${target.name}** (\`${target.repoName}\`) để đồng bộ hành vi/contract với **${other.name}** theo khuyến nghị bên dưới.`;
  }
  if (fixTarget === "both") {
    return `**Nhiệm vụ chính:** Mục này cần chỉnh sửa ở cả 2 bên, nhưng trong phiên làm việc này **chỉ thực hiện phần của ${target.name} (\`${target.repoName}\`)** sao cho khớp hợp đồng chung với **${other.name}**.`;
  }
  if (fixTarget === target.other) {
    return `**Lưu ý phạm vi:** Đánh giá Parity gốc đang xác định bên cần sửa chính là **${other.name}** (\`${PARITY_FIX_TARGET_LABELS[fixTarget]}\`). Chỉ sửa code trên **${target.name}** nếu bạn chủ động muốn điều chỉnh phía **${target.name}** theo **${other.name}**, hoặc dùng prompt này để kiểm tra/xác minh hành vi hiện tại của **${target.name}**.`;
  }
  if (fixTarget === "tbd") {
    return `**Nhiệm vụ chính (Chờ chốt bên chuẩn):** Hiện chưa chốt bên nào làm chuẩn (\`tbd\`). Hãy đọc code hiện tại của **${target.name}**, đối chiếu với mô tả của **${other.name}**, đề xuất phương án sửa cụ thể cho **${target.name}** và chờ xác nhận trước khi sửa code.`;
  }
  return `**Nhiệm vụ chính (Chỉ đối soát / xác minh):** Mục này được đánh giá là **${PARITY_VERDICT_LABELS[verdict]}** (không cần sửa). Hãy kiểm tra code **${target.name}** để xác nhận hành vi thực tế khớp với tài liệu; **không** tự ý refactor làm mất đặc thù hệ điều hành.`;
}

export function buildParityItemAiContextPrompt(
  item: ParityItem,
  dataset: MergedFlowDataset,
  platform: Platform,
  settings?: DevWorkspaceSettings,
): string {
  const target = getPlatformMeta(platform);
  const other = getPlatformMeta(target.other);
  const node = findNodeById(dataset, item.nodeId);
  const targetDetail = node?.techDetail?.byPlatform?.[platform];
  const otherDetail = node?.techDetail?.byPlatform?.[target.other];

  const branchName =
    settings?.branchOverride?.trim() || dataset.app.techBranch || "Nam-dev";
  const targetRepoPath =
    platform === "ios"
      ? settings?.localIosRepoPath?.trim()
      : settings?.localAndroidRepoPath?.trim();

  const targetRefs = collectPlatformCodeRefs(node, platform);
  const otherRefs = collectPlatformCodeRefs(node, target.other);

  const targetInputs = collectPlatformList(
    node?.techDetail?.inputs,
    targetDetail?.inputs,
  );
  const targetOutputs = collectPlatformList(
    node?.techDetail?.outputs,
    targetDetail?.outputs,
  );
  const targetApis = collectPlatformList(
    node?.techDetail?.apisOrEvents,
    targetDetail?.apisOrEvents,
  );
  const otherOnlyApis = otherDetail?.apisOrEvents ?? [];
  const targetEdgeCases = collectPlatformList(
    node?.techDetail?.edgeCases,
    targetDetail?.edgeCases,
  );

  const isOnlyOnOtherPlatform =
    node?.platforms?.length === 1 && node.platforms[0] !== platform;
  const targetSummary =
    (platform === "ios" ? item.iosSummary : item.androidSummary) ??
    targetDetail?.summary;
  const otherSummary =
    (target.other === "ios" ? item.iosSummary : item.androidSummary) ??
    otherDetail?.summary;

  const lines: string[] = [
    `# [${item.code} · Sửa Parity ${target.name}] ${item.nodeLabel}`,
    "",
    `Bạn là kỹ sư **${target.name} (${target.techStack})** làm việc trên repo **\`${target.repoName}\`** (nhánh đối soát: \`${branchName}\`).`,
    `Chỉ kiểm tra và chỉnh sửa mã nguồn trong **${target.name} (\`${target.repoName}\`)** — **KHÔNG** chỉnh sửa repo **${other.repoName}**.`,
    buildParityMissionLine(item, platform),
    "",
    "## 1. Thông tin sai lệch cần xử lý",
    `- **Mã chênh lệch:** \`${item.code}\``,
    `- **Node ID:** \`${item.nodeId}\` (${item.breadcrumb.join(" › ")})`,
    `- **Nền tảng mục tiêu:** ${target.name} (\`${target.repoName}\` · ${target.techStack})`,
    ...(targetRepoPath
      ? [`- **Đường dẫn repo local:** \`${targetRepoPath}\``]
      : []),
    `- **Phân loại Parity:** ${PARITY_VERDICT_LABELS[item.assessment.verdict]}`,
    `- **Mức độ cần sửa:** ${PARITY_NEEDS_FIX_LABELS[item.assessment.needsFix]}`,
    `- **Bên cần sửa theo đánh giá (fixTarget):** ${PARITY_FIX_TARGET_LABELS[item.assessment.fixTarget]}`,
    `- **Cùng logic:** ${item.assessment.sameLogic ? "Có" : "Không"} · **Cùng kết quả UX:** ${item.assessment.sameOutcome ? "Có" : "Không"}`,
    `- **Giải thích sai lệch:** ${item.assessment.explanation}`,
    `- **Khuyến nghị xử lý:** ${item.assessment.recommendation}`,
    ...(item.platformDiffNote
      ? [`- **Ghi chú kỹ thuật đối soát:** ${item.platformDiffNote}`]
      : []),
    "",
    `## 2. Ngữ cảnh & file mã nguồn cần kiểm tra/sửa trên ${target.name}`,
  ];

  if (isOnlyOnOtherPlatform && !targetSummary) {
    lines.push(
      `- **Hiện trạng ${target.name}:** Bước/màn hình này hiện **chưa tồn tại trên ${target.name}** (mới chỉ có trên ${other.name}).`,
    );
  } else {
    lines.push(
      `- **Hiện trạng ${target.name}:** ${targetSummary || "Chưa có mô tả riêng"}`,
    );
  }

  if (targetDetail?.transport) {
    lines.push(`- **Transport ${target.name}:** ${targetDetail.transport}`);
  }
  if (targetInputs.length > 0) {
    lines.push(`- **Inputs:** ${targetInputs.join(" · ")}`);
  }
  if (targetOutputs.length > 0) {
    lines.push(`- **Outputs:** ${targetOutputs.join(" · ")}`);
  }
  if (targetApis.length > 0) {
    lines.push(
      `- **APIs / Events (${target.name}):** ${targetApis.map((a) => `\`${a}\``).join(", ")}`,
    );
  }

  lines.push("", `### File cần mở trong ${target.repoName}`);
  if (targetRefs.length > 0) {
    lines.push(
      ...targetRefs.map((ref) =>
        formatPlatformCodeRefLine(ref, platform, settings),
      ),
    );
  } else {
    lines.push(
      `- Chưa gắn \`codeRefs\` riêng cho ${target.name} — hãy tìm kiếm trong \`${target.repoName}\` theo tên luồng, API hoặc Mini App ID (\`${item.nodeId}\`).`,
    );
  }

  lines.push(
    "",
    `## 3. Hành vi đối chiếu từ ${other.name} (Chỉ tham khảo — KHÔNG sửa repo này)`,
    `- **Hiện trạng ${other.name}:** ${otherSummary || "Chưa có mô tả riêng"}`,
  );
  if (otherDetail?.transport) {
    lines.push(`- **Transport ${other.name}:** ${otherDetail.transport}`);
  }
  if (otherOnlyApis.length > 0) {
    lines.push(
      `- **APIs / Events phía ${other.name}:** ${otherOnlyApis.map((a) => `\`${a}\``).join(", ")}`,
    );
  }
  if (otherRefs.length > 0) {
    lines.push(
      "",
      `### File tham chiếu phía ${other.name} (chỉ đọc đối chiếu)`,
    );
    lines.push(...otherRefs.map((ref) => `- \`${ref}\``));
  }

  const bridge = node?.techDetail?.miniAppBridge;
  if (bridge || item.bridgeParityNotes.length > 0) {
    lines.push("", "## 4. Hợp đồng Mini App Bridge liên quan");
    if (bridge) {
      lines.push(
        `- **Mini App:** \`${bridge.miniAppId}\` (embedMode: \`${bridge.embedMode}\`)`,
      );
      const targetTransport =
        bridge.transportByPlatform?.[platform] ?? bridge.transport;
      const otherTransport = bridge.transportByPlatform?.[target.other];
      if (targetTransport) {
        lines.push(`- **Transport ${target.name}:** ${targetTransport}`);
      }
      if (otherTransport) {
        lines.push(
          `- **Transport ${other.name} (đối chiếu):** ${otherTransport}`,
        );
      }
      for (const msg of bridge.messages) {
        const targetHostFn = msg.hostFnByPlatform?.[platform] ?? msg.hostFn;
        const otherHostFn = msg.hostFnByPlatform?.[target.other];
        const parts: string[] = [`\`[${msg.direction}] ${msg.name}\``];
        if (targetHostFn)
          parts.push(`Host ${target.name}: \`${targetHostFn}\``);
        if (otherHostFn) parts.push(`Host ${other.name}: \`${otherHostFn}\``);
        if (msg.miniAppFn) parts.push(`Mini App: \`${msg.miniAppFn}\``);
        if (msg.payload) parts.push(`Payload: ${msg.payload}`);
        if (msg.response) parts.push(`Response: ${msg.response}`);
        lines.push(`- ${parts.join(" · ")}`);
        if (msg.parityNote) {
          lines.push(`  - ⚠️ **Parity:** ${msg.parityNote}`);
        }
      }
    } else {
      for (const note of item.bridgeParityNotes) {
        lines.push(`- **Bridge \`${note.messageName}\`:** ${note.parityNote}`);
      }
    }
  }

  if (targetEdgeCases.length > 0) {
    lines.push(
      "",
      `## 5. Edge Cases & Ràng buộc bắt buộc bảo toàn (${target.name})`,
    );
    lines.push(...targetEdgeCases.map((e) => `- ${e}`));
  }

  const nextSectionNum = targetEdgeCases.length > 0 ? 6 : 5;
  lines.push(
    "",
    `## ${nextSectionNum}. Yêu cầu thực hiện & Tiêu chí nghiệm thu (${target.name})`,
  );

  if (item.assessment.fixTarget === "tbd") {
    lines.push(
      `1. Đọc các file ${target.name} liệt kê ở mục 2 và đối chiếu với hành vi của ${other.name} ở mục 3.`,
      `2. Phân tích nguyên nhân sai lệch và đề xuất phương án sửa cụ thể trên \`${target.repoName}\` (${target.techStack}) — **chưa sửa code trước khi người dùng chốt phương án**.`,
      "3. Đảm bảo phương án giữ nguyên các edge cases và hợp đồng bridge/API liên quan.",
    );
  } else if (item.assessment.fixTarget === "none") {
    lines.push(
      `1. Kiểm tra lại các file ${target.name} ở mục 2 để xác nhận hành vi thực tế khớp với mô tả đối soát.`,
      `2. Không refactor làm mất đặc thù ${target.techStack} nếu kết quả UX đã tương đương ${other.name}.`,
      "3. Báo cáo lại nếu phát hiện code thực tế đang lệch so với mô tả trên sơ đồ.",
    );
  } else {
    lines.push(
      `1. Mở và đọc đúng các file thuộc \`${target.repoName}\` ở mục 2.`,
      `2. Chỉnh sửa logic/UI/contract trên **${target.name} (${target.techStack})** theo khuyến nghị ở mục 1 để khớp hành vi với ${other.name}.`,
      "3. Bảo toàn toàn bộ edge cases và tương thích ngược với Mini App / API hiện tại.",
      `4. Sau khi sửa, liệt kê rõ các file đã thay đổi trong \`${target.repoName}\` và các bước kiểm tra/build cần chạy.`,
    );
  }

  return lines.join("\n") + "\n";
}

export function buildMiniAppAiContextPrompt(contract: MiniAppContract): string {
  const {
    app,
    launchParams,
    incomingEvents,
    outgoingCommands,
    parityAlerts,
    manifestPermissionsJson,
  } = contract;

  const lines: string[] = [
    `# Ngữ cảnh tích hợp Mini App: ${app.nameVi} (\`${app.id}\`)`,
    "",
    "Sử dụng tài liệu hợp đồng này để code hoặc debug giao tiếp giữa Mini App (`@vbotma/sdk`) và Host App iOS/Android.",
    "",
    `- **Vị trí hiển thị:** \`${app.placement}\` · **Quyền truy cập:** \`${app.accessLevel}\``,
    `- **iOS Rule:** ${app.iosPermissionRule}`,
    `- **Android Rule:** ${app.androidPermissionRule}`,
    "",
    "## 1. Launch Params (URL Hash)",
    ...launchParams.map(
      (lp) =>
        `- \`${lp.key}\` (\`${lp.type}\`, ${lp.required ? "bắt buộc" : "tùy chọn"}): ${lp.description}`,
    ),
    "",
    "## 2. Sự kiện Host Push xuống Mini App (`onEvent`)",
    ...incomingEvents.map((e) => `- \`${e.eventName}\`: ${e.summary}`),
    "",
    "## 3. Lệnh Mini App gọi lên Host",
    ...outgoingCommands.map(
      (c) =>
        `- \`${c.method}\` (${c.isHostAction ? "Host Action" : "Core SDK"}): \`${c.sdkCallSummary}\``,
    ),
  ];

  if (parityAlerts.length > 0) {
    lines.push("", "## 4. Lưu ý lệch iOS ↔ Android cần xử lý phía Mini App");
    for (const a of parityAlerts) {
      lines.push(`- **${a.title}:** ${a.recommendationForMiniApp}`);
    }
  }

  lines.push(
    "",
    "## 5. manifest.json permissions",
    "```json",
    manifestPermissionsJson,
    "```",
  );

  return lines.join("\n") + "\n";
}

export interface LiveSourceContextSnippet {
  platform: Platform;
  ref: string;
  excerpt?: string;
  gitDiff?: string;
}

/**
 * Tạo AI Port Prompt chuyên dụng để đồng bộ logic/UI giữa iOS (Swift) và Android (Kotlin),
 * hỗ trợ nhúng kèm code hoặc git diff thực tế từ repo local.
 */
export function buildParityPortPrompt(
  item: ParityItem,
  dataset: MergedFlowDataset,
  options: {
    direction: "ios_to_android" | "android_to_ios" | "sync_both";
    settings?: DevWorkspaceSettings;
    liveSources?: LiveSourceContextSnippet[];
  },
): string {
  const { direction, settings, liveSources = [] } = options;
  const node = findNodeById(dataset, item.nodeId);
  const iosRefs = collectPlatformCodeRefs(node, "ios");
  const androidRefs = collectPlatformCodeRefs(node, "android");
  const branchName =
    settings?.branchOverride?.trim() || dataset.app.techBranch || "Nam-dev";

  const heading =
    direction === "ios_to_android"
      ? `[PORT iOS → Android] ${item.code} · ${item.nodeLabel}`
      : direction === "android_to_ios"
        ? `[PORT Android → iOS] ${item.code} · ${item.nodeLabel}`
        : `[SYNC iOS ↔ Android] ${item.code} · ${item.nodeLabel}`;

  const mission =
    direction === "ios_to_android"
      ? "Hãy lấy hành vi hiện tại của **iOS (Swift)** làm chuẩn và port/đồng bộ sang **Android (Kotlin/Java)** trong `VBot-Android`."
      : direction === "android_to_ios"
        ? "Hãy lấy hành vi hiện tại của **Android (Kotlin/Java)** làm chuẩn và port/đồng bộ sang **iOS (Swift)** trong `VBot-iOS`."
        : "Hãy đối chiếu cả 2 nền tảng **iOS (Swift)** và **Android (Kotlin/Java)** để đưa ra bản vá đồng bộ cả 2 bên theo hợp đồng chung.";

  const iosApis = collectPlatformList(
    node?.techDetail?.apisOrEvents,
    node?.techDetail?.byPlatform?.ios?.apisOrEvents,
  );
  const androidApis = collectPlatformList(
    node?.techDetail?.apisOrEvents,
    node?.techDetail?.byPlatform?.android?.apisOrEvents,
  );
  const edgeCases = node ? collectNodeEdgeCases(node) : [];

  const lines: string[] = [
    `# ${heading}`,
    "",
    mission,
    "",
    "## 1. Ngữ cảnh chênh lệch & Quyết định kỹ thuật",
    `- **Mã Parity:** \`${item.code}\` · **Node ID:** \`${item.nodeId}\``,
    `- **Đường dẫn luồng:** ${item.breadcrumb.join(" › ")}`,
    `- **Nhánh đối soát:** \`${branchName}\``,
    `- **Phân loại:** ${PARITY_VERDICT_LABELS[item.assessment.verdict]} · ${PARITY_NEEDS_FIX_LABELS[item.assessment.needsFix]} · fixTarget: ${PARITY_FIX_TARGET_LABELS[item.assessment.fixTarget]}`,
    `- **Giải thích:** ${item.assessment.explanation}`,
    `- **Khuyến nghị:** ${item.assessment.recommendation}`,
    ...(item.platformDiffNote
      ? [`- **Diff Note:** ${item.platformDiffNote}`]
      : []),
    "",
    "## 2. So sánh xử lý hiện tại",
    `- **iOS (Swift):** ${item.iosSummary || node?.techDetail?.byPlatform?.ios?.summary || "Chưa ghi chú"}`,
    `- **Android (Kotlin):** ${item.androidSummary || node?.techDetail?.byPlatform?.android?.summary || "Chưa ghi chú"}`,
  ];

  if (iosApis.length > 0 || androidApis.length > 0) {
    lines.push("", "## 3. API / Event / Socket");
    if (iosApis.length > 0) {
      lines.push(`- **iOS:** ${iosApis.map((a) => `\`${a}\``).join(", ")}`);
    }
    if (androidApis.length > 0) {
      lines.push(
        `- **Android:** ${androidApis.map((a) => `\`${a}\``).join(", ")}`,
      );
    }
  }

  lines.push("", "## 4. File mã nguồn liên quan");
  lines.push("### VBot-iOS");
  if (iosRefs.length > 0) {
    lines.push(
      ...iosRefs.map((ref) => formatPlatformCodeRefLine(ref, "ios", settings)),
    );
  } else {
    lines.push("- (Chưa gắn codeRefs iOS)");
  }
  lines.push("", "### VBot-Android");
  if (androidRefs.length > 0) {
    lines.push(
      ...androidRefs.map((ref) =>
        formatPlatformCodeRefLine(ref, "android", settings),
      ),
    );
  } else {
    lines.push("- (Chưa gắn codeRefs Android)");
  }

  if (edgeCases.length > 0) {
    lines.push("", "## 5. Edge Cases bắt buộc giữ nguyên khi Port");
    lines.push(...edgeCases.map((e) => `- ${e}`));
  }

  if (liveSources.length > 0) {
    lines.push("", "## 6. Trích đoạn Source / Git Diff thực tế từ local");
    for (const src of liveSources) {
      lines.push(
        "",
        `### [${src.platform.toUpperCase()}] \`${src.ref}\``,
      );
      if (src.gitDiff?.trim()) {
        lines.push("```diff", src.gitDiff.trim(), "```");
      }
      if (src.excerpt?.trim()) {
        const lang = src.platform === "ios" ? "swift" : "kotlin";
        lines.push(`\`\`\`${lang}`, src.excerpt.trim(), "```");
      }
    }
  }

  lines.push(
    "",
    "## Yêu cầu đầu ra",
    "1. Đối chiếu logic thực tế trong các file ở mục 4 (và diff ở mục 6 nếu có).",
    "2. Chỉ ra chính xác điểm lệch dòng/hàm và áp dụng bản vá cho bên mục tiêu.",
    "3. Giữ nguyên edge cases, error codes và tương thích ngược với Mini App Bridge.",
  );

  return lines.join("\n") + "\n";
}

/**
 * Đóng gói nhiều node (đang ghim hoặc đang chạm trong git status) thành 1 AI Prompt duy nhất.
 */
export function buildMultiNodeAiContextPrompt(
  nodes: FlowNodeData[],
  dataset: MergedFlowDataset,
  options: {
    title?: string;
    platformMode: PlatformViewMode;
    settings?: DevWorkspaceSettings;
    personalNotesByNodeId?: Record<string, string>;
    changedFiles?: string[];
  },
): string {
  const uniqueNodes: FlowNodeData[] = [];
  const seenIds = new Set<string>();
  for (const n of nodes) {
    if (!seenIds.has(n.id)) {
      seenIds.add(n.id);
      uniqueNodes.push(n);
    }
  }

  const branchName =
    options.settings?.branchOverride?.trim() ||
    dataset.app.techBranch ||
    "Nam-dev";
  const allCodeRefs = new Set<string>();
  const allApis = new Set<string>();
  const allEdgeCases = new Set<string>();

  for (const node of uniqueNodes) {
    for (const r of collectNodeCodeRefs(node)) allCodeRefs.add(r);
    for (const a of collectNodeApis(node)) allApis.add(a);
    for (const e of collectNodeEdgeCases(node)) allEdgeCases.add(e);
  }

  const lines: string[] = [
    `# ${options.title?.trim() || `Ngữ cảnh Multi-Node VBot (${uniqueNodes.length} node)`}`,
    "",
    `- **Nhánh đối soát:** \`${branchName}\` · **Platform đang xem:** \`${options.platformMode}\``,
    `- **Tổng số node đóng gói:** ${uniqueNodes.length}`,
  ];

  if (options.changedFiles && options.changedFiles.length > 0) {
    lines.push(
      "",
      `## File đang thay đổi trên Git local (${options.changedFiles.length})`,
      ...options.changedFiles.slice(0, 40).map((f) => `- \`${f}\``),
    );
  }

  lines.push("", "## Danh sách Node & Yêu cầu kỹ thuật");
  for (const node of uniqueNodes) {
    const label = getNodeDisplayLabel(node, "tech");
    const note = options.personalNotesByNodeId?.[node.id]?.trim();
    lines.push(
      "",
      `### ${label} (\`${node.id}\` · \`${node.kind}\`)`,
      `- **Tổng quan:** ${node.summary.overview}`,
      ...(node.summary.tech ? [`- **Kỹ thuật:** ${node.summary.tech}`] : []),
      ...(node.techDetail?.platformDiffNote
        ? [`- **Chênh lệch iOS/Android:** ${node.techDetail.platformDiffNote}`]
        : []),
      ...(node.techDetail?.parityAssessment
        ? [
            `- **Parity (${node.techDetail.parityAssessment.code ?? node.techDetail.parityAssessment.verdict}):** ${node.techDetail.parityAssessment.recommendation}`,
          ]
        : []),
      ...(note ? [`- **Ghi chú Dev cá nhân:** ${note}`] : []),
    );
  }

  if (allCodeRefs.size > 0) {
    lines.push("", "## Tổng hợp File mã nguồn cần đọc (`codeRefs`)");
    lines.push(
      ...[...allCodeRefs].map((ref) => formatCodeRefLine(ref, options.settings)),
    );
  }

  if (allApis.size > 0) {
    lines.push("", "## Tổng hợp APIs / WebSocket / Sự kiện");
    lines.push(...[...allApis].map((a) => `- \`${a}\``));
  }

  if (allEdgeCases.size > 0) {
    lines.push("", "## Tổng hợp Edge Cases cần bảo toàn");
    lines.push(...[...allEdgeCases].map((e) => `- ${e}`));
  }

  return lines.join("\n") + "\n";
}
