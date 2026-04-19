const dockLinks = [
  { href: "#attract", label: "Top" },
  { href: "#foundations", label: "Spec" },
  { href: "#spec-061", label: "06·1" },
  { href: "#spec-062", label: "06·2" },
  { href: "#spec-app-builder", label: "Plan" },
  { href: "#spec-app-nutrition-editor", label: "Nutri" },
  { href: "#spec-app-client-dash", label: "Alumno" },
  { href: "#spec-app-coach-home", label: "Coach" },
  { href: "#spec-kit", label: "Kit" },
] as const;

/** Barra inferior fija solo en móvil/tablet: salto rápido entre bloques (dedo-friendly). */
export function OsakaMobileDock() {
  return (
    <nav className="pageosaka-mobile-dock" aria-label="Atajos Osaka (móvil)">
      <div className="pageosaka-mobile-dock-inner">
        {dockLinks.map((l) => (
          <a key={l.href} href={l.href} className="pageosaka-mobile-dock-link">
            {l.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
