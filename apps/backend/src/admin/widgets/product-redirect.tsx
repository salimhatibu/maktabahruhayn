import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/**
 * Products are edited in the Maktabah product editor. Medusa's own product
 * list and product page hand off to it; add ?classic=1 to stay on Medusa's
 * page (used for the rarely needed advanced settings).
 */
const ProductRedirect = ({ data }: { data?: { id?: string } }) => {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  useEffect(() => {
    if (new URLSearchParams(search).has("classic")) {
      return
    }
    const path = pathname.replace(/\/+$/, "")
    if (path.endsWith("/products")) {
      navigate("/products/catalog", { replace: true })
    } else if (data?.id && path.endsWith(`/products/${data.id}`)) {
      navigate(`/products/catalog/${data.id}`, { replace: true })
    }
  }, [pathname, search, data?.id, navigate])

  return null
}

export const config = defineWidgetConfig({
  zone: ["product.list.before", "product.details.before"],
})

export default ProductRedirect
