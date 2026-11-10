// Uploads the App Store screenshots in store/ios/screenshots/<locale>/ to the
// iOS version that is still being prepared in App Store Connect, replacing
// what that locale had for 6.9" iPhones. Files go in name order. A locale the
// version doesn't have yet is added, named like the app (its texts are then
// filled in App Store Connect). With no version in preparation, VERSION
// (default 1.0) is created. Locales without a folder keep what they have.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the team API key the release
// uses) and BUNDLE_ID (io.hibira.chat).
// Adapted from hibira-io/gaya .github/scripts/asc-screenshots.mjs.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { asc, editableInfo, editableVersion, findApp } from "./asc-api.mjs";

const DIR = "store/ios/screenshots";
// 1320x2868 (6.9") and 1290x2796 (6.7") both belong to this display type.
const DISPLAY = "APP_IPHONE_67";

const { BUNDLE_ID } = process.env;
if (!BUNDLE_ID) throw new Error("BUNDLE_ID is not set");

const app = await findApp(BUNDLE_ID);
const version = await editableVersion(app, process.env.VERSION || "1.0");

// A store language needs the app-level name first; the app's own name is used.
const info = await editableInfo(app);
const infoLocs = (await asc("GET", `/appInfos/${info.id}/appInfoLocalizations?limit=50`)).data;
console.log(`${app.attributes.name}, version ${version.attributes.versionString} (${version.id})`);

const locs = (await asc("GET", `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data;
const folders = (await readdir(DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
let summary = "";

for (const locale of folders) {
  const files = (await readdir(join(DIR, locale))).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  if (!files.length) continue;
  let loc = locs.find((/** @type {any} */ l) => l.attributes.locale === locale);
  if (!infoLocs.some((/** @type {any} */ l) => l.attributes.locale === locale)) {
    await asc("POST", "/appInfoLocalizations", {
      data: {
        type: "appInfoLocalizations",
        attributes: { locale, name: app.attributes.name },
        relationships: { appInfo: { data: { type: "appInfos", id: info.id } } },
      },
    });
    console.log(`${locale} added to the app`);
    // App Store Connect may add the version's language along with it.
    const again = (await asc("GET", `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data;
    loc = again.find((/** @type {any} */ l) => l.attributes.locale === locale);
  }
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
