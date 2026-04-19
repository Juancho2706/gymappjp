import Image from "next/image";
import { mockMissionMain, mockPlayer, mockSideMissions } from "../_data/mock";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "var(--yellow)" : "none"} stroke="#0D0D0D" strokeWidth="1.5" aria-hidden>
      <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
    </svg>
  );
}

export function MissionSelectScreen() {
  const stars = [0, 1, 2, 3, 4].map((i) => i < mockMissionMain.difficultyStars);

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

      <div className="player-bar">
        <div className="player-avatar osaka-ava-mark">
          <Image src="/LOGOS/eva-icon.png" alt="" width={44} height={44} />
        </div>
        <div className="player-info">
          <div className="name">{mockPlayer.name}</div>
          <div className="lvl-row">
            <span className="lvl">LV {mockPlayer.level}</span>
            <span className="xp">
              {mockPlayer.xpCurrent.toLocaleString("es-ES")} / {mockPlayer.xpTarget.toLocaleString("es-ES")} XP
            </span>
          </div>
          <div
            className="xp-bar osaka-xp-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={mockPlayer.xpPct}
            aria-label="Progreso de experiencia"
          >
            <span className="xp-bar-fill" style={{ width: `${mockPlayer.xpPct}%` }} />
          </div>
        </div>
        <div className="player-coins">
          <div className="val">{mockPlayer.coins}</div>
          <div className="lbl">{mockPlayer.coinsLabel}</div>
        </div>
      </div>

      <div className="sel-title-row">
        <div className="left">
          <div className="kicker" lang="ja">
            今日のミッション
          </div>
          <h3>
            MISSION
            <br />
            SELECT
          </h3>
        </div>
        <div className="right">
          <div>LUN</div>
          <div className="date">18·04</div>
        </div>
      </div>

      <div className="mission-main">
        <div className="m-head">
          <span className="stage">{mockMissionMain.stage}</span>
          <span className="jp-side" lang="ja">
            {mockMissionMain.jp}
          </span>
        </div>
        <div className="m-body">
          <h4>
            {mockMissionMain.titleLines[0]}
            <br />
            {mockMissionMain.titleLines[1]}
          </h4>
          <div className="sub">{mockMissionMain.sub}</div>

          <div className="difficulty-row">
            <span className="lbl">Difficulty</span>
            <div className="stars" aria-label={`Dificultad ${mockMissionMain.difficultyStars} de 5`}>
              {stars.map((filled, i) => (
                <Star key={i} filled={filled} />
              ))}
            </div>
          </div>

          <div className="enemies-row" role="group" aria-label="Ejercicios de la sesión">
            <div className="lbl">
              ENEMIES · {mockMissionMain.enemies.length + mockMissionMain.enemiesMore}
              <span className="sr-only">. Lista de ejercicios con series y repeticiones.</span>
            </div>
            <div className="enemies-list" role="list">
              {mockMissionMain.enemies.map((e) => (
                <div key={e.n} className="enemy" role="listitem">
                  <span>{e.n}</span>
                  <span>{e.name}</span>
                  <span className="hp">{e.hp}</span>
                </div>
              ))}
              <div className="enemy" style={{ opacity: 0.7 }} role="listitem">
                <span>...</span>
                <span>+ {mockMissionMain.enemiesMore} more</span>
                <span className="hp" />
              </div>
            </div>
          </div>

          <div className="rewards-row">
            <div className="reward-chip">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
              </svg>
              +180 XP
            </div>
            <div className="reward-chip mint">+1 STREAK</div>
          </div>

          <button type="button" className="start-cta">
            <span>START</span>
            <span className="arrow" aria-hidden>
              →
            </span>
          </button>
        </div>
      </div>

      <div className="side-sec">
        <div className="side-title">
          <span>SIDE QUESTS · {mockSideMissions.length}</span>
          <span className="jp-sm" lang="ja">
            サイド
          </span>
        </div>
        <div className="side-grid">
          {mockSideMissions.map((s) => (
            <div key={s.tag} className="side-mission">
              <div className="tag">{s.tag}</div>
              <div className="name">
                {s.name[0]}
                <br />
                {s.name[1]}
              </div>
              <div className="meta">{s.meta}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
