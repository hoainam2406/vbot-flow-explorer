// src/env.d.ts
/// <reference types="vite/client" />

declare const __ENABLE_TECH_MODE__: boolean;
declare const __BUILD_TARGET__: 'public' | 'internal';

declare module 'virtual:flow-dataset' {
  import type { MergedFlowDataset } from './data/schema';
  const dataset: MergedFlowDataset;
  export default dataset;
}
