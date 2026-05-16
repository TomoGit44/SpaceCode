import type { Ship, ShipBehavior, ShipWorld } from '../entities/Ship';
import type { Block, BlockStepResult } from './Block';
import type { Program } from './Program';
import { tickMoveTo } from './blocks/MoveTo';
import { tickMine } from './blocks/Mine';
import { tickDeposit } from './blocks/Deposit';
import { tickAttackNearest } from './blocks/AttackNearest';
import { tickWaitUntilFull } from './blocks/WaitUntilFull';

const MAX_ADVANCES_PER_TICK = 16;

interface Frame {
  blocks: ReadonlyArray<Block>;
  cursor: number;
  remainingIterations: number; // -1: root, >0: REPEAT 残り回数
}

export interface BlockExecContext {
  elapsedMs: number;
  justEntered: boolean;
}

/**
 * Executor — Program を 1 tick ごとに解釈し、Ship の命令的 API を呼ぶ実行器。
 *
 * Phase 3 でスタックベースに刷新: REPEAT のネスト構造を扱うため。
 *   - root フレームは Program のブロック配列を参照
 *   - REPEAT に到達したら子ブロック配列を新フレームとして push、`remainingIterations = times`
 *   - 子末尾で remainingIterations を消費 (>1 ならカーソルを 0 に戻して継続、それ以外なら pop)
 *
 * ブロックには「現在ブロックに留まっている時間 (elapsedMs)」と「入った最初の tick か (justEntered)」
 * を BlockExecContext で渡す。ATTACK_NEAREST のような持続時間ブロックがこれを使う。
 */
export class Executor implements ShipBehavior {
  private readonly program: Program;
  private stack: Frame[];
  private blockElapsedMs: number = 0;
  private justEntered: boolean = true;

  constructor(program: Program) {
    this.program = program;
    this.stack = [
      {
        blocks: program.getBlocks(),
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
    while (advances < MAX_ADVANCES_PER_TICK) {
      if (this.stack.length === 0) {
        ship.stop();
        return;
      }
      const top = this.stack[this.stack.length - 1]!;

      if (top.cursor >= top.blocks.length) {
        if (top.remainingIterations > 1) {
          top.remainingIterations -= 1;
          top.cursor = 0;
          continue;
        }
        if (this.isRootFrame(top)) {
          // root: 末尾停止。フレーム自体は残す (後から append されたブロックを拾うため)。
          ship.stop();
          return;
        }
        this.stack.pop();
        this.blockElapsedMs = 0;
        this.justEntered = true;
        advances += 1;
        continue;
      }

      const block = top.blocks[top.cursor]!;

      if (block.type === 'REPEAT') {
        top.cursor += 1;
        if (this.isRootFrame(top)) this.program.advance();
        if (block.times <= 0 || block.children.length === 0) {
          this.blockElapsedMs = 0;
          this.justEntered = true;
          advances += 1;
          continue;
        }
        this.stack.push({
          blocks: block.children,
          cursor: 0,
          remainingIterations: block.times,
        });
        this.blockElapsedMs = 0;
        this.justEntered = true;
        advances += 1;
        continue;
      }

      const ctx: BlockExecContext = {
        elapsedMs: this.blockElapsedMs,
        justEntered: this.justEntered,
      };
      const result = this.evaluate(block, ship, world, ctx);
      if (result.status === 'done') {
        top.cursor += 1;
        if (this.isRootFrame(top)) this.program.advance();
        this.blockElapsedMs = 0;
        this.justEntered = true;
        advances += 1;
        continue;
      }
      this.blockElapsedMs += delta;
      this.justEntered = false;
      return;
    }
  }

  public reset(): void {
    this.program.reset();
    this.stack = [
      {
        blocks: this.program.getBlocks(),
        cursor: this.program.cursorIndex,
        remainingIterations: -1,
      },
    ];
    this.blockElapsedMs = 0;
    this.justEntered = true;
  }

  /** UI 用: 現在走行中フレームのブロック配列。 */
  public getRunningBlocks(): ReadonlyArray<Block> | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1]!.blocks : null;
  }

  /** UI 用: 現在走行中フレームのカーソル位置。 */
  public getRunningCursor(): number {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1]!.cursor : -1;
  }

  /**
   * UI 用 (インライン階層編集): 現在走行中ブロックの **path** を返す。
   *  - 空配列 = root frame でカーソルが末尾 (= idle)
   *  - null   = stack 空 / 不正状態
   *  - [i]    = root の i 番目
   *  - [i, j] = root の i 番目 (REPEAT) の中の j 番目
   *
   * Frame の `cursor` は「次に評価するブロック」の index なので、
   * その位置が blocks.length 未満ならそれが走行中、超えていれば「親 frame の REPEAT」を path 末尾とする。
   */
  public getRunningPath(): number[] | null {
    if (this.stack.length === 0) return null;
    const path: number[] = [];
    // stack[0] = root, stack[i+1] は stack[i] の REPEAT の中身。
    // root の cursor は「root.blocks の中の」index。
    // REPEAT で push されたフレームの直前に親 cursor を進めているので、親 cursor - 1 が REPEAT 自身を指す。
    for (let i = 0; i < this.stack.length; i++) {
      const f = this.stack[i]!;
      if (i < this.stack.length - 1) {
        // 中間フレーム = REPEAT。親 frame の cursor は「REPEAT の次」を指しているので -1。
        const parentCursor = this.stack[i]!.cursor;
        path.push(parentCursor - 1);
      } else {
        // 最深フレーム = 現在走行中
        if (f.cursor >= f.blocks.length) return null;
        path.push(f.cursor);
      }
    }
    return path;
  }

  private isRootFrame(frame: Frame): boolean {
    return this.stack.length > 0 && this.stack[0] === frame;
  }

  private evaluate(
    block: Block,
    ship: Ship,
    world: ShipWorld,
    ctx: BlockExecContext
  ): BlockStepResult {
    switch (block.type) {
      case 'MOVE_TO':
        return tickMoveTo(block, ship, world);
      case 'MINE':
        return tickMine(block, ship, world);
      case 'DEPOSIT':
        return tickDeposit(ship, world);
      case 'ATTACK_NEAREST':
        return tickAttackNearest(ship, world, ctx);
      case 'WAIT_UNTIL_FULL':
        return tickWaitUntilFull(ship);
      case 'REPEAT':
        return { status: 'blocked', reason: 'REPEAT must be handled by Executor stack' };
      default: {
        const exhaustive: never = block;
        return exhaustive;
      }
    }
  }
}
