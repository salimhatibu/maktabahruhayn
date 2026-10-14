import { fileKeyFromUrl, productFileUrls } from "../product-files"

describe("fileKeyFromUrl", () => {
  it("reads the storage key out of a local upload URL", () => {
    expect(fileKeyFromUrl("http://localhost:9000/static/1791626844243-cover-1.webp")).toBe(
      "1791626844243-cover-1.webp"
    )
    expect(fileKeyFromUrl("https://api.maktabahruhayn.com/static/sample.pdf?v=2")).toBe("sample.pdf")
    expect(fileKeyFromUrl("/static/1791626844243-cover%201.webp")).toBe("1791626844243-cover 1.webp")
  })

  it("ignores images that were never uploaded here", () => {
    expect(fileKeyFromUrl("https://images.example.com/covers/cover-1.webp")).toBeNull()
    expect(fileKeyFromUrl("")).toBeNull()
  })

  it("reads the key out of an R2 URL when R2 is configured", () => {
    const previous = process.env.R2_PUBLIC_URL
    process.env.R2_PUBLIC_URL = "https://media.maktabahruhayn.com/"
    try {
      expect(fileKeyFromUrl("https://media.maktabahruhayn.com/covers/cover-1.webp")).toBe(
        "covers/cover-1.webp"
      )
      expect(fileKeyFromUrl("https://other.example.com/covers/cover-1.webp")).toBeNull()
    } finally {
      process.env.R2_PUBLIC_URL = previous
    }
  })
})

describe("productFileUrls", () => {
  it("collects images, the thumbnail and the sample PDF without duplicates", () => {
    expect(
      productFileUrls({
        thumbnail: "/static/a.webp",
        images: [{ url: "/static/a.webp" }, { url: "/static/b.webp" }],
        book: { sample_pdf_url: "/static/sample.pdf" },
      })
    ).toEqual(["/static/a.webp", "/static/b.webp", "/static/sample.pdf"])
  })

  it("tolerates a product with no media", () => {
    expect(productFileUrls({ thumbnail: null, images: [], book: null })).toEqual([])
    expect(productFileUrls(undefined)).toEqual([])
  })
})
