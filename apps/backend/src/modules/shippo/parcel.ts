import type { ShippoParcel } from "./client"

/** Dimensions (cm) and weight (g) as stored on product variants. */
export type ParcelLine = {
  quantity: number
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
}

/** Defaults for a line whose variant has no dimensions: a 15x21 cm hardback. */
const DEFAULT_LINE = { weight: 700, length: 21, width: 15, height: 3 }
/** Box board and padding around the stack. */
const PACKAGING = { padCm: 2, weightG: 150 }

/**
 * Builds one parcel by stacking books: the footprint is the largest book, the
 * height is the sum of all thicknesses. Shippo bills the greater of actual and
 * volumetric weight (L x W x H / 5000 for most express carriers), so accurate
 * dimensions matter as much as weight.
 */
export function buildParcel(lines: ParcelLine[]): ShippoParcel {
  let length = 0
  let width = 0
  let height = 0
  let weight = 0

  for (const line of lines) {
    const qty = Math.max(1, Number(line.quantity) || 1)
    const l = Number(line.length) || DEFAULT_LINE.length
    const w = Number(line.width) || DEFAULT_LINE.width
    const h = Number(line.height) || DEFAULT_LINE.height
    const g = Number(line.weight) || DEFAULT_LINE.weight
    length = Math.max(length, l)
    width = Math.max(width, w)
    height += h * qty
    weight += g * qty
  }

  return {
    lengthCm: (length || DEFAULT_LINE.length) + PACKAGING.padCm,
    widthCm: (width || DEFAULT_LINE.width) + PACKAGING.padCm,
    heightCm: (height || DEFAULT_LINE.height) + PACKAGING.padCm,
    weightKg: (weight + PACKAGING.weightG) / 1000,
  }
}

/** Volumetric weight in kg at the common express divisor of 5000. */
export function volumetricWeightKg(parcel: ShippoParcel) {
  return (parcel.lengthCm * parcel.widthCm * parcel.heightCm) / 5000
}
