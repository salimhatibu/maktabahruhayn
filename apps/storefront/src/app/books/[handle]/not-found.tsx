import Link from "next/link"

export default function BookNotFound() {
  return (
    <main className="wrap empty-state">
      <h1>We couldn&apos;t find that book</h1>
      <p>It may have been removed or the link may be mistyped.</p>
      <Link href="/books" className="btn btn-primary">
        Browse All Books
      </Link>
    </main>
  )
}
