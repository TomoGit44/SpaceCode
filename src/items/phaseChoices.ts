import type { Rarity, ItemInstance } from './itemTypes';
import type { Inventory } from './Inventory';
import type { EconomySystem } from '../systems/EconomySystem';
import {
  type GachaCategory,
  phaseRewardCategory,
  rollPhaseRewardRarity,
  makeGachaItem,
} from './gacha';
import { ALL_MODULE_IDS, MODULE_TYPES } from './types/modules';

/**
 * Phase クリア時の 3 択イベント (2026-06-05 追加, ローグライト Step 3)。
 *
 * 旧 `grantPhaseClearGacha` (自動ガチャ付与) を「3 つから 1 つ選ぶ」に拡張し、
 * プレイヤーの能動的選択を毎 Phase 提示する。
 *
 * Step 3 の種類 (3 種):
 *  - `gacha`         : 既存ガチャアイテム 1 個。確定後 GachaOpenScene を mandatory 起動して 3 候補開封
 *  - `credits`       : クレジット即時加算
 *  - `guaranteedItem`: モジュール 1 個確定獲得 (ガチャ開封不要)
 *
 * Step 4 で `runMod` / `trial` / `bossBoost` / `synergyChip` を追加する。
 */

export type PhaseChoice =
  | {
      readonly kind: 'gacha';
      readonly category: GachaCategory;
      readonly rarity: Rarity;
    }
  | {
      readonly kind: 'credits';
      readonly amount: number;
    }
  | {
      readonly kind: 'guaranteedItem';
      readonly category: 'module';
      readonly typeId: string;
      readonly rarity: Rarity;
    };

/** UI 用の表示テキスト。 */
export interface PhaseChoiceDisplay {
  readonly titleJa: string;
  readonly descJa: string;
  readonly rarity: Rarity;
  /** カードの分類ラベル (右上)。 */
  readonly categoryLabel: string;
}

export function describePhaseChoice(choice: PhaseChoice): PhaseChoiceDisplay {
  switch (choice.kind) {
    case 'gacha': {
      const catLabel = choice.category === 'code' ? 'コードガチャ' : 'モジュールガチャ';
      return {
        titleJa: catLabel,
        descJa: '3 つから 1 つ選ぶ\n( ガチャ開封 )',
        rarity: choice.rarity,
        categoryLabel: 'ガチャ',
      };
    }
    case 'credits':
      return {
        titleJa: `+ $${choice.amount}`,
        descJa: 'クレジットを即時獲得\n船購入・修理・補給に使える',
        // 金額レアリティは便宜的: 60=N, 100=R, 160=SR, 200+=L
        rarity:
          choice.amount >= 200 ? 'L'
          : choice.amount >= 140 ? 'SR'
          : choice.amount >= 80 ? 'R'
          : 'N',
        categoryLabel: 'クレジット',
      };
    case 'guaranteedItem': {
      const mt = MODULE_TYPES[choice.typeId];
      return {
        titleJa: mt?.nameJa ?? choice.typeId,
        descJa: `${mt?.descJa ?? ''}\n( ガチャを開けずに確定獲得 )`,
        rarity: choice.rarity,
        categoryLabel: '確定モジュール',
      };
    }
  }
}

// ─── 抽選 (Step 3 はランダム重み付け、Step 4 で Phase 番号差別化) ───────

/**
 * 3 候補を生成する。
 * 重み: gacha 50% / credits 30% / guaranteedItem 20%。
 * Step 4 で Phase 番号に応じた重み調整 + RunMod / Trial / BossBoost 等を混ぜる。
 */
export function rollPhaseChoices(phaseNumber: number, _inventory: Inventory): PhaseChoice[] {
  const out: PhaseChoice[] = [];
  for (let i = 0; i < 3; i++) {
    const r = Math.random();
    if (r < 0.5) {
      // ガチャ: i ぶんずらして 3 枚すべて同カテゴリにならないようにする
      const category = phaseRewardCategory(phaseNumber + i);
      const rarity = rollPhaseRewardRarity(category);
      out.push({ kind: 'gacha', category, rarity });
    } else if (r < 0.8) {
      const amount = [60, 100, 160][Math.floor(Math.random() * 3)]!;
      out.push({ kind: 'credits', amount });
    } else {
      // 確定モジュール (R 60% / SR 40%、N は寄付感がないため除外)
      const rarity: Rarity = Math.random() < 0.6 ? 'R' : 'SR';
      const pool = ALL_MODULE_IDS.filter((id) => MODULE_TYPES[id]!.rarity === rarity);
      const typeId = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]!
        : ALL_MODULE_IDS[0]!;
      const actualRarity = MODULE_TYPES[typeId]!.rarity;
      out.push({ kind: 'guaranteedItem', category: 'module', typeId, rarity: actualRarity });
    }
  }
  return out;
}

// ─── 適用 ─────────────────────────────────────────────────────

export interface ApplyContext {
  readonly inventory: Inventory;
  readonly economy: EconomySystem;
  /**
   * gacha kind 用: GachaOpenScene を mandatory で起動するためのコールバック。
   * 起動後の閉じイベントで onAfter() を呼んでもらう (PhaseChoiceScene の確定演出 → close 経路)。
   */
  readonly launchGachaOpen: (gachaItem: ItemInstance, onAfter: () => void) => void;
  /** credits/guaranteedItem の即時適用後に呼ぶ (close と onChanged 通知)。 */
  readonly onImmediateDone: () => void;
}

/**
 * 選択肢を適用する。
 *  - gacha: ガチャアイテム個体を inventory に push して GachaOpenScene 起動
 *  - credits: economy.add で即時加算
 *  - guaranteedItem: inventory.items に追加 (モジュール)
 */
export function applyPhaseChoice(choice: PhaseChoice, ctx: ApplyContext): void {
  switch (choice.kind) {
    case 'gacha': {
      const gacha = makeGachaItem(choice.category, choice.rarity);
      ctx.inventory.items.push(gacha);
      ctx.launchGachaOpen(gacha, () => {
        ctx.onImmediateDone();
      });
      return;
    }
    case 'credits':
      ctx.economy.add(choice.amount, 'phaseChoice');
      ctx.onImmediateDone();
      return;
    case 'guaranteedItem': {
      const item: ItemInstance = {
        uid: crypto.randomUUID(),
        typeId: choice.typeId,
        rarity: choice.rarity,
      };
      ctx.inventory.items.push(item);
      ctx.onImmediateDone();
      return;
    }
  }
}
