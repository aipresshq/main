import assert from 'node:assert/strict';
import { buildFormatFacets } from './facets.ts';
import { storyFormats } from './formats.ts';

const run = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

const post = (id, format) => ({ id, data: { format } });

run('an empty archive offers no filter at all', () => {
  assert.deepEqual(buildFormatFacets([], []), []);
});

run('only formats that exist in the archive are offered', () => {
  const archive = [post('a', 'analysis'), post('b', 'tutorial')];
  const keys = buildFormatFacets(archive, archive).map((f) => f.key);
  assert.deepEqual(keys, ['explainer', 'analysis', 'tutorial'].filter((k) => keys.includes(k)));
  assert.ok(!keys.includes('comparison'), 'an unused format must not be offered');
  assert.equal(keys.length, 2);
});

run('counts come from the archive, not from the page', () => {
  // The whole point of the fix: page one holds two analysis stories, the archive
  // holds four, and the filter has to know the difference.
  const archive = [
    post('a', 'analysis'),
    post('b', 'analysis'),
    post('c', 'analysis'),
    post('d', 'analysis'),
    post('e', 'tutorial'),
  ];
  const page = [archive[0], archive[1]];

  const facets = buildFormatFacets(archive, page);
  const analysis = facets.find((f) => f.key === 'analysis');
  assert.equal(analysis.total, 4, 'total should span the archive');
  assert.equal(analysis.onThisPage, 2, 'onThisPage should count only this page');
});

run('a format absent from this page is still offered', () => {
  // Previously this option simply vanished on page two, so the same archive
  // presented different choices depending on where you were in it.
  const archive = [post('a', 'analysis'), post('b', 'tutorial')];
  const page = [archive[0]];

  const facets = buildFormatFacets(archive, page);
  const tutorial = facets.find((f) => f.key === 'tutorial');
  assert.ok(tutorial, 'tutorial must still be offered on a page that has none');
  assert.equal(tutorial.total, 1);
  assert.equal(tutorial.onThisPage, 0);
});

run('every facet links to the route that shows all of its matches', () => {
  const archive = [post('a', 'analysis')];
  const [facet] = buildFormatFacets(archive, archive);
  assert.equal(facet.href, '/format/analysis/');
});

run('facet order follows the canonical format order, not appearance order', () => {
  const canonical = storyFormats.map((f) => f.key);
  const archive = [post('a', canonical[3]), post('b', canonical[0]), post('c', canonical[1])];

  const keys = buildFormatFacets(archive, archive).map((f) => f.key);
  const expected = canonical.filter((k) => keys.includes(k));
  assert.deepEqual(keys, expected, 'the control must not reshuffle between pages');
});

run('labels come from the format definitions, not from the data', () => {
  const archive = [post('a', 'analysis')];
  const [facet] = buildFormatFacets(archive, archive);
  const definition = storyFormats.find((f) => f.key === 'analysis');
  assert.equal(facet.label, definition.label);
});

run('an empty page of a non-empty archive still offers the full filter', () => {
  const archive = [post('a', 'analysis'), post('b', 'tutorial')];
  const facets = buildFormatFacets(archive, []);
  assert.equal(facets.length, 2);
  assert.deepEqual(
    facets.map((f) => f.onThisPage),
    [0, 0],
  );
});
