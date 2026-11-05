// Regression table for store-country detection. Pure function test; run with: node tests/country.mjs
import fs from "node:fs";
import vm from "node:vm";
globalThis.window = {}; globalThis.DOMParser = class {};
vm.runInThisContext(fs.readFileSync("docs/engine.js", "utf8"));
const D = window.DW;
const CASES = [
  // [url, visitor region, expected country]
  ["https://www.zara.com/au/en/regular-fit-faux-suede-jacket-p03548150.html?v1=546130654&v2=2510672", "US", "AU"],
  ["https://www.zara.com/au/en/regular-fit-faux-suede-jacket-p03548150.html?v1=546130654&v2=2510672", "AU", "AU"],
  ["https://www.zara.com/us/en/x-p1.html", "AU", "US"],
  ["https://www.zara.com/in/en/x-p1.html", "AU", "IN"],
  ["https://www2.hm.com/en_in/productpage.1.html", "AU", "IN"],
  ["https://www.nike.com/au/t/shoe", "US", "AU"],
  ["https://www.ikea.com/au/en/p/billy-1/", "IN", "AU"],
  ["https://www.apple.com/au/shop/buy-iphone", "US", "AU"],
  ["https://www.asos.com/gb/men/p/1", "AU", "GB"],
  ["https://www.asos.com/uk/men/p/1", "AU", "GB"],
  ["https://uk.camelcamelcamel.com/product/B09Y2MYL5C", "AU", "GB"],
  ["https://www.myntra.com/perfume/prada/x/21596686/buy", "AU", "IN"],
  ["https://www.amazon.com/dp/B09XSDMT4F", "AU", "US"],
  ["https://www.amazon.com.au/dp/B09XSDMT4F", "US", "AU"],
  ["https://www.jbhifi.com.au/products/x", "US", "AU"],
  ["https://www.vijaysales.com/p/1/x", "AU", "IN"],
  ["https://www.some-unknown-shop.com/product/123", "IN", "IN"],
  ["https://www.some-unknown-shop.com/product/123", "AU", "AU"],
  ["https://www.some-unknown-shop.com/product/123", "DE", "DE"],
  ["https://www.example.com/en/product/9", "SG", "SG"],
];
let fail = 0;
for (const [url, region, want] of CASES) {
  const got = D.makeItem(url, "", region);
  const ok = got.country === want && got.storeCountry === want;
  if (!ok) fail++;
  console.log(ok ? "PASS" : "FAIL", `region ${region} -> ${got.country} (want ${want})`, url.slice(0, 80));
}
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
