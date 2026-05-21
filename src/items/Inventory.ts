import type { ItemInstance, CodeItemInstance } from './itemTypes';

/**
 * Inventory — 1 Run ぶんの所持アイテム。
 *
 * Phase 6 方針:
 *  - localStorage 永続化はしない (**メモリ上のみ**)。
 *  - Game Over / Victory / Menu 復帰時、GameScene が新しい Inventory を作り直す
 *    = Run 毎リセット。明示クリアが要る場面のために `reset()` も用意する。
 *  - Run 全体の永続化 (F5 リロード復帰) は Phase 6 スコープ外 (仕様 §11)。
 */
export class Inventory {
  /** オムニ・コア / モジュール / ケミカル / ガチャ。 */
  public items: ItemInstance[] = [];

  /** コードアイテム (プログラムへの配置とは独立に「所持」を管理)。 */
  public codes: CodeItemInstance[] = [];

  /** ship.id -> 装着 module の uid 配列。 */
  public shipModules: Record<string, string[]> = {};

  /** 全所持を空にする (Run リセット用)。 */
  public reset(): void {
    this.items = [];
    this.codes = [];
    this.shipModules = {};
  }
}
