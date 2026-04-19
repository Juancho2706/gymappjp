import type { ReactNode } from "react";
import { PreviewBRoot } from "./_components/PreviewBRoot";
import { PreviewBDemoBanner } from "./_components/PreviewBDemoBanner";
import "./_styles/preview-b-document.css";

export const metadata = {
  title: "EVA Preview — Luminous Paper (Concept B)",
  description: "Alpha editorial Concept B — demo responsive, sin lógica.",
};

export default function PreviewBLayout({ children }: { children: ReactNode }) {
  return (
    <PreviewBRoot>
      {children}
      <PreviewBDemoBanner />
    </PreviewBRoot>
  );
}
