// src/core/mermaidExport.ts
import {
  getEdgeDisplayLabel,
  getNodeDisplayLabel,
  type ViewMode,
  type VisibleFlowResult,
} from './graphEngine';
import type { ScenarioTimelineModel } from './scenarioFlowEngine';
import type { ScenarioSequenceModel } from './scenarioSequenceBuilder';
import type { NodeKind } from '../data/schema';

const ALLOW_TECH_RUNTIME =
  typeof __ENABLE_TECH_MODE__ === 'boolean' ? __ENABLE_TECH_MODE__ : true;

const RESERVED_MERMAID_IDS = new Set([
  'end',
  'subgraph',
  'classdef',
  'class',
  'style',
  'linkstyle',
  'click',
  'direction',
]);

export function sanitizeMermaidId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_]/g, '_');
  if (!cleaned) return 'n_node';
  if (/^[0-9]/.test(cleaned) || RESERVED_MERMAID_IDS.has(cleaned.toLowerCase())) {
    return `n_${cleaned}`;
  }
  return cleaned;
}

export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\|/g, '/')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatNodeShape(id: string, label: string, kind: NodeKind): string {
  const safe = escapeMermaidLabel(label);
  switch (kind) {
    case 'module':
    case 'miniapp':
      return `${id}[["${safe}"]]`;
    case 'decision':
      return `${id}{"${safe}"}`;
    case 'external':
      return `${id}(["${safe}"])`;
    case 'action':
    case 'process':
    case 'error':
      return `${id}["${safe}"]`;
  }
}

export interface FlowMermaidOptions {
  direction: 'LR' | 'TB';
  mode: ViewMode;
  activeEdgeIds?: Set<string>;
}

export function exportFlowToMermaid(
  flow: VisibleFlowResult,
  options: FlowMermaidOptions,
): string {
  const effectiveMode: ViewMode = ALLOW_TECH_RUNTIME ? options.mode : 'overview';
  const dir = options.direction === 'TB' ? 'TB' : 'LR';
  const lines: string[] = [`flowchart ${dir}`];

  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();
  const getSafeId = (rawId: string): string => {
    const existing = idMap.get(rawId);
    if (existing) return existing;
    let candidate = sanitizeMermaidId(rawId);
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${sanitizeMermaidId(rawId)}_${suffix++}`;
    }
    usedIds.add(candidate);
    idMap.set(rawId, candidate);
    return candidate;
  };

  for (const node of flow.nodes) {
    const safeId = getSafeId(node.id);
    const label = getNodeDisplayLabel(node, effectiveMode);
    lines.push(`  ${formatNodeShape(safeId, label, node.kind)}:::kind_${node.kind}`);
  }

  for (const edge of flow.edges) {
    const src = idMap.get(edge.source);
    const tgt = idMap.get(edge.target);
    if (!src || !tgt) continue;
    const rawLabel = getEdgeDisplayLabel(edge, effectiveMode);
    const arrow = options.activeEdgeIds?.has(edge.id) ? '==>' : '-->';
    if (rawLabel) {
      lines.push(`  ${src} ${arrow}|"${escapeMermaidLabel(rawLabel)}"| ${tgt}`);
    } else {
      lines.push(`  ${src} ${arrow} ${tgt}`);
    }
  }

  lines.push(
    '  classDef kind_module fill:#eef2ff,stroke:#6366f1,color:#1e1b4b',
    '  classDef kind_miniapp fill:#ecfeff,stroke:#06b6d4,color:#164e63',
    '  classDef kind_action fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a',
    '  classDef kind_process fill:#f5f3ff,stroke:#8b5cf6,color:#4c1d95',
    '  classDef kind_decision fill:#fffbeb,stroke:#f59e0b,color:#78350f',
    '  classDef kind_external fill:#ecfdf5,stroke:#10b981,color:#064e3b',
    '  classDef kind_error fill:#fff1f2,stroke:#f43f5e,color:#881337',
  );

  return lines.join('\n') + '\n';
}

export function exportScenarioTimelineToMermaid(
  timeline: ScenarioTimelineModel,
): string {
  const lines: string[] = [
    `%% ${escapeMermaidLabel(timeline.title)}`,
    'flowchart TD',
    '  sc_start(("Bắt đầu"))',
  ];

  const stepIds = new Map<string, string>();
  for (const step of timeline.steps) {
    const safeId = `s_${step.stepNumber}_${sanitizeMermaidId(step.node.id)}`;
    stepIds.set(step.node.id, safeId);
    const label = `${step.stepNumber}. ${step.displayLabel}`;
    lines.push(`  ${formatNodeShape(safeId, label, step.kind)}:::kind_${step.kind}`);
  }
  lines.push('  sc_end((("Kết thúc")))');

  if (timeline.steps.length > 0) {
    const firstId = stepIds.get(timeline.steps[0].node.id)!;
    lines.push(`  sc_start --> ${firstId}`);
    for (let i = 0; i < timeline.steps.length - 1; i += 1) {
      const cur = timeline.steps[i];
      const next = timeline.steps[i + 1];
      const curId = stepIds.get(cur.node.id)!;
      const nextId = stepIds.get(next.node.id)!;
      if (cur.outgoingEdgeLabel) {
        lines.push(`  ${curId} -->|"${escapeMermaidLabel(cur.outgoingEdgeLabel)}"| ${nextId}`);
      } else {
        lines.push(`  ${curId} --> ${nextId}`);
      }
    }
    const lastId = stepIds.get(timeline.steps[timeline.steps.length - 1].node.id)!;
    lines.push(`  ${lastId} --> sc_end`);
  } else {
    lines.push('  sc_start --> sc_end');
  }

  for (const step of timeline.steps) {
    const curId = stepIds.get(step.node.id)!;
    for (const alt of step.alternativeBranches) {
      const existingTarget = stepIds.get(alt.targetNodeId);
      const targetId =
        existingTarget ?? `alt_${sanitizeMermaidId(alt.targetNodeId)}`;
      if (!existingTarget) {
        lines.push(
          `  ${formatNodeShape(targetId, alt.targetLabel, alt.targetKind)}:::kind_${alt.targetKind}`,
        );
      }
      if (alt.guardLabel) {
        lines.push(`  ${curId} -.->|"${escapeMermaidLabel(alt.guardLabel)}"| ${targetId}`);
      } else {
        lines.push(`  ${curId} -.-> ${targetId}`);
      }
    }
  }

  lines.push(
    '  classDef kind_module fill:#eef2ff,stroke:#6366f1,color:#1e1b4b',
    '  classDef kind_miniapp fill:#ecfeff,stroke:#06b6d4,color:#164e63',
    '  classDef kind_action fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a',
    '  classDef kind_process fill:#f5f3ff,stroke:#8b5cf6,color:#4c1d95',
    '  classDef kind_decision fill:#fffbeb,stroke:#f59e0b,color:#78350f',
    '  classDef kind_external fill:#ecfdf5,stroke:#10b981,color:#064e3b',
    '  classDef kind_error fill:#fff1f2,stroke:#f43f5e,color:#881337',
  );

  return lines.join('\n') + '\n';
}

export function exportScenarioSequenceToMermaid(
  model: ScenarioSequenceModel,
): string {
  const cleanSeqText = (val: string) =>
    val.replace(/\r?\n+/g, ' ').replace(/[:;]/g, ' ').replace(/\s{2,}/g, ' ').trim();

  const lines: string[] = [
    `%% ${escapeMermaidLabel(model.title)} (${model.platformMode})`,
    'sequenceDiagram',
  ];

  for (const actor of model.actors) {
    lines.push(`  participant ${actor.id} as ${cleanSeqText(actor.label)}`);
  }

  for (const msg of model.messages) {
    const arrow = msg.dashed ? '-->>' : '->>';
    const caption = msg.subtitle
      ? `${msg.stepNumber}. ${cleanSeqText(msg.title)} — ${cleanSeqText(msg.subtitle)}`
      : `${msg.stepNumber}. ${cleanSeqText(msg.title)}`;
    lines.push(`  ${msg.from}${arrow}${msg.to}: ${caption}`);
    if (msg.parityNote) {
      const noteText = cleanSeqText(msg.parityNote);
      if (msg.isSelfCall || msg.from === msg.to) {
        lines.push(`  Note right of ${msg.to}: Parity - ${noteText}`);
      } else {
        lines.push(`  Note over ${msg.from},${msg.to}: Parity - ${noteText}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}
