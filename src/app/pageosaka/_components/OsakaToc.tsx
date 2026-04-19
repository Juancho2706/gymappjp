const links = [
  { href: "#attract", label: "Attract" },
  { href: "#foundations", label: "Foundations" },
  { href: "#spec-061", label: "06·1 Mission" },
  { href: "#spec-062", label: "06·2 Records" },
  { href: "#spec-app-builder", label: "APP Plan builder" },
  { href: "#spec-app-nutrition-editor", label: "APP Nutrición" },
  { href: "#spec-app-client-dash", label: "APP Dashboard alumno" },
  { href: "#spec-app-coach-home", label: "APP Coach HQ" },
  { href: "#spec-kit", label: "UI kit" },
  { href: "#spec-landing", label: "Landing" },
  { href: "#spec-auth", label: "Auth" },
  { href: "#spec-coach", label: "Coach ops" },
  { href: "#spec-roster", label: "Roster" },
  { href: "#spec-stages", label: "Stage map" },
  { href: "#spec-boss", label: "Boss phase" },
  { href: "#spec-nutrition", label: "Loadout" },
  { href: "#spec-checkin", label: "Save point" },
  { href: "#spec-table", label: "Data grid" },
  { href: "#spec-modal", label: "Modal" },
] as const;

export function OsakaToc() {
  return (
    <details className="pageosaka-toc" open>
      <summary>Índice · INDEX</summary>
      <nav aria-label="Secciones del especimen Osaka">
        {links.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
    </details>
  );
}
