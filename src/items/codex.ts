/**
 * Codex — 発見済アイテム/シナジー/RunMod の図鑑 + ベストスコア (2026-06-05 Step 5)。
 *
 * ローグライト Step 5 のメタ進行枠。**Run 内体験には影響しない** (アンロック効果なし、
 * Run 内バランスは触らない方針 §6.19 / Step 5 plan)。
 *
 * - 発見済 ID は localStorage 'spacecode.codex' に保存
 * - ベストスコア (到達 Phase, クリア時間 ms) は localStorage 'spacecode.bestScore' に保存
 * - 永続化はこのモジュールに閉じる (Inventory の Run 揮発方針は維持)
 *
 * schema v1。将来 migration する場合は version を上げる。
 */

const CODEX_KEY = 'spacecode.codex';
const BEST_SCORE_KEY = 'spacecode.bestScore';
const SCHEMA_VERSION = 1;

export type CodexKind = 'module' | 'itemCode' | 'synergy' | 'runMod';

interface CodexData {
  readonly version: number;
  readonly discovered: {
    readonly module: string[];
    readonly itemCode: string[];
    readonly synergy: string[];
    readonly runMod: string[];
  };
}

export interface BestScore {
  /** 到達した通し Phase 番号 (1-100)。Game Over なら倒れた Phase、Victory なら 100。 */
  readonly phaseReached: number;
  /** Run 開始から終了までの経過時間 (ms)。Victory のみ更新。 */
  readonly clearTimeMs: number | null;
  /** スコア更新日時 (ISO)。 */
  readonly updatedAt: string;
}

// ─── 内部ヘルパ ──────────────────────────────────────

function loadRaw(): CodexData {
  try {
    const raw = localStorage.getItem(CODEX_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<CodexData>;
    if (parsed.version !== SCHEMA_VERSION || !parsed.discovered) return emptyData();
    return {
      version: SCHEMA_VERSION,
      discovered: {
        module: Array.isArray(parsed.discovered.module) ? parsed.discovered.module : [],
        itemCode: Array.isArray(parsed.discovered.itemCode) ? parsed.discovered.itemCode : [],
        synergy: Array.isArray(parsed.discovered.synergy) ? parsed.discovered.synergy : [],
        runMod: Array.isArray(parsed.discovered.runMod) ? parsed.discovered.runMod : [],
      },
    };
  } catch {
    return emptyData();
  }
}

function emptyData(): CodexData {
  return {
    version: SCHEMA_VERSION,
    discovered: { module: [], itemCode: [], synergy: [], runMod: [] },
  };
}

function saveRaw(data: CodexData): void {
  try {
    localStorage.setItem(CODEX_KEY, JSON.stringify(data));
  } catch {
    // プライベートブラウジング等で write 不可な場合は握り潰す
  }
}

// ─── 公開 API ─────────────────────────────────────────

/**
 * 発見を記録する。新規発見なら true (UI の通知用)、既に発見済なら false。
 */
export function registerDiscovery(kind: CodexKind, id: string): boolean {
  const data = loadRaw();
  const list = data.discovered[kind];
  if (list.includes(id)) return false;
  list.push(id);
  saveRaw(data);
  return true;
}

export function isDiscovered(kind: CodexKind, id: string): boolean {
  const data = loadRaw();
  return data.discovered[kind].includes(id);
}

/** 指定 kind の発見済 ID 一覧。 */
export function getDiscovered(kind: CodexKind): ReadonlyArray<string> {
  return loadRaw().discovered[kind];
}

/** 全 kind の合計発見数 (進捗表示用)。 */
export function totalDiscoveredCount(): number {
  const data = loadRaw();
  return (
    data.discovered.module.length +
    data.discovered.itemCode.length +
    data.discovered.synergy.length +
    data.discovered.runMod.length
  );
}

// ─── ベストスコア ─────────────────────────────────────

export function getBestScore(): BestScore | null {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BestScore>;
    if (typeof parsed.phaseReached !== 'number') return null;
    return {
      phaseReached: parsed.phaseReached,
      clearTimeMs: typeof parsed.clearTimeMs === 'number' ? parsed.clearTimeMs : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

/**
 * 到達 Phase / クリア時間 をベスト記録に反映する (上書き判定込み)。
 * @returns 新記録だったら true。
 *
 * 判定:
 *  - phaseReached が既存より大きい → 新記録
 *  - phaseReached が同じで clearTimeMs が小さい (=より速いクリア) → 新記録
 *  - それ以外 → 更新しない
 */
export function updateBestScore(phaseReached: number, clearTimeMs: number | null): boolean {
  const current = getBestScore();
  let isNew = false;
  if (!current) {
    isNew = true;
  } else if (phaseReached > current.phaseReached) {
    isNew = true;
  } else if (
    phaseReached === current.phaseReached &&
    clearTimeMs !== null &&
    (current.clearTimeMs === null || clearTimeMs < current.clearTimeMs)
  ) {
    isNew = true;
  }
  if (!isNew) return false;
  try {
    const next: BestScore = {
      phaseReached,
      clearTimeMs,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  return true;
}

/** ms を "MM:SS" に整形。 */
export function formatClearTime(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
