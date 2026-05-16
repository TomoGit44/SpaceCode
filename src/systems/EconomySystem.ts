import Phaser from 'phaser';
import { ECONOMY } from '../config';

export type EconomyEvents = {
  /** お金が変動したとき (現在値, 変動量) */
  change: (credits: number, delta: number) => void;
};

/**
 * お金 (Credit) を一元管理。
 * Phase C: 敵撃破/Phase クリアによる加算のみ。
 * Phase D 以降で資源変換・購入消費が乗る。
 */
export class EconomySystem {
  private creditsValue: number;
  private emitter: Phaser.Events.EventEmitter;

  constructor(initial: number = ECONOMY.startCredits) {
    this.creditsValue = initial;
    this.emitter = new Phaser.Events.EventEmitter();
  }

  public get credits(): number {
    return this.creditsValue;
  }

  public add(amount: number, reason: string = ''): void {
    if (amount <= 0) return;
    this.creditsValue += amount;
    this.emitter.emit('change', this.creditsValue, amount, reason);
  }

  /** 残高不足なら false を返し変更しない。 */
  public spend(amount: number, reason: string = ''): boolean {
    if (amount <= 0) return true;
    if (this.creditsValue < amount) return false;
    this.creditsValue -= amount;
    this.emitter.emit('change', this.creditsValue, -amount, reason);
    return true;
  }

  /**
   * 資源を納品してクレジットに変換 (Phase D)。
   * @param amount 資源量
   * @returns 加算されたクレジット量
   */
  public depositResource(amount: number): number {
    if (amount <= 0) return 0;
    const credits = Math.floor(amount * ECONOMY.resourceToCredit);
    if (credits <= 0) return 0;
    this.creditsValue += credits;
    this.emitter.emit('change', this.creditsValue, credits, 'deposit');
    return credits;
  }

  public on(event: 'change', fn: EconomyEvents['change']): void {
    this.emitter.on(event, fn);
  }

  public destroy(): void {
    this.emitter.removeAllListeners();
  }
}
