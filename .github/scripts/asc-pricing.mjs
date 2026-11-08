// Makes the app free and sets where it is sold: every App Store territory
// except those in EXCLUDE_TERRITORIES (comma-separated ISO 3166 alpha-3,
// e.g. "JPN,CHN"), plus new territories as Apple adds them. Re-running
// replaces both the price schedule and the availability.
import { asc, findApp } from "./asc-api.mjs";

const app = await findApp(process.env.BUNDLE_ID);
const exclude = new Set((process.env.EXCLUDE_TERRITORIES || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));

// Price: the free price point in the base territory.
let free;
for (let url = `/apps/${app.id}/appPricePoints?filter[territory]=USA&limit=200`; url && !free; ) {
  const page = await asc("GET", url);
  free = page.data.find((/** @type {any} */ p) => Number(p.attributes.customerPrice) === 0);
  url = page.links?.next;
}
if (!free) throw new Error("No free price point for USA");
await asc("POST", "/appPriceSchedules", {
  data: {
    type: "appPriceSchedules",
    relationships: {
      app: { data: { type: "apps", id: app.id } },
      baseTerritory: { data: { type: "territories", id: "USA" } },
      manualPrices: { data: [{ type: "appPrices", id: "${free}" }] },
    },
  },
  included: [{ type: "appPrices", id: "${free}", attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: "appPricePoints", id: free.id } } } }],
});
console.log("Price: free");

// Availability.
const territories = [];
for (let url = "/territories?limit=200"; url; ) {
  const page = await asc("GET", url);
  territories.push(...page.data.map((/** @type {any} */ t) => t.id));
  url = page.links?.next;
}
const items = territories.map((id, i) => ({
  type: "territoryAvailabilities",
  id: `\${t${i}}`,
  attributes: { available: !exclude.has(id) },
  relationships: { territory: { data: { type: "territories", id } } },
}));
await asc("POST", "https://api.appstoreconnect.apple.com/v2/appAvailabilities", {
  data: {
    type: "appAvailabilities",
    attributes: { availableInNewTerritories: true },
    relationships: {
      app: { data: { type: "apps", id: app.id } },
      territoryAvailabilities: { data: items.map(({ type, id }) => ({ type, id })) },
    },
  },
  included: items,
});
const line = `Free, in ${territories.length - [...exclude].filter((t) => territories.includes(t)).length} of ${territories.length} territories` + (exclude.size ? ` (not ${[...exclude].join(", ")})` : "");
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${line}\n`);
}
