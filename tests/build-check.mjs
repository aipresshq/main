// Lightweight build-output verification harness — no test framework needed
// for a static-only Astro site. Run `npm run build` first, then this script.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
import {
  canStartContinuousLoad,
  handleContinuousReaderPageTransition,
  validateArticleFragmentCandidates,
} from '../src/scripts/continuous-reader.ts';
import { serializeBodyWithHeadings } from '../src/loaders/prismic-posts.ts';
import { getSuggestedPosts } from '../src/lib/recommendations.ts';
import {
  getNextOlderPost,
  getPreviousNewerPost,
  sortPostsNewestFirst,
} from '../src/lib/post-order.ts';
import { slugify } from '../src/lib/slug.ts';
import { getAuthorId } from '../src/lib/author-reference.ts';
import { storyFormats } from '../src/lib/formats.ts';
import { topicGroups, knownTopics } from '../src/lib/topics.ts';

const dist = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf-8');
const distExists = (path) => existsSync(new URL(`../dist/${path}`, import.meta.url));
// Raw bytes, for assertions about binary assets (e.g. PNG header dimensions).
const distBuffer = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url));
const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8');
const sourceStyles = () =>
  [...src('src/styles/global.css').matchAll(/@import ['"]\.\/([^'"]+)['"];?/g)]
    .map(([, file]) => src(`src/styles/${file}`))
    .join('\n');
const internalScaffoldingPatterns = [
  /\b(?:this|that|it)\s+(?:is|was)\s+(?:just\s+)?(?:a\s+)?placeholder(?:\s*[.!?;:]|$)/i,
  /\btest[- ]data\b/i,
  /\b(?:draft|temporary|internal)\s+(?:copy|content|text)\s+for\s+SEO\b/i,
  /\b(?:post|article|copy|content|story)\s+(?:validat(?:e|es|ed|ing)|verif(?:y|ies|ied|ying)|exercis(?:e|es|ed|ing)|checks?)\s+(?:the\s+)?`?\/[a-z0-9/-]+\/?`?\s+route\b/i,
  /\bplaceholder(?:[\s-]+\w+){0,3}[\s-]+(?:fixture|post|article|copy|content|body|comparison|story|entry|record)\b/i,
  /\bfixture[\s-]+(?:post|article|copy|content|body|story|entry|record|data)\b/i,
  /\b(?:this|that|the|a|an)\s+fixture\s+(?:verif(?:y|ies|ied|ying)|validat(?:e|es|ed|ing)|test(?:s|ed|ing)?|checks?)\b/i,
  /\bplaceholder\s+(?:is\s+)?used\s+(?:only\s+)?to\s+(?:verify|validate|exercise|test|check|populate)\b/i,
  /\btest[- ]fixture\b/i,
  /\bcontent collections?\s+schema\b/i,
  /\bpostType\s*===/i,
  /\bused\s+(?:only\s+)?to\s+(?:verify|validate|exercise)\s+(?:the\s+)?`?\/[a-z0-9/-]+\/`?\s+route\b/i,
  /\bused\s+(?:only\s+)?to\s+populate\s+(?:the\s+)?homepage\b/i,
  /\b(?:post|article|copy|content|story)\s+(?:is\s+|was\s+)?used\s+(?:only\s+)?to\s+populate\s+(?:the\s+)?(?:listing|archive|suggested reads?)\b/i,
  /\bused\s+(?:only\s+)?to\s+(?:verify|validate|exercise)\s+(?:the\s+)?(?:content collections? schema|post type|route filtering|tag filtering|homepage ordering|facts[- ]table block)\b/i,
  /\bvalidat(?:e|es|ed|ing)\s+(?:the\s+)?(?:route filtering|tag filtering|homepage ordering|content collections? schema|post type)\b/i,
  /\b(?:route|filters?|schema|homepage|listing|archive|component|layout)\s+(?:test|testing|fixture|validation|scaffolding|commentary)\b/i,
  /\b(?:implementation|testing|SEO)\s+(?:detail|note|commentary|scaffolding|copy|language|keyword|metadata|tactic|fixture)\b/i,
  /\b(?:regression|integration|rendering|build)\s+test(?:ing)?\s+(?:copy|content|post|article|fixture|data)\b/i,
  /\b(?:post|article|copy|content|story)\s+(?:exists|is|was)\s+(?:only\s+)?for\s+(?:regression\s+|integration\s+|rendering\s+|build\s+)?testing\b/i,
  /\/[a-z0-9/-]+\/\s+route\s+(?:filters?|filtering|orders?)\b/i,
];
const containsInternalScaffolding = (text) =>
  internalScaffoldingPatterns.some((pattern) => pattern.test(text));
const filesUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? filesUnder(url) : [url];
  });
const decodePublicCopy = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(
      /&(nbsp|amp|quot|apos|lt|gt);/gi,
      (_, entity) =>
        ({
          nbsp: ' ',
          amp: '&',
          quot: '"',
          apos: "'",
          lt: '<',
          gt: '>',
        })[entity.toLowerCase()],
    );
// Attribute values are HTML-escaped in the built markup, so expected URLs that
// carry `&`, `<`, `>` or `"` must be escaped the same way before searching.
const escapeHtmlAttribute = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Prismic is the source of truth for post content, but this harness keeps its
// own list of the published stories. Everything that iterates the built output
// goes through sourcePosts(), so without an independent list a story that
// silently failed to build would simply be skipped by every one of those checks
// instead of turning the suite red.
const primaryPostId = 'gpt-5-6-terra';
const secondaryPostId = 'gpt-6-mako-koi-tune-leak';
const tertiaryPostId = 'mythos-6-leak';
const quaternaryPostId = 'codex-beyond-the-laptop';
const pricingPostId = 'luna-price-efficiency';
const tutorialPostId = 'codex-workspace-cleanup';
const motionPostId = 'motion-claude-launch-video';
const publishedPostIds = [
  primaryPostId,
  secondaryPostId,
  tertiaryPostId,
  quaternaryPostId,
  pricingPostId,
  tutorialPostId,
  motionPostId,
];

// Scope content assertions to the story itself. A post page also renders nav,
// sidebar, Suggested Reads and footer chrome, so page-wide string searches can
// be satisfied by markup that has nothing to do with the article.
const articleBody = (html, label = 'page') => {
  const start = html.indexOf('<article');
  assert.ok(start >= 0, `${label} is missing its <article> element`);
  const end = html.indexOf('</article>', start);
  assert.ok(end > start, `${label} has an unterminated <article> element`);
  return html.slice(start, end);
};
const articleTags = (html, label = 'page') => {
  const list = articleBody(html, label).match(/<ul class="article-tags">([\s\S]*?)<\/ul>/);
  if (!list) return [];
  return [...list[1].matchAll(/<a class="pill" href="[^"]*">([^<]+)<\/a>/g)].map((match) =>
    decodePublicCopy(match[1]).trim(),
  );
};
const articleHeadings = (html, label = 'page') =>
  [...articleBody(html, label).matchAll(/<(h[2-6])\b[^>]*>([\s\S]*?)<\/\1>/g)].map((match) =>
    decodePublicCopy(match[2].replace(/<[^>]*>/g, '')).trim(),
  );

const sourcePosts = () => {
  // After the Prismic migration, posts are fetched from Prismic during build,
  // so the built output — not source markdown — is the only local record of
  // what shipped. Cross-check it against publishedPostIds so a story that
  // failed to build fails loudly here rather than being quietly skipped.
  const distPostsDir = new URL('../dist/posts/', import.meta.url);
  const postDirs = readdirSync(distPostsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(
    postDirs,
    [...publishedPostIds].sort(),
    'dist/posts/ must contain exactly the published stories — a post missing from the build would otherwise be skipped by every check that iterates sourcePosts()',
  );

  return postDirs.map((id) => {
    const tags = articleTags(dist(`posts/${id}/index.html`), `/posts/${id}/`);
    // Tag extraction previously read a `data-post-tags` attribute that the
    // build never emitted, which silently gave every post an empty tag list and
    // emptied every sourceTopics()-driven check. Fail loudly instead.
    assert.ok(
      tags.length > 0,
      `/posts/${id}/ rendered no tags in its <ul class="article-tags"> list — tag extraction is broken or the story lost its topics`,
    );
    return {
      id,
      tags,
    };
  });
};
const sourceTopics = () =>
  [...new Set(sourcePosts().flatMap((post) => post.tags))]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ label, href: `/tag/${slugify(label)}/` }));
const topicMenuFrom = (html) => {
  const navStart = html.indexOf('<nav class="primary-bar"');
  const navEnd = html.indexOf('</nav>', navStart);
  assert.ok(navStart >= 0 && navEnd > navStart, 'page is missing the section navigation');
  const nav = html.slice(navStart, navEnd);
  const menuStart = nav.indexOf('<details class="category-menu">');
  assert.ok(menuStart >= 0, 'section navigation is missing the Categories disclosure');
  // Bound this slice by the Categories disclosure so current-link assertions
  // never accidentally inspect unrelated navigation controls.
  const menuEnd = nav.indexOf('</details>', menuStart);
  return nav.slice(menuStart, menuEnd);
};
const topicSummaryLabel = (topicMenu) => {
  const summary = topicMenu.match(/<summary[^>]*>[\s\S]*?<span>([^<]+)<\/span>/);
  assert.ok(summary, 'Categories disclosure is missing its visible summary label');
  return decodePublicCopy(summary[1]).trim();
};
const currentTopicHrefs = (topicMenu) =>
  [...topicMenu.matchAll(/<a\b(?=[^>]*\baria-current="page")(?=[^>]*\bhref="([^"]+)")[^>]*>/g)].map(
    (match) => match[1],
  );
const attributesFromTag = (tag) =>
  new Map(
    [...tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)].map((match) => [
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4],
    ]),
  );
const collectJsonStrings = (value, copy) => {
  if (typeof value === 'string') {
    copy.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, copy);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectJsonStrings(item, copy);
  }
};
const extractPublicCopy = (html) => {
  const metadata = [];
  const withoutNonCopy = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_, rawAttributes, body) => {
      const attributes = attributesFromTag(`<script ${rawAttributes}>`);
      const type = (attributes.get('type') ?? '').split(';', 1)[0].trim().toLowerCase();
      if (type === 'application/ld+json') {
        try {
          collectJsonStrings(JSON.parse(body), metadata);
        } catch {
          metadata.push(body);
        }
      }
      return ' ';
    })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ');

  for (const [tag] of withoutNonCopy.matchAll(/<[^>]+>/g)) {
    const attributes = attributesFromTag(tag);
    for (const attribute of ['alt', 'title', 'aria-label', 'placeholder']) {
      if (attributes.has(attribute)) metadata.push(attributes.get(attribute));
    }
    if (/^<meta\b/i.test(tag) && attributes.has('content')) {
      metadata.push(attributes.get('content'));
    }
  }

  const visibleText = withoutNonCopy.replace(/<[^>]*>/g, ' ');
  return decodePublicCopy([...metadata, visibleText].join(' '));
};
const controllerModules = (html) =>
  [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter(
      (script) =>
        script.includes('DOMParser') &&
        script.includes('AbortController') &&
        script.includes('800px 0px') &&
        script.includes('pagehide'),
    );

// Only Stage renders /posts/<slug>/ links, and it is always handed an
// already-filtered list — the nav links to /tag/… and section routes only.
// So a post link appearing anywhere in a page means it passed that page's
// filter, which makes these assertions exact rather than position-dependent.
const linksTo = (html, slug) => html.includes(`/posts/${slug}/`);

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// --- CHECKS ---

check('dist/ exists after build', () => {
  assert.ok(distExists('.'), 'dist/ directory not found — did you run `npm run build`?');
});

check('all content posts built successfully', () => {
  assert.equal(publishedPostIds.length, 7, 'the published edition should contain seven stories');
  for (const id of publishedPostIds) {
    assert.ok(distExists(`posts/${id}/index.html`), `posts/${id}/index.html was not built`);
  }
  // sourcePosts() performs the same cross-check internally, so a story missing
  // from the build fails every post-iterating check rather than only this one.
  assert.deepEqual(
    sourcePosts()
      .map(({ id }) => id)
      .sort(),
    [...publishedPostIds].sort(),
    'the editorial fixture should contain the published stories',
  );
});

check('public posts contain no internal fixture language', () => {
  // Prismic performs no editorial-language validation (neither the custom type
  // nor admin/validate-post.mjs screens for scaffolding copy), so this gate is
  // the only thing standing between fixture prose and a published story.
  // Scoped to each story's own <article> so it fails on the post's editorial
  // copy specifically rather than on shared nav/footer chrome. That scoping
  // makes this check's failure conditions a strict subset of the dist-wide
  // 'all generated public HTML is free of internal scaffolding language'
  // check below, which already scans every HTML file in dist/, these 7 posts
  // included — this check is real, but it adds no unique failure coverage
  // beyond what the dist-wide check already provides, only a clearer,
  // post-specific failure message when scaffolding copy slips into a story.
  for (const id of publishedPostIds) {
    const copy = extractPublicCopy(articleBody(dist(`posts/${id}/index.html`), `/posts/${id}/`));
    assert.equal(
      containsInternalScaffolding(copy),
      false,
      `/posts/${id}/ contains internal scaffolding copy`,
    );
  }
});

check('published posts disclose an editorial update date', () => {
  for (const id of publishedPostIds) {
    const html = dist(`posts/${id}/index.html`);
    assert.match(
      html,
      /"dateModified":"\d{4}-\d{2}-\d{2}T/,
      `${id} must disclose an editorial update date`,
    );

    // Parse the NewsArticle schema too, so the date is proven to be a real
    // dateModified field on the story's structured data and not an ISO string
    // that merely happens to sit next to that key somewhere on the page.
    // Select the ld+json block by its parsed @type rather than by position —
    // taking the first block on the page would silently break if another
    // JSON-LD block (e.g. BreadcrumbList) were ever emitted earlier in <head>.
    const schema = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1]))
      .find((block) => block['@type'] === 'NewsArticle' || block['@type'] === 'Article');
    assert.ok(schema, `${id} must emit Article/NewsArticle schema`);
    assert.match(
      schema.dateModified ?? '',
      /^\d{4}-\d{2}-\d{2}T/,
      `${id} schema must carry an ISO dateModified`,
    );
  }
});

check('every story carries explicit editorial format and reader context', () => {
  const config = src('src/content.config.ts');
  for (const field of ['format', 'takeaways']) {
    assert.match(config, new RegExp(`\\b${field}:`), `schema is missing ${field}`);
  }

  const validFormats = new Set(storyFormats.map(({ key }) => key));
  assert.equal(validFormats.size, 6, 'editorial format taxonomy should stay intentionally small');

  for (const id of publishedPostIds) {
    const body = articleBody(dist(`posts/${id}/index.html`), `/posts/${id}/`);
    const format = body.match(
      /<a class="label article-kicker" href="\/format\/([a-z0-9-]+)\/"/,
    )?.[1];
    assert.ok(
      format && validFormats.has(format),
      `${id} does not link a known editorial format archive from its kicker`,
    );
    assert.ok(
      body.includes('class="article-takeaways"'),
      `${id} is missing the reader takeaways block`,
    );
  }

  // The original check also guarded against four removed frontmatter fields
  // (`known:`, `openQuestions:`, `whyItMatters:`, `updates:`). Those guards are
  // deliberately dropped rather than translated to HTML: they were meaningful
  // against markdown because a hand-edited frontmatter block could accidentally
  // retain a field the schema no longer used, whereas Prismic's custom type has
  // no such fields at all, so there is no authoring path that could reintroduce
  // them and nothing for an HTML-level guard to catch.
});

check('published stories link their reference covers and official reporting sources', () => {
  // Cover images render through Astro's image optimizer, which re-hosts them
  // as locally built, hashed files — the original source URL never appears in
  // the output HTML. Asserting on the stable coverAlt text instead still
  // proves the right image rendered in the right story, without depending on
  // an implementation detail of how (or whether) it gets optimized.
  const expected = {
    [primaryPostId]: {
      coverAlt: 'Chart comparing model capability and cost across GPT-5.6 tiers',
      inlineUrls: [
        'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
        'https://openai.com/index/gpt-5-6/',
      ],
    },
    [secondaryPostId]: {
      coverAlt:
        'Graphic showing three rumored GPT-6 model tiers with different capability and price positions',
      inlineUrls: [
        'https://developers.openai.com/api/docs/models',
        'https://developers.openai.com/api/docs/guides/latest-model',
        'https://openai.com/index/gpt-5-6/',
      ],
    },
    [tertiaryPostId]: {
      coverAlt: 'Graphic labelled Claude Mythos 6 with a warning light',
      inlineUrls: [
        'https://www.anthropic.com/claude/mythos',
        'https://www.anthropic.com/project/glasswing',
        'https://www.anthropic.com/research/glasswing-initial-update?xs=1',
      ],
    },
    [quaternaryPostId]: {
      coverAlt: 'Laptop and compact control surface for supervising AI coding agents',
      inlineUrls: [
        'https://openai.com/index/introducing-the-codex-app/',
        'https://openai.com/supply/co-lab/work-louder/',
        'https://openai.com/index/codex-for-knowledge-work/',
      ],
    },
    [pricingPostId]: {
      coverAlt: 'Abstract efficiency chart falling across a dark AI hardware workstation',
      inlineUrls: [
        'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
        'https://openai.com/index/gpt-5-6/',
        'https://developers.openai.com/api/docs/models/compare',
      ],
    },
    [tutorialPostId]: {
      coverAlt:
        'Laptop showing an abstract file cleanup workspace beside a tray of sorted documents',
      inlineUrls: [
        'https://help.openai.com/en/articles/11096431',
        'https://openai.com/academy/codex-automations/',
      ],
    },
    [motionPostId]: {
      coverAlt:
        'Product page flowing into a storyboard of launch video frames on a dark studio monitor',
      inlineUrls: [
        'https://motion.so/blog/how-to-turn-a-product-launch-into-a-video',
        'https://motion.so/learn/mcp-video-generation',
        'https://motion.so/',
      ],
    },
  };

  assert.deepEqual(
    Object.keys(expected).sort(),
    [...publishedPostIds].sort(),
    'the attribution table must cover exactly the published stories',
  );

  for (const [id, attribution] of Object.entries(expected)) {
    // Scope to the story's own <article>: the surrounding page renders sidebar
    // and Suggested Reads thumbnails plus nav/footer links, so a page-wide
    // search would prove nothing about this story's own attribution.
    const body = articleBody(dist(`posts/${id}/index.html`), `/posts/${id}/`);
    assert.ok(
      body.includes(`alt="${escapeHtmlAttribute(attribution.coverAlt)}"`),
      `${id} does not render its reference cover (missing alt "${attribution.coverAlt}")`,
    );
    for (const url of attribution.inlineUrls) {
      // Exact href match, so a URL is never satisfied by a longer URL that
      // merely starts with it (e.g. …/models vs …/models/compare).
      assert.ok(
        body.includes(`href="${escapeHtmlAttribute(url)}"`),
        `${id} must link ${url} in the article copy`,
      );
    }
  }
});

check('rumor stories read as original reporting rather than source-post recaps', () => {
  for (const id of [
    secondaryPostId,
    tertiaryPostId,
    quaternaryPostId,
    pricingPostId,
    tutorialPostId,
    motionPostId,
  ]) {
    const rawBody = articleBody(dist(`posts/${id}/index.html`), `/posts/${id}/`);
    const copy = extractPublicCopy(rawBody);
    assert.doesNotMatch(
      copy,
      /\b(?:X post|tweet|screenshot|attached graphic|supplied graphic)\b/i,
      `${id} recaps a source post instead of reporting`,
    );
    assert.doesNotMatch(
      copy,
      /(?:x\.com|twitter\.com)/i,
      `${id} cites a social post as its source`,
    );
    // extractPublicCopy strips href attributes (it keeps only visible
    // text/alt/title/aria-label/meta content), so a linked citation like
    // <a href="https://x.com/someone/status/123">the leaker</a> is invisible
    // to the text-level assertion above — only a bare "x.com" appearing in
    // visible text would be caught. Scan the raw article HTML (before
    // extractPublicCopy strips hrefs) for the same pattern so a linked
    // social-post source is caught too.
    assert.doesNotMatch(
      rawBody,
      /(?:x\.com|twitter\.com)/i,
      `${id} links a social post as its source`,
    );
  }
});

check('the Terra story uses a grounded explainer structure', () => {
  const headings = articleHeadings(
    dist(`posts/${primaryPostId}/index.html`),
    `/posts/${primaryPostId}/`,
  );
  for (const heading of [
    'Terra is the middle option',
    'The tier matters less than the job',
    'What Terra gives you',
    'A fair way to test Terra',
  ]) {
    assert.ok(headings.includes(heading), `story is missing the "${heading}" heading`);
  }
  assert.ok(!headings.includes('What happened'), 'story retains the event-reporting heading');
  assert.ok(!headings.includes('Why it matters'), 'story retains the removed generic section');
});

check(
  'publication guard catches concrete scaffolding variants without rejecting source verification',
  () => {
    for (const copy of [
      'This is a placeholder.',
      'This fixture verifies the route.',
      'This article validates the /trackers/ route.',
      'This is test data for the homepage.',
      'Draft copy for SEO.',
      'This post checks the Content Collections schema.',
      'This article is used only to verify the /trackers/ route.',
      'This post is used to populate the homepage Trackers band.',
      'This comparison is used to exercise the facts-table block.',
      'Copy that validates route filtering and homepage ordering.',
      'Internal test-fixture commentary for the listing.',
      'This post exists for regression testing.',
      'The /trackers/ route filters posts by type.',
      'SEO scaffolding for a temporary article.',
      "The filter checks postType === 'tracker'.",
      'Placeholder evergreen comparison.',
    ]) {
      assert.equal(containsInternalScaffolding(copy), true, `guard missed: ${copy}`);
    }
    assert.equal(
      containsInternalScaffolding(
        'The archive was used to verify a source quotation and build a reliable timeline.',
      ),
      false,
      'ordinary source-verification prose must remain publishable',
    );
    for (const copy of [
      'The API validates signed requests before routing them by region.',
      'The research paper reports results from a held-out test set.',
      'SEO can help readers discover accurate product documentation.',
      'Placeholder text is replaced after loading.',
      'The camera became a permanent fixture in the lab.',
    ]) {
      assert.equal(
        containsInternalScaffolding(copy),
        false,
        `guard rejected editorial copy: ${copy}`,
      );
    }
  },
);

check('public copy extraction includes visible metadata and excludes non-copy markup', () => {
  const copy = extractPublicCopy(`
    <!-- Comment test fixture -->
    <meta name="description" content="Reader-facing summary">
    <meta property="og:title" content="Social headline">
    <script type="application/ld+json">
      {"headline":"Structured headline","author":{"name":"Structured author"}}
    </script>
    <script>const note = 'Script test fixture';</script>
    <style>.testing-scaffolding { display: none; }</style>
    <img class="fixture-post" data-copy="Implementation scaffolding" alt="Cover explanation" title="Expanded image title">
    <button aria-label="Open topics">Visible label</button>
    <input type="search" placeholder="Search stories">
  `);

  for (const expected of [
    'Reader-facing summary',
    'Social headline',
    'Structured headline',
    'Structured author',
    'Cover explanation',
    'Expanded image title',
    'Open topics',
    'Visible label',
    'Search stories',
  ]) {
    assert.ok(copy.includes(expected), `public copy omitted: ${expected}`);
  }
  for (const excluded of [
    'Comment test fixture',
    'Script test fixture',
    'testing-scaffolding',
    'fixture-post',
    'Implementation scaffolding',
  ]) {
    assert.ok(!copy.includes(excluded), `public copy included non-reader text: ${excluded}`);
  }

  assert.equal(
    containsInternalScaffolding(
      extractPublicCopy('<meta name="description" content="Placeholder fixture post">'),
    ),
    true,
    'reader-visible metadata must pass through the publication guard',
  );
  assert.equal(
    containsInternalScaffolding(
      extractPublicCopy(
        '<script type="application/ld+json">{"headline":"Placeholder fixture post"}</script>',
      ),
    ),
    true,
    'JSON-LD metadata must pass through the publication guard',
  );
  assert.equal(
    containsInternalScaffolding(
      extractPublicCopy('<input placeholder="Placeholder fixture post">'),
    ),
    true,
    'form placeholder copy must pass through the publication guard',
  );
  assert.equal(
    containsInternalScaffolding(
      extractPublicCopy(`
      <script>const headline = 'Placeholder fixture post';</script>
      <style>.placeholder-fixture { display: none; }</style>
    `),
    ),
    false,
    'executable JavaScript and CSS must stay outside the publication guard',
  );
});

check('all generated public HTML is free of internal scaffolding language', () => {
  const htmlFiles = filesUnder(new URL('../dist/', import.meta.url)).filter((file) =>
    file.pathname.endsWith('.html'),
  );
  const paths = htmlFiles.map((file) => file.pathname);

  assert.ok(
    paths.some((path) => path.endsWith('/dist/index.html')),
    'homepage HTML was not scanned',
  );
  assert.ok(
    paths.some((path) => path.includes('/dist/authors/')),
    'author HTML was not scanned',
  );
  assert.ok(
    paths.some((path) => path.includes('/dist/posts/') && path.endsWith('/index.html')),
    'standalone post HTML was not scanned',
  );
  assert.ok(
    paths.some((path) => path.includes('/fragment/')),
    'fragment HTML was not scanned',
  );

  for (const file of htmlFiles) {
    assert.equal(
      containsInternalScaffolding(extractPublicCopy(readFileSync(file, 'utf-8'))),
      false,
      `${file.pathname} renders internal scaffolding copy`,
    );
  }
});

check('continuous reading order is deterministic and stops at the oldest post', () => {
  const fixtures = [
    { id: 'beta', data: { pubDate: new Date('2026-01-02') } },
    { id: 'alpha', data: { pubDate: new Date('2026-01-02') } },
    { id: 'oldest', data: { pubDate: new Date('2026-01-01') } },
  ];
  assert.deepEqual(
    sortPostsNewestFirst(fixtures).map((post) => post.id),
    ['alpha', 'beta', 'oldest'],
  );
  assert.equal(getNextOlderPost('alpha', fixtures)?.id, 'beta');
  assert.equal(getNextOlderPost('beta', fixtures)?.id, 'oldest');
  assert.equal(getNextOlderPost('oldest', fixtures), undefined);
  assert.equal(getNextOlderPost('missing', fixtures), undefined);
  assert.equal(getPreviousNewerPost('oldest', fixtures)?.id, 'beta');
  assert.equal(getPreviousNewerPost('beta', fixtures)?.id, 'alpha');
  assert.equal(getPreviousNewerPost('alpha', fixtures), undefined);
  assert.equal(getPreviousNewerPost('missing', fixtures), undefined);
});

check('article fragments are canonical noindex documents with one append-safe story', () => {
  for (const { id } of sourcePosts()) {
    const html = dist(`posts/${id}/fragment/index.html`);
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="https://aipresshq\\.com/posts/${id}/">`),
    );
    assert.equal((html.match(/data-continuous-article/g) || []).length, 1);
    assert.match(html, new RegExp(`data-post-id="${id}"`));
    assert.match(html, new RegExp(`data-post-url="/posts/${id}/"`));
    assert.match(html, /data-document-title=/);
    assert.ok(
      html.includes('class="article-layout"'),
      'fragment must use the shared article layout',
    );
    assert.ok(
      html.includes('class="article-sidebar"'),
      'fragment must use the shared article sidebar',
    );
    assert.ok(
      html.includes('class="article-outline"'),
      'fragment must use the shared left article outline',
    );
    assert.ok(!html.includes('class="site-header"'), 'fragment duplicated the global header');
    assert.ok(!html.includes('class="site-footer"'), 'fragment duplicated the footer');
    assert.ok(!html.includes('application/ld+json'), 'fragment duplicated article schema');
    assert.ok(!html.includes('data-continuous-stream'), 'fragment nested another controller');
  }
});

check('sitemap publishes standalone posts without article fragments', () => {
  const sitemapFiles = readdirSync(new URL('../dist/', import.meta.url)).filter((file) =>
    /^sitemap-\d+\.xml$/.test(file),
  );
  assert.ok(sitemapFiles.length > 0, 'no generated sitemap files found');

  const sitemap = sitemapFiles.map((file) => dist(file)).join('\n');
  assert.ok(!sitemap.includes('/fragment/'), 'sitemap included a noncanonical article fragment');

  for (const { id } of sourcePosts()) {
    assert.ok(
      sitemap.includes(`<loc>https://aipresshq.com/posts/${id}/</loc>`),
      `sitemap omitted standalone article /posts/${id}/`,
    );
  }
});

check('standalone articles expose reading status and stop at the oldest story', () => {
  const newest = dist(`posts/${quaternaryPostId}/index.html`);
  assert.match(newest, /data-continuous-stream/);
  assert.ok(newest.includes('class="continuous-transition"'));
  assert.ok(newest.includes('class="continuous-next-link"'));
  assert.ok(newest.includes('class="continuous-sentinel"'));
  assert.match(newest, /class="continuous-status"[^>]*aria-live="polite"/);

  const middle = dist(`posts/${tertiaryPostId}/index.html`);
  assert.ok(middle.includes('class="continuous-transition"'));
  assert.ok(middle.includes('class="continuous-next-link"'));
  assert.ok(middle.includes('class="continuous-sentinel"'));

  const oldest = dist(`posts/${secondaryPostId}/index.html`);
  assert.ok(!oldest.includes('class="continuous-transition"'));
  assert.ok(!oldest.includes('class="continuous-next-link"'));
  assert.ok(!oldest.includes('class="continuous-sentinel"'));

  const built = sourcePosts().map(({ id }) => dist(`posts/${id}/index.html`));
  assert.equal(
    built.filter((html) => /class="continuous-next-link"/.test(html)).length,
    sourcePosts().length - 1,
  );
});

check('continuous reader loads one fragment at a time and preserves navigation fallback', () => {
  const controller = src('src/scripts/continuous-reader.ts');
  assert.match(controller, /rootMargin:\s*['"]800px 0px['"]/);
  assert.match(controller, /new Set/);
  assert.match(controller, /DOMParser/);
  assert.match(controller, /data-continuous-article/);
  assert.match(controller, /history\.replaceState/);
  assert.ok(!controller.includes('history.pushState'));
  assert.match(controller, /aria-busy/);
  assert.match(controller, /AbortController/);
  assert.match(controller, /pagehide/);
  assert.match(controller, /failed/);

  for (const { id } of sourcePosts()) {
    const html = dist(`posts/${id}/index.html`);
    const hasNextStory = /class="continuous-next-link"/.test(html);
    assert.equal(
      controllerModules(html).length,
      hasNextStory ? 1 : 0,
      `${id} must emit one controller module exactly when it has a next story`,
    );
  }

  for (const { id } of sourcePosts()) {
    assert.equal(controllerModules(dist(`posts/${id}/fragment/index.html`)).length, 0);
  }
});

check('continuous reader lifecycle and terminal states reject queued loading work', () => {
  assert.equal(
    canStartContinuousLoad('/fragment/', {
      loading: false,
      failed: false,
      cleanedUp: false,
      terminal: false,
    }),
    true,
  );

  for (const blockedState of [
    { loading: true, failed: false, cleanedUp: false, terminal: false },
    { loading: false, failed: true, cleanedUp: false, terminal: false },
    { loading: false, failed: false, cleanedUp: true, terminal: false },
    { loading: false, failed: false, cleanedUp: false, terminal: true },
  ]) {
    assert.equal(canStartContinuousLoad('/fragment/', blockedState), false);
  }
  assert.equal(
    canStartContinuousLoad('', {
      loading: false,
      failed: false,
      cleanedUp: false,
      terminal: false,
    }),
    false,
  );

  const controller = src('src/scripts/continuous-reader.ts');
  assert.match(controller, /sentinelObserver\.takeRecords\(\)/);
  assert.match(controller, /delete sentinel\.dataset\.nextFragment/);
});

check(
  'persisted page transitions preserve and restore the continuous reader before terminal cleanup',
  () => {
    const calls = [];
    let loadingArmed = true;
    let historyTrackingArmed = true;
    const actions = {
      restore() {
        calls.push('restore');
        loadingArmed = true;
        historyTrackingArmed = true;
      },
      cleanup() {
        calls.push('cleanup');
        loadingArmed = false;
        historyTrackingArmed = false;
      },
    };

    handleContinuousReaderPageTransition('pagehide', true, actions);
    assert.deepEqual(calls, []);
    assert.equal(loadingArmed, true);
    assert.equal(historyTrackingArmed, true);

    handleContinuousReaderPageTransition('pageshow', true, actions);
    assert.deepEqual(calls, ['restore']);
    assert.equal(loadingArmed, true);
    assert.equal(historyTrackingArmed, true);

    handleContinuousReaderPageTransition('pageshow', false, actions);
    assert.deepEqual(calls, ['restore']);

    handleContinuousReaderPageTransition('pagehide', false, actions);
    assert.deepEqual(calls, ['restore', 'cleanup']);
    assert.equal(loadingArmed, false);
    assert.equal(historyTrackingArmed, false);
  },
);

check(
  'fragment candidate validation accepts one complete article and rejects malformed responses',
  () => {
    const article = { marker: 'valid article' };
    const valid = {
      article,
      postId: 'valid-post',
      postUrl: '/posts/valid-post/',
      documentTitle: 'Valid post - aiPressHQ',
    };

    assert.equal(validateArticleFragmentCandidates([valid]), article);
    assert.equal(validateArticleFragmentCandidates([valid, { ...valid }]), undefined);

    for (const field of ['postId', 'postUrl', 'documentTitle']) {
      assert.equal(
        validateArticleFragmentCandidates([{ ...valid, [field]: '   ' }]),
        undefined,
        `candidate missing ${field} must be rejected`,
      );
    }
  },
);

check('posts resolve validated author profiles into linked bylines and schema', () => {
  const config = src('src/content.config.ts');
  assert.match(config, /const authors = defineCollection/);
  assert.match(config, /author:\s*reference\(['"]authors['"]\)/);

  // Capture the byline element itself and require the author name inside it.
  // Testing `hasByline && page.includes(name)` independently would pass on a
  // page whose byline is empty but that mentions the author anywhere else —
  // every post page links "Tejas Telkar" from its author module and Suggested
  // Reads, so that form of the check could never fail.
  for (const id of publishedPostIds) {
    const html = dist(`posts/${id}/index.html`);
    const byline = html.match(/<a\b[^>]*class="byline(?:\s[^"]*)?"[^>]*>[\s\S]*?<\/a>/);
    assert.ok(byline, `${id} must have an author byline`);
    assert.ok(
      byline[0].includes('Tejas Telkar'),
      `${id} byline must name its resolved author profile`,
    );
    assert.match(
      byline[0],
      /href="\/authors\/tejas-telkar\/"/,
      `${id} byline must link its resolved author profile`,
    );
  }

  const html = dist(`posts/${primaryPostId}/index.html`);
  assert.match(html, /class="byline(?:\s[^"]*)?"[^>]*href="\/authors\/tejas-telkar\//);
  assert.ok(html.includes('Tejas Telkar'));
  assert.ok(html.includes('Writer and editor'));

  const schema = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]))
    .find((block) => block['@type'] === 'NewsArticle' || block['@type'] === 'Article');
  assert.ok(schema, 'no Article/NewsArticle JSON-LD block found');
  assert.equal(schema.author[0].name, 'Tejas Telkar');
  assert.equal(schema.author[0].url, 'https://aipresshq.com/authors/tejas-telkar/');
});

check('post listings resolve author references into display names', () => {
  for (const component of ['src/components/Stage.astro']) {
    assert.match(src(component), /getEntry/, `${component} must resolve author references`);
  }

  const home = dist('index.html');
  const hero = home.slice(
    home.indexOf('class="hero"'),
    home.indexOf('</section>', home.indexOf('class="hero"')),
  );
  assert.ok(hero.includes('By Tejas Telkar'), 'hero byline should use the author profile name');
  assert.ok(!home.includes('class="newsroom-section'), 'empty newsroom section should be hidden');
  assert.ok(!home.includes('[object Object]'), 'homepage leaked an unresolved author reference');

  const article = dist(`posts/${primaryPostId}/index.html`);
  const latest = article.slice(
    article.indexOf('class="article-sidebar"'),
    article.indexOf('</aside>', article.indexOf('class="article-sidebar"')),
  );
  assert.ok(
    !latest.includes('[object Object]'),
    'Latest rail leaked an unresolved author reference',
  );
});

check('author lookups normalize string and object references before resolving', () => {
  const helper = src('src/lib/author-reference.ts');
  assert.match(helper, /typeof reference === ['"]string['"]/);
  assert.match(helper, /reference\.id/);
  assert.equal(getAuthorId('tejas-telkar'), 'tejas-telkar');
  assert.equal(getAuthorId({ collection: 'authors', id: 'tejas-telkar' }), 'tejas-telkar');
  assert.equal(getAuthorId({ collection: 'authors', slug: 'tejas-telkar' }), 'tejas-telkar');

  for (const component of [
    'src/components/Stage.astro',
    'src/pages/posts/[id].astro',
    'src/pages/posts/[id]/fragment.astro',
    'src/pages/authors/[author].astro',
  ]) {
    assert.match(
      src(component),
      /getAuthorId\(/,
      `${component} must normalize the author reference`,
    );
  }
});

check('author resolution errors identify the post and missing author slug', () => {
  for (const file of ['src/pages/posts/[id].astro', 'src/components/Stage.astro']) {
    assert.match(
      src(file),
      /Missing author profile for post: \$\{(?:post|currentPost)\.id\} \(author: \$\{authorId\}\)/,
      `${file} must include the post ID and missing author slug in its resolution error`,
    );
  }
});

check('global.css defines the theme tokens and required classes, with no accent colour', () => {
  const css = sourceStyles();
  // The site is monochrome only — no accent token should exist anywhere to
  // reintroduce a colour by accident.
  assert.ok(!/--accent(-ink)?:/.test(css), 'an accent colour token was reintroduced');
  assert.match(css, /:root\s*\{[\s\S]*?--bg:\s*#ffffff/i, 'light background token missing');
  assert.match(
    css,
    /:root\[data-theme=['"]dark['"]\]\s*\{[\s\S]*?--bg:\s*#0a0a0a/i,
    'dark background token missing',
  );
  for (const cls of [
    '.frame',
    '.site-header',
    '.masthead-mark',
    '.primary-bar',
    '.hero',
    '.hero-picks',
    '.hero-lead',
    '.hero-lead-headline',
    '.hero-just-in',
    '.theme-toggle',
    '.newsroom-section',
    '.category-front',
    '.category-featured',
    '.article-bookmark',
    '.saved-menu',
  ]) {
    assert.ok(css.includes(cls), `missing class ${cls}`);
  }
  const header = css.match(/\.site-header\s*\{([\s\S]*?)\n\}/);
  assert.match(header[1], /border-top:\s*4px solid var\(--text\)/, 'header ink rule is missing');
  const responsiveImage = css.match(/\.responsive-image\s*\{([\s\S]*?)\n\}/);
  assert.ok(responsiveImage, 'shared responsive image rule is missing');
  assert.match(
    responsiveImage[1],
    /height:\s*auto/,
    'shared images must honor layout aspect ratios',
  );
});

check('layout is full width — no max-width cap or raised frame card', () => {
  const css = sourceStyles();
  const frame = css.match(/\.frame\s*\{([\s\S]*?)\n\}/);
  assert.ok(frame, 'missing .frame rule block');
  assert.ok(!/max-width/.test(frame[1]), '.frame must not cap the layout width');
  assert.ok(!/background/.test(frame[1]), '.frame must not paint a card background');
  assert.ok(!/border-radius/.test(frame[1]), '.frame must not round into a card');
});

check('the explicit theme palette defines light and dark tokens', () => {
  const css = sourceStyles();
  const light = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = css.match(/:root\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(light && dark, 'missing explicit theme blocks');
  assert.match(light[1], /--mark:\s*var\(--text\)/, 'light mode should keep labels neutral');
  assert.match(
    light[1],
    /--band-bg:\s*#ffffff/i,
    'light mode header should use a white background',
  );
  assert.match(light[1], /--band-ink:\s*#0a0a0a/i, 'light mode header should use black text');
  assert.match(dark[1], /--bg:\s*#0a0a0a/i, 'dark mode does not set a dark background');
  assert.match(dark[1], /--text:\s*#ffffff/i, 'dark mode does not set white body text');
  assert.match(dark[1], /--band-bg:\s*#0a0a0a/i, 'dark mode header should use a black background');
  assert.match(dark[1], /--band-ink:\s*#ffffff/i, 'dark mode header should use white text');
  // Dark mode must not override --mark at all: it falls through to the
  // :root definition (var(--text)), so it can never silently resolve to a
  // colour again the way it once did when it pointed at --accent.
  assert.ok(
    !/--mark\s*:/.test(dark[1]),
    'dark mode should not redefine --mark — it must inherit the neutral :root value',
  );
});

check('article focus rings and Suggested Reads follow the active theme', () => {
  const css = sourceStyles();
  const bylineFocus = css.match(/a\.byline:focus-visible\s*\{([\s\S]*?)\n\}/);
  const suggestedStory = css.match(/\.suggested-story\s*\{([\s\S]*?)\n\}/);
  const suggestedTag = css.match(/\.suggested-story-tag\s*\{([\s\S]*?)\n\}/);
  const suggestedMeta = css.match(/\.suggested-story-meta\s*\{([\s\S]*?)\n\}/);
  const suggestedFocus = css.match(/\.suggested-story:focus-visible\s*\{([\s\S]*?)\n\}/);

  assert.match(
    bylineFocus[1],
    /outline:\s*2px solid var\(--mark\)/,
    'byline focus must use the theme-aware mark',
  );
  assert.match(suggestedStory[1], /background:\s*var\(--card-bg\)/);
  assert.match(suggestedStory[1], /color:\s*var\(--text\)/);
  assert.match(suggestedTag[1], /color:\s*var\(--text-muted\)/);
  assert.match(suggestedMeta[1], /color:\s*var\(--text-muted\)/);
  assert.ok(!/background:\s*#0a0a0a/.test(suggestedStory[1]));
  assert.match(
    suggestedFocus[1],
    /outline:\s*2px solid var\(--mark\)/,
    'suggested-story focus must use the theme-aware mark',
  );
});

check('preformatted story content is copy-ready without changing other rich text blocks', () => {
  const { html } = serializeBodyWithHeadings([
    {
      type: 'preformatted',
      text: 'PROMPT="Summarize this"\nrun --safe',
      spans: [],
      direction: 'ltr',
    },
  ]);
  assert.match(html, /<pre data-code-block>/, 'preformatted blocks need a stable code hook');
  assert.ok(html.includes('PROMPT=&quot;Summarize this&quot;'));
  assert.ok(html.includes('\nrun --safe'), 'code line breaks must remain copyable');

  const layout = src('src/layouts/BaseLayout.astro');
  const copyScript = src('src/scripts/code-copy.ts');
  const css = sourceStyles();
  assert.match(layout, /\.\.\/scripts\/code-copy/);
  assert.match(copyScript, /data-code-copy/);
  assert.match(copyScript, /navigator\.clipboard/);
  assert.match(copyScript, /MutationObserver/);
  assert.match(css, /\.code-block\s*\{/);
  assert.match(css, /\.code-copy-button\s*\{/);
  assert.match(css, /\.prose pre\[data-code-block\]/);
  assert.match(css, /background:\s*var\(--surface\)/);
});

check('headlines and the aiPressHQ wordmark use the intended bundled faces', () => {
  const css = sourceStyles();
  const displayVar = css.match(/--font-display:\s*([^;]+);/);
  const brandBlock = css.match(/\.brand-mark\s*\{([\s\S]*?)\n\}/);
  assert.ok(displayVar, 'missing --font-display token');
  assert.ok(brandBlock, 'missing .brand-mark rule');
  assert.match(displayVar[1], /Source Serif 4/, 'display font should be the serif face');
  assert.match(
    brandBlock[1],
    /font-family:\s*var\(--font-body\)/,
    'wordmark should use the bundled body face',
  );

  // The whole point of the swap: no page should still import or reference
  // the old face, in the font stack or as a leftover package import.
  assert.ok(
    !displayVar[1].includes('Playfair'),
    'Playfair Display should be fully replaced, not just deprioritised in the stack',
  );
  const layoutSrc = src('src/layouts/BaseLayout.astro');
  assert.ok(
    !layoutSrc.includes('playfair-display'),
    'BaseLayout still imports the old font package',
  );
  assert.ok(
    layoutSrc.includes("'@fontsource/source-serif-4'"),
    'BaseLayout should import the new font package',
  );

  assert.ok(!css.includes('--font-masthead'), 'the old masthead font token should be removed');
  assert.match(brandBlock[1], /font-weight:\s*900/, 'wordmark should use a bold editorial weight');

  const leadBlock = css.match(/\.hero-lead-headline\s*\{([\s\S]*?)\n\}/);
  assert.ok(leadBlock, 'missing .hero-lead-headline rule block');
  assert.match(
    leadBlock[1],
    /font-family:\s*var\(--font-display\)/,
    'lead headline is not set in the display serif',
  );
});

check(
  'homepage renders the shell: masthead, dateline, nav, and no persistent subscribe button',
  () => {
    const html = dist('index.html');
    assert.match(html, /<title>aiPressHQ \| Daily AI News<\/title>/);
    assert.ok(html.includes('class="masthead-mark"'), 'masthead not rendered');
    assert.ok(html.includes('class="brand-mark"'), 'shared aiPressHQ mark not rendered');
    assert.ok(
      html.includes('aria-label="aiPressHQ home"'),
      'masthead does not expose the aiPressHQ home label',
    );
    assert.ok(html.includes('class="edition-date"'), 'edition dateline not rendered');
    assert.ok(html.includes('class="primary-bar"'), 'primary bar not rendered');
    assert.ok(html.includes('data-theme-toggle'), 'theme toggle not rendered');
    assert.ok(html.includes('class="search-box"'), 'inline search box not rendered');
    assert.ok(
      !html.includes('<details class="menu">'),
      'the removed Menu disclosure should not be rendered',
    );
    assert.ok(
      !html.includes('<dialog class="search-dialog"'),
      'search should not render a full-screen dialog',
    );
    // The masthead, nav, and actions all live on the primary bar now (the
    // <header> above it is just the thin dateline strip).
    const barStart = html.indexOf('<nav class="primary-bar"');
    const bar = html.slice(barStart, html.indexOf('</nav>', barStart));
    assert.ok(
      !bar.includes('subscribe-button'),
      'primary bar should not render a subscribe button',
    );
  },
);

check('the approved aiPressHQ logo and favicon assets are wired across the shell', () => {
  const html = dist('index.html');
  const css = sourceStyles();
  const manifest = JSON.parse(dist('site.webmanifest'));
  const assetPaths = [
    'brand/aipresshq-logo-light.png',
    'brand/aipresshq-logo-dark.png',
    'brand/aipresshq-favicon-light.png',
    'brand/aipresshq-favicon-dark.png',
    'favicon-light.svg',
    'favicon-dark.svg',
    'favicon.svg',
    'favicon.ico',
    'apple-touch-icon.png',
  ];

  for (const asset of assetPaths) {
    assert.ok(distExists(asset), `missing published brand asset: ${asset}`);
  }

  assert.match(html, /data-theme-favicon/);
  assert.match(html, /data-theme-favicon-svg/);
  assert.match(html, /href="\/site\.webmanifest"/);
  // Rendered via astro:assets now (optimized WebP, hashed filename), not the
  // raw PNG at a fixed path. The raw wordmark PNGs are still published
  // (checked via assetPaths above) as the brand source of truth, but nothing
  // in the deploy points at them any more: og:image/twitter:image use the
  // dedicated 1200x630 /brand/aipresshq-og-default.png, and schema plus the
  // web manifest use the square favicon PNGs.
  assert.match(html, /_astro\/aipresshq-logo-light\.[\w-]+\.webp/);
  assert.match(html, /_astro\/aipresshq-logo-dark\.[\w-]+\.webp/);
  assert.match(html, /aipresshq-favicon-dark\.png\?v=5/);
  assert.match(html, /favicon-dark\.svg\?v=5/);
  assert.match(css, /\.footer-wordmark \.brand-logo-dark\s*\{[\s\S]*?display:\s*block/);
  assert.match(
    css,
    /html\[data-theme=['"]dark['"]\] \.footer-wordmark \.brand-logo-light\s*\{[\s\S]*?display:\s*block/,
  );
  assert.equal(manifest.name, 'aiPressHQ');
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })),
    [
      {
        src: '/brand/aipresshq-favicon-light.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/brand/aipresshq-favicon-dark.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  );
});

check('the default social preview image is sized for the cards that consume it', () => {
  const html = dist('index.html');

  // twitter:card="summary_large_image" only accepts aspect ratios between 2:1
  // and 1:1, and Facebook/LinkedIn/Slack hard-crop anything wider. The old
  // fallback was the raw wordmark at 1333x296 (4.5:1), which failed both.
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
  assert.match(html, /<meta property="og:image" content="[^"]*\/brand\/aipresshq-og-default\.png"/);
  assert.match(
    html,
    /<meta name="twitter:image" content="[^"]*\/brand\/aipresshq-og-default\.png"/,
  );
  assert.ok(distExists('brand/aipresshq-og-default.png'), 'missing default OG image');

  // Guard the dimensions, not just the path: a re-export at the wrong size
  // would keep every assertion above passing while breaking the cards.
  const png = distBuffer('brand/aipresshq-og-default.png');
  assert.equal(png.readUInt32BE(8 + 8), 1200, 'OG image width should be 1200');
  assert.equal(png.readUInt32BE(8 + 12), 630, 'OG image height should be 630');

  // Articles pass their own cover, so the fallback must not leak onto them.
  const article = dist('posts/gpt-5-6-terra/index.html');
  assert.ok(
    !article.includes('aipresshq-og-default.png'),
    'article pages should use their own cover as og:image, not the site default',
  );
});

check('header search stays inline and renders a local results dropdown', () => {
  const html = dist('index.html');
  assert.ok(html.includes('data-search-box'), 'search box hook missing');
  assert.ok(
    html.includes('aria-controls="search-results"'),
    'search input should point to its local results list',
  );
  assert.ok(html.includes('role="listbox"'), 'search results should expose a listbox role');
  assert.ok(
    !html.includes('data-search-dialog'),
    'old full-screen search dialog hook is still rendered',
  );

  const css = sourceStyles();
  const box = css.match(/\.search-box\s*\{([\s\S]*?)\n\}/);
  const results = css.match(/\.search-results\s*\{([\s\S]*?)\n\}/);
  assert.ok(box && results, 'search dropdown styles are missing');
  assert.match(
    box[1],
    /width:\s*min\(420px,\s*34vw\)/,
    'search box should be wider than the old compact trigger',
  );
  assert.match(
    results[1],
    /position:\s*absolute/,
    'search results should be anchored below the field',
  );
  assert.doesNotMatch(
    results[1],
    /box-shadow:\s*10px\s+10px\s+0\s+var\(--surface\)/,
    'search results should not render the grey offset backdrop',
  );
  assert.match(results[1], /box-shadow:\s*0\s+16px\s+34px/);
  assert.doesNotMatch(
    css,
    /\.search-dialog\s*\{/,
    'full-screen search dialog styles should be removed',
  );
});

check('search results support keyboard selection and activation', () => {
  const html = dist('index.html');
  const search = src('src/scripts/search.ts');
  const css = sourceStyles();

  assert.match(html, /aria-autocomplete="list"/, 'search input should advertise list autocomplete');
  assert.match(search, /ArrowDown/, 'search should handle ArrowDown');
  assert.match(search, /ArrowUp/, 'search should handle ArrowUp');
  assert.match(
    search,
    /aria-activedescendant/,
    'search should expose the active result to assistive technology',
  );
  assert.match(search, /aria-selected/, 'rendered results should expose selection state');
  assert.match(
    search,
    /resultLinks\[activeIndex\]\?\.click\(\)/,
    'Enter should activate the selected result',
  );
  assert.match(
    css,
    /\.search-result\.is-active/,
    'keyboard-selected results need a visible active state',
  );
});

check('primary bar separates primary sections from a native categories disclosure', () => {
  // /latest/, not the homepage: "Latest" is its own dedicated page now, and
  // the homepage is a distinct front page tied to no single nav tab.
  const html = dist('latest/index.html');
  const navStart = html.indexOf('class="primary-bar"');
  const nav = html.slice(navStart, html.indexOf('</nav>', navStart));
  const sectionLinks = nav.slice(nav.indexOf('class="section-links"'), nav.indexOf('</div>'));
  const topicMenu = nav.slice(nav.indexOf('<details class="category-menu">'));
  const topicPanel = topicMenu.slice(topicMenu.indexOf('class="category-menu-panel"'));

  assert.match(
    sectionLinks,
    /href="\/latest\/"[^>]*aria-current="page"/,
    'Latest should expose the current page on /latest/',
  );
  assert.ok(sectionLinks.includes('href="/trending/"'));
  assert.equal(
    (sectionLinks.match(/<a\b/g) || []).length,
    3,
    'only primary sections belong in .section-links',
  );
  assert.ok(
    !sectionLinks.includes('href="/trackers/"'),
    'Trackers should not appear in the primary header sections',
  );
  assert.ok(
    sectionLinks.includes('href="/tag/tutorials/"'),
    'Tutorials should be a primary header section',
  );
  assert.ok(
    topicMenu.startsWith('<details class="category-menu">'),
    'Categories should use a native <details> disclosure',
  );
  assert.match(
    topicMenu,
    /<summary[^>]*>[\s\S]*?Categories[\s\S]*?<\/summary>/,
    '/latest/ disclosure should be labelled Categories',
  );
  assert.ok(
    topicPanel.includes('Browse categories'),
    'category panel needs an editorial index heading',
  );

  for (const { href } of sourceTopics()) {
    assert.ok(topicPanel.includes(`href="${href}"`), `category panel is missing ${href}`);
  }
  assert.ok(
    !sectionLinks.includes('/tag/openai/'),
    'category links must not be flattened into the primary section list',
  );
});

check('categories dropdown remains scrollable within the viewport', () => {
  const css = sourceStyles();
  const panel = css.match(/\.category-menu-panel\s*\{([\s\S]*?)\n\}/);
  assert.ok(panel, 'category panel styles are missing');
  assert.match(panel[1], /max-height:\s*min\(720px,\s*calc\(100svh\s*-\s*104px\)\)/);
  assert.match(panel[1], /overflow-y:\s*auto/);
  assert.match(panel[1], /overscroll-behavior:\s*contain/);

  const fixedPanel = css.match(
    /html\[data-navigation-ready='true'\]\s+\.category-menu-panel\s*\{([\s\S]*?)\n\}/,
  );
  assert.ok(fixedPanel, 'enhanced category panel styles are missing');
  assert.match(fixedPanel[1], /position:\s*fixed/);
  assert.match(fixedPanel[1], /height:\s*calc\(100dvh\s*-\s*var\(--category-menu-top/);
  assert.match(fixedPanel[1], /overflow-y:\s*scroll/);

  const navigation = src('src/scripts/navigation.ts');
  assert.match(navigation, /getBoundingClientRect/);
  assert.match(navigation, /categoryMenu\.addEventListener\(['"]toggle['"]/);
  assert.match(navigation, /data-navigation-ready/);
});

check('homepage is a distinct front page, tied to no single nav tab', () => {
  const html = dist('index.html');
  const navStart = html.indexOf('class="primary-bar"');
  const nav = html.slice(navStart, html.indexOf('</nav>', navStart));
  const sectionLinks = nav.slice(nav.indexOf('class="section-links"'), nav.indexOf('</div>'));
  assert.ok(
    !sectionLinks.includes('aria-current="page"'),
    'homepage should not mark Latest/Trending/Trackers as current — it is its own front page',
  );
});

check('article pages render generic Categories without a route-current category', () => {
  for (const { id } of sourcePosts()) {
    const topicMenu = topicMenuFrom(dist(`posts/${id}/index.html`));
    assert.equal(
      topicSummaryLabel(topicMenu),
      'Categories',
      `/posts/${id}/ should use the generic Categories label`,
    );
    assert.deepEqual(
      currentTopicHrefs(topicMenu),
      [],
      `/posts/${id}/ must not mark a topic route as current`,
    );
  }
});

check('general pages render generic Categories without a route-current category', () => {
  const authorIds = filesUnder(new URL('../src/content/authors/', import.meta.url))
    .filter((file) => file.pathname.endsWith('.md'))
    .map((file) => decodeURIComponent(file.pathname.split('/').pop()).replace(/\.md$/, ''));
  const paths = ['index.html', 'trending/index.html', 'trackers/index.html'].concat(
    authorIds.map((id) => `authors/${id}/index.html`),
  );

  for (const path of paths) {
    const topicMenu = topicMenuFrom(dist(path));
    assert.equal(
      topicSummaryLabel(topicMenu),
      'Categories',
      `${path} should use the generic Categories label`,
    );
    assert.deepEqual(
      currentTopicHrefs(topicMenu),
      [],
      `${path} must not mark a topic route as current`,
    );
  }
});

check('every content-derived tag page labels and marks its own topic current', () => {
  for (const { href } of sourceTopics()) {
    const topicMenu = topicMenuFrom(dist(`${href.slice(1)}index.html`));

    assert.equal(
      topicSummaryLabel(topicMenu),
      'Categories',
      `${href} should use the generic Categories label`,
    );
    assert.deepEqual(
      currentTopicHrefs(topicMenu),
      [href],
      `${href} should mark only itself current`,
    );
  }
});

check(
  'category dropdown is grouped into a canonical taxonomy, not a flat post-derived list',
  () => {
    const html = dist('index.html');
    const topicMenu = topicMenuFrom(html);
    const topicPanel = topicMenu.slice(topicMenu.indexOf('class="category-menu-panel"'));

    for (const group of topicGroups) {
      assert.ok(
        topicPanel.includes(`<h3>${group.label}</h3>`),
        `category panel is missing the "${group.label}" group heading`,
      );
      for (const tag of group.topics) {
        assert.ok(
          topicPanel.includes(`href="/tag/${slugify(tag)}/"`),
          `"${group.label}" group is missing its "${tag}" topic`,
        );
      }
    }

    // Trackers is a section (postType-driven), not a topic — keeping both
    // would reintroduce the exact overlap the categories bar redesign removed.
    assert.ok(
      !knownTopics.includes('Trackers'),
      'Trackers should not be part of the topic taxonomy',
    );
  },
);

check('the Tutorials topic gets a page with its tutorial story', () => {
  assert.ok(
    distExists('tag/tutorials/index.html'),
    '/tag/tutorials/ was not built even though Tutorials is a canonical topic',
  );
  const html = dist('tag/tutorials/index.html');
  assert.ok(
    !html.includes('No stories tagged Tutorials yet.'),
    'Tutorials category should not show an empty state once a tutorial is published',
  );
  assert.ok(linksTo(html, tutorialPostId), 'Tutorials category should list the cleanup tutorial');
});

check('category pages separate featured stories from latest updates', () => {
  for (const path of [
    'latest/index.html',
    'trending/index.html',
    'trackers/index.html',
    'tag/openai/index.html',
    'tag/comparisons/index.html',
  ]) {
    const html = dist(path);
    const featuredStart = html.indexOf('class="category-featured"');
    const layoutStart = html.indexOf('class="category-layout"');
    if (featuredStart < 0) {
      assert.ok(html.includes('class="category-empty"'), `${path} lacks an empty state`);
      continue;
    }
    assert.ok(layoutStart > featuredStart, `${path} is missing the category feed`);

    const featured = html.slice(featuredStart, layoutStart);
    const lead = featured.match(/class="category-featured-lead" href="([^"]+)"/);
    assert.ok(lead, `${path} is missing its featured lead story`);
    assert.ok(
      (featured.match(/class="category-featured-card"/g) || []).length <= 2,
      `${path} should keep featured support stories focused`,
    );

    const feed = html.slice(layoutStart);
    assert.ok(feed.includes('Latest updates'), `${path} is missing the latest-updates heading`);
    assert.ok(
      feed.includes('class="category-feed-toolbar"'),
      `${path} is missing the latest-updates toolbar`,
    );
    assert.ok(
      !feed.slice(0, feed.indexOf('</main>')).includes(lead[1]),
      `${path} should not repeat its featured lead in the latest feed`,
    );
  }
});

check('format archives and utility routes build with their reader-facing contracts', () => {
  for (const { key, label } of storyFormats) {
    assert.ok(distExists(`format/${key}/index.html`), `missing /format/${key}/`);
    const html = dist(`format/${key}/index.html`);
    assert.ok(
      html.includes('class="category-front"') || html.includes('class="category-empty"'),
      `/format/${key}/ lacks the archive or empty state`,
    );
    assert.ok(html.includes(label), `/format/${key}/ lacks its format label`);
  }

  const article = dist(`posts/${primaryPostId}/index.html`);
  assert.ok(article.includes('class="article-takeaways"'), 'article lacks the short version block');
  assert.ok(article.includes('class="article-facts-table"'), 'article lacks the facts table');
  assert.ok(!article.includes('class="article-knowledge"'), 'removed evidence split still renders');
  assert.ok(!article.includes('class="article-context"'), 'removed context block still renders');
  assert.ok(!article.includes('class="article-source-card"'), 'removed source card still renders');
  assert.ok(!article.includes('class="article-updates"'), 'article still renders update history');
  assert.ok(article.includes('href="/format/explainer/"'), 'article lacks its format link');

  const search = dist('search/index.html');
  assert.ok(search.includes('data-search-page-form'), 'search page form is missing');
  assert.ok(search.includes('data-search-page-results'), 'search page results are missing');
  assert.ok(
    src('src/scripts/search-page.ts').includes('loadPagefind'),
    'search page must use Pagefind',
  );
  assert.ok(
    src('src/scripts/search-page.ts').includes('ArrowDown'),
    'search page must support keyboard navigation',
  );

  assert.ok(distExists('saved/index.html'), 'saved stories route is missing');
  assert.ok(
    dist('saved/index.html').includes('data-saved-page-list'),
    'saved page list is missing',
  );
  assert.ok(distExists('about/index.html'), 'editorial standards route is missing');
  assert.ok(
    dist('about/index.html').includes('class="standards-page"'),
    'standards page is missing',
  );
  assert.ok(distExists('privacy/index.html'), 'privacy policy route is missing');
  assert.ok(
    dist('privacy/index.html').includes('class="legal-page"'),
    'privacy policy page is missing',
  );
  assert.ok(distExists('terms/index.html'), 'terms of service route is missing');
  assert.ok(
    dist('terms/index.html').includes('class="legal-page"'),
    'terms of service page is missing',
  );
  assert.ok(distExists('cookies/index.html'), 'cookie policy route is missing');
  assert.ok(
    dist('cookies/index.html').includes('class="legal-page"'),
    'cookie policy page is missing',
  );
  assert.ok(distExists('404.html'), 'custom 404 page is missing');
});

check('homepage lead story is the most recent post', () => {
  const html = dist('index.html');
  const lead = html.match(/<h1 class="hero-lead-headline">([\s\S]*?)<\/h1>/);
  assert.ok(lead, 'no lead headline rendered');
  // Most recent by pubDate: codex-beyond-the-laptop (2026-08-04).
  assert.ok(
    lead[1].includes(`/posts/${quaternaryPostId}/`),
    'lead story should be the most recent post',
  );
  assert.match(html, /\d+ min read/, 'read time not rendered');
  assert.ok(html.includes('class="byline-name"'), 'byline not rendered');
});

check('homepage hero surfaces the current lead story', () => {
  const html = dist('index.html');
  assert.ok(linksTo(html, primaryPostId), 'current story is missing from the homepage');
  const hero = html.slice(
    html.indexOf('class="hero"'),
    html.indexOf('</section>', html.indexOf('class="hero"')),
  );
  assert.ok(hero.includes('class="hero-lead"'), 'lead story is not rendered');
  assert.ok(!hero.includes('class="hero-picks"'), "empty Editor's Pick rail should be hidden");
  assert.ok(hero.includes('class="hero-just-in"'), 'Just In rail should show the second story');
});

check('/trending/ shows only featured posts', () => {
  const html = dist('trending/index.html');
  assert.ok(html.includes('class="category-empty"'), 'empty trending archive should be explicit');
  assert.ok(!linksTo(html, primaryPostId), 'non-featured post leaked into trending');
});

check('/trackers/ shows only tracker-type posts', () => {
  const html = dist('trackers/index.html');
  assert.ok(html.includes('class="category-empty"'), 'empty tracker archive should be explicit');
  assert.ok(!linksTo(html, primaryPostId), 'non-tracker post leaked into trackers');
});

check('/tag/openai/ shows only OpenAI posts, with that topic active in the nav', () => {
  const html = dist('tag/openai/index.html');
  assert.ok(!html.includes('class="category-empty"'), 'OpenAI archive should show its story');
  assert.ok(linksTo(html, primaryPostId), 'OpenAI story is missing from its category archive');
  const navStart = html.indexOf('class="primary-bar"');
  const nav = html.slice(navStart, html.indexOf('</nav>', navStart));
  assert.match(
    nav,
    /href="\/tag\/openai\/"[^>]*aria-current="page"/,
    'OpenAI topic not marked current in the nav',
  );
});

check('homepage renders only editorial layouts with available stories', () => {
  const html = dist('index.html');
  assert.ok(
    !html.includes('Explainers &amp; comparisons'),
    'removed Explainers & comparisons section returned',
  );
  assert.ok(
    !html.includes('class="split-lead"'),
    'removed Explainers & comparisons layout returned',
  );
  assert.ok(html.includes('class="hero"'), 'homepage hero is missing');
  assert.ok(html.includes('class="topic-directory"'), 'topic directory should remain available');
  assert.ok(!html.includes('class="band-lead"'), 'empty tracker band should be hidden');
  assert.ok(!html.includes('class="headline-item"'), 'empty closing grid should be hidden');
});

check('homepage hides low-density modules without duplicating stories', () => {
  const html = dist('index.html');
  assert.ok(html.includes('class="hero"'), 'homepage hero should remain visible');
  assert.ok(!html.includes('class="desk-index"'), 'low-density desk index should be hidden');
  assert.ok(!html.includes('class="desk-showcase"'), 'low-density showcase should be hidden');
  assert.ok(!html.includes('class="briefing-board"'), 'low-density briefing should be hidden');
  assert.ok(!html.includes('class="story-timeline"'), 'low-density timeline should be hidden');
  assert.ok(!html.includes('class="related-news"'), 'empty related-news should be hidden');
  assert.ok(!html.includes('class="newsroom-section"'), 'low-density picks should be hidden');
});

check('homepage keeps responsive rules ready for denser editions', () => {
  const html = dist('index.html');
  assert.ok(html.includes('class="topic-directory"'), 'missing topic directory');

  const css = sourceStyles();
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*?\.story-timeline-track[\s\S]*?grid-template-columns:\s*1fr/,
  );
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*?\.topic-directory-groups[\s\S]*?grid-template-columns:\s*1fr/,
  );
});

check("Editor's Picks stays hidden until a story is actually featured", () => {
  const html = dist('index.html');
  assert.ok(!html.includes('class="newsroom-section"'), "empty Editor's Picks should be hidden");
  assert.equal(
    sourcePosts().filter(({ featured }) => featured).length,
    0,
    'the single supplied story should not be silently promoted to featured',
  );
});

check('.panel is a toned band that follows the explicit theme palette', () => {
  const css = sourceStyles();
  const panel = css.match(/\n\.panel\s*\{([\s\S]*?)\n\}/);
  assert.ok(panel, 'missing .panel rule block');
  assert.match(
    panel[1],
    /margin:[^;]*calc\(-1 \* var\(--gutter\)\)/,
    'panel does not bleed past the gutter',
  );
  assert.match(
    panel[1],
    /background:\s*var\(--panel-bg\)/,
    'panel should use its own toned background token',
  );
  assert.ok(
    !/color:/.test(panel[1]),
    'panel should not force an ink colour — it stays within the theme, unlike .band',
  );

  const light = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = css.match(/:root\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(light && dark, 'could not locate the explicit theme token blocks');
  assert.match(light[1], /--panel-bg:\s*#f4f4f4/, 'light mode should use a light panel colour');
  assert.match(dark[1], /--panel-bg:\s*#151515/, 'dark mode should use a dark panel colour');
});

check('the band bleeds past the page gutter and paints its own contrast', () => {
  const css = sourceStyles();
  const band = css.match(/\n\.band\s*\{([\s\S]*?)\n\}/);
  assert.ok(band, 'missing .band rule block');
  // Negating the gutter is what makes the band run edge to edge.
  assert.match(
    band[1],
    /margin:[^;]*calc\(-1 \* var\(--gutter\)\)/,
    'band does not bleed past the gutter',
  );
  assert.match(
    band[1],
    /background:\s*var\(--band-bg\)/,
    'band should carry its own saturated field',
  );
  assert.match(band[1], /color:\s*var\(--band-ink\)/, 'band needs its own ink colour');
  // The band paints its own contrast, so its rule takes full-strength ink
  // rather than a colour.
  assert.match(band[1], /--rule:\s*var\(--band-ink\)/, 'band rule should take full-strength ink');
  assert.match(
    css,
    /\.frame\s*\{[\s\S]*?padding:[^;]*var\(--gutter\)/,
    'frame padding must use the gutter token',
  );
});

check('sections carry no filler copy and lead with headlines', () => {
  const html = dist('index.html');
  // Section subtitles were padding; headlines and images do the work now.
  assert.ok(!html.includes('section-blurb'), 'sections should not reintroduce blurb copy');
  // Band items are headline-only — no deks, dates or read times inside them.
  const band = html.slice(
    html.indexOf('class="band'),
    html.indexOf('</section>', html.indexOf('class="band')),
  );
  assert.ok(!/\d+ min read/.test(band), 'band items should not carry read times');
});

check('the closing grid stays hidden when the stage contains the full edition', () => {
  const html = dist('index.html');
  assert.ok(!html.includes('More from today'), 'empty closing grid should not render a heading');
  assert.ok(!html.includes('class="headline-grid"'), 'empty closing grid should be hidden');
});

check('sections never depend on scroll position to become visible', () => {
  // This site used to fade sections in via animation-timeline: view(). On a
  // page too short for the animation to finish before scrolling bottoms out,
  // that leaves a section permanently stuck at low opacity — it happened on
  // this site's own homepage. Content must never depend on how far a reader
  // has scrolled to become visible, so the mechanism must not exist at all,
  // built or source, and must not come back.
  const assets = new URL('../dist/_astro/', import.meta.url);
  const cssFiles = readdirSync(assets).filter((file) => file.endsWith('.css'));
  assert.ok(cssFiles.length > 0, 'no built stylesheet found');
  const builtCss = cssFiles.map((file) => readFileSync(new URL(file, assets), 'utf-8')).join('\n');
  assert.ok(
    !/animation-timeline/.test(builtCss),
    'a scroll-linked animation-timeline was reintroduced in the built CSS',
  );

  // Strip comments before checking: this file's own history comment names
  // animation-timeline while explaining why it was removed, which isn't a
  // reintroduction of the mechanism.
  const source = sourceStyles().replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !/animation-timeline/.test(source),
    'a scroll-linked animation-timeline was reintroduced in global.css',
  );
  assert.ok(
    !/@supports\s*\(animation-timeline/.test(source),
    'the removed scroll-reveal @supports block was reintroduced',
  );

  // None of the sections that used to carry the scroll-linked class should
  // still reference it in markup — it no longer does anything.
  for (const component of ['FeatureBand', 'HeadlineGrid', 'NewsroomGrid', 'LatestSection']) {
    assert.ok(
      !src(`src/components/${component}.astro`).includes('reveal'),
      `${component}.astro still references the removed reveal class`,
    );
  }

  // The hero's own on-load entrance is a plain, unconditional animation (no
  // scroll timeline involved) and must still respect reduced motion.
  assert.match(
    source,
    /\.hero > \*\s*\{[\s\S]*?animation:\s*rise/,
    'hero entrance animation missing',
  );
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.hero > \*[\s\S]*?animation:\s*none/,
    'reduced motion must switch the hero entrance off',
  );
});

check('article page renders the fixed §4 template on the site shell', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  // Shell
  assert.ok(html.includes('class="masthead-mark"'), 'article page should use the site shell');
  assert.ok(html.includes('class="primary-bar"'), 'article page missing the primary bar');
  assert.ok(html.includes('class="site-footer"'), 'article page missing the footer');
  // Template blocks
  assert.ok(html.includes('article-kicker'), 'missing topic kicker');
  assert.ok(html.includes('class="article-title"'), 'missing headline');
  assert.ok(html.includes('class="article-standfirst"'), 'missing standfirst');
  assert.ok(html.includes('class="byline-name"'), 'missing byline');
  assert.ok(html.includes('class="article-figure"'), 'missing hero figure');
  assert.ok(html.includes('class="article-sidebar"'), 'missing article sidebar');
  assert.ok(html.includes('developers.openai.com/api/docs/models/gpt-5.6-terra'));
  assert.ok(html.includes('class="article-tags"'), 'missing tag list');
  assert.match(html, /\d+ min read/, 'missing read time');
});

check('article facts use semantic rows and a single clean topic set', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  const tableStart = html.indexOf('class="article-facts-table"');
  const tableEnd = html.indexOf('</table>', tableStart);
  const table = html.slice(tableStart, tableEnd);
  assert.match(table, /<th scope="col">Area<\/th>/);
  assert.match(table, /<th scope="row">Position<\/th>/);
  assert.match(table, /<td>Terra is the middle GPT-5\.6 tier/);

  const topicStart = html.indexOf('class="article-topic-links"');
  const topicEnd = html.indexOf('</nav>', topicStart);
  const topics = html.slice(topicStart, topicEnd);
  assert.equal((topics.match(/href="\/format\/explainer\/"/g) || []).length, 1);
  assert.equal((topics.match(/href="\/tag\/ai\/"/g) || []).length, 1);
  assert.equal((topics.match(/href="\/tag\/openai\/"/g) || []).length, 1);
  assert.equal((topics.match(/<a /g) || []).length, 3);
  assert.equal((html.match(/class="label article-topic-kicker"/g) || []).length, 1);

  const css = sourceStyles();
  assert.match(css, /\.article-facts-table\s*\{/);
  assert.match(css, /\.article-facts-table th\[scope='row'\]/);
  assert.match(css, /\.article-facts-table tbody tr:nth-child\(even\)/);
});

check('article pages expose save-for-later controls and a shared saved-story list', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  const bookmarkSource = src('src/scripts/bookmarks.ts');

  assert.ok(html.includes('data-bookmark-toggle'), 'article is missing the bookmark control hook');
  assert.ok(
    html.includes(`data-bookmark-id="${primaryPostId}"`),
    'bookmark control is missing the article identifier',
  );
  assert.ok(
    html.includes('data-bookmark-title="GPT-5.6 Terra: where it fits"'),
    'bookmark control is missing the article title',
  );
  assert.ok(html.includes('class="saved-menu"'), 'header is missing the saved-story dropdown');
  assert.ok(html.includes('data-saved-list'), 'saved-story list container is missing');
  assert.match(bookmarkSource, /localStorage/, 'bookmarks should persist in local storage');
  assert.match(
    bookmarkSource,
    /data-bookmark-remove/,
    'saved stories should be removable from the list',
  );
  assert.match(
    bookmarkSource,
    /MutationObserver/,
    'bookmarks should sync with continuously appended articles',
  );
  assert.match(
    bookmarkSource,
    /label\.textContent !== nextLabel/,
    'bookmark label sync must be idempotent for MutationObserver updates',
  );
});

check('article pages expose share controls and a complete ending handoff', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  const terminal = dist(`posts/${secondaryPostId}/index.html`);
  const sharingSource = src('src/scripts/sharing.ts');

  assert.ok(html.includes('class="article-share"'), 'article is missing the share control');
  assert.ok(html.includes('data-share-story'), 'share control is missing its event hook');
  assert.ok(
    html.includes('data-share-title="GPT-5.6 Terra: where it fits"'),
    'share control is missing the article title',
  );
  assert.ok(html.includes('class="article-endcap"'), 'article is missing the ending handoff');
  assert.ok(
    html.includes('class="article-endcap-author"'),
    'article ending is missing the author card',
  );
  assert.ok(
    html.includes('class="article-pagination"'),
    'newer article should link to the next story',
  );
  assert.ok(
    terminal.includes('class="article-pagination"'),
    'oldest article should link back to the newer story',
  );
  assert.match(
    sharingSource,
    /navigator\.share/,
    'share should use the native share API when available',
  );
  assert.match(sharingSource, /navigator\.clipboard/, 'share should fall back to copying the URL');
});

check('removed generic article blocks stay out of the rendered story', () => {
  for (const slug of [primaryPostId]) {
    const html = dist(`posts/${slug}/index.html`);
    assert.ok(!html.includes('Why it matters'), 'generic context heading still renders');
    assert.ok(!html.includes('class="article-knowledge"'));
    assert.ok(!html.includes('class="article-source-card"'));
  }
});

check('article page emits Article/NewsArticle schema with an image', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  const schema = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]))
    .find((block) => block['@type'] === 'NewsArticle' || block['@type'] === 'Article');
  assert.ok(schema, 'no Article/NewsArticle JSON-LD block found');
  assert.ok(
    Array.isArray(schema.image) && schema.image.length > 0,
    'schema image field must be populated',
  );
  assert.ok(schema.headline, 'schema missing headline');
  assert.ok(schema.datePublished, 'schema missing datePublished');
});

check('Suggested Reads uses the other published stories', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  const suggestedLimit = Math.min(sourcePosts().length - 1, 4);
  assert.ok(!html.includes('article-related'), 'legacy Related module still rendered');
  assert.ok(
    html.includes('class="suggested-reads'),
    'Suggested Reads should render with a candidate',
  );
  assert.equal((html.match(/class="suggested-story"/g) || []).length, suggestedLimit);
});

check(
  'Suggested Reads requires an article identifier for stream instances without changing standalone props',
  () => {
    const component = src('src/components/SuggestedReads.astro');
    assert.match(component, /variant\?: 'standalone';\s*articleId\?: string/);
    assert.match(component, /variant: 'stream';\s*articleId: string/);
    assert.match(component, /const \{ posts, variant = 'standalone', articleId \} = Astro\.props/);
    assert.match(component, /suggested-reads-\$\{articleId \?\? variant\}/);
  },
);

check('suggestion ranking handles empty, short, unrelated, and tied candidate sets', () => {
  const post = (id, tags, pubDate) => ({ id, data: { tags, pubDate: new Date(pubDate) } });
  const current = post('current', ['AI', 'Models'], '2026-08-01');

  assert.deepEqual(
    getSuggestedPosts(current, [current]).map(({ id }) => id),
    [],
  );
  assert.deepEqual(
    getSuggestedPosts(current, [current, post('one', ['AI'], '2026-07-30')], 4).map(({ id }) => id),
    ['one'],
  );
  assert.deepEqual(
    getSuggestedPosts(current, [
      current,
      post('older', ['Policy'], '2026-07-20'),
      post('newer', ['Tools'], '2026-07-30'),
    ]).map(({ id }) => id),
    ['newer', 'older'],
  );
  assert.deepEqual(
    getSuggestedPosts(current, [
      current,
      post('zeta', ['AI'], '2026-07-30'),
      post('alpha', ['Models'], '2026-07-30'),
    ]).map(({ id }) => id),
    ['alpha', 'zeta'],
  );
});

check('article canvas is full width while prose keeps a readable measure', () => {
  const css = sourceStyles();
  const layout = css.match(/\.article-layout\s*\{([\s\S]*?)\n\}/);
  const measure = css.match(/\.article-measure\s*\{([\s\S]*?)\n\}/);
  assert.match(
    layout[1],
    /grid-template-columns:\s*minmax\(180px, 220px\) minmax\(0, 1fr\) minmax\(280px, 340px\)/,
  );
  assert.match(layout[1], /gap:\s*40px/);
  assert.ok(!/max-width/.test(layout[1]), 'article canvas should not keep the old width cap');
  assert.match(measure[1], /720px/);
});

check('all standalone articles share the same hero and sidebar shell', () => {
  for (const { id } of sourcePosts()) {
    const html = dist(`posts/${id}/index.html`);
    assert.ok(html.includes('class="article-layout"'), `${id} is missing the article layout`);
    assert.ok(
      html.includes('class="article-outline"'),
      `${id} is missing the left article outline`,
    );
    assert.ok(html.includes('class="article-figure"'), `${id} is missing the article hero`);
    assert.ok(html.includes('class="article-sidebar"'), `${id} is missing the article sidebar`);
    assert.equal(
      (html.match(/class="sidebar-section sidebar-(?:latest|trending|topic)(?:\s[^"]*)?"/g) || [])
        .length,
      2,
      `${id} should render one topic and one latest module`,
    );
    assert.equal(
      (html.match(/class="sidebar-section sidebar-latest(?:\s[^"]*)?"/g) || []).length,
      1,
      `${id} should render one latest module when another story is available`,
    );
  }
});

check('article layout splits the outline from the discovery sidebar', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  const outlineStart = html.indexOf('class="article-outline"');
  const outlineEnd = html.indexOf('</aside>', outlineStart);
  const sidebarStart = html.indexOf('class="article-sidebar"');
  const sidebarEnd = html.indexOf('</aside>', sidebarStart);
  const outline = html.slice(outlineStart, outlineEnd);
  const sidebar = html.slice(sidebarStart, sidebarEnd);
  assert.ok(outlineStart >= 0 && outlineEnd > outlineStart, 'Article outline missing');
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart, 'Article sidebar missing');
  assert.equal(
    (sidebar.match(/class="sidebar-section sidebar-(?:latest|trending|topic)(?:\s[^"]*)?"/g) || [])
      .length,
    2,
    'exactly one topic module should render for the current story',
  );
  assert.equal(
    (sidebar.match(/class="sidebar-section sidebar-latest(?:\s[^"]*)?"/g) || []).length,
    1,
    'exactly one latest module should render with another story available',
  );
  assert.match(
    outline,
    /class="article-toc(?:\s[^"]*)?"/,
    'left rail should expose the story outline',
  );
  assert.match(
    sidebar,
    /class="sidebar-section sidebar-topic(?:\s[^"]*)?"/,
    'right sidebar should use the current story topic',
  );
  assert.ok(sidebar.includes('sidebar-latest'), 'latest module should show the other story');
  assert.ok(
    !sidebar.includes('article-rail-author'),
    'author card should not be in the right rail',
  );
  assert.ok(!sidebar.includes('article-toc'), 'table of contents should not be in the right rail');
  assert.ok(!sidebar.includes('sidebar-explore'), 'competing exploration module should be removed');
  assert.ok(!sidebar.includes('sidebar-subscribe'), 'subscription module should be removed');
  assert.ok(
    !src('src/components/ArticleLatest.astro').includes('Math.random()'),
    'sidebar module choice should be deterministic',
  );
});

check('article outline tracks the reader without underline-only hover state', () => {
  const html = dist(`posts/${primaryPostId}/index.html`);
  const outlineStart = html.indexOf('class="article-outline"');
  const outlineEnd = html.indexOf('</aside>', outlineStart);
  const outline = html.slice(outlineStart, outlineEnd);
  assert.match(outline, /data-article-toc/);
  assert.match(outline, /data-toc-link/);
  assert.match(outline, /data-toc-target="terra-is-the-middle-option"/);

  const script = src('src/scripts/article-toc.ts');
  assert.match(script, /IntersectionObserver|requestAnimationFrame/);
  assert.match(script, /aria-current/);
  assert.match(script, /is-current/);
  assert.match(script, /window\.scrollTo/);
  assert.match(script, /const activeIndex = links\.indexOf\(link\)/);
  assert.match(script, /pushState/);
  assert.match(script, /articleTocBound/);

  const css = sourceStyles();
  assert.match(css, /\.article-toc li\.is-current/);
  assert.match(css, /\.article-toc a\.is-current/);
  assert.match(css, /\.article \.prose h2\[id\][\s\S]*scroll-margin-top/);
  const tocHover = css.match(/\.article-toc a:hover,[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(tocHover, /text-decoration:\s*underline/);
});

check('standalone and stream Suggested Reads use the available candidates', () => {
  const standalone = dist(`posts/${primaryPostId}/index.html`);
  const stream = dist(`posts/${primaryPostId}/fragment/index.html`);
  const suggestedLimit = Math.min(sourcePosts().length - 1, 4);
  assert.equal((standalone.match(/class="suggested-story"/g) || []).length, suggestedLimit);
  assert.equal((stream.match(/class="suggested-story"/g) || []).length, suggestedLimit);
  assert.match(
    src('src/pages/posts/[id]/fragment.astro'),
    /getSuggestedPosts\(post, allPosts, 4\)/,
  );
});

check('article sidebar uses the approved responsive layout', () => {
  const css = sourceStyles();
  const layout = css.match(/\.article-layout\s*\{([\s\S]*?)\n\}/);
  const outline = css.match(/\.article-outline\s*\{([\s\S]*?)\n\}/);
  const sidebar = css.match(/\.article-sidebar\s*\{([\s\S]*?)\n\}/);
  assert.ok(layout && outline && sidebar);
  assert.match(
    layout[1],
    /grid-template-columns:\s*minmax\(180px, 220px\) minmax\(0, 1fr\) minmax\(280px, 340px\)/,
  );
  assert.match(layout[1], /gap:\s*40px/);
  assert.match(outline[1], /position:\s*sticky/);
  assert.match(sidebar[1], /position:\s*sticky/);
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.article-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 720px\)/,
  );
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.article-layout\s*\{[\s\S]*?gap:\s*0/);
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.article-sidebar\s*\{[\s\S]*?position:\s*static/,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.article-outline,\s*\.article-sidebar\s*\{[\s\S]*?position:\s*static/,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.latest-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*?\.latest-list\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
  );
  assert.match(css, /\.article-actions\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css, /\.stream-article \.article-actions\s*\{[\s\S]*?position:\s*static/);
  assert.match(css, /\.article-sidebar-module\s*>\s*summary::after/);
});

check('article metadata cannot overlap save and share controls', () => {
  const css = sourceStyles();
  const details = css.match(/\.article-meta-details \.label\s*\{([\s\S]*?)\n\}/);
  const actions = css.match(/\.article-actions\s*\{([\s\S]*?)\n\}/);
  assert.ok(details && actions, 'article metadata rules are missing');
  assert.match(details[1], /white-space:\s*normal/);
  assert.match(details[1], /overflow-wrap:\s*anywhere/);
  assert.match(actions[1], /flex-shrink:\s*0/);
});

check('author pages render profiles and every authored story newest first', () => {
  assert.ok(distExists('authors/tejas-telkar/index.html'));
  const html = dist('authors/tejas-telkar/index.html');
  assert.ok(html.includes('class="author-profile"'));
  assert.ok(html.includes('Tejas Telkar'));
  assert.ok(html.includes('Writer and editor'));
  assert.ok(html.includes('class="label author-story-tag">Explainers'));
  assert.ok(html.includes(`<strong>${sourcePosts().length}</strong>`));
  assert.ok(html.includes('Published stories'));

  const urls = [...html.matchAll(/class="author-story" href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(urls.length, sourcePosts().length);
  assert.equal(urls[0], `/posts/${quaternaryPostId}/`);
  assert.equal(urls.at(-1), `/posts/${secondaryPostId}/`);

  const schemas = [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map((match) => JSON.parse(match[1]));
  assert.ok(schemas.some((schema) => schema['@type'] === 'Person'));
});

check('author layouts preserve profile text and full lead covers', () => {
  const css = sourceStyles();
  assert.match(css, /\.author-profile\s*>\s*\*\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(
    css,
    /\.author-profile-bio\s*\{[\s\S]*?max-width:\s*100%[\s\S]*?overflow-wrap:\s*break-word/,
  );
  assert.match(
    css,
    /\.author-story-grid\s*>\s*\.author-story:first-child\s+img\s*\{[\s\S]*?aspect-ratio:\s*auto[\s\S]*?object-fit:\s*contain/,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.primary-bar-actions\s*\{[\s\S]*?order:\s*2[\s\S]*?\}/,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.primary-bar-nav\s*\{[\s\S]*?flex:\s*0 1 auto/,
  );
});

check('footer renders editorial navigation, wordmark, columns and base line', () => {
  const html = dist('index.html');
  const footer = html.slice(html.indexOf('class="site-footer"'));
  const css = sourceStyles();
  assert.ok(footer.includes('class="footer-headline"'), 'missing editorial footer headline');
  assert.ok(footer.includes('class="footer-topline"'), 'missing footer identity strip');
  assert.ok(footer.includes('class="footer-cta-links"'), 'missing editorial footer links');
  assert.ok(footer.includes('href="/tag/tutorials/"'), 'footer should link to Tutorials');
  assert.ok(footer.includes('class="footer-rule"'), 'missing footer section rule');
  assert.ok(
    !/subscribe|newsletter|substack/i.test(footer),
    'footer should not promote inactive subscription channels',
  );
  assert.ok(footer.includes('class="footer-wordmark"'), 'missing wordmark');
  assert.ok(footer.includes('class="footer-columns"'), 'missing link columns');
  assert.match(footer, /All rights reserved/, 'missing copyright line');
  assert.ok(footer.includes('href="/about/"'), 'footer should link editorial standards');
  assert.ok(footer.includes('href="/privacy/"'), 'footer should link the privacy policy');
  assert.ok(footer.includes('href="/terms/"'), 'footer should link the terms of service');
  assert.ok(footer.includes('href="/cookies/"'), 'footer should link the cookie policy');
  assert.ok(footer.includes('href="/contact/"'), 'footer should link the contact page');
  assert.ok(distExists('contact/index.html'), 'contact page should be generated');
  const contact = dist('contact/index.html');
  assert.match(contact, /Contact aiPressHQ/);
  assert.match(contact, /mailto:hello@aipresshq\.com/);
  const footerRule = css.match(/\.site-footer\s*\{([\s\S]*?)\n\}/);
  assert.ok(footerRule, 'footer styles are missing');
  assert.match(footerRule[1], /background:\s*var\(--text\)/);
  assert.match(footerRule[1], /color:\s*var\(--bg\)/);
  const footerWordmark = css.match(/\.footer-wordmark \.brand-mark\s*\{([\s\S]*?)\n\}/);
  assert.ok(footerWordmark, 'footer wordmark sizing rule is missing');
  assert.match(
    footerWordmark[1],
    /font-size:\s*clamp\(1\.45rem,\s*2\.2vw,\s*2\.1rem\)/,
    'footer wordmark should stay compact',
  );
});

check('structured-data organization logos use the square favicon asset', () => {
  const layout = src('src/layouts/BaseLayout.astro');
  const article = src('src/pages/posts/[id].astro');
  assert.match(layout, /\/brand\/aipresshq-favicon-light\.png/);
  assert.match(article, /\/brand\/aipresshq-favicon-light\.png/);
  assert.match(article, /width:\s*512/);
  assert.match(article, /height:\s*512/);
});

check('footer link rail fills the editorial intro without leaving empty rows', () => {
  const css = sourceStyles();
  const footerIntro = css.match(/\.footer-intro\s*\{([\s\S]*?)\n\}/);
  const footerLinks = css.match(/\.footer-cta-links\s*\{([\s\S]*?)\n\}/);
  const footerHeadline = css.match(/\.footer-headline\s*\{([\s\S]*?)\n\}/);
  assert.ok(footerIntro && footerLinks && footerHeadline);
  assert.match(footerIntro[1], /align-items:\s*start/);
  assert.match(footerLinks[1], /grid-template-rows:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(footerLinks[1], /align-self:\s*stretch/);
  assert.match(footerHeadline[1], /max-width:\s*15ch/);
  assert.match(css, /\.footer-cta-links\s*\{[\s\S]*?grid-template-rows:\s*none/);
});

check('inactive subscription and event promos are absent from the public site', () => {
  const htmlFiles = readdirSync(new URL('../dist/', import.meta.url), { recursive: true }).filter(
    (file) => typeof file === 'string' && file.endsWith('.html'),
  );
  const publicHtml = htmlFiles
    .map((file) => readFileSync(new URL(file, new URL('../dist/', import.meta.url)), 'utf-8'))
    .join('\n');
  assert.ok(
    !/Join the edition|Join our community|Subscribe free|daily briefing|newsletter|substack/i.test(
      publicHtml,
    ),
    'inactive subscription messaging leaked into built HTML',
  );
  assert.ok(
    !/AI &amp; Big Data Expo|register here|October 13\s*[–-]\s*15/i.test(publicHtml),
    'event promotion leaked into built HTML',
  );
});

check('Pagefind index is generated and the custom search box is rendered', () => {
  assert.ok(
    distExists('pagefind/pagefind.js'),
    'Pagefind index not generated — check astro-pagefind integration in astro.config.mjs',
  );
  const html = dist('index.html');
  assert.ok(html.includes('id="search-input"'), 'custom search input not rendered');
  assert.ok(html.includes('id="search-results"'), 'custom search results container not rendered');
  assert.ok(
    html.includes('class="search-box"'),
    'search input should live in the persistent header field',
  );
  assert.ok(!html.includes('<dialog'), 'full-screen search dialog should not be rendered');
  assert.ok(
    !html.includes('<pagefind-searchbox'),
    'prebuilt pagefind web component should not be rendered',
  );
});

check('search indexes article bodies only, not listing pages or nav chrome', () => {
  // With data-pagefind-body present anywhere, Pagefind indexes only pages
  // carrying it — keeping /, /trending/ and /tag/* out of the results and
  // excerpts free of masthead/nav text.
  const post = dist(`posts/${primaryPostId}/index.html`);
  assert.ok(
    post.includes('data-pagefind-body'),
    'article body is not marked as the Pagefind index root',
  );

  const home = dist('index.html');
  assert.ok(!home.includes('data-pagefind-body'), 'listing pages must not declare a Pagefind body');
  const header = home.slice(home.indexOf('<header'), home.indexOf('</header>'));
  assert.ok(
    header.includes('data-pagefind-ignore'),
    'dateline strip should be excluded from the index',
  );
  // The masthead, nav, Categories dropdown, and search controls all live on the
  // primary bar now, not inside <header> — it carries its own ignore flag,
  // covering everything nested inside it.
  const navStart = home.indexOf('<nav class="primary-bar"');
  const nav = home.slice(navStart, home.indexOf('</nav>', navStart));
  assert.ok(nav.includes('data-pagefind-ignore'), 'primary bar should be excluded from the index');
});

check('no eager Pagefind/component-ui script or stylesheet in the homepage', () => {
  const html = dist('index.html');
  assert.ok(
    !/<link[^>]*rel="modulepreload"[^>]*pagefind/i.test(html),
    'unexpected modulepreload hint for pagefind bundle',
  );
  assert.ok(
    !/PagefindConfig/i.test(html),
    'PagefindConfig component-ui bundle should not be referenced',
  );
  const headSection = html.slice(html.indexOf('<head'), html.indexOf('</head>'));
  assert.ok(
    !/<script[^>]*type="module"[^>]*src=/i.test(headSection),
    'no eager module script should be referenced from <head>',
  );
});

check('astro.config.mjs preserves site, sitemap, and image.remotePatterns config', () => {
  const config = src('astro.config.mjs');
  assert.match(config, /site:\s*['"]https:\/\/aipresshq\.com['"]/);
  assert.match(config, /sitemap\(/);
  assert.match(config, /remotePatterns/);
});

check('Cloudflare production routing protects admin separately from public assets', () => {
  const config = JSON.parse(
    src('wrangler.jsonc')
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1'),
  );
  assert.equal(config.main, 'src/worker.ts');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, ['/admin', '/admin/*']);
  assert.ok(
    config.r2_buckets?.some((binding) => binding.binding === 'IMAGES'),
    'the production Worker must have the images R2 binding',
  );
  const worker = src('src/worker.ts');
  assert.match(src('admin/worker-api.mjs'), /\/admin\/api\//);
  assert.match(worker, /ASSETS\.fetch/);
});

check('production admin sessions use signed HttpOnly cookies', () => {
  const auth = src('admin/worker-auth.mjs');
  const worker = src('src/worker.ts');
  const api = src('admin/worker-api.mjs');
  assert.match(auth, /crypto\.subtle\.sign/);
  assert.match(auth, /crypto\.subtle\.verify/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(auth, /Secure/);
  assert.match(worker, /ADMIN_PASSWORD_HASH/);
  assert.match(worker, /ADMIN_SESSION_SECRET/);
  assert.match(api, /\/admin\/api\/auth\/login/);
});

check('production admin assets expose a login-gated Editorial Desk without secrets', () => {
  const shell = src('admin/ui.mjs');
  const browser = src('public/admin/admin.js');
  const api = src('admin/worker-api.mjs');
  assert.match(shell, /admin-rail/);
  assert.match(shell, /Today[’']s desk/);
  assert.match(shell, /data-admin-login/);
  assert.match(shell, /admin\.css/);
  assert.match(shell, /admin\.js/);
  assert.match(browser, /data-admin-login-form/);
  assert.match(browser, /credentials:\s*['"]same-origin['"]/);
  assert.doesNotMatch(
    browser,
    /PRISMIC_WRITE_TOKEN|ADMIN_SESSION_SECRET|AWS_ACCESS_KEY|process\.env/,
  );
  assert.match(api, /PRISMIC_WRITE_TOKEN/);
  assert.match(api, /MAX_UPLOAD_BYTES/);
  assert.match(api, /verifySession/);
  assert.ok(distExists('admin/admin.css'), 'admin CSS was not copied to dist');
  assert.ok(distExists('admin/admin.js'), 'admin browser module was not copied to dist');
  assert.ok(distExists('admin/authors.json'), 'admin author manifest was not generated');
  const publicHtml = filesUnder(new URL('../dist/', import.meta.url))
    .filter((file) => file.pathname.endsWith('.html'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  assert.doesNotMatch(publicHtml, /PRISMIC_WRITE_TOKEN|ADMIN_SESSION_SECRET/);
});

check('generated pages use the aiPressHQ public identity', () => {
  const htmlFiles = filesUnder(new URL('../dist/', import.meta.url)).filter((file) =>
    file.pathname.endsWith('.html'),
  );
  const legacyPublicBrand = ['AI', 'Snap'].join(' ');
  const legacyPublicDomain = ['aisnap', 'in'].join('.');

  assert.ok(htmlFiles.length > 0, 'no generated HTML files found for brand verification');
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf-8');
    assert.ok(!html.includes(legacyPublicBrand), `${file.pathname} still exposes the old brand`);
    assert.ok(
      !html.includes(legacyPublicDomain),
      `${file.pathname} still exposes the old site domain`,
    );
  }
});

check('responsive CSS: stage collapses and categories use a contained responsive grid', () => {
  const css = sourceStyles();
  const wide = css.match(/@media \(max-width: 1080px\) \{([\s\S]*?)\n\}\n/);
  assert.ok(wide, 'missing @media (max-width: 1080px) block');
  assert.match(
    wide[1],
    /grid-template-columns:\s*1fr\s*;/,
    'stage does not collapse to a single column',
  );

  const navBlock = css.match(/\.primary-bar\s*\{([\s\S]*?)\n\}/);
  assert.ok(navBlock, 'missing .primary-bar rule block');
  assert.ok(
    !/overflow-x:\s*auto/.test(navBlock[1]),
    '.primary-bar must not require horizontal scrolling',
  );

  const topicGrid = css.match(/\.category-menu-groups\s*\{([\s\S]*?)\n\}/);
  assert.ok(topicGrid, 'missing .category-menu-groups rule block');
  assert.match(topicGrid[1], /display:\s*grid/, 'topic groups should use a grid');
  assert.match(
    topicGrid[1],
    /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    'desktop topic groups should use three fluid columns',
  );

  const narrow = css.match(/@media \(max-width: 780px\) \{([\s\S]*?)\n\}/);
  assert.ok(narrow, 'missing narrow viewport rules');
  assert.match(
    narrow[1],
    /\.category-menu-groups\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    'category groups should stack to one column on narrow screens',
  );

  const mobile = css.match(/@media \(max-width: 620px\) \{([\s\S]*?)\n\}/);
  assert.ok(mobile, 'missing mobile header rules');
  assert.match(
    mobile[1],
    /\.primary-bar-nav\s*\{[\s\S]*?flex-wrap:\s*wrap/,
    'primary bar nav should wrap as a fallback rather than overflow',
  );
  assert.ok(
    !/\.category-menu\s*\{[\s\S]*?flex:\s*1 1 100%/.test(mobile[1]),
    'Categories should stay inline with the tabs instead of stretching onto its own full-width row',
  );

  const narrowest = css.match(/@media \(max-width: 360px\) \{([\s\S]*?)\n\}/);
  assert.ok(narrowest, 'missing narrowest viewport rules for long active topic labels');
  assert.match(
    narrowest[1],
    /\.primary-bar-nav\s*\{[\s\S]*?flex-wrap:\s*wrap/,
    'primary bar nav should wrap rather than crowd tabs and Categories onto one line',
  );
});

check('the generated site exposes a route inventory for mobile smoke checks', () => {
  const smokeScript = src('scripts/mobile-route-smoke.mjs');
  assert.match(smokeScript, /discoverRoutes/);
  assert.match(smokeScript, /scrollWidth/);
  assert.match(smokeScript, /WebSocket/);
  assert.match(smokeScript, /data-mobile-smoke/);
});

check('mobile header controls have bounded geometry and safe-area support', () => {
  const responsive = src('src/styles/responsive.css');
  const css = sourceStyles();
  assert.match(responsive, /@media \(max-width: 360px\)/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(
    responsive,
    /\.category-menu-panel[\s\S]*?max-height:\s*[^;]*dvh/,
    'category menu should use the dynamic viewport height on mobile',
  );
  assert.match(
    css,
    /\.search-results[\s\S]*?width:\s*[^;]*100vw/,
    'search results should be bounded to the viewport width',
  );
});

check('dense public grids collapse without hiding content on mobile', () => {
  const css = sourceStyles();
  assert.match(
    css,
    /\.newsroom-grid[\s\S]*?grid-template-columns:\s*1fr/,
    'newsroom cards should collapse to one column',
  );
  assert.match(
    css,
    /\.category-story[\s\S]*?grid-template-columns:\s*112px/,
    'compact category stories should preserve the image/text rhythm',
  );
  assert.match(
    css,
    /\.footer-columns[\s\S]*?grid-template-columns:\s*1fr/,
    'footer columns should stack on mobile',
  );
  assert.match(
    css,
    /\.category-format-filter select[\s\S]*?max-width:/,
    'category format filters should constrain their select control',
  );
});

check('article wide content is contained inside its own scroll surfaces', () => {
  const article = src('src/styles/article.css');
  const responsive = src('src/styles/responsive.css');
  assert.match(article, /\.table-scroll\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(article, /\.prose pre\[data-code-block\][\s\S]*?overflow-x:\s*auto/);
  assert.match(responsive, /\.article-actions[\s\S]*?env\(safe-area-inset-bottom/);
});

// --- RUNNER (do not edit below this line) ---

let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed`);
