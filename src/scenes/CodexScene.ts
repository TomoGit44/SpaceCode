import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { drawStarfield } from '../utils/starfield';
import {
  type CodexKind,
  isDiscovered,
  getBestScore,
  formatClearTime,
  totalDiscoveredCount,
} from '../items/codex';
import { MODULE_TYPES, ALL_MODULE_IDS, moduleEffectText } from '../items/types/modules';
import { ITEM_CODE_DEFS, ALL_ITEM_CODE_TYPES } from '../items/types/itemCodes';
import { SYNERGY_DEFS, ALL_SYNERGY_IDS } from '../items/synergies';
import { RUN_MOD_DEFS, ALL_RUN_MOD_IDS } from '../items/runMods';
import { RARITY_SHORT, RARITY_COLOR } from '../items/itemTypes';

const FONT = 'system-ui, "Segoe UI", sans-serif';

interface CodexEntry {
  readonly id: string;
  readonly nameJa: string;
  readonly descJa: string;
  readonly rarity: string; // 'N' | 'R' | 'SR' | 'L'
}

interface CodexTab {
  readonly kind: CodexKind;
  readonly label: string;
  readonly entries: ReadonlyArray<CodexEntry>;
}

/**
 * 図鑑シーン (2026-06-05 ローグライト Step 5)。
 *
 * MenuScene から開く。全アイテム/シナジー/RunMod を 4 タブで並べる。
 * 発見済 (codex.ts の localStorage 保存) なら実名 + 効果説明、
 * 未発見は ??? シルエットで表示する。
 * 上部にベストスコア (到達 Phase + クリア時間) も表示。
 *
 * **Run 内バランスには一切影響しない** — メタ進行のみ (§Step 5 plan)。
 */
export class CodexScene extends Phaser.Scene {
  private currentTab: CodexKind = 'module';
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private tabBtns: Map<CodexKind, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }> = new Map();

  constructor() {
    super({ key: 'CodexScene' });
  }

  create(): void {
    this.cameras.main.fadeIn(280, 5, 7, 13);
    drawStarfield(this, GAME_WIDTH, GAME_HEIGHT);

    // タイトル
    this.add
      .text(GAME_WIDTH / 2, 56, '📖 図鑑', {
        fontFamily: FONT,
        fontSize: '36px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 96, `発見済 ${totalDiscoveredCount()} 件 — プレイで集めて埋めよう`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#6b7da0',
      })
      .setOrigin(0.5);

    // ベストスコア
    this.renderBestScore();

    // タブ行
    this.renderTabs();

    // 戻るボタン
    this.makeBackButton();

    // ESC で戻る
    this.input.keyboard?.once('keydown-ESC', () => this.goBack());

    // 初期タブ描画
    this.render();
  }

  private renderBestScore(): void {
    const best = getBestScore();
    const y = 134;
    if (!best) {
      this.add
        .text(GAME_WIDTH / 2, y, 'ベストスコア: 未記録', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#6b7da0',
        })
        .setOrigin(0.5);
      return;
    }
    const phaseText = best.phaseReached >= 100 ? 'ALL CLEAR' : `Phase ${best.phaseReached}`;
    const timeText = best.clearTimeMs !== null ? ` / クリア時間 ${formatClearTime(best.clearTimeMs)}` : '';
    this.add
      .text(GAME_WIDTH / 2, y, `ベストスコア: ${phaseText}${timeText}`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#3ee0c5',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }

  private renderTabs(): void {
    const tabs: ReadonlyArray<{ kind: CodexKind; label: string }> = [
      { kind: 'module', label: 'モジュール' },
      { kind: 'itemCode', label: 'アイテムコード' },
      { kind: 'synergy', label: 'シナジー' },
      { kind: 'runMod', label: '永続バフ' },
    ];
    const tabY = 170;
    const tabW = 160;
    const tabH = 32;
    const gap = 8;
    const totalW = tabs.length * tabW + (tabs.length - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2;

    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i]!;
      const cx = startX + i * (tabW + gap) + tabW / 2;
      const bg = this.add
        .rectangle(cx, tabY, tabW, tabH, COLORS.panelBg, 1)
        .setStrokeStyle(2, COLORS.accent, 0.4)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(cx, tabY, t.label, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      bg.on('pointerover', () => {
        if (this.currentTab !== t.kind) bg.setFillStyle(COLORS.panelHover, 1);
      });
      bg.on('pointerout', () => {
        if (this.currentTab !== t.kind) bg.setFillStyle(COLORS.panelBg, 1);
      });
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        this.currentTab = t.kind;
        this.refreshTabStyles();
        this.render();
      });
      this.tabBtns.set(t.kind, { bg, label });
    }
    this.refreshTabStyles();
  }

  private refreshTabStyles(): void {
    for (const [kind, refs] of this.tabBtns) {
      const active = kind === this.currentTab;
      refs.bg.setStrokeStyle(2, COLORS.accent, active ? 1 : 0.4);
      refs.bg.setFillStyle(active ? COLORS.accent : COLORS.panelBg, active ? 0.18 : 1);
      refs.label.setColor(active ? '#3ee0c5' : '#cfd6e6');
    }
  }

  private render(): void {
    for (const g of this.dyn) g.destroy();
    this.dyn = [];

    const tab = this.collectTab(this.currentTab);
    const totalCount = tab.entries.length;
    let discoveredCount = 0;
    for (const e of tab.entries) {
      if (isDiscovered(this.currentTab, e.id)) discoveredCount++;
    }

    // 進捗ラベル
    this.dyn.push(
      this.add
        .text(GAME_WIDTH / 2, 218, `${discoveredCount} / ${totalCount} 件 発見済`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        })
        .setOrigin(0.5)
    );

    // エントリグリッド (3 列)
    const cols = 3;
    const cardW = 320;
    const cardH = 96;
    const gap = 12;
    const startX = (GAME_WIDTH - (cols * cardW + (cols - 1) * gap)) / 2;
    const startY = 250;
    const rows = Math.ceil(tab.entries.length / cols);
    for (let i = 0; i < tab.entries.length; i++) {
      const e = tab.entries[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gap) + cardW / 2;
      const cy = startY + row * (cardH + gap) + cardH / 2;
      this.makeEntryCard(e, cx, cy, cardW, cardH, isDiscovered(this.currentTab, e.id));
    }
    void rows;
  }

  private makeEntryCard(
    entry: CodexEntry,
    cx: number,
    cy: number,
    w: number,
    h: number,
    discovered: boolean,
  ): void {
    const rc = (RARITY_COLOR as Record<string, number>)[entry.rarity] ?? COLORS.panelBorder;
    const bg = this.add
      .rectangle(cx, cy, w, h, COLORS.panelBg, discovered ? 0.95 : 0.4)
      .setStrokeStyle(1.5, rc, discovered ? 0.85 : 0.3);
    this.dyn.push(bg);

    // レア度バッジ (左上)
    const rcsText = (RARITY_SHORT as Record<string, string>)[entry.rarity] ?? '?';
    this.dyn.push(
      this.add
        .rectangle(cx - w / 2 + 24, cy - h / 2 + 18, 32, 18, rc, discovered ? 0.18 : 0.08)
          .setStrokeStyle(1, rc, discovered ? 0.95 : 0.3),
      this.add
        .text(cx - w / 2 + 24, cy - h / 2 + 18, rcsText, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    // 名前
    const nameText = discovered ? entry.nameJa : '???';
    this.dyn.push(
      this.add
        .text(cx - w / 2 + 48, cy - h / 2 + 12, nameText, {
          fontFamily: FONT,
          fontSize: '15px',
          color: discovered ? '#cfd6e6' : '#6b7da0',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0)
    );

    // 説明
    const descText = discovered ? entry.descJa : '— 未発見 — プレイ中に獲得すると解禁';
    this.dyn.push(
      this.add
        .text(cx - w / 2 + 16, cy - h / 2 + 38, descText, {
          fontFamily: FONT,
          fontSize: '11px',
          color: discovered ? '#9aa4ba' : '#6b7da0',
          wordWrap: { width: w - 32 },
        })
        .setOrigin(0, 0)
    );
  }

  // ─── タブ別のエントリ集約 ─────────────────────

  private collectTab(kind: CodexKind): CodexTab {
    const entries: CodexEntry[] = [];
    if (kind === 'module') {
      for (const id of ALL_MODULE_IDS) {
        const m = MODULE_TYPES[id]!;
        entries.push({
          id,
          nameJa: m.nameJa,
          descJa: `${m.descJa}  /  ${moduleEffectText(id)}`,
          rarity: m.rarity,
        });
      }
      return { kind, label: 'モジュール', entries };
    }
    if (kind === 'itemCode') {
      for (const id of ALL_ITEM_CODE_TYPES) {
        const def = ITEM_CODE_DEFS[id];
        entries.push({
          id,
          nameJa: def.nameJa,
          descJa: def.descJa,
          rarity: def.rarity,
        });
      }
      return { kind, label: 'アイテムコード', entries };
    }
    if (kind === 'synergy') {
      for (const id of ALL_SYNERGY_IDS) {
        const def = SYNERGY_DEFS[id];
        entries.push({
          id,
          nameJa: def.nameJa,
          descJa: def.descJa,
          rarity: def.rarity,
        });
      }
      return { kind, label: 'シナジー', entries };
    }
    // runMod
    for (const id of ALL_RUN_MOD_IDS) {
      const def = RUN_MOD_DEFS[id]!;
      entries.push({
        id,
        nameJa: def.nameJa,
        descJa: def.descJa,
        rarity: def.rarity,
      });
    }
    return { kind, label: '永続バフ', entries };
  }

  private makeBackButton(): void {
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 40;
    const w = 200;
    const h = 36;
    const bg = this.add
      .rectangle(x, y, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(2, COLORS.accent, 0.85)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, '[ ESC ] メニューに戻る', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd6e6',
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.goBack();
    });
  }

  private goBack(): void {
    this.cameras.main.fadeOut(280, 5, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MenuScene');
    });
  }
}
