import React from 'react';
import Image from 'next/image';
import { BRAND_LOGO_WEB } from '@/lib/brand-assets';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
}

export const GymAppLogo = ({ className = "w-32 h-32" }: LogoProps) => {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        className
      )}
    >
      <Image
        src={BRAND_LOGO_WEB}
        alt="EVA Logo"
        fill
        sizes="(max-width: 768px) 100vw, 128px"
        className="object-contain scale-[1.18] [transform-origin:center]"
        priority
      />
    </div>
  );
};

