// Only established retailers are shown. Anything else (coupon/ad aggregators, unknown shops, overseas stores) is dropped.
const G = ["amazon", "ebay"];
const LIST = {
  AU: ["amazon.com.au", "ebay.com.au", "officeworks.com.au", "jbhifi.com.au", "harveynorman.com.au", "thegoodguys.com.au", "binglee.com.au", "bigw.com.au", "kmart.com.au", "target.com.au", "woolworths.com.au", "coles.com.au", "aldi.com.au", "iga.com.au", "chemistwarehouse.com.au", "priceline.com.au", "amcal.com.au", "terrywhite.com.au", "bunnings.com.au", "myer.com.au", "davidjones.com", "catch.com.au", "danmurphys.com.au", "bws.com.au", "liquorland.com.au", "firstchoiceliquor.com.au", "jbhifi.com.au", "rebelsport.com.au", "supercheapauto.com.au", "repco.com.au", "bcf.com.au", "anacondastores.com", "petbarn.com.au", "petstock.com.au", "mightyape.com.au", "ikea.com", "apple.com", "mydeal.com.au", "kogan.com", "cexs.com.au", "scorptec.com.au", "pccasegear.com", "umart.com.au", "centrecom.com.au", "mwave.com.au", "msy.com.au", "ebgames.com.au", "dyson.com.au", "sephora.com.au", "mecca.com", "adorebeauty.com.au", "lookfantastic.com.au", "ozhairandbeauty.com", "allbeauty.com", "pharmacydirect.com.au", "discountdrugstores.com.au"],
  US: ["amazon.com", "ebay.com", "walmart.com", "target.com", "bestbuy.com", "costco.com", "homedepot.com", "lowes.com", "newegg.com", "macys.com", "kohls.com", "nordstrom.com", "cvs.com", "walgreens.com", "kroger.com", "samsclub.com", "bhphotovideo.com", "adorama.com", "ulta.com", "sephora.com", "apple.com", "dell.com", "staples.com", "officedepot.com", "chewy.com", "wayfair.com", "gamestop.com"],
  GB: ["amazon.co.uk", "ebay.co.uk", "argos.co.uk", "currys.co.uk", "johnlewis.com", "tesco.com", "sainsburys.co.uk", "asda.com", "boots.com", "superdrug.com", "very.co.uk", "ao.com", "screwfix.com", "diy.com", "next.co.uk", "marksandspencer.com", "lookfantastic.com", "apple.com"],
  CA: ["amazon.ca", "ebay.ca", "bestbuy.ca", "walmart.ca", "canadiantire.ca", "costco.ca", "shoppersdrugmart.ca", "londondrugs.com", "homedepot.ca", "staples.ca", "apple.com"],
  IN: ["amazon.in", "flipkart.com", "croma.com", "reliancedigital.in", "tatacliq.com", "myntra.com", "nykaa.com", "bigbasket.com", "apple.com"],
  DE: ["amazon.de", "ebay.de", "mediamarkt.de", "saturn.de", "otto.de", "dm.de", "rossmann.de", "apple.com"],
  FR: ["amazon.fr", "fnac.com", "darty.com", "cdiscount.com", "boulanger.com", "carrefour.fr", "apple.com"],
  JP: ["amazon.co.jp", "rakuten.co.jp", "yodobashi.com", "biccamera.com", "apple.com"],
  SG: ["amazon.sg", "lazada.sg", "shopee.sg", "courts.com.sg", "harveynorman.com.sg", "apple.com"],
  NZ: ["amazon.com.au", "mightyape.co.nz", "pbtech.co.nz", "noelleeming.co.nz", "countdown.co.nz", "thewarehouse.co.nz", "harveynorman.co.nz", "chemistwarehouse.co.nz", "apple.com"],
  AE: ["amazon.ae", "noon.com", "sharafdg.com", "carrefouruae.com", "apple.com"],
  BR: ["amazon.com.br", "mercadolivre.com.br", "magazineluiza.com.br", "americanas.com.br", "apple.com"],
  KR: ["amazon.co.kr", "coupang.com", "gmarket.co.kr", "11st.co.kr", "apple.com"],
};
const bare = (h) => String(h).toLowerCase().replace(/^www\./, "");
export function isTrusted(url, country) {
  let h; try { h = bare(new URL(url).hostname); } catch { return false; }
  return (LIST[country] ?? []).some((d) => h === d || h.endsWith("." + d));
}
/** For shopping-API results that give a store NAME instead of a URL. */
export function trustedStoreName(name, country) {
  const n = String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return (LIST[country] ?? []).some((d) => { const b = d.split(".")[0]; return n.includes(b) && n.length <= b.length + 14; });
}
