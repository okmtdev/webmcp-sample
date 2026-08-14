'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { ALL_TOOLS } from '../tools';
import { NO_TOOLS, getRegisteredTools, getStatus, initWebMCP, registerTools, subscribeMirror } from './registry';
import type { WebMCPStatus } from './registry';
import type { ToolDescriptor } from './types';

/**
 * ページのツールを WebMCP に登録する。
 * 解除は AbortSignal 経由（仕様上の正しい解除方法）。
 */
export function useWebMCPRegistration(): WebMCPStatus {
  const [status, setStatus] = useState<WebMCPStatus>({
    backend: 'unavailable',
    label: '検出中…',
    detail: 'WebMCP 実装を確認しています。',
    toolCount: 0,
  });

  useEffect(() => {
    initWebMCP();
    const controller = new AbortController();
    registerTools(ALL_TOOLS, controller.signal);
    setStatus(getStatus());
    return () => controller.abort();
  }, []);

  const tools = useRegisteredTools();
  return { ...status, toolCount: tools.length };
}

/** ページが登録済みのツール一覧（画面内コンソール用のミラー）。 */
export function useRegisteredTools(): ToolDescriptor[] {
  return useSyncExternalStore(subscribeMirror, getRegisteredTools, () => NO_TOOLS);
}
