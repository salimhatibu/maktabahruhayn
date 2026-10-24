/**
 * Medusa's UI preset, the same one the previous admin was built on, so the
 * ported pages keep their exact colours, spacing and component styling.
 */
module.exports = {
  presets: [require("@medusajs/ui-preset")],
  // The console is light only. "class" keeps the preset's dark tokens (dark
  // borders and shadows) behind a `.dark` class that is never set, instead of
  // switching them on whenever the browser prefers dark mode.
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@medusajs/ui/dist/**/*.{js,jsx,ts,tsx}",
  ],
}
