import React from 'react'

interface DriveaLogoProps {
  className?: string
  iconSize?: number
  textSize?: string
  showText?: boolean
}

export function DriveaLogo({
  className = '',
  iconSize = 34,
  textSize = 'text-xl',
  showText = true,
}: DriveaLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 hover:scale-105"
        aria-label="Drivea Logo"
      >
        {/* Left folded facet (rich deep orange) */}
        <path
          d="M13.2 4.2C12.5 4.2 11.9 4.6 11.5 5.2L3.4 20.6C2.9 21.6 3.2 22.8 4.2 23.3L11.8 27.2C12.8 27.7 14 27.3 14.5 26.3L20.8 14.8L14.8 5.1C14.5 4.5 13.9 4.2 13.2 4.2Z"
          fill="#D64817"
        />
        {/* Right angled wedge facet (vibrant bright orange) */}
        <path
          d="M23.1 5.4C22.6 4.6 21.5 4.3 20.7 4.8L15.2 8.4L23.4 23.2L32.2 23.2C33.2 23.2 34 22.4 34 21.4C34 20.9 33.7 20.4 33.3 20.1L23.1 5.4Z"
          fill="#F25A24"
        />
      </svg>

      {showText && (
        <span
          className={`font-bold tracking-[0.06em] text-[#1e2229] dark:text-white uppercase leading-none transition-colors ${textSize}`}
        >
          DRIVEA
        </span>
      )}
    </div>
  )
}
