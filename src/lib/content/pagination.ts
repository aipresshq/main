import { ARCHIVE_PAGE_SIZE } from '../pagination.ts';
import type { ListPostOptions } from './repository.ts';
import type { PostEntry } from './types.ts';

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

type PageRepository = {
  countPosts(options?: Omit<ListPostOptions, 'limit' | 'offset'>): Promise<number>;
  listPosts(options?: ListPostOptions): Promise<PostEntry[]>;
};

export async function paginateRepository(
  repository: PageRepository,
  filters: Omit<ListPostOptions, 'limit' | 'offset'>,
  value: string | undefined,
  pageSize = ARCHIVE_PAGE_SIZE,
) {
  const currentPage = parsePageNumber(value);
  if (!currentPage) return undefined;
  const total = await repository.countPosts(filters);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > lastPage) return undefined;
  const start = (currentPage - 1) * pageSize;
  const data = await repository.listPosts({ ...filters, limit: pageSize, offset: start });
  return {
    data,
    currentPage,
    lastPage,
    size: pageSize,
    total,
    start,
    end: Math.min(start + data.length - 1, Math.max(0, total - 1)),
  };
}
