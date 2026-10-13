/**
 * Every cover sits in the same 3:4 frame so grids line up whatever the
 * photo's shape. Shows the product image when there is one, otherwise a typographic
 * cover in the style of classical Arabic bindings: a dark cloth color chosen
 * deterministically from the handle, a gold double frame, the Arabic title,
 * and the English title and author.
 */
const PALETTES = [
  { bg: "#1f3d2e", ink: "#e6cf8b" },
  { bg: "#5b1e25", ink: "#ecd29a" },
  { bg: "#17324f", ink: "#e3c983" },
  { bg: "#3a2a4f", ink: "#e9d5a0" },
  { bg: "#0f4b4a", ink: "#ecd8a3" },
  { bg: "#2a2622", ink: "#d9bd74" },
  { bg: "#6a3a1d", ink: "#f0dcae" },
  { bg: "#22403f", ink: "#e1c27a" },
];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type CoverBook = {
  handle: string;
  title: string;
  author?: string | null;
  arabicTitle?: string | null;
  cover?: string | null;
};

export function BookCover({
  book,
  priority = false,
  className = "",
}: {
  book: CoverBook;
  priority?: boolean;
  className?: string;
}) {
  if (book.cover) {
    return (
      <div className={`cover-frame ${className}`}>
        {/* Catalog images come from Medusa uploads or R2 on arbitrary hosts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="cover-img"
          src={book.cover}
          alt={`Cover of ${book.title}`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
    );
  }

  const palette = PALETTES[hash(book.handle || book.title) % PALETTES.length];

  return (
    <div className={`cover-frame is-generated ${className}`}>
      <div
        className="gen-cover"
        style={
          {
            "--cover-bg": palette.bg,
            "--cover-ink": palette.ink,
          } as React.CSSProperties
        }
        role="img"
        aria-label={`Cover of ${book.title}${book.author ? ` by ${book.author}` : ""}`}
      >
        <div className="gen-cover-body">
          <div className="gen-cover-frame">
            <span className="gen-cover-star" aria-hidden="true" />
            {book.arabicTitle ? (
              <p className="gen-cover-arabic" lang="ar" dir="rtl">
                {book.arabicTitle}
              </p>
            ) : null}
            <p className="gen-cover-title">{book.title}</p>
            {book.author ? (
              <p className="gen-cover-author">{book.author}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
