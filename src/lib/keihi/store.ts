// スーパーややこしいシステム v.1.0.0 — アプリケーション状態
//
// React の外（WebMCP ツール）からも同じ状態を触れるように、
// useSyncExternalStore で購読できる素の Observable ストアとして実装する。
// 永続化は localStorage のみ（サーバは存在しない）。

import { DEFAULT_PERIOD, findEmployee } from './masters';
import { autoComputeLine, computeTotals, deriveRoute, validateRequest } from './rules';
import type {
  AttachmentB,
  ApprovalRoute,
  ExpenseLine,
  ExpenseRequest,
  RequestStatus,
  RuleViolation,
} from './types';

export const STORAGE_KEY = 'syys.v1';

export type ViewName = 'dashboard' | 'entry' | 'list' | 'approval' | 'close' | 'manual';

export interface DraftState {
  editingId: string | null;
  title: string;
  applicantId: string;
  divisionCode: string;
  deptCode: string;
  sectionCode: string;
  period: string;
  lines: ExpenseLine[];
  attachmentB: AttachmentB | null;
  route: ApprovalRoute;
}

export interface UiState {
  view: ViewName;
  /** 入力ウィザードの現在ステップ（1〜7）。 */
  wizardStep: number;
  /** 明細タブの選択インデックス。 */
  activeLineIndex: number;
  /** 一覧で選択中の申請。 */
  activeRequestId: string | null;
  /** 一覧のページ（1ページ3件）。 */
  listPage: number;
  listFilterStatus: string;
  /** 承認画面で「操作している人」。 */
  actorId: string;
  /** 上段タブ / 下段タブ。 */
  outerTab: 'A' | 'B' | 'C';
  innerTab: 'a1' | 'a2' | 'a3';
}

export interface AppState {
  requests: ExpenseRequest[];
  seq: number;
  draft: DraftState;
  ui: UiState;
  hydrated: boolean;
}

export function emptyDraft(): DraftState {
  return {
    editingId: null,
    title: '',
    applicantId: '',
    divisionCode: '',
    deptCode: '',
    sectionCode: '',
    period: DEFAULT_PERIOD,
    lines: [],
    attachmentB: null,
    route: { first: '', second: null, final: '' },
  };
}

// ---- 初期データ -------------------------------------------------------------

function seedRequests(): ExpenseRequest[] {
  const r1: ExpenseRequest = {
    id: 'RQ-0001',
    title: '7月度 客先訪問交通費',
    applicantId: 'E1001',
    divisionCode: '10',
    deptCode: '201',
    sectionCode: '01',
    period: '2026-07',
    lines: [
      autoComputeLine(
        { lineNo: 1, date: '2026-07-08', minorCode: 'TRV-RAI-LOC', amountForeign: 1320, currency: 'JPY', note: '品川往復' },
        '2026-07',
      ),
      autoComputeLine(
        { lineNo: 2, date: '2026-07-15', minorCode: 'TRV-TAX-STD', amountForeign: 3400, currency: 'JPY', note: '終電後の帰社' },
        '2026-07',
      ),
    ],
    attachmentB: null,
    route: { first: 'E1002', second: null, final: 'E1003' },
    status: 'closed',
    history: [
      { at: '2026-07-31T09:00:00.000Z', actor: 'E1001', action: '申請', note: '' },
      { at: '2026-07-31T10:12:00.000Z', actor: 'E1002', action: '1次承認', note: '' },
      { at: '2026-08-01T02:30:00.000Z', actor: 'E1003', action: '最終承認', note: '' },
      { at: '2026-08-01T05:00:00.000Z', actor: 'SYSTEM', action: '月次締め', note: '2026-07 締め処理' },
    ],
    createdAt: '2026-07-31T09:00:00.000Z',
    updatedAt: '2026-08-01T05:00:00.000Z',
  };

  // わざと規程違反を含む起票中データ（validate_request_draft のデモ用）。
  const badLines: ExpenseLine[] = [
    {
      lineNo: 1,
      date: '2026-08-03',
      majorCode: 'TRV',
      middleCode: 'TRV-HTL',
      minorCode: 'TRV-HTL-DOM',
      currency: 'JPY',
      amountForeign: 21000,
      rateUsed: 1,
      amountJpy: 21000,
      taxCategory: 'T10',
      reducedRate: false,
      taxAmount: 1909,
      projectCode: '',
      note: '大阪出張 宿泊',
    },
    {
      lineNo: 2,
      date: '2026-08-05',
      majorCode: 'EDU',
      middleCode: 'EDU-SEM',
      minorCode: 'EDU-SEM-DOM',
      currency: 'JPY',
      amountForeign: 30000,
      rateUsed: 1,
      amountJpy: 30000,
      taxCategory: 'T08',
      reducedRate: true,
      taxAmount: 2222,
      projectCode: '',
      note: 'セミナー参加',
    },
  ];

  const r2: ExpenseRequest = {
    id: 'RQ-0002',
    title: '8月度 出張費（入力途中）',
    applicantId: 'E1001',
    divisionCode: '10',
    deptCode: '201',
    sectionCode: '01',
    period: '2026-08',
    lines: badLines,
    attachmentB: null,
    route: { first: 'E1002', second: null, final: 'E1003' },
    status: 'draft',
    history: [{ at: '2026-08-10T01:00:00.000Z', actor: 'E1001', action: '起票', note: '' }],
    createdAt: '2026-08-10T01:00:00.000Z',
    updatedAt: '2026-08-10T01:00:00.000Z',
  };

  return [r1, r2];
}

function initialState(): AppState {
  return {
    requests: seedRequests(),
    seq: 3,
    draft: emptyDraft(),
    ui: {
      view: 'dashboard',
      wizardStep: 1,
      activeLineIndex: 0,
      activeRequestId: null,
      listPage: 1,
      listFilterStatus: 'ALL',
      actorId: 'E1001',
      outerTab: 'A',
      innerTab: 'a1',
    },
    hydrated: false,
  };
}

/** サーバ描画・初回ハイドレーション用の不変スナップショット。 */
const INITIAL_STATE: AppState = initialState();

// ---- ストア本体 -------------------------------------------------------------

type Listener = () => void;

let state: AppState = INITIAL_STATE;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AppState {
  return state;
}

export function getServerState(): AppState {
  return INITIAL_STATE;
}

function setState(updater: (prev: AppState) => AppState, persist = true) {
  state = updater(state);
  if (persist) saveToStorage();
  emit();
}

export function updateUi(patch: Partial<UiState>) {
  setState((s) => ({ ...s, ui: { ...s.ui, ...patch } }), false);
}

export function updateDraft(patch: Partial<DraftState>) {
  setState((s) => ({ ...s, draft: { ...s.draft, ...patch } }));
}

// ---- 永続化 -----------------------------------------------------------------

interface PersistedShape {
  requests: ExpenseRequest[];
  seq: number;
  draft: DraftState;
  actorId: string;
}

function saveToStorage() {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedShape = {
      requests: state.requests,
      seq: state.seq,
      draft: state.draft,
      actorId: state.ui.actorId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage が使えない環境（プライベートモード等）ではメモリ上のみで動作する。
  }
}

/** マウント後に一度だけ呼ぶ。サーバ描画結果とのハイドレーション不一致を避けるため。 */
export function hydrateFromStorage() {
  if (state.hydrated) return;
  let restored: PersistedShape | null = null;
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) restored = JSON.parse(raw) as PersistedShape;
  } catch {
    restored = null;
  }

  const base = initialState();
  state = restored
    ? {
        ...base,
        requests: Array.isArray(restored.requests) ? restored.requests : base.requests,
        seq: typeof restored.seq === 'number' ? restored.seq : base.seq,
        draft: restored.draft ?? base.draft,
        ui: { ...base.ui, actorId: restored.actorId || base.ui.actorId },
        hydrated: true,
      }
    : { ...base, hydrated: true };
  emit();
}

// ---- 申請の CRUD / 状態遷移 -------------------------------------------------

export function findRequest(id: string): ExpenseRequest | undefined {
  return state.requests.find((r) => r.id === id);
}

function nextId(): string {
  return `RQ-${String(state.seq).padStart(4, '0')}`;
}

export interface CreateRequestInput {
  title: string;
  applicantId: string;
  divisionCode?: string;
  deptCode?: string;
  sectionCode?: string;
  period?: string;
  lines: Array<Partial<ExpenseLine> & { minorCode: string; date: string; amountForeign: number }>;
  attachmentB?: AttachmentB | null;
  route?: ApprovalRoute | null;
  /** true なら レート・円換算・税額・承認ルートを規程どおりに自動計算する。 */
  autoCompute?: boolean;
}

export interface CreateRequestResult {
  request: ExpenseRequest;
  violations: RuleViolation[];
  routeSteps: string[];
}

/**
 * 申請を新規作成する。autoCompute が true（既定）なら計算項目と承認ルートを規程から埋める。
 * 規程違反があっても作成自体は行い、違反一覧を返す（UI と同じく「起票中」で保持する）。
 */
export function createRequest(input: CreateRequestInput): CreateRequestResult {
  const applicant = findEmployee(input.applicantId);
  const period = input.period ?? DEFAULT_PERIOD;
  const auto = input.autoCompute !== false;

  const divisionCode = input.divisionCode ?? applicant?.divisionCode ?? '';
  const deptCode = input.deptCode ?? applicant?.deptCode ?? '';
  const sectionCode = input.sectionCode ?? applicant?.sectionCode ?? '';

  const lines: ExpenseLine[] = input.lines.map((l, i) =>
    auto
      ? autoComputeLine({ ...l, lineNo: l.lineNo ?? i + 1 }, period)
      : ({ ...autoComputeLine({ ...l, lineNo: l.lineNo ?? i + 1 }, period), ...l } as ExpenseLine),
  );

  const derivation = deriveRoute({ applicantId: input.applicantId, divisionCode, deptCode, sectionCode, lines });
  const route: ApprovalRoute = input.route ?? (auto ? derivation.route : { first: '', second: null, final: '' });

  const now = new Date().toISOString();
  const req: ExpenseRequest = {
    id: nextId(),
    title: input.title,
    applicantId: input.applicantId,
    divisionCode,
    deptCode,
    sectionCode,
    period,
    lines,
    attachmentB: input.attachmentB ?? null,
    route,
    status: 'draft',
    history: [{ at: now, actor: input.applicantId, action: '起票', note: auto ? 'WebMCP 経由（自動計算あり）' : 'WebMCP 経由' }],
    createdAt: now,
    updatedAt: now,
  };

  const violations = validateRequest(req);

  setState((s) => ({ ...s, requests: [...s.requests, req], seq: s.seq + 1 }));

  return { request: req, violations, routeSteps: derivation.steps };
}

export function replaceRequest(id: string, next: ExpenseRequest) {
  setState((s) => ({
    ...s,
    requests: s.requests.map((r) => (r.id === id ? { ...next, updatedAt: new Date().toISOString() } : r)),
  }));
}

export function deleteRequest(id: string): boolean {
  const exists = state.requests.some((r) => r.id === id);
  if (!exists) return false;
  setState((s) => ({ ...s, requests: s.requests.filter((r) => r.id !== id) }));
  return true;
}

export interface TransitionResult {
  ok: boolean;
  message: string;
  request?: ExpenseRequest;
}

/** 次に承認すべき人の社員コード。承認待ちでなければ null。 */
export function nextApprover(req: ExpenseRequest): string | null {
  switch (req.status) {
    case 'submitted':
      return req.route.first || null;
    case 'approved_1':
      return req.route.second ?? req.route.final ?? null;
    case 'approved_2':
      return req.route.final || null;
    default:
      return null;
  }
}

export function submitRequest(id: string): TransitionResult {
  const req = findRequest(id);
  if (!req) return { ok: false, message: `申請 ${id} が見つかりません。` };
  if (req.status !== 'draft' && req.status !== 'rejected') {
    return { ok: false, message: `申請 ${id} は「${req.status}」のため申請できません（起票中/差戻しのみ可）。` };
  }
  const violations = validateRequest(req);
  if (violations.length > 0) {
    return {
      ok: false,
      message: `規程違反が ${violations.length} 件あるため申請できません: ${violations
        .map((x) => `${x.rule}(${x.location})`)
        .join(', ')}`,
    };
  }
  const now = new Date().toISOString();
  const next: ExpenseRequest = {
    ...req,
    status: 'submitted',
    history: [...req.history, { at: now, actor: req.applicantId, action: '申請', note: '' }],
    updatedAt: now,
  };
  replaceRequest(id, next);
  return { ok: true, message: `${id} を申請しました。次の承認者は ${next.route.first} です。`, request: next };
}

export function approveRequest(
  id: string,
  actorId: string,
  decision: 'approve' | 'reject',
  note = '',
): TransitionResult {
  const req = findRequest(id);
  if (!req) return { ok: false, message: `申請 ${id} が見つかりません。` };

  const expected = nextApprover(req);
  if (!expected) {
    return { ok: false, message: `申請 ${id} は「${req.status}」のため承認操作できません。` };
  }
  if (expected !== actorId) {
    return { ok: false, message: `申請 ${id} の現在の承認者は ${expected} です（${actorId} は承認できません）。` };
  }

  const now = new Date().toISOString();

  if (decision === 'reject') {
    const next: ExpenseRequest = {
      ...req,
      status: 'rejected',
      history: [...req.history, { at: now, actor: actorId, action: '差戻し', note }],
      updatedAt: now,
    };
    replaceRequest(id, next);
    return { ok: true, message: `${id} を差し戻しました。`, request: next };
  }

  let status: RequestStatus;
  let action: string;
  if (req.status === 'submitted') {
    status = req.route.second ? 'approved_1' : 'approved_2';
    action = '1次承認';
  } else if (req.status === 'approved_1') {
    status = 'approved_2';
    action = '2次承認';
  } else {
    status = 'approved';
    action = '最終承認';
  }

  const next: ExpenseRequest = {
    ...req,
    status,
    history: [...req.history, { at: now, actor: actorId, action, note }],
    updatedAt: now,
  };
  replaceRequest(id, next);
  const after = nextApprover(next);
  return {
    ok: true,
    message: `${id} を${action}しました。${after ? `次の承認者は ${after} です。` : '最終承認まで完了しました。'}`,
    request: next,
  };
}

export interface CloseResult {
  ok: boolean;
  message: string;
  period: string;
  closedIds: string[];
  skipped: Array<{ id: string; status: RequestStatus; reason: string }>;
  totalJpy: number;
  totalTax: number;
  byDept: Array<{ dept: string; count: number; amountJpy: number }>;
  byMajor: Array<{ major: string; count: number; amountJpy: number }>;
}

/** 月次締め。最終承認済のものだけを締める。 */
export function runMonthEndClose(period: string): CloseResult {
  const targets = state.requests.filter((r) => r.period === period);
  const closable = targets.filter((r) => r.status === 'approved');
  const skipped = targets
    .filter((r) => r.status !== 'approved' && r.status !== 'closed')
    .map((r) => ({ id: r.id, status: r.status, reason: '最終承認が完了していません' }));

  const now = new Date().toISOString();
  const closedIds = closable.map((r) => r.id);

  if (closedIds.length > 0) {
    setState((s) => ({
      ...s,
      requests: s.requests.map((r) =>
        closedIds.includes(r.id)
          ? {
              ...r,
              status: 'closed' as RequestStatus,
              history: [...r.history, { at: now, actor: 'SYSTEM', action: '月次締め', note: `${period} 締め処理` }],
              updatedAt: now,
            }
          : r,
      ),
    }));
  }

  const deptMap = new Map<string, { count: number; amountJpy: number }>();
  const majorMap = new Map<string, { count: number; amountJpy: number }>();
  let totalJpy = 0;
  let totalTax = 0;

  for (const r of closable) {
    const t = computeTotals(r.lines);
    totalJpy += t.amountJpy;
    totalTax += t.taxAmount;
    const dkey = `${r.divisionCode}-${r.deptCode}-${r.sectionCode}`;
    const d = deptMap.get(dkey) ?? { count: 0, amountJpy: 0 };
    deptMap.set(dkey, { count: d.count + 1, amountJpy: d.amountJpy + t.amountJpy });
    for (const line of r.lines) {
      const m = majorMap.get(line.majorCode) ?? { count: 0, amountJpy: 0 };
      majorMap.set(line.majorCode, { count: m.count + 1, amountJpy: m.amountJpy + line.amountJpy });
    }
  }

  return {
    ok: true,
    message:
      closedIds.length > 0
        ? `${period} の月次締めを実行しました（${closedIds.length} 件）。`
        : `${period} に締め対象（最終承認済）の申請はありませんでした。`,
    period,
    closedIds,
    skipped,
    totalJpy,
    totalTax,
    byDept: [...deptMap.entries()].map(([dept, v]) => ({ dept, ...v })),
    byMajor: [...majorMap.entries()].map(([major, v]) => ({ major, ...v })),
  };
}

export function resetDemoData(mode: 'seed' | 'empty' = 'seed') {
  const base = initialState();
  setState(() => ({
    ...base,
    requests: mode === 'empty' ? [] : base.requests,
    seq: mode === 'empty' ? 1 : base.seq,
    hydrated: true,
  }));
}

// ---- ウィザード用ヘルパー ---------------------------------------------------

export function loadDraftFromRequest(id: string): boolean {
  const req = findRequest(id);
  if (!req) return false;
  setState((s) => ({
    ...s,
    draft: {
      editingId: req.id,
      title: req.title,
      applicantId: req.applicantId,
      divisionCode: req.divisionCode,
      deptCode: req.deptCode,
      sectionCode: req.sectionCode,
      period: req.period,
      lines: req.lines.map((l) => ({ ...l })),
      attachmentB: req.attachmentB ? { ...req.attachmentB } : null,
      route: { ...req.route },
    },
    ui: { ...s.ui, view: 'entry', wizardStep: 1, activeRequestId: req.id },
  }));
  return true;
}

/** ウィザードの入力内容を保存する（新規なら作成、編集中なら上書き）。 */
export function saveDraft(): { id: string; violations: RuleViolation[] } {
  const d = state.draft;
  const now = new Date().toISOString();

  if (d.editingId) {
    const existing = findRequest(d.editingId);
    if (existing) {
      const next: ExpenseRequest = {
        ...existing,
        title: d.title,
        applicantId: d.applicantId,
        divisionCode: d.divisionCode,
        deptCode: d.deptCode,
        sectionCode: d.sectionCode,
        period: d.period,
        lines: d.lines.map((l, i) => ({ ...l, lineNo: i + 1 })),
        attachmentB: d.attachmentB,
        route: d.route,
        updatedAt: now,
      };
      replaceRequest(d.editingId, next);
      return { id: d.editingId, violations: validateRequest(next) };
    }
  }

  const id = nextId();
  const req: ExpenseRequest = {
    id,
    title: d.title,
    applicantId: d.applicantId,
    divisionCode: d.divisionCode,
    deptCode: d.deptCode,
    sectionCode: d.sectionCode,
    period: d.period,
    lines: d.lines.map((l, i) => ({ ...l, lineNo: i + 1 })),
    attachmentB: d.attachmentB,
    route: d.route,
    status: 'draft',
    history: [{ at: now, actor: d.applicantId || 'UNKNOWN', action: '起票', note: '画面入力' }],
    createdAt: now,
    updatedAt: now,
  };
  setState((s) => ({
    ...s,
    requests: [...s.requests, req],
    seq: s.seq + 1,
    draft: { ...s.draft, editingId: id },
  }));
  return { id, violations: validateRequest(req) };
}
