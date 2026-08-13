# Cloudflare content operations

## Production resources

- Worker: `main`
- Content D1: `aipresshq-content` (`c75f4f49-0402-4d88-956a-42a15a39bb8a`)
- Contact D1: `aipresshq-contact` (`d5d668c0-f47b-42fd-ad73-7f35aebf2690`)
- R2: `aipresshq-images`

## Cutover baseline

- Legacy Worker rollback version: `6317316e-eab9-438e-a400-707bef2022e9`
- Last legacy content deployment: `8745b96d-dabf-4c44-820d-a24ffd0926fd`
- Runtime implementation checkpoint: `2373f356ea8c3c849499314ae2d5742fc114ae18`

## Migration result

- Published Prismic documents: 16
- Archived probe documents intentionally excluded: 1 (`uid-field-probe`)
- Published D1 posts: 16
- FTS rows: 16
- Versioned article body storage: 282,670 bytes
- Missing posts, metadata mismatches, or missing R2 bodies: 0
- Format corrections: two five-paragraph news briefs had been labeled `explainer` without headings and were normalized to `brief`.

Run parity again:

```sh
npm run content:parity
```

After cutover, target-only posts are expected because new stories publish directly to Cloudflare.
Use `npm run content:parity -- --strict` only during the initial cutover, when Prismic and
Cloudflare must contain exactly the same published IDs.

## Publishing

Validate and publish a JSON draft directly:

```sh
npm run publish:post -- path/to/draft.json
```

The command signs in to Editorial Desk, uploads a local cover when present, publishes to D1 and R2, and verifies the live URL. There is no Prismic release or rebuild step.

## Storage safety

- Warning: 8 GiB of ledgered content storage.
- Hard publishing block: 9 GiB.
- No command enables a paid Cloudflare plan.

## Rollback

If production checks fail, roll the Worker back to `6317316e-eab9-438e-a400-707bef2022e9`. Do not delete D1 or R2 data. The Prismic repository remains read-only migration evidence until its deletion is separately approved.
