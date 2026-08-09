import assert from 'node:assert/strict';
import { ARCHIVE_PAGE_SIZE, buildPaginationItems } from './pagination.ts';

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

const numbers = (items) => items.map((item) => (item.type === 'gap' ? '…' : item.page));

run('a single page needs no navigation at all', () => {
  assert.deepEqual(buildPaginationItems({ currentPage: 1, lastPage: 1 }), []);
});

run('every page is listed while they still fit in the window', () => {
  const items = buildPaginationItems({ currentPage: 1, lastPage: 5 });
  assert.deepEqual(numbers(items), [1, 2, 3, 4, 5]);
  assert.equal(items[0].current, true);
  assert.equal(items[1].current, false);
});

run('the current page keeps its neighbours when the list is truncated', () => {
  // Both ends stay reachable, and the current page never sits against a gap —
  // otherwise "next" is the only way forward and deep pages become unreachable.
  assert.deepEqual(numbers(buildPaginationItems({ currentPage: 6, lastPage: 12 })), [
    1,
    '…',
    5,
    6,
    7,
    '…',
    12,
  ]);
});

run('a short archive lists every page rather than showing an ellipsis', () => {
  assert.deepEqual(numbers(buildPaginationItems({ currentPage: 4, lastPage: 7 })), [
    1, 2, 3, 4, 5, 6, 7,
  ]);
});

run('a gap is never used to hide a single page', () => {
  // Collapsing one page behind an ellipsis costs a click and saves no space, so
  // page 2 is rendered instead of a gap between 1 and 3.
  assert.deepEqual(numbers(buildPaginationItems({ currentPage: 4, lastPage: 9 })), [
    1,
    2,
    3,
    4,
    5,
    '…',
    9,
  ]);
  assert.deepEqual(numbers(buildPaginationItems({ currentPage: 6, lastPage: 9 })), [
    1,
    '…',
    5,
    6,
    7,
    8,
    9,
  ]);
});

run('the ends collapse toward the middle', () => {
  assert.deepEqual(numbers(buildPaginationItems({ currentPage: 1, lastPage: 12 })), [
    1,
    2,
    '…',
    12,
  ]);
  assert.deepEqual(numbers(buildPaginationItems({ currentPage: 12, lastPage: 12 })), [
    1,
    '…',
    11,
    12,
  ]);
});

run('exactly one page is ever marked current', () => {
  for (const lastPage of [1, 2, 5, 9, 40]) {
    for (let currentPage = 1; currentPage <= lastPage; currentPage += 1) {
      const items = buildPaginationItems({ currentPage, lastPage });
      if (lastPage === 1) continue;
      const current = items.filter((item) => item.current);
      assert.equal(current.length, 1, `page ${currentPage} of ${lastPage}`);
      assert.equal(current[0].page, currentPage);
    }
  }
});

run('page numbers never repeat and never go backwards', () => {
  for (const lastPage of [2, 3, 8, 15, 60]) {
    for (let currentPage = 1; currentPage <= lastPage; currentPage += 1) {
      const pages = buildPaginationItems({ currentPage, lastPage })
        .filter((item) => item.type === 'page')
        .map((item) => item.page);
      assert.deepEqual(
        pages,
        [...new Set(pages)],
        `duplicate page on ${currentPage}/${lastPage}: ${pages}`,
      );
      assert.deepEqual(
        pages,
        [...pages].sort((a, b) => a - b),
        `out of order on ${currentPage}/${lastPage}: ${pages}`,
      );
      assert.equal(pages.at(0), 1, `first page missing on ${currentPage}/${lastPage}`);
      assert.equal(pages.at(-1), lastPage, `last page missing on ${currentPage}/${lastPage}`);
    }
  }
});

run('two adjacent gaps never appear', () => {
  for (const lastPage of [10, 25, 100]) {
    for (let currentPage = 1; currentPage <= lastPage; currentPage += 1) {
      const items = buildPaginationItems({ currentPage, lastPage });
      for (let index = 1; index < items.length; index += 1) {
        assert.ok(
          !(items[index].type === 'gap' && items[index - 1].type === 'gap'),
          `adjacent gaps on ${currentPage}/${lastPage}`,
        );
      }
    }
  }
});

run('nonsense input degrades to no navigation instead of throwing', () => {
  assert.deepEqual(buildPaginationItems({ currentPage: 0, lastPage: 0 }), []);
  assert.deepEqual(buildPaginationItems({ currentPage: 3, lastPage: 1 }), []);
  assert.deepEqual(buildPaginationItems({ currentPage: NaN, lastPage: 5 }), []);
  assert.deepEqual(buildPaginationItems({}), []);
});

run('the archive page size is a sane editorial default', () => {
  assert.ok(Number.isInteger(ARCHIVE_PAGE_SIZE));
  assert.ok(ARCHIVE_PAGE_SIZE >= 6 && ARCHIVE_PAGE_SIZE <= 30, `got ${ARCHIVE_PAGE_SIZE}`);
});
