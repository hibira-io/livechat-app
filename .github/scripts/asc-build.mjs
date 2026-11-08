// Puts the newest processed TestFlight build on the iOS version being
// prepared, renaming that version to the build's version string (App Store
// Connect only accepts a build whose version matches). After this the
// version is ready for "Add for Review" in App Store Connect.
import { asc, editableVersion, findApp } from "./asc-api.mjs";

const app = await findApp(process.env.BUNDLE_ID);
const version = await editableVersion(app, false);
if (!version) throw new Error("No iOS version is being prepared; run the metadata step first");
const builds = (await asc("GET", `/builds?filter[app]=${app.id}&filter[processingState]=VALID&filter[expired]=false&sort=-uploadedDate&limit=5&include=preReleaseVersion`));
const build = builds.data[0];
if (!build) throw new Error("No processed TestFlight build yet");
const pre = builds.included?.find((/** @type {any} */ x) => x.type === "preReleaseVersions" && x.id === build.relationships.preReleaseVersion.data.id);
const name = pre?.attributes.version;
if (name && version.attributes.versionString !== name) {
  await asc("PATCH", `/appStoreVersions/${version.id}`, { data: { type: "appStoreVersions", id: version.id, attributes: { versionString: name } } });
  console.log(`Version ${version.attributes.versionString} renamed to ${name}`);
}
await asc("PATCH", `/appStoreVersions/${version.id}/relationships/build`, { data: { type: "builds", id: build.id } });
const line = `Build ${build.attributes.version} (${name}) is on version ${name}; ready for Add for Review`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${line}\n`);
}
