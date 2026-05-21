import type { Code, CodeType } from '../program/Code';
import type { LocationId, PlanetId } from '../program/locations';
import { Program } from '../program/Program';

/**
 * Phase 4: Ship Program の localStorage 永続化。
 *
 * - 単一テンプレスロット (`spacecode.shipTemplate`) に最後に編集された Program を保存。
 * - 新規 Ship 購入時にロードして自動投入。リトライ時にも引き継がれる。
 * - Code 型は純粋データ (string / number / discriminated union のみ) なので
 *   JSON 往復だけで足りる。REPEAT.children も再帰的にシリアライズされる。
 *
 * 安全側に倒した実装:
 *  - localStorage が使えない環境では try/catch で握りつぶし、null を返すだけ。
 *  - 古い JSON が unsupported な type を含んでいたら filter で除去 (型の互換のため)。
 *  - schema が壊れていたら null。
 */

const KEY = 'spacecode.shipTemplate';
const SCHEMA_VERSION = 1;

interface Saved {
  readonly version: number;
  readonly codes: Code[];
}

/** localStorage に保存。失敗しても例外を投げない (静かに諦める)。 */
export function saveShipTemplate(program: Program): void {
  try {
    const payload: Saved = {
      version: SCHEMA_VERSION,
      codes: program.getCodes().map(cloneCode),  // 内部参照を切る
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // 容量超過 / セキュリティ拒否 / 旧ブラウザ → 諦める
  }
}

/**
 * localStorage から復元。
 * - 存在しない / parse 失敗 / schema 不一致 → null
 * - 空配列の Program もそのまま (空テンプレ = 「Ship は組まないと動かない」状態)
 */
export function loadShipTemplate(): Program | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.codes)) return null;
    const safe = sanitizeCodes(parsed.codes as unknown[]);
    return new Program(safe);
  } catch {
    return null;
  }
}

/** テンプレを明示的に消す。設定 UI 等から呼ぶ想定 (現状未使用)。 */
export function clearShipTemplate(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 諦める
  }
}

// ─── 内部ヘルパ ────────────────────────────────────────────────

const VALID_CODE_TYPES: ReadonlyArray<CodeType> = [
  'MOVE_TO', 'MINE', 'DEPOSIT', 'ATTACK_NEAREST', 'WAIT_UNTIL_FULL', 'REPEAT',
];
const VALID_LOCATIONS: ReadonlyArray<LocationId> = ['base', 'planet0', 'planet1'];
const VALID_PLANETS: ReadonlyArray<PlanetId> = ['planet0', 'planet1'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Code 配列を信頼境界を越えて来た JSON から型安全に拾い直す。 */
function sanitizeCodes(raw: unknown[]): Code[] {
  const out: Code[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const t = item.type;
    if (typeof t !== 'string') continue;
    if (!VALID_CODE_TYPES.includes(t as CodeType)) continue;

    switch (t as CodeType) {
      case 'MOVE_TO': {
        const target = item.target;
        if (typeof target === 'string' && VALID_LOCATIONS.includes(target as LocationId)) {
          out.push({ type: 'MOVE_TO', target: target as LocationId });
        }
        break;
      }
      case 'MINE': {
        const target = item.target;
        if (typeof target === 'string' && VALID_PLANETS.includes(target as PlanetId)) {
          out.push({ type: 'MINE', target: target as PlanetId });
        }
        break;
      }
      case 'DEPOSIT':
        out.push({ type: 'DEPOSIT' });
        break;
      case 'ATTACK_NEAREST':
        out.push({ type: 'ATTACK_NEAREST' });
        break;
      case 'WAIT_UNTIL_FULL':
        out.push({ type: 'WAIT_UNTIL_FULL' });
        break;
      case 'REPEAT': {
        const times = item.times;
        const children = item.children;
        if (typeof times === 'number' && Array.isArray(children)) {
          out.push({
            type: 'REPEAT',
            times: Math.max(1, Math.floor(times)),
            children: sanitizeCodes(children),
          });
        }
        break;
      }
    }
  }
  return out;
}

/** Code を再帰的にディープコピー (保存時にライブ参照を切る)。 */
function cloneCode(c: Code): Code {
  switch (c.type) {
    case 'REPEAT':
      return { type: 'REPEAT', times: c.times, children: c.children.map(cloneCode) };
    default:
      return { ...c };
  }
}
