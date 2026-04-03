import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
}

export const GymAppLogo = ({ className = "w-32 h-32" }: LogoProps) => {
  return (
    <div className={cn("relative flex items-center justify-center rounded-2xl overflow-hidden", className)}>
      <Image
        src="/FINALOGOFINAL (1).png"
        alt="COACH OP Logo"
        fill
        sizes="(max-width: 768px) 100vw, 128px"
        className="object-contain"
        priority
      />
    </div>
  );
};
