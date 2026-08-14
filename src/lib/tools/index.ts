// スーパーややこしいシステム v.1.0.0 が公開する WebMCP ツール群。
//
// 設計方針:
//   - 画面の 7 ステップウィザードで人間がやらされる作業を、1 回の呼び出しで完了させる
//   - 規程（R01〜R14）の判定は UI と完全に同じ関数を使う（二重実装しない）
//   - 失敗時は「どの規程に」「どこが」「どう直せば通るか」まで返す

import {
  APPROVAL_MATRIX,
  CURRENCIES,
  DEPARTMENTS,
  DIVISIONS,
  EMPLOYEES,
  FX_RATES,
  MAJOR_CATEGORIES,
  MIDDLE_CATEGORIES,
  MINOR_CATEGORIES,
  PERIODS,
  ROLE_LABELS,
  SECTIONS,
  STATUS_LABELS,
  SYSTEM_TODAY,
  TAX_CATEGORY_LABELS,
  describeDeptPath,
  findEmployee,
} from '../domain/masters';
import { autoComputeLine, computeTotals, deriveRoute, validateRequest } from '../domain/rules';
import {
  approveRequest,
  createRequest,
  deleteRequest,
  findRequest,
  getState,
  loadDraftFromRequest,
  nextApprover,
  replaceRequest,
  resetDemoData,
  runMonthEndClose,
  submitRequest,
  updateUi,
} from '../domain/store';
import type { ViewName } from '../domain/store';
import type { AttachmentB, ExpenseLine, ExpenseRequest, RuleViolation } from '../domain/types';
import { errorResult, textResult } from '../webmcp/registry';
import type { ToolDescriptor } from '../webmcp/types';

// ---- 共通ヘルパー -----------------------------------------------------------

function yen(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}

function formatViolations(violations: RuleViolation[]): string {
  if (violations.length === 0) return '規程違反はありません。';
  return violations
    .map((v, i) => `  ${i + 1}. [${v.rule}] ${v.location}: ${v.message}\n     → 対処: ${v.hint}`)
    .join('\n');
}

function summarizeRequest(r: ExpenseRequest): string {
  const t = computeTotals(r.lines);
  const emp = findEmployee(r.applicantId);
  const lines = r.lines
    .map(
      (l) =>
        `    #${l.lineNo} ${l.date} ${l.minorCode} ${l.currency} ${l.amountForeign} ` +
        `(レート${l.rateUsed}) → ${yen(l.amountJpy)} 税${l.taxCategory}:${yen(l.taxAmount)}` +
        `${l.projectCode ? ` PJ:${l.projectCode}` : ''}${l.note ? ` / ${l.note}` : ''}`,
    )
    .join('\n');
  const next = nextApprover(r);
  return [
    `${r.id} 「${r.title}」`,
    `  状態: ${STATUS_LABELS[r.status] ?? r.status}${next ? `（次の承認者: ${next}）` : ''}`,
    `  申請者: ${r.applicantId} ${emp?.name ?? ''} / ${describeDeptPath(r.divisionCode, r.deptCode, r.sectionCode)}`,
    `  会計期間: ${r.period}`,
    `  合計: ${yen(t.amountJpy)}（内消費税 ${yen(t.taxAmount)}） 区分${t.band} 明細${t.lineCount}件`,
    `  承認ルート: 1次=${r.route.first} / 2次=${r.route.second ?? 'なし'} / 最終=${r.route.final}`,
    r.attachmentB
      ? `  付表B: 理由「${r.attachmentB.reason}」 訪問先「${r.attachmentB.destination}」 同行者「${r.attachmentB.companions}」 事前承認番号 ${r.attachmentB.preApprovalNo}`
      : '  付表B: なし',
    lines ? `  明細:\n${lines}` : '  明細: なし',
  ].join('\n');
}

function toStructured(r: ExpenseRequest) {
  return { ...r, totals: computeTotals(r.lines) };
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asLines(v: unknown): Array<Partial<ExpenseLine> & { minorCode: string; date: string; amountForeign: number }> {
  if (!Array.isArray(v)) return [];
  return v as Array<Partial<ExpenseLine> & { minorCode: string; date: string; amountForeign: number }>;
}

// ---- スキーマ断片 -----------------------------------------------------------

const LINE_SCHEMA = {
  type: 'object',
  description: '経費明細 1 行。省略した計算項目は規程どおりに自動計算される。',
  properties: {
    date: { type: 'string', description: '発生日 YYYY-MM-DD。会計期間の月内、かつシステム基準日以前であること（R02/R03）。' },
    minorCode: {
      type: 'string',
      description: '費目の小分類コード（例: TRV-RAI-EXP）。大分類・中分類はここから自動補完される（R01）。',
    },
    currency: { type: 'string', enum: [...CURRENCIES], description: '通貨。既定は JPY。' },
    amountForeign: { type: 'number', description: '原貨額。通貨が JPY のときは円額そのもの。' },
    projectCode: { type: 'string', description: 'PRJ-4桁（例: PRJ-0042）。必須の小分類がある（R09）。' },
    note: { type: 'string', description: '摘要。' },
    taxCategory: {
      type: 'string',
      enum: ['T10', 'T08', 'TEX', 'TNA'],
      description: '税区分。省略時は小分類の既定値。T08 は大分類 MTG のみ（R07）。',
    },
    rateUsed: { type: 'number', description: '適用為替レート。省略時は会計期間の社内レートを自動適用（R04）。' },
    amountJpy: { type: 'number', description: '円換算額。省略時は原貨額×レートの円未満切捨で自動計算（R05）。' },
    taxAmount: { type: 'number', description: '消費税額。省略時は内税方式で自動計算（R06）。' },
    reducedRate: { type: 'boolean', description: '軽減税率適用フラグ。省略時は税区分から自動設定（R07）。' },
  },
  required: ['date', 'minorCode', 'amountForeign'],
} as const;

const ATTACHMENT_B_SCHEMA = {
  type: 'object',
  description: '付表B。合計 50,000 円以上のとき必須（R11）。',
  properties: {
    reason: { type: 'string', description: '申請理由。' },
    destination: { type: 'string', description: '訪問先。' },
    companions: { type: 'string', description: '同行者。いない場合は「なし」。' },
    preApprovalNo: { type: 'string', description: '事前承認番号 FIN-6桁（例: FIN-202608）。' },
  },
  required: ['reason', 'destination', 'companions', 'preApprovalNo'],
} as const;

// ---- ツール定義 -------------------------------------------------------------

const getSystemManual: ToolDescriptor = {
  name: 'get_system_manual',
  description:
    'このシステムの業務フロー・社内規程（R01〜R14）・承認マトリクス・システム基準日をまとめて返す。他のツールを使う前に最初に読むこと。',
  annotations: { title: 'システム仕様書を取得', readOnlyHint: true },
  inputSchema: { type: 'object', properties: {} },
  execute: () => {
    const bands = APPROVAL_MATRIX.map(
      (b) =>
        `  区分${b.band}: ${b.minJpy.toLocaleString('ja-JP')}円以上 ${
          b.maxJpy === null ? '上限なし' : `${b.maxJpy.toLocaleString('ja-JP')}円未満`
        } → 1次=${b.first} / 2次=${b.second ?? 'なし'} / 最終=${b.final}` +
        `${b.requiresAttachmentB ? ' / 付表B必須' : ''}${b.requiresPreApproval ? ' / 事前承認番号必須' : ''}`,
    ).join('\n');

    const text = `# スーパーややこしいシステム v.1.0.0 仕様

## システム基準日
${SYSTEM_TODAY}（未来日判定 R03 はこの日付を基準にする）

## 会計期間
${PERIODS.join(' / ')}

## 業務フロー
起票(draft) → 申請(submitted) → 1次承認(approved_1) → 2次承認(approved_2) → 最終承認(approved) → 月次締め(closed)
※ 2次承認者がいない区分では 1次承認の次が最終承認になる。
※ 差戻し(rejected)からは再度 submit_request で申請できる。

## 承認マトリクス（別表3・合計金額で決まる）
${bands}

追加規則:
  - 明細に海外区分の小分類（overseas=true）または JPY 以外の通貨が 1 件でも含まれる場合、最終承認者は CFO に格上げされる。
  - ロールは申請者の所属で解決する（課長=同一課、部長=同一部、本部長=同一事業部、CFO=全社）。
  - 解決先が申請者本人または既出の承認者と重複する場合は 1 段上位に繰り上げる。

## 税額計算（内税方式）
  T10 課税10%: 税額 = floor(円換算額 × 10 / 110)
  T08 軽減8%:  税額 = floor(円換算額 × 8 / 108)
  TEX 非課税 / TNA 対象外: 税額 = 0

## 規程チェック一覧
  R01 費目コードの3階層（大分類→中分類→小分類）が親子関係として整合していること
  R02 明細日付が申請の会計期間（YYYY-MM）の月内であること
  R03 明細日付がシステム基準日より未来でないこと
  R04 適用為替レートが当該会計期間の社内レートと完全一致すること
  R05 円換算額 = floor(原貨額 × 適用レート)。JPY のときはレート1かつ原貨額=円換算額
  R06 消費税額が内税方式の計算値と一致すること
  R07 軽減税率 T08 は大分類 MTG のみ。T08 なら reducedRate=true、それ以外なら false
  R08 小分類ごとの1明細あたり金額上限を超えないこと
  R09 プロジェクトコード必須の小分類では PRJ-4桁 が入力されていること
  R10 明細は1〜5件。同一(日付, 小分類)の重複は不可
  R11 合計 50,000円以上なら付表B（理由/訪問先/同行者/事前承認番号 FIN-6桁）が必須
  R12 承認ルートが承認マトリクスの導出結果と完全一致すること
  R13 申請者の所属と申請の部門コードが一致すること
  R14 部門コードの階層（事業部→部→課）が整合すること。課コードは連番ではなく欠番がある

## 使い方の目安
  1. list_master_codes で必要なコード表を引く
  2. create_request（autoCompute=true）で申請を作る。R04〜R07 と承認ルートは自動で埋まる
  3. validate_request_draft で残る違反を確認して update_request で直す
  4. submit_request → approve_request を承認者ごとに繰り返す
  5. run_month_end_close で月次締め
`;
    return textResult(text, {
      systemToday: SYSTEM_TODAY,
      periods: PERIODS,
      approvalMatrix: APPROVAL_MATRIX,
      statuses: STATUS_LABELS,
    });
  },
};

const listMasterCodes: ToolDescriptor = {
  name: 'list_master_codes',
  description:
    'コードマスタを引く。kind に dept（組織）/ employee（社員）/ expense（費目3階層）/ fx（為替レート）/ tax（税区分）/ approval_matrix（承認マトリクス）/ all を指定する。',
  annotations: { title: 'コードマスタを取得', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['dept', 'employee', 'expense', 'fx', 'tax', 'approval_matrix', 'all'],
        description: '取得するマスタの種類。既定は all。',
      },
      period: { type: 'string', description: 'kind=fx のとき対象の会計期間で絞り込む（例: 2026-08）。' },
    },
  },
  execute: (args) => {
    const kind = asString(args.kind, 'all');
    const period = asString(args.period);
    const out: string[] = [];
    const structured: Record<string, unknown> = {};

    if (kind === 'dept' || kind === 'all') {
      const rows = SECTIONS.map((s) => {
        const dept = DEPARTMENTS.find((d) => d.code === s.deptCode);
        const div = DIVISIONS.find((d) => d.code === dept?.divisionCode);
        return `  ${div?.code}-${dept?.code}-${s.code}  ${div?.name} / ${dept?.name} / ${s.name}`;
      });
      out.push(`## 組織コード（事業部-部-課）\n${rows.join('\n')}`);
      structured.divisions = DIVISIONS;
      structured.departments = DEPARTMENTS;
      structured.sections = SECTIONS;
    }

    if (kind === 'employee' || kind === 'all') {
      const rows = EMPLOYEES.map(
        (e) =>
          `  ${e.id}  ${e.name}（${ROLE_LABELS[e.role]}） ${e.divisionCode}-${e.deptCode}-${e.sectionCode}`,
      );
      out.push(`## 社員マスタ\n${rows.join('\n')}`);
      structured.employees = EMPLOYEES;
    }

    if (kind === 'expense' || kind === 'all') {
      const rows = MINOR_CATEGORIES.map((m) => {
        const mid = MIDDLE_CATEGORIES.find((x) => x.code === m.middleCode);
        const maj = MAJOR_CATEGORIES.find((x) => x.code === mid?.majorCode);
        const limit = m.unitLimitJpy === null ? '上限なし' : `上限${m.unitLimitJpy.toLocaleString('ja-JP')}円`;
        return (
          `  ${m.code}  ${maj?.name}/${mid?.name}/${m.name}  既定税区分=${m.defaultTaxCategory} ${limit}` +
          `${m.requiresProject ? ' PJコード必須' : ''}${m.overseas ? ' 海外区分' : ''}`
        );
      });
      out.push(`## 費目コード（小分類。大分類・中分類は自動補完される）\n${rows.join('\n')}`);
      structured.majorCategories = MAJOR_CATEGORIES;
      structured.middleCategories = MIDDLE_CATEGORIES;
      structured.minorCategories = MINOR_CATEGORIES;
    }

    if (kind === 'fx' || kind === 'all') {
      const rates = period ? FX_RATES.filter((r) => r.period === period) : FX_RATES;
      out.push(
        `## 社内為替レート\n${rates.map((r) => `  ${r.period}  ${r.currency}  ${r.rate}`).join('\n')}\n  ※ JPY は常に 1`,
      );
      structured.fxRates = rates;
    }

    if (kind === 'tax' || kind === 'all') {
      out.push(
        `## 税区分\n${Object.entries(TAX_CATEGORY_LABELS)
          .map(([k, v]) => `  ${k}  ${v}`)
          .join('\n')}`,
      );
      structured.taxCategories = TAX_CATEGORY_LABELS;
    }

    if (kind === 'approval_matrix' || kind === 'all') {
      out.push(
        `## 承認マトリクス\n${APPROVAL_MATRIX.map(
          (b) =>
            `  区分${b.band}: ${b.minJpy}〜${b.maxJpy ?? '∞'} 1次=${b.first} 2次=${b.second ?? 'なし'} 最終=${b.final}` +
            `${b.requiresAttachmentB ? ' 付表B必須' : ''}`,
        ).join('\n')}`,
      );
      structured.approvalMatrix = APPROVAL_MATRIX;
    }

    if (out.length === 0) return errorResult(`kind=${kind} は不正です。`);
    return textResult(out.join('\n\n'), structured);
  },
};

const listRequests: ToolDescriptor = {
  name: 'list_requests',
  description: '申請の一覧を取得する。状態・申請者・会計期間・件名キーワードで絞り込める。',
  annotations: { title: '申請一覧を取得', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['draft', 'submitted', 'approved_1', 'approved_2', 'approved', 'rejected', 'closed'],
        description: '状態で絞り込む。',
      },
      applicantId: { type: 'string', description: '申請者の社員コードで絞り込む。' },
      period: { type: 'string', description: '会計期間で絞り込む（例: 2026-08）。' },
      query: { type: 'string', description: '件名の部分一致で絞り込む。' },
      pendingFor: { type: 'string', description: '指定した社員コードが「今まさに承認すべき」申請だけに絞り込む。' },
    },
  },
  execute: (args) => {
    const status = asString(args.status);
    const applicantId = asString(args.applicantId);
    const period = asString(args.period);
    const query = asString(args.query);
    const pendingFor = asString(args.pendingFor);

    let rows = getState().requests;
    if (status) rows = rows.filter((r) => r.status === status);
    if (applicantId) rows = rows.filter((r) => r.applicantId === applicantId);
    if (period) rows = rows.filter((r) => r.period === period);
    if (query) rows = rows.filter((r) => r.title.includes(query));
    if (pendingFor) rows = rows.filter((r) => nextApprover(r) === pendingFor);

    if (rows.length === 0) return textResult('条件に一致する申請はありません。', { requests: [] });

    const text = rows.map((r) => summarizeRequest(r)).join('\n\n');
    return textResult(`${rows.length} 件ヒットしました。\n\n${text}`, { requests: rows.map(toStructured) });
  },
};

const getRequest: ToolDescriptor = {
  name: 'get_request',
  description: '申請 1 件の全項目と承認履歴、および現時点の規程違反一覧を取得する。',
  annotations: { title: '申請を取得', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: '申請ID（例: RQ-0002）。' } },
    required: ['id'],
  },
  execute: (args) => {
    const id = asString(args.id);
    const r = findRequest(id);
    if (!r) return errorResult(`申請 ${id} が見つかりません。`);
    const violations = validateRequest(r);
    const history = r.history
      .map((h) => `    ${h.at} ${h.actor} ${h.action}${h.note ? ` (${h.note})` : ''}`)
      .join('\n');
    return textResult(
      `${summarizeRequest(r)}\n  履歴:\n${history}\n\n  規程チェック:\n${formatViolations(violations)}`,
      { request: toStructured(r), violations },
    );
  },
};

const validateRequestDraft: ToolDescriptor = {
  name: 'validate_request_draft',
  description:
    '既存の申請、または申請にする前の下書きデータを規程 R01〜R14 で検証する。状態は一切変更しない。違反ごとに具体的な修正値を返す。',
  annotations: { title: '規程チェック（試算）', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '既存の申請を検証する場合の申請ID。draft を指定する場合は不要。' },
      draft: {
        type: 'object',
        description: '未登録の下書きを検証する場合のデータ。',
        properties: {
          title: { type: 'string' },
          applicantId: { type: 'string' },
          period: { type: 'string' },
          lines: { type: 'array', items: LINE_SCHEMA },
          attachmentB: ATTACHMENT_B_SCHEMA,
        },
        required: ['applicantId', 'lines'],
      },
    },
  },
  execute: (args) => {
    if (args.id) {
      const r = findRequest(asString(args.id));
      if (!r) return errorResult(`申請 ${asString(args.id)} が見つかりません。`);
      const violations = validateRequest(r);
      const t = computeTotals(r.lines);
      return textResult(
        `${r.id} の規程チェック結果（違反 ${violations.length} 件）\n` +
          `  合計 ${yen(t.amountJpy)} / 区分${t.band}\n${formatViolations(violations)}`,
        { id: r.id, violations, totals: t },
      );
    }

    const draft = args.draft as Record<string, unknown> | undefined;
    if (!draft) return errorResult('id または draft のどちらかを指定してください。');

    const applicantId = asString(draft.applicantId);
    const emp = findEmployee(applicantId);
    if (!emp) return errorResult(`社員コード ${applicantId} が見つかりません。`);

    const period = asString(draft.period, '2026-08');
    const rawLines = asLines(draft.lines);
    const lines: ExpenseLine[] = rawLines.map((l, i) => autoComputeLine({ ...l, lineNo: i + 1 }, period));
    const derivation = deriveRoute({
      applicantId,
      divisionCode: emp.divisionCode,
      deptCode: emp.deptCode,
      sectionCode: emp.sectionCode,
      lines,
    });

    const violations = validateRequest({
      title: asString(draft.title, '(下書き)'),
      applicantId,
      divisionCode: emp.divisionCode,
      deptCode: emp.deptCode,
      sectionCode: emp.sectionCode,
      period,
      lines,
      attachmentB: (draft.attachmentB as AttachmentB | undefined) ?? null,
      route: derivation.route,
    });

    const t = computeTotals(lines);
    return textResult(
      `下書きの規程チェック結果（違反 ${violations.length} 件）\n` +
        `  合計 ${yen(t.amountJpy)}（内税 ${yen(t.taxAmount)}） / 区分${t.band}\n` +
        `  自動導出した承認ルート: 1次=${derivation.route.first} / 2次=${derivation.route.second ?? 'なし'} / 最終=${derivation.route.final}\n` +
        `  導出過程:\n${derivation.steps.map((s) => `    - ${s}`).join('\n')}\n\n` +
        formatViolations(violations),
      { violations, totals: t, derivedRoute: derivation.route, routeSteps: derivation.steps, lines },
    );
  },
};

const createRequestTool: ToolDescriptor = {
  name: 'create_request',
  description:
    '経費精算申請を新規作成する。画面では7ステップのウィザードを通す必要があるが、このツールは1回の呼び出しで完了する。' +
    'autoCompute（既定 true）が有効なら、為替レート・円換算額・税区分・消費税額・承認ルートを規程どおりに自動計算する。作成後の状態は「起票中」。',
  annotations: { title: '申請を作成', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '件名。' },
      applicantId: { type: 'string', description: '申請者の社員コード（例: E1001）。部門コードは所属から自動補完される。' },
      period: { type: 'string', description: '会計期間 YYYY-MM。既定は 2026-08。' },
      lines: { type: 'array', description: '経費明細（1〜5件）。', items: LINE_SCHEMA },
      attachmentB: ATTACHMENT_B_SCHEMA,
      autoCompute: {
        type: 'boolean',
        description: '計算項目と承認ルートを自動計算するか。既定 true。false にすると画面入力と同じく手入力値がそのまま使われる。',
      },
    },
    required: ['title', 'applicantId', 'lines'],
  },
  execute: (args) => {
    const applicantId = asString(args.applicantId);
    if (!findEmployee(applicantId)) {
      return errorResult(
        `社員コード ${applicantId} はマスタに存在しません。list_master_codes(kind="employee") で確認してください。`,
      );
    }
    const lines = asLines(args.lines);
    if (lines.length === 0) return errorResult('lines を 1 件以上指定してください。');

    const result = createRequest({
      title: asString(args.title),
      applicantId,
      period: asString(args.period) || undefined,
      lines,
      attachmentB: (args.attachmentB as AttachmentB | undefined) ?? null,
      autoCompute: args.autoCompute !== false,
    });

    updateUi({ view: 'list', activeRequestId: result.request.id });

    const head = `申請 ${result.request.id} を作成しました。`;
    const routeText = `承認ルートの導出過程:\n${result.routeSteps.map((s) => `  - ${s}`).join('\n')}`;
    const vio =
      result.violations.length === 0
        ? '規程チェック: 違反なし。submit_request で申請できます。'
        : `規程チェック: 違反 ${result.violations.length} 件。update_request で修正してください。\n${formatViolations(
            result.violations,
          )}`;

    return textResult(`${head}\n\n${summarizeRequest(result.request)}\n\n${routeText}\n\n${vio}`, {
      request: toStructured(result.request),
      violations: result.violations,
      routeSteps: result.routeSteps,
    });
  },
};

const updateRequestTool: ToolDescriptor = {
  name: 'update_request',
  description:
    '既存の申請を修正する。指定した項目だけを差し替える。lines を渡すと明細は全置換され、autoCompute が true なら計算項目と承認ルートを再計算する。起票中・差戻しの申請のみ修正できる。',
  annotations: { title: '申請を修正', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '申請ID。' },
      title: { type: 'string' },
      period: { type: 'string', description: '会計期間 YYYY-MM。' },
      lines: { type: 'array', description: '明細の全置換。', items: LINE_SCHEMA },
      attachmentB: ATTACHMENT_B_SCHEMA,
      clearAttachmentB: { type: 'boolean', description: 'true で付表Bを削除する。' },
      autoCompute: { type: 'boolean', description: '計算項目と承認ルートを再計算するか。既定 true。' },
    },
    required: ['id'],
  },
  execute: (args) => {
    const id = asString(args.id);
    const existing = findRequest(id);
    if (!existing) return errorResult(`申請 ${id} が見つかりません。`);
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return errorResult(
        `申請 ${id} は「${STATUS_LABELS[existing.status]}」のため修正できません（起票中・差戻しのみ修正可）。`,
      );
    }

    const auto = args.autoCompute !== false;
    const period = asString(args.period) || existing.period;

    const lines: ExpenseLine[] = args.lines
      ? asLines(args.lines).map((l, i) =>
          auto
            ? autoComputeLine({ ...l, lineNo: i + 1 }, period)
            : ({ ...autoComputeLine({ ...l, lineNo: i + 1 }, period), ...l } as ExpenseLine),
        )
      : existing.lines;

    const attachmentB = args.clearAttachmentB
      ? null
      : ((args.attachmentB as AttachmentB | undefined) ?? existing.attachmentB);

    const derivation = deriveRoute({
      applicantId: existing.applicantId,
      divisionCode: existing.divisionCode,
      deptCode: existing.deptCode,
      sectionCode: existing.sectionCode,
      lines,
    });

    const next: ExpenseRequest = {
      ...existing,
      title: asString(args.title) || existing.title,
      period,
      lines,
      attachmentB,
      route: auto ? derivation.route : existing.route,
    };

    replaceRequest(id, next);
    const violations = validateRequest(next);

    return textResult(
      `申請 ${id} を更新しました。\n\n${summarizeRequest(next)}\n\n規程チェック:\n${formatViolations(violations)}`,
      { request: toStructured(next), violations, routeSteps: derivation.steps },
    );
  },
};

const deleteRequestTool: ToolDescriptor = {
  name: 'delete_request',
  description:
    '申請を完全に削除する。状態を問わず削除でき、取り消しはできない。承認済や締め済の申請を消すと集計が合わなくなるため、削除前に get_request で内容を確認すること。',
  annotations: { title: '申請を削除', readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: '申請ID。' } },
    required: ['id'],
  },
  execute: (args) => {
    const id = asString(args.id);
    const ok = deleteRequest(id);
    return ok ? textResult(`申請 ${id} を削除しました。`) : errorResult(`申請 ${id} が見つかりません。`);
  },
};

const submitRequestTool: ToolDescriptor = {
  name: 'submit_request',
  description:
    '起票中または差戻しの申請を提出する。規程 R01〜R14 をすべて満たしていないと提出できず、違反内容を返す。',
  annotations: { title: '申請を提出', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: '申請ID。' } },
    required: ['id'],
  },
  execute: (args) => {
    const id = asString(args.id);
    const result = submitRequest(id);
    if (!result.ok) {
      const r = findRequest(id);
      const violations = r ? validateRequest(r) : [];
      return errorResult(`${result.message}${violations.length ? `\n\n${formatViolations(violations)}` : ''}`);
    }
    updateUi({ view: 'approval', activeRequestId: id });
    return textResult(result.message, { request: result.request ? toStructured(result.request) : null });
  },
};

const approveRequestTool: ToolDescriptor = {
  name: 'approve_request',
  description:
    '申請を承認または差し戻す。承認できるのは承認ルート上の「現在の承認者」だけ。順番を飛ばすと誰が承認すべきかを返す。',
  annotations: { title: '承認/差戻し', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '申請ID。' },
      actorId: { type: 'string', description: '操作する承認者の社員コード。' },
      decision: { type: 'string', enum: ['approve', 'reject'], description: '既定は approve。' },
      note: { type: 'string', description: 'コメント。差戻し時は理由を書くこと。' },
    },
    required: ['id', 'actorId'],
  },
  execute: (args) => {
    const id = asString(args.id);
    const actorId = asString(args.actorId);
    const decision = asString(args.decision, 'approve') === 'reject' ? 'reject' : 'approve';
    const result = approveRequest(id, actorId, decision, asString(args.note));
    if (!result.ok) return errorResult(result.message);
    updateUi({ view: 'approval', activeRequestId: id, actorId });
    return textResult(result.message, { request: result.request ? toStructured(result.request) : null });
  },
};

const runMonthEndCloseTool: ToolDescriptor = {
  name: 'run_month_end_close',
  description:
    '指定した会計期間の月次締めを実行する。最終承認済の申請だけを締め、部門別・費目大分類別の集計レポートを返す。締められなかった申請は理由付きで返す。',
  annotations: { title: '月次締め処理', readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: { period: { type: 'string', description: '会計期間 YYYY-MM（例: 2026-08）。' } },
    required: ['period'],
  },
  execute: (args) => {
    const period = asString(args.period);
    if (!period) return errorResult('period を指定してください（例: 2026-08）。');
    const r = runMonthEndClose(period);
    updateUi({ view: 'close' });

    const byDept = r.byDept.map((d) => `    ${d.dept}  ${d.count}件  ${yen(d.amountJpy)}`).join('\n');
    const byMajor = r.byMajor.map((m) => `    ${m.major}  ${m.count}行  ${yen(m.amountJpy)}`).join('\n');
    const skipped = r.skipped.map((s) => `    ${s.id}  ${STATUS_LABELS[s.status]}  ${s.reason}`).join('\n');

    return textResult(
      [
        r.message,
        `  締め対象: ${r.closedIds.length} 件 ${r.closedIds.join(', ') || '(なし)'}`,
        `  合計: ${yen(r.totalJpy)}（内消費税 ${yen(r.totalTax)}）`,
        r.byDept.length ? `  部門別:\n${byDept}` : '',
        r.byMajor.length ? `  費目大分類別:\n${byMajor}` : '',
        r.skipped.length ? `  締められなかった申請:\n${skipped}` : '  未処理の申請はありません。',
      ]
        .filter(Boolean)
        .join('\n'),
      r,
    );
  },
};

const navigateUi: ToolDescriptor = {
  name: 'navigate_ui',
  description:
    '画面表示を切り替える。処理内容そのものは変えないが、いま何をしているかを人間の画面上で見せるために使う。',
  annotations: { title: '画面を移動', readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      view: {
        type: 'string',
        enum: ['dashboard', 'entry', 'list', 'approval', 'close', 'manual'],
        description: '表示する画面。',
      },
      requestId: { type: 'string', description: '選択する申請ID。entry の場合はその申請をウィザードに読み込む。' },
      step: { type: 'number', description: '入力ウィザードのステップ（1〜7）。' },
      actorId: { type: 'string', description: '承認画面で操作者として設定する社員コード。' },
    },
  },
  execute: (args) => {
    const view = asString(args.view) as ViewName | '';
    const requestId = asString(args.requestId);
    const step = typeof args.step === 'number' ? args.step : undefined;
    const actorId = asString(args.actorId);

    if (view === 'entry' && requestId) {
      if (!loadDraftFromRequest(requestId)) return errorResult(`申請 ${requestId} が見つかりません。`);
    }
    updateUi({
      ...(view ? { view: view as ViewName } : {}),
      ...(requestId ? { activeRequestId: requestId } : {}),
      ...(step ? { wizardStep: Math.min(7, Math.max(1, Math.round(step))) } : {}),
      ...(actorId ? { actorId } : {}),
    });
    return textResult(
      `画面を切り替えました（view=${view || '変更なし'}${requestId ? `, request=${requestId}` : ''}${
        step ? `, step=${step}` : ''
      }${actorId ? `, actor=${actorId}` : ''}）。`,
    );
  },
};

const resetDemoDataTool: ToolDescriptor = {
  name: 'reset_demo_data',
  description: 'デモデータを初期状態に戻す。mode="empty" で全件削除、mode="seed" で初期サンプルを再投入する。',
  annotations: { title: 'デモデータをリセット', readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['seed', 'empty'], description: '既定は seed。' },
    },
  },
  execute: (args) => {
    const mode = asString(args.mode, 'seed') === 'empty' ? 'empty' : 'seed';
    resetDemoData(mode);
    updateUi({ view: 'dashboard' });
    return textResult(mode === 'empty' ? '全ての申請を削除しました。' : '初期サンプルデータを再投入しました。');
  },
};

export const ALL_TOOLS: ToolDescriptor[] = [
  getSystemManual,
  listMasterCodes,
  listRequests,
  getRequest,
  validateRequestDraft,
  createRequestTool,
  updateRequestTool,
  deleteRequestTool,
  submitRequestTool,
  approveRequestTool,
  runMonthEndCloseTool,
  navigateUi,
  resetDemoDataTool,
];
