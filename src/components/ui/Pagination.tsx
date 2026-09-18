import Link from 'next/link';

type Props = {
  page: { page: number; pageSize: number; total: number; pageCount: number };
  /** The current query string, so paging does not drop the active filters. */
  params: Record<string, string>;
  basePath: string;
};

const hrefFor = (basePath: string, params: Record<string, string>, page: number) => {
  const next = new URLSearchParams({ ...params, page: String(page) });
  return `${basePath}?${next.toString()}`;
};

export function Pagination({ page, params, basePath }: Props) {
  const first = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);

  const linkClass =
    'rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50';
  const mutedClass =
    'rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-300 cursor-not-allowed';

  return (
    <div className="flex items-center justify-between gap-4 pt-4 text-sm text-neutral-500">
      <p className="tabular-nums">
        {first}–{last} of {page.total}
      </p>
      <div className="flex gap-2">
        {page.page > 1 ? (
          <Link href={hrefFor(basePath, params, page.page - 1)} className={linkClass}>
            Previous
          </Link>
        ) : (
          <span className={mutedClass}>Previous</span>
        )}
        {page.page < page.pageCount ? (
          <Link href={hrefFor(basePath, params, page.page + 1)} className={linkClass}>
            Next
          </Link>
        ) : (
          <span className={mutedClass}>Next</span>
        )}
      </div>
    </div>
  );
}
