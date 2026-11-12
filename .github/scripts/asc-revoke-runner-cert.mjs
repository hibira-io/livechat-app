// Revokes the Apple Development certificate that this runner's Xcode made.
//
// Automatic signing with -allowProvisioningUpdates archives with an Apple
// Development identity. A fresh runner has none, so Xcode creates a new
// certificate on the team every release, and its private key is gone with
// the runner. Export re-signs with the cloud-managed Apple Distribution
// certificate, so the development one is useless once the job ends: this
// revokes exactly the ones whose keys are in this runner's keychain.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8.
import { execFileSync } from "node:child_process";
import { createPrivateKey, sign, X509Certificate } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com/v1";
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env;
for (const [k, v] of Object.entries({ ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 })) {
  if (!v) throw new Error(`${k} is not set`);
}

const b64url = (/** @type {Buffer|string} */ b) => Buffer.from(b).toString("base64url");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 10 * 60, aud: "appstoreconnect-v1" }));
  const key = createPrivateKey(/** @type {string} */ (ASC_KEY_P8));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

/** @param {string} method @param {string} path */
async function asc(method, path) {
  const res = await fetch(API + path, { method, headers: { authorization: `Bearer ${token()}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const serial = (/** @type {string} */ s) => s.replace(/[^0-9a-f]/gi, "").replace(/^0+/, "").toUpperCase();

/** Serial numbers of the Apple Development certificates in this runner's keychains. */
function runnerSerials() {
  let pem = "";
  try {
    pem = execFileSync("security", ["find-certificate", "-a", "-c", "Apple Development", "-p"], { encoding: "utf8" });
  } catch {
    return new Set();
  }
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return new Set(blocks.map((b) => serial(new X509Certificate(b).serialNumber)));
}

const mine = runnerSerials();
if (mine.size === 0) {
  console.log("No Apple Development certificate on this runner");
  process.exit(0);
}
const certs = (await asc("GET", "/certificates?filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&fields[certificates]=serialNumber,displayName&limit=200")).data;
let revoked = 0;
for (const c of certs) {
  if (!mine.has(serial(c.attributes.serialNumber ?? ""))) continue;
  await asc("DELETE", `/certificates/${c.id}`);
  revoked++;
  console.log(`Revoked this runner's development certificate ${c.attributes.serialNumber}`);
}
if (revoked === 0) console.log("This runner's development certificate is not on the team (already revoked)");
