// HUD — top strip: HP (left) / Phase + status (center) / Credits (right).
function Hud({ hp, maxHp, credits, phase, totalPhases, status, creditPop }) {
  const ratio = hp / maxHp;
  const hpColor = ratio > 0.5 ? '#3ee0c5' : ratio > 0.25 ? '#ffd24a' : '#ff4d5a';
  return (
    <div className="sc-hud">
      <div className="sc-hud-cell">
        <div className="sc-hud-lbl">基地HP</div>
        <div className="sc-hud-val">{hp}/{maxHp}</div>
        <div className="sc-hud-bar">
          <div style={{ width: `${Math.max(0, ratio) * 100}%`, background: hpColor }}/>
        </div>
      </div>
      <div className="sc-hud-cell center">
        <div className="sc-hud-lbl">PHASE</div>
        <div className="sc-hud-val">{phase} / {totalPhases}</div>
        {status && <div className="sc-hud-status">{status}</div>}
      </div>
      <div className="sc-hud-cell right">
        <div className="sc-hud-lbl">クレジット</div>
        <div className="sc-hud-val gold">${credits}</div>
        {creditPop != null && creditPop !== 0 && (
          <div key={creditPop /* re-mount per change */}
               className={`sc-credit-pop ${creditPop > 0 ? 'up' : 'dn'}`}>
            {creditPop > 0 ? '+' : ''}{creditPop}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Hud });
