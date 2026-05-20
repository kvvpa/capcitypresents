# CapCity Presents Astro/Decap rebuild

This branch replaces the old static Bootstrap site with an Astro site and Decap CMS admin.

## Current stack

- Astro static site
- Netlify build target
- Decap CMS at `/admin/`
- Git-backed events in `src/content/events/`
- Existing `logo/` and `images/` folders copied into `public/` at build time

## Netlify setup

Build command:

```bash
npm run build
```

Publish directory:

```bash
dist
```

Node:

```bash
24
```

## CMS setup

After deploying on Netlify:

1. Enable Netlify Identity.
2. Set registration to invite-only.
3. Enable Git Gateway.
4. Invite Andy as a user.
5. Send him to `/admin/`.

## Events

Events live in:

```txt
src/content/events/
```

Each event supports title, date, doors, show time, venue, city, price, ticket URL, Facebook event URL, poster, status, featured toggle, and markdown description.

## Facebook

Facebook is optional per event through `facebookEventUrl`. It is not the source of truth.
