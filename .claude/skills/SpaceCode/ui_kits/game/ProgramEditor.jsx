// ProgramEditor — overlay that opens when a ship is clicked.
// Three columns: palette (add) / program list (with REPEAT nesting) / param editor.
//
// Code shape:
//   { type: 'MOVE_TO',         target: 'base' | 'planetA' | 'planetB', id }
//   { type: 'MINE',            target: 'planetA' | 'planetB',          id }
//   { type: 'DEPOSIT',                                                 id }
//   { type: 'ATTACK_NEAREST',                                          id }
//   { type: 'WAIT_UNTIL_FULL',                                         id }
//   { type: 'REPEAT', times: number, children: Code[],                 id }

const CODE_LABEL = {
  MOVE_TO:        '移動',
  MINE:           '採掘',
  DEPOSIT:        '納品',
  ATTACK_NEAREST: '攻撃',
  WAIT_UNTIL_FULL:'満タンまで待機',
  REPEAT:         '繰り返し (N 回)',
};

const CODE_COLOR_CLS = {
  MOVE_TO:         'sc-btn',
  MINE:            'sc-btn sc-btn--resource',
  DEPOSIT:         'sc-btn sc-btn--resource',
  ATTACK_NEAREST:  'sc-btn sc-btn--danger',
  WAIT_UNTIL_FULL: 'sc-btn sc-btn--dim',
  REPEAT:          'sc-btn sc-btn--success',
};

const LOCATION_LABELS = {
  base:    '基地',
  planetA: '惑星A',
  planetB: '惑星B',
};

const ALL_LOCATIONS = ['base', 'planetA', 'planetB'];
const ALL_PLANETS = ['planetA', 'planetB'];

let nextCodeId = 1;
function newCode(type) {
  const id = `c${nextCodeId++}`;
  switch (type) {
    case 'MOVE_TO':         return { id, type, target: 'planetA' };
    case 'MINE':            return { id, type, target: 'planetA' };
    case 'DEPOSIT':         return { id, type };
    case 'ATTACK_NEAREST':  return { id, type };
    case 'WAIT_UNTIL_FULL': return { id, type };
    case 'REPEAT':          return { id, type, times: 3, children: [] };
  }
}

function sampleCodes() {
  return [
    newCode('MOVE_TO'),
    newCode('MINE'),
    (() => { const c = newCode('MOVE_TO'); c.target = 'base'; return c; })(),
    newCode('DEPOSIT'),
  ];
}

function codeLabel(code) {
  switch (code.type) {
    case 'MOVE_TO':         return `移動 → ${LOCATION_LABELS[code.target]}`;
    case 'MINE':            return `採掘: ${LOCATION_LABELS[code.target]}`;
    case 'DEPOSIT':         return '納品';
    case 'ATTACK_NEAREST':  return '攻撃 (最寄り)';
    case 'WAIT_UNTIL_FULL': return '満タンまで待機';
    case 'REPEAT':          return `繰り返し × ${code.times}`;
  }
}

// ─── Path operations ──────────────────────────────────────
// A path is number[]; root scope is []. The leaf index points at the code
// in its parent's children.

function getAtPath(codes, path) {
  let cur = codes;
  let item = null;
  for (let i = 0; i < path.length; i++) {
    item = cur[path[i]];
    if (!item) return null;
    if (i < path.length - 1) cur = item.children || [];
  }
  return item;
}

function parentArrayOf(codes, path) {
  let cur = codes;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur[path[i]].children;
  }
  return cur;
}

function pathEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function cloneCodes(codes) {
  return codes.map((c) =>
    c.type === 'REPEAT'
      ? { ...c, children: cloneCodes(c.children) }
      : { ...c });
}

// ─── ProgramEditor ────────────────────────────────────────

function ProgramEditor({ codes, onChange, onClose }) {
  const [selectedPath, setSelectedPath] = React.useState(null);

  // Mutation helpers — operate on a fresh copy.
  const apply = (fn) => {
    const next = cloneCodes(codes);
    const newPath = fn(next);
    onChange(next);
    if (newPath !== undefined) setSelectedPath(newPath);
  };

  const addCode = (type) => {
    apply((next) => {
      const c = newCode(type);
      if (!selectedPath) {
        next.push(c);
        return [next.length - 1];
      }
      const sel = getAtPath(next, selectedPath);
      if (sel && sel.type === 'REPEAT') {
        sel.children.push(c);
        return [...selectedPath, sel.children.length - 1];
      }
      const parent = parentArrayOf(next, selectedPath);
      const idx = selectedPath[selectedPath.length - 1] + 1;
      parent.splice(idx, 0, c);
      return [...selectedPath.slice(0, -1), idx];
    });
  };

  const loadSample = () => {
    onChange(sampleCodes());
    setSelectedPath(null);
  };

  const moveUp = (path) => {
    apply((next) => {
      const parent = parentArrayOf(next, path);
      const i = path[path.length - 1];
      if (i <= 0) return path;
      [parent[i - 1], parent[i]] = [parent[i], parent[i - 1]];
      return [...path.slice(0, -1), i - 1];
    });
  };

  const moveDown = (path) => {
    apply((next) => {
      const parent = parentArrayOf(next, path);
      const i = path[path.length - 1];
      if (i >= parent.length - 1) return path;
      [parent[i + 1], parent[i]] = [parent[i], parent[i + 1]];
      return [...path.slice(0, -1), i + 1];
    });
  };

  const remove = (path) => {
    apply((next) => {
      const parent = parentArrayOf(next, path);
      parent.splice(path[path.length - 1], 1);
      // After remove, if the deleted item was selected, deselect.
      if (pathEq(path, selectedPath)) return null;
      return selectedPath;
    });
  };

  const updateSelected = (patch) => {
    if (!selectedPath) return;
    apply((next) => {
      const sel = getAtPath(next, selectedPath);
      Object.assign(sel, patch);
      return selectedPath;
    });
  };

  const selected = selectedPath ? getAtPath(codes, selectedPath) : null;

  // ─── Render ──────────────────────────────────────────────
  return (
    <React.Fragment>
      <div className="sc-backdrop" onClick={onClose}/>
      <div className="sc-card sc-editor-card">
        <div className="sc-card-title">プログラム編集</div>
        <div className="sc-card-subtitle">
          コードを置いた順に実行 → 末尾まで来たら自動で先頭にループ。「繰り返し」は N 回だけ繰り返したい時に使用。
        </div>
        <button className="sc-btn sc-btn--close sc-close" onClick={onClose}>✕ 閉じる</button>

        <div className="sc-editor-cols">
          {/* ── Left: palette ── */}
          <div className="sc-palette">
            <div className="sc-col-title">コード追加</div>
            <div className="sc-col-sub">置いた順に上から実行 → 自動でループ</div>
            {Object.entries(CODE_LABEL).map(([type, label]) => (
              <button key={type}
                      className={CODE_COLOR_CLS[type]}
                      onClick={() => addCode(type)}>
                {label}
              </button>
            ))}
            <div style={{ height: 8 }}/>
            <div className="sc-col-title">テンプレ</div>
            <button className="sc-btn sc-btn--resource" onClick={loadSample}>サンプル読み込み</button>
            <div style={{ height: 24 }}/>
            <button className="sc-btn sc-btn--danger" onClick={onClose}>✕ 閉じる</button>
          </div>

          {/* ── Center: program list ── */}
          <div className="sc-list">
            <div className="sc-list-header">
              プログラム (上から下へ → 末尾まで来たら自動で先頭へループ)
            </div>
            {codes.length === 0 ? (
              <div className="sc-empty">(コードがありません — 左から追加してください)</div>
            ) : (
              <React.Fragment>
                <div className="sc-list-marker">▼ ここから実行</div>
                <CodeList
                  codes={codes}
                  path={[]}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                  onRemove={remove}
                />
                <div className="sc-list-marker loop">↻ 末尾まで来たら先頭に戻る (自動ループ)</div>
              </React.Fragment>
            )}
          </div>

          {/* ── Right: param editor ── */}
          <div className="sc-params">
            <div className="sc-col-title">パラメータ</div>
            <ParamEditor selected={selected} onChange={updateSelected}/>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

// ─── CodeList — recursive rendering of code rows with nesting ─────
function CodeList({ codes, path, selectedPath, onSelect, onMoveUp, onMoveDown, onRemove }) {
  return (
    <div>
      {codes.map((c, i) => {
        const myPath = [...path, i];
        const isSelected = pathEq(myPath, selectedPath);
        const isRepeat = c.type === 'REPEAT';
        return (
          <React.Fragment key={c.id}>
            <div
              className={`sc-row${isRepeat ? ' repeat' : ''}${isSelected ? ' selected' : ''}`}
              onClick={(e) => { e.stopPropagation(); onSelect(myPath); }}
            >
              <span>{codeLabel(c)}</span>
              <div className="actions">
                <button className={`sc-rbtn${i === 0 ? ' disabled' : ''}`}
                        onClick={(e) => { e.stopPropagation(); if (i > 0) onMoveUp(myPath); }}>▲</button>
                <button className={`sc-rbtn${i === codes.length - 1 ? ' disabled' : ''}`}
                        onClick={(e) => { e.stopPropagation(); if (i < codes.length - 1) onMoveDown(myPath); }}>▼</button>
                <button className="sc-rbtn"
                        onClick={(e) => { e.stopPropagation(); onRemove(myPath); }}>✕</button>
              </div>
            </div>
            {isRepeat && (
              <div className="sc-nested" style={{ position: 'relative' }}>
                <CodeList codes={c.children} path={myPath}
                          selectedPath={selectedPath} onSelect={onSelect}
                          onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove}/>
                {/* close-bracket line: positioned at the bottom of the nested group */}
                <span style={{
                  position: 'absolute',
                  left: 8, bottom: 6,
                  width: 12, height: 2,
                  background: 'color-mix(in srgb, var(--accent) 55%, transparent)',
                }}/>
                {/* vertical bracket line continues to bottom */}
                <span style={{
                  position: 'absolute',
                  left: 8, top: 0, bottom: 6, width: 2,
                  background: 'color-mix(in srgb, var(--accent) 55%, transparent)',
                }}/>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── ParamEditor — right column based on selected code type ─────
function ParamEditor({ selected, onChange }) {
  if (!selected) {
    return <div style={{ color: 'var(--ui-dim)', textAlign: 'center', padding: '40px 0' }}>
      コードを選択してください
    </div>;
  }
  switch (selected.type) {
    case 'DEPOSIT':
      return <div style={{ color: 'var(--ui-dim)', textAlign: 'center', padding: '40px 0' }}>納品 — 設定なし</div>;
    case 'ATTACK_NEAREST':
      return <div style={{ color: 'var(--ui-dim)', textAlign: 'center', padding: '40px 0' }}>攻撃 — 設定なし</div>;
    case 'WAIT_UNTIL_FULL':
      return <div style={{ color: 'var(--ui-dim)', textAlign: 'center', padding: '40px 0' }}>満タンまで待機 — 設定なし</div>;

    case 'MOVE_TO':
      return (
        <div>
          <div className="sc-params-title">移動先</div>
          {ALL_LOCATIONS.map((id) => (
            <div key={id}
                 className={`sc-chip${selected.target === id ? ' selected' : ''}`}
                 onClick={() => onChange({ target: id })}>
              {LOCATION_LABELS[id]}
            </div>
          ))}
        </div>
      );

    case 'MINE':
      return (
        <div>
          <div className="sc-params-title">採掘先</div>
          {ALL_PLANETS.map((id) => (
            <div key={id}
                 className={`sc-chip${selected.target === id ? ' selected' : ''}`}
                 onClick={() => onChange({ target: id })}>
              {LOCATION_LABELS[id]}
            </div>
          ))}
        </div>
      );

    case 'REPEAT':
      return (
        <div>
          <div className="sc-params-title">繰り返し回数</div>
          <div className="sc-spinner">
            <div className="step" onClick={() => onChange({ times: Math.max(1, selected.times - 1) })}>−</div>
            <div className="val">{selected.times}</div>
            <div className="step" onClick={() => onChange({ times: Math.min(20, selected.times + 1) })}>+</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ui-dim)', textAlign: 'center', marginTop: 14 }}>
            中身はリストでそのまま編集
          </div>
          <div style={{ fontSize: 12, color: 'var(--accent)', textAlign: 'center', marginTop: 4 }}>
            子コード: {selected.children.length}
          </div>
        </div>
      );
  }
}

Object.assign(window, {
  ProgramEditor, sampleCodes, newCode, codeLabel,
  CODE_LABEL, LOCATION_LABELS, ALL_LOCATIONS, ALL_PLANETS,
});
