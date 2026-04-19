import type { ReactNode } from "react";
import { JetBrains_Mono, Noto_Sans_JP, Unbounded } from "next/font/google";
import "./_styles/osaka.css";

const unbounded = Unbounded({
  variable: "--font-osaka-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const notoJp = Noto_Sans_JP({
  variable: "--font-osaka-jp",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700", "900"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-osaka-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata = {
  title: "EVA · Osaka — design study",
  description:
    "Especimen responsive: arcade / mission-first (EVA Design Study 06). Demo visual, no producción.",
};

export default function PageOsakaLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${unbounded.variable} ${notoJp.variable} ${jetbrains.variable} pageosaka-root`}>
      {children}
      <div className="pageosaka-study-pill">Design study · not production</div>
    </div>
  );
}
