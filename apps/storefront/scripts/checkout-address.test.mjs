import assert from "node:assert/strict"
import { createRequire, Module } from "node:module"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const storefront = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(path.join(storefront, "package.json"))
const esbuild = createRequire(require.resolve("wrangler/package.json"))("esbuild")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

test("saved checkout addresses expose their required town while it loads", async () => {
  const stubs = {
    "next/navigation": "export const useRouter = () => ({})",
    "@/lib/keep-form": "export const keep = () => () => {}",
    "@/app/actions/cart": "export const saveAddressAction = () => {}; export const manualMpesaStatusAction = () => {}; export const mpesaCheckoutStatusAction = () => {}; export const startPaymentAction = () => {}",
    "@/lib/format": "export const formatMoney = () => ''",
    "@/lib/stale-action": "export const callAction = () => {}",
    "./shipping-selection": "export const useShippingSelection = () => ({})",
  }
  const result = await esbuild.build({
    entryPoints: [path.join(storefront, "src/app/checkout/forms.tsx")],
    absWorkingDir: storefront,
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [{
      name: "checkout-test-stubs",
      setup(build) {
        build.onResolve({ filter: /^(next\/navigation|@\/lib\/keep-form|@\/app\/actions\/cart|@\/lib\/format|@\/lib\/stale-action|\.\/shipping-selection)$/ }, ({ path }) => ({ path, namespace: "stub" }))
        build.onLoad({ filter: /.*/, namespace: "stub" }, ({ path }) => ({ contents: stubs[path], loader: "js" }))
      },
    }],
  })
  const compiled = new Module(path.join(storefront, "scripts/checkout-test-bundle.cjs"))
  compiled.filename = path.join(storefront, "scripts/checkout-test-bundle.cjs")
  compiled.paths = Module._nodeModulePaths(path.join(storefront, "scripts"))
  compiled._compile(result.outputFiles[0].text, compiled.filename)
  const { AddressForm } = compiled.exports
  const address = {
    id: "saved", label: "Ruiru", first_name: "A", last_name: "B", address_1: "Street",
    address_2: "", city: "Ruiru", province: "nairobi", postal_code: "", country_code: "ke", phone: "+254712345678",
  }
  const html = renderToStaticMarkup(React.createElement(AddressForm, {
    defaults: { ...address, email: "a@example.com" },
    countries: [{ code: "ke", name: "Kenya", currency: "kes" }],
    currency: "kes", saved: [address], signedIn: true,
  }))
  assert.match(html, /name="city"/)
  assert.match(html, /Loading delivery towns/)
  assert.doesNotMatch(html, /<div hidden/)
})
