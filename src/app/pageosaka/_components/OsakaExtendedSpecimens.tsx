import Image from "next/image";
import Link from "next/link";

/** Mock artboards for coach / marketing / system — same Osaka language. */
export function OsakaExtendedSpecimens() {
  return (
    <>
      <section id="spec-kit" className="pageosaka-specimen" aria-labelledby="spec-kit-h">
        <h2 className="sr-only" id="spec-kit-h">
          Kit de piezas UI
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·1]</span>
          <span className="title">PARTS // UI KIT</span>
          <span className="jp-sm" lang="ja">
            部品
          </span>
        </div>
        <div className="osaka-desktop-frame">
          <h3>Botones · inputs · chips</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button type="button" className="start-cta" style={{ width: "auto", minWidth: 140 }}>
              Primary
            </button>
            <button
              type="button"
              className="h-badge black"
              style={{ padding: "12px 16px", cursor: "pointer", fontSize: 11, minHeight: 44 }}
            >
              Secondary
            </button>
            <span className="reward-chip">CHIP</span>
            <span className="reward-chip mint">OK</span>
          </div>
          <label className="mono" style={{ display: "block", marginTop: 20, fontSize: 10, marginBottom: 6 }}>
            Email
          </label>
          <input
            type="email"
            className="mono"
            placeholder="player@eva.app"
            style={{
              width: "100%",
              maxWidth: 360,
              minHeight: 48,
              border: "3px solid var(--black)",
              padding: "0 12px",
              fontSize: 14,
              background: "var(--ivory)",
            }}
          />
        </div>
      </section>

      <section id="spec-landing" className="pageosaka-specimen" aria-labelledby="spec-landing-h">
        <h2 className="sr-only" id="spec-landing-h">
          Landing attract
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·2]</span>
          <span className="title">ATTRACT // LANDING</span>
          <span className="jp-sm" lang="ja">
            看板
          </span>
        </div>
        <div className="osaka-desktop-frame">
          <div className="pageosaka-stack-flex">
            <Image src="/LOGOS/eva-icon.png" alt="" width={72} height={72} style={{ border: "3px solid var(--black)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="mono" style={{ fontSize: 10, color: "var(--red)", marginBottom: 6 }}>
                INSERT COIN
              </p>
              <h3 style={{ marginBottom: 8 }}>EVA · OSAKA</h3>
              <p style={{ fontSize: 14, color: "var(--ink)", maxWidth: 480 }}>
                Entrena como si fuera un cabinet: misiones claras, PRs como high scores, cero ruido visual.
              </p>
            </div>
            <button type="button" className="start-cta" style={{ width: "100%", minWidth: 0 }}>
              Start trial
            </button>
          </div>
        </div>
      </section>

      <section id="spec-auth" className="pageosaka-specimen" aria-labelledby="spec-auth-h">
        <h2 className="sr-only" id="spec-auth-h">
          Autenticación
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·3]</span>
          <span className="title">PRESS START // AUTH</span>
          <span className="jp-sm" lang="ja">
            認証
          </span>
        </div>
        <div className="osaka-desktop-frame" style={{ maxWidth: 420, marginInline: "auto" }}>
          <h3>Login</h3>
          <p className="mono" style={{ fontSize: 10, marginBottom: 16 }}>
            PLAYER 1 · EMAIL
          </p>
          <input
            aria-label="Correo electrónico"
            type="email"
            className="mono"
            style={{
              width: "100%",
              minHeight: 48,
              border: "3px solid var(--black)",
              padding: "0 12px",
              marginBottom: 12,
            }}
          />
          <button type="button" className="start-cta">
            Continue
          </button>
        </div>
      </section>

      <section id="spec-coach" className="pageosaka-specimen" aria-labelledby="spec-coach-h">
        <h2 className="sr-only" id="spec-coach-h">
          Coach dashboard
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·4]</span>
          <span className="title">CONTROL ROOM // COACH</span>
          <span className="jp-sm" lang="ja">
            指揮
          </span>
        </div>
        <div className="osaka-desktop-frame">
          <h3>Today</h3>
          <div className="stats-grid-3" style={{ maxWidth: 520, marginBottom: 20, width: "100%" }}>
            <div className="stat-cell">
              <div className="val">12</div>
              <div className="lbl">Sessions</div>
            </div>
            <div className="stat-cell">
              <div className="val red">3</div>
              <div className="lbl">Alerts</div>
            </div>
            <div className="stat-cell">
              <div className="val mint">94%</div>
              <div className="lbl">Reply SLA</div>
            </div>
          </div>
          <div className="score-sect-head">
            <h4>
              MISSION QUEUE <em>4</em>
            </h4>
            <span className="link">ASSIGN →</span>
          </div>
          <div className="score-row">
            <div className="rank">01</div>
            <div className="name">
              Push day · Ana L.<span className="sub">DUE TODAY · STAGE 03</span>
            </div>
            <div className="value">
              GO<span className="unit">→</span>
            </div>
          </div>
        </div>
      </section>

      <section id="spec-roster" className="pageosaka-specimen" aria-labelledby="spec-roster-h">
        <h2 className="sr-only" id="spec-roster-h">
          Lista de clientes
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·5]</span>
          <span className="title">PLAYER SELECT // ROSTER</span>
          <span className="jp-sm" lang="ja">
            選手
          </span>
        </div>
        <div className="osaka-desktop-frame">
          <div className="pageosaka-roster-grid">
            {["Ana", "Luis", "Mara"].map((name, i) => (
              <div key={name} className="side-mission" style={{ minHeight: 120 }}>
                <div className="tag">LV {12 + i}</div>
                <div className="name">
                  {name}
                  <br />
                  Roster
                </div>
                <div className="meta">+{120 + i * 10} XP / wk</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="spec-stages" className="pageosaka-specimen" aria-labelledby="spec-stages-h">
        <h2 className="sr-only" id="spec-stages-h">
          Mapa de semana
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·6]</span>
          <span className="title">STAGE MAP // WEEK</span>
          <span className="jp-sm" lang="ja">
            週間
          </span>
        </div>
        <div className="osaka-desktop-frame">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 72px), 1fr))",
              gap: 8,
            }}
          >
            {["M", "T", "W", "T", "F", "S", "S"].map((d, idx) => (
              <div
                key={d + idx}
                className="side-mission"
                style={{
                  textAlign: "center",
                  opacity: idx === 2 ? 1 : idx < 2 ? 0.55 : 0.85,
                  borderStyle: idx === 2 ? "solid" : "dashed",
                }}
              >
                <div className="tag">{d}</div>
                <div className="name" style={{ fontSize: 12 }}>
                  {idx === 2 ? "BOSS" : idx < 2 ? "CLR" : "LOCK"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="spec-boss" className="pageosaka-specimen" aria-labelledby="spec-boss-h">
        <h2 className="sr-only" id="spec-boss-h">
          Sesión en curso
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·7]</span>
          <span className="title">BOSS PHASE // SESSION</span>
          <span className="jp-sm" lang="ja">
            戦闘
          </span>
        </div>
        <div className="osaka-desktop-frame">
          <div className="combo-strip" style={{ margin: "0 0 16px" }}>
            <div className="label">
              SET
              <br />4 / 6
            </div>
            <div className="num" style={{ fontSize: 36 }}>
              <span className="x" aria-hidden>
                ⏱
              </span>
              01:24
            </div>
          </div>
          <div className="enemy" style={{ marginBottom: 8 }}>
            <span>04</span>
            <span>Incline DB Press</span>
            <span className="hp">3×10</span>
          </div>
          <button type="button" className="start-cta">
            LOG SET
          </button>
        </div>
      </section>

      <section id="spec-nutrition" className="pageosaka-specimen" aria-labelledby="spec-nutrition-h">
        <h2 className="sr-only" id="spec-nutrition-h">
          Nutrición
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·8]</span>
          <span className="title">LOADOUT // NUTRITION</span>
          <span className="jp-sm" lang="ja">
            食事
          </span>
        </div>
        <div className="osaka-desktop-frame">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <span className="reward-chip">P 165g</span>
            <span className="reward-chip mint">C 220g</span>
            <span className="reward-chip">F 62g</span>
          </div>
          <div className="side-grid" style={{ maxWidth: 400, width: "100%" }}>
            <div className="side-mission">
              <div className="tag">MEAL 1</div>
              <div className="name">
                Oats
                <br />
                + whey
              </div>
              <div className="meta">High fiber · +40 XP</div>
            </div>
            <div className="side-mission">
              <div className="tag">SIDE</div>
              <div className="name">
                Greens
                <br />
                bowl
              </div>
              <div className="meta">Volume · +20 XP</div>
            </div>
          </div>
        </div>
      </section>

      <section id="spec-checkin" className="pageosaka-specimen" aria-labelledby="spec-checkin-h">
        <h2 className="sr-only" id="spec-checkin-h">
          Check-in
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·9]</span>
          <span className="title">SAVE POINT // CHECK-IN</span>
          <span className="jp-sm" lang="ja">
            記録
          </span>
        </div>
        <div className="osaka-desktop-frame" style={{ maxWidth: 440, marginInline: "auto" }}>
          <h3>Weekly save</h3>
          <p className="mono" style={{ fontSize: 10, marginBottom: 12 }}>
            WEIGHT · ENERGY · NOTES
          </p>
          <div className="achievement" style={{ margin: 0 }}>
            <div className="info" style={{ flex: 1 }}>
              <div className="kick">autosave</div>
              <div className="name">All fields valid</div>
            </div>
          </div>
        </div>
      </section>

      <section id="spec-table" className="pageosaka-specimen" aria-labelledby="spec-table-h">
        <h2 className="sr-only" id="spec-table-h">
          Tabla de datos
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·10]</span>
          <span className="title">DATA GRID // TABLE</span>
          <span className="jp-sm" lang="ja">
            表
          </span>
        </div>
        <div className="osaka-desktop-frame" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table className="mono" style={{ width: "100%", minWidth: 260, borderCollapse: "collapse", fontSize: 11 }}>
            <caption className="sr-only">Ejemplo de tabla de ejercicios</caption>
            <thead>
              <tr style={{ borderBottom: "3px solid var(--black)" }}>
                <th scope="col" style={{ textAlign: "left", padding: "10px 8px" }}>
                  Exercise
                </th>
                <th scope="col" style={{ textAlign: "right", padding: "10px 8px" }}>
                  Load
                </th>
                <th scope="col" style={{ textAlign: "right", padding: "10px 8px" }}>
                  Sets
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Squat", "100", "4"],
                ["Bench", "80", "5"],
              ].map(([ex, load, sets]) => (
                <tr key={ex} style={{ borderBottom: "1.5px dashed var(--black)" }}>
                  <td style={{ padding: "10px 8px" }}>{ex}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{load}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{sets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="spec-modal" className="pageosaka-specimen" aria-labelledby="spec-modal-h">
        <h2 className="sr-only" id="spec-modal-h">
          Modal de confirmación
        </h2>
        <div className="screen-label">
          <span className="num">[EXT·11]</span>
          <span className="title">INSERT COIN // CONFIRM</span>
          <span className="jp-sm" lang="ja">
            確認
          </span>
        </div>
        <div className="osaka-desktop-frame" style={{ maxWidth: 400, marginInline: "auto", position: "relative" }}>
          <h3>Delete plan?</h3>
          <p style={{ fontSize: 14, marginBottom: 16 }}>Esta acción no tiene checkpoint en la nube demo.</p>
          <div className="pageosaka-stack-flex" style={{ gap: 10 }}>
            <button type="button" className="start-cta" style={{ flex: 1, minWidth: 0, background: "var(--red)", color: "white" }}>
              Delete
            </button>
            <button type="button" className="h-badge yellow" style={{ flex: 1, minWidth: 0, padding: "14px 12px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      </section>

      <footer className="pageosaka-specimen pageosaka-specimen--outro">
        <p className="mono" style={{ fontSize: 11, textAlign: "center", color: "var(--muted)", margin: 0 }}>
          Volver al producto:{" "}
          <Link href="/preview-c" style={{ color: "var(--red)", fontWeight: 700 }}>
            Concept C preview
          </Link>{" "}
          ·{" "}
          <Link href="/" style={{ color: "var(--red)", fontWeight: 700 }}>
            Home
          </Link>
        </p>
      </footer>
    </>
  );
}
