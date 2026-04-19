import type { CSSProperties, ReactNode } from "react";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./_styles/brutal.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-pc-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-pc-mono",
  display: "swap",
});

const previewTheme = {
  "--pc-primary": "#CCFF00",
  "--pc-primary-rgb": "204, 255, 0",
} as CSSProperties;

export const metadata = {
  title: "EVA Preview — Neo-Brutalist Spatial (Concept C)",
  description: "Alpha spatial / brutal — demo responsive (PREVIEW_CONCEPT_C).",
};

export default function PreviewCLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${spaceGrotesk.variable} ${jetbrains.variable} preview-c-root`}
      style={previewTheme}
    >
      {children}
      <div className="pc-demo-pill">Concept C · alpha</div>
    </div>
  );
}
