// The app's IDs, host and link paths live in several native files; these
// checks keep them in step with each other and with the association files
// pusher-server serves: hibira.io's (internal/billing/mobileapp.go) for the
// inbox and sign-in links, chat.hibira.io's (internal/livechat/mobile.go)
// for single sign-on and links sent before the inbox moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const config = JSON.parse(read("capacitor.config.json"));
const HOST = "chat.hibira.io";
const PAGES = "hibira.io";
const PREFIX = "/portal/live-chat";
const APP_ID = "io.hibira.chat";

test("one app ID everywhere", () => {
  assert.equal(config.appId, APP_ID);
  assert.match(read("ios/App/App.xcodeproj/project.pbxproj"), /PRODUCT_BUNDLE_IDENTIFIER = io\.hibira\.chat;/);
  assert.match(read("android/app/build.gradle"), /applicationId "io\.hibira\.chat"/);
});

test("the web view opens hibira.io's inbox", () => {
  const url = new URL(config.server.url);
  assert.equal(url.host, PAGES);
  assert.equal(url.pathname, `${PREFIX}/inbox`);
  // chat.hibira.io stays for single sign-on, which finishes there.
  assert.deepEqual(config.server.allowNavigation, [PAGES, HOST]);
  assert.ok(read("www/offline.html").includes(`https://${PAGES}${PREFIX}/inbox`));
  assert.equal(config.ios.appendUserAgent, "HibiraChatApp/ios");
  assert.equal(config.android.appendUserAgent, "HibiraChatApp/android");
});

test("sign-in and inbox links open the app", () => {
  const ent = read("ios/App/App/App.entitlements");
  for (const host of [PAGES, HOST]) {
    assert.ok(ent.includes(`<string>applinks:${host}</string>`), host);
    assert.ok(ent.includes(`<string>webcredentials:${host}</string>`), host);
  }
  assert.match(ent, /aps-environment/);
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:autoVerify="true"/);
  for (const data of [
    `android:host="${PAGES}" android:path="${PREFIX}/login/verify"`,
    `android:host="${PAGES}" android:pathPrefix="${PREFIX}/inbox"`,
    `android:host="${HOST}" android:path="/login/verify"`,
    `android:host="${HOST}" android:path="/sso/jwt"`,
    `android:host="${HOST}" android:pathPrefix="/inbox"`,
  ]) {
    assert.ok(manifest.includes(data), data);
  }
  // Billing and the console stay in the browser: nothing is sold in the app.
  const paths = [...manifest.matchAll(/android:path(?:Prefix)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.every((p) => !/\/console|\/billing/.test(p)), paths.join(" "));
  assert.ok(paths.filter((p) => p.startsWith("/portal")).every((p) => p.startsWith(`${PREFIX}/login/verify`) || p.startsWith(`${PREFIX}/inbox`)));
});

test("the plugins only open Live Chat's links, older inbox links on hibira.io", () => {
  const swift = read("plugins/hibira-chat-push/ios/Sources/HibiraChatPushPlugin/HibiraChatPushPlugin.swift");
  const java = read("plugins/hibira-chat-push/android/src/main/java/io/hibira/chat/push/HibiraChatPushPlugin.java");
  assert.match(swift, /static let host = "chat\.hibira\.io"/);
  assert.match(swift, /static let pagesHost = "hibira\.io"/);
  assert.match(swift, /static let pagesPrefix = "\/portal\/live-chat"/);
  assert.match(java, /HOST = "chat\.hibira\.io"/);
  assert.match(java, /PAGES_HOST = "hibira\.io"/);
  assert.match(java, /PAGES_PREFIX = "\/portal\/live-chat"/);
  // Both open only https links, and only through page().
  assert.match(swift, /guard url\.scheme == "https" else \{ return nil \}/);
  assert.match(swift, /guard let page = Self\.page\(url\)/);
  assert.match(java, /!"https"\.equals\(uri\.getScheme\(\)\)/);
  assert.match(java, /final Uri page = page\(uri\);/);
  for (const src of [swift, java]) {
    assert.ok(src.includes('"/login/verify"') && src.includes('"/inbox"') && src.includes('"/inbox/"'));
  }
});

test("provider sign-ins come back on the app's scheme", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.ok(manifest.includes('android:scheme="io.hibira.chat" android:host="auth"'));
  const swift = read("plugins/hibira-chat-push/ios/Sources/HibiraChatPushPlugin/HibiraChatAuthPlugin.swift");
  const java = read("plugins/hibira-chat-push/android/src/main/java/io/hibira/chat/push/HibiraChatAuthPlugin.java");
  assert.match(swift, /static let scheme = "io\.hibira\.chat"/);
  assert.match(java, /SCHEME = "io\.hibira\.chat"/);
  // Only the Live Chat host's /auth/ pages open in the browser.
  assert.match(swift, /url\.host == HibiraChatPushPlugin\.host, url\.path\.hasPrefix\("\/auth\/"\)/);
  assert.match(java, /startsWith\("\/auth\/"\)/);
});

test("the signed-in session stays out of Android backups", () => {
  // The web view's cookies are app data: a cloud or device-to-device backup
  // would carry the session to another device.
  assert.match(read("android/app/src/main/AndroidManifest.xml"), /android:allowBackup="false"/);
});
