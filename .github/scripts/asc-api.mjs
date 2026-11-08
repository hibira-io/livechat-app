// App Store Connect API helpers shared by the asc-* scripts.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the team API key the release uses).
import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com/v1";
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env;
for (const [k, v] of Object.entries({ ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 })) {
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
export async function asc(method, path, body) {
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

/** @param {string} bundleId */
export async function findApp(bundleId) {
  const app = (await asc("GET", `/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`)).data[0];
  if (!app) throw new Error(`No App Store Connect app has the bundle ID ${bundleId}`);
  return app;
}

const editable = new Set(["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"]);

/** The iOS version still being prepared, created as `create` when there is none. @param {any} app @param {string} [create] */
export async function editableVersion(app, create) {
  const versions = await asc("GET", `/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const found = versions.data.find((/** @type {any} */ v) => editable.has(v.attributes.appStoreState ?? v.attributes.appVersionState));
  if (found || !create) return found;
  const made = (await asc("POST", "/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: { platform: "IOS", versionString: create },
      relationships: { app: { data: { type: "apps", id: app.id } } },
    },
  })).data;
  console.log(`Version ${create} created`);
  return made;
}

/** The app info that the next version edits. @param {any} app */
export async function editableInfo(app) {
  const infos = (await asc("GET", `/apps/${app.id}/appInfos?limit=10`)).data;
  return infos.find((/** @type {any} */ i) => !["READY_FOR_SALE", "REPLACED_WITH_NEW_INFO"].includes(i.attributes.appStoreState ?? i.attributes.state)) ?? infos[0];
}
