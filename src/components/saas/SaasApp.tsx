'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PLAN } from '@/lib/saas/masters';
import { isCompliant } from '@/lib/saas/rules';
import { seatUsage, updateUi } from '@/lib/saas/store';
import type { ViewName } from '@/lib/saas/store';
import { useAppState, useHydration } from '@/lib/saas/hooks';
import { MIITEL_TOOLS } from '@/lib/saas/tools';
import { useWebMCPRegistration } from '@/lib/webmcp/useWebMCP';
import AuditView from './AuditView';
import McpPanel from './McpPanel';
import McpView from './McpView';
import UserDetailView from './UserDetailView';
import UsersView from './UsersView';

const NAV: Array<{ view: ViewName; label: string }> = [
  { view: 'users', label: 'ユーザー' },
  { view: 'audit', label: '設定の点検' },
  { view: 'mcp', label: 'MiiTel MCP' },
];

export default function SaasApp() {
  useHydration();
  const state = useAppState();
  const webmcp = useWebMCPRegistration(MIITEL_TOOLS);

  const stats = useMemo(() => {
    const seats = seatUsage();
    const needsSetup = state.users.filter((u) => u.status !== 'suspended' && !isCompliant(u)).length;
    return { seats, needsSetup };
  }, [state.users]);

  const view = state.ui.view;
  const navCount = (v: ViewName): number | null => {
    if (v === 'users') return state.users.length;
    if (v === 'audit') return stats.needsSetup;
    if (v === 'mcp') return webmcp.toolCount;
    return null;
  };

  const seatPct = Math.min(100, Math.round((stats.seats.used / stats.seats.limit) * 100));

  return (
    <div className="s-root">
      <header className="s-topbar">
        <div className="s-logo">
          <span className="s-logo-mark" aria-hidden="true" />
          WebMCP サンプル SaaS
        </div>
        <span className="s-badge info">{PLAN.name} プラン</span>
        <span className="s-muted">管理コンソール</span>

        <span className="s-spacer" />

        <span className={webmcp.backend === 'external' ? 's-badge ok' : 's-badge warn'}>
          {webmcp.backend === 'external' ? 'MiiTel MCP 接続可' : 'MiiTel MCP 内蔵のみ'} / ツール {webmcp.toolCount}
        </span>
        <Link className="s-link" href="/keihi/" style={{ fontSize: 13 }}>
          別デモ: スーパーややこしいシステム →
        </Link>
      </header>

      <div className="s-layout">
        {/* ---- 左: ナビ ---- */}
        <aside className="s-stack">
          <nav className="s-nav" aria-label="メインナビゲーション">
            {NAV.map((n) => {
              const count = navCount(n.view);
              return (
                <button
                  key={n.view}
                  type="button"
                  className="s-navitem"
                  data-active={view === n.view || (n.view === 'users' && view === 'user')}
                  onClick={() => updateUi({ view: n.view, selectedUserId: null })}
                >
                  <span>{n.label}</span>
                  {count !== null && <span className="s-navcount">{count}</span>}
                </button>
              );
            })}
          </nav>

          <div className="s-card">
            <div className="s-card-body tight s-stack">
              <div>
                <div className="s-label">ライセンス席数</div>
                <div className="s-muted s-num">
                  {stats.seats.used} / {stats.seats.limit} 席
                </div>
              </div>
              <div className="s-meter">
                <i style={{ width: `${seatPct}%` }} data-full={stats.seats.used >= stats.seats.limit} />
              </div>
              <div className="s-muted">
                管理者 {stats.seats.admins} / {stats.seats.adminLimit} 名
                <br />
                停止中のユーザーは席を消費しません。
              </div>
            </div>
          </div>

          {stats.needsSetup > 0 && (
            <div className="s-note warn">
              <b>{stats.needsSetup} 名</b>のユーザーが、所属部署の推奨設定どおりになっていません。
              <br />
              <button className="s-btn link" style={{ padding: 0, marginTop: 4 }} onClick={() => updateUi({ view: 'audit' })}>
                点検画面を開く →
              </button>
            </div>
          )}
        </aside>

        {/* ---- 中央: 業務画面 ---- */}
        <main style={{ minWidth: 0 }}>
          {view === 'users' && <UsersView />}
          {view === 'user' && <UserDetailView />}
          {view === 'audit' && <AuditView />}
          {view === 'mcp' && <McpView />}
        </main>

        {/* ---- 右: MCP パネル ---- */}
        <aside className="s-rail s-stack">
          <McpPanel status={webmcp} />
        </aside>
      </div>
    </div>
  );
}
