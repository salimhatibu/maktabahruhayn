import assert from "node:assert/strict"
/**
 * The description sanitiser against the usual XSS payloads, including the
 * unclosed-tag trick that beat the regex version it replaced.
 *
 *   pnpm html:test
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
const { sanitizeHtml, safeHref } = await import(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/html.ts"))
const attacks = [
  `<img src=x onerror=alert(1)//<p>hi</p>`,
  `<script>alert(1)</script>`,
  `<scr<script>ipt>alert(1)</script>`,
  `<p onclick="alert(1)">x</p>`,
  `<a href="javascript:alert(1)">x</a>`,
  `<a href="JaVaScRiPt:alert(1)">x</a>`,
  `<a href="jav&#x61;script:alert(1)">x</a>`,
  `<a href=" javascript:alert(1)">x</a>`,
  `<a href="java\tscript:alert(1)">x</a>`,
  `<a href='data:text/html,<script>alert(1)</script>'>x</a>`,
  `<a href="//evil.com">x</a>`,
  `<a href="/\\evil.com">x</a>`,
  `<svg><script>alert(1)</script></svg>`,
  `<svg onload=alert(1)>`,
  `<iframe src="https://evil.com"></iframe>`,
  `<style>body{display:none}</style>`,
  `<!--<img src=x onerror=alert(1)>-->`,
  `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
  `<p>ok</p><img src="x" onerror="alert(1)"`,
  `"><img src=x onerror=alert(1)>`,
  `<a href="https://ok.com" onmouseover="alert(1)">x</a>`,
  `<a href="https://ok.com\\" onmouseover=alert(1) x=\\"">x</a>`,
  `<details open ontoggle=alert(1)>`,
  `<object data="x"></object><embed src="x">`,
  `<form action="https://evil.com"><input name=p></form>`,
  `<base href="https://evil.com/">`,
  `<meta http-equiv="refresh" content="0;url=https://evil.com">`,
  `<<p>>`,
  `<p>unclosed <strong>bold`,
]
const bad = /<(?!\/?(p|br|hr|h2|h3|h4|strong|b|em|i|u|s|sub|sup|ul|ol|li|blockquote|a|code|pre|table|thead|tbody|tr|th|td)\b)|\bon[a-z]+\s*=|javascript:|data:|<a href="(?!https?:\/\/[^/\\]|mailto:|\/(?![/\\]))/i
for (const input of attacks) {
  const out = sanitizeHtml(input)
  // Any tag in the output must be an allowed tag with no attributes, except a checked href.
  for (const tag of out.match(/<[^>]*>/g) || []) {
    assert.match(tag, /^<\/?(p|br|hr|h2|h3|h4|strong|b|em|i|u|s|sub|sup|ul|ol|li|blockquote|code|pre|table|thead|tbody|tr|th|td)>$|^<a( href="(https?:\/\/[^"\\/][^"]*|mailto:[^"]+|\/(?![/\\])[^"]*)"( rel="noopener noreferrer nofollow" target="_blank")?)?>$|^<\/a>$/, `unsafe tag ${tag} from ${input}`)
  }
  assert.equal((out.match(/</g) || []).length, (out.match(/<[^<>]*>/g) || []).length, `raw < in output for ${input}: ${out}`)
}
const keep = sanitizeHtml(`<h2>Title</h2><p>Tom &amp; Jerry &copy; 5 &lt; 6 & co</p><ul><li><a href="https://darussalam.com">link</a></li></ul>`)
assert.equal(keep, `<h2>Title</h2><p>Tom &amp; Jerry &copy; 5 &lt; 6 &amp; co</p><ul><li><a href="https://darussalam.com" rel="noopener noreferrer nofollow" target="_blank">link</a></li></ul>`)
assert.equal(safeHref("/books/x"), "/books/x"); assert.equal(safeHref("/\\evil"), null); assert.equal(safeHref("//evil"), null)
console.log(`${attacks.length} payloads neutralised, legitimate formatting preserved`)
