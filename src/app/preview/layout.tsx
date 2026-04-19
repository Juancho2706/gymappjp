import type { ReactNode } from "react";
import "./_styles/carbon.css";

export const metadata = {
  title: "EVA Preview — Carbon Athlete",
  description: "Demo visual del rework UI (no funcional).",
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className="preview-root">
      {children}
      <div className="demo-banner">
        <span className="dot dot-live" />
        DEMO VISUAL · NO FUNCIONAL
      </div>
    </div>
  );
}
