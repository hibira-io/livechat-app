// App Store creative assets from the app's asset library, one image per
// locale, placed on the iOS version being prepared:
// - store/ios/header/<locale>.png: the wide banner on top of the product
//   page (3840x1646).
// - store/ios/search/<locale>.png: the card in App Store search results
//   (3000x2000, 3:2). Without it, search shows screenshots.
// Each run replaces what that localization had for the placement. The images
// come from store/capture/creative.cjs. Same approach as gaya#160/#161.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { asc, editableVersion, findApp } from "./asc-api.mjs";

const { BUNDLE_ID } = process.env;
const app = await findApp(BUNDLE_ID);
const version = await editableVersion(app, process.env.VERSION || "1.0");
const locs = (await asc("GET", `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data;
let summary = "";

const CREATIVES = [
  { dir: "store/ios/header", type: "PRODUCT_PAGE_HEADER_ASSET", label: "product page header" },
  { dir: "store/ios/search", type: "APP_STORE_SEARCH_RESULTS_ASSET", label: "search results card" },
];
for (const { dir, type, label } of CREATIVES) {
  const images = (await readdir(dir).catch(() => [])).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  for (const name of images) {
    const locale = name.replace(/\.[^.]+$/, "");
    const loc = locs.find((/** @type {any} */ l) => l.attributes.locale === locale);
    if (!loc) {
      console.log(`::warning::${label} ${name}: ${locale} is not a localization of this version; skipped`);
      continue;
    }
    const placed = (await asc("GET", `/appStoreVersionLocalizations/${loc.id}/placements?limit=50`)).data;
    for (const old of placed.filter((/** @type {any} */ x) => x.attributes.placementType === type)) {
      await asc("DELETE", `/appAssetLibraryPlacements/${old.id}`);
    }
    const bytes = await readFile(join(dir, name));
    const image = (await asc("POST", "/appAssetLibraryImages", {
      data: {
        type: "appAssetLibraryImages",
        attributes: { category: "CREATIVE_ASSETS", fileName: `${type.toLowerCase()}-${name}`, fileSize: bytes.length },
        relationships: { assetLibrary: { data: { type: "appAssetLibraries", id: app.id } } },
      },
    })).data;
    for (const op of image.attributes.uploadOperations) {
      const headers = Object.fromEntries(op.requestHeaders.map((/** @type {any} */ h) => [h.name, h.value]));
      const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`upload ${dir}/${name}: ${res.status} ${await res.text()}`);
    }
    await asc("PATCH", `/appAssetLibraryImages/${image.id}`, {
      data: { type: "appAssetLibraryImages", id: image.id, attributes: { uploaded: true } },
    });
    // The placement is refused until Apple has processed the image.
    for (let i = 0; ; i++) {
      try {
        await asc("POST", "/appAssetLibraryPlacements", {
          data: {
            type: "appAssetLibraryPlacements",
            attributes: { placementType: type },
            relationships: {
              image: { data: { type: "appAssetLibraryImages", id: image.id } },
              appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } },
            },
          },
        });
        break;
      } catch (e) {
        if (i >= 12) throw e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    console.log(`${label} ${locale} placed`);
    summary += `- ${locale}: ${label}\n`;
  }
}

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### App Store creatives for ${version.attributes.versionString}\n${summary}`);
}
