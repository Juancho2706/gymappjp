import Image from "next/image";
import { BRAND_APP_ICON } from "@/lib/brand-assets";

export function EvaWatermark() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
      aria-hidden
    >
      <div className="pc-watermark-drift relative w-[60vw] max-w-[900px] opacity-[0.06]">
        <Image
          src={BRAND_APP_ICON}
          alt=""
          width={900}
          height={900}
          className="h-auto w-full object-contain"
          priority={false}
        />
      </div>
    </div>
  );
}
