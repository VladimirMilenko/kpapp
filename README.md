# Kino.pub LG TV

Bun + Vite webOS app for Kino.pub with a memory-routed React UI, TanStack Query server-state caching, a lazy-loaded `hls.js` playback core, TV remote navigation, selectable quality, audio, and subtitles.

## Setup

Install and run the Vite dev server through Bun:

```sh
bun install
bun run dev
```

Kino.pub OAuth defaults are embedded for local development and builds. To override them, create `public/config.local.js`:

```js
window.KINO_TV_CONFIG = {
  clientId: "xbmc",
  clientSecret: "cgg3gtifu46urtfp2zp1nqtba0k2ezxh",
  apiBase: "https://api.service-kp.com",
  deviceTitle: "LG webOS TV",
  deviceHardware: "webOS",
  deviceSoftware: "Kino.pub TV",
  deviceId: undefined,
  preferredStream: "hls4"
};
```

You can also set `KINOPUB_API_BASE_URL`, `KINOPUB_API_CLIENT_ID`, and `KINOPUB_API_CLIENT_SECRET` before running `bun run build`. The build keeps the older `KINO_*` names as aliases. `KINO_DEVICE_ID` is optional; the app normally stores the id returned by Kino.pub device notify.

Build packaged webOS assets:

```sh
bun run build
```

`bun run build` runs `vite build`, then `scripts/webos.ts` writes `dist/config.js` and copies `appinfo.json` for packaging.

## GitHub Pages

The repository includes a GitHub Actions workflow that builds `dist/` and deploys it to GitHub Pages when changes land on `main`. It can also be run manually from the Actions tab.

For the first deployment, open the repository's Pages settings and set the source to GitHub Actions. After the workflow completes, the app will be available at the Pages URL, for example:

```text
https://<github-user>.github.io/<repo-name>/
```

Package for LG webOS after installing LG webOS CLI tools:

```sh
bun run package:webos
```

## Playback

The app prefers Kino `hls4` URLs, then falls back through `hls2`, `hls`, and `http`. Runtime playback uses `hls.js` when supported. If a TV browser exposes native playback only, the player still sets the selected stream on the video element.

External Kino subtitle files are fetched and parsed as SRT/WebVTT into a custom overlay. HLS subtitle renditions exposed by the manifest are also listed in the subtitle menu.

## State

Navigation uses React Router with an in-memory router, which matches packaged TV app behavior without depending on browser URLs. Server state uses TanStack Query for rails, search, item detail, playable media hydration, and continue-watching invalidation.

The home screen includes `Continue where you left off` and `Series in progress` rails from Kino.pub watching endpoints. Playback progress is saved locally for immediate resume and sent to Kino.pub through `watching/marktime`.
