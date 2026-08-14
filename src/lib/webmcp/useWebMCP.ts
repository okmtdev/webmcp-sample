'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  NO_LOG,
  NO_TOOLS,
  getRegisteredTools,
  getServerToolLog,
  getStatus,
  getToolLog,
  initWebMCP,
  registerTools,
  subscribeMirror,
  subscribeToolLog,
} from './registry';
import type { ToolCallLogEntry, WebMCPStatus } from './registry';
import type { ToolDescriptor } from './types';

/**
 * 渡されたツール一覧を WebMCP に登録する。
 * 解除は AbortSignal 経由（仕様上の正しい解除方法）。
 *
 * tools はモジュールスコープの定数を渡すこと（毎レンダリングで新しい配列を作らない）。
 */
export function useWebMCPRegistration(tools: ToolDescriptor[]): WebMCPStatus {
  const [status, setStatus] = useState<WebMCPStatus>({
    backend: 'unavailable',
    label: '検出中…',
    detail: 'WebMCP 実装を確認しています。',
    toolCount: 0,
  });

  useEffect(() => {
    initWebMCP();
    const controller = new AbortController();
    registerTools(tools, controller.signal);
    setStatus(getStatus());
    return () => controller.abort();
  }, [tools]);

  const registered = useRegisteredTools();
  return { ...status, toolCount: registered.length };
}

/** ページが登録済みのツール一覧（画面内パネル用のミラー）。 */
export function useRegisteredTools(): ToolDescriptor[] {
  return useSyncExternalStore(subscribeMirror, getRegisteredTools, () => NO_TOOLS);
}

/** ツール呼び出しのライブログ。新しいものが先頭。 */
export function useToolLog(): ToolCallLogEntry[] {
  return useSyncExternalStore(subscribeToolLog, getToolLog, getServerToolLog);
}

export { NO_LOG };
