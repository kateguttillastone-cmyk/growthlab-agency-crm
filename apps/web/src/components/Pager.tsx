import { Button } from "./ui";

export function Pager({
  total,
  offset,
  pageSize,
  onChange,
}: {
  total: number;
  offset: number;
  pageSize: number;
  onChange: (offset: number) => void;
}) {
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <span aria-live="polite">
        {total} résultat(s) — page {page} / {pages}
      </span>
      <span className="space-x-2">
        <Button
          variant="ghost"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - pageSize))}
        >
          Précédent
        </Button>
        <Button
          variant="ghost"
          disabled={offset + pageSize >= total}
          onClick={() => onChange(offset + pageSize)}
        >
          Suivant
        </Button>
      </span>
    </nav>
  );
}
