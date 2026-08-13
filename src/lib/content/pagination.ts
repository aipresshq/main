import { ARCHIVE_PAGE_SIZE } from '../pagination.ts';

export function parsePageNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return 1;
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function paginateEntries<T>(
  entries: T[],
  value: string | undefined,
  pageSize = ARCHIVE_PAGE_SIZE,
) {
  const currentPage = parsePageNumber(value);
  if (!currentPage) return undefined;
  const lastPage = Math.max(1, Math.ceil(entries.length / pageSize));
  if (currentPage > lastPage) return undefined;
  const start = (currentPage - 1) * pageSize;
  return {
    data: entries.slice(start, start + pageSize),
    currentPage,
    lastPage,
    size: pageSize,
    total: entries.length,
    start,
    end: Math.min(start + pageSize - 1, Math.max(0, entries.length - 1)),
  };
}
