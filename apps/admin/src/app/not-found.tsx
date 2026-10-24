import Link from "next/link"

export default function NotFound() {
  return (
    <div className="mr-empty-page">
      <p className="mr-empty-code">404</p>
      <h1>This page does not exist</h1>
      <p>The address may be mistyped, or the item may have been deleted.</p>
      <Link href="/" className="mr-btn-primary">
        Back to the dashboard
      </Link>
    </div>
  )
}
