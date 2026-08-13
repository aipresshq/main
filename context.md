# aiPressHQ project context

This file records product and editorial intent. The technical source of truth is
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Positioning

aiPressHQ is an independent AI news publication focused on clear reporting, useful context,
and practical verification. It covers models, products, companies, research, access, usage
limits, and claims circulating online.

The publication should feel like a focused editorial desk, not a generic content farm. The
website, newsletter, search presence, and article archive work together as one publication.

## Editorial standards

- Separate confirmed facts from interpretation and unresolved claims.
- Prefer official announcements, documentation, research, and first-party statements.
- Link directly to the source supporting a claim.
- Verify viral claims before repeating them in a headline as fact.
- Use natural, human prose without promotional filler or fabricated certainty.
- Preserve dates, plan names, prices, limitations, and source wording accurately.
- Correct errors transparently through the corrections workflow.
- Keep author identity, publication date, update date, format, sources, and topics visible.

## Content model

Every story has one format and one post type. These fields are functional, not decorative.

Formats:

- `brief`: a concise confirmed development;
- `explainer`: background and meaning;
- `comparison`: evidence-led tradeoffs;
- `tracker`: a maintained reference for changing limits, access, or prices;
- `analysis`: evidence separated from interpretation;
- `tutorial`: a careful step-by-step workflow.

Post types:

- `digest`: timely editorial coverage;
- `evergreen`: durable reference material;
- `tracker`: a maintained live guide.

Tags create topic archives. Level-two body headings create “In this story.” They must never be
treated as interchangeable.

## Homepage logic

The homepage is derived from the current published catalog. Publication date determines
recency. `featured` supplies editorial selection signals. `postType: tracker` identifies live
guides. Tags and formats power their own archives. The homepage selection helpers prevent the
same story from filling several modules.

Modules should render only when their content contract can be satisfied. Empty or undersized
modules disappear without leaving placeholder copy or unexplained whitespace.

## Search and discovery

Every published article should be reachable through several useful paths:

- latest and dated archives;
- topic and format archives;
- author pages;
- full-text search;
- related and suggested stories;
- RSS and scoped feeds;
- XML and image sitemaps;
- stable canonical article URLs.

Search and discovery surfaces update as part of the same publishing transaction, so there is
no delay waiting for a separate content build.

## Trust and sustainability

The business should not depend on display advertising alone. Newsletter readership,
sponsorships, direct audience relationships, and high-value evergreen references are more
durable than low-intent page views.

Measure useful reader behavior without invasive tracking. The current server-side page-view
dataset stores only page path, Cloudflare country code, and referrer host. It deliberately
avoids IP addresses, cookies, browser fingerprints, user agents, and full referrer URLs.

## Current operating principle

Publishing is an editorial action, not a software release. Code deployments change the
application. Article publication changes D1 and R2 and becomes visible immediately. Future
features must preserve that separation.
