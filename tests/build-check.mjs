// Lightweight build-output verification harness — no test framework needed
// for a static-only Astro site. Run `npm run build` first, then this script.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
import {
  canStartContinuousLoad,
  handleContinuousReaderPageTransition,
  validateArticleFragmentCandidates,
} from '../src/scripts/continuous-reader.ts';
import { getSuggestedPosts } from '../src/lib/recommendations.ts';
import { getNextOlderPost, sortPostsNewestFirst } from '../src/lib/post-order.ts';
import { slugify } from '../src/lib/slug.ts';
import { getAuthorId } from '../src/lib/author-reference.ts';
import { topicGroups, knownTopics } from '../src/lib/topics.ts';

const dist = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf-8');
const distExists = (path) => existsSync(new URL(`../dist/${path}`, import.meta.url));
const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8');
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
const containsInternalScaffolding = (text) => (
  internalScaffoldingPatterns.some((pattern) => pattern.test(text))
);
const filesUnder = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
  return entry.isDirectory() ? filesUnder(url) : [url];
});
const sourcePosts = () => filesUnder(new URL('../src/content/posts/', import.meta.url))
  .filter((file) => file.pathname.endsWith('.md'))
  .map((file) => {
    const content = readFileSync(file, 'utf-8');
    const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
    const tags = frontmatter?.[1].match(/^tags:\s*(\[[^\n]+\])\s*$/m);
    assert.ok(tags, `${file.pathname} must declare a JSON-compatible tags array in frontmatter`);
    return {
      id: decodeURIComponent(file.pathname.split('/').pop()).replace(/\.md$/, ''),
      tags: JSON.parse(tags[1]),
    };
  });
const sourceTopics = () => [...new Set(sourcePosts().flatMap((post) => post.tags))]
  .sort((a, b) => a.localeCompare(b))
  .map((label) => ({ label, href: `/tag/${slugify(label)}/` }));
const topicMenuFrom = (html) => {
  const navStart = html.indexOf('<nav class="categories-bar"');
  const navEnd = html.indexOf('</nav>', navStart);
  assert.ok(navStart >= 0 && navEnd > navStart, 'page is missing the section navigation');
  const nav = html.slice(navStart, navEnd);
  const menuStart = nav.indexOf('<details class="topic-menu">');
  assert.ok(menuStart >= 0, 'section navigation is missing the Topics disclosure');
  return nav.slice(menuStart);
};
const topicSummaryLabel = (topicMenu) => {
  const summary = topicMenu.match(/<summary[^>]*>[\s\S]*?<span>([^<]+)<\/span>/);
  assert.ok(summary, 'Topics disclosure is missing its visible summary label');
  return decodePublicCopy(summary[1]).trim();
};
const currentTopicHrefs = (topicMenu) => [...topicMenu.matchAll(
  /<a\b(?=[^>]*\baria-current="page")(?=[^>]*\bhref="([^"]+)")[^>]*>/g,
)].map((match) => match[1]);
const decodePublicCopy = (text) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, entity) => ({
    nbsp: ' ',
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
  })[entity.toLowerCase()]);
const attributesFromTag = (tag) => new Map(
  [...tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]),
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
const controllerModules = (html) => [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .filter((script) => (
    script.includes('DOMParser')
    && script.includes('AbortController')
    && script.includes('800px 0px')
    && script.includes('pagehide')
  ));

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

check('all three fixture posts built successfully', () => {
  assert.ok(distExists('posts/welcome-to-ai-snap/index.html'));
  assert.ok(distExists('posts/codex-usage-limit-tracker/index.html'));
  assert.ok(distExists('posts/openai-ships-new-model/index.html'));
});

check('public posts contain no internal fixture language', () => {
  const posts = new URL('../src/content/posts/', import.meta.url);
  for (const file of filesUnder(posts)) {
    assert.equal(
      containsInternalScaffolding(readFileSync(file, 'utf-8')),
      false,
      `${file.pathname} contains internal scaffolding copy`,
    );
  }
});

check('substantially rewritten posts disclose the final editorial update date', () => {
  for (const { id } of sourcePosts()) {
    assert.match(
      src(`src/content/posts/${id}.md`),
      /^updatedDate:\s*2026-08-02\s*$/m,
      `${id} must disclose the 2026-08-02 rewrite`,
    );
  }
});

check('provider analysis posts attribute and link verified primary documentation', () => {
  const expected = {
    'chatgpt-plus-limit-tracker': {
      sourceName: 'OpenAI Help Center',
      sourceUrl: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus',
    },
    'claude-usage-limit-tracker': {
      sourceName: 'Claude Help Center',
      sourceUrl: 'https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work',
    },
    'claude-vs-chatgpt-vs-gemini': {
      sourceName: 'Official provider documentation',
      sourceUrl: 'https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview',
      inlineUrls: [
        'https://support.claude.com/en/articles/8114491-get-started-with-claude',
        'https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview',
        'https://support.google.com/gemini/answer/13275745?hl=en',
      ],
    },
    'codex-usage-limit-tracker': {
      sourceName: 'OpenAI Help Center',
      sourceUrl: 'https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan',
    },
    'copilot-pricing-tracker': {
      sourceName: 'GitHub Docs',
      sourceUrl: 'https://docs.github.com/en/copilot/get-started/plans',
    },
    'gemini-rate-limit-tracker': {
      sourceName: 'Google AI for Developers',
      sourceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    },
    'meta-open-sources-vision-model': {
      sourceName: 'Meta AI',
      sourceUrl: 'https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/',
    },
    'mistral-raises-series-c': {
      sourceName: 'Mistral AI',
      sourceUrl: 'https://mistral.ai/news/mistral-ai-raises-1-7-b-to-accelerate-technological-progress-with-ai/',
    },
    'openai-ships-new-model': {
      sourceName: 'OpenAI developer documentation',
      sourceUrl: 'https://developers.openai.com/api/docs/models',
    },
  };

  for (const [id, attribution] of Object.entries(expected)) {
    const markdown = src(`src/content/posts/${id}.md`);
    const body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    assert.ok(markdown.includes(`sourceName: "${attribution.sourceName}"`), `${id} has the wrong source name`);
    assert.ok(markdown.includes(`sourceUrl: "${attribution.sourceUrl}"`), `${id} has the wrong source URL`);
    for (const url of attribution.inlineUrls ?? [attribution.sourceUrl]) {
      assert.ok(body.includes(`](${url})`), `${id} must link ${url} in the article copy`);
    }
  }
});

check('tracker and product comparison guides use topic-specific opening headings', () => {
  const expectedHeadings = {
    'chatgpt-plus-limit-tracker': 'How the limit works',
    'claude-usage-limit-tracker': 'How the limit works',
    'claude-vs-chatgpt-vs-gemini': 'How to compare them',
    'codex-usage-limit-tracker': 'How the limit works',
    'copilot-pricing-tracker': 'How plan access works',
    'gemini-rate-limit-tracker': 'How the rate limit works',
  };

  for (const [id, heading] of Object.entries(expectedHeadings)) {
    const markdown = src(`src/content/posts/${id}.md`);
    assert.ok(markdown.includes(`## ${heading}`), `${id} is missing its topic-specific heading`);
    assert.ok(!markdown.includes('## What happened'), `${id} retains the event-reporting heading`);
  }
});

check('publication guard catches concrete scaffolding variants without rejecting source verification', () => {
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
    containsInternalScaffolding('The archive was used to verify a source quotation and build a reliable timeline.'),
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
    assert.equal(containsInternalScaffolding(copy), false, `guard rejected editorial copy: ${copy}`);
  }
});

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
    containsInternalScaffolding(extractPublicCopy('<meta name="description" content="Placeholder fixture post">')),
    true,
    'reader-visible metadata must pass through the publication guard',
  );
  assert.equal(
    containsInternalScaffolding(extractPublicCopy(
      '<script type="application/ld+json">{"headline":"Placeholder fixture post"}</script>',
    )),
    true,
    'JSON-LD metadata must pass through the publication guard',
  );
  assert.equal(
    containsInternalScaffolding(extractPublicCopy('<input placeholder="Placeholder fixture post">')),
    true,
    'form placeholder copy must pass through the publication guard',
  );
  assert.equal(
    containsInternalScaffolding(extractPublicCopy(`
      <script>const headline = 'Placeholder fixture post';</script>
      <style>.placeholder-fixture { display: none; }</style>
    `)),
    false,
    'executable JavaScript and CSS must stay outside the publication guard',
  );
});

check('all generated public HTML is free of internal scaffolding language', () => {
  const htmlFiles = filesUnder(new URL('../dist/', import.meta.url))
    .filter((file) => file.pathname.endsWith('.html'));
  const paths = htmlFiles.map((file) => file.pathname);

  assert.ok(paths.some((path) => path.endsWith('/dist/index.html')), 'homepage HTML was not scanned');
  assert.ok(paths.some((path) => path.includes('/dist/authors/')), 'author HTML was not scanned');
  assert.ok(paths.some((path) => path.includes('/dist/posts/') && path.endsWith('/index.html')), 'standalone post HTML was not scanned');
  assert.ok(paths.some((path) => path.includes('/fragment/')), 'fragment HTML was not scanned');

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
  assert.deepEqual(sortPostsNewestFirst(fixtures).map((post) => post.id), ['alpha', 'beta', 'oldest']);
  assert.equal(getNextOlderPost('alpha', fixtures)?.id, 'beta');
  assert.equal(getNextOlderPost('beta', fixtures)?.id, 'oldest');
  assert.equal(getNextOlderPost('oldest', fixtures), undefined);
  assert.equal(getNextOlderPost('missing', fixtures), undefined);
});

check('article fragments are canonical noindex documents with one append-safe story', () => {
  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  for (const file of postFiles) {
    const id = file.replace(/\.md$/, '');
    const html = dist(`posts/${id}/fragment/index.html`);
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://aisnap\\.in/posts/${id}/">`));
    assert.equal((html.match(/data-continuous-article/g) || []).length, 1);
    assert.match(html, new RegExp(`data-post-id="${id}"`));
    assert.match(html, new RegExp(`data-post-url="/posts/${id}/"`));
    assert.match(html, /data-document-title=/);
    assert.ok(html.includes('class="article-layout"'), 'fragment must use the shared article layout');
    assert.ok(html.includes('class="article-sidebar"'), 'fragment must use the shared article sidebar');
    assert.ok(!html.includes('class="site-header"'), 'fragment duplicated the global header');
    assert.ok(!html.includes('class="site-footer"'), 'fragment duplicated the footer');
    assert.ok(!html.includes('application/ld+json'), 'fragment duplicated article schema');
    assert.ok(!html.includes('data-continuous-stream'), 'fragment nested another controller');
  }
});

check('sitemap publishes standalone posts without article fragments', () => {
  const sitemapFiles = readdirSync(new URL('../dist/', import.meta.url))
    .filter((file) => /^sitemap-\d+\.xml$/.test(file));
  assert.ok(sitemapFiles.length > 0, 'no generated sitemap files found');

  const sitemap = sitemapFiles.map((file) => dist(file)).join('\n');
  assert.ok(!sitemap.includes('/fragment/'), 'sitemap included a noncanonical article fragment');

  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  for (const file of postFiles) {
    const id = file.replace(/\.md$/, '');
    assert.ok(
      sitemap.includes(`<loc>https://aisnap.in/posts/${id}/</loc>`),
      `sitemap omitted standalone article /posts/${id}/`,
    );
  }
});

check('standalone articles expose an accessible next-story fallback', () => {
  const newest = dist('posts/openai-ships-new-model/index.html');
  assert.match(newest, /data-continuous-stream/);
  assert.match(newest, /class="continuous-transition"/);
  assert.match(newest, /class="continuous-next-link"[^>]*href="\/posts\//);
  assert.match(newest, /class="continuous-sentinel"/);
  assert.match(newest, /aria-live="polite"/);

  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  const built = postFiles.map((file) => dist(`posts/${file.replace(/\.md$/, '')}/index.html`));
  assert.equal(built.filter((html) => /class="continuous-next-link"/.test(html)).length, built.length - 1);
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

  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  for (const file of postFiles) {
    const id = file.replace(/\.md$/, '');
    const html = dist(`posts/${id}/index.html`);
    const hasNextStory = /class="continuous-next-link"/.test(html);
    assert.equal(
      controllerModules(html).length,
      hasNextStory ? 1 : 0,
      `${id} must emit one controller module exactly when it has a next story`,
    );
  }

  for (const file of postFiles) {
    const id = file.replace(/\.md$/, '');
    assert.equal(controllerModules(dist(`posts/${id}/fragment/index.html`)).length, 0);
  }
});

check('continuous reader lifecycle and terminal states reject queued loading work', () => {
  assert.equal(canStartContinuousLoad('/fragment/', {
    loading: false,
    failed: false,
    cleanedUp: false,
    terminal: false,
  }), true);

  for (const blockedState of [
    { loading: true, failed: false, cleanedUp: false, terminal: false },
    { loading: false, failed: true, cleanedUp: false, terminal: false },
    { loading: false, failed: false, cleanedUp: true, terminal: false },
    { loading: false, failed: false, cleanedUp: false, terminal: true },
  ]) {
    assert.equal(canStartContinuousLoad('/fragment/', blockedState), false);
  }
  assert.equal(canStartContinuousLoad('', {
    loading: false,
    failed: false,
    cleanedUp: false,
    terminal: false,
  }), false);

  const controller = src('src/scripts/continuous-reader.ts');
  assert.match(controller, /sentinelObserver\.takeRecords\(\)/);
  assert.match(controller, /delete sentinel\.dataset\.nextFragment/);
});

check('persisted page transitions preserve and restore the continuous reader before terminal cleanup', () => {
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
});

check('fragment candidate validation accepts one complete article and rejects malformed responses', () => {
  const article = { marker: 'valid article' };
  const valid = {
    article,
    postId: 'valid-post',
    postUrl: '/posts/valid-post/',
    documentTitle: 'Valid post - AI Snap',
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
});

check('posts resolve validated author profiles into linked bylines and schema', () => {
  const config = src('src/content.config.ts');
  assert.match(config, /const authors = defineCollection/);
  assert.match(config, /author:\s*reference\(['"]authors['"]\)/);

  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  for (const file of postFiles) {
    assert.match(src(`src/content/posts/${file}`), /author:\s*["']ai-snap-editorial["']/);
  }

  const html = dist('posts/openai-ships-new-model/index.html');
  assert.match(html, /class="byline"[^>]*href="\/authors\/ai-snap-editorial\//);
  assert.ok(html.includes('AI Snap Editorial'));
  assert.ok(html.includes('Editorial Desk'));

  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(match[1]);
  assert.equal(schema.author[0].name, 'AI Snap Editorial');
  assert.equal(schema.author[0].url, 'https://aisnap.in/authors/ai-snap-editorial/');
});

check('post listings resolve author references into display names', () => {
  for (const component of [
    'src/components/Stage.astro',
    'src/components/RankedFeature.astro',
    'src/components/ArticleLatest.astro',
  ]) {
    assert.match(src(component), /getEntry/, `${component} must resolve author references`);
  }

  const home = dist('index.html');
  const stage = home.slice(home.indexOf('class="stage"'), home.indexOf('</section>', home.indexOf('class="stage"')));
  assert.ok(stage.includes('By AI Snap Editorial'), 'stage byline should use the author profile name');
  assert.ok(home.includes('class="newsroom-section'), 'homepage newsroom section is missing');
  assert.ok(!home.includes('[object Object]'), 'homepage leaked an unresolved author reference');

  const article = dist('posts/openai-ships-new-model/index.html');
  const latest = article.slice(article.indexOf('class="article-sidebar"'), article.indexOf('</aside>', article.indexOf('class="article-sidebar"')));
  if (latest.includes('sidebar-latest')) {
    assert.ok(latest.includes('AI Snap Editorial'), 'Latest rail should use the author profile name');
  }
  assert.ok(!latest.includes('[object Object]'), 'Latest rail leaked an unresolved author reference');
});

check('author lookups normalize string and object references before resolving', () => {
  const helper = src('src/lib/author-reference.ts');
  assert.match(helper, /typeof reference === ['"]string['"]/);
  assert.match(helper, /reference\.id/);
  assert.equal(getAuthorId('ai-snap-editorial'), 'ai-snap-editorial');
  assert.equal(getAuthorId({ collection: 'authors', id: 'ai-snap-editorial' }), 'ai-snap-editorial');
  assert.equal(getAuthorId({ collection: 'authors', slug: 'ai-snap-editorial' }), 'ai-snap-editorial');

  for (const component of [
    'src/components/Stage.astro',
    'src/components/RankedFeature.astro',
    'src/components/ArticleLatest.astro',
    'src/pages/posts/[id].astro',
    'src/pages/posts/[id]/fragment.astro',
    'src/pages/authors/[author].astro',
  ]) {
    assert.match(src(component), /getAuthorId\(/, `${component} must normalize the author reference`);
  }
});

check('author resolution errors identify the post and missing author slug', () => {
  for (const file of [
    'src/pages/posts/[id].astro',
    'src/components/Stage.astro',
    'src/components/RankedFeature.astro',
    'src/components/ArticleLatest.astro',
  ]) {
    assert.match(
      src(file),
      /Missing author profile for post: \$\{post\.id\} \(author: \$\{authorId\}\)/,
      `${file} must include the post ID and missing author slug in its resolution error`,
    );
  }
});

check('global.css defines the theme tokens and required classes, with no accent colour', () => {
  const css = src('src/styles/global.css');
  // The site is monochrome only — no accent token should exist anywhere to
  // reintroduce a colour by accident.
  assert.ok(!/--accent(-ink)?:/.test(css), 'an accent colour token was reintroduced');
  assert.match(css, /:root\s*\{[\s\S]*?--bg:\s*#ffffff/i, 'light background token missing');
  assert.match(css, /:root\[data-theme=['"]dark['"]\]\s*\{[\s\S]*?--bg:\s*#0a0a0a/i, 'dark background token missing');
  for (const cls of [
    '.frame',
    '.site-header',
    '.masthead',
    '.categories-bar',
    '.stage',
    '.stage-lead',
    '.stage-rail',
    '.lead-headline',
    '.card',
    '.card-feature',
    '.card-compact',
    '.theme-toggle',
    '.newsroom-section',
    '.category-front',
  ]) {
    assert.ok(css.includes(cls), `missing class ${cls}`);
  }
  const header = css.match(/\.site-header\s*\{([\s\S]*?)\n\}/);
  assert.match(header[1], /border-top:\s*4px solid var\(--text\)/, 'header ink rule is missing');
});

check('layout is full width — no max-width cap or raised frame card', () => {
  const css = src('src/styles/global.css');
  const frame = css.match(/\.frame\s*\{([\s\S]*?)\n\}/);
  assert.ok(frame, 'missing .frame rule block');
  assert.ok(!/max-width/.test(frame[1]), '.frame must not cap the layout width');
  assert.ok(!/background/.test(frame[1]), '.frame must not paint a card background');
  assert.ok(!/border-radius/.test(frame[1]), '.frame must not round into a card');
});

check('the explicit theme palette keeps the photographic stage dark', () => {
  const css = src('src/styles/global.css');
  const light = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = css.match(/:root\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(light && dark, 'missing explicit theme blocks');
  assert.match(light[1], /--mark:\s*var\(--text\)/, 'light mode should keep labels neutral');
  assert.match(dark[1], /--bg:\s*#0a0a0a/i, 'dark mode does not set a dark background');
  assert.match(dark[1], /--text:\s*#ffffff/i, 'dark mode does not set white body text');
  // The hero is photography behind white text in both modes, so the stage must
  // re-declare the dark palette rather than inherit the light one.
  const stage = css.match(/\.stage\s*\{([\s\S]*?)\n\}/);
  assert.ok(stage, 'missing stage rule');
  assert.match(stage[1], /--text:\s*#ffffff/i, 'stage must keep white text in light mode');
  // Dark mode must not override --mark at all: it falls through to the
  // :root definition (var(--text)), so it can never silently resolve to a
  // colour again the way it once did when it pointed at --accent.
  assert.ok(!/--mark\s*:/.test(dark[1]), 'dark mode should not redefine --mark — it must inherit the neutral :root value');
});

check('article focus rings use theme-aware marks while dark card tags stay monochrome', () => {
  const css = src('src/styles/global.css');
  const bylineFocus = css.match(/a\.byline:focus-visible\s*\{([\s\S]*?)\n\}/);
  const suggestedStory = css.match(/\.suggested-story\s*\{([\s\S]*?)\n\}/);
  const suggestedTag = css.match(/\.suggested-story-tag\s*\{([\s\S]*?)\n\}/);
  const suggestedFocus = css.match(/\.suggested-story:focus-visible\s*\{([\s\S]*?)\n\}/);

  assert.match(bylineFocus[1], /outline:\s*2px solid var\(--mark\)/, 'byline focus must use the theme-aware mark');
  assert.ok(!/--mark\s*:/.test(suggestedStory[1]), 'dark cards must not override the theme-aware mark token');
  // The card is a fixed ink surface regardless of theme, so its tag is a
  // literal translucent white rather than a token — but it must never be
  // an accent colour.
  assert.match(suggestedTag[1], /color:\s*rgba\(255,\s*255,\s*255,\s*0\.7\)/, 'dark-card tags should be translucent white');
  assert.match(suggestedFocus[1], /outline:\s*2px solid var\(--mark\)/, 'suggested-story focus must use the theme-aware mark');
});

check('headline and masthead use the display and blackletter faces', () => {
  const css = src('src/styles/global.css');
  const displayVar = css.match(/--font-display:\s*([^;]+);/);
  const mastheadVar = css.match(/--font-masthead:\s*([^;]+);/);
  assert.ok(displayVar, 'missing --font-display token');
  assert.ok(mastheadVar, 'missing --font-masthead token');
  assert.match(displayVar[1], /Source Serif 4/, 'display font should be the serif face');
  assert.match(mastheadVar[1], /UnifrakturMaguntia/, 'masthead font should be the blackletter face');

  // The whole point of the swap: no page should still import or reference
  // the old face, in the font stack or as a leftover package import.
  assert.ok(!displayVar[1].includes('Playfair'), 'Playfair Display should be fully replaced, not just deprioritised in the stack');
  const layoutSrc = src('src/layouts/BaseLayout.astro');
  assert.ok(!layoutSrc.includes('playfair-display'), 'BaseLayout still imports the old font package');
  assert.ok(layoutSrc.includes("'@fontsource/source-serif-4'"), 'BaseLayout should import the new font package');

  // The masthead's fallback stack must name a font we actually bundle —
  // Playfair Display was left there once before as a stale fallback after
  // the primary token moved off it.
  assert.ok(!mastheadVar[1].includes('Playfair'), 'masthead fallback should not name an unbundled font');
  assert.match(mastheadVar[1], /Source Serif 4/, 'masthead should fall back to the bundled display font, not a generic serif directly');

  const leadBlock = css.match(/\.lead-headline\s*\{([\s\S]*?)\n\}/);
  assert.ok(leadBlock, 'missing .lead-headline rule block');
  assert.match(leadBlock[1], /font-family:\s*var\(--font-display\)/, 'lead headline is not set in the display serif');
  // The stage forces --text to white for its photographic backdrop, so the
  // headline just follows --text rather than a dedicated colour.
  assert.match(leadBlock[1], /color:\s*var\(--text\)/, 'lead headline should follow --text, not a dedicated colour');
});

check('homepage renders the shell: masthead, dateline, nav, and no persistent subscribe button', () => {
  const html = dist('index.html');
  assert.match(html, /<title>AI Snap \| Daily AI News<\/title>/);
  assert.ok(html.includes('class="masthead"'), 'masthead not rendered');
  assert.ok(html.includes('class="edition-date"'), 'edition dateline not rendered');
  assert.ok(html.includes('class="categories-bar"'), 'categories bar not rendered');
  assert.ok(html.includes('data-theme-toggle'), 'theme toggle not rendered');
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  // The compact Menu dropdown legitimately holds a "Subscribe free" CTA now
  // (approved design), but it must stay inside that collapsed disclosure —
  // the always-visible chrome around it must not.
  const headerWithoutMenuPanel = header.replace(/<details class="menu">[\s\S]*?<\/details>/, '');
  assert.ok(!headerWithoutMenuPanel.includes('subscribe-button'), 'header chrome outside the Menu dropdown should not render a subscribe button');
});

check('the menu is a native details disclosure opening a full-screen overlay', () => {
  const html = dist('index.html');
  assert.ok(html.includes('<details class="menu">'), 'menu should be a native <details> element');
  assert.ok(html.includes('class="menu-panel"'), 'menu panel not rendered');
  // Both glyphs ship; CSS swaps them on [open], so no JS is needed to show a
  // close control.
  assert.ok(html.includes('class="icon-open"'), 'hamburger glyph missing');
  assert.ok(html.includes('class="icon-close"'), 'close glyph missing');
  // Topics now live only in the categories bar's Topics dropdown — the menu
  // panel is site-wide links only, no tag list.
  assert.ok(html.includes('class="menu-list"'), 'site-nav list missing from the menu');
  assert.ok(!html.includes('class="menu-topics"'), 'menu should no longer duplicate the topic list');
  assert.ok(!html.includes('class="menu-more"'), 'old two-group menu layout should be gone');
  const menuPanel = html.slice(html.indexOf('class="menu-panel"'), html.indexOf('</details>', html.indexOf('class="menu-panel"')));
  assert.ok(menuPanel.includes('subscribe-button'), 'menu panel should offer the subscribe CTA');

  const css = src('src/styles/global.css');
  const panel = css.match(/\.menu-panel\s*\{([\s\S]*?)\n\}/);
  assert.ok(panel, 'missing .menu-panel rule block');
  assert.match(panel[1], /position:\s*fixed/, 'menu panel should cover the viewport');
  assert.match(panel[1], /inset:\s*0/, 'menu panel should be inset 0 to fill the screen');
  assert.match(css, /\.menu\[open\]\s+\.icon-close\s*\{[\s\S]*?display:\s*block/, 'close glyph is never revealed on open');
  assert.match(css, /\.menu\[open\]\s+\.icon-open\s*\{[\s\S]*?display:\s*none/, 'hamburger is never hidden on open');
});

check('categories bar separates primary sections from a native topics disclosure', () => {
  const html = dist('index.html');
  const navStart = html.indexOf('class="categories-bar"');
  const nav = html.slice(navStart, html.indexOf('</nav>', navStart));
  const sectionLinks = nav.slice(nav.indexOf('class="section-links"'), nav.indexOf('</div>'));
  const topicMenu = nav.slice(nav.indexOf('<details class="topic-menu">'));
  const topicPanel = topicMenu.slice(topicMenu.indexOf('class="topic-menu-panel"'));

  assert.match(sectionLinks, /href="\/"[^>]*aria-current="page"/, 'Latest should expose the current page on the homepage');
  assert.ok(sectionLinks.includes('href="/trending/"'));
  assert.ok(sectionLinks.includes('href="/trackers/"'));
  assert.equal((sectionLinks.match(/<a\b/g) || []).length, 3, 'only primary sections belong in .section-links');
  assert.ok(topicMenu.startsWith('<details class="topic-menu">'), 'Topics should use a native <details> disclosure');
  assert.match(topicMenu, /<summary[^>]*>[\s\S]*?Topics[\s\S]*?<\/summary>/, 'homepage disclosure should be labelled Topics');
  assert.ok(topicPanel.includes('Browse by topic'), 'topic panel needs an editorial index heading');

  for (const { href } of sourceTopics()) {
    assert.ok(topicPanel.includes(`href="${href}"`), `topic panel is missing ${href}`);
  }
  assert.ok(!sectionLinks.includes('/tag/'), 'topic links must not be flattened into the primary section list');
});

check('article pages render generic Topics without a route-current topic', () => {
  for (const { id } of sourcePosts()) {
    const topicMenu = topicMenuFrom(dist(`posts/${id}/index.html`));
    assert.equal(topicSummaryLabel(topicMenu), 'Topics', `/posts/${id}/ should use the generic Topics label`);
    assert.deepEqual(currentTopicHrefs(topicMenu), [], `/posts/${id}/ must not mark a topic route as current`);
  }
});

check('general pages render generic Topics without a route-current topic', () => {
  const authorIds = filesUnder(new URL('../src/content/authors/', import.meta.url))
    .filter((file) => file.pathname.endsWith('.md'))
    .map((file) => decodeURIComponent(file.pathname.split('/').pop()).replace(/\.md$/, ''));
  const paths = ['index.html', 'trending/index.html', 'trackers/index.html']
    .concat(authorIds.map((id) => `authors/${id}/index.html`));

  for (const path of paths) {
    const topicMenu = topicMenuFrom(dist(path));
    assert.equal(topicSummaryLabel(topicMenu), 'Topics', `${path} should use the generic Topics label`);
    assert.deepEqual(currentTopicHrefs(topicMenu), [], `${path} must not mark a topic route as current`);
  }
});

check('every content-derived tag page labels and marks its own topic current', () => {
  for (const { label, href } of sourceTopics()) {
    const topicMenu = topicMenuFrom(dist(`${href.slice(1)}index.html`));

    assert.equal(topicSummaryLabel(topicMenu), label, `${href} should use its active topic label`);
    assert.deepEqual(currentTopicHrefs(topicMenu), [href], `${href} should mark only itself current`);
  }
});

check('topic dropdown is grouped into a canonical taxonomy, not a flat post-derived list', () => {
  const html = dist('index.html');
  const topicMenu = topicMenuFrom(html);
  const topicPanel = topicMenu.slice(topicMenu.indexOf('class="topic-menu-panel"'));

  for (const group of topicGroups) {
    assert.ok(topicPanel.includes(`<h3>${group.label}</h3>`), `topic panel is missing the "${group.label}" group heading`);
    for (const tag of group.topics) {
      assert.ok(topicPanel.includes(`href="/tag/${slugify(tag)}/"`), `"${group.label}" group is missing its "${tag}" topic`);
    }
  }

  // Trackers is a section (postType-driven), not a topic — keeping both
  // would reintroduce the exact overlap the categories bar redesign removed.
  assert.ok(!knownTopics.includes('Trackers'), 'Trackers should not be part of the topic taxonomy');
});

check('a canonical topic with zero posts still gets a page and a graceful empty state', () => {
  assert.ok(distExists('tag/tutorials/index.html'), '/tag/tutorials/ was not built even though Tutorials is a canonical topic');
  const html = dist('tag/tutorials/index.html');
  assert.ok(html.includes('No stories tagged Tutorials yet.'), 'empty Tutorials category should show the standard no-content message');
  assert.ok(!linksTo(html, 'welcome-to-ai-snap'), 'empty Tutorials category should not list unrelated posts');
});

check('homepage lead story is the most recent post', () => {
  const html = dist('index.html');
  const lead = html.match(/<h1 class="lead-headline">([\s\S]*?)<\/h1>/);
  assert.ok(lead, 'no lead headline rendered');
  // Most recent by pubDate: openai-ships-new-model (2026-07-30).
  assert.ok(
    lead[1].includes('/posts/openai-ships-new-model/'),
    'lead story should be the most recent post'
  );
  assert.match(html, /\d+ min read/, 'read time not rendered');
  assert.ok(html.includes('class="byline-name"'), 'byline not rendered');
});

check('homepage surfaces every post, and marks the current lead in the pager', () => {
  const html = dist('index.html');
  for (const slug of ['welcome-to-ai-snap', 'codex-usage-limit-tracker', 'openai-ships-new-model']) {
    assert.ok(linksTo(html, slug), `missing link to /posts/${slug}/`);
  }
  assert.ok(html.includes('class="lead-pager"'), 'featured-story pager not rendered');
  assert.match(html, /class="current" aria-current="true"/, 'pager does not mark the current lead');
});

check('/trending/ shows only featured posts', () => {
  const html = dist('trending/index.html');
  assert.ok(linksTo(html, 'welcome-to-ai-snap'), 'featured post missing');
  assert.ok(!linksTo(html, 'codex-usage-limit-tracker'), 'non-featured post leaked in');
  assert.ok(!linksTo(html, 'openai-ships-new-model'), 'non-featured post leaked in');
});

check('/trackers/ shows only tracker-type posts', () => {
  const html = dist('trackers/index.html');
  assert.ok(linksTo(html, 'codex-usage-limit-tracker'), 'tracker post missing');
  assert.ok(!linksTo(html, 'openai-ships-new-model'), 'non-tracker post leaked in');
  assert.ok(!linksTo(html, 'welcome-to-ai-snap'), 'non-tracker post leaked in');
});

check('/tag/openai/ shows only OpenAI posts, with that topic active in the nav', () => {
  const html = dist('tag/openai/index.html');
  assert.ok(linksTo(html, 'openai-ships-new-model'));
  assert.ok(linksTo(html, 'codex-usage-limit-tracker'));
  assert.ok(!linksTo(html, 'welcome-to-ai-snap'), 'wrong-tag post leaked into /tag/openai/');
  const navStart = html.indexOf('class="categories-bar"');
  const nav = html.slice(navStart, html.indexOf('</nav>', navStart));
  assert.match(nav, /href="\/tag\/openai\/"[^>]*aria-current="page"/, 'OpenAI topic not marked current in the nav');
});

check('homepage sections use three distinct editorial layouts', () => {
  const html = dist('index.html');
  for (const title of ['Trackers', 'Explainers &amp; comparisons', 'More from today']) {
    assert.ok(html.includes(title), `missing section: ${title}`);
  }
  // Asymmetric band: one dominant story beside a cluster of secondaries.
  assert.ok(html.includes('band-lead'), 'band should have a dominant lead');
  assert.ok(html.includes('band-secondaries'), 'band should have a secondary cluster');
  // Split: illustrated lead beside a numbered stack.
  assert.ok(html.includes('split-lead'), 'split section should have an illustrated lead');
  assert.ok(html.includes('split-rows'), 'split section should have a headline stack');
  // Dense grid.
  assert.ok(html.includes('headline-item'), 'grid section should use headline items');
  assert.match(html, /class="section-link"[^>]*href="\/trackers\/"/, 'Trackers should link to its own page');
});

check('Editor’s Picks is a fourth, distinct newsroom layout: lead, cards, and a signal rail', () => {
  const html = dist('index.html');
  const heading = html.includes("Editor&#39;s Picks") ? "Editor&#39;s Picks" : "Editor's Picks";
  assert.ok(html.includes(heading), 'missing the Editor’s Picks section');

  const start = html.lastIndexOf('<section', html.indexOf(heading));
  const section = html.slice(start, html.indexOf('</section>', start) + '</section>'.length);

  assert.ok(section.includes('class="newsroom-section"'), 'missing the newsroom section shell');
  assert.ok(section.includes('class="newsroom-lead"'), 'missing the lead story');
  const cardCount = (section.match(/class="newsroom-card"/g) || []).length;
  assert.equal(cardCount, 4, `expected exactly 4 secondary photo cards, found ${cardCount}`);
  assert.ok(section.includes('class="newsroom-signal"'), 'missing the editorial signal rail');
  assert.equal((section.match(/class="newsroom-signal-link"/g) || []).length, 1, 'missing the signal rail link');
});

check('Editor’s Picks draws from the featured flag, spanning post types', () => {
  const posts = readdirSync(new URL('../src/content/posts/', import.meta.url));
  const featuredSlugs = posts
    .map((f) => f.replace(/\.md$/, ''))
    .filter((slug) => src(`src/content/posts/${slug}.md`).includes('featured: true'));
  assert.ok(featuredSlugs.length >= 4, 'need enough featured fixtures to populate both the cards and the list');

  const html = dist('index.html');
  const heading = html.includes("Editor&#39;s Picks") ? "Editor&#39;s Picks" : "Editor's Picks";
  const start = html.lastIndexOf('<section', html.indexOf(heading));
  const section = html.slice(start, html.indexOf('</section>', start) + '</section>'.length);

  for (const slug of featuredSlugs.slice(0, 6)) {
    assert.ok(section.includes(`/posts/${slug}/`), `featured post /posts/${slug}/ missing from Editor's Picks`);
  }
});

check('.panel is a toned band that follows the explicit theme palette', () => {
  const css = src('src/styles/global.css');
  const panel = css.match(/\n\.panel\s*\{([\s\S]*?)\n\}/);
  assert.ok(panel, 'missing .panel rule block');
  assert.match(panel[1], /margin:[^;]*calc\(-1 \* var\(--gutter\)\)/, 'panel does not bleed past the gutter');
  assert.match(panel[1], /background:\s*var\(--panel-bg\)/, 'panel should use its own toned background token');
  assert.ok(!/color:/.test(panel[1]), 'panel should not force an ink colour — it stays within the theme, unlike .band');

  const light = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = css.match(/:root\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(light && dark, 'could not locate the explicit theme token blocks');
  assert.match(light[1], /--panel-bg:\s*#f4f4f4/, 'light mode should use a light panel colour');
  assert.match(dark[1], /--panel-bg:\s*#151515/, 'dark mode should use a dark panel colour');
});

check('the band bleeds past the page gutter and paints its own contrast', () => {
  const css = src('src/styles/global.css');
  const band = css.match(/\n\.band\s*\{([\s\S]*?)\n\}/);
  assert.ok(band, 'missing .band rule block');
  // Negating the gutter is what makes the band run edge to edge.
  assert.match(band[1], /margin:[^;]*calc\(-1 \* var\(--gutter\)\)/, 'band does not bleed past the gutter');
  assert.match(band[1], /background:\s*var\(--band-bg\)/, 'band should carry its own saturated field');
  assert.match(band[1], /color:\s*var\(--band-ink\)/, 'band needs its own ink colour');
  // The band paints its own contrast, so its rule takes full-strength ink
  // rather than a colour.
  assert.match(band[1], /--rule:\s*var\(--band-ink\)/, 'band rule should take full-strength ink');
  assert.match(css, /\.frame\s*\{[\s\S]*?padding:[^;]*var\(--gutter\)/, 'frame padding must use the gutter token');
});

check('sections carry no filler copy and lead with headlines', () => {
  const html = dist('index.html');
  // Section subtitles were padding; headlines and images do the work now.
  assert.ok(!html.includes('section-blurb'), 'sections should not reintroduce blurb copy');
  // Band items are headline-only — no deks, dates or read times inside them.
  const band = html.slice(html.indexOf('class="band'), html.indexOf('</section>', html.indexOf('class="band')));
  assert.ok(!/\d+ min read/.test(band), 'band items should not carry read times');
});

check('the closing grid omits stories the stage already showed', () => {
  const html = dist('index.html');
  const grid = html.slice(html.indexOf('More from today'));
  // openai-ships-new-model is the lead, so repeating it a screen later would
  // be redundant.
  assert.ok(
    !grid.includes('/posts/openai-ships-new-model/'),
    'the lead story should not reappear in the closing grid'
  );
  assert.ok(grid.includes('/posts/mistral-raises-series-c/'), 'other stories should still list');
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
  assert.ok(!/animation-timeline/.test(builtCss), 'a scroll-linked animation-timeline was reintroduced in the built CSS');

  // Strip comments before checking: this file's own history comment names
  // animation-timeline while explaining why it was removed, which isn't a
  // reintroduction of the mechanism.
  const source = src('src/styles/global.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/animation-timeline/.test(source), 'a scroll-linked animation-timeline was reintroduced in global.css');
  assert.ok(!/@supports\s*\(animation-timeline/.test(source), 'the removed scroll-reveal @supports block was reintroduced');

  // None of the sections that used to carry the scroll-linked class should
  // still reference it in markup — it no longer does anything.
  for (const component of ['FeatureBand', 'SplitFeature', 'HeadlineGrid', 'NewsroomGrid', 'RankedFeature', 'LatestSection']) {
    assert.ok(!src(`src/components/${component}.astro`).includes('reveal'), `${component}.astro still references the removed reveal class`);
  }

  // The hero's own on-load entrance is a plain, unconditional animation (no
  // scroll timeline involved) and must still respect reduced motion.
  assert.match(source, /\.stage-lead > \*\s*\{[\s\S]*?animation:\s*rise/, 'hero entrance animation missing');
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.stage-lead > \*[\s\S]*?animation:\s*none/,
    'reduced motion must switch the hero entrance off'
  );
});

check('article page renders the fixed §4 template on the site shell', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  // Shell
  assert.ok(html.includes('class="masthead"'), 'article page should use the site shell');
  assert.ok(html.includes('class="categories-bar"'), 'article page missing the categories bar');
  assert.ok(html.includes('class="site-footer"'), 'article page missing the footer');
  // Template blocks
  assert.ok(html.includes('article-kicker'), 'missing topic kicker');
  assert.ok(html.includes('class="article-title"'), 'missing headline');
  assert.ok(html.includes('class="article-standfirst"'), 'missing standfirst');
  assert.ok(html.includes('class="byline-name"'), 'missing byline');
  assert.ok(html.includes('class="article-figure"'), 'missing hero figure');
  assert.ok(html.includes('class="article-sidebar"'), 'missing article sidebar');
  assert.ok(html.includes('Photo: Unsplash'), 'missing cover credit');
  assert.match(html, /Source:[\s\S]*?developers\.openai\.com/, 'missing attributed primary-source link');
  assert.ok(html.includes('class="article-tags"'), 'missing tag list');
  assert.match(html, /\d+ min read/, 'missing read time');
});

check('"Why it matters" comes only from frontmatter, not duplicated in the body', () => {
  // The section is rendered from the whyItMatters field, so a post body that
  // also carries the heading renders it twice.
  for (const slug of ['openai-ships-new-model', 'codex-usage-limit-tracker', 'welcome-to-ai-snap']) {
    const html = dist(`posts/${slug}/index.html`);
    const count = html.split('Why it matters').length - 1;
    assert.equal(count, 1, `"Why it matters" appears ${count}x on /posts/${slug}/ — expected exactly 1`);
  }
});

check('article page emits NewsArticle schema with an image', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'no JSON-LD block found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'NewsArticle');
  assert.ok(Array.isArray(schema.image) && schema.image.length > 0, 'schema image field must be populated');
  assert.ok(schema.headline, 'schema missing headline');
  assert.ok(schema.datePublished, 'schema missing datePublished');
});

check('Suggested Reads replaces Related with deterministic tag-first stories', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  assert.ok(!html.includes('article-related'), 'legacy Related module still rendered');
  const start = html.indexOf('class="suggested-reads');
  const end = html.indexOf('</section>', start);
  const section = html.slice(start, end);
  const urls = [...section.matchAll(/class="suggested-story" href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(urls, [
    '/posts/codex-usage-limit-tracker/',
    '/posts/claude-vs-chatgpt-vs-gemini/',
    '/posts/ai-coding-agents-compared/',
    '/posts/chatgpt-plus-limit-tracker/',
  ]);
  assert.ok(!section.includes('/posts/openai-ships-new-model/'));
  assert.match(section, /aria-labelledby="suggested-reads-openai-ships-new-model"/);
  assert.match(section, /<h2 id="suggested-reads-openai-ships-new-model">Suggested Reads<\/h2>/);
});

check('Suggested Reads requires an article identifier for stream instances without changing standalone props', () => {
  const component = src('src/components/SuggestedReads.astro');
  assert.match(component, /variant\?: 'standalone';\s*articleId\?: string/);
  assert.match(component, /variant: 'stream';\s*articleId: string/);
  assert.match(component, /const \{ posts, variant = 'standalone', articleId \} = Astro\.props/);
  assert.match(component, /suggested-reads-\$\{articleId \?\? variant\}/);
});

check('suggestion ranking handles empty, short, unrelated, and tied candidate sets', () => {
  const post = (id, tags, pubDate) => ({ id, data: { tags, pubDate: new Date(pubDate) } });
  const current = post('current', ['AI', 'Models'], '2026-08-01');

  assert.deepEqual(getSuggestedPosts(current, [current]).map(({ id }) => id), []);
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
  const css = src('src/styles/global.css');
  const layout = css.match(/\.article-layout\s*\{([\s\S]*?)\n\}/);
  const measure = css.match(/\.article-measure\s*\{([\s\S]*?)\n\}/);
  assert.match(layout[1], /grid-template-columns:\s*minmax\(0, 1fr\) 380px/);
  assert.match(layout[1], /gap:\s*52px/);
  assert.ok(!/max-width/.test(layout[1]), 'article canvas should not keep the old width cap');
  assert.match(measure[1], /760px/);
});

check('all standalone articles share the same hero and sidebar shell', () => {
  const postFiles = readdirSync(new URL('../src/content/posts/', import.meta.url));
  for (const file of postFiles) {
    const id = file.replace(/\.md$/, '');
    const html = dist(`posts/${id}/index.html`);
    assert.ok(html.includes('class="article-layout"'), `${id} is missing the article layout`);
    assert.ok(html.includes('class="article-figure"'), `${id} is missing the article hero`);
    assert.ok(html.includes('class="article-sidebar"'), `${id} is missing the article sidebar`);
    assert.equal((html.match(/class="sidebar-section sidebar-(?:latest|trending|topic)"/g) || []).length, 1, `${id} should render one focused sidebar module`);
  }
});

check('article sidebar chooses one focused module and preserves Latest ordering when selected', () => {
  const html = dist('posts/openai-ships-new-model/index.html');
  const start = html.indexOf('class="article-sidebar"');
  const end = html.indexOf('</aside>', start);
  const latest = html.slice(start, end);
  assert.ok(start >= 0 && end > start, 'Latest sidebar missing');
  assert.equal((latest.match(/class="sidebar-section sidebar-(?:latest|trending|topic)"/g) || []).length, 1, 'exactly one sidebar module should render');
  assert.match(latest, /sidebar-(?:latest|trending|topic)/, 'sidebar should choose a supported module');
  if (latest.includes('sidebar-latest')) {
    const latestUrls = [...latest.matchAll(/class="latest-story" href="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(latestUrls, [
      '/posts/codex-usage-limit-tracker/',
      '/posts/welcome-to-ai-snap/',
      '/posts/claude-usage-limit-tracker/',
      '/posts/gemini-rate-limit-tracker/',
      '/posts/claude-vs-chatgpt-vs-gemini/',
    ]);
  }
  assert.ok(latest.includes('class="sidebar-subscribe"'), 'Subscribe sidebar module missing');
  assert.match(src('src/components/ArticleLatest.astro'), /Math\.random\(\)/, 'sidebar module choice should be random');
});

check('standalone and stream Suggested Reads both render four cards', () => {
  const standalone = dist('posts/openai-ships-new-model/index.html');
  const stream = dist('posts/welcome-to-ai-snap/fragment/index.html');
  assert.equal((standalone.match(/class="suggested-story"/g) || []).length, 4);
  assert.equal((stream.match(/class="suggested-story"/g) || []).length, 4);
  assert.match(src('src/pages/posts/[id]/fragment.astro'), /getSuggestedPosts\(post, allPosts, 4\)/);
});

check('article sidebar uses the approved responsive layout', () => {
  const css = src('src/styles/global.css');
  const layout = css.match(/\.article-layout\s*\{([\s\S]*?)\n\}/);
  const sidebar = css.match(/\.article-sidebar\s*\{([\s\S]*?)\n\}/);
  assert.ok(layout && sidebar);
  assert.match(layout[1], /grid-template-columns:\s*minmax\(0, 1fr\) 380px/);
  assert.match(layout[1], /gap:\s*52px/);
  assert.match(sidebar[1], /position:\s*sticky/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.article-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 760px\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.article-layout\s*\{[\s\S]*?gap:\s*0/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.article-sidebar\s*\{[\s\S]*?position:\s*static/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.latest-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.latest-list\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

check('author pages render profiles and every authored story newest first', () => {
  assert.ok(distExists('authors/ai-snap-editorial/index.html'));
  const html = dist('authors/ai-snap-editorial/index.html');
  assert.ok(html.includes('class="author-profile"'));
  assert.ok(html.includes('AI Snap Editorial'));
  assert.ok(html.includes('Editorial Desk'));
  assert.ok(html.includes('11 published stories'));

  const urls = [...html.matchAll(/class="author-story" href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(urls.length, 11);
  assert.equal(urls[0], '/posts/openai-ships-new-model/');
  assert.equal(urls[10], '/posts/copilot-pricing-tracker/');

  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  assert.ok(schemas.some((schema) => schema['@type'] === 'Person'));
});

check('footer renders the newsletter CTA, wordmark, columns and base line', () => {
  const html = dist('index.html');
  const footer = html.slice(html.indexOf('class="site-footer"'));
  assert.ok(footer.includes('class="footer-headline"'), 'missing newsletter headline');
  assert.match(footer, /class="subscribe-button"[^>]*href="https:\/\/aisnap\.substack\.com"/, 'CTA should link to the newsletter');
  assert.ok(footer.includes('class="footer-wordmark"'), 'missing wordmark');
  assert.ok(footer.includes('class="footer-columns"'), 'missing link columns');
  assert.match(footer, /All rights reserved/, 'missing copyright line');
  // Only link pages that exist — About/Privacy/Terms aren't built yet.
  assert.ok(!/href="\/(about|privacy|terms|contact)\/?"/.test(footer), 'footer links a page that is not built');
});

check('Pagefind index is generated and the custom search box is rendered', () => {
  assert.ok(distExists('pagefind/pagefind.js'), 'Pagefind index not generated — check astro-pagefind integration in astro.config.mjs');
  const html = dist('index.html');
  assert.ok(html.includes('id="search-input"'), 'custom search input not rendered');
  assert.ok(html.includes('id="search-results"'), 'custom search results container not rendered');
  assert.ok(!html.includes('<pagefind-searchbox'), 'prebuilt pagefind web component should not be rendered');
});

check('search indexes article bodies only, not listing pages or nav chrome', () => {
  // With data-pagefind-body present anywhere, Pagefind indexes only pages
  // carrying it — keeping /, /trending/ and /tag/* out of the results and
  // excerpts free of masthead/nav text.
  const post = dist('posts/welcome-to-ai-snap/index.html');
  assert.ok(post.includes('data-pagefind-body'), 'article body is not marked as the Pagefind index root');

  const home = dist('index.html');
  assert.ok(!home.includes('data-pagefind-body'), 'listing pages must not declare a Pagefind body');
  const header = home.slice(home.indexOf('<header'), home.indexOf('</header>'));
  assert.ok(header.includes('data-pagefind-ignore'), 'top bar should be excluded from the index');
  // The <header> ignore flag already covers every nav inside it (including
  // the plain site-nav list in the compact Menu dropdown); the categories
  // bar carries its own flag too, so check that one specifically.
  const navStart = home.indexOf('<nav class="categories-bar"');
  const nav = home.slice(navStart, home.indexOf('</nav>', navStart));
  assert.ok(nav.includes('data-pagefind-ignore'), 'categories bar should be excluded from the index');
});

check('no eager Pagefind/component-ui script or stylesheet in the homepage', () => {
  const html = dist('index.html');
  assert.ok(!/<link[^>]*rel="modulepreload"[^>]*pagefind/i.test(html), 'unexpected modulepreload hint for pagefind bundle');
  assert.ok(!/PagefindConfig/i.test(html), 'PagefindConfig component-ui bundle should not be referenced');
  const headSection = html.slice(html.indexOf('<head'), html.indexOf('</head>'));
  assert.ok(!/<script[^>]*type="module"[^>]*src=/i.test(headSection), 'no eager module script should be referenced from <head>');
});

check('astro.config.mjs preserves site, sitemap, and image.remotePatterns config', () => {
  const config = src('astro.config.mjs');
  assert.match(config, /site:\s*['"]https:\/\/aisnap\.in['"]/);
  assert.match(config, /sitemap\(/);
  assert.match(config, /remotePatterns/);
});

check('responsive CSS: stage collapses and topics use a contained responsive grid', () => {
  const css = src('src/styles/global.css');
  const wide = css.match(/@media \(max-width: 1080px\) \{([\s\S]*?)\n\}\n/);
  assert.ok(wide, 'missing @media (max-width: 1080px) block');
  assert.match(wide[1], /grid-template-columns:\s*1fr\s*;/, 'stage does not collapse to a single column');

  const navBlock = css.match(/\.categories-bar\s*\{([\s\S]*?)\n\}/);
  assert.ok(navBlock, 'missing .categories-bar rule block');
  assert.ok(!/overflow-x:\s*auto/.test(navBlock[1]), '.categories-bar must not require horizontal scrolling');

  const topicGrid = css.match(/\.topic-menu-groups\s*\{([\s\S]*?)\n\}/);
  assert.ok(topicGrid, 'missing .topic-menu-groups rule block');
  assert.match(topicGrid[1], /display:\s*grid/, 'topic groups should use a grid');
  assert.match(topicGrid[1], /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'desktop topic groups should use three fluid columns');

  const narrow = css.match(/@media \(max-width: 780px\) \{([\s\S]*?)\n\}/);
  assert.ok(narrow, 'missing narrow viewport rules');
  assert.match(narrow[1], /\.topic-menu-groups\s*\{[\s\S]*?grid-template-columns:\s*1fr/, 'topic groups should stack to one column on narrow screens');

  const narrowest = css.match(/@media \(max-width: 360px\) \{([\s\S]*?)\n\}/);
  assert.ok(narrowest, 'missing narrowest viewport rules for long active topic labels');
  assert.match(narrowest[1], /\.categories-bar\s*\{[\s\S]*?flex-wrap:\s*wrap/, 'categories bar should wrap rather than crowd tabs and Topics onto one line');
  assert.match(narrowest[1], /\.section-links\s*\{[\s\S]*?flex:\s*1 1 100%/, 'primary sections should claim a full row when they wrap');
  assert.match(narrowest[1], /\.topic-menu\s*\{[\s\S]*?flex:\s*1 1 100%/, 'Topics should drop to its own full-width row rather than crowd the tabs');
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
