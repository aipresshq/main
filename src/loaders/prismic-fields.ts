// Update this if the repository name chosen in Task 1 differs.
export const PRISMIC_REPOSITORY_NAME = 'aipresshq';
export const PRISMIC_LOCALE = 'en-us';
export const PRISMIC_POST_TYPE = 'post';
export const MAX_FACTS_TABLE_COLUMNS = 6;

export interface FactsTable {
  columns: string[];
  rows: string[][];
}

type FactsTableColumnsField = Array<{ column: string }>;
type FactsTableRowsField = Array<Record<string, string>>;

export function groupFieldsToFactsTable(
  columnsField: FactsTableColumnsField | null | undefined,
  rowsField: FactsTableRowsField | null | undefined,
): FactsTable | undefined {
  const columns = (columnsField ?? []).map((item) => item.column);
  if (columns.length === 0) return undefined;
  const rows = (rowsField ?? []).map((row) =>
    columns.map((_, index) => row[`cell_${index + 1}`] ?? ''),
  );
  return { columns, rows };
}

export function factsTableToGroupFields(
  factsTable: FactsTable | null | undefined,
): { columns: FactsTableColumnsField; rows: FactsTableRowsField } | undefined {
  if (!factsTable) return undefined;
  if (factsTable.columns.length > MAX_FACTS_TABLE_COLUMNS) {
    throw new Error(`facts table supports at most ${MAX_FACTS_TABLE_COLUMNS} columns`);
  }
  return {
    columns: factsTable.columns.map((column) => ({ column })),
    rows: factsTable.rows.map((row) => {
      const cells: Record<string, string> = {};
      row.forEach((cell, index) => {
        cells[`cell_${index + 1}`] = cell;
      });
      return cells;
    }),
  };
}

export function groupFieldToStrings<K extends string>(
  field: Array<Record<K, string>> | null | undefined,
  key: K,
): string[] {
  return (field ?? []).map((item) => item[key]);
}

export function stringsToGroupField<K extends string>(
  values: string[],
  key: K,
): Array<Record<K, string>> {
  return values.map((value) => ({ [key]: value }) as Record<K, string>);
}
