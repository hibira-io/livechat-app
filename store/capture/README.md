# Store screenshots

`../ios/screenshots/<App Store locale>/*.jpg` are 1320×2868 (6.9" iPhone) shots of the real inbox, as the app
shows it, with a brand frame and a headline per language. The `app-store-screenshots` workflow uploads them.

To take them again (Linux or macOS, Go, Node with Playwright, Python 3, Noto Sans CJK and Thai fonts):

1. In a pusher-server checkout: `git apply <this folder>/demo.patch` (a scripted AI and sign-in links in the log;
   local only, never commit it), `cd web && npm ci && npm run livechat:bundle && cd ..`,
   `go build -o <this folder>/lcdemo ./cmd/pusher`, then `git checkout -- internal/server/livechat.go`.
2. Here: `./all.sh en ja ko zh-TW zh-CN th vi` starts a fresh local Live Chat per language, seeds the
   "Sakura Tea" demo shop (`rec/texts.json`), four earlier visitors (rated 5, 4 and 2, one AI answer
   thumbed down) and the featured chat (rated 5), and saves `raw/<lang>/{1-list,2-chat,3-low,4-login}.png`.
3. `node compose.cjs ../ios/screenshots en ja ko zh-TW zh-CN th vi` adds the frame and the headlines from
   `heads.json`.
