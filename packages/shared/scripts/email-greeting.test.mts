import { strict as assert } from "node:assert"
import { test } from "node:test"
import { greetCustomerEmail } from "../src/email-greeting.ts"
import { renderEmailHtml } from "../src/email-template.ts"

test("replaces the existing order greeting in both formats", () => {
  const result = greetCustomerEmail({
    html: "Assalamu alaikum Amina,<br><br>Thank you for your order.",
    text: "Assalamu alaikum Amina,\n\nThank you for your order.",
    customerName: "Amina Yusuf",
  })
  assert.equal(result.html, "<p>As-Salaam Aleikum Warahmatullahi Wabarakatuh, Amina Yusuf</p>Thank you for your order.")
  assert.equal(result.text, "As-Salaam Aleikum Warahmatullahi Wabarakatuh, Amina Yusuf\n\nThank you for your order.")
})

test("handles formatted legacy greetings and escapes names", () => {
  const result = greetCustomerEmail({
    html: "<p><strong>Dear Customer,</strong></p><p>Books are ready.</p>",
    text: "Dear Customer,\n\nBooks are ready.",
    customerName: '  Amina & <Yusuf>  ',
  })
  assert.equal(result.html, "<p>As-Salaam Aleikum Warahmatullahi Wabarakatuh, Amina &amp; &lt;Yusuf&gt;</p><p>Books are ready.</p>")
  assert.equal(result.text, "As-Salaam Aleikum Warahmatullahi Wabarakatuh, Amina & <Yusuf>\n\nBooks are ready.")
})

test("uses a fallback, preserves content and is idempotent", () => {
  const input = { html: "<h2>Books are back</h2><p>Available now.</p>", text: "Books are back\n\nAvailable now.", customerName: "  " }
  const result = greetCustomerEmail(input)
  assert.equal(result.html, "<p>As-Salaam Aleikum Warahmatullahi Wabarakatuh, Customer</p><h2>Books are back</h2><p>Available now.</p>")
  assert.equal(result.text, "As-Salaam Aleikum Warahmatullahi Wabarakatuh, Customer\n\nBooks are back\n\nAvailable now.")
  assert.deepEqual(greetCustomerEmail(result), result)
})

test("does not mistake introductory content for a greeting", () => {
  const result = greetCustomerEmail({ html: "<p>Hello and welcome to our shop</p>", text: "Hello and welcome to our shop", customerName: null })
  assert.match(result.html, /<p>Hello and welcome to our shop<\/p>$/)
  assert.match(result.text, /Hello and welcome to our shop$/)
})

test("the email shell places the greeting before branding when requested", () => {
  const greeted = greetCustomerEmail({ html: "<p>Message</p>", text: "Message", customerName: "Amina" })
  const html = renderEmailHtml({ bodyHtml: greeted.html, storeName: "Bookshop", preheader: "Preview", greetingFirst: true })
  assert.ok(html.indexOf("As-Salaam Aleikum Warahmatullahi Wabarakatuh, Amina") < html.indexOf(">Bookshop</p>"))
  assert.match(html, />Message<\/p>/)
})
