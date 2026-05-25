// GameCanvas — the playfield. Renders the Base, Planets, Ships, and Enemies.
// Positions match the original game (config.ts):
//   Base: (640, 360 area — actually centered on canvas)
//   Planets: (220, 200) and (1060, 540)
//   Ships spawn next to Base.

const BASE_X = 640;
const BASE_Y = 360;
const PLANETS = [
  { id: 'A', x: 220,  y: 200, radius: 30, resources: 0.78 },
  { id: 'B', x: 1060, y: 540, radius: 30, resources: 0.42 },
];

function GameCanvas({ ships, enemies, onShipClick, selectedShipId, calloutShipId }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
      <Starfield/>

      {/* Planets */}
      {PLANETS.map((p) => (
        <PlanetEntity key={p.id}
                      x={p.x} y={p.y} radius={p.radius}
                      resources={p.resources}/>
      ))}

      {/* Planet labels */}
      {PLANETS.map((p) => (
        <div key={p.id + 'lbl'}
             style={{
               position: 'absolute',
               left: p.x - 50, top: p.y + p.radius + 22,
               width: 100, textAlign: 'center',
               fontSize: 11, color: '#6b7da0',
               fontFamily: 'var(--font-mono)',
               pointerEvents: 'none',
             }}>
          惑星{p.id}
        </div>
      ))}

      {/* Base */}
      <BaseEntity x={BASE_X} y={BASE_Y}/>

      {/* Base label */}
      <div style={{
        position: 'absolute',
        left: BASE_X - 50, top: BASE_Y + 80,
        width: 100, textAlign: 'center',
        fontSize: 11, color: '#6b7da0',
        fontFamily: 'var(--font-mono)',
        pointerEvents: 'none',
      }}>基地</div>

      {/* Ships */}
      {ships.map((s) => (
        <React.Fragment key={s.id}>
          <ShipWithBars
            ship={s}
            selected={selectedShipId === s.id}
            onClick={() => onShipClick(s)}
          />
          {calloutShipId === s.id && (
            <div className="sc-callout"
                 style={{ left: s.x - 90, top: s.y - 42, width: 180, textAlign: 'center' }}>
              ▶ クリックでプログラム編集
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Enemies */}
      {enemies.map((e) => (
        <EnemyEntity key={e.id} x={e.x} y={e.y} type={e.type} rotation={e.rotation}/>
      ))}
    </div>
  );
}

Object.assign(window, { GameCanvas, BASE_X, BASE_Y, PLANETS });
