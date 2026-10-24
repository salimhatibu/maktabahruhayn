"use client"

import { startTransition, type FormEvent } from "react"

/**
 * Submits a form to its server action without letting React 19 reset it.
 *
 * A `<form action>` is cleared after every submission, so a validation error
 * would wipe everything the shopper typed (an address, a review). Used as
 * `onSubmit`, this runs the same action in a transition instead; the form's
 * `action` stays in place for browsers without JavaScript, and React skips it
 * once this has handled the event.
 */
export function keep(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const data = new FormData(event.currentTarget, submitter instanceof HTMLElement ? submitter : undefined)
    startTransition(() => action(data))
  }
}
