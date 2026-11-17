"use client"

import { keep } from "@/lib/keep-form"
import Link from "next/link"
import { useActionState, useState, type ChangeEvent } from "react"
import { submitReviewAction, type ReviewFormState } from "@/app/actions/account"

const initial: ReviewFormState = { error: null }

const MAX_SIDE = 1600

/** Phone photos are several MB; scale them down in the browser before upload. */
async function shrinkPhoto(event: ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const file = input.files?.[0]
  if (!file || !file.type.startsWith("image/")) return
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    if (!blob || blob.size >= file.size) return
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }))
    input.files = transfer.files
  } catch {
    // The original is uploaded as is; the server enforces its own limits.
  }
}

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
    return <p className="form-success" role="status">Thank you! Your review will appear here once it has been approved.</p>
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        Write a Review
      </button>
    )
  }

  return (
    <form action={action} onSubmit={keep(action)} className="review-form">
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
        <textarea name="content" rows={5} minLength={10} maxLength={4000} required />
      </label>
      <label>
        Photo of your purchase (optional)
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={shrinkPhoto} />
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
