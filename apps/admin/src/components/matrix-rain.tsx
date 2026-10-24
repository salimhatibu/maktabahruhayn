"use client"

import { useEffect, useRef } from "react"

/**
 * The cmatrix rain, in red, behind the dashboard.
 *
 * It is decorative: `aria-hidden`, no pointer events, and drawn at low
 * opacity so text above it keeps its contrast. It stops entirely when the
 * visitor asks for reduced motion, and pauses when the tab is hidden rather
 * than burning a laptop battery in the background.
 */
const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789"
const FONT_SIZE = 14
const FRAME_MS = 70

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) {
      return
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    let columns: number[] = []
    let frame = 0
    let last = 0

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * ratio
      canvas.height = window.innerHeight * ratio
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.font = `${FONT_SIZE}px ui-monospace, Menlo, monospace`
      // One falling stream per column, each starting at a random height so
      // the rain does not begin as a straight line.
      columns = Array.from({ length: Math.ceil(window.innerWidth / FONT_SIZE) }, () =>
        Math.floor((Math.random() * window.innerHeight) / FONT_SIZE)
      )
    }

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw)
      if (time - last < FRAME_MS) {
        return
      }
      last = time

      // Fading the previous frame rather than clearing it leaves the trail.
      context.fillStyle = "rgba(255, 255, 255, 0.16)"
      context.fillRect(0, 0, window.innerWidth, window.innerHeight)

      columns.forEach((y, index) => {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        const x = index * FONT_SIZE
        // The leading glyph is brighter, as in cmatrix.
        context.fillStyle = Math.random() > 0.97 ? "#ff1f3d" : "#d80f21"
        context.fillText(glyph, x, y * FONT_SIZE)
        columns[index] =
          y * FONT_SIZE > window.innerHeight && Math.random() > 0.975 ? 0 : y + 1
      })
    }

    const onVisibility = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden) {
        frame = requestAnimationFrame(draw)
      }
    }

    resize()
    frame = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="mr-rain" aria-hidden="true" />
}
