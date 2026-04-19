import type { ReactNode } from "react";

type OsakaPhoneFrameProps = {
  children: ReactNode;
  /** Vista más baja para previews en feed móvil */
  compact?: boolean;
};

export function OsakaPhoneFrame({ children, compact }: OsakaPhoneFrameProps) {
  return (
    <div className="phone">
      <div className="dynamic-island" aria-hidden />
      <div className={`phone-screen${compact ? " phone-screen--compact" : ""}`}>{children}</div>
    </div>
  );
}
