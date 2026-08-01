# Article, Author, And Suggested Reads Design

## Goal

Turn each post detail page into a full-width editorial canvas with a readable article measure, a clickable author identity, a real author archive, and a distinct Suggested Reads module.

## Scope

This foundation covers the standalone article experience and the reusable article unit required by continuous reading. It does not implement automatic loading; that behavior is defined in `2026-08-01-continuous-article-reading-design.md`.

## Full-Width Editorial Canvas

- The article page uses the full available width inside the site's existing frame gutters.
- On desktop, the outer grid is `minmax(0, 1fr) 340px` with a `56px` gap. The left article region grows with the viewport instead of stopping at 760px.
- The headline and hero image may use the full left article region.
- Prose, tables, quotes, the source, and tags remain inside a centered `760px` maximum reading measure within the left region.
- The existing Latest rail remains `340px` wide and sticky on desktop.
- At `1080px` and below, the page stacks into one column and the Latest rail becomes static below the article.
- On small screens, all article, author, Latest, and recommendation content uses one column without horizontal overflow.

## Author Data Model

- Add an `authors` content collection loaded from `src/content/authors`.
- Each author entry has a stable slug derived from its file name and requires `name`, `role`, `bio`, and `avatar` fields.
- Each author may provide optional `website`, `x`, and `linkedin` URLs.
- Change the posts schema to use Astro's `reference('authors')` helper for `author`; post frontmatter stores the author slug while loaded entries expose a validated content reference.
- Migrate all existing posts to `author: "ai-snap-editorial"` and add the matching profile.
- Astro content validation must reject a post whose author slug has no matching author entry during the build.

## Clickable Byline

- Replace the initial-only byline treatment with a linked author identity containing the profile avatar, author name, and role.
- The entire author identity links to `/authors/<slug>/` and has a visible keyboard focus state.
- Publication date, update date, and read time remain beside the author identity.
- `NewsArticle.author` continues to emit a Person object, now using the resolved profile name and linking to the author page with `url`.

## Author Archive

- Add a static `/authors/[author]/` route for every author profile.
- The page header shows avatar, name, role, bio, optional social links, and the number of published stories.
- The page lists every post referencing that author slug, newest first.
- Story cards show cover, primary tag, headline, description, publication date, and read time.
- The author page has Person structured data and a descriptive page title and meta description.
- Author routes remain useful when an author has one story and render a clear empty state if a profile temporarily has no published posts.

## Reusable Article Unit

- Extract one story's presentation into `ArticleContent.astro`.
- The component owns the article header, linked author byline, hero, rendered body, Why it matters, facts table, quote, source, and tags.
- The standalone post route owns page metadata, schema, Latest, Suggested Reads, and continuous-reading orchestration.
- The component receives fully resolved post and author data; it does not query collections itself.

## Suggested Reads

- Replace the existing Related section with `SuggestedReads.astro` so the page has one unambiguous recommendation module.
- Exclude the current post.
- Rank candidates by shared-tag count descending, then publication date descending. Posts with no shared tags fill remaining positions by recency.
- Render exactly four cards when at least four other posts exist; otherwise render every available candidate.
- Each card links to its standalone post and shows a 16:9 cover, primary tag, and headline.
- The standalone variant spans the full editorial canvas in four desktop columns, two tablet columns, and one mobile column.
- A compact stream variant renders two cards for an article appended by continuous reading.

## Error And Empty States

- Missing author references fail the build with the post ID and missing slug.
- An author with no posts still receives a valid profile page with a clear “No published stories yet” message.
- Suggested Reads is omitted when no other posts exist and never renders empty card placeholders.
- Broken or missing optional social links do not produce empty controls.

## Verification

- Build every existing post and author route successfully after the author migration.
- Verify every article byline links to the resolved author page.
- Verify the author archive contains only that author's posts in newest-first order.
- Verify article schema uses the profile name and author-page URL.
- Verify Suggested Reads excludes the current post, follows deterministic tag-first ordering, and caps at four.
- Inspect desktop, tablet, and mobile layouts for width, line length, focus visibility, and overflow.
