import assert from 'node:assert/strict';
import { paginateEntries, paginateRepository, parsePageNumber } from './pagination.ts';

assert.equal(parsePageNumber(undefined), 1);
assert.equal(parsePageNumber('2'), 2);
assert.equal(parsePageNumber('0'), undefined);
assert.equal(parsePageNumber('nope'), undefined);
assert.deepEqual(paginateEntries([1, 2, 3, 4, 5], '2', 2)?.data, [3, 4]);
assert.equal(paginateEntries([1], '2', 2), undefined);
const calls = [];
const repository = {
  async countPosts(filters) {
    calls.push({ type: 'count', filters });
    return 250;
  },
  async listPosts(options) {
    calls.push({ type: 'list', options });
    return Array.from({ length: options.limit }, (_, index) => ({ id: options.offset + index }));
  },
};
const repositoryPage = await paginateRepository(repository, { tag: 'AI' }, '11', 12);
assert.equal(repositoryPage.total, 250);
assert.equal(repositoryPage.lastPage, 21);
assert.equal(repositoryPage.data[0].id, 120);
assert.deepEqual(calls[1].options, { tag: 'AI', limit: 12, offset: 120 });
console.log('✓ runtime pagination validates and slices page parameters');
