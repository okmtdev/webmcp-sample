'use client';

import { useMemo, useState } from 'react';
import {
  CURRENCIES,
  DIVISIONS,
  EMPLOYEES,
  MAJOR_CATEGORIES,
  PERIODS,
  ROLE_LABELS,
  SYSTEM_TODAY,
  TAX_CATEGORY_LABELS,
  departmentsOf,
  describeDeptPath,
  findEmployee,
  findFxRate,
  findMinor,
  middlesOf,
  minorsOf,
  sectionsOf,
} from '@/lib/domain/masters';
import { bandRuleOf, computeTotals, emptyLine, validateRequest } from '@/lib/domain/rules';
import { saveDraft, submitRequest, updateDraft, updateUi } from '@/lib/domain/store';
import type { ExpenseLine, TaxCategory } from '@/lib/domain/types';
import { useAppState } from '@/lib/hooks';
import Modal from '../Modal';

const STEP_TITLES = [
  '1. 申請基本情報',
  '2. 部門コード確定',
  '3. 明細件数確定',
  '4. 明細入力',
  '5. 付表B',
  '6. 承認ルート設定',
  '7. 内容確認・保存',
];

export default function EntryWizard() {
  const state = useAppState();
  const d = state.draft;
  const step = state.ui.wizardStep;

  const [deptConfirmed, setDeptConfirmed] = useState(false);
  const [confirmStage, setConfirmStage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const totals = useMemo(() => computeTotals(d.lines), [d.lines]);
  const bandRule = bandRuleOf(totals.amountJpy);
  const applicant = findEmployee(d.applicantId);

  const violations = useMemo(
    () =>
      validateRequest({
        title: d.title,
        applicantId: d.applicantId,
        divisionCode: d.divisionCode,
        deptCode: d.deptCode,
        sectionCode: d.sectionCode,
        period: d.period,
        lines: d.lines,
        attachmentB: d.attachmentB,
        route: d.route,
      }),
    [d],
  );

  function patchLine(index: number, patch: Partial<ExpenseLine>) {
    const lines = d.lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
    updateDraft({ lines });
  }

  function setLineCount(n: number) {
    const next: ExpenseLine[] = [];
    for (let i = 0; i < n; i++) next.push(d.lines[i] ?? emptyLine(i + 1));
    updateDraft({ lines: next.map((l, i) => ({ ...l, lineNo: i + 1 })) });
    if (state.ui.activeLineIndex >= n) updateUi({ activeLineIndex: Math.max(0, n - 1) });
  }

  function doSave() {
    const result = saveDraft();
    setConfirmStage(0);
    setMessage(
      result.violations.length === 0
        ? `${result.id} を保存しました。規程チェックは全て通過しています。「提出」を押すと申請できます。`
        : `${result.id} を保存しました。ただし規程違反が ${result.violations.length} 件あるため、まだ提出できません。`,
    );
  }

  function doSubmit() {
    if (!d.editingId) {
      setMessage('先に保存してください。');
      return;
    }
    const result = submitRequest(d.editingId);
    setMessage(result.message);
  }

  const canGoNext = step < 7;
  const nextBlocked =
    (step === 2 && !deptConfirmed) || (step === 3 && d.lines.length === 0);

  return (
    <div className="stack">
      <div className="bevel-out">
        <div className="titlebar">
          <span>経費精算申請 起票（EXP010）{d.editingId ? ` ― 編集中: ${d.editingId}` : ' ― 新規'}</span>
          <span className="badge">STEP {step} / 7</span>
        </div>

        <div style={{ padding: 6 }}>
          <div className="stepbar">
            {STEP_TITLES.map((t, i) => (
              <div
                key={t}
                className="step"
                data-state={i + 1 === step ? 'current' : i + 1 < step ? 'done' : 'todo'}
              >
                {t}
              </div>
            ))}
          </div>

          <div className="progress" style={{ marginBottom: 6 }}>
            <i style={{ width: `${Math.round((step / 7) * 100)}%` }} />
            <b>完了率 {Math.round((step / 7) * 100)}%（※目安です。実際の残作業量とは一致しません）</b>
          </div>

          {/* ================= STEP 1 ================= */}
          {step === 1 && (
            <div className="stack">
              <div className="warnbox">
                項目 A-1 は 30 文字以内。項目 A-3（会計期間）を後から変更すると、
                ステップ4 で入力済みの明細日付が全て規程 R02 違反になります。先に確定してください。
              </div>
              <div className="field-grid">
                <label>
                  A-1 件名<span className="req">＊</span>
                </label>
                <input
                  type="text"
                  value={d.title}
                  maxLength={30}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  style={{ width: '100%' }}
                />

                <label>
                  A-2 申請者<span className="req">＊</span>
                </label>
                <select
                  value={d.applicantId}
                  onChange={(e) => {
                    const emp = findEmployee(e.target.value);
                    updateDraft({
                      applicantId: e.target.value,
                      divisionCode: emp?.divisionCode ?? '',
                      deptCode: emp?.deptCode ?? '',
                      sectionCode: emp?.sectionCode ?? '',
                    });
                    setDeptConfirmed(false);
                  }}
                >
                  <option value="">― 選択してください ―</option>
                  {EMPLOYEES.filter((e) => e.role === 'STAFF' || e.role === 'MANAGER').map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} {e.name}（{ROLE_LABELS[e.role]}）
                    </option>
                  ))}
                </select>

                <label>
                  A-3 会計期間<span className="req">＊</span>
                </label>
                <select value={d.period} onChange={(e) => updateDraft({ period: e.target.value })}>
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <label>A-4 起票端末</label>
                <input type="text" value="WS-0413" disabled />

                <label>A-5 様式バージョン</label>
                <input type="text" value="v3.2（2026-04 改定）" disabled />
              </div>
              <div className="note">
                ※ A-2 に部長以上は表示されません（承認者が申請者を兼ねられないため）。代理申請機能は v1.0.0 では未実装です。
              </div>
            </div>
          )}

          {/* ================= STEP 2 ================= */}
          {step === 2 && (
            <div className="stack">
              <div className="warnbox">
                部門コードは <b>事業部(2桁)-部(3桁)-課(2桁)</b> の 3 段構成です。
                課コードは連番ではありません（例: 第二営業部は 01 と 03、基盤技術部は 01 と 05）。
                申請者の所属と 1 文字でも異なると規程 R13 違反になります。
              </div>
              <div className="field-grid">
                <label>
                  B-1 事業部<span className="req">＊</span>
                </label>
                <select
                  value={d.divisionCode}
                  onChange={(e) => {
                    updateDraft({ divisionCode: e.target.value, deptCode: '', sectionCode: '' });
                    setDeptConfirmed(false);
                  }}
                >
                  <option value="">― 選択 ―</option>
                  {DIVISIONS.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code} {x.name}
                    </option>
                  ))}
                </select>

                <label>
                  B-2 部<span className="req">＊</span>
                </label>
                <select
                  value={d.deptCode}
                  disabled={!d.divisionCode}
                  onChange={(e) => {
                    updateDraft({ deptCode: e.target.value, sectionCode: '' });
                    setDeptConfirmed(false);
                  }}
                >
                  <option value="">― 選択 ―</option>
                  {departmentsOf(d.divisionCode).map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code} {x.name}
                    </option>
                  ))}
                </select>

                <label>
                  B-3 課<span className="req">＊</span>
                </label>
                <select
                  value={d.sectionCode}
                  disabled={!d.deptCode}
                  onChange={(e) => {
                    updateDraft({ sectionCode: e.target.value });
                    setDeptConfirmed(false);
                  }}
                >
                  <option value="">― 選択 ―</option>
                  {sectionsOf(d.deptCode).map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code} {x.name}
                    </option>
                  ))}
                </select>

                <label>B-4 部門コード（自動）</label>
                <input
                  type="text"
                  className="mono"
                  disabled
                  value={`${d.divisionCode || '__'}-${d.deptCode || '___'}-${d.sectionCode || '__'}`}
                />
              </div>

              <div className="bevel-in" style={{ padding: 5 }}>
                <div>
                  申請者 {d.applicantId || '(未選択)'} の登録所属:{' '}
                  <b>
                    {applicant
                      ? `${applicant.divisionCode}-${applicant.deptCode}-${applicant.sectionCode} ／ ${describeDeptPath(
                          applicant.divisionCode,
                          applicant.deptCode,
                          applicant.sectionCode,
                        )}`
                      : '―'}
                  </b>
                </div>
                <label style={{ display: 'block', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={deptConfirmed}
                    onChange={(e) => setDeptConfirmed(e.target.checked)}
                  />{' '}
                  B-5 上記と入力内容が一致していることを確認しました<span className="req">＊</span>
                </label>
                <div className="note">※ このチェックを入れないと次のステップに進めません。</div>
              </div>
            </div>
          )}

          {/* ================= STEP 3 ================= */}
          {step === 3 && (
            <div className="stack">
              <div className="warnbox">
                明細は <b>1 申請あたり最大 5 件</b>（規程 R10）。件数を確定してからステップ4で内容を入力します。
                ここで減らすと、後ろの明細に入力済みの内容は破棄されます。
              </div>
              <div className="field-grid">
                <label>
                  C-1 明細件数<span className="req">＊</span>
                </label>
                <div className="row-flex">
                  <select value={d.lines.length} onChange={(e) => setLineCount(Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} 件
                      </option>
                    ))}
                  </select>
                  <button className="btn small" onClick={() => setLineCount(Math.min(5, d.lines.length + 1))}>
                    ＋1 件追加
                  </button>
                  <button className="btn small" onClick={() => setLineCount(Math.max(0, d.lines.length - 1))}>
                    －1 件削除
                  </button>
                </div>
              </div>
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>行</th>
                    <th>入力状況</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.length === 0 && (
                    <tr>
                      <td colSpan={2} className="note">
                        明細がありません。件数を 1 件以上にしてください。
                      </td>
                    </tr>
                  )}
                  {d.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td>{l.minorCode ? `${l.date} ${l.minorCode}` : '未入力'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ================= STEP 4 ================= */}
          {step === 4 && (
            <div className="stack">
              {d.lines.length === 0 ? (
                <div className="errorbox">明細がありません。ステップ3 に戻って件数を指定してください。</div>
              ) : (
                <>
                  <div className="tabs inner">
                    {d.lines.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        data-active={state.ui.activeLineIndex === i}
                        onClick={() => updateUi({ activeLineIndex: i })}
                      >
                        明細 {i + 1}
                      </button>
                    ))}
                  </div>
                  <LineEditor
                    line={d.lines[Math.min(state.ui.activeLineIndex, d.lines.length - 1)]}
                    index={Math.min(state.ui.activeLineIndex, d.lines.length - 1)}
                    period={d.period}
                    onPatch={patchLine}
                  />
                </>
              )}
            </div>
          )}

          {/* ================= STEP 5 ================= */}
          {step === 5 && (
            <div className="stack">
              <div className={bandRule.requiresAttachmentB ? 'errorbox' : 'warnbox'}>
                現在の合計は <b>{totals.amountJpy.toLocaleString('ja-JP')} 円</b>（区分 {bandRule.band}）です。
                {bandRule.requiresAttachmentB
                  ? ' 区分 C 以上のため、付表Bの入力が必須です（規程 R11）。'
                  : ' 区分 B 以下のため、付表Bは入力できません。合計が 50,000 円以上になると入力欄が開きます。'}
              </div>
              <div className="field-grid">
                <label>
                  D-1 申請理由<span className="req">＊</span>
                </label>
                <textarea
                  rows={2}
                  disabled={!bandRule.requiresAttachmentB}
                  value={d.attachmentB?.reason ?? ''}
                  onChange={(e) =>
                    updateDraft({
                      attachmentB: {
                        reason: e.target.value,
                        destination: d.attachmentB?.destination ?? '',
                        companions: d.attachmentB?.companions ?? '',
                        preApprovalNo: d.attachmentB?.preApprovalNo ?? '',
                      },
                    })
                  }
                  style={{ width: '100%' }}
                />

                <label>
                  D-2 訪問先<span className="req">＊</span>
                </label>
                <input
                  type="text"
                  disabled={!bandRule.requiresAttachmentB}
                  value={d.attachmentB?.destination ?? ''}
                  onChange={(e) =>
                    updateDraft({
                      attachmentB: {
                        reason: d.attachmentB?.reason ?? '',
                        destination: e.target.value,
                        companions: d.attachmentB?.companions ?? '',
                        preApprovalNo: d.attachmentB?.preApprovalNo ?? '',
                      },
                    })
                  }
                  style={{ width: '100%' }}
                />

                <label>
                  D-3 同行者<span className="req">＊</span>
                </label>
                <input
                  type="text"
                  disabled={!bandRule.requiresAttachmentB}
                  placeholder="いない場合は「なし」"
                  value={d.attachmentB?.companions ?? ''}
                  onChange={(e) =>
                    updateDraft({
                      attachmentB: {
                        reason: d.attachmentB?.reason ?? '',
                        destination: d.attachmentB?.destination ?? '',
                        companions: e.target.value,
                        preApprovalNo: d.attachmentB?.preApprovalNo ?? '',
                      },
                    })
                  }
                  style={{ width: '100%' }}
                />

                <label>
                  D-4 事前承認番号<span className="req">＊</span>
                </label>
                <input
                  type="text"
                  disabled={!bandRule.requiresAttachmentB}
                  placeholder="FIN-123456"
                  className="mono"
                  value={d.attachmentB?.preApprovalNo ?? ''}
                  onChange={(e) =>
                    updateDraft({
                      attachmentB: {
                        reason: d.attachmentB?.reason ?? '',
                        destination: d.attachmentB?.destination ?? '',
                        companions: d.attachmentB?.companions ?? '',
                        preApprovalNo: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="note">
                ※ 事前承認番号は経理課（E3001）が別システムで発行した FIN-6桁 の番号です。本デモでは任意の 6 桁で通ります。
              </div>
              {!bandRule.requiresAttachmentB && d.attachmentB && (
                <button className="btn small" onClick={() => updateDraft({ attachmentB: null })}>
                  入力済みの付表Bを削除する
                </button>
              )}
            </div>
          )}

          {/* ================= STEP 6 ================= */}
          {step === 6 && (
            <div className="stack">
              <div className="warnbox">
                承認者は <b>別表3（承認マトリクス）</b> と <b>社員マスタ</b> を突き合わせてご自身で特定してください。
                システムは候補を提示しません。合計金額の区分、海外区分・外貨明細の有無、申請者の所属の 3 つで決まります。
              </div>

              <div className="bevel-in" style={{ padding: 5 }}>
                現在の合計 <b>{totals.amountJpy.toLocaleString('ja-JP')} 円</b> ＝ 区分 <b>{bandRule.band}</b>
                <br />
                別表3: 1次 = {bandRule.first} ／ 2次 = {bandRule.second ?? 'なし'} ／ 最終 = {bandRule.final}
                <br />
                <span className="note">
                  ※ 明細に海外区分の費目または JPY 以外の通貨が 1 件でも含まれる場合、最終承認者は CFO に格上げされます。
                </span>
              </div>

              <div className="field-grid">
                <label>
                  E-1 1次承認者<span className="req">＊</span>
                </label>
                <select value={d.route.first} onChange={(e) => updateDraft({ route: { ...d.route, first: e.target.value } })}>
                  <option value="">― 選択 ―</option>
                  {EMPLOYEES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} {e.name}（{ROLE_LABELS[e.role]} / {e.divisionCode}-{e.deptCode}-{e.sectionCode}）
                    </option>
                  ))}
                </select>

                <label>E-2 2次承認者</label>
                <select
                  value={d.route.second ?? ''}
                  onChange={(e) => updateDraft({ route: { ...d.route, second: e.target.value || null } })}
                >
                  <option value="">（なし）</option>
                  {EMPLOYEES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} {e.name}（{ROLE_LABELS[e.role]} / {e.divisionCode}-{e.deptCode}-{e.sectionCode}）
                    </option>
                  ))}
                </select>

                <label>
                  E-3 最終承認者<span className="req">＊</span>
                </label>
                <select value={d.route.final} onChange={(e) => updateDraft({ route: { ...d.route, final: e.target.value } })}>
                  <option value="">― 選択 ―</option>
                  {EMPLOYEES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} {e.name}（{ROLE_LABELS[e.role]} / {e.divisionCode}-{e.deptCode}-{e.sectionCode}）
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ================= STEP 7 ================= */}
          {step === 7 && (
            <div className="stack">
              <div className="bevel-in" style={{ padding: 5 }}>
                <b>入力内容</b>
                <table className="grid" style={{ marginTop: 3 }}>
                  <tbody>
                    <tr>
                      <th style={{ width: 130 }}>件名</th>
                      <td>{d.title || '(未入力)'}</td>
                    </tr>
                    <tr>
                      <th>申請者 / 部門</th>
                      <td>
                        {d.applicantId} {applicant?.name} ／ {d.divisionCode}-{d.deptCode}-{d.sectionCode}
                      </td>
                    </tr>
                    <tr>
                      <th>会計期間</th>
                      <td>{d.period}</td>
                    </tr>
                    <tr>
                      <th>合計 / 区分</th>
                      <td>
                        {totals.amountJpy.toLocaleString('ja-JP')} 円（内消費税 {totals.taxAmount.toLocaleString('ja-JP')} 円） / 区分 {totals.band}
                      </td>
                    </tr>
                    <tr>
                      <th>承認ルート</th>
                      <td>
                        {d.route.first || '―'} → {d.route.second || '（なし）'} → {d.route.final || '―'}
                      </td>
                    </tr>
                    <tr>
                      <th>付表B</th>
                      <td>{d.attachmentB ? `あり（${d.attachmentB.preApprovalNo}）` : 'なし'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {violations.length === 0 ? (
                <div className="okbox">
                  <b>規程チェック: 全 14 項目を通過しました。</b>
                </div>
              ) : (
                <div className="errorbox">
                  <b>規程チェック: {violations.length} 件の違反があります。</b>
                  <ol style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    {violations.map((v, i) => (
                      <li key={i} style={{ marginBottom: 2 }}>
                        <b>[{v.rule}]</b> {v.location}: {v.message}
                        <br />
                        <span className="note">→ {v.hint}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {message && <div className="okbox">{message}</div>}

              <div className="row-flex">
                <button className="btn primary" onClick={() => setConfirmStage(1)}>
                  保存
                </button>
                <button className="btn" onClick={doSubmit} disabled={!d.editingId || violations.length > 0}>
                  提出
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    updateDraft({
                      editingId: null,
                      title: '',
                      applicantId: '',
                      divisionCode: '',
                      deptCode: '',
                      sectionCode: '',
                      lines: [],
                      attachmentB: null,
                      route: { first: '', second: null, final: '' },
                    });
                    updateUi({ wizardStep: 1 });
                    setMessage(null);
                    setDeptConfirmed(false);
                  }}
                >
                  クリア
                </button>
              </div>
            </div>
          )}

          {/* ---- ナビゲーション ---- */}
          <hr className="sep" />
          <div className="row-flex" style={{ justifyContent: 'space-between' }}>
            <button className="btn" disabled={step <= 1} onClick={() => updateUi({ wizardStep: step - 1 })}>
              ＜ 戻る
            </button>
            <span className="note">
              {nextBlocked && step === 2 && '※ B-5 の確認チェックを入れてください'}
              {nextBlocked && step === 3 && '※ 明細件数を 1 件以上にしてください'}
            </span>
            <button
              className="btn primary"
              disabled={!canGoNext || nextBlocked}
              onClick={() => updateUi({ wizardStep: step + 1 })}
            >
              次へ ＞
            </button>
          </div>
        </div>
      </div>

      {/* ---- 確認モーダル 3 連 ---- */}
      {confirmStage === 1 && (
        <Modal
          title="確認 (1/3)"
          onCancel={() => setConfirmStage(0)}
          onOk={() => setConfirmStage(2)}
          okLabel="はい"
          cancelLabel="いいえ"
        >
          入力内容を保存します。よろしいですか？
        </Modal>
      )}
      {confirmStage === 2 && (
        <Modal
          title="確認 (2/3)"
          onCancel={() => setConfirmStage(0)}
          onOk={() => setConfirmStage(3)}
          okLabel="はい"
          cancelLabel="いいえ"
        >
          保存すると起票内容が確定し、上長へ通知されます。本当によろしいですか？
        </Modal>
      )}
      {confirmStage === 3 && (
        <Modal title="確認 (3/3)" onCancel={() => setConfirmStage(0)} onOk={doSave} okLabel="保存する" cancelLabel="戻る">
          <span className="blink">【最終確認】</span> この操作は取り消せません。保存を実行しますか？
        </Modal>
      )}
    </div>
  );
}

// ---- 明細エディタ -----------------------------------------------------------

function LineEditor({
  line,
  index,
  period,
  onPatch,
}: {
  line: ExpenseLine;
  index: number;
  period: string;
  onPatch: (i: number, patch: Partial<ExpenseLine>) => void;
}) {
  const minor = findMinor(line.minorCode);
  const officialRate = findFxRate(period, line.currency);

  return (
    <div className="stack">
      <div className="warnbox">
        費目は <b>大分類 → 中分類 → 小分類</b> の順に選んでください。上位を変更すると下位はクリアされます。
        <br />
        適用レート（項目 F-7）は <b>別表2</b> を見て手入力します。円換算額（F-8）と消費税額（F-11）も
        自動計算されません。電卓で計算して入力してください。
      </div>

      <div className="field-grid">
        <label>
          F-1 発生日<span className="req">＊</span>
        </label>
        <input type="date" value={line.date} onChange={(e) => onPatch(index, { date: e.target.value })} />

        <label>
          F-2 大分類<span className="req">＊</span>
        </label>
        <select
          value={line.majorCode}
          onChange={(e) => onPatch(index, { majorCode: e.target.value, middleCode: '', minorCode: '' })}
        >
          <option value="">― 選択 ―</option>
          {MAJOR_CATEGORIES.map((m) => (
            <option key={m.code} value={m.code}>
              {m.code} {m.name}
            </option>
          ))}
        </select>

        <label>
          F-3 中分類<span className="req">＊</span>
        </label>
        <select
          value={line.middleCode}
          disabled={!line.majorCode}
          onChange={(e) => onPatch(index, { middleCode: e.target.value, minorCode: '' })}
        >
          <option value="">― 選択 ―</option>
          {middlesOf(line.majorCode).map((m) => (
            <option key={m.code} value={m.code}>
              {m.code} {m.name}
            </option>
          ))}
        </select>

        <label>
          F-4 小分類<span className="req">＊</span>
        </label>
        <select
          value={line.minorCode}
          disabled={!line.middleCode}
          onChange={(e) => onPatch(index, { minorCode: e.target.value })}
        >
          <option value="">― 選択 ―</option>
          {minorsOf(line.middleCode).map((m) => (
            <option key={m.code} value={m.code}>
              {m.code} {m.name}
            </option>
          ))}
        </select>

        <label>
          F-5 通貨<span className="req">＊</span>
        </label>
        <select value={line.currency} onChange={(e) => onPatch(index, { currency: e.target.value })}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label>
          F-6 原貨額<span className="req">＊</span>
        </label>
        <input
          type="number"
          value={line.amountForeign}
          onChange={(e) => onPatch(index, { amountForeign: Number(e.target.value) })}
        />

        <label>
          F-7 適用レート<span className="req">＊</span>
        </label>
        <input
          type="number"
          step="0.01"
          className="mono"
          value={line.rateUsed}
          onChange={(e) => onPatch(index, { rateUsed: Number(e.target.value) })}
        />

        <label>
          F-8 円換算額<span className="req">＊</span>
        </label>
        <input
          type="number"
          className="mono"
          value={line.amountJpy}
          onChange={(e) => onPatch(index, { amountJpy: Number(e.target.value) })}
        />

        <label>
          F-9 税区分<span className="req">＊</span>
        </label>
        <select
          value={line.taxCategory}
          onChange={(e) => onPatch(index, { taxCategory: e.target.value as TaxCategory })}
        >
          {(Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[]).map((t) => (
            <option key={t} value={t}>
              {t} {TAX_CATEGORY_LABELS[t]}
            </option>
          ))}
        </select>

        <label>F-10 軽減税率適用</label>
        <label style={{ textAlign: 'left' }}>
          <input
            type="checkbox"
            checked={line.reducedRate}
            disabled={line.majorCode !== 'MTG'}
            onChange={(e) => onPatch(index, { reducedRate: e.target.checked })}
          />{' '}
          <span className="note">大分類が MTG（会議費）のときのみ操作できます（規程 R07）</span>
        </label>

        <label>
          F-11 消費税額<span className="req">＊</span>
        </label>
        <input
          type="number"
          className="mono"
          value={line.taxAmount}
          onChange={(e) => onPatch(index, { taxAmount: Number(e.target.value) })}
        />

        <label>F-12 プロジェクトコード</label>
        <input
          type="text"
          className="mono"
          placeholder="PRJ-0000"
          value={line.projectCode}
          onChange={(e) => onPatch(index, { projectCode: e.target.value })}
        />

        <label>F-13 摘要</label>
        <input type="text" value={line.note} onChange={(e) => onPatch(index, { note: e.target.value })} style={{ width: '100%' }} />
      </div>

      <div className="bevel-in" style={{ padding: 5 }}>
        <b>この明細に効いている制約</b>
        <ul style={{ margin: '3px 0 0 18px', padding: 0 }} className="note">
          <li>
            会計期間 {period} の {line.currency} の社内レート:{' '}
            <b className="mono">{officialRate !== undefined ? officialRate : '（マスタになし）'}</b>
            （規程 R04 でこの値と完全一致が必要）
          </li>
          <li>
            発生日は {period}-01 〜 {period}-31 の範囲内、かつシステム基準日 {SYSTEM_TODAY} 以前（規程 R02 / R03）
          </li>
          <li>
            {minor
              ? `${minor.name}: 既定税区分 ${minor.defaultTaxCategory} / ${
                  minor.unitLimitJpy === null ? '金額上限なし' : `1明細上限 ${minor.unitLimitJpy.toLocaleString('ja-JP')} 円`
                }${minor.requiresProject ? ' / プロジェクトコード必須' : ''}${minor.overseas ? ' / 海外区分（最終承認者がCFOに格上げ）' : ''}`
              : '小分類を選ぶと、この明細の上限額やプロジェクトコードの要否が表示されます。'}
          </li>
          <li>消費税は内税方式。T10 は 円換算額×10/110、T08 は 円換算額×8/108 の円未満切捨（規程 R06）</li>
        </ul>
      </div>
    </div>
  );
}
