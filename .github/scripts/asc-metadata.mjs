// Fills the App Store listing of the iOS version being prepared from
// store/ios/metadata: <locale>.json (name, subtitle, privacyPolicyUrl,
// description, keywords, promotionalText, supportUrl, marketingUrl, whatsNew)
// and app.json (categories, content rights, copyright, age rating, review
// notes). Same file format as hibira-io/gaya app/ios/store/metadata.
//
// The review contact is copied from the reference app (REF_BUNDLE_ID,
// default io.hibira.gaya), so its phone number never sits in this repo. The
// demo account comes from the secrets ASC_DEMO_USER / ASC_DEMO_PASSWORD when
// set.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, BUNDLE_ID, VERSION.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { asc, editableInfo, editableVersion, findApp } from "./asc-api.mjs";

const DIR = "store/ios/metadata";
const { BUNDLE_ID } = process.env;
if (!BUNDLE_ID) throw new Error("BUNDLE_ID is not set");

const app = await findApp(BUNDLE_ID);
const version = await editableVersion(app, process.env.VERSION || "1.0");
const info = await editableInfo(app);
const meta = JSON.parse(await readFile(join(DIR, "app.json"), "utf8"));
const firstRelease = !(await asc("GET", `/apps/${app.id}/appStoreVersions?filter[appStoreState]=READY_FOR_SALE&limit=1`)).data.length;
let summary = "";

/** @param {Record<string, unknown>} o */
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

// App level: content rights, categories, age rating.
await asc("PATCH", `/apps/${app.id}`, {
  data: { type: "apps", id: app.id, attributes: { contentRightsDeclaration: meta.contentRightsDeclaration } },
});
await asc("PATCH", `/appInfos/${info.id}`, {
  data: {
    type: "appInfos",
    id: info.id,
    relationships: {
      primaryCategory: { data: { type: "appCategories", id: meta.primaryCategory } },
      ...(meta.secondaryCategory ? { secondaryCategory: { data: { type: "appCategories", id: meta.secondaryCategory } } } : {}),
    },
  },
});
const age = (await asc("GET", `/appInfos/${info.id}/ageRatingDeclaration`)).data;
await asc("PATCH", `/ageRatingDeclarations/${age.id}`, {
  data: { type: "ageRatingDeclarations", id: age.id, attributes: meta.ageRating },
});
summary += `- categories ${meta.primaryCategory} / ${meta.secondaryCategory ?? "none"}, content rights, age rating\n`;

// Version level: copyright.
await asc("PATCH", `/appStoreVersions/${version.id}`, {
  data: { type: "appStoreVersions", id: version.id, attributes: { copyright: meta.copyright } },
});

// Per language: the app-level name/subtitle/privacy URL, then the version's texts.
let infoLocs = (await asc("GET", `/appInfos/${info.id}/appInfoLocalizations?limit=50`)).data;
const files = (await readdir(DIR)).filter((f) => f.endsWith(".json") && f !== "app.json").sort();
for (const file of files) {
  const locale = file.slice(0, -5);
  const t = JSON.parse(await readFile(join(DIR, file), "utf8"));
  const appAttrs = defined({ name: t.name, subtitle: t.subtitle, privacyPolicyUrl: t.privacyPolicyUrl });
  let il = infoLocs.find((/** @type {any} */ l) => l.attributes.locale === locale);
  if (il) {
    await asc("PATCH", `/appInfoLocalizations/${il.id}`, { data: { type: "appInfoLocalizations", id: il.id, attributes: appAttrs } });
  } else {
    il = (await asc("POST", "/appInfoLocalizations", {
      data: { type: "appInfoLocalizations", attributes: { locale, ...appAttrs }, relationships: { appInfo: { data: { type: "appInfos", id: info.id } } } },
    })).data;
    infoLocs = [...infoLocs, il];
  }

  const locs = (await asc("GET", `/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data;
  const attrs = defined({
    description: t.description,
    keywords: t.keywords,
    promotionalText: t.promotionalText,
    supportUrl: t.supportUrl,
    marketingUrl: t.marketingUrl,
    whatsNew: firstRelease ? undefined : t.whatsNew,
  });
  const vl = locs.find((/** @type {any} */ l) => l.attributes.locale === locale);
  if (vl) {
    await asc("PATCH", `/appStoreVersionLocalizations/${vl.id}`, { data: { type: "appStoreVersionLocalizations", id: vl.id, attributes: attrs } });
  } else {
    await asc("POST", "/appStoreVersionLocalizations", {
      data: { type: "appStoreVersionLocalizations", attributes: { locale, ...attrs }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: version.id } } } },
    });
  }
  console.log(`${locale}: listing text set`);
  summary += `- ${locale}: name, subtitle, description, keywords, promotional text, URLs\n`;
}

// Review details: contact from the reference app, demo account from secrets.
const refApp = await findApp(process.env.REF_BUNDLE_ID || "io.hibira.gaya");
const refVersions = (await asc("GET", `/apps/${refApp.id}/appStoreVersions?filter[platform]=IOS&limit=5`)).data;
let contact = null;
for (const v of refVersions) {
  const rd = (await asc("GET", `/appStoreVersions/${v.id}/appStoreReviewDetail`)).data;
  if (rd?.attributes?.contactEmail) {
    const a = rd.attributes;
    contact = { contactFirstName: a.contactFirstName, contactLastName: a.contactLastName, contactEmail: a.contactEmail, contactPhone: a.contactPhone };
    break;
  }
}
if (!contact) throw new Error(`No review contact found on ${refApp.attributes.name}`);
const { ASC_DEMO_USER, ASC_DEMO_PASSWORD } = process.env;
const review = {
  ...contact,
  notes: meta.reviewNotes,
  demoAccountRequired: Boolean(ASC_DEMO_USER),
  ...(ASC_DEMO_USER ? { demoAccountName: ASC_DEMO_USER, demoAccountPassword: ASC_DEMO_PASSWORD ?? "" } : {}),
};
const existing = (await asc("GET", `/appStoreVersions/${version.id}/appStoreReviewDetail`)).data;
if (existing) {
  await asc("PATCH", `/appStoreReviewDetails/${existing.id}`, { data: { type: "appStoreReviewDetails", id: existing.id, attributes: review } });
} else {
  await asc("POST", "/appStoreReviewDetails", {
    data: { type: "appStoreReviewDetails", attributes: review, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: version.id } } } },
  });
}
summary += `- review details: contact ${contact.contactFirstName} ${contact.contactLastName}, demo account ${ASC_DEMO_USER ? "set" : "NOT set (add ASC_DEMO_USER / ASC_DEMO_PASSWORD)"}\n`;

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### App Store listing for ${version.attributes.versionString}\n${summary}`);
}
