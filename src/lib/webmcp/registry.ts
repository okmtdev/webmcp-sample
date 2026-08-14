// ツール登録のラッパ。
//
// 目的:
//   1. 実装差異（signal の渡し方、解除方法）を吸収する
//   2. ページ自身が「何を登録したか」を保持し、画面内のエージェントコンソールから
//      同じ execute を呼べるようにする（拡張機能がなくてもチュートリアルが成立する）

import { appendLog } from '../domain/store';
import { ensureModelContext, getBackend, getModelContext } from './polyfill';
import type { Backend } from './polyfill';
import type { ToolDescriptor, ToolResult } from './types';

/** ページが登録したツールのミラー。画面内コンソールはこちらを参照する。 */
const mirror = new Map<string, ToolDescriptor>();
const mirrorListeners = new Set<() => void>();

function emitMirror() {
  for (const l of mirrorListeners) l();
}

export function subscribeMirror(listener: () => void): () => void {
  mirrorListeners.add(listener);
  return () => mirrorListeners.delete(listener);
}

/** 未登録時に返す不変の空配列。サーバ描画時のスナップショットと同一実体にしておく。 */
export const NO_TOOLS: ToolDescriptor[] = [];

let cachedList: ToolDescriptor[] = NO_TOOLS;

export function getRegisteredTools(): ToolDescriptor[] {
  return cachedList;
}

function refreshCache() {
  cachedList = [...mirror.values()];
}

export function textResult(text: string, structured?: unknown): ToolResult {
  return structured === undefined
    ? { content: [{ type: 'text', text }] }
    : { content: [{ type: 'text', text }], structuredContent: structured };
}

export function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** ツール呼び出しをログに残しつつ実行するラッパを被せる。 */
function withLogging(tool: ToolDescriptor): ToolDescriptor {
  return {
    ...tool,
    execute: async (args) => {
      try {
        const result = await tool.execute(args ?? {});
        const first = result.content?.[0]?.text ?? '';
        appendLog({
          tool: tool.name,
          args: args ?? {},
          ok: !result.isError,
          summary: first.length > 240 ? `${first.slice(0, 240)}…` : first,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendLog({ tool: tool.name, args: args ?? {}, ok: false, summary: `例外: ${message}` });
        return errorResult(`ツール ${tool.name} の実行中にエラーが発生しました: ${message}`);
      }
    },
  };
}

/**
 * ツールを 1 本登録する。
 * signal を abort すると登録が解除される（仕様上の正しい解除方法）。
 */
export function registerTool(tool: ToolDescriptor, signal: AbortSignal): void {
  const wrapped = withLogging(tool);

  mirror.set(wrapped.name, wrapped);
  refreshCache();

  const ctx = getModelContext();
  if (ctx) {
    try {
      // signal はディスクリプタ側と options 側の両方に渡す。
      // 実装によってどちらを読むかが異なるが、余分なプロパティは無視される。
      ctx.registerTool({ ...wrapped, signal }, { signal });
    } catch (err) {
      // 実装が options 引数を受け付けない場合のフォールバック。
      try {
        ctx.registerTool({ ...wrapped, signal });
      } catch (inner) {
        console.warn('[WebMCP] ツールの登録に失敗しました:', wrapped.name, inner ?? err);
      }
    }
  }

  signal.addEventListener(
    'abort',
    () => {
      mirror.delete(wrapped.name);
      refreshCache();
      emitMirror();
      // AbortSignal を見ない実装のための保険。
      try {
        getModelContext()?.unregisterTool?.(wrapped.name);
      } catch {
        // 提供されていなければ何もしない。
      }
    },
    { once: true },
  );

  emitMirror();
}

export function registerTools(tools: ToolDescriptor[], signal: AbortSignal): void {
  for (const t of tools) registerTool(t, signal);
}

/** 画面内のエージェントコンソールからツールを実行する。 */
export async function callRegisteredTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = mirror.get(name);
  if (!tool) return errorResult(`ツール ${name} は登録されていません。`);
  return await tool.execute(args);
}

export interface WebMCPStatus {
  backend: Backend;
  label: string;
  detail: string;
  toolCount: number;
}

export function initWebMCP(): Backend {
  return ensureModelContext();
}

export function getStatus(): WebMCPStatus {
  const backend = getBackend();
  const toolCount = cachedList.length;
  switch (backend) {
    case 'external':
      return {
        backend,
        label: 'WebMCP 接続可能',
        detail:
          'document.modelContext がブラウザ側から提供されています（ネイティブ実装または WebMCP 拡張機能）。エージェントからこのページのツールを呼び出せます。',
        toolCount,
      };
    case 'builtin':
      return {
        backend,
        label: '内蔵フォールバックで動作中',
        detail:
          'ブラウザに WebMCP 実装が見つからなかったため、ページ内蔵の最小実装を使っています。画面内のエージェントコンソールからは試せますが、外部エージェントからは接続できません。拡張機能を入れるか対応ブラウザで開いてください。',
        toolCount,
      };
    default:
      return {
        backend,
        label: 'WebMCP 利用不可',
        detail: 'document.modelContext を用意できませんでした。',
        toolCount,
      };
  }
}
