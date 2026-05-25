// SpaceCode entity primitives — React SVG recreations of the Phaser.Graphics drawings.
// All components are pure (props in → SVG out). No internal state.

const C = {
  bg: '#05070d',
  base: '#a07bff',
  baseRing: '#5a3ec9',
  ally: '#4ea1ff',
  enemy: '#ff4d5a',
  enemyFast: '#ff9040',
  enemyTank: '#b01828',
  resource: '#ffd24a',
  accent: '#3ee0c5',
  highlight: '#ffffff',
  uiDim: '#6b7da0',
  starDim: '#1a2540',
  starBright: '#6b7da0',
  panelBg: '#1a2540',
  planetBody: '#8a6f1f',
  planetMark: '#6b551a',
};

/* ─── BaseEntity ───────────────────────────────────────
   Halo + range ring (dashed) + outer rotating ring + 4 notches
   + body + center cross + central core + barrel.
   Sized to game: radius 28, ringRadius 36, range 260.
*/
function BaseEntity({ x, y, range = 260 }) {
  const size = (range + 20) * 2;
  return (
    <svg
      style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, pointerEvents: 'none' }}
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
    >
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        {/* range ring (faint outer + dashed) */}
        <circle r={range} fill="none" stroke={C.accent} strokeWidth="1" opacity="0.18"/>
        <circle r={range} fill="none" stroke={C.accent} strokeWidth="2" opacity="0.32"
                strokeDasharray="6 6"/>
        {/* halo */}
        <circle r={42} fill={C.base} opacity="0.18"/>
        {/* rotating outer ring */}
        <g style={{ animation: 'sc-rot 12s linear infinite', transformOrigin: 'center' }}>
          <circle r={36} fill="none" stroke={C.baseRing} strokeWidth="2" opacity="0.85"/>
          {[0, 90, 180, 270].map((a) => (
            <line key={a}
                  x1={0} y1={-32} x2={0} y2={-40}
                  stroke={C.baseRing} strokeWidth="3"
                  transform={`rotate(${a})`}/>
          ))}
        </g>
        {/* body */}
        <circle r={28} fill={C.base}/>
        {/* core */}
        <circle r={11} fill={C.accent}/>
        {/* cross */}
        <g stroke={C.highlight} strokeWidth="2" opacity="0.9">
          <line x1={-16} y1={0} x2={16} y2={0}/>
          <line x1={0} y1={-16} x2={0} y2={16}/>
        </g>
        {/* barrel */}
        <rect x={0} y={-3} width={22} height={6} fill={C.highlight} opacity="0.95"/>
        <rect x={20} y={-4} width={4} height={8} fill={C.accent}/>
      </g>
      <style>{`@keyframes sc-rot { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

/* ─── ShipEntity ─────────────────────────────────────── */
function ShipEntity({ x, y, rotation = 0, alpha = 1 }) {
  const r = 12;
  const size = 60;
  return (
    <svg
      style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, pointerEvents: 'none', opacity: alpha }}
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
    >
      <g transform={`translate(${size / 2}, ${size / 2}) rotate(${(rotation * 180) / Math.PI})`}>
        <circle r={r + 5} fill={C.ally} opacity="0.18"/>
        <polygon
          points={`${r},0 ${-r*0.7},${-r*0.75} ${-r*0.4},0 ${-r*0.7},${r*0.75}`}
          fill={C.ally}
        />
        <circle r={r * 0.25} fill={C.accent}/>
      </g>
    </svg>
  );
}

/* ─── ShipWithBars — used when a ship is on the canvas. ─── */
function ShipWithBars({ ship, selected, onClick }) {
  const r = 12;
  const barW = r * 2.2;
  return (
    <div
      className={`sc-ship-wrap${selected ? ' selected' : ''}`}
      style={{ left: ship.x - 30, top: ship.y - 30, width: 60, height: 60 }}
      onClick={onClick}
    >
      <ShipEntity x={30} y={30} rotation={ship.rotation || 0}/>
      {/* status bars */}
      <div style={{
        position: 'absolute', left: 30 - barW / 2, top: 30 + r + 6,
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        <div style={{ width: barW, height: 2, background: C.panelBg }}>
          <div style={{ width: `${(ship.hp / 30) * 100}%`, height: 2,
                        background: ship.hp / 30 > 0.4 ? C.accent : C.enemy }}/>
        </div>
        <div style={{ width: barW, height: 2, background: C.panelBg }}>
          <div style={{ width: `${(ship.energy / 100) * 100}%`, height: 2, background: C.ally }}/>
        </div>
        <div style={{ width: barW, height: 2, background: C.panelBg }}>
          <div style={{ width: `${(ship.inventory / 20) * 100}%`, height: 2, background: C.resource }}/>
        </div>
      </div>
    </div>
  );
}

/* ─── EnemyEntity ────────────────────────────────────── */
function EnemyEntity({ x, y, type = 'basic', rotation = 0 }) {
  const stats = {
    basic: { color: C.enemy, r: 10 },
    fast:  { color: C.enemyFast, r: 8 },
    tank:  { color: C.enemyTank, r: 14 },
  }[type];
  const size = 50;
  return (
    <svg
      style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, pointerEvents: 'none' }}
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
    >
      <g transform={`translate(${size / 2}, ${size / 2}) rotate(${(rotation * 180) / Math.PI})`}>
        <circle r={stats.r + 5} fill={stats.color} opacity="0.18"/>
        <polygon
          points={`${stats.r},0 ${-stats.r*0.7},${-stats.r*0.8} ${-stats.r*0.7},${stats.r*0.8}`}
          fill={stats.color}
        />
        <circle r={stats.r * 0.25} fill={C.highlight} opacity={type === 'fast' ? 1 : 0.85}/>
      </g>
    </svg>
  );
}

/* ─── PlanetEntity ───────────────────────────────────── */
function PlanetEntity({ x, y, radius = 30, resources = 0.75, depleted = false }) {
  const ratio = Math.max(0, Math.min(1, resources));
  const size = (radius + 20) * 2;
  const arcLen = 2 * Math.PI * (radius + 6) * ratio;
  const arcGap = 2 * Math.PI * (radius + 6) * (1 - ratio);
  return (
    <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2,
                  width: size, height: size, pointerEvents: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          <circle r={radius + 10} fill={C.resource} opacity="0.12"/>
          {/* resource arc — rotates slowly via CSS */}
          <g style={{ animation: 'sc-rot 18s linear infinite', transformOrigin: 'center' }}>
            {!depleted && ratio > 0 && (
              <circle r={radius + 6} fill="none" stroke={C.resource} strokeWidth="2"
                      opacity="0.85"
                      strokeDasharray={`${arcLen} ${arcGap}`}
                      transform="rotate(-90)"/>
            )}
          </g>
          {/* body */}
          <circle r={radius} fill={C.planetBody}/>
          <circle cx={-radius * 0.35} cy={-radius * 0.2} r={radius * 0.22} fill={C.planetMark}/>
          <circle cx={radius * 0.25} cy={radius * 0.3} r={radius * 0.16} fill={C.planetMark}/>
          <circle r={radius * 0.18} fill={C.resource}
                  style={{ animation: depleted ? 'none' : 'sc-pulse-soft 1400ms ease-in-out infinite' }}/>
        </g>
      </svg>
      {/* bar under planet */}
      <div style={{
        position: 'absolute',
        left: size / 2 - radius,
        top: size / 2 + radius + 10,
        width: radius * 2, height: 3,
        background: C.panelBg,
      }}>
        <div style={{
          width: `${ratio * 100}%`, height: 3,
          background: depleted ? C.accent : C.resource,
        }}/>
      </div>
      <style>{`
        @keyframes sc-pulse-soft { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
      `}</style>
    </div>
  );
}

/* ─── Starfield — CSS-tiled background pattern ───────── */
function Starfield() {
  return <div className="sc-starfield"/>;
}

Object.assign(window, {
  BaseEntity, ShipEntity, ShipWithBars, EnemyEntity, PlanetEntity, Starfield,
  SC_COLORS: C,
});
