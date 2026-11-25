// Sends the newest processed TestFlight build to App Review on the iOS
// version: a submission still waiting for review with an older build is
// withdrawn first (one in review is left alone), then the build goes on the
// version (renamed to the build's version string) and the version is
// submitted. Run after a release tag's build reached TestFlight.
import { asc, editableVersion, findApp } from "./asc-api.mjs";

const app = await findApp(process.env.BUNDLE_ID);
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

const builds = await asc("GET", `/builds?filter[app]=${app.id}&filter[processingState]=VALID&filter[expired]=false&sort=-uploadedDate&limit=5&include=preReleaseVersion`);
const build = builds.data[0];
if (!build) throw new Error("No processed TestFlight build yet");
const pre = builds.included?.find((/** @type {any} */ x) => x.type === "preReleaseVersions" && x.id === build.relationships.preReleaseVersion.data.id);
const name = pre?.attributes.version;

/** @param {string} state */
const submissions = async (state) =>
  (await asc("GET", `/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=${state}&include=items&limit=10`)).data;

if ((await submissions("IN_REVIEW,UNRESOLVED_ISSUES")).length) {
  throw new Error("A submission is in review or has unresolved issues; leave it to App Review first");
}

// Withdraw a waiting submission unless it already carries this build.
for (const s of await submissions("WAITING_FOR_REVIEW")) {
  const versions = (await asc("GET", `/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=WAITING_FOR_REVIEW&include=build&limit=5`));
  const current = versions.included?.find((/** @type {any} */ x) => x.type === "builds");
  if (current?.id === build.id) {
    console.log(`Build ${build.attributes.version} is already waiting for review`);
    process.exit(0);
  }
  await asc("PATCH", `/reviewSubmissions/${s.id}`, { data: { type: "reviewSubmissions", id: s.id, attributes: { canceled: true } } });
  console.log(`Withdrew submission ${s.id} (build ${current?.attributes.version ?? "?"})`);
}

// The version becomes editable again once the withdrawal goes through.
let version;
for (let i = 0; i < 30 && !(version = await editableVersion(app, false)); i++) await sleep(10_000);
if (!version) throw new Error("No iOS version is editable; run the metadata step first");

if (name && version.attributes.versionString !== name) {
  await asc("PATCH", `/appStoreVersions/${version.id}`, { data: { type: "appStoreVersions", id: version.id, attributes: { versionString: name } } });
  console.log(`Version ${version.attributes.versionString} renamed to ${name}`);
}
await asc("PATCH", `/appStoreVersions/${version.id}/relationships/build`, { data: { type: "builds", id: build.id } });

// An unsent draft submission is reused; otherwise a new one is made.
let sub = (await submissions("READY_FOR_REVIEW"))[0];
sub ??= (await asc("POST", "/reviewSubmissions", {
  data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: app.id } } } },
})).data;
const items = (await asc("GET", `/reviewSubmissions/${sub.id}/items?limit=20`)).data;
if (!items.length) {
  await asc("POST", "/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: { reviewSubmission: { data: { type: "reviewSubmissions", id: sub.id } }, appStoreVersion: { data: { type: "appStoreVersions", id: version.id } } },
    },
  });
}
await asc("PATCH", `/reviewSubmissions/${sub.id}`, { data: { type: "reviewSubmissions", id: sub.id, attributes: { submitted: true } } });

const line = `Version ${name} (build ${build.attributes.version}) submitted for App Review`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${line}\n`);
}
