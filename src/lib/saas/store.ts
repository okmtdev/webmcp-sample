// WebMCP サンプル SaaS — アプリケーション状態
//
// React の外（MiiTel MCP ツール）からも同じ状態を触れるように、
// useSyncExternalStore で購読できる素の Observable ストアとして実装する。
// 永続化は localStorage のみ（サーバは存在しない）。

import { PLAN, defaultUserSettings, templateSettingsOf } from './masters';
import {
  applyTemplateToUser,
  checkAdminLimit,
  checkSeatLimit,
  mergeSettings,
  validateNewUser,
  validateSettings,
} from './rules';
import type { NewUserInput, SettingsPatch } from './rules';
import type { Role, User, UserSettings, UserStatus, ValidationError } from './types';

export const STORAGE_KEY = 'wmsaas.v1';

export type ViewName = 'users' | 'user' | 'audit' | 'mcp';

export interface UiState {
  view: ViewName;
  selectedUserId: string | null;
  query: string;
  filterDept: string;
  filterRole: string;
  filterStatus: string;
  page: number;
  addOpen: boolean;
}

export interface AppState {
  users: User[];
  seq: number;
  ui: UiState;
  hydrated: boolean;
}

// ---- 初期データ -------------------------------------------------------------

const SEED_AT = '2026-07-01T00:00:00.000Z';

function compliantSettings(departmentId: string, email: string): UserSettings {
  const t = templateSettingsOf(departmentId)!;
  return { ...t, notifications: { ...t.notifications }, notifyEmail: email };
}

function seedUsers(): User[] {
  const mk = (
    id: string,
    email: string,
    name: string,
    role: Role,
    departmentId: string,
    status: UserStatus,
    settings: UserSettings,
  ): User => ({ id, email, name, role, departmentId, status, settings, createdAt: SEED_AT, updatedAt: SEED_AT });

  // 設定済みの人と、設定が漏れている人を混ぜておく（miitel_audit_settings のデモ用）。
  const partialSupport = defaultUserSettings();
  partialSupport.notifyEmail = 'eguchi@example.co.jp';
  partialSupport.notifications.emailMention = true;
  partialSupport.notifications.pushMention = true;
  partialSupport.dataRetentionDays = 180;

  const partialDev = compliantSettings('dev', 'kuwahara@example.co.jp');
  partialDev.twoFactorRequired = false;
  partialDev.dataRetentionDays = 30;

  return [
    mk('U-0001', 'tamura@example.co.jp', '田村 佳奈', 'admin', 'corp', 'active', compliantSettings('corp', 'tamura@example.co.jp')),
    mk('U-0002', 'omori@example.co.jp', '大森 亮', 'manager', 'sales', 'active', compliantSettings('sales', 'omori@example.co.jp')),
    mk('U-0003', 'nishino@example.co.jp', '西野 早苗', 'member', 'sales', 'active', defaultUserSettings()),
    mk('U-0004', 'eguchi@example.co.jp', '江口 拓海', 'member', 'support', 'active', partialSupport),
    mk('U-0005', 'kuwahara@example.co.jp', '桑原 直', 'member', 'dev', 'active', partialDev),
    mk('U-0006', 'fujii@example.co.jp', '藤井 みなみ', 'viewer', 'cs', 'invited', defaultUserSettings()),
  ];
}

function initialState(): AppState {
  return {
    users: seedUsers(),
    seq: 7,
    ui: {
      view: 'users',
      selectedUserId: null,
      query: '',
      filterDept: 'ALL',
      filterRole: 'ALL',
      filterStatus: 'ALL',
      page: 1,
      addOpen: false,
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
  return () => {
    listeners.delete(listener);
  };
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

// ---- 永続化 -----------------------------------------------------------------

interface PersistedShape {
  users: User[];
  seq: number;
}

function saveToStorage() {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedShape = { users: state.users, seq: state.seq };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage が使えない環境ではメモリ上のみで動作する。
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
  state = {
    ...base,
    users: Array.isArray(restored?.users) ? restored!.users : base.users,
    seq: typeof restored?.seq === 'number' ? restored!.seq : base.seq,
    hydrated: true,
  };
  emit();
}

// ---- 参照 -------------------------------------------------------------------

export function findUser(id: string): User | undefined {
  return state.users.find((u) => u.id === id);
}

export function findUserByEmail(email: string): User | undefined {
  const lower = email.trim().toLowerCase();
  return state.users.find((u) => u.email.toLowerCase() === lower);
}

/** id またはメールアドレスでユーザーを引く。ツールは両方受け付ける。 */
export function resolveUser(idOrEmail: string): User | undefined {
  return findUser(idOrEmail) ?? findUserByEmail(idOrEmail);
}

function nextId(seq: number): string {
  return `U-${String(seq).padStart(4, '0')}`;
}

// ---- ユーザー作成 -----------------------------------------------------------

export interface CreateResult {
  ok: boolean;
  users: User[];
  errors: Array<{ index: number; email: string; errors: ValidationError[] }>;
}

export interface CreateUserOptions {
  /** true なら作成時に所属部署の推奨設定を適用する（既定 false = 画面と同じ全OFF） */
  applyDepartmentTemplate?: boolean;
  /** 作成時の状態。既定は invited。 */
  status?: UserStatus;
}

/**
 * ユーザーをまとめて作成する。1件だけ渡せば画面の「ユーザーを追加」と同じ挙動になる。
 *
 * 全件を先に検証し、1件でも不正なら何も作成しない（部分的に作られた状態を残さないため）。
 * バッチ内でのメールアドレス重複も検出する。
 */
export function createUsers(inputs: NewUserInput[], options: CreateUserOptions = {}): CreateResult {
  const errors: CreateResult['errors'] = [];
  const provisional: User[] = [];
  const now = new Date().toISOString();
  let seq = state.seq;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    // すでに登録済み ＋ このバッチで先に作られる分、の両方に対して重複チェックする。
    const against = [...state.users, ...provisional];
    const itemErrors = validateNewUser(input, against);
    if (itemErrors.length > 0) {
      errors.push({ index: i, email: input.email ?? '', errors: itemErrors });
      continue;
    }
    const id = nextId(seq++);
    const email = input.email.trim().toLowerCase();
    const departmentId = input.departmentId;
    const base: User = {
      id,
      email,
      name: input.name.trim(),
      role: input.role as Role,
      departmentId,
      status: options.status ?? 'invited',
      settings: defaultUserSettings(),
      createdAt: now,
      updatedAt: now,
    };
    if (options.applyDepartmentTemplate) {
      base.settings = applyTemplateToUser(base) ?? base.settings;
    }
    provisional.push(base);
  }

  // 席数・管理者上限は「バッチ全体」で判定する。
  const seatError = checkSeatLimit(state.users, provisional.length);
  if (seatError && provisional.length > 0) {
    errors.push({ index: -1, email: '', errors: [seatError] });
  }
  const addingAdmins = provisional.filter((u) => u.role === 'admin').length;
  if (addingAdmins > 0) {
    const adminError = checkAdminLimit(state.users, addingAdmins);
    if (adminError) errors.push({ index: -1, email: '', errors: [adminError] });
  }

  if (errors.length > 0) {
    return { ok: false, users: [], errors };
  }

  setState((s) => ({ ...s, users: [...s.users, ...provisional], seq }));
  return { ok: true, users: provisional, errors: [] };
}

// ---- プロフィール更新 -------------------------------------------------------

export interface UpdateResult {
  ok: boolean;
  message: string;
  user?: User;
  errors?: ValidationError[];
}

export function updateUserProfile(
  id: string,
  patch: { name?: string; role?: string; departmentId?: string },
): UpdateResult {
  const user = resolveUser(id);
  if (!user) return { ok: false, message: `ユーザー ${id} が見つかりません。` };

  const next: User = { ...user };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.role !== undefined) next.role = patch.role as Role;
  if (patch.departmentId !== undefined) next.departmentId = patch.departmentId;

  const errors = validateNewUser(
    { email: next.email, name: next.name, role: next.role, departmentId: next.departmentId },
    state.users.filter((u) => u.id !== user.id),
  );
  if (errors.length > 0) return { ok: false, message: '入力内容に問題があります。', errors };

  if (next.role === 'admin' && user.role !== 'admin') {
    const adminError = checkAdminLimit(state.users, 1, user.id);
    if (adminError) return { ok: false, message: adminError.message, errors: [adminError] };
  }

  next.updatedAt = new Date().toISOString();
  setState((s) => ({ ...s, users: s.users.map((u) => (u.id === user.id ? next : u)) }));
  return { ok: true, message: `${next.id} のプロフィールを更新しました。`, user: next };
}

export function setUserStatus(id: string, status: UserStatus): UpdateResult {
  const user = resolveUser(id);
  if (!user) return { ok: false, message: `ユーザー ${id} が見つかりません。` };
  if (user.status === status) return { ok: true, message: `${user.id} はすでに「${status}」です。`, user };

  if (status !== 'suspended' && user.status === 'suspended') {
    const seatError = checkSeatLimit(state.users, 1);
    if (seatError) return { ok: false, message: seatError.message, errors: [seatError] };
  }

  const next: User = { ...user, status, updatedAt: new Date().toISOString() };
  setState((s) => ({ ...s, users: s.users.map((u) => (u.id === user.id ? next : u)) }));
  return { ok: true, message: `${user.id} の状態を「${status}」にしました。`, user: next };
}

// ---- 設定更新 ---------------------------------------------------------------

export function setUserSettings(id: string, settings: UserSettings): UpdateResult {
  const user = resolveUser(id);
  if (!user) return { ok: false, message: `ユーザー ${id} が見つかりません。` };

  const errors = validateSettings(settings);
  if (errors.length > 0) return { ok: false, message: '設定内容に問題があります。', errors, user };

  const next: User = { ...user, settings, updatedAt: new Date().toISOString() };
  setState((s) => ({ ...s, users: s.users.map((u) => (u.id === user.id ? next : u)) }));
  return { ok: true, message: `${user.id} の設定を保存しました。`, user: next };
}

export function patchUserSettings(id: string, patch: SettingsPatch): UpdateResult {
  const user = resolveUser(id);
  if (!user) return { ok: false, message: `ユーザー ${id} が見つかりません。` };
  return setUserSettings(user.id, mergeSettings(user.settings, patch));
}

export interface BulkOutcome {
  userId: string;
  email: string;
  ok: boolean;
  message: string;
  changed: number;
}

/**
 * 複数ユーザーの設定をまとめて更新する。
 *
 * この操作に対応する画面は存在しない（管理画面は1人ずつしか保存できない）。
 * WebMCP はこうした「UI にはないがドメイン上は自然な操作」を公開できる。
 */
export function bulkPatchSettings(ids: string[], patch: SettingsPatch): BulkOutcome[] {
  const outcomes: BulkOutcome[] = [];
  for (const id of ids) {
    const before = resolveUser(id);
    if (!before) {
      outcomes.push({ userId: id, email: '', ok: false, message: 'ユーザーが見つかりません。', changed: 0 });
      continue;
    }
    const merged = mergeSettings(before.settings, patch);
    const changed = countChanges(before.settings, merged);
    const result = patchUserSettings(before.id, patch);
    outcomes.push({
      userId: before.id,
      email: before.email,
      ok: result.ok,
      message: result.ok ? result.message : `${result.message} ${(result.errors ?? []).map((e) => e.message).join(' / ')}`,
      changed: result.ok ? changed : 0,
    });
  }
  return outcomes;
}

/** 所属部署の推奨設定を複数ユーザーに適用する。 */
export function bulkApplyTemplate(ids: string[]): BulkOutcome[] {
  const outcomes: BulkOutcome[] = [];
  for (const id of ids) {
    const user = resolveUser(id);
    if (!user) {
      outcomes.push({ userId: id, email: '', ok: false, message: 'ユーザーが見つかりません。', changed: 0 });
      continue;
    }
    const settings = applyTemplateToUser(user);
    if (!settings) {
      outcomes.push({
        userId: user.id,
        email: user.email,
        ok: false,
        message: `部署 ${user.departmentId} には推奨設定テンプレートがありません。`,
        changed: 0,
      });
      continue;
    }
    const changed = countChanges(user.settings, settings);
    const result = setUserSettings(user.id, settings);
    outcomes.push({
      userId: user.id,
      email: user.email,
      ok: result.ok,
      message: result.ok ? `推奨設定を適用しました（変更 ${changed} 項目）。` : result.message,
      changed: result.ok ? changed : 0,
    });
  }
  return outcomes;
}

function countChanges(before: UserSettings, after: UserSettings): number {
  let n = 0;
  const keys = Object.keys(before.notifications) as Array<keyof UserSettings['notifications']>;
  for (const k of keys) if (before.notifications[k] !== after.notifications[k]) n++;
  if (before.notifyEmail !== after.notifyEmail) n++;
  if (before.dailySummaryTime !== after.dailySummaryTime) n++;
  if (before.timezone !== after.timezone) n++;
  if (before.language !== after.language) n++;
  if (before.slackChannel !== after.slackChannel) n++;
  if (before.twoFactorRequired !== after.twoFactorRequired) n++;
  if (before.dataRetentionDays !== after.dataRetentionDays) n++;
  return n;
}

// ---- デモデータ -------------------------------------------------------------

export function resetDemoData(mode: 'seed' | 'empty' = 'seed') {
  const base = initialState();
  setState(() => ({
    ...base,
    users: mode === 'empty' ? [] : base.users,
    seq: mode === 'empty' ? 1 : base.seq,
    hydrated: true,
  }));
}

/** 席数の使用状況。停止中は席を消費しない。 */
export function seatUsage(): { used: number; limit: number; admins: number; adminLimit: number } {
  const used = state.users.filter((u) => u.status !== 'suspended').length;
  const admins = state.users.filter((u) => u.role === 'admin').length;
  return { used, limit: PLAN.seatLimit, admins, adminLimit: PLAN.adminLimit };
}
