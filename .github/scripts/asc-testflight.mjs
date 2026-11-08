// Makes sure the app has an internal TestFlight group ("Team") that gets
// every build, with every App Store Connect user of the team in it, so a
// new build reaches their TestFlight app without anyone clicking.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, BUNDLE_ID.
import { asc, findApp } from "./asc-api.mjs";

const app = await findApp(process.env.BUNDLE_ID || "io.hibira.chat");
const groups = (await asc("GET", `/apps/${app.id}/betaGroups?limit=50`)).data;
let group = groups.find((/** @type {any} */ g) => g.attributes.isInternalGroup);
if (!group) {
  group = (await asc("POST", "/betaGroups", {
    data: {
      type: "betaGroups",
      attributes: { name: "Team", isInternalGroup: true, hasAccessToAllBuilds: true },
      relationships: { app: { data: { type: "apps", id: app.id } } },
    },
  })).data;
  console.log(`Internal group "Team" created`);
}
const users = (await asc("GET", "/users?limit=50")).data;
const inGroup = new Set((await asc("GET", `/betaGroups/${group.id}/betaTesters?limit=200`)).data.map((/** @type {any} */ t) => t.attributes.email?.toLowerCase()));
let added = 0;
for (const u of users) {
  const email = u.attributes.username?.toLowerCase();
  if (!email || inGroup.has(email)) continue;
  await asc("POST", "/betaTesters", {
    data: {
      type: "betaTesters",
      attributes: { email, firstName: u.attributes.firstName, lastName: u.attributes.lastName },
      relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } },
    },
  });
  added++;
}
console.log(`Group "${group.attributes.name}": ${users.length} team users, ${added} added`);
