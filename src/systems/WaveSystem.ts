import Phaser from 'phaser';
import { PHASES, type EnemySpec } from '../config';
import { Enemy } from '../entities/Enemy';
import { SpawnSystem } from './SpawnSystem';

export type WaveState =
  | 'preparing'       // 次 Phase 開始待ち (プレイヤーが startNextPhase() を呼ぶまで待機)
  | 'spawning'        // 当該 Phase の敵を出現中
  | 'clearing'        // 全敵出現済 / 残敵を片付け中
  | 'victory';        // 全 Phase クリア

export type WaveEvents = {
  /** Phase 番号 (1-based) が変わったとき */
  phaseStart: (phaseIndex: number) => void;
  /** Phase がクリアされたとき */
  phaseClear: (phaseIndex: number) => void;
  /** 全 Phase クリア */
  victory: () => void;
  /** 状態遷移 (HUD用) */
  state: (state: WaveState) => void;
};

/**
 * Phase 4: 各 spec のスポーン進捗を独立で持つランナー。
 * 1 Phase 内に複数 spec があり並行で出現する。
 */
interface SpecRunner {
  spec: EnemySpec;
  remaining: number;
  timerMs: number;   // 0 以下で 1 体スポーン
}

/**
 * フェーズ進行 / 出現編成を管理するステートマシン。
 * 敵リストの所有は GameScene 側、WaveSystem は「いつ何体スポーンするか」と
 * 「全敵を片付けたら次フェーズに進めるか」を判断する。
 */
export class WaveSystem {
  private spawner: SpawnSystem;
  private emitter: Phaser.Events.EventEmitter;

  private state: WaveState = 'preparing';
  private phaseIndex: number = 0;          // 0-based 内部
  private runners: SpecRunner[] = [];      // Phase 4: 並行スポーンタイマー群

  constructor(spawner: SpawnSystem) {
    this.spawner = spawner;
    this.emitter = new Phaser.Events.EventEmitter();
  }

  public on<K extends keyof WaveEvents>(event: K, fn: WaveEvents[K]): void {
    this.emitter.on(event, fn);
  }

  public getState(): WaveState {
    return this.state;
  }

  public getPhaseNumber(): number {
    return this.phaseIndex + 1; // 表示用 1-based
  }

  /** preparing 中、次に始まる Phase 番号 (1-based)。 */
  public getUpcomingPhaseNumber(): number {
    return this.phaseIndex + 1;
  }

  public getTotalPhases(): number {
    return PHASES.length;
  }

  /** 次 Phase 開始ボタン待ち状態か (UI からの表示判定用)。 */
  public isAwaitingStart(): boolean {
    return this.state === 'preparing';
  }

  /**
   * 「開始」ボタン / キーから呼ばれる。preparing 状態のときのみ受け付け、
   * spawning に遷移する。それ以外の状態では何もしない (false 返す)。
   */
  public startNextPhase(): boolean {
    if (this.state !== 'preparing') return false;
    this.startPhase();
    return true;
  }

  /** Phase の進捗 (残スポーン合計 + 生存敵) */
  public getPhaseRemaining(aliveEnemies: number): number {
    const pending = this.runners.reduce((a, r) => a + r.remaining, 0);
    return pending + aliveEnemies;
  }

  /**
   * 毎フレーム呼ぶ。enemies はシーン側で管理している配列を渡す。
   * 新規スポーン時はここから push する。
   *
   * preparing 中はタイマー進行せず、startNextPhase() の呼び出しを待つ。
   */
  public update(delta: number, enemies: Enemy[]): void {
    switch (this.state) {
      case 'preparing':
        // ユーザーの startNextPhase() を待つ。タイマー無し。
        break;

      case 'spawning': {
        let anyPending = false;
        for (const r of this.runners) {
          if (r.remaining <= 0) continue;
          r.timerMs -= delta;
          if (r.timerMs <= 0) {
            enemies.push(this.spawner.spawnAtRandomEdge(r.spec.type));
            r.remaining -= 1;
            r.timerMs = r.spec.intervalMs;
          }
          if (r.remaining > 0) anyPending = true;
        }
        if (!anyPending) {
          this.state = 'clearing';
          this.emitter.emit('state', this.state);
        }
        break;
      }

      case 'clearing': {
        const alive = enemies.filter((e) => !e.dead).length;
        if (alive === 0) {
          this.completePhase();
        }
        break;
      }

      case 'victory':
        // 何もしない
        break;
    }
    void delta;
  }

  private startPhase(): void {
    const def = PHASES[this.phaseIndex];
    // 各 spec ごとに独立したランナー初期化。delayMs を初期 timerMs に詰める
    this.runners = def.enemySpecs.map((spec) => ({
      spec,
      remaining: spec.count,
      timerMs: (spec.delayMs ?? 0) + 250, // 入り遅延 + 共通入りラグ
    }));
    this.state = 'spawning';
    this.emitter.emit('phaseStart', this.phaseIndex + 1);
    this.emitter.emit('state', this.state);
  }

  private completePhase(): void {
    this.emitter.emit('phaseClear', this.phaseIndex + 1);
    this.phaseIndex += 1;
    if (this.phaseIndex >= PHASES.length) {
      this.state = 'victory';
      this.emitter.emit('state', this.state);
      this.emitter.emit('victory');
      return;
    }
    // 次 Phase 準備中。プレイヤーが startNextPhase() を呼ぶまで待機。
    this.state = 'preparing';
    this.emitter.emit('state', this.state);
  }

  public destroy(): void {
    this.emitter.removeAllListeners();
  }
}
