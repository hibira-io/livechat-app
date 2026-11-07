// The app's IDs, host and link paths live in several native files; these
// checks keep them in step with each other and with chat.hibira.io
// (pusher-server internal/livechat/mobile.go serves the association files).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const config = JSON.parse(read("capacitor.config.json"));
const HOST = "chat.hibira.io";
const APP_ID = "io.hibira.chat";

test("one app ID everywhere", () => {
  assert.equal(config.appId, APP_ID);
  assert.match(read("ios/App/App.xcodeproj/project.pbxproj"), /PRODUCT_BUNDLE_IDENTIFIER = io\.hibira\.chat;/);
  assert.match(read("android/app/build.gradle"), /applicationId "io\.hibira\.chat"/);
});

test("release builds sign for the App Store, no registered iPhone needed", () => {
  const release = read("ios/App/App.xcodeproj/project.pbxproj").split("/* Release */ = {")[2] ?? "";
  assert.match(release, /"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]" = "Apple Distribution";/);
});

test("the web view stays on the Live Chat host", () => {
  const url = new URL(config.server.url);
  assert.equal(url.host, HOST);
  assert.equal(url.pathname, "/inbox");
  assert.deepEqual(config.server.allowNavigation, [HOST]);
  assert.equal(config.ios.appendUserAgent, "HibiraChatApp/ios");
  assert.equal(config.android.appendUserAgent, "HibiraChatApp/android");
});

test("sign-in and inbox links open the app", () => {
  const ent = read("ios/App/App/App.entitlements");
  assert.match(ent, new RegExp(`applinks:${HOST.replace(".", "\\.")}`));
  assert.match(ent, /aps-environment/);
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:autoVerify="true"/);
  for (const path of ['android:path="/login/verify"', 'android:path="/sso/jwt"', 'android:pathPrefix="/inbox"']) {
    assert.ok(manifest.includes(path), path);
  }
  // Billing and the console stay in the browser: nothing is sold in the app.
  assert.ok(!/\/portal|\/console|\/billing/.test(manifest));
});

test("the plugins only open links on the Live Chat host", () => {
  const swift = read("plugins/hibira-chat-push/ios/Sources/HibiraChatPushPlugin/HibiraChatPushPlugin.swift");
  const java = read("plugins/hibira-chat-push/android/src/main/java/io/hibira/chat/push/HibiraChatPushPlugin.java");
  assert.match(swift, /static let host = "chat\.hibira\.io"/);
  assert.match(java, /HOST = "chat\.hibira\.io"/);
  assert.match(swift, /url\.scheme == "https", url\.host == Self\.host/);
});
