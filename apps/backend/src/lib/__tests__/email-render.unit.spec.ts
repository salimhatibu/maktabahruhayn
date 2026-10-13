import { renderTemplate, toEmailHtml } from "../email-render"

describe("renderTemplate", () => {
  it("fills dotted placeholders and blanks unknown ones", () => {
    const out = renderTemplate("Hi {{customer.first_name}}, order #{{ order.display_id }} {{missing.value}}!", {
      customer: { first_name: "Amina" },
      order: { display_id: 12 },
    })
    expect(out).toBe("Hi Amina, order #12 !")
  })
})

describe("toEmailHtml", () => {
  it("escapes HTML, builds paragraphs and links URLs", () => {
    const html = toEmailHtml("Hello <b>there</b>\n\nTrack: https://example.com/t/1", {
      storeName: "Maktabah Ruhayn",
      brand: "#0f5470",
      storeUrl: "https://shop.example",
    })
    expect(html).toContain("Hello &lt;b&gt;there&lt;/b&gt;")
    expect(html).toContain('<a href="https://example.com/t/1"')
    expect(html.match(/<p /g)?.length).toBe(2)
  })
})
