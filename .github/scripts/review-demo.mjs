// Gives the App Review account (ASC_DEMO_USER / ASC_DEMO_PASSWORD, the
// console's review sign-in) a few sample chats, so a store reviewer opens a
// lived-in inbox: one rated 5, one rated 2 after an unhelpful reply, and one
// visitor still waiting for an answer. Safe to run again: it adds only what
// is missing.
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

await call("/api/v1/login/code", { email: ASC_DEMO_USER, code: ASC_DEMO_PASSWORD }, { origin: BASE });
const me = await call("/api/v1/me");
const ws = me.workspace.id;
// Each sample chat is added only when the inbox lacks one like it, so a
// run that stopped halfway can simply run again.
const existing = [];
for (const filter of ["open", "closed"]) existing.push(...((await call(`/api/v1/conversations?filter=${filter}`)).conversations ?? []));
const has = (/** @type {(c: any) => boolean} */ f) => existing.some(f);

await call("/api/v1/workspace", { name: "Sakura Tea", origins: [SITE] });
const known = new Set(((await call("/api/v1/knowledge")).items ?? []).map((/** @type {any} */ k) => k.title));
// The review workspace is on the Free plan, whose knowledge base may be
// full or absent: the sample chats matter more, so a full base is fine.
for (const entry of [
  { kind: "qa", title: "How long does shipping take?", body: "We ship within 1 business day. Delivery takes 2–4 days in Japan and Taiwan, and 4–7 days elsewhere in Asia." },
  { kind: "qa", title: "Can I return tea I have opened?", body: "Unopened tea can be returned within 14 days. If a pack arrived damaged, send us a photo and we'll replace it." },
]) {
  if (known.has(entry.title)) continue;
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

if (!has((c) => c.rating?.score >= 4)) {
  const emma = await start("Emma Lee", "emma@example.com", "/products/sencha", "Where is my order #1042?");
  await call(`/api/v1/conversations/${emma.conversation_id}`, { assignee_id: agent });
  await call(`/api/v1/conversations/${emma.conversation_id}/messages`, { text: "Hi Emma! Order #1042 left our warehouse this morning and should reach you on Thursday." });
  await call("/widget/v1/messages", { ...emma, text: "Perfect, thank you!" }, visitor);
  await call("/widget/v1/rate", { ...emma, score: 5, comment: "So quick, thank you!" }, visitor);
}

if (!has((c) => c.rating && c.rating.score <= 2)) {
  const olivia = await start("Olivia Tan", "olivia@example.com", "/account/orders", "Do I have to pay customs fees for Singapore?");
  await call(`/api/v1/conversations/${olivia.conversation_id}/messages`, { text: "Customs rules depend on your country, so please check with your local customs office." });
  await call("/widget/v1/rate", { ...olivia, score: 2, comment: "I still don't know about customs fees." }, visitor);
}

if (!has((c) => c.status === "open" && !c.rating && c.waiting_since)) {
  await start("Noah Park", "noah@example.com", "/products/hojicha", "Can I change the address on order #1038?");
}
console.log(`Workspace ${ws}: sample chats are in place`);
