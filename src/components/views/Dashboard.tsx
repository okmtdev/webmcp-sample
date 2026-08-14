'use client';

import { PERIODS, STATUS_LABELS, SYSTEM_TODAY, findEmployee } from '@/lib/domain/masters';
import { computeTotals } from '@/lib/domain/rules';
import { nextApprover, updateUi } from '@/lib/domain/store';
import { useAppState } from '@/lib/hooks';

export default function Dashboard() {
  const state = useAppState();
  const byStatus = new Map<string, number>();
  for (const r of state.requests) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

  const myTurn = state.requests.filter((r) => nextApprover(r) === state.ui.actorId);
  const actor = findEmployee(state.ui.actorId);

  return (
    <div className="stack">
      <div className="bevel-out">
        <div className="titlebar">
          <span>状況ダッシュボード（EXP000）</span>
          <span className="badge">基準日 {SYSTEM_TODAY}</span>
        </div>
        <div style={{ padding: 6 }}>
          <div className="warnbox" style={{ marginBottom: 6 }}>
            <b className="blink">お知らせ</b>{' '}
            本システムは全ての入力項目に社内規程 R01〜R14 の整合チェックが掛かります。
            入力前に必ず「規程・マスタ照会」で 別表1（費目コード）・別表2（為替レート）・別表3（承認マトリクス）
            をご確認ください。チェックに 1 件でも違反があると申請できません。
          </div>

          <table className="grid" style={{ marginBottom: 6 }}>
            <thead>
              <tr>
                <th style={{ width: 220 }}>状態</th>
                <th style={{ width: 70 }}>件数</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num">{byStatus.get(key) ?? 0}</td>
                  <td className="note">{key === 'draft' ? '規程チェック未通過のものを含みます' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bevel-in" style={{ padding: 5 }}>
            <b>
              {state.ui.actorId} {actor?.name} さんの承認待ち: {myTurn.length} 件
            </b>
            {myTurn.length > 0 && (
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                {myTurn.map((r) => (
                  <li key={r.id}>
                    <button
                      className="btn small"
                      onClick={() => updateUi({ view: 'approval', activeRequestId: r.id })}
                    >
                      {r.id}
                    </button>{' '}
                    {r.title}（{computeTotals(r.lines).amountJpy.toLocaleString('ja-JP')} 円）
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="bevel-out">
        <div className="titlebar">
          <span>この画面でやると何が起きるか</span>
        </div>
        <div style={{ padding: 6 }}>
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: '46%' }}>画面から手作業でやる場合</th>
                <th>WebMCP 経由でエージェントに頼む場合</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ whiteSpace: 'normal' }}>
                  7 ステップのウィザードを最後まで進める。事業部→部→課を 3 段のドロップダウンで選び、費目を
                  大分類→中分類→小分類の 3 段で選び、為替レートを別表2 から探して手入力し、円換算額を電卓で計算して入力し、
                  消費税額を内税で逆算して入力し、承認者 3 人を別表3 と社員マスタを突き合わせて特定し、
                  合計が 5 万円を超えていたら別タブの付表Bを開いて 4 項目を埋め、確認モーダルを 3 回通す。
                  <b>明細 1 件あたりおよそ 25 回の入力操作。</b>
                </td>
                <td style={{ whiteSpace: 'normal' }}>
                  <code className="mono">create_request</code> を 1 回呼ぶ。
                  レート・円換算・税額・承認ルートは規程どおりに自動計算され、規程違反があれば
                  「どの条文の」「どこが」「どう直せば通るか」が返る。
                  <b>操作は 1 回。</b>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="note" style={{ marginTop: 4 }}>
            ※ どちらも同じ検証ロジック（src/lib/domain/rules.ts）を通ります。ツール側だけ甘くしているわけではありません。
          </div>
        </div>
      </div>

      <div className="bevel-out">
        <div className="titlebar">
          <span>会計期間別サマリ</span>
        </div>
        <div style={{ padding: 6 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>会計期間</th>
                <th>件数</th>
                <th>合計金額</th>
                <th>内消費税</th>
                <th>締め済</th>
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((p) => {
                const rows = state.requests.filter((r) => r.period === p);
                const total = rows.reduce((s, r) => s + computeTotals(r.lines).amountJpy, 0);
                const tax = rows.reduce((s, r) => s + computeTotals(r.lines).taxAmount, 0);
                const closed = rows.filter((r) => r.status === 'closed').length;
                return (
                  <tr key={p}>
                    <td>{p}</td>
                    <td className="num">{rows.length}</td>
                    <td className="num">{total.toLocaleString('ja-JP')}</td>
                    <td className="num">{tax.toLocaleString('ja-JP')}</td>
                    <td className="num">{closed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
