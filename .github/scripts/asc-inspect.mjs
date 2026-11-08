// Prints the shape of a reference app's age rating and review details
// (types only; no phone numbers or passwords) so asc-metadata can match it.
import { asc, editableInfo, findApp } from "./asc-api.mjs";

for (const bundle of [process.env.REF_BUNDLE_ID || "io.hibira.gaya", process.env.BUNDLE_ID || "io.hibira.chat"]) {
  const app = await findApp(bundle);
  console.log(`== ${bundle} ${app.attributes.name} primaryLocale=${app.attributes.primaryLocale} contentRights=${app.attributes.contentRightsDeclaration}`);
  const info = await editableInfo(app);
  const age = await asc("GET", `/appInfos/${info.id}/ageRatingDeclaration`);
  console.log("age:", JSON.stringify(age.data.attributes));
  const cats = await asc("GET", `/appInfos/${info.id}?include=primaryCategory,secondaryCategory`);
  console.log("categories:", JSON.stringify(cats.data.relationships?.primaryCategory?.data), JSON.stringify(cats.data.relationships?.secondaryCategory?.data));
  const versions = (await asc("GET", `/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=3`)).data;
  for (const v of versions) {
    console.log(`version ${v.attributes.versionString} ${v.attributes.appStoreState} copyright=${v.attributes.copyright} releaseType=${v.attributes.releaseType}`);
    const rd = await asc("GET", `/appStoreVersions/${v.id}/appStoreReviewDetail`).catch((e) => ({ error: String(e).slice(0, 120) }));
    if (rd?.data) {
      const a = rd.data.attributes;
      console.log("review:", JSON.stringify({ contactFirstName: a.contactFirstName, contactLastName: a.contactLastName, contactEmail: a.contactEmail, hasPhone: !!a.contactPhone, demoAccountRequired: a.demoAccountRequired, demoAccountName: a.demoAccountName, notesLength: a.notes?.length }));
    } else console.log("review:", JSON.stringify(rd));
    break;
  }
}
