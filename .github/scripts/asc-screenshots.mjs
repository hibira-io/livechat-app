// Uploads the App Store screenshots in store/ios/screenshots/<locale>/ to the
// iOS version that is still being prepared in App Store Connect, replacing
// what that locale had for 6.9" iPhones. Files go in name order. A locale the
// version doesn't have yet is added (its texts are then filled in App Store
// Connect). Locales without a folder keep what they have.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the team API key the release
// uses) and BUNDLE_ID (io.hibira.chat).
// Adapted from hibira-io/gaya .github/scripts/asc-screenshots.mjs.
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.appstoreconnect.apple.com/v1";
const DIR = "store/ios/screenshots";
// 1320x2868 (6.9") and 1290x2796 (6.7") both belong to this display type.
const DISPLAY = "APP_IPHONE_67";

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, BUNDLE_ID } = process.env;
for (const [k, v] of Object.entries({ ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, BUNDLE_ID })) {
  if (!v) throw new Error(`${k} is not set`);
}

const b64url = (/** @type {Buffer|string} */ b) => Buffer.from(b).toString("base64url");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" }));
  const key = createPrivateKey(/** @type {string} */ (ASC_KEY_P8));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

/** @param {string} method @param {string} path @param {any} [body] */
async function asc(method, path, body) {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    method,
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const app = (await asc("GET", `/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`)).data[0];
if (!app) throw new Error(`No App Store Connect app has the bundle ID ${BUNDLE_ID}`);

const editable = new Set(["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"]);
const versions = await asc("GET", `/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`);
const version = versions.data.find((/** @type {any} */ v) => editable.has(v.attributes.appStoreState ?? v.attributes.appVersionState));
if (!version) throw new Error("No iOS version is being prepared in App Store Connect");
console.log(`${app.attributes.name}, version ${version.attributes.versionString} (${version.id})`);

const locs = (await asc("GET", `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data;
const folders = (await readdir(DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
let summary = "";

for (const locale of folders) {
  const files = (await readdir(join(DIR, locale))).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  if (!files.length) continue;
  let loc = locs.find((/** @type {any} */ l) => l.attributes.locale === locale);
  if (!loc) {
    loc = (await asc("POST", "/appStoreVersionLocalizations", {
      data: {
        type: "appStoreVersionLocalizations",
        attributes: { locale },
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: version.id } } },
      },
    })).data;
    console.log(`${locale} added to this version`);
  }

  const sets = (await asc("GET", `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data;
  let set = sets.find((/** @type {any} */ s) => s.attributes.screenshotDisplayType === DISPLAY);
  if (set) {
    const old = (await asc("GET", `/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
    for (const s of old) await asc("DELETE", `/appScreenshots/${s.id}`);
  } else {
    set = (await asc("POST", "/appScreenshotSets", {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType: DISPLAY },
        relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } },
      },
    })).data;
  }

  const ids = [];
  for (const name of files) {
    const bytes = await readFile(join(DIR, locale, name));
    const shot = (await asc("POST", "/appScreenshots", {
      data: {
        type: "appScreenshots",
        attributes: { fileName: name, fileSize: bytes.length },
        relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } },
      },
    })).data;
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries(op.requestHeaders.map((/** @type {any} */ h) => [h.name, h.value]));
      const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`upload ${locale}/${name}: ${res.status} ${await res.text()}`);
    }
    await asc("PATCH", `/appScreenshots/${shot.id}`, {
      data: {
        type: "appScreenshots",
        id: shot.id,
        attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(bytes).digest("hex") },
      },
    });
    ids.push(shot.id);
    console.log(`${locale}/${name} uploaded`);
  }
  await asc("PATCH", `/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
    data: ids.map((id) => ({ type: "appScreenshots", id })),
  });
  summary += `- ${locale}: ${files.length} screenshots\n`;
}

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### App Store screenshots for ${version.attributes.versionString}\n${summary}`);
}
