import Image from "next/image";

export function OsakaStudioHero() {
  return (
    <header className="page-header" id="attract">
      <div className="header-top-strip">
        <span className="insert-coin">
          <span className="dot" aria-hidden />
          <span>INSERT COIN · EVA DESIGN STUDY 06</span>
        </span>
        <div className="header-badges">
          <span className="h-badge black">PLAYER 1</span>
          <span className="h-badge yellow">MISSION-FIRST</span>
          <span className="h-badge red">アーケード</span>
        </div>
      </div>

      <p className="mono pageosaka-hero-mobile-hint lg:hidden" style={{ marginBottom: 14, fontSize: 10, lineHeight: 1.5, color: "var(--ink-soft)" }}>
        En móvil: usa la <strong>barra inferior fija</strong> para saltar entre bloques. Los flujos APP·1–4 muestran primero una{" "}
        <strong>vista bolsillo</strong> (marco teléfono); el tablero ancho aparece en pantallas grandes.
      </p>

      <div className="header-top-strip" style={{ marginBottom: 20 }}>
        <Image
          src="/LOGOS/eva-icon.png"
          alt="EVA"
          width={56}
          height={56}
          className="shadow-hard"
          style={{ border: "3px solid var(--black, #0D0D0D)", background: "var(--ivory, #FAF6EC)" }}
          priority
        />
        <p className="mono" style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--muted)" }}>
          Marca gráfica conservada del producto. Todo lo demás en esta ruta es lenguaje Osaka.
        </p>
      </div>

      <div className="hero-title-block">
        <h1>
          OSAKA<span className="dot" aria-hidden />
        </h1>
        <div className="jp-accent" lang="ja">
          大阪道場
        </div>
      </div>

      <div className="hero-footer">
        <div className="hero-cell">
          <div className="label">{`// Thesis`}</div>
          <div className="val">
            El gym como <strong>juego de peleas</strong>. Workouts son misiones, ejercicios son enemigos,
            racha es un combo counter, PRs son high-scores. Elegante y bold — no infantil. Inspirado en
            menús de Yakuza y salones arcade japoneses.
          </div>
        </div>
        <div className="hero-cell">
          <div className="label">{`// Primary verb`}</div>
          <div className="big">SELECT</div>
          <div className="val" style={{ marginTop: 4 }}>
            No &quot;start day&quot;.
            <br />
            Eliges una misión.
          </div>
        </div>
        <div className="hero-cell">
          <div className="label">{`// Refs`}</div>
          <div className="val">
            <strong>Yakuza menus</strong>
            <br />
            Persona 5 UI
            <br />
            Sega arcade cabs
            <br />
            Manga halftones
          </div>
        </div>
      </div>
    </header>
  );
}
