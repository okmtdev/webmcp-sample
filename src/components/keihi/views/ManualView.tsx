'use client';

import { useState } from 'react';
import {
  APPROVAL_MATRIX,
  DEPARTMENTS,
  DIVISIONS,
  EMPLOYEES,
  FX_RATES,
  MAJOR_CATEGORIES,
  MIDDLE_CATEGORIES,
  MINOR_CATEGORIES,
  ROLE_LABELS,
  SECTIONS,
  SYSTEM_TODAY,
  TAX_CATEGORY_LABELS,
} from '@/lib/keihi/masters';
import { resetDemoData } from '@/lib/keihi/store';
import Modal from '../Modal';

const RULES: Array<[string, string]> = [
  ['R01', '費目コードの3階層（大分類→中分類→小分類）が親子関係として整合していること。'],
  ['R02', '明細の発生日が申請の会計期間（YYYY-MM）の月内であること。'],
  ['R03', `明細の発生日がシステム基準日（${SYSTEM_TODAY}）より未来でないこと。`],
  ['R04', '適用為替レートが当該会計期間の社内レート（別表2）と完全に一致すること。'],
  ['R05', '円換算額 = 原貨額 × 適用レート の円未満切捨。通貨が JPY のときはレート 1、原貨額＝円換算額。'],
  ['R06', '消費税額が内税方式の計算値と一致すること（T10: ×10/110、T08: ×8/108、TEX/TNA: 0）。'],
  ['R07', '軽減税率 T08 は大分類 MTG（会議費）のみ。T08 なら軽減税率適用にチェック、それ以外なら未チェック。'],
  ['R08', '小分類ごとに定められた 1 明細あたりの金額上限（別表1）を超えないこと。'],
  ['R09', 'プロジェクトコード必須の小分類では PRJ-4桁 の形式で入力されていること。'],
  ['R10', '明細は 1 申請あたり 1〜5 件。同一（発生日, 小分類）の重複は不可。'],
  ['R11', '合計 50,000 円以上の場合、付表B（理由・訪問先・同行者・事前承認番号 FIN-6桁）が必須。'],
  ['R12', '承認ルートが承認マトリクス（別表3）の導出結果と完全に一致すること。'],
  ['R13', '申請者の登録所属と申請の部門コードが一致すること。'],
  ['R14', '部門コードの階層（事業部→部→課）が整合すること。課コードは連番ではなく欠番がある。'],
];

type Tab = 'rules' | 'exp' | 'fx' | 'matrix' | 'org' | 'sys';

const TAB_LABELS: Record<Tab, string> = {
  rules: '規程 R01〜R14',
  exp: '別表1 費目コード',
  fx: '別表2 為替レート',
  matrix: '別表3 承認マトリクス',
  org: '別表4 組織・社員',
  sys: 'システム情報',
};

export default function ManualView() {
  const [tab, setTab] = useState<Tab>('rules');
  const [resetMode, setResetMode] = useState<'seed' | 'empty' | null>(null);

  return (
    <div className="stack">
      <div className="bevel-out">
        <div className="titlebar">
          <span>規程・マスタ照会（EXP800）</span>
          <span className="badge">改定 2026-04-01</span>
        </div>
        <div style={{ padding: 6 }}>
          <div className="tabs inner" style={{ marginBottom: 6 }}>
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button key={t} type="button" data-active={tab === t} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {tab === 'rules' && (
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>条番号</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map(([id, text]) => (
                  <tr key={id}>
                    <td className="mono">{id}</td>
                    <td style={{ whiteSpace: 'normal' }}>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'exp' && (
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>小分類コード</th>
                    <th>大分類</th>
                    <th>中分類</th>
                    <th>名称</th>
                    <th>既定税区分</th>
                    <th>1明細上限(円)</th>
                    <th>PJコード</th>
                    <th>海外区分</th>
                  </tr>
                </thead>
                <tbody>
                  {MINOR_CATEGORIES.map((m) => {
                    const mid = MIDDLE_CATEGORIES.find((x) => x.code === m.middleCode);
                    const maj = MAJOR_CATEGORIES.find((x) => x.code === mid?.majorCode);
                    return (
                      <tr key={m.code}>
                        <td className="mono">{m.code}</td>
                        <td>{maj?.name}</td>
                        <td>{mid?.name}</td>
                        <td>{m.name}</td>
                        <td>{m.defaultTaxCategory}</td>
                        <td className="num">
                          {m.unitLimitJpy === null ? '―' : m.unitLimitJpy.toLocaleString('ja-JP')}
                        </td>
                        <td>{m.requiresProject ? '必須' : '―'}</td>
                        <td>{m.overseas ? '○' : '―'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'fx' && (
            <>
              <table className="grid">
                <thead>
                  <tr>
                    <th>会計期間</th>
                    <th>通貨</th>
                    <th>社内レート</th>
                  </tr>
                </thead>
                <tbody>
                  {FX_RATES.map((r) => (
                    <tr key={`${r.period}-${r.currency}`}>
                      <td>{r.period}</td>
                      <td className="mono">{r.currency}</td>
                      <td className="num">{r.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="note" style={{ marginTop: 4 }}>
                ※ JPY は常に 1。レートは会計期間ごとに異なります。小数第 2 位まで完全一致が必要です（規程 R04）。
              </div>
              <table className="grid" style={{ marginTop: 6 }}>
                <thead>
                  <tr>
                    <th>税区分</th>
                    <th>内容</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(TAX_CATEGORY_LABELS).map(([k, v]) => (
                    <tr key={k}>
                      <td className="mono">{k}</td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {tab === 'matrix' && (
            <>
              <table className="grid">
                <thead>
                  <tr>
                    <th>区分</th>
                    <th>合計金額</th>
                    <th>1次承認</th>
                    <th>2次承認</th>
                    <th>最終承認</th>
                    <th>付表B</th>
                    <th>事前承認番号</th>
                  </tr>
                </thead>
                <tbody>
                  {APPROVAL_MATRIX.map((b) => (
                    <tr key={b.band}>
                      <td>{b.band}</td>
                      <td>
                        {b.minJpy.toLocaleString('ja-JP')} 円以上{' '}
                        {b.maxJpy === null ? '（上限なし）' : `${b.maxJpy.toLocaleString('ja-JP')} 円未満`}
                      </td>
                      <td>{ROLE_LABELS[b.first]}</td>
                      <td>{b.second ? ROLE_LABELS[b.second] : '―'}</td>
                      <td>{ROLE_LABELS[b.final]}</td>
                      <td>{b.requiresAttachmentB ? '必須' : '―'}</td>
                      <td>{b.requiresPreApproval ? '必須' : '―'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="warnbox" style={{ marginTop: 6 }}>
                <b>補足規則</b>
                <ol style={{ margin: '3px 0 0 18px', padding: 0 }}>
                  <li>明細に海外区分の費目、または JPY 以外の通貨が 1 件でも含まれる場合、最終承認者は CFO に格上げする。</li>
                  <li>ロールは申請者の所属で解決する（課長＝同一課、部長＝同一部、本部長＝同一事業部、CFO＝全社）。</li>
                  <li>解決先が申請者本人または既出の承認者と重複する場合は、1 段上位（課長→部長→本部長→CFO）に繰り上げる。</li>
                  <li>管理本部には本部長が存在しないため、本部長に該当する場合は CFO に繰り上がる。</li>
                </ol>
              </div>
            </>
          )}

          {tab === 'org' && (
            <>
              <b>組織コード</b>
              <div className="scroll-x" style={{ marginTop: 2 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>部門コード</th>
                      <th>事業部</th>
                      <th>部</th>
                      <th>課</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SECTIONS.map((s) => {
                      const dept = DEPARTMENTS.find((d) => d.code === s.deptCode);
                      const div = DIVISIONS.find((d) => d.code === dept?.divisionCode);
                      return (
                        <tr key={`${s.deptCode}-${s.code}`}>
                          <td className="mono">
                            {div?.code}-{dept?.code}-{s.code}
                          </td>
                          <td>{div?.name}</td>
                          <td>{dept?.name}</td>
                          <td>{s.name}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <b style={{ display: 'block', marginTop: 6 }}>社員マスタ</b>
              <div className="scroll-x" style={{ marginTop: 2 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>社員コード</th>
                      <th>氏名</th>
                      <th>役職</th>
                      <th>所属</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EMPLOYEES.map((e) => (
                      <tr key={e.id}>
                        <td className="mono">{e.id}</td>
                        <td>{e.name}</td>
                        <td>{ROLE_LABELS[e.role]}</td>
                        <td className="mono">
                          {e.divisionCode}-{e.deptCode}-{e.sectionCode}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="note" style={{ marginTop: 4 }}>
                ※ 部コード 000 は本部直轄、課コード 00 は部直轄を表します。
              </div>
            </>
          )}

          {tab === 'sys' && (
            <div className="stack">
              <table className="grid">
                <tbody>
                  <tr>
                    <th style={{ width: 160 }}>システム名</th>
                    <td>スーパーややこしいシステム</td>
                  </tr>
                  <tr>
                    <th>バージョン</th>
                    <td className="mono">v1.0.0</td>
                  </tr>
                  <tr>
                    <th>システム基準日</th>
                    <td className="mono">{SYSTEM_TODAY}</td>
                  </tr>
                  <tr>
                    <th>データ保存先</th>
                    <td>
                      ブラウザの localStorage（キー <code className="mono">syys.v1</code>）
                    </td>
                  </tr>
                  <tr>
                    <th>エージェント連携</th>
                    <td>
                      WebMCP（<code className="mono">document.modelContext</code>）
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="warnbox">
                データはこのブラウザにしか保存されません。サーバは存在しません。
              </div>

              <div className="row-flex">
                <button className="btn small" onClick={() => setResetMode('seed')}>
                  初期データに戻す
                </button>
                <button className="btn small" onClick={() => setResetMode('empty')}>
                  全件削除
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {resetMode && (
        <Modal
          title="データ操作の確認"
          onCancel={() => setResetMode(null)}
          onOk={() => {
            resetDemoData(resetMode);
            setResetMode(null);
          }}
          okLabel="実行する"
        >
          {resetMode === 'seed'
            ? '現在の申請データを全て破棄し、初期サンプルデータを再投入します。'
            : '現在の申請データを全て削除します。'}
          <br />
          この操作は取り消せません。
        </Modal>
      )}
    </div>
  );
}
