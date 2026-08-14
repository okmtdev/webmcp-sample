'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SYSTEM_TODAY, describeDeptPath, findEmployee } from '@/lib/keihi/masters';
import { computeTotals } from '@/lib/keihi/rules';
import { nextApprover, updateUi } from '@/lib/keihi/store';
import type { ViewName } from '@/lib/keihi/store';
import { useAppState, useHydration } from '@/lib/keihi/hooks';
import { ALL_TOOLS } from '@/lib/keihi/tools';
import { useWebMCPRegistration } from '@/lib/webmcp/useWebMCP';
import AgentConsole from './AgentConsole';
import Modal from './Modal';
import ApprovalView from './views/ApprovalView';
import CloseView from './views/CloseView';
import Dashboard from './views/Dashboard';
import EntryWizard from './views/EntryWizard';
import ManualView from './views/ManualView';
import RequestList from './views/RequestList';

type Outer = 'A' | 'B' | 'C';
type Inner = 'a1' | 'a2' | 'a3';

const OUTER_LABELS: Record<Outer, string> = {
  A: '［1］業務処理',
  B: '［2］照会',
  C: '［3］管理',
};

const INNER_LABELS: Record<Outer, Record<Inner, string>> = {
  A: { a1: '1-1 経費申請起票', a2: '1-2 承認処理', a3: '1-3 月次締' },
  B: { a1: '2-1 申請一覧照会', a2: '2-2 状況ダッシュボード', a3: '2-3 規程・マスタ照会' },
  C: { a1: '3-1 コード表保守', a2: '3-2 外部連携設定', a3: '3-3 システム情報' },
};

const TAB_TO_VIEW: Record<Outer, Record<Inner, ViewName>> = {
  A: { a1: 'entry', a2: 'approval', a3: 'close' },
  B: { a1: 'list', a2: 'dashboard', a3: 'manual' },
  C: { a1: 'manual', a2: 'dashboard', a3: 'dashboard' },
};

const VIEW_TO_TAB: Record<ViewName, { outer: Outer; inner: Inner }> = {
  entry: { outer: 'A', inner: 'a1' },
  approval: { outer: 'A', inner: 'a2' },
  close: { outer: 'A', inner: 'a3' },
  list: { outer: 'B', inner: 'a1' },
  dashboard: { outer: 'B', inner: 'a2' },
  manual: { outer: 'B', inner: 'a3' },
};

const TREE: Array<{ label: string; view: ViewName; depth: number }> = [
  { label: '├ 経費精算', view: 'dashboard', depth: 0 },
  { label: '│ ├ 起票（EXP010）', view: 'entry', depth: 1 },
  { label: '│ ├ 一覧（EXP020）', view: 'list', depth: 1 },
  { label: '│ ├ 承認（EXP030）', view: 'approval', depth: 1 },
  { label: '│ └ 月次締（EXP090）', view: 'close', depth: 1 },
  { label: '├ 規程・マスタ', view: 'manual', depth: 0 },
  { label: '└ ダッシュボード', view: 'dashboard', depth: 0 },
];

export default function App() {
  useHydration();
  const state = useAppState();
  const webmcp = useWebMCPRegistration(ALL_TOOLS);
  const [helpOpen, setHelpOpen] = useState(false);

  const view = state.ui.view;
  const tab = VIEW_TO_TAB[view];

  const stats = useMemo(() => {
    const pending = state.requests.filter((r) =>
      ['submitted', 'approved_1', 'approved_2'].includes(r.status),
    ).length;
    const drafts = state.requests.filter((r) => r.status === 'draft').length;
    const myTurn = state.requests.filter((r) => nextApprover(r) === state.ui.actorId).length;
    const total = state.requests.reduce((sum, r) => sum + computeTotals(r.lines).amountJpy, 0);
    return { pending, drafts, myTurn, total };
  }, [state.requests, state.ui.actorId]);

  const actor = findEmployee(state.ui.actorId);

  return (
    <div className="app">
      {/* ---- タイトルバー ---- */}
      <div className="bevel-out" style={{ marginBottom: 4 }}>
        <div className="titlebar">
          <span>
            スーパーややこしいシステム v.1.0.0 &nbsp;<span style={{ fontWeight: 'normal' }}>― 経費精算・稟議統合基盤 ―</span>
          </span>
          <span className="badge">
            {webmcp.backend === 'external' ? 'WebMCP: 接続可' : 'WebMCP: 内蔵'} / ツール {webmcp.toolCount}
          </span>
        </div>

        <div className="menubar">
          {['ファイル(F)', '編集(E)', '表示(V)', '処理(P)', '帳票(R)', 'ウィンドウ(W)'].map((m) => (
            <button key={m} type="button" onClick={() => setHelpOpen(true)}>
              {m}
            </button>
          ))}
          <button type="button" onClick={() => setHelpOpen(true)}>
            ヘルプ(H)
          </button>
          <span style={{ flex: 1 }} />
          <span className="note" style={{ padding: '2px 6px' }}>
            接続先: <b className="mono">LOCALSTORAGE/PROD1</b> ／ 端末: <b className="mono">WS-0413</b>
          </span>
          <Link href="/" className="note" style={{ padding: '2px 6px', color: 'var(--link)' }}>
            ◀ WebMCP サンプル SaaS へ
          </Link>
        </div>

        <div className="ticker" aria-hidden="true">
          <span>
            【重要】8月度の経費精算は 8/25 17:00 締切です ★ 付表Bの様式が v3.2 に変わりました（旧様式は受理されません） ★
            費目コード表 別表2 の改定に伴い SUP-PC-ACC の上限が 9,999 円に変更されています ★ 承認ルートは必ず別表3
            を参照して手入力してください ★ 為替レートは会計期間ごとに異なります ★ 課コードは連番ではありません ★
          </span>
        </div>
      </div>

      {/* ---- 上段タブ ---- */}
      <div className="tabs">
        {(Object.keys(OUTER_LABELS) as Outer[]).map((o) => (
          <button
            key={o}
            type="button"
            data-active={tab.outer === o}
            onClick={() => updateUi({ view: TAB_TO_VIEW[o].a1 })}
          >
            {OUTER_LABELS[o]}
          </button>
        ))}
      </div>

      {/* ---- 下段タブ ---- */}
      <div className="panel" style={{ paddingBottom: 2 }}>
        <div className="tabs inner">
          {(['a1', 'a2', 'a3'] as Inner[]).map((i) => (
            <button
              key={i}
              type="button"
              data-active={tab.inner === i}
              onClick={() => updateUi({ view: TAB_TO_VIEW[tab.outer][i] })}
            >
              {INNER_LABELS[tab.outer][i]}
            </button>
          ))}
        </div>

        <div className="panel" style={{ marginTop: 2 }}>
          <div className="layout">
            {/* ---- 左: ツリー ---- */}
            <div className="stack">
              <div className="bevel-out" style={{ padding: 3 }}>
                <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 2 }}>メニューツリー</div>
                <div className="tree">
                  <div style={{ marginBottom: 2 }}>■ EXPENSE-SYS</div>
                  {TREE.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      data-active={view === t.view}
                      onClick={() => updateUi({ view: t.view })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bevel-out" style={{ padding: 3 }}>
                <div style={{ fontWeight: 'bold', fontSize: 11 }}>操作者切替</div>
                <div className="note">承認画面はここで選んだ人として操作します。</div>
                <select
                  value={state.ui.actorId}
                  onChange={(e) => updateUi({ actorId: e.target.value })}
                  style={{ width: '100%', marginTop: 2 }}
                >
                  {['E1001', 'E1002', 'E1003', 'E1004', 'E1005', 'E1006', 'E1007', 'E2001', 'E2002', 'E2003', 'E2004', 'E3001', 'E3002'].map(
                    (id) => {
                      const e = findEmployee(id);
                      return (
                        <option key={id} value={id}>
                          {id} {e?.name}
                        </option>
                      );
                    },
                  )}
                </select>
                {actor && (
                  <div className="note" style={{ marginTop: 2 }}>
                    {describeDeptPath(actor.divisionCode, actor.deptCode, actor.sectionCode)}
                  </div>
                )}
              </div>

              <div className="warnbox">
                ※ 本システムは業務時間内のみ利用可
                <br />※ 二重起票は監査指摘の対象です
                <br />※ 不明点は情報システム部（内線 4413）
              </div>
            </div>

            {/* ---- 中央: 業務画面 ---- */}
            <div style={{ minWidth: 0 }}>
              {view === 'dashboard' && <Dashboard />}
              {view === 'entry' && <EntryWizard />}
              {view === 'list' && <RequestList />}
              {view === 'approval' && <ApprovalView />}
              {view === 'close' && <CloseView />}
              {view === 'manual' && <ManualView />}
            </div>

            {/* ---- 右: WebMCP パネル ---- */}
            <div className="stack">
              <AgentConsole status={webmcp} />
            </div>
          </div>
        </div>
      </div>

      {/* ---- ステータスバー ---- */}
      <div className="statusbar">
        <div className="cell">
          ログイン: <b className="mono">{state.ui.actorId}</b> {actor?.name}
        </div>
        <div className="cell">
          システム基準日: <b className="mono">{SYSTEM_TODAY}</b>
        </div>
        <div className="cell">申請 {state.requests.length} 件</div>
        <div className="cell">起票中 {stats.drafts}</div>
        <div className="cell">承認待ち {stats.pending}</div>
        <div className="cell">
          自分の承認待ち <b className={stats.myTurn > 0 ? 'blink' : undefined}>{stats.myTurn}</b>
        </div>
        <div className="cell">累計 {stats.total.toLocaleString('ja-JP')} 円</div>
        <div className="cell">
          WebMCP: <b>{webmcp.backend === 'external' ? '接続可' : webmcp.backend === 'builtin' ? '内蔵のみ' : '不可'}</b>
        </div>
      </div>

      {helpOpen && (
        <Modal title="ヘルプ" onCancel={() => setHelpOpen(false)} onOk={() => setHelpOpen(false)} hideCancel>
          <p style={{ marginTop: 0 }}>
            <b>スーパーややこしいシステム v.1.0.0</b>
          </p>
          <p className="note">
            このメニューは 2003 年のリニューアル時に無効化されました。操作は左のメニューツリーまたはタブから行ってください。
          </p>
          <hr className="sep" />
          <p className="note" style={{ marginBottom: 0 }}>
            このアプリは WebMCP のデモです。右側のパネルから、ページが AI エージェントに公開しているツールを確認できます。
            画面で 7 ステップかかる作業が、ツール 1 回の呼び出しで終わることを確かめてください。
          </p>
        </Modal>
      )}
    </div>
  );
}
