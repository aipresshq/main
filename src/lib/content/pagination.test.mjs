import assert from 'node:assert/strict';
import { paginateEntries, parsePageNumber } from './pagination.ts';

assert.equal(parsePageNumber(undefined), 1);
assert.equal(parsePageNumber('2'), 2);
assert.equal(parsePageNumber('0'), undefined);
assert.equal(parsePageNumber('nope'), undefined);
assert.deepEqual(paginateEntries([1, 2, 3, 4, 5], '2', 2)?.data, [3, 4]);
assert.equal(paginateEntries([1], '2', 2), undefined);
console.log('✓ runtime pagination validates and slices page parameters');
