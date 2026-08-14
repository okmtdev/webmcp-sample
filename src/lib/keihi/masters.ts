// スーパーややこしいシステム v.1.0.0 — マスタ定義（社内規程 第4章 別表）
//
// このファイルの内容が「人間がUIで手作業するときに何度も引き直すことになる表」です。
// WebMCP ツールからは list_master_codes / get_system_manual で機械可読な形で取得できます。

import type {
  ApprovalBandRule,
  Department,
  Division,
  Employee,
  FxRate,
  MajorCategory,
  MiddleCategory,
  MinorCategory,
  Section,
  TaxCategory,
} from './types';

/**
 * システム基準日。
 * デモの再現性を保つため実時刻ではなく固定値を使う（規程 R03 の未来日判定に使用）。
 */
export const SYSTEM_TODAY = '2026-08-20';

/** 既定の会計期間。 */
export const DEFAULT_PERIOD = '2026-08';

/** 選択可能な会計期間。 */
export const PERIODS = ['2026-07', '2026-08', '2026-09'] as const;

export const DIVISIONS: Division[] = [
  { code: '10', name: '営業本部' },
  { code: '20', name: '開発本部' },
  { code: '30', name: '管理本部' },
];

export const DEPARTMENTS: Department[] = [
  { code: '201', divisionCode: '10', name: '第一営業部' },
  { code: '202', divisionCode: '10', name: '第二営業部' },
  { code: '203', divisionCode: '10', name: '海外営業部' },
  { code: '301', divisionCode: '20', name: 'プロダクト開発部' },
  { code: '302', divisionCode: '20', name: '基盤技術部' },
  { code: '401', divisionCode: '30', name: '経営管理部' },
  { code: '402', divisionCode: '30', name: '人事総務部' },
];

// 課コードは連番ではない（欠番あり）。UI 上ではこれが地味に効く。
export const SECTIONS: Section[] = [
  { code: '01', deptCode: '201', name: '法人一課' },
  { code: '02', deptCode: '201', name: '法人二課' },
  { code: '01', deptCode: '202', name: '代理店課' },
  { code: '03', deptCode: '202', name: 'パートナー課' },
  { code: '01', deptCode: '203', name: 'APAC課' },
  { code: '02', deptCode: '203', name: 'EMEA課' },
  { code: '01', deptCode: '301', name: 'フロントエンド課' },
  { code: '02', deptCode: '301', name: 'バックエンド課' },
  { code: '01', deptCode: '302', name: 'SRE課' },
  { code: '05', deptCode: '302', name: 'データ基盤課' },
  { code: '01', deptCode: '401', name: '財務課' },
  { code: '02', deptCode: '401', name: '経理課' },
  { code: '01', deptCode: '402', name: '人事課' },
  { code: '04', deptCode: '402', name: '総務課' },
];

/** 部長は課コード 00、本部長は部コード 000・課コード 00 に所属する。 */
export const EMPLOYEES: Employee[] = [
  { id: 'E1001', name: '佐藤 太郎', kana: 'サトウ タロウ', role: 'STAFF', divisionCode: '10', deptCode: '201', sectionCode: '01' },
  { id: 'E1002', name: '鈴木 花子', kana: 'スズキ ハナコ', role: 'MANAGER', divisionCode: '10', deptCode: '201', sectionCode: '01' },
  { id: 'E1003', name: '田中 健一', kana: 'タナカ ケンイチ', role: 'DIRECTOR', divisionCode: '10', deptCode: '201', sectionCode: '00' },
  { id: 'E1004', name: '伊藤 美咲', kana: 'イトウ ミサキ', role: 'STAFF', divisionCode: '10', deptCode: '203', sectionCode: '02' },
  { id: 'E1005', name: '渡辺 剛', kana: 'ワタナベ ツヨシ', role: 'MANAGER', divisionCode: '10', deptCode: '203', sectionCode: '02' },
  { id: 'E1006', name: '山本 裕子', kana: 'ヤマモト ユウコ', role: 'DIRECTOR', divisionCode: '10', deptCode: '203', sectionCode: '00' },
  { id: 'E1007', name: '中村 隆', kana: 'ナカムラ タカシ', role: 'EXECUTIVE', divisionCode: '10', deptCode: '000', sectionCode: '00' },
  { id: 'E2001', name: '小林 誠', kana: 'コバヤシ マコト', role: 'STAFF', divisionCode: '20', deptCode: '301', sectionCode: '02' },
  { id: 'E2002', name: '加藤 直樹', kana: 'カトウ ナオキ', role: 'MANAGER', divisionCode: '20', deptCode: '301', sectionCode: '02' },
  { id: 'E2003', name: '吉田 彩', kana: 'ヨシダ アヤ', role: 'DIRECTOR', divisionCode: '20', deptCode: '301', sectionCode: '00' },
  { id: 'E2004', name: '山田 修', kana: 'ヤマダ オサム', role: 'EXECUTIVE', divisionCode: '20', deptCode: '000', sectionCode: '00' },
  { id: 'E3001', name: '佐々木 亮', kana: 'ササキ リョウ', role: 'FINANCE', divisionCode: '30', deptCode: '401', sectionCode: '02' },
  { id: 'E3002', name: '松本 和也', kana: 'マツモト カズヤ', role: 'CFO', divisionCode: '30', deptCode: '000', sectionCode: '00' },
];

export const MAJOR_CATEGORIES: MajorCategory[] = [
  { code: 'TRV', name: '旅費交通費', note: '出張・移動に係る費用。プロジェクトコード必須の小分類を含む。' },
  { code: 'MTG', name: '会議費', note: '軽減税率(T08)を適用できる唯一の大分類。' },
  { code: 'SUP', name: '消耗品費', note: '単価上限に注意。' },
  { code: 'OUT', name: '外注費', note: '金額が大きくなりやすくD区分に入りやすい。' },
  { code: 'EDU', name: '研修費', note: '海外セミナーは海外区分。' },
];

export const MIDDLE_CATEGORIES: MiddleCategory[] = [
  { code: 'TRV-AIR', majorCode: 'TRV', name: '航空賃' },
  { code: 'TRV-RAI', majorCode: 'TRV', name: '鉄道賃' },
  { code: 'TRV-HTL', majorCode: 'TRV', name: '宿泊費' },
  { code: 'TRV-TAX', majorCode: 'TRV', name: 'タクシー代' },
  { code: 'MTG-MEAL', majorCode: 'MTG', name: '会議飲食費' },
  { code: 'MTG-ROOM', majorCode: 'MTG', name: '会議室費' },
  { code: 'SUP-OFF', majorCode: 'SUP', name: '事務用品' },
  { code: 'SUP-PC', majorCode: 'SUP', name: 'PC周辺機器' },
  { code: 'OUT-DEV', majorCode: 'OUT', name: '開発外注' },
  { code: 'OUT-DSG', majorCode: 'OUT', name: 'デザイン外注' },
  { code: 'EDU-SEM', majorCode: 'EDU', name: 'セミナー参加費' },
  { code: 'EDU-BOOK', majorCode: 'EDU', name: '図書費' },
];

export const MINOR_CATEGORIES: MinorCategory[] = [
  { code: 'TRV-AIR-DOM', middleCode: 'TRV-AIR', name: '国内線', defaultTaxCategory: 'T10', unitLimitJpy: 120000, requiresProject: true, overseas: false },
  { code: 'TRV-AIR-INT', middleCode: 'TRV-AIR', name: '国際線', defaultTaxCategory: 'TEX', unitLimitJpy: null, requiresProject: true, overseas: true },
  { code: 'TRV-RAI-EXP', middleCode: 'TRV-RAI', name: '特急・新幹線', defaultTaxCategory: 'T10', unitLimitJpy: 60000, requiresProject: true, overseas: false },
  { code: 'TRV-RAI-LOC', middleCode: 'TRV-RAI', name: '在来線', defaultTaxCategory: 'T10', unitLimitJpy: 5000, requiresProject: false, overseas: false },
  { code: 'TRV-HTL-DOM', middleCode: 'TRV-HTL', name: '国内宿泊', defaultTaxCategory: 'T10', unitLimitJpy: 18000, requiresProject: true, overseas: false },
  { code: 'TRV-HTL-INT', middleCode: 'TRV-HTL', name: '海外宿泊', defaultTaxCategory: 'TEX', unitLimitJpy: null, requiresProject: true, overseas: true },
  { code: 'TRV-TAX-STD', middleCode: 'TRV-TAX', name: '通常タクシー', defaultTaxCategory: 'T10', unitLimitJpy: 15000, requiresProject: false, overseas: false },
  { code: 'TRV-TAX-LTE', middleCode: 'TRV-TAX', name: '深夜早朝タクシー', defaultTaxCategory: 'T10', unitLimitJpy: 25000, requiresProject: false, overseas: false },
  { code: 'MTG-MEAL-IN', middleCode: 'MTG-MEAL', name: '社内会議飲食', defaultTaxCategory: 'T08', unitLimitJpy: 3000, requiresProject: false, overseas: false },
  { code: 'MTG-MEAL-EX', middleCode: 'MTG-MEAL', name: '社外会議飲食', defaultTaxCategory: 'T08', unitLimitJpy: 10000, requiresProject: false, overseas: false },
  { code: 'MTG-ROOM-EXT', middleCode: 'MTG-ROOM', name: '外部会議室', defaultTaxCategory: 'T10', unitLimitJpy: 50000, requiresProject: false, overseas: false },
  { code: 'SUP-OFF-STD', middleCode: 'SUP-OFF', name: '標準事務用品', defaultTaxCategory: 'T10', unitLimitJpy: 30000, requiresProject: false, overseas: false },
  { code: 'SUP-PC-ACC', middleCode: 'SUP-PC', name: 'PC周辺機器(1万円未満)', defaultTaxCategory: 'T10', unitLimitJpy: 9999, requiresProject: false, overseas: false },
  { code: 'SUP-PC-DEV', middleCode: 'SUP-PC', name: 'PC周辺機器(1万円以上)', defaultTaxCategory: 'T10', unitLimitJpy: 200000, requiresProject: true, overseas: false },
  { code: 'OUT-DEV-ONS', middleCode: 'OUT-DEV', name: '常駐開発', defaultTaxCategory: 'T10', unitLimitJpy: null, requiresProject: true, overseas: false },
  { code: 'OUT-DEV-OFF', middleCode: 'OUT-DEV', name: '受託開発', defaultTaxCategory: 'T10', unitLimitJpy: null, requiresProject: true, overseas: false },
  { code: 'OUT-DSG-UI', middleCode: 'OUT-DSG', name: 'UIデザイン', defaultTaxCategory: 'T10', unitLimitJpy: 500000, requiresProject: true, overseas: false },
  { code: 'EDU-SEM-DOM', middleCode: 'EDU-SEM', name: '国内セミナー', defaultTaxCategory: 'T10', unitLimitJpy: 80000, requiresProject: false, overseas: false },
  { code: 'EDU-SEM-INT', middleCode: 'EDU-SEM', name: '海外セミナー', defaultTaxCategory: 'TEX', unitLimitJpy: null, requiresProject: true, overseas: true },
  { code: 'EDU-BOOK-TEC', middleCode: 'EDU-BOOK', name: '技術書籍', defaultTaxCategory: 'T10', unitLimitJpy: 12000, requiresProject: false, overseas: false },
];

export const CURRENCIES = ['JPY', 'USD', 'EUR', 'GBP'] as const;

/** 会計期間ごとの社内換算レート。1円未満まで一致していないと規程 R04 で弾かれる。 */
export const FX_RATES: FxRate[] = [
  { period: '2026-07', currency: 'USD', rate: 152.3 },
  { period: '2026-07', currency: 'EUR', rate: 165.8 },
  { period: '2026-07', currency: 'GBP', rate: 193.4 },
  { period: '2026-08', currency: 'USD', rate: 149.75 },
  { period: '2026-08', currency: 'EUR', rate: 168.2 },
  { period: '2026-08', currency: 'GBP', rate: 190.1 },
  { period: '2026-09', currency: 'USD', rate: 151.05 },
  { period: '2026-09', currency: 'EUR', rate: 166.45 },
  { period: '2026-09', currency: 'GBP', rate: 192.75 },
];

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  T10: '課税10%（内税）',
  T08: '軽減8%（内税）',
  TEX: '非課税',
  TNA: '対象外',
};

/** 税率（内税）。TEX / TNA は 0。 */
export const TAX_RATES: Record<TaxCategory, number> = {
  T10: 10,
  T08: 8,
  TEX: 0,
  TNA: 0,
};

/** 承認マトリクス（社内規程 第4章 別表3）。合計金額の区分で承認者ロールが決まる。 */
export const APPROVAL_MATRIX: ApprovalBandRule[] = [
  { band: 'A', minJpy: 0, maxJpy: 10000, first: 'MANAGER', second: null, final: 'DIRECTOR', requiresAttachmentB: false, requiresPreApproval: false },
  { band: 'B', minJpy: 10000, maxJpy: 50000, first: 'MANAGER', second: 'DIRECTOR', final: 'EXECUTIVE', requiresAttachmentB: false, requiresPreApproval: false },
  { band: 'C', minJpy: 50000, maxJpy: 300000, first: 'MANAGER', second: 'DIRECTOR', final: 'EXECUTIVE', requiresAttachmentB: true, requiresPreApproval: true },
  { band: 'D', minJpy: 300000, maxJpy: null, first: 'DIRECTOR', second: 'EXECUTIVE', final: 'CFO', requiresAttachmentB: true, requiresPreApproval: true },
];

export const ROLE_LABELS: Record<string, string> = {
  STAFF: '一般',
  MANAGER: '課長',
  DIRECTOR: '部長',
  EXECUTIVE: '本部長',
  FINANCE: '経理担当',
  CFO: 'CFO',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: '起票中',
  submitted: '申請済（1次承認待ち）',
  approved_1: '1次承認済（2次承認待ち）',
  approved_2: '2次承認済（最終承認待ち）',
  approved: '最終承認済',
  rejected: '差戻し',
  closed: '月次締め済',
};

// ---- 参照ヘルパー -----------------------------------------------------------

export function findDivision(code: string): Division | undefined {
  return DIVISIONS.find((d) => d.code === code);
}

export function findDepartment(code: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.code === code);
}

export function findSection(deptCode: string, code: string): Section | undefined {
  return SECTIONS.find((s) => s.deptCode === deptCode && s.code === code);
}

export function findEmployee(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id);
}

export function findMinor(code: string): MinorCategory | undefined {
  return MINOR_CATEGORIES.find((m) => m.code === code);
}

export function findMiddle(code: string): MiddleCategory | undefined {
  return MIDDLE_CATEGORIES.find((m) => m.code === code);
}

export function findMajor(code: string): MajorCategory | undefined {
  return MAJOR_CATEGORIES.find((m) => m.code === code);
}

export function findFxRate(period: string, currency: string): number | undefined {
  if (currency === 'JPY') return 1;
  return FX_RATES.find((r) => r.period === period && r.currency === currency)?.rate;
}

export function departmentsOf(divisionCode: string): Department[] {
  return DEPARTMENTS.filter((d) => d.divisionCode === divisionCode);
}

export function sectionsOf(deptCode: string): Section[] {
  return SECTIONS.filter((s) => s.deptCode === deptCode);
}

export function middlesOf(majorCode: string): MiddleCategory[] {
  return MIDDLE_CATEGORIES.filter((m) => m.majorCode === majorCode);
}

export function minorsOf(middleCode: string): MinorCategory[] {
  return MINOR_CATEGORIES.filter((m) => m.middleCode === middleCode);
}

/** "10-201-01" 形式の部門コード文字列。 */
export function formatDeptPath(divisionCode: string, deptCode: string, sectionCode: string): string {
  return `${divisionCode}-${deptCode}-${sectionCode}`;
}

export function describeDeptPath(divisionCode: string, deptCode: string, sectionCode: string): string {
  const dv = findDivision(divisionCode)?.name ?? '?';
  const dp = findDepartment(deptCode)?.name ?? '?';
  const sc = findSection(deptCode, sectionCode)?.name ?? (sectionCode === '00' ? '（部直轄）' : '?');
  return `${dv} / ${dp} / ${sc}`;
}
