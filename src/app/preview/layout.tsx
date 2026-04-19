import type { CSSProperties, ReactNode } from "react";
import "./_styles/carbon.css";

export const metadata = {
  title: "EVA Preview — Kinetic Obsidian (Concept A)",
  description: "Alpha visual Concept A — demo aislada, sin lógica.",
};

/** White-label demo: acento solo en glow / barra / focos (ver PREVIEW_CONCEPT_A.md). */
const previewTheme = {
  "--theme-primary": "#A78BFA",
  "--theme-primary-rgb": "167, 139, 250",
} as CSSProperties;

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className="preview-root" style={previewTheme}>
      <div className="preview-atmosphere" aria-hidden />
      {children}
      <div className="demo-banner">
        <span className="dot dot-live" />
        ALPHA PREVIEW · CONCEPT A
      </div>
    </div>
  );
}
