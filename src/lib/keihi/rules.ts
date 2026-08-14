// スーパーややこしいシステム v.1.0.0 — 社内規程 第4章 検証ロジック
//
// R01〜R14 の 14 本の規程チェック。UI で手入力すると全部を人間が暗算・目視照合する羽目になる。
// WebMCP ツールはこの同じ関数を呼ぶので、エージェントは 1 回で正解にたどり着ける。

import {
  APPROVAL_MATRIX,
  EMPLOYEES,
  SYSTEM_TODAY,
  TAX_RATES,
  findDepartment,
  findDivision,
  findEmployee,
  findFxRate,
  findMiddle,
  findMinor,
  findSection,
} from './masters';
import type {
  AmountBand,
  ApprovalBandRule,
  ApprovalRoute,
  EmployeeRole,
  ExpenseLine,
  ExpenseRequest,
  RuleViolation,
  TaxCategory,
  Totals,
} from './types';

/** 円未満切り捨て。浮動小数の誤差で 1 円ずれないよう微小値を足してから切り捨てる。 */
export function floorYen(value: number): number {
  return Math.floor(value + 1e-9);
}

/** 外貨金額とレートから円換算額を求める（規程 R05）。 */
export function expectedAmountJpy(amountForeign: number, rateUsed: number): number {
  return floorYen(amountForeign * rateUsed);
}

/** 内税方式の消費税額を求める（規程 R06）。 */
export function expectedTaxAmount(amountJpy: number, taxCategory: TaxCategory): number {
  const rate = TAX_RATES[taxCategory] ?? 0;
  if (rate === 0) return 0;
  return floorYen((amountJpy * rate) / (100 + rate));
}

export function computeTotals(lines: ExpenseLine[]): Totals {
  const amountJpy = lines.reduce((sum, l) => sum + (Number(l.amountJpy) || 0), 0);
  const taxAmount = lines.reduce((sum, l) => sum + (Number(l.taxAmount) || 0), 0);
  return { amountJpy, taxAmount, lineCount: lines.length, band: bandOf(amountJpy) };
}

export function bandRuleOf(totalJpy: number): ApprovalBandRule {
  for (const rule of APPROVAL_MATRIX) {
    const okMin = totalJpy >= rule.minJpy;
    const okMax = rule.maxJpy === null || totalJpy < rule.maxJpy;
    if (okMin && okMax) return rule;
  }
  return APPROVAL_MATRIX[APPROVAL_MATRIX.length - 1];
}

export function bandOf(totalJpy: number): AmountBand {
  return bandRuleOf(totalJpy).band;
}

/** 明細に海外区分または外貨が含まれるか（最終承認者 CFO 格上げ条件）。 */
export function hasOverseasFactor(lines: ExpenseLine[]): boolean {
  return lines.some((l) => findMinor(l.minorCode)?.overseas === true || l.currency !== 'JPY');
}

// ---- 承認ルート導出 ---------------------------------------------------------

const ROLE_LADDER: EmployeeRole[] = ['MANAGER', 'DIRECTOR', 'EXECUTIVE', 'CFO'];

function escalateRole(role: EmployeeRole): EmployeeRole {
  const i = ROLE_LADDER.indexOf(role);
  if (i < 0 || i === ROLE_LADDER.length - 1) return 'CFO';
  return ROLE_LADDER[i + 1];
}

/** 申請者の所属を基準に、ロールから実在の承認者を引く。見つからなければ undefined。 */
function lookupApprover(
  role: EmployeeRole,
  ctx: { divisionCode: string; deptCode: string; sectionCode: string },
): string | undefined {
  switch (role) {
    case 'MANAGER':
      return EMPLOYEES.find(
        (e) =>
          e.role === 'MANAGER' &&
          e.divisionCode === ctx.divisionCode &&
          e.deptCode === ctx.deptCode &&
          e.sectionCode === ctx.sectionCode,
      )?.id;
    case 'DIRECTOR':
      return EMPLOYEES.find(
        (e) => e.role === 'DIRECTOR' && e.divisionCode === ctx.divisionCode && e.deptCode === ctx.deptCode,
      )?.id;
    case 'EXECUTIVE':
      return EMPLOYEES.find((e) => e.role === 'EXECUTIVE' && e.divisionCode === ctx.divisionCode)?.id;
    case 'CFO':
      return EMPLOYEES.find((e) => e.role === 'CFO')?.id;
    default:
      return undefined;
  }
}

export interface RouteDerivation {
  route: ApprovalRoute;
  band: AmountBand;
  totalJpy: number;
  overseasEscalation: boolean;
  steps: string[];
}

/**
 * 承認マトリクス（別表3）に基づいて承認ルートを導出する（規程 R12 の正解）。
 *
 * 導出の順序:
 *   1. 合計金額から区分 A/B/C/D を決める
 *   2. 区分ごとの 1次/2次/最終 のロールを引く
 *   3. 海外区分または外貨明細があれば最終承認者を CFO に格上げする
 *   4. ロールを申請者の所属に当てはめて実在の社員に解決する
 *   5. 解決先が申請者本人または既出の承認者と重複する場合は 1 段上位に繰り上げる
 */
export function deriveRoute(input: {
  applicantId: string;
  divisionCode: string;
  deptCode: string;
  sectionCode: string;
  lines: ExpenseLine[];
}): RouteDerivation {
  const totals = computeTotals(input.lines);
  const rule = bandRuleOf(totals.amountJpy);
  const overseas = hasOverseasFactor(input.lines);
  const steps: string[] = [];

  steps.push(`合計 ${totals.amountJpy.toLocaleString('ja-JP')} 円 → 区分 ${rule.band}`);

  const finalRole: EmployeeRole = overseas ? 'CFO' : rule.final;
  if (overseas && rule.final !== 'CFO') {
    steps.push(`海外区分または外貨明細を検出 → 最終承認者を ${rule.final} から CFO に格上げ`);
  }

  const ctx = {
    divisionCode: input.divisionCode,
    deptCode: input.deptCode,
    sectionCode: input.sectionCode,
  };
  const used = new Set<string>([input.applicantId]);

  const resolve = (role: EmployeeRole | null, label: string): string | null => {
    if (role === null) {
      steps.push(`${label}: 区分 ${rule.band} では不要`);
      return null;
    }
    let current = role;
    for (let i = 0; i < ROLE_LADDER.length + 1; i++) {
      const id = lookupApprover(current, ctx);
      if (id && !used.has(id)) {
        used.add(id);
        const emp = findEmployee(id);
        steps.push(`${label}: ${current} → ${id} ${emp ? emp.name : ''}`);
        return id;
      }
      const next = escalateRole(current);
      if (next === current) break;
      steps.push(`${label}: ${current} は不在または重複のため ${next} に繰り上げ`);
      current = next;
    }
    const fallback = lookupApprover('CFO', ctx) ?? 'E3002';
    used.add(fallback);
    steps.push(`${label}: 解決不能のため CFO(${fallback}) に確定`);
    return fallback;
  };

  const first = resolve(rule.first, '1次承認者') ?? 'E3002';
  const second = resolve(rule.second, '2次承認者');
  const final = resolve(finalRole, '最終承認者') ?? 'E3002';

  return {
    route: { first, second, final },
    band: rule.band,
    totalJpy: totals.amountJpy,
    overseasEscalation: overseas,
    steps,
  };
}

// ---- 検証 -------------------------------------------------------------------

const PROJECT_CODE_RE = /^PRJ-\d{4}$/;
const PRE_APPROVAL_RE = /^FIN-\d{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidatableRequest {
  title: string;
  applicantId: string;
  divisionCode: string;
  deptCode: string;
  sectionCode: string;
  period: string;
  lines: ExpenseLine[];
  attachmentB: ExpenseRequest['attachmentB'];
  route: ApprovalRoute;
}

/**
 * 規程 R01〜R14 を全件チェックする。
 * 違反は「どこが」「なぜ」「どう直すか」まで返すので、エージェントは 1 往復で修正できる。
 */
export function validateRequest(req: ValidatableRequest): RuleViolation[] {
  const v: RuleViolation[] = [];
  const push = (rule: string, location: string, message: string, hint: string) =>
    v.push({ rule, location, message, hint });

  // --- R13 / R14: 組織コード -------------------------------------------------
  const division = findDivision(req.divisionCode);
  const dept = findDepartment(req.deptCode);
  const section = findSection(req.deptCode, req.sectionCode);

  if (!division) {
    push('R14', '部門コード', `事業部コード ${req.divisionCode} はマスタに存在しません。`, '10 / 20 / 30 のいずれかを指定してください。');
  }
  if (!dept) {
    push('R14', '部門コード', `部コード ${req.deptCode} はマスタに存在しません。`, 'list_master_codes(kind="dept") で有効な部コードを取得してください。');
  } else if (division && dept.divisionCode !== req.divisionCode) {
    push('R14', '部門コード', `部 ${req.deptCode} は事業部 ${req.divisionCode} に属していません（正しくは ${dept.divisionCode}）。`, `事業部コードを ${dept.divisionCode} にするか、別の部を選んでください。`);
  }
  if (!section) {
    push('R14', '部門コード', `課コード ${req.sectionCode} は部 ${req.deptCode} に存在しません。`, '課コードは連番ではありません。list_master_codes(kind="dept") で実在の組み合わせを確認してください。');
  }

  const applicant = findEmployee(req.applicantId);
  if (!applicant) {
    push('R13', '申請者', `社員コード ${req.applicantId} はマスタに存在しません。`, 'list_master_codes(kind="employee") で有効な社員コードを取得してください。');
  } else {
    const same =
      applicant.divisionCode === req.divisionCode &&
      applicant.deptCode === req.deptCode &&
      applicant.sectionCode === req.sectionCode;
    if (!same) {
      push(
        'R13',
        '申請者',
        `申請者 ${req.applicantId} の所属は ${applicant.divisionCode}-${applicant.deptCode}-${applicant.sectionCode} ですが、申請の部門コードは ${req.divisionCode}-${req.deptCode}-${req.sectionCode} です。`,
        `部門コードを ${applicant.divisionCode}-${applicant.deptCode}-${applicant.sectionCode} に合わせてください。`,
      );
    }
  }

  if (!req.title || req.title.trim().length === 0) {
    push('R13', '件名', '件名が未入力です。', '30文字以内の件名を入力してください。');
  }

  // --- R10: 明細件数と重複 ---------------------------------------------------
  if (req.lines.length === 0) {
    push('R10', '明細', '明細が 1 件もありません。', '明細は 1〜5 件必要です。');
  }
  if (req.lines.length > 5) {
    push('R10', '明細', `明細が ${req.lines.length} 件あります。1 申請あたり最大 5 件です。`, '申請を分割してください。');
  }
  const seen = new Map<string, number>();
  req.lines.forEach((line, idx) => {
    const key = `${line.date}|${line.minorCode}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      push('R10', `明細 ${idx + 1}`, `明細 ${prev + 1} と日付・小分類が重複しています（${line.date} / ${line.minorCode}）。`, '日付を変えるか、金額を合算して 1 明細にまとめてください。');
    } else {
      seen.set(key, idx);
    }
  });

  // --- 明細単位のチェック ----------------------------------------------------
  req.lines.forEach((line, idx) => {
    const where = `明細 ${idx + 1}`;

    // R01: 費目コードの階層整合
    const minor = findMinor(line.minorCode);
    const middle = findMiddle(line.middleCode);
    if (!minor) {
      push('R01', where, `小分類コード ${line.minorCode} はマスタに存在しません。`, 'list_master_codes(kind="expense") で有効な小分類を取得してください。');
    } else if (minor.middleCode !== line.middleCode) {
      push('R01', where, `小分類 ${line.minorCode} は中分類 ${line.middleCode} の配下ではありません（正しくは ${minor.middleCode}）。`, `中分類を ${minor.middleCode} に修正してください。`);
    }
    if (!middle) {
      push('R01', where, `中分類コード ${line.middleCode} はマスタに存在しません。`, '中分類は「大分類-3文字」の形式です。');
    } else if (middle.majorCode !== line.majorCode) {
      push('R01', where, `中分類 ${line.middleCode} は大分類 ${line.majorCode} の配下ではありません（正しくは ${middle.majorCode}）。`, `大分類を ${middle.majorCode} に修正してください。`);
    }

    // R02: 日付が会計期間内
    if (!DATE_RE.test(line.date)) {
      push('R02', where, `日付 ${line.date} の形式が不正です。`, 'YYYY-MM-DD 形式で入力してください。');
    } else {
      if (line.date.slice(0, 7) !== req.period) {
        push('R02', where, `日付 ${line.date} が会計期間 ${req.period} の範囲外です。`, `${req.period}-01 〜 ${req.period}-31 の日付にしてください。`);
      }
      // R03: 未来日不可
      if (line.date > SYSTEM_TODAY) {
        push('R03', where, `日付 ${line.date} はシステム基準日 ${SYSTEM_TODAY} より未来です。`, `${SYSTEM_TODAY} 以前の日付にしてください。`);
      }
    }

    // R04: 為替レート
    const officialRate = findFxRate(req.period, line.currency);
    if (officialRate === undefined) {
      push('R04', where, `通貨 ${line.currency} の ${req.period} のレートがマスタにありません。`, 'JPY / USD / EUR / GBP のいずれかを使用してください。');
    } else if (line.rateUsed !== officialRate) {
      push('R04', where, `適用レート ${line.rateUsed} が ${req.period} の社内レート ${officialRate} と一致しません。`, `適用レートを ${officialRate} に修正してください。`);
    }

    // R05: 円換算額
    if (line.currency === 'JPY') {
      if (line.rateUsed !== 1) {
        push('R05', where, `通貨が JPY のとき適用レートは 1 でなければなりません（現在 ${line.rateUsed}）。`, '適用レートを 1 にしてください。');
      }
      if (line.amountJpy !== line.amountForeign) {
        push('R05', where, `通貨が JPY のとき原貨額 ${line.amountForeign} と円換算額 ${line.amountJpy} は一致しなければなりません。`, `円換算額を ${line.amountForeign} にしてください。`);
      }
    } else if (officialRate !== undefined) {
      const expected = expectedAmountJpy(line.amountForeign, line.rateUsed);
      if (line.amountJpy !== expected) {
        push('R05', where, `円換算額 ${line.amountJpy} が計算値と一致しません（${line.amountForeign} × ${line.rateUsed} の円未満切捨 = ${expected}）。`, `円換算額を ${expected} に修正してください。`);
      }
    }
    if (!(line.amountForeign > 0)) {
      push('R05', where, '原貨額は 0 より大きい必要があります。', '正の数を入力してください。');
    }

    // R06: 消費税額（内税）
    const expectedTax = expectedTaxAmount(line.amountJpy, line.taxCategory);
    if (line.taxAmount !== expectedTax) {
      push('R06', where, `消費税額 ${line.taxAmount} が内税計算値 ${expectedTax} と一致しません。`, `消費税額を ${expectedTax} に修正してください（税区分 ${line.taxCategory}）。`);
    }

    // R07: 軽減税率
    if (line.taxCategory === 'T08' && line.majorCode !== 'MTG') {
      push('R07', where, `軽減税率 T08 は大分類 MTG（会議費）にしか適用できません（現在 ${line.majorCode}）。`, '税区分を T10 にするか、費目を会議費に変更してください。');
    }
    if (line.taxCategory === 'T08' && !line.reducedRate) {
      push('R07', where, '税区分 T08 のとき「軽減税率適用」にチェックが必要です。', 'reducedRate を true にしてください。');
    }
    if (line.taxCategory !== 'T08' && line.reducedRate) {
      push('R07', where, `税区分が ${line.taxCategory} なのに「軽減税率適用」がチェックされています。`, 'reducedRate を false にしてください。');
    }

    // R08: 単価上限
    if (minor && minor.unitLimitJpy !== null && line.amountJpy > minor.unitLimitJpy) {
      push('R08', where, `${minor.name} の 1 明細あたり上限 ${minor.unitLimitJpy.toLocaleString('ja-JP')} 円を超えています（${line.amountJpy.toLocaleString('ja-JP')} 円）。`, '金額を上限以下にするか、上限のない小分類に振り替えてください。');
    }

    // R09: プロジェクトコード
    if (minor?.requiresProject) {
      if (!line.projectCode) {
        push('R09', where, `${minor.name} はプロジェクトコードが必須です。`, 'PRJ-0001 のように PRJ-4桁 の形式で入力してください。');
      } else if (!PROJECT_CODE_RE.test(line.projectCode)) {
        push('R09', where, `プロジェクトコード ${line.projectCode} の形式が不正です。`, 'PRJ-4桁数字（例: PRJ-0042）の形式にしてください。');
      }
    } else if (line.projectCode && !PROJECT_CODE_RE.test(line.projectCode)) {
      push('R09', where, `プロジェクトコード ${line.projectCode} の形式が不正です。`, '未使用なら空文字にしてください。');
    }
  });

  // --- R11: 付表B -----------------------------------------------------------
  const totals = computeTotals(req.lines);
  const bandRule = bandRuleOf(totals.amountJpy);
  if (bandRule.requiresAttachmentB) {
    const b = req.attachmentB;
    if (!b) {
      push('R11', '付表B', `合計 ${totals.amountJpy.toLocaleString('ja-JP')} 円は区分 ${bandRule.band} のため付表Bが必須です。`, '付表B（理由・訪問先・同行者・事前承認番号）を入力してください。');
    } else {
      if (!b.reason?.trim()) push('R11', '付表B', '申請理由が未入力です。', '20文字以上を目安に理由を記載してください。');
      if (!b.destination?.trim()) push('R11', '付表B', '訪問先が未入力です。', '訪問先を記載してください。');
      if (!b.companions?.trim()) push('R11', '付表B', '同行者が未入力です。', '同行者がいない場合は「なし」と記載してください。');
      if (!b.preApprovalNo?.trim()) {
        push('R11', '付表B', '事前承認番号が未入力です。', 'FIN-123456 のように FIN-6桁 の形式で入力してください。');
      } else if (!PRE_APPROVAL_RE.test(b.preApprovalNo)) {
        push('R11', '付表B', `事前承認番号 ${b.preApprovalNo} の形式が不正です。`, 'FIN-6桁数字（例: FIN-202608）の形式にしてください。');
      }
    }
  }

  // --- R12: 承認ルート ------------------------------------------------------
  if (applicant && req.lines.length > 0) {
    const derived = deriveRoute({
      applicantId: req.applicantId,
      divisionCode: req.divisionCode,
      deptCode: req.deptCode,
      sectionCode: req.sectionCode,
      lines: req.lines,
    });
    const want = derived.route;
    const got = req.route;
    if (got.first !== want.first) {
      push('R12', '承認ルート', `1次承認者が ${got.first || '(未設定)'} ですが、マトリクス上は ${want.first} です。`, `1次承認者を ${want.first} に変更してください。`);
    }
    if ((got.second ?? null) !== (want.second ?? null)) {
      push('R12', '承認ルート', `2次承認者が ${got.second ?? '(なし)'} ですが、マトリクス上は ${want.second ?? '(なし)'} です。`, want.second ? `2次承認者を ${want.second} に変更してください。` : '2次承認者を未設定にしてください。');
    }
    if (got.final !== want.final) {
      push('R12', '承認ルート', `最終承認者が ${got.final || '(未設定)'} ですが、マトリクス上は ${want.final} です。`, `最終承認者を ${want.final} に変更してください。${derived.overseasEscalation ? '（海外区分・外貨明細のため CFO 格上げ）' : ''}`);
    }
  }

  return v;
}

// ---- 自動計算（ツール側の「正しく埋める」実装） -----------------------------

/**
 * 明細の計算項目（適用レート・円換算額・税区分・軽減税率・消費税額）を規程どおりに埋める。
 * 呼び出し側が明示的に値を指定していない項目だけを補完する。
 */
export function autoComputeLine(
  line: Partial<ExpenseLine> & { minorCode: string; date: string; amountForeign: number },
  period: string,
): ExpenseLine {
  const minor = findMinor(line.minorCode);
  const middle = minor ? findMiddle(minor.middleCode) : undefined;
  const currency = line.currency ?? 'JPY';
  const rateUsed = line.rateUsed ?? findFxRate(period, currency) ?? 1;
  const amountForeign = line.amountForeign;
  const amountJpy =
    line.amountJpy ?? (currency === 'JPY' ? amountForeign : expectedAmountJpy(amountForeign, rateUsed));
  const taxCategory: TaxCategory = line.taxCategory ?? minor?.defaultTaxCategory ?? 'T10';
  const reducedRate = line.reducedRate ?? taxCategory === 'T08';
  const taxAmount = line.taxAmount ?? expectedTaxAmount(amountJpy, taxCategory);

  return {
    lineNo: line.lineNo ?? 1,
    date: line.date,
    majorCode: line.majorCode ?? middle?.majorCode ?? '',
    middleCode: line.middleCode ?? minor?.middleCode ?? '',
    minorCode: line.minorCode,
    currency,
    amountForeign,
    rateUsed,
    amountJpy,
    taxCategory,
    reducedRate,
    taxAmount,
    projectCode: line.projectCode ?? '',
    note: line.note ?? '',
  };
}

export function emptyLine(lineNo: number): ExpenseLine {
  return {
    lineNo,
    date: '',
    majorCode: '',
    middleCode: '',
    minorCode: '',
    currency: 'JPY',
    amountForeign: 0,
    rateUsed: 1,
    amountJpy: 0,
    taxCategory: 'T10',
    reducedRate: false,
    taxAmount: 0,
    projectCode: '',
    note: '',
  };
}
