# American Billboard Music

Static site streaming Billboard Hot 100 songs by year, hosted at **music.iatebreakfast.com** on Cloudflare Pages.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main page — header, decade nav, year grid, embed player |
| `styles.css` | Dark theme, responsive grid layout |
| `player.js` | Navigation logic + `YEAR_EMBEDS` config object |

---

## 1. Deploy to Cloudflare Pages

### Option A — Connect a Git repo (recommended)

1. Push the three files (`index.html`, `styles.css`, `player.js`) to a GitHub or GitLab repository.
2. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Select your repo. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave blank)*
   - **Output directory:** `/` (or leave blank)
4. Click **Save and Deploy**. Cloudflare assigns a `*.pages.dev` URL.

### Option B — Direct upload

1. In Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Upload assets**.
2. Drag all three files into the upload area.
3. Click **Deploy site**.

---

## 2. Add the custom domain (music.iatebreakfast.com)

After deploying:

1. In Cloudflare Dashboard, open your Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `music.iatebreakfast.com` and click **Continue**.
3. Cloudflare will prompt you to add a CNAME record. Because `iatebreakfast.com` is already on Cloudflare, it can add this automatically — click **Activate domain**.
4. If you need to add it manually, go to **DNS** for `iatebreakfast.com` and add:
   - **Type:** CNAME
   - **Name:** `music`
   - **Target:** `<your-project>.pages.dev`
   - **Proxy status:** Proxied (orange cloud)

SSL is handled automatically by Cloudflare.

---

## 3. Get OneDrive embed codes for each year

### Step-by-step

1. In OneDrive, right-click a year folder (e.g. `1985`) → **Share**.
2. In the Share dialog, click **Anyone with the link can view** (or change the permission to that).
3. Click **Copy link** — but don't use this link directly; continue to the next step.
4. Open the shared link in a browser. You should see the OneDrive folder view.
5. Click the **⋯ More** menu (top toolbar) → **Embed**.
6. A panel shows an `<iframe>` snippet. Copy only the **`src` attribute value** — it looks like:
   ```
   https://onedrive.live.com/embed?resid=ABCDEF1234567890&authkey=!AbCdEfGhIjKlMnOp
   ```

### Important notes

- The folder must be shared as **"Anyone with the link"** — otherwise the embed won't load for visitors.
- OneDrive embeds work best for folders containing audio files (MP3, FLAC, etc.). Visitors can play tracks directly in the iframe.
- If the embed shows a sign-in prompt, re-check the sharing permission.

---

## 4. Paste embed URLs into player.js

Open `player.js`. Near the top you'll find the `YEAR_EMBEDS` object:

```js
const YEAR_EMBEDS = {
  1946: null,
  1947: null,
  // ... all years listed ...
};
```

Replace `null` with the embed src URL you copied from OneDrive:

```js
const YEAR_EMBEDS = {
  1946: null,
  // ...
  1985: "https://onedrive.live.com/embed?resid=ABCDEF1234&authkey=!XyZ",
  1986: "https://onedrive.live.com/embed?resid=ABCDEF5678&authkey=!AbC",
  // ...
};
```

- Years with a URL → load the OneDrive embed iframe when selected.
- Years with `null` → show a "not yet linked" placeholder.

After editing, redeploy: push to Git (Cloudflare Pages auto-rebuilds) or re-upload the updated `player.js`.

---

## 5. Deep-linking to a year

The site supports URL hash navigation. You can link directly to any year:

```
https://music.iatebreakfast.com/#1985
```

This auto-selects the correct decade and opens that year's player on page load.

---

## Library coverage

| Decade | Years available |
|--------|----------------|
| 1940s | 1946–1949 |
| 1950s | 1950–1959 |
| 1960s | 1960–1969 |
| 1970s | 1970–1979 |
| 1980s | 1980–1989 |
| 1990s | 1990–1999 |
| 2000s | 2000–2004 |
| 2010s | 2012–2020 |

**Total: 68 years · 6,800+ songs**
