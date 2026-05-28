/**
 * SignalBus — 宇宙船間のシグナル通信 (2026-05-28)。
 *
 * `BROADCAST_SIGNAL` アクションで発信されたシグナルは一定時間 (TTL) だけ
 * アクティブ扱いで残り、`IF_SIGNAL` 条件が `isActive(signal)` で受信判定する。
 *
 * シングルプレイ前提のシンプル実装: 発信者と受信者を区別しない (誰でも
 * 任意のシグナル A/B/C をブロードキャストでき、誰でも受信できる)。
 *
 * 設計判断:
 *  - **持続時間 1500ms**: 受信側の Ship が次の tick で IF_SIGNAL を評価できる時間幅。
 *    短すぎると同時送受信が成立しない、長すぎると古いシグナルが残り続ける。
 *  - **同じシグナルの再ブロードキャストは TTL を上書きリセット**。
 *  - **GameScene が毎フレーム tick(delta) を呼び**、TTL を減算する。
 */
export class SignalBus {
  /** signal letter → 残り有効時間 (ms)。0 以下になったら期限切れ。 */
  private active: Map<string, number> = new Map();

  /** シグナル持続時間 (ms)。 */
  public static readonly TTL_MS = 1500;

  /** signal を発信する (TTL を新規セットまたは上書き)。 */
  public broadcast(signal: string): void {
    this.active.set(signal, SignalBus.TTL_MS);
  }

  /** signal が現在アクティブか。 */
  public isActive(signal: string): boolean {
    const remaining = this.active.get(signal) ?? 0;
    return remaining > 0;
  }

  /** 毎フレーム呼ばれ、TTL を減算し期限切れを除去する。 */
  public tick(delta: number): void {
    if (this.active.size === 0) return;
    const expired: string[] = [];
    for (const [sig, remaining] of this.active) {
      const next = remaining - delta;
      if (next <= 0) expired.push(sig);
      else this.active.set(sig, next);
    }
    for (const sig of expired) this.active.delete(sig);
  }

  /** 全シグナルをクリア (Run リセット時等)。 */
  public reset(): void {
    this.active.clear();
  }
}
