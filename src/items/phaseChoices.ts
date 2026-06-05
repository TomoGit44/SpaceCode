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
import { type RunMod, pickRandomRunMod } from './runMods';

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
    }
  // Step 4 で追加: Run 限定永続バフ
  | {
      readonly kind: 'runMod';
      readonly mod: RunMod;
    }
  // Step 4: 試練。次 Phase 敵 HP +30% / count +20% → 即時 SR ガチャ + $120
  | {
      readonly kind: 'trial';
      readonly hpMul: number;
      readonly countMul: number;
      readonly rewardCredits: number;
      readonly rewardGachaCategory: GachaCategory;
      readonly rewardGachaRarity: Rarity;
    }
  // Step 4: ボス前ブースト。SR ガチャ確定 + 全 Ship 修理 + 全 Ship 補給
  | {
      readonly kind: 'bossBoost';
      readonly category: GachaCategory;
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
    case 'runMod':
      return {
        titleJa: choice.mod.nameJa,
        descJa: `${choice.mod.descJa}\n( Run 終了まで永続 )`,
        rarity: choice.mod.rarity,
        categoryLabel: '永続バフ',
      };
    case 'trial': {
      const hpPct = Math.round((choice.hpMul - 1) * 100);
      const cntPct = Math.round((choice.countMul - 1) * 100);
      return {
        titleJa: '試練',
        descJa: `次の Phase の敵 HP +${hpPct}% / 出現数 +${cntPct}%\n即時報酬: $${choice.rewardCredits} + SR ガチャ`,
        rarity: 'SR',
        categoryLabel: '試練 (リスク)',
      };
    }
    case 'bossBoost':
      return {
        titleJa: 'ボス前ブースト',
        descJa: 'SR ガチャ確定 + 全宇宙船の HP/エネルギーを\nフル回復',
        rarity: 'SR',
        categoryLabel: 'ボス前',
      };
  }
}

// ─── 抽選 (Step 3 はランダム重み付け、Step 4 で Phase 番号差別化) ───────

// ─── 個別ロール ──────────────────────────────

function rollGachaChoice(phaseNumber: number, indexBias: number): PhaseChoice {
  const category = phaseRewardCategory(phaseNumber + indexBias);
  const rarity = rollPhaseRewardRarity(category);
  return { kind: 'gacha', category, rarity };
}

function rollCreditsChoice(phaseNumber: number): PhaseChoice {
  // 序盤は控えめ、後半は大きく
  const tiers = phaseNumber <= 10
    ? [50, 80, 120]
    : phaseNumber <= 40
      ? [80, 130, 200]
      : [120, 200, 300];
  const amount = tiers[Math.floor(Math.random() * tiers.length)]!;
  return { kind: 'credits', amount };
}

function rollGuaranteedItem(): PhaseChoice {
  const rarity: Rarity = Math.random() < 0.6 ? 'R' : 'SR';
  const pool = ALL_MODULE_IDS.filter((id) => MODULE_TYPES[id]!.rarity === rarity);
  const typeId = pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]!
    : ALL_MODULE_IDS[0]!;
  const actualRarity = MODULE_TYPES[typeId]!.rarity;
  return { kind: 'guaranteedItem', category: 'module', typeId, rarity: actualRarity };
}

function rollRunModChoice(): PhaseChoice | null {
  // R 重み 70% / SR 30% (RunMod は控えめなレアリティ分布)
  const rarity: Rarity = Math.random() < 0.7 ? 'R' : 'SR';
  const mod = pickRandomRunMod(rarity) ?? pickRandomRunMod('R');
  if (!mod) return null;
  return { kind: 'runMod', mod };
}

function rollTrialChoice(): PhaseChoice {
  // 試練: HP +30% / count +20% → SR ガチャ + $120
  // カテゴリは半々
  const category: GachaCategory = Math.random() < 0.5 ? 'code' : 'module';
  return {
    kind: 'trial',
    hpMul: 1.3,
    countMul: 1.2,
    rewardCredits: 120,
    rewardGachaCategory: category,
    rewardGachaRarity: 'SR',
  };
}

function rollBossBoostChoice(): PhaseChoice {
  const category: GachaCategory = Math.random() < 0.5 ? 'code' : 'module';
  return { kind: 'bossBoost', category };
}

// ─── メイン rollPhaseChoices (節目差別化) ────────

/**
 * 3 候補を生成する (Step 4)。
 *
 * 節目差別化:
 *  - Phase 19/39/59/79/99 (= ボス Phase 直前): ボス前ブースト 確定枠 + 残り 2 ランダム
 *  - Phase 5/10/15/25/30/.. (= 5 の倍数で非ボス前): RunMod が出やすい
 *  - Phase 7/12/17/27/.. (= 5n+2 の倍数で散発): 試練が低確率で混ざる
 *  - 通常 Phase: gacha 50% / credits 30% / guaranteedItem 20%
 *
 * 重複種別はある程度許容 (3 候補すべて gacha もあり得る) → 引きの揺らぎとしてユーザー受容。
 */
export function rollPhaseChoices(phaseNumber: number, _inventory: Inventory): PhaseChoice[] {
  const out: PhaseChoice[] = [];

  // ボス前 (Phase 19/39/59/79/99): 1 枠確定でボス前ブースト
  const isBossEve = phaseNumber === 19 || phaseNumber === 39 || phaseNumber === 59
    || phaseNumber === 79 || phaseNumber === 99;
  if (isBossEve) {
    out.push(rollBossBoostChoice());
  }

  // 5 の倍数 (10/15/25/30/.. 等、ボス前を除く) で RunMod 優先枠
  const isMilestone = phaseNumber % 5 === 0 && !isBossEve;
  if (isMilestone) {
    const rm = rollRunModChoice();
    if (rm) out.push(rm);
  }

  // 試練は散発 (Phase 7/12/17/27 .. で 30% 出現)
  const trialOpportunity = phaseNumber >= 5 && phaseNumber % 5 === 2;
  if (trialOpportunity && !isBossEve && Math.random() < 0.5) {
    out.push(rollTrialChoice());
  }

  // 残り枠を一般ロールで埋める
  while (out.length < 3) {
    const i = out.length;
    const r = Math.random();
    if (r < 0.5) out.push(rollGachaChoice(phaseNumber, i));
    else if (r < 0.78) out.push(rollCreditsChoice(phaseNumber));
    else if (r < 0.92) out.push(rollGuaranteedItem());
    else {
      const rm = rollRunModChoice();
      out.push(rm ?? rollCreditsChoice(phaseNumber));
    }
  }

  // 3 個に丸める (節目で out.length > 3 のケースは先頭 3 個に絞る)
  return out.slice(0, 3);
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
  /** credits/guaranteedItem/runMod/bossBoost の即時適用後に呼ぶ。 */
  readonly onImmediateDone: () => void;
  /** trial 用: 次 Phase の敵強化倍率をセット。 */
  readonly setNextPhaseMultiplier: (mul: { hp: number; count: number }) => void;
  /** bossBoost 用: 全 Ship の HP/エネルギーをフル回復。 */
  readonly healAndRefuelAllShips: () => void;
}

/**
 * 選択肢を適用する。
 *  - gacha: ガチャアイテム個体を inventory に push して GachaOpenScene 起動
 *  - credits: economy.add で即時加算
 *  - guaranteedItem: inventory.items に追加 (モジュール)
 *  - runMod: inventory.runMods に追加 (EffectSystem で加算スタックに合流)
 *  - trial: 次 Phase 強化倍率セット + 即時報酬 (クレジット + SR ガチャ)
 *  - bossBoost: 全 Ship 修理/補給 + SR ガチャ
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
    case 'runMod':
      ctx.inventory.runMods.push(choice.mod);
      ctx.onImmediateDone();
      return;
    case 'trial': {
      // 次 Phase 強化倍率セット
      ctx.setNextPhaseMultiplier({ hp: choice.hpMul, count: choice.countMul });
      // 即時報酬: クレジット + SR ガチャ
      ctx.economy.add(choice.rewardCredits, 'trial');
      const gacha = makeGachaItem(choice.rewardGachaCategory, choice.rewardGachaRarity);
      ctx.inventory.items.push(gacha);
      ctx.launchGachaOpen(gacha, () => ctx.onImmediateDone());
      return;
    }
    case 'bossBoost': {
      ctx.healAndRefuelAllShips();
      const gacha = makeGachaItem(choice.category, 'SR');
      ctx.inventory.items.push(gacha);
      ctx.launchGachaOpen(gacha, () => ctx.onImmediateDone());
      return;
    }
  }
}
