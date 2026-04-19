"use client";

import type { ReactNode } from "react";
import { needsContrastWrapOnBlack } from "../_lib/contrast";

export function BrutalPrimaryCta({
  label,
  brandHex,
}: {
  label: ReactNode;
  brandHex: string;
}) {
  const wrap = needsContrastWrapOnBlack(brandHex);
  const btn = (
    <button
      type="button"
      className="pc-btn-solid"
      style={{
        backgroundColor: brandHex,
        borderColor: brandHex,
        color: "#000",
      }}
    >
      {label}
    </button>
  );
  return wrap ? <span className="pc-contrast-wrap">{btn}</span> : btn;
}
