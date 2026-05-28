# 新コード・モジュール案 (ブレインストーミング)

> 作成日: 2026-05-27 / 最終更新: 2026-05-28
>
> 目的: CLAUDE.md「ユーザーの心理的フックに基づくゲーム設計方針」に基づき、
> プレイヤーが「組み合わせる楽しみ」「次に何を引くかの期待」「シナジー発見の快感」
> を強く感じられる新コード・モジュール・システムを自由発想で多数列挙する。
>
> 制約方針:
> - **レア度で値だけが違う案は採用しない** (例: 攻撃+20/35/50%)
> - シナジー前提の案を多めに
> - デメリット付きで「組み込み方を考える楽しみ」が出る案を歓迎
> - 新システム提案も歓迎
>
> ## 実装状況 (2026-05-28)
>
> - **固定レア度制**を導入: 各コード / モジュールは 1 つの rarity を持ち、その rarity でのみガチャ排出
> - Part 1.1 / 1.2 で「採用」マーク済の 10 コード + BROADCAST_SIGNAL を実装済 (計 11 コード)
> - 新システム (Part 4) は未実装。マルチ Ship 連携の前提となる Ship 識別 UI も未実装

---

## 心理的フックとの対応の凡例

各案の末尾に対応するフックを記号で示す。

- 🎰 **変動比率強化**: 引き運・発動運に依存し「次は当たるかも」を作る
- 🎯 **自律性**: プレイヤーが意志を持って構築方針を選ぶ余地
- 💡 **シナジー発見**: 別アイテムと組合せた瞬間に化ける (アハ体験)
- ⚡ **短期フィードバック**: 装着・発動直後に数値や演出で変化が見える
- 💢 **損失回避**: 失う・取り戻すことに対する強い感情を引き出す

---

# Part 1. 新コード案

## 1.1 条件 wrapper コード (IF 系の拡張)

現状: `IF_HP_BELOW` / `IF_ENEMY_IN_RANGE` / `IF_INVENTORY_FULL` の 3 種。
方向性: **判定対象を増やす**ことでビルドの状況対応力を上げる。

| ID 案 | 効果 | シナジー先 | フック |
|---|---|---|---|
| `IF_ENERGY_BELOW` | エネルギーが N% 以下なら 1 周実行 | `mod_solar_panel`, WAIT (基地補給) | 🎯💡 | 採用 |　スパーレア |
| `IF_BASE_HP_BELOW` | 基地 HP が低い時 1 周 (例: 緊急時のみ防衛配置に戻る) | `DEFEND_BASE`, 採掘モード切替 | 🎯💢 |採用 |レジェンド |
| `IF_ALLY_DOWNED` | 他の Ship がダウン状態にいる時 1 周 (代わりに前線へ) | multi-ship 編成 | 💡💢 |採用 |ノーマル |
| `IF_BOSS_ALIVE` | 現 Phase にボスが出現中の時 (Phase 20/40/60/80/100 で活きる) | ボム砲、IF_ENEMY_IN_RANGE | 🎯💡 |採用 |ノーマル |
| `IF_NEAREST_ENEMY_IS` | 最寄り敵が指定種別 (basic/fast/tank/sniper/boss) の時 | 採掘時の sniper 優先撃破 | 🎯💡 |採用 |レア |
| `IF_PLANET_EMPTY` | 指定惑星 (or 全惑星) 枯渇時 1 周 | 待機・別惑星へ移動 | 🎯 |採用 |ノーマル |
| `IF_INVENTORY_EMPTY` | 積載 0 の時 (採掘モードへ戻す) | `mod_refinery`, REPEAT | 💡 |不採用 |
| `IF_PHASE_RANGE` | 現 Phase が N〜M の範囲内なら | Stage 別動作 | 🎯 |不採用 |レジェンド |
| `IF_RANDOM` | 確率 N% で 1 周 (ギャンブル分岐) | 🎰 全般 | 🎰💡 |採用 |ノーマル |
| `IF_SIGNAL` | 他 Ship からの `BROADCAST_SIGNAL` を受信中の時 (multi-ship coord) | `BROADCAST_SIGNAL` | 💡🎯 |採用 |レア |

### 設計メモ
- 既存 `ITEM_CODE` ノード機構をそのまま使える (wrapper 型)
- レア度で変えるのは「閾値の許容範囲」ではなく **判定の精度** にすると面白い (例: `IF_NEAREST_ENEMY_IS` の N は 1 種別しか指定不可、L は最大 3 種別 OR 指定可)

---

## 1.2 ループ系コード

| ID 案 | 効果 | シナジー先 | フック |
|---|---|---|---|
| `WHILE` | 条件を満たす間繰り返す (REPEAT の条件版) | 条件 wrapper 群 | 🎯💡 |採用 |レア |
| `LOOP_UNTIL` | 条件を満たすまで繰り返す | IF 系 | 🎯  |採用 |レア |
| `FOR_EACH_PLANET` | 全惑星に対して順に処理を実行 (惑星 ID 引数不要化) | 採掘 build | 🎯  |不採用 |
| `RANDOM_CHOICE` | 子の中からランダムに 1 つだけ実行 | 🎰 ビルド | 🎰💡 |不採用 |

---

## 1.3 アクション系コード (新規行動)

### 1.3.1 単発の強力なアクション (デメリット付きが多い)

| ID 案 | 効果 | デメリット | シナジー先 | フック |
|---|---|---|---|---|
| `SELF_DESTRUCT` | 周囲半径 200px に大ダメージ (50dmg)、Ship はダウン | Ship 失う (修復必要) | `mod_kamikaze_core`, ボス戦 | 💢⚡ |
| `WARP_TO` | 指定座標へ瞬間移動 | エネルギー -60 | sniper 回避 | 🎯⚡ |
| `BUILD_BARRIER` | 周囲に 3 秒間バリア展開 (敵弾を吸収) | エネルギー -40 | sniper 多 Phase | 🎯💢 |
| `TAUNT` | 半径 300px の敵を装着 Ship へ引き寄せる | 接触ダメ受け続ける | `mod_decoy`, `mod_armor` 多重 | 💡 |
| `OVERCHARGE_SHOT` | 次の ATTACK_NEAREST が 3 倍ダメ | エネルギー -30 | `mod_gatling`, ボス | 💡⚡ |
| `STIM_INJECT` | 5 秒間 moveSpeed +100% | HP -5 (注射代償) | `mod_blood_pump` で実質ノーコスト | 💡⚡ |

### 1.3.2 マルチ Ship 連携 (船複数所持時に活きる)

| ID 案 | 効果 | フック |
|---|---|---|
| `BROADCAST_SIGNAL` | 他全 Ship に signal 発信 (3 種類タグ付け可: A/B/C) | 💡🎯 |
| `FOLLOW_SHIP` | 別 Ship について移動 (ID 指定) | 💡 |
| `TRANSFER_ENERGY` | 隣接 Ship にエネルギー +20 移動 | 💡 |
| `TRANSFER_RESOURCE` | 隣接 Ship にインベントリ譲渡 | 💡 |
| `REVIVE_ALLY` | ダウン中の隣接 Ship を HP 5 で復活 (エネルギー -50) | 💡💢 |

### 1.3.3 経済アクション

| ID 案 | 効果 | フック |
|---|---|---|
| `GAMBLE_CREDITS` | $10 を賭けて 30% で $30 リターン / 70% で消失 | 🎰💢 |
| `BUY_REPAIR` | 基地近接時、$30 で自分の HP を全回復 (編集画面ボタンの自動化) | 🎯 |
| `BUY_AMMO` | $20 で次 10 発の damagePerShot +50% (一時) | 🎯💡 |

---

# Part 2. 新モジュール案

現状: 8 種 (gatling/thruster/drill/ram/armor/cargo/battery/bomb)。

## 2.1 シナジー核モジュール (他モジュールを増幅)

**狙い**: 「モジュール 1 個だけでは弱いが、他と組むと爆発する」を作り、💡 を強く発火させる。

| ID 案 | 効果 | デメリット | シナジー先 | フック |
|---|---|---|---|---|
| `mod_resonator` | 同 Ship 装着の **他モジュール全効果** を +20% (レア度で 10/20/30/40%) | 単体だと効果なし | 全モジュール | 💡⚡ |
| `mod_overdrive` | ATTACK_NEAREST 1 発ごとに damagePerShot +5% (最大 +100%、移動でリセット) | 動くと積み上げ消滅 | `mod_gatling`、固定砲台 build | 💡⚡ |
| `mod_capacitor` | 攻撃しない時間 1 秒ごとに次の弾 +10% (最大 +300%) | 連射ビルドと噛み合わない | WAIT、IF_ENEMY_IN_RANGE 待ち伏せ | 💡⚡ |
| `mod_dual_wield` | extraShots を持つモジュールの効果を 2 倍に | 単体だと無意味 | `mod_gatling` 必須 | 💡 |
| `mod_chain_reactor` | ボム弾の爆発が範囲内の他ボム弾と連鎖発火 | bomb がないと無意味 | `mod_bomb` 複数 | 💡⚡ |
| `mod_amplifier` | extraShots / bombDamage / contactDps の **flat 系全効果** を 1.5 倍 | percent 系には効かない | gatling, bomb, ram | 💡 |

## 2.2 トレードオフ系モジュール (デメリット強め)

**狙い**: 「組み込み方を考える楽しみ」「ビルドのキャラ立ち」を作る。
弱いまま使えば自滅、噛み合えば爆発、を両立させる。

| ID 案 | 効果 | デメリット | 想定ビルド | フック |
|---|---|---|---|---|
| `mod_glass_cannon` | damagePerShot +200% | maxHp -60% | `mod_armor` で打ち消す or 採掘特化船と分業 | 💢💡 |
| `mod_berserker` | HP が低いほど damagePerShot up (HP 10% で +400%) | 高 HP 時はほぼ効果なし | `IF_HP_BELOW` 緊急展開 | 💡💢 |
| `mod_unstable_core` | damagePerShot +100% | 6 秒ごとにランダムで 1 秒スタン | `mod_decisive` で「動くべき時に動く」設計 | 🎰💡 |
| `mod_recoil` | damagePerShot +150% | 攻撃ごとに自分 1 ダメージ | `mod_leech`, `mod_blood_pump` | 💡 |
| `mod_pacifist` | mineRate +200%, inventoryCap +50% | ATTACK_NEAREST 完全無効化 | 純採掘船 (役割分業) | 🎯💡 |
| `mod_overweight` | inventoryCap +100% | moveSpeed -40% | `mod_thruster` 重ね合わせで打ち消し | 💡 |
| `mod_thin_hull` | moveSpeed +50%, mineRate +30% | maxHp -40% | sniper 多 Phase で避け切る前提 | 🎯💡 |
| `mod_addict` | 攻撃時にエネルギー消費 +10 で damagePerShot +80% | エネ切れ早い | `mod_solar_panel`, `core_efficiency` | 💡 |
| `mod_short_circuit` | maxEnergy +200%, energyConsume +100% | バッテリーは増えるが燃費悪化 | `mod_solar_panel` | 💡 |
| `mod_old_chassis` | 全モジュールスロット (概念) +1 相当の効果増幅 | maxHp -30%, moveSpeed -20% | 編成のサブ船 (前線に出さない) | 🎯 |

## 2.3 状態変化 (デバフ付与) モジュール

弾命中時にデバフを付与。シナジー: 連射系・貫通系で「常時状態異常」が成立する。

| ID 案 | 効果 | シナジー | フック |
|---|---|---|---|
| `mod_freezer` | 命中時に敵 moveSpeed -50% / 2 秒 | gatling (常時 freeze) | 💡⚡ |
| `mod_burner` | 命中時に DoT 3dps / 4 秒 (重複しない) | 単発高火力より gatling | 💡 |
| `mod_shocker` | 命中時に 15% でスタン 0.5 秒 (確率) | gatling (試行回数) | 🎰⚡ |
| `mod_marker` | 命中した敵への次の攻撃 +30% (リング表示) | `IF_ENEMY_IN_RANGE` 連動 | 💡⚡ |
| `mod_pierce` | 弾が貫通 (最大 3 体) | 列形成する Phase で強い | 💡 |
| `mod_ricochet` | 弾が近隣敵に 1 回跳弾 | 群れ Phase で強い | 💡 |

## 2.4 リカバリー・吸血系

| ID 案 | 効果 | デメリット/コスト | シナジー | フック |
|---|---|---|---|---|
| `mod_leech` | ダメージの 10% を HP に変換 | — | `mod_recoil`, gatling | 💡⚡ |
| `mod_blood_pump` | 敵撃破時 +3 HP | 敵撃破が必要 | `mod_recoil`, berserker | 💡 |
| `mod_scavenger` | 敵撃破時 +10 エネルギー | — | `mod_addict` | 💡 |
| `mod_solar_panel` | 停止中 +5 エネルギー/秒 | 移動中効果なし | WAIT、待ち伏せ build | 💡 |
| `mod_kinetic_battery` | 移動中 +2 エネルギー/秒 | 停止中効果なし | `mod_thruster`、巡回 build | 💡 |
| `mod_emergency_repair` | HP 25% 以下時に自動回復 1 回/Phase (HP +20) | 1 回しか発動しない | `IF_HP_BELOW` で安全圏退避 | 💢⚡ |
| `mod_phase_shift` | HP 0 直前で基地へワープ (Phase 1 回) | クールダウン Phase | 💢⚡ |

## 2.5 経済・採掘特化

| ID 案 | 効果 | デメリット | シナジー | フック |
|---|---|---|---|---|
| `mod_refinery` | 納品時の資源 → クレジット変換率 +50% | — | `mod_cargo` 複数 | ⚡💡 |
| `mod_magnet` | 採掘可能範囲 +80px (惑星から離れて掘れる) | — | sniper 多 Phase | 🎯💡 |
| `mod_crystallizer` | 積載資源 1 個ごとに damagePerShot +3% | 採掘中は強い、納品で消失 | `mod_cargo` ✕ ATTACK 兼用 | 💡⚡ |
| `mod_market_ear` | Phase クリア時のリワード品質 +1 段階 (低確率) | — | 🎰 全般 | 🎰 |
| `mod_treasury` | 所持クレジットが 1000 を超えると damagePerShot +30% | クレジット使うと消える | 蓄財 build | 💡💢 |

## 2.6 マルチ Ship 連携

| ID 案 | 効果 | フック |
|---|---|---|
| `mod_squad_leader` | 半径 250px 内の他 Ship damagePerShot +25% | 💡 |
| `mod_pack_hunter` | 他 Ship が近くにいる時 moveSpeed +40% | 💡 |
| `mod_link` | 他の link 持ち Ship と相互で damagePerShot +15% (近距離) | 💡 |
| `mod_shield_generator` | 半径 200px の Ship に被ダメ -30% シールド | 💡💢 |
| `mod_decoy` | 装着 Ship に敵が優先的に向かう (タンク役) | 🎯💡 |
| `mod_repair_drone` | 他 Ship に +1 HP/秒 (近距離) | 💡 |

## 2.7 コード共鳴モジュール (特定コードと組合せて化ける)

**狙い**: コードビルドと装着の組合せ発見そのものを楽しませる。

| ID 案 | 効果 | 対応コード | フック |
|---|---|---|---|
| `mod_replicator` | REPEAT の実行回数を +1 (例: 3 回設定 → 4 回) | REPEAT | 💡⚡ |
| `mod_quick_caster` | ATTACK_NEAREST の硬直 500ms → 350ms | ATTACK_NEAREST | ⚡ |
| `mod_long_waiter` | WAIT 中の採掘速度・納品速度 2 倍 | WAIT | 💡⚡ |
| `mod_decisive` | 条件 wrapper (IF 系) が真になった直後の 3 秒間、damagePerShot +50% | IF 系全般 | 💡⚡ |
| `mod_predictor` | IF_HP_BELOW / IF_ENEMY_IN_RANGE の判定閾値 +20% 拡張 | IF_HP_BELOW, IF_ENEMY_IN_RANGE | 💡 |
| `mod_optimizer` | 同種 IF コードを 2 つ以上使うと、それぞれの効果に +10% ボーナス | IF 系を多用するビルド | 💡 |
| `mod_signal_amp` | BROADCAST_SIGNAL の受信判定範囲 +200%、IF_SIGNAL の効果倍率 +30% | BROADCAST_SIGNAL / IF_SIGNAL | 💡 |

---

# Part 3. 新オムニ・コア案

(全 Ship/基地/経済に効くため、Ship 個別ビルドより「Run 全体の方向性」を変える)

| ID 案 | 効果 | デメリット | フック |
|---|---|---|---|
| `core_critical` | 全攻撃 10% で 3 倍ダメ | — | 🎰⚡ |
| `core_chain` | 敵撃破時に隣接敵へ撃破ダメージの 30% 伝播 | — | ⚡💡 |
| `core_lifesteal` | 全 Ship 攻撃の 2% を HP 吸収 | — | 💡 |
| `core_overclock` | ゲーム全体速度 +15% (敵も含む) | 操作・判断が忙しくなる | 🎯💢 |
| `core_thrift` | リワードで貰えるアイテムのレア度確率を SR+L 寄りにシフト | N/R 入手減 | 🎰🎯 |
| `core_market` | 所持クレジット 100 ごとに全 Ship damagePerShot +1% (上限 +50%) | クレジット使うと弱体 | 💢💡 |
| `core_void` | アイテム捨てた時にクレジット $20 還元 | — | 🎯 |
| `core_swarm` | 同種モジュール (typeId が同じ) を Ship 全体で N 個装着するごとに、その効果 +5% | 同種重ね build を称揚 | 💡 |
| `core_diversity` | 異なる typeId のモジュールを N 種類装着するごとに全効果 +3% | バランス build を称揚 | 💡 |
| `core_gambler` | ガチャ開封時の 3 候補がすべて同レア度の上位 (1 段階) になる確率 +15% | — | 🎰 |

> 💡 メモ: `core_swarm` と `core_diversity` を **同時所持で打ち消し合う**設計にすると、
> 「どちらの方針で行くか」を Run 序盤で決断させる構造になる (🎯 強化)。

---

# Part 4. 大型新システム案

### 4.1 シナジータグ (セットボーナス) システム

各アイテムに 1〜2 個の**タグ**を付与し、同タグ装着数に応じてセットボーナスを発動。

- タグ案: 「機械」「精密」「重装」「俊敏」「不安定」「電気」「炎」「冷凍」「採掘」「サポート」
- 例: 機械タグ 3 個装着 → 「全モジュール効果 +10%」
- 例: 不安定タグ 3 個装着 → 「攻撃 +50% / ランダム自爆 0.5%」
- 例: 冷凍 + 電気 タグ 2 個ずつ → 「弾命中時に scatter ダメ (周囲 50px)」

**フック**: 🎯 ビルド方針の自律性、💡 セットボーナス発見、⚡ 装着で即変化

### 4.2 ジョブ / アーキタイプ システム

Ship に「役割」を設定 (装着モジュールで自動判定 or 明示選択)。

- **採掘特化**: 攻撃力 -50% / 採掘 +100% / インベントリ +50%
- **戦闘特化**: 採掘速度 -50% / 攻撃 +50%
- **タンク**: moveSpeed -30% / maxHp +100% / 自動的に敵をひきつける
- **サポート**: 自身攻撃 -70% / 周囲 Ship 効果増幅

**フック**: 🎯 「この船は採掘係」と決める楽しみ、💡 編成シナジー

### 4.3 進化 (合成) システム

同 typeId のモジュールを 2 個合成 → レア度 1 段階アップ。

- N+N → R / R+R → SR / SR+SR → L
- 装着していない余剰モジュールが「無駄ではない」感
- ガチャの被りも嬉しい

**フック**: 💢 損失回避 (捨てるはずだったものに価値)、⚡ 即変化、🎰 ガチャ意欲

### 4.4 呪い / 祝福システム

ガチャの低確率枠に **「呪いアイテム」** が混入。装着で強力なデメリットがつくが、装着中は祝福確率が上昇。

- 呪い例: 「damagePerShot -50%」「攻撃時 5% で自分にダメ」
- 祝福例: 「全ガチャに L 確率 +5%」「Phase クリア報酬 +1 個」
- 呪い 3 個装着で「呪解の儀」イベント発生 → L 確定報酬

**フック**: 🎰 (混入)、💢 (リスク)、💡 (覚悟ビルド)

### 4.5 ベットシステム (Phase 開始前の賭け)

各 Phase の「▶ 開始」ボタン横に**「賭ける」**選択。

- 「ノーダメージで勝つ」を賭ける → 報酬 ×2、失敗で報酬なし
- 「20 秒以内クリア」を賭ける → 報酬 ×3
- 「Ship を使わずクリア (基地砲塔のみ)」を賭ける → 報酬 ×4

**フック**: 💢 損失回避、🎯 挑戦の自律性、⚡ 達成時に明確な追加報酬

### 4.6 リスクモード / モディファイア

Phase 開始前に**モディファイア**を選んで難易度操作。

- 「敵 HP +100% / 報酬 +1」
- 「Ship 使用不可 / 報酬 +2」
- 「ランダムに 5 秒ごとに 1 体追加スポーン / 報酬 +1」

**フック**: 🎯 リスク選択、🎰 上振れ、💢 損失感

### 4.7 コード合成 (融合) システム

2 つのコードを合成して新コードを作る。

- `MOVE_TO` + `ATTACK_NEAREST` = `MOVE_AND_SHOOT` (移動中も撃つ)
- `WAIT` + `ATTACK_NEAREST` = `SENTRY_MODE` (採掘 / 補給しながら近接敵を撃つ)
- `REPEAT` + `IF_ENEMY_IN_RANGE` = `PATROL` (パトロール感)

**フック**: 💡 大爆発、🎯 自分のコードを「発明」する自律性

### 4.8 「プログラム経験値」システム

プログラム内の各コードノードが実行回数に応じて経験値を獲得。一定回数で勝手にパワーアップ。

- 100 回実行 → そのノードの効果 +5% (累積上限あり)
- ノードを削除すると経験値消失 (損失回避)
- Run 跨ぎ持続は無し (Run リセットでクリア、永続化方針に反しない)

**フック**: ⚡ 成長可視化、💢 損失回避

### 4.9 シェアード・エナジーバンク

基地が「共有エネルギープール」を持ち、納品時に 10% がプールに貯まる。
特定コード or モジュールでプールから引き出して使う。

- `WITHDRAW_ENERGY` コード (引き出し量指定)
- `mod_bank_link` モジュール (エネ消費がプール優先)

**フック**: 💡 経済 build、🎯 配分判断

### 4.10 アクティブスキル (キーバインド) システム

Ship ごとに 1 つの「アクティブスキル」を割り当て、キー (1/2/3/Q/W/E) で発動。

- 既存の `SELF_DESTRUCT`, `OVERCHARGE_SHOT`, `BUILD_BARRIER` 等をプログラムに置く以外にも、
  「咄嗟の手動発動」枠として用意
- クールダウンあり

**フック**: ⚡ 直接フィードバック、🎯 操作介入の自律性

---

# Part 5. 横断的な設計メモ

## 6.1 「レア度で値だけ変える」を避ける具体パターン

レア度差分の付け方の選択肢:

1. **判定の幅**: N は 1 種別指定、L は最大 3 種別 OR 指定 (`IF_NEAREST_ENEMY_IS`)
2. **発動回数**: N は Phase 1 回、L は Phase 3 回 (`mod_emergency_repair`, `mod_phase_shift`)
3. **発動条件の緩さ**: N は HP 10% 以下から、L は HP 50% 以下から (`mod_berserker`)
4. **適用範囲**: N は半径 100px、L は半径 300px (`mod_squad_leader`)
5. **デメリットの軽さ**: N は moveSpeed -20%、L は -5% (`mod_glass_cannon`)
6. **追加効果**: N は基本効果のみ、L は基本効果 + 副次効果 1 つ (`mod_resonator` で L のみ「他コア効果も +10%」)
7. **クールダウン**: N は CD 10s、L は CD 3s
8. **ターゲット数**: N は単体、L は範囲

## 6.2 シナジーマトリクス (抜粋)

特に強い組合せ予想:

| 軸となるアイテム | 噛み合うアイテム | 効果 |
|---|---|---|
| `mod_gatling` | `mod_burner` + `mod_freezer` + `mod_shocker` | 連射 = 常時デバフ |
| `mod_recoil` + `mod_glass_cannon` | `mod_leech` + `mod_blood_pump` | 自傷を吸血で打ち消し、爆発火力 |
| `mod_capacitor` + `mod_overdrive` | WAIT + `IF_ENEMY_IN_RANGE` | 待ち伏せ → 一撃必殺 |
| `mod_bomb` 複数 + `mod_chain_reactor` | `mod_dual_wield` | ボム連鎖爆発 |
| `mod_pacifist` (採掘特化) | `mod_refinery` + `mod_cargo` + `mod_drill` | 純採掘船 |
| `mod_squad_leader` + `mod_decoy` | 複数 Ship 編成 | 編成戦術 |
| `core_market` + `mod_treasury` | 蓄財 build | クレジット温存 |
| `core_swarm` + 同種モジュール多数 | — | 縦特化 build |
| `core_diversity` + 異種モジュール多数 | — | 横バランス build |

## 6.3 「捨てる」UI の重要性

トレードオフ系・呪い系・進化システムを入れる場合、**装着解除 / 売却 / 破棄** の UI が必要。
現状の Inventory には捨てる導線が無い → 別途仕様策定要。

## 6.4 段階導入の提案 (個人的優先度メモ)

実装するなら以下の順で「小さく試す」を推奨:

1. **デメリット付きモジュール 2〜3 種** (例: `mod_glass_cannon`, `mod_recoil`, `mod_leech`)
   - 既存 Module システムをそのまま使えるので低コスト
   - 損失回避・シナジー発見の両方を試せる
2. **IF 系コード 2〜3 種** (例: `IF_ENERGY_BELOW`, `IF_BOSS_ALIVE`, `IF_RANDOM`)
   - 既存 ITEM_CODE wrapper をそのまま使えるので低コスト
3. **シナジー核モジュール 1〜2 種** (例: `mod_resonator`, `mod_capacitor`)
   - 既存スタック計算系の拡張で済む可能性
4. **新システム** (進化・タグ・ベット 等) は別 plan で検討

---

# Part 6. 未検討 / 次の論点

- multi-ship 連携系を入れるなら、Ship 識別 UI (色分け / 番号) が必須
- 「捨てる」UI 未整備のままトレードオフ系を増やすと、悪いビルドにロックされる Run が発生する
- アクティブスキル制を入れると「コードだけで動かす」というコア体験が薄まる懸念あり → 慎重に
- 進化システム導入時、現 Inventory のメモリ揮発性 (Run 毎リセット) との整合確認要
- レア度差分の「種類数」をどこまで増やすか (現状: 値違いのみ → 効果違いまで広げると実装コスト増)

