import type { Code } from './Code';

/**
 * Program — Code の配列 + 実行カーソル。
 *
 * Phase 2 で編集 UI 用のミューテーション API を追加。
 * Executor は同じ Program インスタンスへの参照を握り続けるため、
 * 編集中も走行中の Ship が破綻しないようカーソルを適切に追従させる:
 *
 *  - insert(i): i <= cursor なら cursor += 1 (実行中コードを指し続ける)
 *  - removeAt(i): i < cursor なら cursor -= 1。i === cursor なら据え置き
 *    (= 次のコードを指す。末尾なら length と等しくなり Executor が停止)
 *  - moveUp/moveDown: カーソルは「乗っていたコード」に追従
 *  - append/replaceCode: カーソル不変
 *
 * 配列の中身を破壊的に変更するため `private readonly codes` のまま
 * (readonly は再代入禁止だけで splice/push は許可される)。
 */
export class Program {
  private readonly codes: Code[];
  private cursor: number = 0;

  constructor(codes: Code[]) {
    this.codes = codes;
  }

  // ─── 読み取り API ────────────────────────────────────────

  /** 現在カーソルが指すコード。末尾を越えていれば null。 */
  public currentCode(): Code | null {
    return this.codes[this.cursor] ?? null;
  }

  /** 次のコードへ進む。 */
  public advance(): void {
    this.cursor += 1;
  }

  /** カーソルが末尾を越えたか。 */
  public isDone(): boolean {
    return this.cursor >= this.codes.length;
  }

  /** カーソルを先頭へ戻す。 */
  public reset(): void {
    this.cursor = 0;
  }

  /** コード数。 */
  public get length(): number {
    return this.codes.length;
  }

  /** UI 表示用にコード列を読み取る (変更不可)。 */
  public getCodes(): ReadonlyArray<Code> {
    return this.codes;
  }

  /** 走行中コードを UI でハイライトするためのカーソル位置。 */
  public get cursorIndex(): number {
    return this.cursor;
  }

  // ─── ミューテーション API (編集 UI から呼ばれる) ────────

  /** 末尾に追加。 */
  public append(code: Code): void {
    this.codes.push(code);
  }

  /** index に挿入。i <= cursor ならカーソルを 1 つ後ろにずらす。 */
  public insert(index: number, code: Code): void {
    const i = Math.min(Math.max(index, 0), this.codes.length);
    this.codes.splice(i, 0, code);
    if (i <= this.cursor) this.cursor += 1;
  }

  /**
   * index のコードを削除。
   *  - index < cursor: cursor -= 1 (同じ実行中コードを指し続ける)
   *  - index === cursor: cursor 据え置き = 次のコードへ進む。
   *    末尾削除時は cursor === length となり Executor が停止する。
   *  - index > cursor: 変更なし
   */
  public removeAt(index: number): void {
    if (index < 0 || index >= this.codes.length) return;
    this.codes.splice(index, 1);
    if (index < this.cursor) {
      this.cursor -= 1;
    } else if (index === this.cursor) {
      this.cursor = Math.min(this.cursor, this.codes.length);
    }
  }

  /**
   * index のコードをまるごと差し替え。パラメータ編集用。
   * カーソル不変: index === cursor なら Executor が次 tick で新パラメータを使う (ライブ反映)。
   */
  public replaceCode(index: number, code: Code): void {
    if (index < 0 || index >= this.codes.length) return;
    this.codes[index] = code;
  }

  public moveUp(index: number): void {
    if (index > 0) this.swap(index, index - 1);
  }

  public moveDown(index: number): void {
    if (index < this.codes.length - 1) this.swap(index, index + 1);
  }

  /** カーソルは「乗っていたコード」を追従する。 */
  private swap(a: number, b: number): void {
    if (a < 0 || b < 0 || a >= this.codes.length || b >= this.codes.length) return;
    const tmp = this.codes[a]!;
    this.codes[a] = this.codes[b]!;
    this.codes[b] = tmp;
    if (this.cursor === a) this.cursor = b;
    else if (this.cursor === b) this.cursor = a;
  }

  // ─── Path ベースの操作 API (Phase 5 後: インライン階層編集用) ──────────
  //
  // path: number[] は root を起点としたコード位置を表す。
  // 例: [2]    = root の 3 番目のコード
  //     [2, 0] = root の 3 番目 (REPEAT) の中の 1 番目のコード
  //
  // root scope の操作は既存 API (append/insert/...) と等価。カーソル追従は
  // root scope のみで、ネスト内は cursor を動かさない (Executor 側で
  // getRunningPath で別途追跡)。

  /** path 直前の親 (root or REPEAT.children) の Code 配列を返す。path が不正なら null。 */
  public getCodesAtParent(path: ReadonlyArray<number>): Code[] | null {
    if (path.length === 0) return this.codes;
    let arr: Code[] = this.codes;
    for (let i = 0; i < path.length - 1; i++) {
      const idx = path[i]!;
      const c = arr[idx];
      if (!c || c.type !== 'REPEAT') return null;
      arr = c.children;
    }
    return arr;
  }

  /** path 指すコード (末尾 index の位置)。なければ null。 */
  public getCodeAt(path: ReadonlyArray<number>): Code | null {
    if (path.length === 0) return null;
    const parent = this.getCodesAtParent(path);
    if (!parent) return null;
    return parent[path[path.length - 1]!] ?? null;
  }

  /**
   * parentPath が指す Code 配列の `index` 位置にコードを挿入。
   * parentPath が空配列 = root scope。
   * root scope への挿入は既存 `insert` 経由でカーソル追従。
   */
  public insertAtPath(parentPath: ReadonlyArray<number>, index: number, code: Code): void {
    if (parentPath.length === 0) {
      this.insert(index, code);
      return;
    }
    const parent = this.getCodesAtParent([...parentPath, 0]);
    if (!parent) return;
    const i = Math.min(Math.max(index, 0), parent.length);
    parent.splice(i, 0, code);
  }

  /** parentPath の末尾に追加。 */
  public appendAtPath(parentPath: ReadonlyArray<number>, code: Code): void {
    if (parentPath.length === 0) {
      this.append(code);
      return;
    }
    const parent = this.getCodesAtParent([...parentPath, 0]);
    if (!parent) return;
    parent.push(code);
  }

  /** path のコードを削除。root scope ならカーソル追従。 */
  public removeAtPath(path: ReadonlyArray<number>): void {
    if (path.length === 0) return;
    if (path.length === 1) {
      this.removeAt(path[0]!);
      return;
    }
    const parent = this.getCodesAtParent(path);
    if (!parent) return;
    const last = path[path.length - 1]!;
    if (last < 0 || last >= parent.length) return;
    parent.splice(last, 1);
  }

  /** path のコードを差し替え。root scope ならカーソル不変。 */
  public replaceCodeAtPath(path: ReadonlyArray<number>, code: Code): void {
    if (path.length === 0) return;
    if (path.length === 1) {
      this.replaceCode(path[0]!, code);
      return;
    }
    const parent = this.getCodesAtParent(path);
    if (!parent) return;
    const last = path[path.length - 1]!;
    if (last < 0 || last >= parent.length) return;
    parent[last] = code;
  }

  /** path のコードを 1 つ上に移動。root scope ならカーソル追従。 */
  public moveUpAtPath(path: ReadonlyArray<number>): void {
    if (path.length === 0) return;
    if (path.length === 1) {
      this.moveUp(path[0]!);
      return;
    }
    const parent = this.getCodesAtParent(path);
    if (!parent) return;
    const i = path[path.length - 1]!;
    if (i <= 0 || i >= parent.length) return;
    [parent[i - 1], parent[i]] = [parent[i]!, parent[i - 1]!];
  }

  /** path のコードを 1 つ下に移動。root scope ならカーソル追従。 */
  public moveDownAtPath(path: ReadonlyArray<number>): void {
    if (path.length === 0) return;
    if (path.length === 1) {
      this.moveDown(path[0]!);
      return;
    }
    const parent = this.getCodesAtParent(path);
    if (!parent) return;
    const i = path[path.length - 1]!;
    if (i < 0 || i >= parent.length - 1) return;
    [parent[i + 1], parent[i]] = [parent[i]!, parent[i + 1]!];
  }
}
