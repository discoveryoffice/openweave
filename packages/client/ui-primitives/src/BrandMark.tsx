import type { IconProps } from './icons/props.ts'
import { BRAND_RIBBONS } from './brand-artwork.ts'

/**
 * Render the decorative OpenWeave ribbons with transparent open ends.
 * @param props - Square edge in pixels and optional placement class.
 * @returns an aria-hidden mark; the owner supplies its accessible name.
 */
export function BrandMark({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {BRAND_RIBBONS.map(ribbon => (
        <path key={ribbon.color} d={ribbon.path} stroke={ribbon.color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}
