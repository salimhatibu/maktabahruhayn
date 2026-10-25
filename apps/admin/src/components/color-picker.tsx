"use client"

import { clx } from "@medusajs/ui"

const LEGACY: Record<string, string> = {
  sky: "#f6ecee",
  sand: "#f2ebdf",
  green: "#e6ece6",
}

const PRESETS = [
  { hex: "#f6ecee", label: "Blush rose" },
  { hex: "#f2ebdf", label: "Parchment" },
  { hex: "#e6ece6", label: "Sage" },
  { hex: "#e8eaf6", label: "Lavender" },
  { hex: "#fff8e1", label: "Cream" },
  { hex: "#e0f2f1", label: "Mint" },
]

export function resolveColor(tone: string) {
  return LEGACY[tone] || tone
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const resolved = resolveColor(value)

  return (
    <div className="mr-color-picker">
      <div className="mr-color-presets">
        {PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            title={p.label}
            className={clx("mr-color-swatch", resolved === p.hex && "is-active")}
            style={{ backgroundColor: p.hex }}
            onClick={() => onChange(p.hex)}
          />
        ))}
      </div>
      <label className="mr-color-custom">
        <input
          type="color"
          value={resolved}
          onChange={(e) => onChange(e.target.value)}
        />
        <span
          className="mr-color-preview"
          style={{ backgroundColor: resolved }}
        />
        <span className="mr-color-hex">{resolved}</span>
      </label>
    </div>
  )
}
