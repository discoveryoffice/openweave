import type { IconProps } from './icons/props.ts'
import { BrandMark } from './BrandMark.tsx'
import { BRAND_NAME } from './brand-artwork.ts'

/** Presentation of the OpenWeave name, optionally paired with its ribbon mark. */
export interface BrandWordmarkProps extends IconProps {
  /** Include the mark before the name; defaults to true. */
  includeMark?: boolean
}

/**
 * Render the product name with the bundled brand font and theme-owned text ink.
 * @param props - Optional mark and placement class; size is the height in pixels.
 * @returns the decorative wordmark; the owner supplies its accessible name.
 */
export function BrandWordmark({ includeMark = true, size = 24, className }: BrandWordmarkProps) {
  const width = includeMark ? 166 : 134
  return (
    <svg width={width * size / 24} height={size} viewBox={`0 0 ${width} 24`} fill="none" className={className} aria-hidden="true">
      {includeMark && <BrandMark size={24} />}
      <text x={includeMark ? 32 : 0} y={18} fill="currentColor" fontFamily="var(--dsw-font-family-brand, sans-serif)" fontSize={20} fontWeight={500} letterSpacing={-0.6}>{BRAND_NAME}</text>
    </svg>
  )
}
