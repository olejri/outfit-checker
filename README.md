# Outfit Checker

Photograph your clothes, sort them into a wardrobe, and try outfits on a 3D model.

- **Next.js 16** (App Router) + **Tailwind CSS 4**, mobile first
- **React Three Fiber** for the 3D model: a built-in mannequin with one garment template per
  category; each clothing photo is projected onto its template
- **Supabase** (free tier) for sign-in, the database and private image storage, all behind
  row level security
- **@imgly/background-removal** removes photo backgrounds in the browser, so nothing is sent to a
  paid API

Outfits are private. Turning on "Share with link" makes one outfit viewable by anyone who has its
link (`/s/<random token>`); turning it off again revokes access.

## 1. Create the Supabase project (free)

1. Sign up at <https://supabase.com> and click **New project**. Pick the Free plan, any name, a
   database password (save it somewhere) and the region closest to you.
2. When the project is ready, open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the tables, the
   security policies and the private `wardrobe` storage bucket. It is safe to run again.
3. Open **Project Settings → API Keys** and copy the **Publishable key** (starts with
   `sb_publishable_`). Older projects show an **anon** key instead; that works too.
4. Open **Project Settings → Data API** and copy the **Project URL**
   (`https://<ref>.supabase.co`).
5. Open **Authentication → Sign In / Providers → Email**:
   - For quick testing, turn **Confirm email** off so new accounts can sign in immediately.
     Supabase's built-in email sender only allows a few emails per hour on the free plan.
   - If you leave it on, do step 6 so the confirmation link comes back to your app.
6. Open **Authentication → URL Configuration**:
   - **Site URL**: your production address, e.g. `https://outfit-checker.vercel.app`
   - **Redirect URLs**: add `http://localhost:3000/**` and `https://<your-vercel-domain>/**`

### Google sign-in (optional, free)

1. Go to <https://console.cloud.google.com>, create (or pick) a project.
2. **APIs & Services → OAuth consent screen** (now called **Google Auth Platform**): choose
   **External**, fill in the app name, support email and developer email. Under **Data access**
   the default scopes (`email`, `profile`, `openid`) are enough. While the app is in **Testing**,
   only the Google accounts you add under **Audience → Test users** can sign in; click
   **Publish app** when you want anyone to sign in (no review is needed for these basic scopes).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type
   **Web application**:
   - **Authorized JavaScript origins**: `http://localhost:3000` and `https://<your-vercel-domain>`
   - **Authorized redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (copy the exact value shown as **Callback URL** on Supabase's Google provider page)
4. Copy the **Client ID** and **Client secret**.
5. In Supabase: **Authentication → Sign In / Providers → Google**, turn it on, paste the Client ID
   and Client secret, and save.
6. Make sure step 6 above is done: your app's `/auth/callback` is reached through the
   **Redirect URLs** list (`http://localhost:3000/**` and `https://<your-vercel-domain>/**`).

The Google client secret lives only in Supabase. Nothing new goes into Vercel.

## 2. Run it locally

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then paste your URL and publishable key into it
npm run dev
```

Open <http://localhost:3000>. To try the camera on your phone, deploy to Vercel (phones only allow
camera access over HTTPS).

## 3. Deploy to Vercel (free Hobby plan)

1. Push this folder to a GitHub repository.
2. On <https://vercel.com/new>, import the repository. The framework is detected as Next.js; keep
   the default build settings.
3. Add the environment variables below under **Environment Variables** (all environments), then
   click **Deploy**.
4. Copy your `*.vercel.app` address into Supabase's **Site URL** and **Redirect URLs** (step 1.6).

### Environment variables

| Name | Value | Where to find it | Public or secret |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase → Project Settings → Data API → Project URL | Public (sent to the browser) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Supabase → Project Settings → API Keys → Publishable key (or the legacy **anon** key, which you can put in this same variable) | Public (sent to the browser; safe because row level security protects the data) |

That is all. The app never uses the Supabase **secret** / **service_role** key; do not add it to
Vercel.

## How it fits together

| Path | What it does |
| --- | --- |
| `src/app/(app)/wardrobe` | Wardrobe grid with category filters; `new/` takes or uploads a photo, removes the background, trims it and finds the dominant colour |
| `src/app/(app)/studio` | 3D try-on: pick one item per category (a dress replaces top and bottom), choose skin tone, save or update the outfit |
| `src/app/(app)/outfits` | Saved outfits, share toggle, share/copy link, delete |
| `src/app/s/[token]` | Public read-only view of a shared outfit |
| `src/components/three` | Mannequin, garment templates and the scene |
| `src/proxy.ts` | Keeps the Supabase session fresh and sends signed-out visitors to `/login` |
| `supabase/schema.sql` | Tables, row level security, storage bucket and policies |

### Data and privacy

- `items`, `outfits` and `outfit_items` can only be read or changed by their owner.
- Images live in the private `wardrobe` bucket under `<user id>/<random id>.png` and are shown with
  signed URLs that expire after an hour.
- A shared outfit is fetched by its random share token through the `get_shared_outfit` function,
  so shared outfits cannot be listed. Images that belong to a shared outfit become readable while
  sharing is on.
- Background removal runs on the device. The model (about 40 MB) is downloaded from IMG.LY's CDN
  the first time and then cached by the browser.

### Licence note

`@imgly/background-removal` is licensed under the **AGPL-3.0**. That is fine for a personal or
open-source project. If you want to run this as a closed-source product, either publish your
source under a compatible licence, buy IMG.LY's commercial licence, or swap the background removal
for another library.

## Ideas for later

- Swap the mannequin for a rigged glTF avatar (e.g. from Ready Player Me or Mixamo) and map the
  garment templates onto its bones
- Separate front and back photos per item
- Outfit thumbnails (the canvas already keeps its drawing buffer, so a snapshot is one call away)
