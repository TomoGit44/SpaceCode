import type { Ship, ShipBehavior, ShipWorld } from '../entities/Ship';
import type { Code, CodeStepResult } from './Code';
import type { Program } from './Program';
import { tickMoveTo } from './codes/MoveTo';
import { tickAttackNearest } from './codes/AttackNearest';
import { tickWait } from './codes/Wait';
import { conditionIfHpBelow } from './codes/IfHpBelow';
import { conditionIfEnemyInRange } from './codes/IfEnemyInRange';
import { conditionIfInventoryFull } from './codes/IfInventoryFull';
import { conditionIfEnergyBelow } from './codes/IfEnergyBelow';
import { conditionIfBaseHpBelow } from './codes/IfBaseHpBelow';
import { conditionIfAllyDowned } from './codes/IfAllyDowned';
import { conditionIfBossAlive } from './codes/IfBossAlive';
import { conditionIfNearestEnemyIs } from './codes/IfNearestEnemyIs';
import { conditionIfPlanetEmpty } from './codes/IfPlanetEmpty';
import { conditionIfRandom } from './codes/IfRandom';
import { conditionIfSignal } from './codes/IfSignal';
import { tickBroadcastSignal } from './codes/BroadcastSignal';
import { ITEM_CODE_DEFS } from '../items/types/itemCodes';

const MAX_ADVANCES_PER_TICK = 16;
/** WHILE / LOOP_UNTIL の安全装置: 1 tick 内の最大反復回数。 */
const MAX_LOOP_ITERATIONS_PER_TICK = 32;

interface Frame {
  codes: ReadonlyArray<Code>;
  cursor: number;
  remainingIterations: number; // -1: root, >0: REPEAT 残り回数
  /**
   * 2026-05-28: WHILE / LOOP_UNTIL 用。設定されていれば cursor が末尾に達した時に
   * これを評価し、true なら cursor=0 で続行、false なら frame を pop する。
   * 'while': 条件 true で続行 / 'until': 条件 false で続行 (= true で終了)
   */
  loopMode?: 'while' | 'until';
  loopCondition?: (ship: Ship, world: ShipWorld) => boolean;
  loopIterations?: number; // 安全装置: tick あたりの累積反復数
}

export interface CodeExecContext {
  elapsedMs: number;
  justEntered: boolean;
}

/**
 * Executor — Program を 1 tick ごとに解釈し、Ship の命令的 API を呼ぶ実行器。
 *
 * Phase 3 でスタックベースに刷新: REPEAT のネスト構造を扱うため。
 *   - root フレームは Program のコード配列を参照
 *   - REPEAT に到達したら子コード配列を新フレームとして push、`remainingIterations = times`
 *   - 子末尾で remainingIterations を消費 (>1 ならカーソルを 0 に戻して継続、それ以外なら pop)
 *   - **root 末尾は自動で先頭にループバック** (Phase 5 後の改善)。
 *     プログラムを置いただけで上から下に無限ループする挙動が前提。
 *     REPEAT は「特定の行動を N 回だけ繰り返したい」ときの専用コード。
 *
 * 2026-05-28: ITEM_CODE_DEFS の `kind` (wrapper / wrapperLoop / action) に応じて分岐:
 *   - wrapper:     既存どおり、条件成立時に子を 1 周
 *   - wrapperLoop: 条件で繰り返す (WHILE = 条件 true で継続、LOOP_UNTIL = 条件 false で継続)
 *   - action:      子を持たない leaf として 1 ステップ実行
 *
 * コードには「現在コードに留まっている時間 (elapsedMs)」と「入った最初の tick か (justEntered)」
 * を CodeExecContext で渡す。ATTACK_NEAREST のような持続時間コードがこれを使う。
 */
export class Executor implements ShipBehavior {
  private readonly program: Program;
  private stack: Frame[];
  private codeElapsedMs: number = 0;
  private justEntered: boolean = true;

  constructor(program: Program) {
    this.program = program;
    this.stack = [
      {
        codes: program.getCodes(),
        cursor: program.cursorIndex,
        remainingIterations: -1,
      },
    ];
  }

  public tick(delta: number, ship: Ship, world: ShipWorld): void {
    // ユーザー編集による Program.cursor の変化を root frame に反映 (Phase 2 のライブ編集互換)。
    // root frame は stack[0] で常に存在 (空 Program でも保持する設計)。
    if (this.stack.length > 0) {
      this.stack[0]!.cursor = this.program.cursorIndex;
    }
    let advances = 0;
    // 2026-05-25 後: root 末尾のループバック回数を tick 内で数える。
    // すべてのコードが即時 done を返すケース (例: 同じ目的地への MOVE_TO 連続) では、
    // 1 tick の間に何周もループしてしまい、走行マーカーが上下に高速で飛ぶ視覚バグになる。
    // 2 度目のループバックを検出したら tight-cycle と判定し、cursor=0 に戻して return —
    // 次フレームで再評価することで 1 tick ぶんの時間消費を強制する。
    let rootWraparounds = 0;
    while (advances < MAX_ADVANCES_PER_TICK) {
      if (this.stack.length === 0) {
        ship.stop();
        return;
      }
      const top = this.stack[this.stack.length - 1]!;

      if (top.cursor >= top.codes.length) {
        // wrapperLoop フレームの終端: 条件を再評価して継続/終了を決める。
        if (top.loopCondition && top.loopMode) {
          const condTrue = top.loopCondition(ship, world);
          const shouldContinue = top.loopMode === 'while' ? condTrue : !condTrue;
          const iters = (top.loopIterations ?? 0) + 1;
          if (shouldContinue && iters <= MAX_LOOP_ITERATIONS_PER_TICK) {
            top.loopIterations = iters;
            top.cursor = 0;
            this.codeElapsedMs = 0;
            this.justEntered = true;
            advances += 1;
            continue;
          }
          // 終了
          this.stack.pop();
          this.codeElapsedMs = 0;
          this.justEntered = true;
          advances += 1;
          continue;
        }
        if (top.remainingIterations > 1) {
          top.remainingIterations -= 1;
          top.cursor = 0;
          continue;
        }
        if (this.isRootFrame(top)) {
          // root: 末尾まで実行したら **先頭に戻して無限ループ** する。
          // 空 Program のみ停止 (無限ループ防止 + idle 表現)。
          if (top.codes.length === 0) {
            ship.stop();
            return;
          }
          // tight-cycle 検出: tick 内で既に 1 回ループバック済みなら、これ以上回さず終了。
          // running が一度でも返っていれば早期 return しているのでここには来ない。
          // したがってこのケースは「全コード即時 done」確定。
          if (rootWraparounds >= 1) {
            top.cursor = 0;
            this.program.reset();
            this.codeElapsedMs = 0;
            this.justEntered = true;
            return;
          }
          rootWraparounds += 1;
          top.cursor = 0;
          this.program.reset();
          this.codeElapsedMs = 0;
          this.justEntered = true;
          advances += 1;
          continue;
        }
        this.stack.pop();
        this.codeElapsedMs = 0;
        this.justEntered = true;
        advances += 1;
        continue;
      }

      const code = top.codes[top.cursor]!;

      if (code.type === 'REPEAT') {
        top.cursor += 1;
        if (this.isRootFrame(top)) this.program.advance();
        if (code.times <= 0 || code.children.length === 0) {
          this.codeElapsedMs = 0;
          this.justEntered = true;
          advances += 1;
          continue;
        }
        this.stack.push({
          codes: code.children,
          cursor: 0,
          remainingIterations: code.times,
        });
        this.codeElapsedMs = 0;
        this.justEntered = true;
        advances += 1;
        continue;
      }

      if (code.type === 'ITEM_CODE') {
        const def = ITEM_CODE_DEFS[code.itemCodeType];
        // 2026-05-28: kind 別に分岐。
        if (def && def.kind === 'action') {
          // leaf アクション: evaluate に委譲して結果を見る (BROADCAST_SIGNAL は即時 done)
          const ctxA: CodeExecContext = {
            elapsedMs: this.codeElapsedMs,
            justEntered: this.justEntered,
          };
          const result = this.evaluateAction(code, ship, world, ctxA);
          if (result.status === 'done') {
            top.cursor += 1;
            if (this.isRootFrame(top)) this.program.advance();
            this.codeElapsedMs = 0;
            this.justEntered = true;
            advances += 1;
            continue;
          }
          this.codeElapsedMs += delta;
          this.justEntered = false;
          return;
        }
        if (def && def.kind === 'wrapperLoop') {
          // ループ wrapper: cursor を先に進め、初回 (まだ入っていない) は子配列を push、
          // 条件を毎反復で再評価して継続判定する (Frame.loopCondition に保存)。
          top.cursor += 1;
          if (this.isRootFrame(top)) this.program.advance();
          if (code.children.length === 0) {
            this.codeElapsedMs = 0;
            this.justEntered = true;
            advances += 1;
            continue;
          }
          const condFn = this.buildLoopCondition(code);
          const loopMode: 'while' | 'until' = code.itemCodeType === 'WHILE' ? 'while' : 'until';
          // 初回: 開始前に条件チェック。
          //   - while: 条件 false なら 1 度も実行しない
          //   - until: 条件 true なら 1 度も実行しない
          const initialPass = condFn
            ? loopMode === 'while'
              ? condFn(ship, world)
              : !condFn(ship, world)
            : false;
          if (!initialPass) {
            this.codeElapsedMs = 0;
            this.justEntered = true;
            advances += 1;
            continue;
          }
          this.stack.push({
            codes: code.children,
            cursor: 0,
            remainingIterations: -1,
            loopMode,
            ...(condFn ? { loopCondition: condFn } : {}),
            loopIterations: 0,
          });
          this.codeElapsedMs = 0;
          this.justEntered = true;
          advances += 1;
          continue;
        }
        // wrapper (デフォルト): 条件 wrapper として 1 周のみ実行
        top.cursor += 1;
        if (this.isRootFrame(top)) this.program.advance();
        const pass =
          code.children.length > 0 && this.evaluateItemCondition(code, ship, world);
        if (pass) {
          this.stack.push({
            codes: code.children,
            cursor: 0,
            remainingIterations: 1,
          });
        }
        this.codeElapsedMs = 0;
        this.justEntered = true;
        advances += 1;
        continue;
      }

      const ctx: CodeExecContext = {
        elapsedMs: this.codeElapsedMs,
        justEntered: this.justEntered,
      };
      const result = this.evaluate(code, ship, world, ctx);
      if (result.status === 'done') {
        top.cursor += 1;
        if (this.isRootFrame(top)) this.program.advance();
        this.codeElapsedMs = 0;
        this.justEntered = true;
        advances += 1;
        continue;
      }
      this.codeElapsedMs += delta;
      this.justEntered = false;
      return;
    }
  }

  public reset(): void {
    this.program.reset();
    this.stack = [
      {
        codes: this.program.getCodes(),
        cursor: this.program.cursorIndex,
        remainingIterations: -1,
      },
    ];
    this.codeElapsedMs = 0;
    this.justEntered = true;
  }

  /** UI 用: 現在走行中フレームのコード配列。 */
  public getRunningCodes(): ReadonlyArray<Code> | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1]!.codes : null;
  }

  /** UI 用: 現在走行中フレームのカーソル位置。 */
  public getRunningCursor(): number {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1]!.cursor : -1;
  }

  /**
   * UI 用 (インライン階層編集): 現在走行中コードの **path** を返す。
   *  - 空配列 = root frame でカーソルが末尾 (= idle)
   *  - null   = stack 空 / 不正状態
   *  - [i]    = root の i 番目
   *  - [i, j] = root の i 番目 (REPEAT) の中の j 番目
   *
   * Frame の `cursor` は「次に評価するコード」の index なので、
   * その位置が codes.length 未満ならそれが走行中、超えていれば「親 frame の REPEAT」を path 末尾とする。
   */
  public getRunningPath(): number[] | null {
    if (this.stack.length === 0) return null;
    const path: number[] = [];
    // stack[0] = root, stack[i+1] は stack[i] の REPEAT の中身。
    // root の cursor は「root.codes の中の」index。
    // REPEAT で push されたフレームの直前に親 cursor を進めているので、親 cursor - 1 が REPEAT 自身を指す。
    for (let i = 0; i < this.stack.length; i++) {
      const f = this.stack[i]!;
      if (i < this.stack.length - 1) {
        // 中間フレーム = REPEAT。親 frame の cursor は「REPEAT の次」を指しているので -1。
        const parentCursor = this.stack[i]!.cursor;
        path.push(parentCursor - 1);
      } else {
        // 最深フレーム = 現在走行中
        if (f.cursor >= f.codes.length) return null;
        path.push(f.cursor);
      }
    }
    return path;
  }

  private isRootFrame(frame: Frame): boolean {
    return this.stack.length > 0 && this.stack[0] === frame;
  }

  private evaluate(
    code: Code,
    ship: Ship,
    world: ShipWorld,
    ctx: CodeExecContext
  ): CodeStepResult {
    switch (code.type) {
      case 'MOVE_TO':
        return tickMoveTo(code, ship, world);
      case 'ATTACK_NEAREST':
        return tickAttackNearest(ship, world, ctx);
      case 'WAIT':
        return tickWait(code, ship, world, ctx);
      case 'REPEAT':
        return { status: 'blocked', reason: 'REPEAT must be handled by Executor stack' };
      case 'ITEM_CODE':
        return { status: 'blocked', reason: 'ITEM_CODE must be handled by Executor stack' };
      default: {
        const exhaustive: never = code;
        return exhaustive;
      }
    }
  }

  /** ITEM_CODE (kind='action') のアクション本体を実行する。 */
  private evaluateAction(
    code: Extract<Code, { type: 'ITEM_CODE' }>,
    ship: Ship,
    world: ShipWorld,
    ctx: CodeExecContext
  ): CodeStepResult {
    void ctx;
    switch (code.itemCodeType) {
      case 'BROADCAST_SIGNAL':
        return tickBroadcastSignal(code, ship, world);
      default:
        return { status: 'done' };
    }
  }

  /** ITEM_CODE (kind='wrapper') の条件を評価する。 */
  private evaluateItemCondition(
    code: Extract<Code, { type: 'ITEM_CODE' }>,
    ship: Ship,
    world: ShipWorld
  ): boolean {
    switch (code.itemCodeType) {
      case 'IF_HP_BELOW':
        return conditionIfHpBelow(code, ship, world);
      case 'IF_ENEMY_IN_RANGE':
        return conditionIfEnemyInRange(code, ship, world);
      case 'IF_INVENTORY_FULL':
        return conditionIfInventoryFull(code, ship, world);
      case 'IF_ENERGY_BELOW':
        return conditionIfEnergyBelow(code, ship, world);
      case 'IF_BASE_HP_BELOW':
        return conditionIfBaseHpBelow(code, ship, world);
      case 'IF_ALLY_DOWNED':
        return conditionIfAllyDowned(code, ship, world);
      case 'IF_BOSS_ALIVE':
        return conditionIfBossAlive(code, ship, world);
      case 'IF_NEAREST_ENEMY_IS':
        return conditionIfNearestEnemyIs(code, ship, world);
      case 'IF_PLANET_EMPTY':
        return conditionIfPlanetEmpty(code, ship, world);
      case 'IF_RANDOM':
        return conditionIfRandom(code, ship, world);
      case 'IF_SIGNAL':
        return conditionIfSignal(code, ship, world);
      default:
        // wrapperLoop / action はここに来ない
        return false;
    }
  }

  /**
   * WHILE / LOOP_UNTIL の condType + threshold を、ship/world を取って bool を返す関数に変換する。
   * threshold の意味は condType によって変わる:
   *  - enemyInRange: 距離 (px)
   *  - hpBelow / energyBelow: しきい値 (%)
   *  - inventoryFull / inventoryEmpty / bossAlive: 未使用
   */
  private buildLoopCondition(
    code: Extract<Code, { type: 'ITEM_CODE' }>
  ): ((ship: Ship, world: ShipWorld) => boolean) | null {
    const cond = (code.params.condType as string) ?? '';
    const thr = (code.params.threshold as number) ?? 0;
    switch (cond) {
      case 'enemyInRange': {
        const r2 = thr * thr;
        return (ship, world) => {
          for (const e of world.enemies) {
            if (e.dead) continue;
            const dx = e.x - ship.x;
            const dy = e.y - ship.y;
            if (dx * dx + dy * dy <= r2) return true;
          }
          return false;
        };
      }
      case 'hpBelow':
        return (ship) => ship.maxHp > 0 && (ship.hp / ship.maxHp) * 100 <= thr;
      case 'energyBelow':
        return (ship) => ship.maxEnergy > 0 && (ship.energy / ship.maxEnergy) * 100 <= thr;
      case 'inventoryFull':
        return (ship) => ship.isInventoryFull();
      case 'inventoryEmpty':
        return (ship) => ship.inventory <= 0;
      case 'bossAlive':
        return (_ship, world) => {
          for (const e of world.enemies) {
            if (!e.dead && e.type === 'boss') return true;
          }
          return false;
        };
      default:
        return null;
    }
  }
}
