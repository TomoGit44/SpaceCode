// Title / Menu screen — title scale-in, blinking prompt, footer.
// Positions match the original Phaser scenes (GAME_HEIGHT × percentage).

function Menu({ onStart }) {
  return (
    <div className="sc-screen">
      <Starfield/>
      <div className="title menu" style={{ top: '32%', transform: 'translate(-50%, -50%)' }}>
        SpaceCode
      </div>
      <div className="tagline"
           style={{ top: 'calc(32% + 70px)', transform: 'translate(-50%, -50%)' }}>
        — 宇宙タワーディフェンス × コードプログラミング —
      </div>
      <div className="prompt" style={{ top: '70%', transform: 'translate(-50%, -50%)' }}>
        クリック または SPACE でスタート
      </div>
      <div className="footer">MVP v1.0 — Phase 5 完成</div>

      <button
        className="sc-screen-hit"
        onClick={onStart}
        aria-label="ゲームを開始"
      />
    </div>
  );
}

function GameOver({ onRetry }) {
  return (
    <div className="sc-screen">
      <Starfield/>
      <div className="title over" style={{ top: 'calc(35% - 30px)', transform: 'translate(-50%, -50%)' }}>
        GAME OVER
      </div>
      <div className="subtitle" style={{ top: 'calc(35% + 80px)', transform: 'translate(-50%, -50%)' }}>
        基地が破壊された
      </div>
      <div className="keyrow" style={{ top: '64%', transform: 'translate(-50%, 0)' }}>
        <div className="primary">[ R ] リトライ</div>
        <div className="secondary">[ ESC ] メニューに戻る</div>
      </div>
      <button className="sc-screen-hit" onClick={onRetry} aria-label="リトライ"/>
    </div>
  );
}

function Victory({ hp, maxHp, credits, onRetry }) {
  return (
    <div className="sc-screen">
      <Starfield/>
      <div className="title cleared" style={{ top: 'calc(28% - 30px)', transform: 'translate(-50%, -50%)' }}>
        STAGE CLEAR
      </div>
      <div className="subtitle" style={{ top: 'calc(28% + 80px)', transform: 'translate(-50%, -50%)' }}>
        基地を守り抜いた
      </div>
      <div className="summary" style={{ top: '50%', transform: 'translate(-50%, -50%)' }}>
        残HP   {hp} / {maxHp}<br/>
        <span className="gold">クレジット   ${credits}</span>
      </div>
      <div className="keyrow" style={{ top: '76%', transform: 'translate(-50%, 0)' }}>
        <div className="primary">[ R ] もう一度</div>
        <div className="secondary">[ ESC ] メニューに戻る</div>
      </div>
      <button className="sc-screen-hit" onClick={onRetry} aria-label="もう一度"/>
    </div>
  );
}

Object.assign(window, { Menu, GameOver, Victory });
