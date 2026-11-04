#!/usr/bin/env node
/**
 * Meta Muse Code Agent — label-gated PR generator (Gate 2 of Relais).
 *
 * Runs in GitHub Actions when a human adds the `agent-fix` label, or locally:
 *   GITHUB_TOKEN=... MODEL_API_KEY=... npm run muse:fix -- <issue-number>
 * Zero dependencies: native fetch + node:child_process (Node 22).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const {
  GITHUB_TOKEN,
  MODEL_API_KEY,
  MODEL_NAME = "muse-spark-1.3",
  MODEL_BASE_URL = "https://api.meta.ai/v1",
  REPO,
} = process.env;

let ISSUE_NUMBER = process.env.ISSUE_NUMBER || process.argv[2] || "";
let ISSUE_TITLE = process.env.ISSUE_TITLE || "";
let ISSUE_BODY = process.env.ISSUE_BODY || "";

const REPO_NAME = REPO || guessRepo();
function guessRepo() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    return m ? m[1] : "";
  } catch { return ""; }
}
function fail(msg) { console.error(`::error::${msg}`); process.exit(1); }
function git(...args) { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }); }

async function gh(method, urlPath, body) {
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "Relais-Muse-Agent",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${urlPath} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function collectSources() {
  const files = [];
  const add = (rel) => { if (fs.existsSync(rel)) files.push({ path: rel, content: fs.readFileSync(rel, "utf8") }); };
  add("index.html");
  if (fs.existsSync("src")) {
    for (const entry of fs.readdirSync("src", { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) {
        const rel = path.join(entry.parentPath, entry.name);
        if (/\.(html|css|js|mjs|ts|vue)$/.test(rel) && fs.statSync(rel).size < 200_000) add(rel);
      }
    }
  }
  return files;
}

async function main() {
  if (!GITHUB_TOKEN) fail("GITHUB_TOKEN is required (Actions secret or local env).");
  if (!MODEL_API_KEY) fail("MODEL_API_KEY is required (add it under Settings → Secrets → Actions).");
  if (!REPO_NAME) fail("REPO is required (owner/name), e.g. larymc/maple-main-bakery.");
  if (!ISSUE_NUMBER) fail("ISSUE_NUMBER is required (workflow env or `npm run muse:fix -- <number>`).");
  ISSUE_NUMBER = String(ISSUE_NUMBER).replace(/^#/, "");

  // Local fallback: fetch the issue when title/body weren't passed via env.
  if (!ISSUE_TITLE) {
    const issue = await gh("GET", `/repos/${REPO_NAME}/issues/${ISSUE_NUMBER}`);
    ISSUE_TITLE = issue.title || "";
    ISSUE_BODY = issue.body || "";
  }

  await gh("POST", `/repos/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`, {
    body: `🤖 **Meta Muse Code Agent** authorized via \`agent-fix\` label. Analyzing issue #${ISSUE_NUMBER} and drafting a pull request for human review...`,
  });
  console.log(`Muse agent authorized for issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);

  const sources = collectSources();
  if (!sources.length) fail("No source files found (expected index.html or src/).");
  const fileBlocks = sources.map((f) => `--- FILE: ${f.path} ---\n${f.content}`).join("\n\n");

  const system =
    "You are Meta Muse, an expert software engineer working on the Maple & Main Bakery static site (single index.html, Tailwind CDN, vanilla JS). " +
    'Return ONLY a JSON object: { "summary": "string explaining root cause and fix", "files": [{ "path": "relative/path", "content": "complete updated file content" }] }. ' +
    "Return COMPLETE file contents, not diffs. Change only what the issue requires. Keep the site's design, copy, and unrelated behavior intact. Never include secrets.";
  const user =
    `GitHub Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}\n\n${ISSUE_BODY || "(no body)"}\n\nCurrent source files:\n\n${fileBlocks}\n\nFix this exact issue. ` +
    (String(ISSUE_TITLE + ISSUE_BODY).toLowerCase().includes("confirmation")
      ? "If this asks for a booking confirmation, show an on-page confirmation preview with booking date, time, and a reference number after submit (demo-safe; no real email/SMS sending)."
      : "If this is the spinning-button bug, make submit resolve: show a success/confirmation state, re-enable the button, and remove the undefined-property crash.");

  const res = await fetch(`${MODEL_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_NAME,
      temperature: 0.1,
      max_tokens: 16000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) fail(`Meta Model API failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = String(data.choices?.[0]?.message?.content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let plan;
  try { plan = JSON.parse(raw); } catch { fail("Meta Muse did not return valid JSON."); }
  if (!plan?.files?.length) fail("Meta Muse returned no file changes; leaving the issue untouched.");

  const root = process.cwd();
  for (const file of plan.files) {
    const dest = path.resolve(root, file.path);
    if (!dest.startsWith(root + path.sep)) fail(`Refusing path outside repo: ${file.path}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    console.log(`Wrote ${file.path} (${file.content.length} bytes)`);
  }

  const branch = `muse/fix-issue-${ISSUE_NUMBER}`;
  git("config", "user.name", "Meta Muse Agent");
  git("config", "user.email", "muse-agent@gaismas.dev");
  git("checkout", "-B", branch);
  git("add", "-A");
  if (!git("status", "--porcelain").trim()) fail("Model produced no effective changes; nothing to commit.");
  git("commit", "-m", `fix: resolve issue #${ISSUE_NUMBER} — ${ISSUE_TITLE}`);
  git("push", "--force", "-u", "origin", branch);
  console.log(`Pushed branch ${branch}`);

  const prTitle = `fix: ${ISSUE_TITLE} (Issue #${ISSUE_NUMBER})`;
  const prBody =
    `## Summary (Meta Muse)\n${plan.summary || "See commits."}\n\nCloses #${ISSUE_NUMBER}\n\n` +
    `## Human review checklist (Gate 2)\n- [ ] Diff matches the issue — no unrelated changes\n- [ ] Booking flow tested locally (\`npm run dev\`)\n- [ ] No secrets or console errors introduced\n- [ ] Approve & merge only when satisfied — merging is a human decision\n\n_Generated by the label-gated Meta Muse Agent after a human added the \`agent-fix\` label. Relais created the issue; this PR was drafted only after developer authorization._`;

  const owner = REPO_NAME.split("/")[0];
  const existingPrs = await gh("GET", `/repos/${REPO_NAME}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
  const pr = Array.isArray(existingPrs) && existingPrs.length > 0
    ? await gh("PATCH", `/repos/${REPO_NAME}/pulls/${existingPrs[0].number}`, { title: prTitle, body: prBody })
    : await gh("POST", `/repos/${REPO_NAME}/pulls`, { title: prTitle, head: branch, base: "main", body: prBody });

  await gh("POST", `/repos/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`, {
    body: `🤖 **Meta Muse Code Agent** drafted a fix for human review: ${pr.html_url}\n\nPlease review the pull request — nothing merges without human approval.`,
  });
  console.log(`Done. PR: ${pr.html_url}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
