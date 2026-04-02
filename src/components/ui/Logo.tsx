import React from 'react';

interface LogoProps {
  className?: string;
}

export const GymAppLogo = ({ className = "w-32 h-32" }: LogoProps) => {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      <g filter="url(#glow)">
        {/* Forma Derecha */}
        <path
          d="M100 20 C 150 20, 180 60, 180 100 C 180 140, 150 180, 100 180 C 120 160, 140 130, 140 100 C 140 70, 120 40, 100 20 Z"
          fill="url(#logoGradient)"
        />
        <path
          d="M100 20 C 70 20, 45 45, 40 85 L 55 85 C 60 55, 80 35, 100 35 Z"
          fill="url(#logoGradient)"
          opacity="0.8"
        />

        {/* Forma Izquierda */}
        <path
          d="M100 180 C 50 180, 20 140, 20 100 C 20 60, 50 20, 100 20 C 80 40, 60 70, 60 100 C 60 130, 80 160, 100 180 Z"
          fill="url(#logoGradient)"
        />
        <path
          d="M100 180 C 130 180, 155 155, 160 115 L 145 115 C 140 145, 120 165, 100 165 Z"
          fill="url(#logoGradient)"
          opacity="0.8"
        />
      </g>
    </svg>
  );
};
