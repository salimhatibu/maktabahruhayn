"use client"

import { useState } from "react"

type FaqQuestion = { q: string; a: string }
type FaqCategory = { name: string; slug: string; questions: FaqQuestion[] }

export function FaqClient({ categories, labels }: { categories: FaqCategory[]; labels: { search: string; all: string; empty: string } }) {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const term = search.trim().toLowerCase()

  const filtered = categories
    .map((cat) => ({
      ...cat,
      questions: cat.questions.filter(
        (fq) =>
          (!term || fq.q.toLowerCase().includes(term) || fq.a.toLowerCase().includes(term)) &&
          (!activeCategory || cat.slug === activeCategory)
      ),
    }))
    .filter((cat) => cat.questions.length > 0)

  return (
    <>
      <div className="faq-controls">
        <input
          type="search"
          className="faq-search"
          placeholder={labels.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="faq-tabs">
          <button
            type="button"
            className={`chip ${!activeCategory ? "is-active" : ""}`}
            onClick={() => setActiveCategory(null)}
          >
            {labels.all}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              className={`chip ${activeCategory === cat.slug ? "is-active" : ""}`}
              onClick={() => setActiveCategory(activeCategory === cat.slug ? null : cat.slug)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        filtered.map((cat) => (
          <section key={cat.slug} className="faq-section">
            <h2 className="faq-category">{cat.name}</h2>
            {cat.questions.map((fq, i) => (
              <details key={i} className="faq-item">
                <summary>{fq.q}</summary>
                <div className="faq-answer" dangerouslySetInnerHTML={{ __html: fq.a }} />
              </details>
            ))}
          </section>
        ))
      ) : (
        <p className="faq-empty">{labels.empty}</p>
      )}
    </>
  )
}
