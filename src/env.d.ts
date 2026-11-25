// src/env.d.ts
/// <reference types="vite/client" />

declare const __ENABLE_TECH_MODE__: boolean;
declare const __BUILD_TARGET__: 'public' | 'internal';

declare module 'virtual:flow-dataset' {
  import type { MergedFlowDataset } from './data/schema';
  const dataset: MergedFlowDataset;
  export default dataset;
}

declare module 'virtual:flow-branches' {
  import type { FlowBranchInfo, MergedFlowDataset } from './data/schema';
  export const defaultBranchId: string;
  export const branches: FlowBranchInfo[];
  export function loadBranchDataset(branchId: string): Promise<MergedFlowDataset>;
}
