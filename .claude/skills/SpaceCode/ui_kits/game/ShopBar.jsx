// ShopBar — bottom strip. Single button: buy a Ship for $70.
function ShopBar({ credits, onBuyShip, hint }) {
  const canBuy = credits >= 70;
  return (
    <React.Fragment>
      {hint && (
        <div className="sc-shop-hint">{hint}</div>
      )}
      <div className="sc-shop">
        <button
          className="sc-btn sc-btn--shop"
          aria-disabled={!canBuy}
          disabled={!canBuy}
          onClick={canBuy ? onBuyShip : undefined}
        >
          宇宙船  $70
        </button>
      </div>
    </React.Fragment>
  );
}

// StartButton — pulses above the shop bar between phases.
function StartButton({ phase, total, onStart }) {
  const isFirst = phase === 1;
  const label = isFirst
    ? `▶ PHASE ${phase} / ${total} 開始`
    : `▶ 次の PHASE ${phase} / ${total} を開始`;
  return (
    <div style={{
      position: 'absolute',
      left: '50%', transform: 'translateX(-50%)',
      bottom: 100, zIndex: 6, textAlign: 'center',
    }}>
      <button className="sc-btn sc-btn--start" onClick={onStart}>{label}</button>
      <div style={{ marginTop: 12, fontSize: 12, color: '#6b7da0' }}>
        宇宙船を購入・船をクリックしてプログラム編集ができます
      </div>
    </div>
  );
}

Object.assign(window, { ShopBar, StartButton });
