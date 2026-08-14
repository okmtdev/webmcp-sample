'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getServerState, getState, hydrateFromStorage, subscribe } from './store';
import type { AppState } from './store';

/** ストアを購読する。サーバ描画時は初期スナップショットを返すのでハイドレーション不一致が起きない。 */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/** マウント後に localStorage から復元する。アプリのルートで一度だけ呼ぶ。 */
export function useHydration(): void {
  useEffect(() => {
    hydrateFromStorage();
  }, []);
}
