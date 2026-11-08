// Gives the App Review account (ASC_DEMO_USER / ASC_DEMO_PASSWORD, the
// console's review sign-in) a few sample chats, so a store reviewer opens a
// lived-in inbox: one rated 5, one rated 2 with an unhelpful automatic reply,
// and one visitor still waiting for an answer. Does nothing when the
// workspace already has chats.
//
// Env: ASC_DEMO_USER, ASC_DEMO_PASSWORD, LIVECHAT_URL (https://chat.hibira.io).
const BASE = (process.env.LIVECHAT_URL || "https://chat.hibira.io").replace(/\/$/, "");
const SITE = "https://shop.example.com";
const { ASC_DEMO_USER, ASC_DEMO_PASSWORD } = process.env;
if (!ASC_DEMO_USER || !ASC_DEMO_PASSWORD) {
  console.log("::warning::ASC_DEMO_USER / ASC_DEMO_PASSWORD are not set; no demo chats");
  process.exit(0);
}

let cookie = "";
/** @param {string} path @param {any} [body] @param {Record<string,string>} [headers] */
async function call(path, body, headers = { origin: BASE, cookie }) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text.slice(0, 200)}`);
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return text ? JSON.parse(text) : {};
}
const visitor = { origin: SITE };
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

await call("/api/v1/login/code", { email: ASC_DEMO_USER, code: ASC_DEMO_PASSWORD }, { origin: BASE });
const me = await call("/api/v1/me");
const ws = me.workspace.id;
const list = await call("/api/v1/conversations?limit=5");
if ((list.conversations ?? list.items ?? []).length) {
  console.log(`Workspace ${me.workspace.name} already has chats; left as is`);
  process.exit(0);
}

await call("/api/v1/workspace", { name: "Sakura Tea", origins: [SITE] });
// The review workspace is on the Free plan, whose knowledge base may be
// full or absent: the sample chats matter more, so a full base is fine.
for (const entry of [
  { kind: "qa", title: "How long does shipping take?", body: "We ship within 1 business day. Delivery takes 2–4 days in Japan and Taiwan, and 4–7 days elsewhere in Asia." },
  { kind: "qa", title: "Can I return tea I have opened?", body: "Unopened tea can be returned within 14 days. If a pack arrived damaged, send us a photo and we'll replace it." },
]) {
  await call("/api/v1/knowledge", entry).catch((e) => {
    if (!String(e.message).includes(" 402 ")) throw e;
    console.log("Knowledge base is full on this plan; skipped an entry");
  });
}

/** @param {string} name @param {string} email @param {string} page @param {string} text */
async function start(name, email, page, text) {
  const out = await call("/widget/v1/start", { workspace_id: ws, visitor: { name, email, page: SITE + page, locale: "en-US" }, text }, visitor);
  return { workspace_id: ws, visitor_id: out.visitor_id, visitor_token: out.visitor_token, conversation_id: out.conversation.id };
}
const agent = me.agent.id;

const emma = await start("Emma Lee", "emma@example.com", "/products/sencha", "Where is my order #1042?");
await call(`/api/v1/conversations/${emma.conversation_id}`, { assignee_id: agent });
await call(`/api/v1/conversations/${emma.conversation_id}/messages`, { text: "Hi Emma! Order #1042 left our warehouse this morning and should reach you on Thursday." });
await call("/widget/v1/messages", { ...emma, text: "Perfect, thank you!" }, visitor);
await call("/widget/v1/rate", { ...emma, score: 5, comment: "So quick, thank you!" }, visitor);

const liam = await start("Liam Chen", "liam@example.com", "/account/orders", "Do I have to pay customs fees for Singapore?");
await sleep(4000);
await call("/widget/v1/rate", { ...liam, score: 2, comment: "I still don't know about customs fees." }, visitor);

await start("Noah Park", "noah@example.com", "/products/hojicha", "Can I change the address on order #1038?");
console.log(`Workspace ${ws}: 3 sample chats added`);
