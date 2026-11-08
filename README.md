# Hibira Chat (agent app)

Hibira Live Chat's app for the agents who answer chats: iPhone and Android. It opens
[chat.hibira.io/inbox](https://chat.hibira.io/inbox) in a native shell ([Capacitor](https://capacitorjs.com) 8).
The site does the work. The app adds what a phone needs: notifications, and sign-in links that open in the app.

| | |
| --- | --- |
| App ID | `io.hibira.chat` (iOS bundle ID and Android package) |
| Opens | `https://chat.hibira.io/inbox`, user agent ends in `HibiraChatApp/ios` or `HibiraChatApp/android` |
| Sign-in | The emailed link (`/login/verify#token=…`) or the company's single sign-on (`/sso/jwt?…`). Both open in the app as Universal Links / App Links, so the session cookie lands in the app's web view. No Sign in with Apple needed: there is no third-party login. |
| Notifications | [Hibira Push](https://hibira.io): [hibira-push-ios](https://github.com/hibira-io/hibira-push-ios) (APNs) and [hibira-push-android](https://github.com/hibira-io/hibira-push-android) (FCM). New chats, chats assigned to you, and visitor replies to your chats. A tap opens the conversation. |
| Sold in the app | Nothing. Plans are bought on the website; the inbox hides billing links in the app. |
| Server side | pusher-server `internal/livechat/mobile.go`: `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, `POST /api/v1/push/token`, `POST /api/v1/push/off` |

## How it fits together

```
inbox page (chat.hibira.io)                         this app
  signed in → POST /api/v1/push/token ──────────▶  HibiraChatPush.register({instance_id, endpoint, user_id, token})
                                                     → Hibira Push SDK registers the phone as that agent
  sign out → HibiraChatPush.signOut() + POST /api/v1/push/off
pusher-server: new chat / assigned / reply ──────▶  notice with data.url = /inbox/<id>?workspace=<ws>  → tap opens it
email or SSO link on the phone ──────────────────▶  app opens, web view loads the link
```

`plugins/hibira-chat-push` is the only native code: `ios/Sources/…/HibiraChatPushPlugin.swift` and
`android/src/main/java/io/hibira/chat/push/`. The page finds it at `window.Capacitor.Plugins.HibiraChatPush`;
in a browser it is absent, so the page's calls do nothing.

## One-time setup

1. **Apple** (same account as Gaya, Team ID `6XM26CXAA2`). In Apple Developer → Identifiers, add an App ID
   `io.hibira.chat` with **Associated Domains** and **Push Notifications**. In App Store Connect, add a new app
   with that bundle ID, named "Hibira Chat".
2. **APNs key.** Use Apple Developer → Keys → a key with Apple Push Notifications service; one key works for all
   of the team's apps, including Gaya's. Upload the `.p8` in the hibira.io console: search for the app
   `livechat-mobile`, then open Push notifications and use bundle ID `io.hibira.chat`. The app is created the first
   time an agent signs in to the app.
3. **Firebase** (Android notifications). Make a Firebase project and add an Android app `io.hibira.chat`. Then:
   - Save `google-services.json` as the secret `GOOGLE_SERVICES_JSON`.
   - Upload a service account key (Project settings → Service accounts) on the same `livechat-mobile` push page.
4. **Play Console.** Create the app `io.hibira.chat`. The very first bundle must be uploaded by hand.
5. **Secrets and variables** (Settings → Secrets and variables → Actions; org-level ones work too):
   - iPhone: variable `APPLE_TEAM_ID` (already an org variable). Secrets `ASC_KEY_ID`, `ASC_ISSUER_ID` and
     `ASC_KEY_P8` hold an App Store Connect API team key with the Admin role, the same key Gaya uses.
   - Android: `ANDROID_UPLOAD_KEYSTORE` (base64 of an upload `.jks`), `ANDROID_UPLOAD_PASSWORD` (the store and key
     password), `GOOGLE_SERVICES_JSON`. `PLAY_SERVICE_ACCOUNT_JSON` is optional and uploads to internal testing.
     To make the upload key:
     `keytool -genkeypair -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Hibira Chat, O=Hibira, C=TW"`,
     then `base64 -i upload.jks | gh secret set ANDROID_UPLOAD_KEYSTORE -R hibira-io/livechat-app`.
6. **Live Chat console → Mobile app** (chat.hibira.io/console). Add the SHA-256 of Play's app signing key
   (Play Console → Test and release → App integrity) and of the upload key (shown in each release run's
   summary). Android only opens links in the app once these match. The iOS app ID defaults to
   `6XM26CXAA2.io.hibira.chat`.

## Releasing

Push a tag: `v1.2.3` builds version `1.2.3`, build number `1002003`. Each tag can go to a store once.

- **iPhone:** Xcode signs in the cloud with the API key, archives, and uploads to TestFlight. Submit for review
  in App Store Connect. Review notes:
  - Sign-in is by email link or the customer's company single sign-on.
  - Nothing is sold in the app (guideline 3.1.3(b)).
  - Give the reviewer a demo workspace sign-in.
- **Android:** builds and signs the `.aab` and keeps it as the run's artifact. With `PLAY_SERVICE_ACCOUNT_JSON`
  it also uploads to internal testing. An individual Play account needs a closed test with 12 testers for
  14 days before production.

App Store screenshots live in `store/ios/screenshots/<locale>/` (7 languages, real inbox shots; how to retake them is in
`store/capture/README.md`). Actions → **app-store-screenshots** → Run workflow uploads them to the version being prepared.

Pull requests build both apps without signing (`ci.yml`), and `npm test` checks that the IDs, host and link paths
agree across the native files.

## Working on it

```sh
npm ci
npx cap sync          # after changing capacitor.config.json or the plugin
npx cap open ios      # Xcode, on a Mac
npx cap open android  # Android Studio
```

The inbox's look and features live in pusher-server and reach both apps without a new release. A release is
needed only for native changes: the plugin, icons, permissions, or the app ID.

Icons and splash screens are drawn from the Hibira ripple mark on brand red (`www/icon.png`).

## 中文摘要

Hibira Live Chat 的商户客服 App，iPhone 和 Android 都用 Capacitor 打开 chat.hibira.io/inbox。

- 登录：邮件登录链接和客户的 SSO 链接会直接在 App 里打开，不需要 Sign in with Apple。
- 推送：通过我们自己的 Hibira Push，包括新对话、分配给你的对话和访客回复。点开通知直接进入该对话。
- 购买：App 里不卖任何东西。

第一次需要做的事：
1. 在 Apple 建 App ID `io.hibira.chat`（打开 Associated Domains 和 Push），并在 App Store Connect 建 App。
2. 把 APNs 金钥上传到 hibira.io 后台 `livechat-mobile` 的推送设置。
3. 建 Firebase 项目，`google-services.json` 存成 Secret，服务帐号金钥传到同一个推送设置。
4. 建 Play App，第一个包手动上传。
5. 设置 GitHub Secrets。`APPLE_TEAM_ID` 已是 org 变量，ASC 金钥与 Gaya 共用。
6. 在 Live Chat 后台填 Android 签名指纹。

发版：推送 tag `v1.2.3` 就会自动出两个包，iPhone 送到 TestFlight，Android 产出 .aab（可选自动上传内部测试）。
