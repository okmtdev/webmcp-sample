'use client';

import { useState } from 'react';
import { DEFAULT_PERIOD, PERIODS, STATUS_LABELS } from '@/lib/domain/masters';
import { computeTotals } from '@/lib/domain/rules';
import { runMonthEndClose } from '@/lib/domain/store';
import type { CloseResult } from '@/lib/domain/store';
import { useAppState } from '@/lib/hooks';
import Modal from '../Modal';

export default function CloseView() {
  const state = useAppState();
  const [period, setPeriod] = useState<string>(DEFAULT_PERIOD);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<CloseResult | null>(null);

  const targets = state.requests.filter((r) => r.period === period);
  const closable = targets.filter((r) => r.status === 'approved');

  return (
    <div className="stack">
      <div className="bevel-out">
        <div className="titlebar">
          <span>月次締処理（EXP090）</span>
          <span className="badge">要注意処理</span>
        </div>
        <div style={{ padding: 6 }} className="stack">
          <div className="errorbox">
            <b className="blink">【警告】</b> 月次締処理は取り消せません。締め対象となるのは
            <b>最終承認が完了している申請のみ</b>です。1 件でも承認が滞っていると、その申請は翌月に繰り越されます。
          </div>

          <div className="row-flex">
            <label>会計期間:</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button className="btn primary" disabled={targets.length === 0} onClick={() => setConfirm(true)}>
              締め処理を実行
            </button>
          </div>

          <table className="grid">
            <thead>
              <tr>
                <th>申請ID</th>
                <th>件名</th>
                <th>状態</th>
                <th>合計(円)</th>
                <th>締め対象</th>
              </tr>
            </thead>
            <tbody>
              {targets.length === 0 && (
                <tr>
                  <td colSpan={5} className="note">
                    {period} の申請はありません。
                  </td>
                </tr>
              )}
              {targets.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.title}</td>
                  <td>{STATUS_LABELS[r.status]}</td>
                  <td className="num">{computeTotals(r.lines).amountJpy.toLocaleString('ja-JP')}</td>
                  <td>
                    {r.status === 'approved' ? (
                      <span className="badge-ok">対象</span>
                    ) : r.status === 'closed' ? (
                      <span className="badge-warn">締済</span>
                    ) : (
                      <span className="badge-err">対象外</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="note">
            締め対象 {closable.length} 件 / {period} の全 {targets.length} 件
          </div>
        </div>
      </div>

      {result && (
        <div className="bevel-out">
          <div className="titlebar">
            <span>締め処理結果（{result.period}）</span>
          </div>
          <div style={{ padding: 6 }} className="stack">
            <div className="okbox">{result.message}</div>
            <table className="grid">
              <tbody>
                <tr>
                  <th style={{ width: 150 }}>締めた申請</th>
                  <td className="mono">{result.closedIds.join(', ') || '(なし)'}</td>
                </tr>
                <tr>
                  <th>合計金額</th>
                  <td className="num">{result.totalJpy.toLocaleString('ja-JP')} 円</td>
                </tr>
                <tr>
                  <th>内消費税</th>
                  <td className="num">{result.totalTax.toLocaleString('ja-JP')} 円</td>
                </tr>
              </tbody>
            </table>

            {result.byDept.length > 0 && (
              <div>
                <b>部門別集計</b>
                <table className="grid" style={{ marginTop: 2 }}>
                  <thead>
                    <tr>
                      <th>部門コード</th>
                      <th>件数</th>
                      <th>金額(円)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.byDept.map((d) => (
                      <tr key={d.dept}>
                        <td className="mono">{d.dept}</td>
                        <td className="num">{d.count}</td>
                        <td className="num">{d.amountJpy.toLocaleString('ja-JP')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.byMajor.length > 0 && (
              <div>
                <b>費目大分類別集計</b>
                <table className="grid" style={{ marginTop: 2 }}>
                  <thead>
                    <tr>
                      <th>大分類</th>
                      <th>行数</th>
                      <th>金額(円)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.byMajor.map((m) => (
                      <tr key={m.major}>
                        <td className="mono">{m.major}</td>
                        <td className="num">{m.count}</td>
                        <td className="num">{m.amountJpy.toLocaleString('ja-JP')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.skipped.length > 0 && (
              <div className="errorbox">
                <b>締められなかった申請</b>
                <ul style={{ margin: '3px 0 0 18px', padding: 0 }}>
                  {result.skipped.map((s) => (
                    <li key={s.id}>
                      {s.id}（{STATUS_LABELS[s.status]}）: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {confirm && (
        <Modal
          title="月次締処理の実行確認"
          onCancel={() => setConfirm(false)}
          onOk={() => {
            setResult(runMonthEndClose(period));
            setConfirm(false);
          }}
          okLabel="実行する"
        >
          <b className="blink">【最終確認】</b> {period} の月次締処理を実行します。
          <br />
          締め対象 <b>{closable.length}</b> 件。取り消しはできません。
        </Modal>
      )}
    </div>
  );
}
