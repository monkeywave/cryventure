# Deploying CryVenture

CryVenture is a fully static site (Astro + Starlight, `apps/web`). One build produces
`apps/web/dist/`, and that output is shipped to two targets:

| Target | Use | Defined in |
| --- | --- | --- |
| GitHub Pages (primary) | Public site, served from a project sub-path or a custom domain | `.github/workflows/pages.yml` |
| Docker image (nginx) | Self-hosting, offline / air-gapped classrooms, reverse-proxy setups | `docker/Dockerfile`, `docker/compose.yaml`, `.github/workflows/docker.yml` |

Background and design rationale: `docs/PLAN.md` section 7b.

---

## 1. Local build and preview

Requirements: Node 22 (`.nvmrc`), pnpm 10 (`packageManager` in `package.json`; `corepack enable` provides it).

```bash
pnpm install
pnpm build      # -> apps/web/dist/
pnpm preview    # serves dist at http://localhost:4321/
```

The root `/` page redirects to `en/` or `de/` based on the browser language (English without JavaScript).

### Build-time environment variables

`apps/web/astro.config.mts` (and the post-build PWA step) read these variables:

| Variable | Default | Effect |
| --- | --- | --- |
| `CV_BASE` | `/` | Astro `base`: the URL path the site lives under. All internal links and assets are prefixed with it. Must start **and** end with `/` (e.g. `/cryventure/`). |
| `CV_SITE` | `https://example.github.io` | Astro `site`: the absolute origin (scheme + host, no path) used for canonical/absolute URLs. |
| `CV_PWA` | on | `false` drops the manifest link and registration, and writes a self-unregistering `sw.js` (CI preview artifacts, debugging). |

The config also sets `trailingSlash: 'always'` and `build.format: 'directory'`, so every page is
`<route>/index.html` and URLs end in `/` (identical behaviour on Pages and nginx).

### PWA / offline (docs/M3.md §11)

`pnpm build` runs `astro build`, then `apps/web/scripts/build-sw.mjs`, which writes
`dist/manifest.webmanifest` and `dist/sw.js` at the base root (`scope` = `start_url` = `CV_BASE`).

- `sw.js` is a Workbox `generateSW` worker that precaches every HTML, CSS, JS, JSON, image and font file
  plus all of `pagefind/` (search works offline). There is no navigation fallback: unknown URLs still go to the network.
- Files above 3 MB are left out. The build prints the precache size (about 3.3 MB today) and **fails above 25 MB**.
- Updates use prompt-to-reload: a new worker waits, and a localized toast (`ui.pwa.*`) offers "Reload" / "Later".
  Nothing is swapped mid-lesson. When "Reload" in one tab activates the update, every other open tab shows the
  toast again, now reloading directly: their HTML belongs to the old build, whose lazy chunks may be gone.
- Registration happens only in production builds (`astro dev` never registers a worker), and only in browsers
  that expose `navigator.serviceWorker`; a failed registration is ignored (the site works without it).
- **`CV_PWA=false`** emits no manifest and no registration, but still writes a tiny `sw.js` that replaces a
  worker installed by an earlier PWA build on the same origin: it deletes the caches of its scope, unregisters
  itself and reloads the open pages. Without it, browsers that once installed the PWA would keep serving the
  stale precache.
- `e2e/offline.spec.ts` checks lessons, a lab and search with the browser offline (with `CV_PWA=false` it checks
  the self-unregistering worker instead).
- If a stale worker gets in the way locally, use DevTools -> Application -> Service workers -> Unregister.

Build and preview a sub-path variant (as served on a GitHub project page):

```bash
CV_BASE=/cryventure/ CV_SITE=https://<user>.github.io pnpm build
CV_BASE=/cryventure/ pnpm preview   # -> http://localhost:4321/cryventure/
```

A `dist/` built for one base only works when served under that base. Rebuild when the base changes.

---

## 2. GitHub Pages

### One-time repository setup

1. Repository **Settings -> Pages -> Build and deployment -> Source: "GitHub Actions"**.
   (No `gh-pages` branch is used, so no `.nojekyll` file is needed.)
   - **Do not** pick "Deploy from a branch" (e.g. `main` / `(root)`): GitHub would then run Jekyll over the raw
     source tree (the "pages build and deployment" run fails or shows the README) instead of the built Astro site.
   - CLI equivalent: `gh api -X PUT repos/<owner>/<repo>/pages -f build_type=workflow`
     (or `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow` if Pages was never enabled).
   - If `configure-pages` fails with `Get Pages site failed … Not Found`, this step is missing.
2. Push to `main` (or run the workflow manually from the **Actions** tab).
3. After deploying, the `smoke` job runs the Playwright suite against the live URL.

### What `pages.yml` does

- **Triggers:** push to `main`, and `workflow_dispatch` (manual run).
- **Permissions:** `contents: read`, `pages: write`, `id-token: write`.
- **Concurrency:** group `pages`, in-progress deployments are not cancelled.
- **Job `build`:** checkout -> pnpm + Node from `.nvmrc` -> `actions/configure-pages@v5` ->
  `pnpm install --frozen-lockfile` -> `pnpm build` with:
  - `CV_SITE` = `steps.pages.outputs.origin` (e.g. `https://<owner>.github.io`)
  - `CV_BASE` = `steps.pages.outputs.base_path` + `/` (e.g. `/<repo>/`)

  then uploads `apps/web/dist` with `actions/upload-pages-artifact@v3`.
- **Job `deploy`:** `actions/deploy-pages@v4` into the `github-pages` environment; the environment URL is the deployed page URL.

The base path is derived from the Pages configuration, not hard-coded, so the repository name does not
need to be `cryventure`.

### Custom domain / user page

Set the custom domain under **Settings -> Pages -> Custom domain** (with the Actions source, no `CNAME`
file is needed in the build output). `configure-pages` then reports an empty `base_path` and the custom
origin, so the workflow automatically builds with `CV_BASE=/` and `CV_SITE=https://<your-domain>`.
The same applies to a `<user>.github.io` user/organization page. There is no separate manual override
input in the workflow; re-run it after changing the domain so the site is rebuilt with the new base.

### 404 page

Starlight's built-in 404 route is disabled; `apps/web/src/pages/404.astro` emits a bilingual
`dist/404.html`, which Pages serves for unknown URLs.

### Limitations on Pages

- Pages cannot send custom HTTP headers. The security headers listed in section 3 are only sent by the
  Docker/nginx image. A `<meta http-equiv>` CSP for Pages (PLAN 7b) is **not yet supported**.
- PR preview deployments are **not yet supported**. CI (`ci.yml`) uploads a `site-preview` artifact
  (built with `CV_BASE=/cryventure/` and `CV_PWA=false`, kept 7 days) that you can download and serve locally.

---

## 3. Docker (self-host, offline classrooms)

The image is a multi-stage build:

1. `node:22-alpine` (runs on the build host's native platform): `pnpm install --frozen-lockfile && pnpm build`,
   renders `docker/nginx.conf.template` for the chosen base path, and copies `dist/` to `/site<base>`.
2. `nginxinc/nginx-unprivileged:alpine`: serves the files as a non-root user on **port 8080**.

The image is self-contained: no runtime environment variables, no external fonts/CDNs, works fully offline.

### Build and run

```bash
# from the repository root
docker build -f docker/Dockerfile -t cryventure:local .
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 cryventure:local
# -> http://localhost:8080/  (redirects to /en/ or /de/)
```

`--read-only --tmpfs /tmp` is optional but recommended; the image is designed for (and CI tests) a
read-only root filesystem.

### Compose

```bash
docker compose -f docker/compose.yaml up --build      # -> http://localhost:8080/
docker compose -f docker/compose.yaml up -d --build   # detached
docker compose -f docker/compose.yaml down
```

The `web` service builds the image as `cryventure:local`, maps `8080:8080`, runs `read_only` with a
`tmpfs` at `/tmp`, and uses `restart: unless-stopped`. A `classroom` profile (live-quiz service) is
**not yet supported** (planned for Phase 9).

### Offline / air-gapped classrooms

Build or pull on a connected machine, then move the image:

```bash
docker save cryventure:local | gzip > cryventure.tar.gz
# on the offline machine
docker load < cryventure.tar.gz
docker run -d --read-only --tmpfs /tmp -p 8080:8080 --restart unless-stopped cryventure:local
```

Students open `http://<teacher-machine-ip>:8080/`.

### nginx behaviour (`docker/nginx.conf.template`)

- Listens on `8080`; `absolute_redirect off` (directory redirects such as `/en` -> `/en/` stay relative and do not leak `:8080`); `server_tokens off`.
- `try_files $uri $uri/index.html =404`; unknown URLs return the localized page at `<base>404.html` with status 404.
- `GET /healthz` returns `200 ok` (always at the server root, independent of the base path). The image `HEALTHCHECK` polls it every 30 s.
- gzip for CSS, JS, JSON, SVG and plain text.
- Caching: anything under `/_astro/` gets `Cache-Control: public, max-age=31536000, immutable`; all other files (HTML etc.) get `Cache-Control: no-cache`.
  `sw.js` and `manifest.webmanifest` have their own location with `no-cache` and explicit MIME types, so browsers always see a new service worker.
- Security headers on HTML: `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'none'`, `'unsafe-inline'` for scripts/styles, `'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `manifest-src 'self'`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
  The server block also declares `Permissions-Policy` and `Cross-Origin-Opener-Policy`, but see the note below.

> Note: nginx does not inherit `add_header` directives from the `server` block into a `location` that
> defines its own `add_header`. As written, `Permissions-Policy` and `Cross-Origin-Opener-Policy` are
> therefore only sent on `/healthz`, not on pages or assets, and `/_astro/` responses carry only
> `Cache-Control`, a minimal CSP and `nosniff`.

---

## 4. Sub-path behind a reverse proxy

To serve the container under e.g. `https://example.org/cryventure/`, build with the `CV_BASE` build arg
(and optionally `CV_SITE`, default `http://localhost:8080`):

```bash
docker build -f docker/Dockerfile \
  --build-arg CV_BASE=/cryventure/ \
  --build-arg CV_SITE=https://example.org \
  -t cryventure:subpath .
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 cryventure:subpath
# -> http://localhost:8080/cryventure/
```

How it works: the files are copied to `/usr/share/nginx/html/cryventure/` and `error_page` points to
`/cryventure/404.html`. nginx serves the site **under the prefix itself**, so the proxy must forward the
path **unchanged (do not strip `/cryventure/`)**. Requests for `/` on the container return 404 in this
variant (there is no redirect from `/` to the base). Always pass `CV_BASE` with a trailing slash; the
nginx path is normalised, but Astro uses the value as given.

The `ghcr.io` images are built with the default `CV_BASE=/`; for a sub-path you must build your own image.

### nginx (front proxy)

```nginx
location /cryventure/ {
    proxy_pass http://127.0.0.1:8080;   # no URI part -> path is forwarded unchanged
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Do not write `proxy_pass http://127.0.0.1:8080/;` (with a trailing slash/URI): that strips the prefix.

### Caddy

```caddy
example.org {
    handle /cryventure/* {          # use handle, not handle_path (handle_path strips the prefix)
        reverse_proxy 127.0.0.1:8080
    }
}
```

### Traefik (Docker labels)

```yaml
services:
  cryventure:
    image: cryventure:subpath
    read_only: true
    tmpfs: [/tmp]
    labels:
      - traefik.enable=true
      - traefik.http.routers.cryventure.rule=Host(`example.org`) && PathPrefix(`/cryventure/`)
      - traefik.http.services.cryventure.loadbalancer.server.port=8080
      # no StripPrefix middleware
```

### Verify

```bash
curl -fsS  http://example.org/cryventure/en/ | grep -q CryVenture
curl -fsSI http://example.org/cryventure/en/ | grep -i content-security-policy
curl -s -o /dev/null -w '%{http_code}\n' http://example.org/cryventure/does-not-exist/   # 404

# full E2E + accessibility suite against the running server (no local build/preview is started)
E2E_BASE_URL=http://example.org/cryventure/ pnpm e2e
```

---

## 5. Published images on GHCR

### What `docker.yml` does

- **Triggers:** push to `main`, push of tags matching `v*`, and `workflow_dispatch`.
- **Permissions:** `contents: read`, `packages: write`, `id-token: write`, `attestations: write`.
- Logs in to `ghcr.io` with `GITHUB_TOKEN`, sets up QEMU + Buildx, and builds `docker/Dockerfile`
  for **`linux/amd64` and `linux/arm64`** with `push: true`, an SBOM (`sbom: true`) and
  provenance (`provenance: mode=max`).
- **Image name:** `ghcr.io/<owner>/<repo>` (from `github.repository`).
- **Tags** (`docker/metadata-action`):

  | Event | Tags |
  | --- | --- |
  | push to `main` | `main`, `latest`, `sha-<short-sha>` |
  | push tag `v1.2.3` | `1.2.3`, `sha-<short-sha>` |

Build arguments are not passed, so published images always use `CV_BASE=/`.

### Pull and run

```bash
docker pull ghcr.io/<owner>/<repo>:latest       # or :1.2.3, :main, :sha-abc1234
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 ghcr.io/<owner>/<repo>:latest
```

### Make the package public

New GHCR packages are private. To allow anonymous pulls: GitHub profile/organization ->
**Packages -> `<repo>` -> Package settings -> Danger Zone -> Change visibility -> Public**.
Optionally link the package to the repository under **Manage Actions access / Connect repository**.
Otherwise users must `docker login ghcr.io` with a token that has `read:packages`.

---

## 6. Verification checklist

Before releasing or after changing deployment config:

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test

# E2E (Playwright, Chromium) incl. axe accessibility checks (apps/web/e2e/a11y.spec.ts).
# Builds the site and starts `astro preview` on :4329 automatically (not 4321, `astro dev`'s port, so a
# running dev server is never mistaken for the build). E2E_BASE_URL=<url> tests a server you started yourself.
pnpm e2e                                    # base "/"
pnpm --filter @cryventure/web e2e:subpath   # base "/cryventure/" (GitHub Pages layout)

# Docker image + smoke test (mirrors the `docker` job in ci.yml)
docker build -f docker/Dockerfile -t cryventure:ci .
docker run -d --rm --read-only --tmpfs /tmp -p 8080:8080 --name cv cryventure:ci
curl -fsS  http://localhost:8080/healthz
curl -fsS  http://localhost:8080/en/ | grep -q CryVenture
curl -fsS  http://localhost:8080/de/ | grep -q CryVenture
curl -fsSI http://localhost:8080/en/ | grep -qi content-security-policy
E2E_BASE_URL=http://localhost:8080/ pnpm e2e
docker stop cv
```

Notes:

- `e2e:subpath` sets the variable inline (`CV_BASE=... playwright test`) and therefore needs a POSIX shell (not Windows `cmd`/PowerShell).
- Playwright browsers must be installed once: `pnpm --filter @cryventure/web exec playwright install chromium`.
- CI (`ci.yml`) currently runs `pnpm e2e` (base `/`) only; the sub-path E2E run and E2E against the container are **not yet part of CI**, so run them locally.

### Not yet supported (planned in PLAN 7b)

- CSP `<meta>` tag for GitHub Pages; PR preview deployments.
- Trivy image scan, image-size budget check and Playwright run against the container in CI.
- Compose `classroom` profile (live-quiz).
