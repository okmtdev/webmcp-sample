'use client';

import { useState } from 'react';
import { STATUS_LABELS, findEmployee } from '@/lib/domain/masters';
import { computeTotals, validateRequest } from '@/lib/domain/rules';
import { deleteRequest, loadDraftFromRequest, nextApprover, updateUi } from '@/lib/domain/store';
import { useAppState } from '@/lib/hooks';
import Modal from '../Modal';

const PAGE_SIZE = 3;

export default function RequestList() {
  const state = useAppState();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered =
    state.ui.listFilterStatus === 'ALL'
      ? state.requests
      : state.requests.filter((r) => r.status === state.ui.listFilterStatus);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(state.ui.listPage, pageCount);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = state.requests.find((r) => r.id === state.ui.activeRequestId);

  return (
    <div className="stack">
      <div className="bevel-out">
        <div className="titlebar">
          <span>申請一覧照会（EXP020）</span>
          <span className="badge">
            {filtered.length} 件 / {pageCount} ページ
          </span>
        </div>
        <div style={{ padding: 6 }}>
          <div className="row-flex" style={{ marginBottom: 4 }}>
            <label>状態:</label>
            <select
              value={state.ui.listFilterStatus}
              onChange={(e) => updateUi({ listFilterStatus: e.target.value, listPage: 1 })}
            >
              <option value="ALL">すべて</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <span className="note">※ 1 ページ 3 件固定です（表示件数の変更は v2.0.0 で対応予定）</span>
          </div>

          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>申請ID</th>
                  <th>件名</th>
                  <th>申請者</th>
                  <th>期間</th>
                  <th>合計(円)</th>
                  <th>区分</th>
                  <th>状態</th>
                  <th>次の承認者</th>
                  <th>規程</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="note">
                      該当する申請はありません。
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const t = computeTotals(r.lines);
                  const v = validateRequest(r);
                  const next = nextApprover(r);
                  return (
                    <tr
                      key={r.id}
                      data-selected={state.ui.activeRequestId === r.id}
                      onClick={() => updateUi({ activeRequestId: r.id })}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="mono">{r.id}</td>
                      <td>{r.title}</td>
                      <td>
                        {r.applicantId} {findEmployee(r.applicantId)?.name}
                      </td>
                      <td>{r.period}</td>
                      <td className="num">{t.amountJpy.toLocaleString('ja-JP')}</td>
                      <td>{t.band}</td>
                      <td>{STATUS_LABELS[r.status]}</td>
                      <td>{next ?? '―'}</td>
                      <td>
                        {v.length === 0 ? (
                          <span className="badge-ok">OK</span>
                        ) : (
                          <span className="badge-err">違反{v.length}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="row-flex" style={{ marginTop: 4 }}>
            <button className="btn small" disabled={page <= 1} onClick={() => updateUi({ listPage: page - 1 })}>
              ← 前
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              className="btn small"
              disabled={page >= pageCount}
              onClick={() => updateUi({ listPage: page + 1 })}
            >
              次 →
            </button>
            <span style={{ flex: 1 }} />
            <button
              className="btn small"
              disabled={!selected}
              onClick={() => selected && loadDraftFromRequest(selected.id)}
            >
              編集
            </button>
            <button
              className="btn small"
              disabled={!selected}
              onClick={() => selected && updateUi({ view: 'approval', activeRequestId: selected.id })}
            >
              承認画面へ
            </button>
            <button className="btn small" disabled={!selected} onClick={() => selected && setDeleteTarget(selected.id)}>
              削除
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="bevel-out">
          <div className="titlebar">
            <span>明細（{selected.id}）</span>
          </div>
          <div style={{ padding: 6 }}>
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>行</th>
                    <th>発生日</th>
                    <th>小分類</th>
                    <th>通貨</th>
                    <th>原貨額</th>
                    <th>レート</th>
                    <th>円換算</th>
                    <th>税区分</th>
                    <th>消費税</th>
                    <th>PJ</th>
                    <th>摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l) => (
                    <tr key={l.lineNo}>
                      <td className="num">{l.lineNo}</td>
                      <td>{l.date}</td>
                      <td className="mono">{l.minorCode}</td>
                      <td>{l.currency}</td>
                      <td className="num">{l.amountForeign.toLocaleString('ja-JP')}</td>
                      <td className="num">{l.rateUsed}</td>
                      <td className="num">{l.amountJpy.toLocaleString('ja-JP')}</td>
                      <td>{l.taxCategory}</td>
                      <td className="num">{l.taxAmount.toLocaleString('ja-JP')}</td>
                      <td className="mono">{l.projectCode}</td>
                      <td>{l.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(() => {
              const v = validateRequest(selected);
              return v.length === 0 ? (
                <div className="okbox" style={{ marginTop: 4 }}>
                  規程チェック: 違反なし
                </div>
              ) : (
                <div className="errorbox" style={{ marginTop: 4 }}>
                  <b>規程違反 {v.length} 件</b>
                  <ol style={{ margin: '3px 0 0 18px', padding: 0 }}>
                    {v.map((x, i) => (
                      <li key={i}>
                        [{x.rule}] {x.location}: {x.message}
                        <br />
                        <span className="note">→ {x.hint}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {deleteTarget && (
        <Modal
          title="削除確認"
          onCancel={() => setDeleteTarget(null)}
          onOk={() => {
            deleteRequest(deleteTarget);
            setDeleteTarget(null);
            updateUi({ activeRequestId: null });
          }}
          okLabel="削除する"
        >
          申請 <b className="mono">{deleteTarget}</b> を削除します。この操作は取り消せません。
        </Modal>
      )}
    </div>
  );
}
