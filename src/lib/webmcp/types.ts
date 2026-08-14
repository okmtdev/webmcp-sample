// WebMCP（W3C Web Model Context API）の最小型定義。
//
// 仕様の現状（2026-08 時点）:
//   - 正式な設置場所は document.modelContext。
//   - navigator.modelContext は後方互換の非推奨エイリアス（Chrome 150 で deprecate）。
//   - ツールの解除は AbortSignal で行う（unregisterTool() は仕様に存在しない）。
//   - provideContext() / clearContext() は 2026-03-05 にドラフトから削除された。
//
// 実装ごとの差異を吸収するため、ここでは緩めに定義して registry.ts 側で吸収する。

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  /** 構造化された結果。対応していない実装では無視される。 */
  structuredContent?: unknown;
  isError?: boolean;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolAnnotations {
  title?: string;
  /** 状態を変更しないツール。エージェントが安全に何度でも呼べる。 */
  readOnlyHint?: boolean;
  /** 破壊的な変更を伴うツール。 */
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema?: JSONSchema;
  annotations?: ToolAnnotations;
  execute: (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
}

export interface ModelContext {
  registerTool: (
    descriptor: ToolDescriptor & { signal?: AbortSignal },
    options?: { signal?: AbortSignal },
  ) => unknown;
  /** 一部の実装のみ提供。仕様上は AbortSignal が正。 */
  unregisterTool?: (name: string) => unknown;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}

export {};
