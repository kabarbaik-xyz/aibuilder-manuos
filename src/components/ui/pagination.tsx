import { Button } from './button';
import { Select } from './select';

export interface PaginationMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface PaginationProps extends PaginationMeta {
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  disabled?: boolean;
}
export function Pagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange, disabled }: PaginationProps) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  return <nav className="table-pagination" aria-label="Table pagination">
    <div className="table-pagination-summary" role="status">{total === 0 ? '0 records' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} records`}</div>
    <label className="table-pagination-size">Rows per page<Select aria-label="Rows per page" value={String(pageSize)} disabled={disabled} onChange={event => onPageSizeChange(Number(event.target.value))}>{[10, 25, 50, 100].map(size => <option key={size} value={String(size)}>{size}</option>)}</Select></label>
    <div className="table-pagination-pages"><span className="table-page-label">Page {page} of {totalPages}</span><Button size="small" disabled={disabled || page === 1} onClick={() => onPageChange(1)} aria-label="First page">First</Button><Button size="small" disabled={disabled || page === 1} onClick={() => onPageChange(page - 1)}>Previous</Button>{pages.map(number => <Button key={number} size="small" variant={page === number ? 'soft' : 'ghost'} aria-current={page === number ? 'page' : undefined} aria-label={`Page ${number}`} disabled={disabled} onClick={() => onPageChange(number)}>{number}</Button>)}<Button size="small" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button><Button size="small" disabled={disabled || page >= totalPages} onClick={() => onPageChange(totalPages)} aria-label="Last page">Last</Button></div>
  </nav>;
}
