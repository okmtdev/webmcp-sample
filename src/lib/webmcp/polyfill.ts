// 内蔵フォールバック実装。
//
// ブラウザがネイティブ対応しておらず、WebMCP 拡張機能も入っていない環境でも
// 「ページがツールを登録している」という状態を作れるようにするための最小実装。
// エージェントからページに接続する本番経路は、あくまでネイティブ実装か拡張機能。
//
// npm の @mcp-b/webmcp-polyfill を使う場合はこのファイルの代わりに
//   import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
//   initializeWebMCPPolyfill();
// を呼べばよい（本サンプルは依存を増やさないため自前実装にしている）。

import type { ModelContext, ToolDescriptor, ToolResult } from './types';

export type Backend = 'external' | 'builtin' | 'unavailable';

let detectedBackend: Backend = 'unavailable';

class BuiltinModelContext implements ModelContext {
  private tools = new Map<string, ToolDescriptor>();

  registerTool(descriptor: ToolDescriptor & { signal?: AbortSignal }, options?: { signal?: AbortSignal }) {
    if (!descriptor?.name) throw new TypeError('registerTool: name は必須です');
    if (typeof descriptor.execute !== 'function') {
      throw new TypeError(`registerTool(${descriptor.name}): execute は関数である必要があります`);
    }
    this.tools.set(descriptor.name, descriptor);

    const signal = options?.signal ?? descriptor.signal;
    if (signal) {
      if (signal.aborted) {
        this.tools.delete(descriptor.name);
      } else {
        signal.addEventListener('abort', () => this.tools.delete(descriptor.name), { once: true });
      }
    }
    return { name: descriptor.name, unregister: () => this.tools.delete(descriptor.name) };
  }

  unregisterTool(name: string) {
    return this.tools.delete(name);
  }

  listTools(): ToolDescriptor[] {
    return [...this.tools.values()];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`ツール ${name} は登録されていません`);
    return await tool.execute(args ?? {});
  }
}

/**
 * document.modelContext を用意する。
 * すでに存在する場合（ネイティブ実装・拡張機能）は何もしない（非破壊）。
 */
export function ensureModelContext(): Backend {
  if (typeof document === 'undefined') {
    detectedBackend = 'unavailable';
    return detectedBackend;
  }

  const existing = document.modelContext ?? navigator.modelContext;
  if (existing) {
    // ネイティブ実装または拡張機能が入っている。こちらは触らない。
    if (!document.modelContext) {
      try {
        Object.defineProperty(document, 'modelContext', {
          value: existing,
          configurable: true,
          writable: true,
        });
      } catch {
        // 定義できなくても navigator 側を使えば動く。
      }
    }
    detectedBackend = 'external';
    return detectedBackend;
  }

  const ctx = new BuiltinModelContext();
  try {
    Object.defineProperty(document, 'modelContext', { value: ctx, configurable: true, writable: true });
    Object.defineProperty(navigator, 'modelContext', { value: ctx, configurable: true, writable: true });
    detectedBackend = 'builtin';
  } catch {
    detectedBackend = 'unavailable';
  }
  return detectedBackend;
}

export function getBackend(): Backend {
  return detectedBackend;
}

export function getModelContext(): ModelContext | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.modelContext ?? navigator.modelContext;
}
