/**
 * Runs once when the admin bundle loads (imported by an always-loaded widget).
 *
 * 1. Light mode only: pins Medusa's theme preference to "light" and keeps
 *    the `dark` class off <html>.
 * 2. Fonts: loads Cormorant Garamond for page titles (see theme.css).
 * 3. Landing page: remembers the path we navigated *from*, so the orders
 *    list can hand off to the Dashboard when the user arrived via the
 *    admin root or the login screen (Medusa's default landing).
 */
const THEME_KEY = "medusa_admin_theme"
const PREV_KEY = "mr_prev_path"

declare global {
  interface Window {
    __mrBoot?: boolean
  }
}

if (typeof window !== "undefined" && !window.__mrBoot) {
  window.__mrBoot = true

  try {
    window.localStorage.setItem(THEME_KEY, "light")
  } catch {
    // Storage unavailable; the class guard below still applies.
  }
  const html = document.documentElement
  const forceLight = () => {
    if (html.classList.contains("dark")) {
      html.classList.remove("dark")
    }
    if (!html.classList.contains("light")) {
      html.classList.add("light")
    }
    html.style.colorScheme = "light"
  }
  forceLight()
  new MutationObserver(forceLight).observe(html, { attributes: true, attributeFilter: ["class"] })

  if (!document.getElementById("mr-fonts")) {
    const fonts = document.createElement("link")
    fonts.id = "mr-fonts"
    fonts.rel = "stylesheet"
    fonts.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&display=swap"
    document.head.appendChild(fonts)
  }

  const remember = () => {
    try {
      window.sessionStorage.setItem(PREV_KEY, window.location.pathname)
    } catch {
      // Ignore.
    }
  }
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history)
    window.history[method] = ((...args: Parameters<History["pushState"]>) => {
      remember()
      return original(...args)
    }) as History["pushState"]
  }
  window.addEventListener("popstate", remember)
}

export function arrivedFromDefaultLanding() {
  try {
    const prev = window.sessionStorage.getItem(PREV_KEY) || ""
    return /\/app\/?$|\/app\/login\/?$/.test(prev)
  } catch {
    return false
  }
}
