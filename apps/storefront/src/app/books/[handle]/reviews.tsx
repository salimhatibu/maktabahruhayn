"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { submitReviewAction, type ReviewFormState } from "@/app/actions/account"

const initial: ReviewFormState = { error: null }

export function WriteReview({
  productId,
  handle,
  signedIn,
}: {
  productId: string
  handle: string
  signedIn: boolean
}) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [state, action, pending] = useActionState(submitReviewAction, initial)

  if (!signedIn) {
    return (
      <p>
        <Link href={`/account/login?next=/books/${handle}%23reviews`} className="btn btn-outline">
          Sign in to Write a Review
        </Link>
      </p>
    )
  }
  if (state.done) {
    return <p className="form-success" role="status">Thank you! Your review is now live.</p>
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        Write a Review
      </button>
    )
  }

  return (
    <form action={action} className="review-form">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="rating" value={rating} />
      <fieldset className="star-input">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={rating === n}
            className={(hover || rating) >= n ? "is-on" : ""}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </fieldset>
      <label>
        Headline (optional)
        <input name="title" maxLength={120} />
      </label>
      <label>
        Your review
        <textarea name="content" rows={5} minLength={10} maxLength={5000} required />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="review-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Posting…" : "Post Review"}
        </button>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
