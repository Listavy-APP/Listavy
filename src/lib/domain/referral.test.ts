// Run: node --experimental-strip-types src/lib/domain/referral.test.ts
import assert from "node:assert/strict";
import { normalizeReferralCode, referralLink, referralShareText, whatsappHref } from "./referral.ts";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL - ${name}`, e);
  }
}

check("codes are trimmed and uppercased", () => {
  assert.equal(normalizeReferralCode("  fabian500 "), "FABIAN500");
});

check("invalid codes are refused", () => {
  assert.equal(normalizeReferralCode("ab"), null);
  assert.equal(normalizeReferralCode("A B C D"), null);
  assert.equal(normalizeReferralCode("<script>"), null);
  assert.equal(normalizeReferralCode(""), null);
  assert.equal(normalizeReferralCode(null), null);
});

check("link uses the origin without a trailing slash", () => {
  assert.equal(referralLink("https://listavy.example/", "FABIAN500"), "https://listavy.example/?ref=FABIAN500");
});

check("client share text names the RD$500 offer", () => {
  const t = referralShareText("client", "FABIAN500", "https://x/?ref=FABIAN500");
  assert.match(t, /RD\$500/);
  assert.match(t, /FABIAN500/);
});

check("pro share text names the free Pro month", () => {
  assert.match(referralShareText("pro", "FABIAN500", "https://x"), /Pro gratis/);
});

check("WhatsApp href encodes the text", () => {
  assert.equal(whatsappHref("hola mundo"), "https://wa.me/?text=hola%20mundo");
});

if (failures > 0) {
  console.error(`${failures} failing`);
  process.exit(1);
}
