import type { ReactNode } from "react";
import "./_styles/signal.css";

export const metadata = {
  title: "EVA Preview 2 — Signal",
  description: "Concepto UI alternativo: neo-brutalismo editorial (no funcional).",
};

export default function Preview2Layout({ children }: { children: ReactNode }) {
  return (
    <div className="signal-root">
      {children}
      <div className="demo-banner">
        <span className="live-dot" />
        SIGNAL · DEMO VISUAL
      </div>
    </div>
  );
}
