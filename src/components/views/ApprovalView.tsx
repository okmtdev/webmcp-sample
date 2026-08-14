'use client';

import { useState } from 'react';
import { ROLE_LABELS, STATUS_LABELS, describeDeptPath, findEmployee } from '@/lib/domain/masters';
import { computeTotals } from '@/lib/domain/rules';
import { approveRequest, nextApprover, updateUi } from '@/lib/domain/store';
import { useAppState } from '@/lib/hooks';
import Modal from '../Modal';

export default function ApprovalView() {
  const state = useAppState();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const queue = state.requests.filter((r) => ['submitted', 'approved_1', 'approved_2'].includes(r.status));
  const selected = state.requests.find((r) => r.id === state.ui.activeRequestId) ?? queue[0];
  const actor = findEmployee(state.ui.actorId);
  const expected = selected ? nextApprover(selected) : null;
  const canAct = Boolean(selected && expected === state.ui.actorId);

  function act(decision: 'approve' | 'reject') {
    if (!selected) return;
    const result = approveRequest(selected.id, state.ui.actorId, decision, note);
    setMessage(result.message);
    setNote('');
    setPending(null);
  }

  return (
    <div className="stack">
      <div className="bevel-out">
        <div className="titlebar">
          <span>承認処理（EXP030）</span>
          <span className="badge">承認待ち {queue.length} 件</span>
        </div>
        <div style={{ padding: 6 }}>
          <div className="warnbox" style={{ marginBottom: 4 }}>
            承認は <b>承認ルート上の順番どおり</b> にしか実行できません。1次承認者が承認する前に最終承認者が押しても弾かれます。
            左サイドの「操作者切替」で承認者を切り替えてから操作してください。
          </div>

          <div className="row-flex" style={{ marginBottom: 4 }}>
            <b>操作者:</b>
            <span className="mono">{state.ui.actorId}</span>
            <span>
              {actor?.name}（{actor ? ROLE_LABELS[actor.role] : '―'} /{' '}
              {actor ? describeDeptPath(actor.divisionCode, actor.deptCode, actor.sectionCode) : '―'}）
            </span>
          </div>

          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>申請ID</th>
                  <th>件名</th>
                  <th>合計(円)</th>
                  <th>状態</th>
                  <th>1次</th>
                  <th>2次</th>
                  <th>最終</th>
                  <th>次の承認者</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 && (
                  <tr>
                    <td colSpan={8} className="note">
                      承認待ちの申請はありません。
                    </td>
                  </tr>
                )}
                {queue.map((r) => (
                  <tr
                    key={r.id}
                    data-selected={selected?.id === r.id}
                    onClick={() => updateUi({ activeRequestId: r.id })}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="mono">{r.id}</td>
                    <td>{r.title}</td>
                    <td className="num">{computeTotals(r.lines).amountJpy.toLocaleString('ja-JP')}</td>
                    <td>{STATUS_LABELS[r.status]}</td>
                    <td className="mono">{r.route.first}</td>
                    <td className="mono">{r.route.second ?? '―'}</td>
                    <td className="mono">{r.route.final}</td>
                    <td className="mono">
                      <b className={nextApprover(r) === state.ui.actorId ? 'blink' : undefined}>{nextApprover(r)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div className="bevel-out">
          <div className="titlebar">
            <span>
              {selected.id} {selected.title}
            </span>
          </div>
          <div style={{ padding: 6 }} className="stack">
            <div className={canAct ? 'okbox' : 'warnbox'}>
              {canAct
                ? `${state.ui.actorId} はこの申請の現在の承認者です。承認または差戻しができます。`
                : `この申請の現在の承認者は ${expected ?? '（なし）'} です。${state.ui.actorId} は操作できません。`}
            </div>

            <table className="grid">
              <tbody>
                <tr>
                  <th style={{ width: 130 }}>申請者</th>
                  <td>
                    {selected.applicantId} {findEmployee(selected.applicantId)?.name} ／{' '}
                    {describeDeptPath(selected.divisionCode, selected.deptCode, selected.sectionCode)}
                  </td>
                </tr>
                <tr>
                  <th>会計期間</th>
                  <td>{selected.period}</td>
                </tr>
                <tr>
                  <th>合計</th>
                  <td>
                    {computeTotals(selected.lines).amountJpy.toLocaleString('ja-JP')} 円（区分{' '}
                    {computeTotals(selected.lines).band}）
                  </td>
                </tr>
                <tr>
                  <th>付表B</th>
                  <td>
                    {selected.attachmentB
                      ? `${selected.attachmentB.reason} / ${selected.attachmentB.destination} / 同行者: ${selected.attachmentB.companions} / ${selected.attachmentB.preApprovalNo}`
                      : 'なし'}
                  </td>
                </tr>
              </tbody>
            </table>

            <div>
              <b>承認履歴</b>
              <table className="grid" style={{ marginTop: 2 }}>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>操作者</th>
                    <th>操作</th>
                    <th>コメント</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.history.map((h, i) => (
                    <tr key={i}>
                      <td className="mono">{h.at.replace('T', ' ').slice(0, 19)}</td>
                      <td className="mono">{h.actor}</td>
                      <td>{h.action}</td>
                      <td>{h.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="field-grid">
              <label>コメント</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} />
            </div>

            {message && <div className="okbox">{message}</div>}

            <div className="row-flex">
              <button className="btn primary" disabled={!canAct} onClick={() => setPending('approve')}>
                承認
              </button>
              <button className="btn" disabled={!canAct} onClick={() => setPending('reject')}>
                差戻し
              </button>
            </div>
          </div>
        </div>
      )}

      {pending && (
        <Modal
          title={pending === 'approve' ? '承認確認' : '差戻し確認'}
          onCancel={() => setPending(null)}
          onOk={() => act(pending)}
          okLabel={pending === 'approve' ? '承認する' : '差し戻す'}
        >
          申請 <b className="mono">{selected?.id}</b> を{pending === 'approve' ? '承認' : '差戻し'}します。よろしいですか？
        </Modal>
      )}
    </div>
  );
}
