# Gemini AI OCR for Smart Note Collector (GitHub Pages UI + Cloudflare Worker)

**Engineering demonstration only.** Preserves the preferred blue-and-white HTML and replaces browser-local Tesseract OCR with Gemini image understanding. It **does not deploy automatically**, verify anyone's personal Google account/API key or supply an approved data-collection backend.

## Important: rotate the API key you sent in chat

Because the key was pasted into a conversation, consider it exposed. Revoke/delete it in Google AI Studio / Google Cloud's API key management and create a fresh key. **Never commit a key to GitHub or place it in `index.html`, `ocr_config.js`, `wrangler.toml`, screenshots or logs.** Neither the supplied key nor any working key is stored in this ZIP.

## System diagram

```
Mobile GitHub Pages (index.html)
  → HTTPS screenshot/image payload, after checkbox
  → Cloudflare Worker POST /ocr (GEMINI_API_KEY as secret)
  → Google Gemini API (gemini-2.5-flash; generateContent)
  → structured and sanitized fields
  → HTML review/edit dialog
```

**Privacy change versus local OCR:** Google Gemini receives the image itself. The Worker doesn't persist the image, but Google processes it subject to its API terms/policies. Do **not** upload genuine participant screenshots until the necessary ethics, consent, third-party transfer and data-handling approvals are documented. Name and ID masking cannot be guaranteed by an AI prompt alone. GitHub Pages alone does not store records. Stage B consent, labels, withdrawals and secure researcher backend are still unfinished.

## Deployment — Cloudflare Worker first

1. Create a Cloudflare account. Install Node.js if needed.
2. Open a terminal in this ZIP's `worker/` directory.
3. Check `wrangler.toml`: update `ALLOWED_ORIGIN` to your exact frontend **origin**, e.g. `https://shanne11.github.io` (no repository path). If using a custom Pages domain, set that domain instead.
4. Run:

   ```bash
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GEMINI_API_KEY
   ```

   Enter the **NEW, rotated** key at the interactive prompt; no terminal file or GitHub commit should contain it. Cloudflare's `secret put` may create a new Worker deployment. Save the resulting `https://<worker>.<account>.workers.dev` URL.

5. If your Workspace requires Cloudflare Worker deployments through the dashboard, create a Worker with `worker/index.mjs` code and set `GEMINI_API_KEY` as **Secret** under **Settings → Variables and Secrets**. Add `ALLOWED_ORIGIN` as a normal variable.
6. The Worker is only an OCR proxy. An allowed Origin header is **not** real authentication. A public Worker needs additional abuse prevention (Cloudflare rate limiting, API quotas/alerts, and/or Turnstile plus server-side verification) before you publish it broadly.

## Deployment — GitHub Pages

1. Open `ocr_config.js` and replace the placeholder with your **Worker URL followed by `/ocr`**, for example:

   ```javascript
   window.GEMINI_OCR_ENDPOINT = 'https://YOUR-WORKER.YOUR-ACCOUNT.workers.dev/ocr';
   ```

   This is a **public endpoint URL**, not the Gemini key.

2. Upload these **three files** to your GitHub Pages repository's root:

   ```text
   index.html
   ocr_config.js
   tng_ocr_sanitizer.js
   ```

   The `worker/` directory is deployed to Cloudflare, not run by GitHub Pages.
3. Enable GitHub Pages: Settings → Pages → Deploy from branch (`main` and `/root`).
4. Visit the GitHub Pages URL, accept the demonstration terms, open Upload, acknowledge the image-processing notice, and test with a **synthetic** TNG screenshot.
5. The OCR result should show **Gemini AI OCR — verify details**. Tap **Review** and confirm actual signed amount, transaction type, merchant and remarks. If Gemini cannot read something, it remains empty and requires correction.

## Test results

Run locally:

```bash
node tests/test_worker.mjs
python tests/test_frontend_syntax.py
```

Test suite mocks Gemini's network response and confirms the worker sends the request through an API-key header without exposing the key in the URL, validates origin and MIME type, and handles unsupported/missing inputs. The screenshot interpretation checks cover Payment, Transfer to Wallet, DuitNow Received, Refund, Cashback, and an unknown amount. No live Gemini API or real TNG screenshot was tested from this environment. Deployment and API quota/billing availability depend on your account.

## Troubleshooting

- **"Gemini OCR endpoint is not configured"** → Edit `ocr_config.js` with the deployed Worker's public `/ocr` URL.
- **403 Origin not permitted / CORS error** → Set `ALLOWED_ORIGIN` to the exact origin in your browser address bar, excluding paths.
- **503 Gemini OCR not configured** → Set the **Worker Secret**, not a plain variable: `npx wrangler secret put GEMINI_API_KEY`.
- **429** → Quota/rate limit reached; check Gemini API usage and billing/quota in your account.
- **502** → Gemini API error, blocked/inaccessible model, temporary failure, timeout or malformed model response. The message is deliberately non-sensitive.
- **OCR returned blanks** → Tap **Review** and manually enter the actual values. Do not invent missing fields.
- **Cannot submit Smart Notes** → That is intentional if no approved secure data backend is configured; Gemini OCR and research-record storage are separate features.

## Safety and methodological limitations

- This package fixes **OCR integration only**. It does not fix the original HTML's hardcoded/bypassable researcher login, incomplete consent, default alias, mandatory notes or pre-note participant category prompt. Do not use it to recruit or collect real financial records.
- The OCR API does **not** predict spending categories and does not generate genuine Smart Notes.
- No reference labels can be independently justified from the Gemini text or user Smart Note alone.
- The existing export architecture is not the supervisor's complete Stage B CSV/JSON contract.
- Cloudflare Worker Origin/CORS restrictions are not true access control; use resource quotas, CAPTCHA verification and monitoring before public release.
