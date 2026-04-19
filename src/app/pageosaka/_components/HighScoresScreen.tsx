import { mockScores } from "../_data/mock";

export function HighScoresScreen() {
  return (
    <>
      <div className="status-bar" aria-hidden>
        <span>9:41</span>
        <div className="right">
          <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} aria-hidden>
            <path d="M12 4a8 8 0 0 1 8 8h2a10 10 0 0 0-10-10v2Z" />
            <path d="M12 8a4 4 0 0 1 4 4h2a6 6 0 0 0-6-6v2Z" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} aria-hidden>
            <rect x="2" y="8" width="20" height="10" rx="2" />
          </svg>
        </div>
      </div>

      <div className="scores-header">
        <div className="top">
          <span className="jp-text" lang="ja">
            {mockScores.jp}
          </span>
          <span className="badge">{mockScores.badge}</span>
        </div>
        <h3>
          HIGH
          <br />
          <span className="ylw">SCORES</span>
        </h3>
      </div>

      <div className="combo-strip" role="status" aria-live="polite">
        <div className="label">
          CURRENT
          <br />
          COMBO
        </div>
        <div className="num">
          <span className="x" aria-hidden>
            ×
          </span>
          {mockScores.combo}
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-grid-3">
          {mockScores.stats.map((s) => (
            <div key={s.lbl} className="stat-cell">
              <div className={`val ${s.tone ?? ""}`.trim()}>{s.val}</div>
              <div className="lbl">{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="scores-table-sec">
        <div className="score-sect-head">
          <h4>
            TOP PR&apos;S <em>{mockScores.prRows.length}</em>
          </h4>
          <span className="link">VIEW ALL →</span>
        </div>

        {mockScores.prRows.map((row) => (
          <div key={row.rank} className={`score-row${row.top ? " top" : ""}`}>
            <div className="rank">{row.rank}</div>
            <div className="name">
              {row.name}
              <span className="sub">{row.sub}</span>
            </div>
            <div className="value">
              {row.value}
              <span className="unit">{row.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="achievement" role="status">
        <div className="trophy" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--black)">
            <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
          </svg>
        </div>
        <div className="info">
          <div className="kick">{mockScores.achievement.kick}</div>
          <div className="name">{mockScores.achievement.name}</div>
        </div>
      </div>
    </>
  );
}
