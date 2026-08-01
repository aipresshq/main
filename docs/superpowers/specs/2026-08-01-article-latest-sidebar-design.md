# Article Latest Sidebar Design

## Goal

Add an editorial latest-stories sidebar to every post detail page. It should improve story discovery during long reads while preserving the article's readable line length and AI Snap's existing visual language.

## Content

- Select the five newest posts by publication date.
- Exclude the article currently being viewed.
- Use existing post metadata only; no new content fields are required.
- Each sidebar item shows its cover image, primary tag, headline, author, and publication date.
- Keep the existing tag-matched Related section after the article layout. Latest and Related remain separate modules with different selection rules.

## Layout And Behavior

- Wrap the article and sidebar in a centered two-column layout on wide screens.
- Preserve the article's current maximum width of 760px and use a 340px sidebar with a 56px gutter between them.
- Make the Latest module sticky on desktop so it stays useful during long reads, while allowing it to end naturally with its grid column.
- Use a strong Source Serif 4 section heading and compact story rows that echo the supplied editorial reference without duplicating its branding.
- On tablet and mobile, move Latest below the article. Render two columns where space permits and one column on small phones.
- Keep images consistently cropped, links keyboard accessible, and motion unnecessary for this information-dense module.

## Component Boundary

Create a dedicated `ArticleLatest.astro` component that accepts the selected post entries. The post route remains responsible for sorting and excluding the current article; the component is responsible only for rendering the module.

## Responsive Rules

- Wide desktop: article and sticky sidebar appear side by side.
- At 1080px and below: sidebar moves below the article and loses sticky positioning.
- Small phones: latest stories stack as single compact rows.

## Verification

- Build all static post routes successfully.
- Verify the current story never appears in its own Latest list.
- Verify posts are ordered newest first and capped at five.
- Extend the build-check suite to confirm the component, selection logic, and key responsive styles remain present.
- Inspect a representative post at desktop and mobile viewport widths.
