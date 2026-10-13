import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import "../theme.css"
import { arrivedFromDefaultLanding } from "../lib/boot"

/**
 * Medusa sends users to the orders list after login and from /app. When we
 * got here that way, continue to the Dashboard instead; direct visits to
 * Orders are left alone.
 */
const DashboardLanding = () => {
  const navigate = useNavigate()
  useEffect(() => {
    if (arrivedFromDefaultLanding()) {
      navigate("/dashboard", { replace: true })
    }
  }, [navigate])
  return null
}

export const config = defineWidgetConfig({ zone: "order.list.before" })

export default DashboardLanding
