// App — top-level state machine.
// Scenes: menu / game / gameOver / victory.
// Ships are kept in a simple array; the program editor mutates one of them.
// Lightweight simulation: enemies advance in straight lines toward Base.

const { useState, useEffect, useRef, useCallback } = React;

const TOTAL_PHASES = 5;
const BASE_MAX_HP = 100;
const SHIP_COST   = 70;

function App() {
  // ─── Stage scaling (fit 1280×720 into viewport) ─────────
  const [scale, setScale] = useState(1);
  const stageRef = useRef(null);
  useEffect(() => {
    const fit = () => {
      const sx = window.innerWidth  / 1280;
      const sy = window.innerHeight / 720;
      const s = Math.min(sx, sy);
      setScale(s);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // ─── Scene state machine ────────────────────────────────
  const [scene, setScene] = useState('menu'); // menu | game | gameOver | victory

  // ─── Game state ────────────────────────────────────────
  const [hp, setHp]           = useState(BASE_MAX_HP);
  const [credits, setCredits] = useState(120);
  const [phase, setPhase]     = useState(1);
  const [status, setStatus]   = useState('開始ボタンで Wave 開始');
  const [ships, setShips]     = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [editingShipId, setEditingShipId] = useState(null);
  const [selectedShipId, setSelectedShipId] = useState(null);
  const [showStart, setShowStart] = useState(true);
  const [banner,     setBanner]   = useState(null);  // {text, key}
  const [creditPop,  setCreditPop] = useState(null); // {delta, key}
  const [calloutShipId, setCalloutShipId] = useState(null);

  // Editing — keep a ref to ship's program. The editor mutates it via setShips.
  const editingShip = ships.find((s) => s.id === editingShipId);

  // ─── Lifecycle: reset on entering 'game' ───────────────
  const startNewGame = useCallback(() => {
    setHp(BASE_MAX_HP);
    setCredits(120);
    setPhase(1);
    setShips([]);
    setEnemies([]);
    setEditingShipId(null);
    setSelectedShipId(null);
    setShowStart(true);
    setStatus('開始ボタンで Wave 開始');
    setScene('game');
  }, []);

  // ─── Buy ship ──────────────────────────────────────────
  const buyShip = () => {
    if (credits < SHIP_COST) return;
    setCredits((c) => c - SHIP_COST);
    setCreditPop({ delta: -SHIP_COST, key: Date.now() });
    const newShipId = `s${Date.now()}`;
    // Place the ship adjacent to Base — slight offset so each subsequent ship doesn't stack.
    const idx = ships.length;
    const angle = idx * 0.7;
    const offset = 50 + idx * 8;
    const x = BASE_X + Math.cos(angle) * offset;
    const y = BASE_Y - 50 - idx * 10;
    setShips((arr) => [
      ...arr,
      {
        id: newShipId,
        x, y,
        rotation: -Math.PI / 2,
        hp: 30, energy: 100, inventory: 0,
        program: [],
      },
    ]);
    // Show the callout above the new ship for ~4s
    setCalloutShipId(newShipId);
    setTimeout(() => setCalloutShipId((cur) => (cur === newShipId ? null : cur)), 4500);
  };

  // ─── Open editor on ship click ─────────────────────────
  const openEditor = (ship) => {
    setEditingShipId(ship.id);
    setSelectedShipId(ship.id);
    setCalloutShipId(null);
  };

  // ─── Editor program changes ────────────────────────────
  const setProgram = (codes) => {
    setShips((arr) => arr.map((s) =>
      s.id === editingShipId ? { ...s, program: codes } : s
    ));
  };

  // ─── Start the phase wave (demo simulation) ────────────
  const startPhase = () => {
    setShowStart(false);
    setBanner({ text: `▶ PHASE ${phase} / ${TOTAL_PHASES} 開始`, key: Date.now() });
    setStatus(`Wave 進行中 — ${ships.length === 0 ? 'プログラム未割り当て' : 'Ship 稼働中'}`);

    // Spawn a few enemies for demo motion.
    const newEnemies = makeWave(phase);
    setEnemies(newEnemies);

    // After a moment, advance them — simple animation.
    setTimeout(() => setBanner(null), 1100);
  };

  // ─── Tick enemies (very simple straight-line) ──────────
  useEffect(() => {
    if (scene !== 'game' || enemies.length === 0) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(60, now - last);
      last = now;
      setEnemies((arr) => {
        let damageThisTick = 0;
        const alive = arr.flatMap((e) => {
          const dx = BASE_X - e.x;
          const dy = BASE_Y - e.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= 32) {
            damageThisTick += e.dmg;
            return [];
          }
          const step = (e.speed * dt) / 1000;
          return [{
            ...e,
            x: e.x + (dx / dist) * step,
            y: e.y + (dy / dist) * step,
            rotation: Math.atan2(dy, dx),
          }];
        });
        if (damageThisTick > 0) {
          setHp((h) => {
            const nh = Math.max(0, h - damageThisTick);
            if (nh === 0) setTimeout(() => setScene('gameOver'), 400);
            return nh;
          });
        }
        return alive;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, enemies.length > 0]);

  // When the wave fully clears (demo: when last enemy reaches/dies), advance.
  useEffect(() => {
    if (scene !== 'game') return;
    if (enemies.length !== 0) return;
    if (showStart) return; // already idle
    // Wave complete: bonus + next phase prompt
    setCredits((c) => c + 30);
    setCreditPop({ delta: +30, key: Date.now() });
    if (phase < TOTAL_PHASES) {
      setPhase((p) => p + 1);
      setShowStart(true);
      setStatus('次の Wave を準備中');
      setBanner({ text: `Phase ${phase} CLEAR`, key: Date.now() });
      setTimeout(() => setBanner(null), 1100);
    } else {
      // Victory
      setBanner({ text: 'STAGE CLEAR', key: Date.now() });
      setTimeout(() => setScene('victory'), 1100);
    }
  }, [enemies.length === 0, showStart, scene]);

  // ─── Build a tiny demo wave for visual interest ────────
  const makeWave = (phaseN) => {
    const count = 3 + phaseN; // 4..8
    const types = phaseN >= 5 ? ['basic', 'fast', 'tank']
                : phaseN >= 3 ? ['basic', 'fast']
                : ['basic'];
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.4);
      const r = 540;
      return {
        id: `e${i}-${Date.now()}`,
        type: types[i % types.length],
        x: BASE_X + Math.cos(angle) * r,
        y: BASE_Y + Math.sin(angle) * r * 0.6,
        speed: types[i % types.length] === 'fast' ? 95 : (types[i % types.length] === 'tank' ? 38 : 60),
        rotation: angle + Math.PI,
        dmg: types[i % types.length] === 'tank' ? 15 : (types[i % types.length] === 'fast' ? 8 : 10),
      };
    });
  };

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="sc-stage-host">
      <div ref={stageRef}
           className="sc-stage"
           data-screen-label="01 Game"
           style={{
             transform: `scale(${scale})`,
             left: (window.innerWidth - 1280 * scale) / 2,
             top:  (window.innerHeight - 720 * scale) / 2,
           }}>
        {scene === 'menu' && (
          <div data-screen-label="01 Menu">
            <Menu onStart={startNewGame}/>
          </div>
        )}

        {scene === 'game' && (
          <React.Fragment>
            <GameCanvas
              ships={ships}
              enemies={enemies}
              selectedShipId={selectedShipId}
              calloutShipId={calloutShipId}
              onShipClick={openEditor}/>
            <Hud
              hp={hp} maxHp={BASE_MAX_HP}
              credits={credits}
              phase={phase} totalPhases={TOTAL_PHASES}
              status={status}
              creditPop={creditPop?.delta}/>
            <ShopBar credits={credits} onBuyShip={buyShip}/>
            {showStart && (
              <StartButton phase={phase} total={TOTAL_PHASES} onStart={startPhase}/>
            )}
            {banner && (
              <div className="sc-banner" key={banner.key}>{banner.text}</div>
            )}
            {editingShip && (
              <ProgramEditor
                codes={editingShip.program}
                onChange={setProgram}
                onClose={() => setEditingShipId(null)}/>
            )}
          </React.Fragment>
        )}

        {scene === 'gameOver' && (
          <div data-screen-label="02 GameOver">
            <GameOver onRetry={startNewGame} onMenu={() => setScene('menu')}/>
          </div>
        )}

        {scene === 'victory' && (
          <div data-screen-label="03 Victory">
            <Victory hp={hp} maxHp={BASE_MAX_HP} credits={credits}
                     onRetry={startNewGame}/>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
