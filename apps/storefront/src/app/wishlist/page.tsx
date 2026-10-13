import type { Metadata } from "next"
import { WishlistGrid } from "@/components/wishlist"

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } }

export default function WishlistPage() {
  return (
    <main className="wrap section-pad">
      <h1 className="serif-title page-title">Your Wishlist</h1>
      <p className="muted">Saved on this device.</p>
      <WishlistGrid />
    </main>
  )
}
