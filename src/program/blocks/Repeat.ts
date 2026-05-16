/**
 * REPEAT の評価ロジックは Executor のスタック制御が直接担当するため、
 * このファイルには tick 関数を置かない (Executor の switch から呼ばれることはない設計)。
 *
 * 1 ファイル 1 種の慣習を保つため、ブロック種別ごとの仕様をここに集約する:
 *  - `{ type: 'REPEAT'; times: number; children: Block[] }`
 *  - `times === 0` または `children.length === 0` のとき即スキップ (push せず通過)
 *  - children は Executor のスタック上で別フレームとして実行される
 *  - children 自体に REPEAT を含めて入れ子可能 (スタックが深くなる)
 *  - カーソル追従はトップレベル (Program) のみ。children を編集中に対応する Executor frame
 *    があれば cursor は次 tick で自然にクランプ (range を超えていれば末尾扱い)
 *
 * 将来的に `tickRepeat` を独立化したくなったら Executor から呼べるよう context にスタック
 * 操作 API を渡すリファクタが必要。Phase 3 では Executor 内に閉じる。
 */
export {};
