# Maple & Main Bakery

A warm, single-page website for **Maple & Main Bakery** — a fictional independent bakery & café at **104 Maple Ave, Canmore, AB**, owned by Sarah.

This repository is the **live client codebase and target GitHub repository (`larymc/maple-main-bakery`)** for the Meta Global AI Developer Hackathon 2026 demo of **Relais — Human-Supervised AI Software Engineering via WhatsApp** (by Gaismas Inc.). Sarah reports this site's issues to her developer over WhatsApp; Relais turns the conversation into approved GitHub issues in this repo.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:8080 — or just open `index.html` in a browser (zero build step; Tailwind + fonts load from CDN).

## Demo notes (intentional — please don't "fix" silently)

This site deliberately exhibits the two issues featured in the Relais demo video:

1. **Booking form infinite spinner (bug):** Submitting **Book a Table / Pre-Order** puts the button into a `Submitting booking...` loading state that **never resolves** — no confirmation ever appears, and the console shows `Cannot read properties of undefined (reading 'confirmationEmail') at submitBooking (booking.js:42)`. Use the **📱 iPhone Preview** toggle (top-right, 390×844 frame) to capture a realistic mobile screenshot of the stuck button.
2. **No automated confirmation (feature gap):** Bookings only reach the store sheet. There is **no automated Email/SMS confirmation** with booking date, time, and reference number yet — noted under the form and in a `TODO(relais-demo)` comment.

In the Relais demo, Sarah reports #1 as a bug and requests #2 as a feature via WhatsApp, approves the AI-drafted tickets, and Relais files them as GitHub issues against this repository. Fixes should land here as normal, human-reviewed changes.

## Stack

Standalone HTML + Tailwind (CDN) + vanilla JS · Playfair Display / Plus Jakarta Sans · Unsplash photography · No build step.

## Two-gate workflow: Relais → label-gated Meta Muse PRs

This repo demonstrates a complete human-in-the-loop loop for the hackathon:

1. **Gate 1 — Customer approval (Relais):** Sarah describes a problem in WhatsApp. Relais clarifies, drafts a structured GitHub Issue here with status `Awaiting Developer Review`, and files it **only after Sarah approves**. No code runs automatically.
2. **Gate 2 — Developer authorization (GitHub):** A human developer reviews the issue and adds the label **`agent-fix`**. Only then does [`.github/workflows/muse-agent-fix.yml`](.github/workflows/muse-agent-fix.yml) wake up: it runs [`.github/scripts/muse-fix.mjs`](.github/scripts/muse-fix.mjs), which asks Meta Muse (`muse-spark-1.3`) to patch the site, pushes branch `muse/fix-issue-<number>`, opens a PR (`Closes #<number>`) with a human-review checklist, and comments on the issue linking the PR. **Merging is always a human decision.**

Local fallback (same script, e.g. if Actions is queued during a live recording):

```bash
GITHUB_TOKEN=<token> MODEL_API_KEY=<key> REPO=larymc/maple-main-bakery npm run muse:fix -- <issue-number>
```

### One-time GitHub repo settings (required)

1. **Add the model secret:** Settings → Secrets and variables → Actions → **New repository secret** → name `MODEL_API_KEY`, value = your Meta Model API key.
2. **Let Actions open PRs:** Settings → Actions → General → Workflow permissions → enable **Allow GitHub Actions to create and approve pull requests** (with Read and write permissions).
