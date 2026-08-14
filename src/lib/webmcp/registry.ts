// ツール登録のラッパ。ルート直下の SaaS 管理画面と /keihi の経費システムで共用する。
//
// 目的:
//   1. 実装差異（signal の渡し方、解除方法）を吸収する
//   2. ページ自身が「何を登録したか」を保持し、画面内のパネルから同じ execute を呼べるようにする
//      （ブリッジ拡張機能がなくてもチュートリアルが成立する）
//   3. ツール呼び出しのログを持ち、エージェントの動きを画面に見せる

import { ensureModelContext, getBackend, getModelContext } from './polyfill';
import type { Backend } from './polyfill';
import type { ToolDescriptor, ToolResult } from './types';

// ---- 登録済みツールのミラー -------------------------------------------------

/** 未登録時に返す不変の空配列。サーバ描画時のスナップショットと同一実体にしておく。 */
export const NO_TOOLS: ToolDescriptor[] = [];

const mirror = new Map<string, ToolDescriptor>();
const mirrorListeners = new Set<() => void>();
let cachedList: ToolDescriptor[] = NO_TOOLS;

function emitMirror() {
  for (const l of mirrorListeners) l();
}

function refreshCache() {
  cachedList = mirror.size === 0 ? NO_TOOLS : [...mirror.values()];
}

export function subscribeMirror(listener: () => void): () => void {
  mirrorListeners.add(listener);
  return () => {
    mirrorListeners.delete(listener);
  };
}

export function getRegisteredTools(): ToolDescriptor[] {
  return cachedList;
}

// ---- ツール呼び出しログ -----------------------------------------------------

export interface ToolCallLogEntry {
  seq: number;
  at: string;
  tool: string;
  args: unknown;
  ok: boolean;
  summary: string;
}

export const NO_LOG: ToolCallLogEntry[] = [];

const logListeners = new Set<() => void>();
let log: ToolCallLogEntry[] = NO_LOG;
let logSeq = 1;

export function subscribeToolLog(listener: () => void): () => void {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

export function getToolLog(): ToolCallLogEntry[] {
  return log;
}

export function getServerToolLog(): ToolCallLogEntry[] {
  return NO_LOG;
}

export function clearToolLog(): void {
  log = NO_LOG;
  for (const l of logListeners) l();
}

function appendLog(entry: Omit<ToolCallLogEntry, 'seq' | 'at'>) {
  log = [{ ...entry, seq: logSeq++, at: new Date().toISOString() }, ...log].slice(0, 60);
  for (const l of logListeners) l();
}

// ---- 結果ヘルパー -----------------------------------------------------------

export function textResult(text: string, structured?: unknown): ToolResult {
  return structured === undefined
    ? { content: [{ type: 'text', text }] }
    : { content: [{ type: 'text', text }], structuredContent: structured };
}

export function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

// ---- 登録 -------------------------------------------------------------------

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

/** 画面内のパネルからツールを実行する。 */
export async function callRegisteredTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = mirror.get(name);
  if (!tool) return errorResult(`ツール ${name} は登録されていません。`);
  return await tool.execute(args);
}

// ---- 状態 -------------------------------------------------------------------

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
          'ブラウザに WebMCP 実装が見つからなかったため、ページ内蔵の最小実装を使っています。画面内のパネルからは試せますが、外部エージェントからは接続できません。拡張機能を入れるか対応ブラウザで開いてください。',
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
