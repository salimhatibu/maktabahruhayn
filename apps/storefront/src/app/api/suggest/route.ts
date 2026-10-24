import { NextResponse, type NextRequest } from "next/server"
import { listCatalogue } from "@/lib/catalogue"
import { mediaUrl } from "@/lib/config"

/** Typeahead suggestions for the header search box, straight from the index. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80)
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }
  const { books } = await listCatalogue({ q, limit: 6 })
  return NextResponse.json(
    {
      suggestions: books
        .filter((book) => book.handle)
        .map((book) => ({
          handle: book.handle,
          title: book.title,
          author: book.author,
          arabicTitle: book.arabicTitle,
          cover: mediaUrl(book.cover),
        })),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
  )
}
