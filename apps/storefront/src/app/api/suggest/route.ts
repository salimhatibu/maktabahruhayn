import { NextResponse, type NextRequest } from "next/server"
import { mediaUrl } from "@/lib/config"
import { searchBooks } from "@/lib/medusa"

/** Typeahead suggestions for the header search box. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80)
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }
  const result = await searchBooks(q, {}, "relevance", 6)
  return NextResponse.json(
    {
      suggestions: result.hits
        .filter((h) => h.handle)
        .map((h) => ({
          handle: h.handle,
          title: h.title,
          author: h.author || null,
          arabicTitle: h.title_arabic || null,
          cover: mediaUrl(h.thumbnail),
        })),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
  )
}
