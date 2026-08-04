import assert from 'node:assert/strict';
import {
  groupFieldsToFactsTable,
  factsTableToGroupFields,
  groupFieldToStrings,
  stringsToGroupField,
} from './prismic-fields.ts';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const sampleColumnsField = [{ column: 'Model' }, { column: 'Price' }];
const sampleRowsField = [{ cell_1: 'Luna Max', cell_2: '$20/mo' }];

await test('groupFieldsToFactsTable combines the columns and rows groups', () => {
  const result = groupFieldsToFactsTable(sampleColumnsField, sampleRowsField);
  assert.deepEqual(result, { columns: ['Model', 'Price'], rows: [['Luna Max', '$20/mo']] });
});

await test('groupFieldsToFactsTable returns undefined when there are no columns', () => {
  assert.equal(groupFieldsToFactsTable(undefined, sampleRowsField), undefined);
  assert.equal(groupFieldsToFactsTable(null, null), undefined);
  assert.equal(groupFieldsToFactsTable([], []), undefined);
});

await test('groupFieldsToFactsTable ignores unused cell_N subfields beyond the column count', () => {
  const columns = [{ column: 'A' }];
  const rows = [{ cell_1: 'x', cell_2: 'unused', cell_3: 'unused' }];
  assert.deepEqual(groupFieldsToFactsTable(columns, rows), { columns: ['A'], rows: [['x']] });
});

await test('factsTableToGroupFields is the inverse of groupFieldsToFactsTable', () => {
  const factsTable = { columns: ['Model', 'Price'], rows: [['Luna Max', '$20/mo']] };
  const { columns, rows } = factsTableToGroupFields(factsTable);
  assert.deepEqual(groupFieldsToFactsTable(columns, rows), factsTable);
});

await test('factsTableToGroupFields returns undefined when there is no facts table', () => {
  assert.equal(factsTableToGroupFields(undefined), undefined);
});

await test('factsTableToGroupFields throws when there are more than 6 columns', () => {
  const factsTable = { columns: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], rows: [] };
  assert.throws(() => factsTableToGroupFields(factsTable));
});

await test('groupFieldToStrings extracts one subfield from every group item', () => {
  const field = [{ tag: 'OpenAI' }, { tag: 'Funding' }];
  assert.deepEqual(groupFieldToStrings(field, 'tag'), ['OpenAI', 'Funding']);
});

await test('groupFieldToStrings returns an empty array for a null or undefined field', () => {
  assert.deepEqual(groupFieldToStrings(null, 'tag'), []);
  assert.deepEqual(groupFieldToStrings(undefined, 'tag'), []);
});

await test('stringsToGroupField is the inverse of groupFieldToStrings', () => {
  const values = ['OpenAI', 'Funding'];
  assert.deepEqual(groupFieldToStrings(stringsToGroupField(values, 'tag'), 'tag'), values);
});

if (process.exitCode === 1) {
  console.log('\nSome checks failed.');
} else {
  console.log('\nAll checks passed.');
}
