"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"
import { cn } from "cn"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table"
import { Checkbox } from "./checkbox"
import { Skeleton } from "./skeleton"

export type SortDir = "asc" | "desc"

/** Responsive column hiding: the mobile card carries the essential cells. */
function hideBelowClass(hideBelow?: Column<unknown>["hideBelow"]): string {
  switch (hideBelow) {
    case "sm":
      return "hidden sm:table-cell"
    case "md":
      return "hidden md:table-cell"
    case "lg":
      return "hidden lg:table-cell"
    case "xl":
      return "hidden xl:table-cell"
    case "2xl":
      return "hidden 2xl:table-cell"
    default:
      return ""
  }
}

export interface SortState {
  key: string
  dir: SortDir
}

export interface Column<T> {
  key: string
  header: React.ReactNode
  render: (row: T) => React.ReactNode
  /** Defaults to `key`. The value reported by onSortChange. */
  sortKey?: string
  align?: "left" | "right" | "center"
  /** Hide below this breakpoint — the mobile card carries the essential cells. */
  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl"
  className?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  caption?: string
  /** Controlled sort. The page owns the URL state; the table never sorts itself. */
  sort?: SortState | null
  onSortChange?: (sort: SortState | null) => void
  selectable?: boolean
  selectedKeys?: ReadonlySet<string>
  onSelectionChange?: (keys: Set<string>) => void
  /** Rendered when at least one row is selected. */
  bulkActions?: React.ReactNode
  loading?: boolean
  loadingRows?: number
  empty?: React.ReactNode
  error?: string | null
  onRowClick?: (row: T) => void
  /** Compact record card rendered below md instead of the table. */
  renderCard?: (row: T) => React.ReactNode
  density?: "default" | "roomy"
  /** Pagination / footer slot. */
  footer?: React.ReactNode
  /** When set, the table scrolls inside this height and the header sticks. */
  maxHeight?: string
  className?: string
}

/**
 * The one operational table. Sorting is controlled (the page owns URL state),
 * selection is controlled or internal, and the mobile card mode is opt-in per
 * surface. Rows are 44px (default) or 52px (roomy) with 13px operational text.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  sort,
  onSortChange,
  selectable,
  selectedKeys,
  onSelectionChange,
  bulkActions,
  loading = false,
  loadingRows = 8,
  empty,
  error,
  onRowClick,
  renderCard,
  density = "default",
  footer,
  maxHeight,
  className,
}: DataTableProps<T>) {
  const [internalSelection, setInternalSelection] = useState<Set<string>>(() => new Set())
  const selected = selectedKeys ?? internalSelection
  const setSelected = onSelectionChange ?? setInternalSelection

  const keys = useMemo(() => rows.map(rowKey), [rows, rowKey])
  const allSelected = keys.length > 0 && keys.every((key) => selected.has(key))
  const someSelected = keys.some((key) => selected.has(key))

  function toggleAll() {
    const next = new Set(selected)
    if (allSelected) keys.forEach((key) => next.delete(key))
    else keys.forEach((key) => next.add(key))
    setSelected(next)
  }

  function toggleKey(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  function requestSort(column: Column<T>) {
    if (!onSortChange) return
    const key = column.sortKey ?? column.key
    if (sort?.key !== key) {
      onSortChange({ key, dir: "asc" })
      return
    }
    if (sort.dir === "asc") {
      onSortChange({ key, dir: "desc" })
      return
    }
    onSortChange(null)
  }

  const cellPad = density === "roomy" ? "py-4" : "py-3"
  const span = columns.length + (selectable ? 1 : 0)
  const clickable = Boolean(onRowClick)

  const header = (
    <TableHeader>
      <TableRow>
        {selectable ? (
          <TableHead className="w-10 sticky top-0 z-10 bg-bone">
            <Checkbox checked={allSelected} onChange={toggleAll} ariaLabel="Select all rows" />
          </TableHead>
        ) : null}
        {columns.map((column) => {
          const sortKey = column.sortKey ?? column.key
          const active = sort?.key === sortKey
          return (
            <TableHead
              key={column.key}
              aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
              className={cn(
                "sticky top-0 z-10 bg-bone",
                hideBelowClass(column.hideBelow),
                column.align === "right" && "text-right",
                column.align === "center" && "text-center",
                column.className,
              )}
            >
              {/* A header-less column (row actions) has nothing to sort by and no name for the button. */}
              {onSortChange && column.header !== '' && column.header != null ? (
                <button
                  type="button"
                  onClick={() => requestSort(column)}
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors",
                    active ? "text-ink" : "text-stone hover:text-ink",
                    column.align === "right" && "flex-row-reverse",
                  )}
                >
                  {column.header}
                  {active ? (
                    sort!.dir === "asc" ? (
                      <ChevronUp className="size-3" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-3" aria-hidden="true" />
                    )
                  ) : (
                    <ChevronsUpDown className="size-3 opacity-40" aria-hidden="true" />
                  )}
                </button>
              ) : (
                column.header
              )}
            </TableHead>
          )
        })}
      </TableRow>
    </TableHeader>
  )

  const body = loading ? (
    <TableBody>
      {Array.from({ length: loadingRows }).map((_, index) => (
        <TableRow key={index}>
          {selectable ? (
            <TableCell className={cn(cellPad, "w-10")}>
              <Skeleton className="size-4" />
            </TableCell>
          ) : null}
          {columns.map((column) => (
            <TableCell key={column.key} className={cn(cellPad, hideBelowClass(column.hideBelow), column.className)}>
              <Skeleton className="h-3.5 w-3/4" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  ) : error ? (
    <TableBody>
      <TableRow>
        <TableCell colSpan={span} className="p-0">
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" role="alert">
            <AlertTriangle className="size-5 text-status-danger" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">Could not load these records.</p>
            <p className="text-[13px] text-graphite">{error}</p>
          </div>
        </TableCell>
      </TableRow>
    </TableBody>
  ) : rows.length === 0 ? (
    <TableBody>
      <TableRow>
        <TableCell colSpan={span} className="p-0">
          {empty}
        </TableCell>
      </TableRow>
    </TableBody>
  ) : (
    <TableBody>
      {rows.map((row) => {
        const key = rowKey(row)
        const isSelected = selected.has(key)
        return (
          <TableRow
            key={key}
            data-state={isSelected ? "selected" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onRowClick!(row) : undefined}
            onKeyDown={
              clickable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onRowClick!(row)
                    }
                  }
                : undefined
            }
            className={cn(
              clickable && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/30",
            )}
          >
            {selectable ? (
              <TableCell className={cn(cellPad, "w-10")} onClick={(event) => event.stopPropagation()}>
                <Checkbox checked={isSelected} onChange={() => toggleKey(key)} ariaLabel="Select row" />
              </TableCell>
            ) : null}
            {columns.map((column) => (
              <TableCell
                key={column.key}
                className={cn(
                  cellPad,
                  hideBelowClass(column.hideBelow),
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                  column.className,
                )}
              >
                {column.render(row)}
              </TableCell>
            ))}
          </TableRow>
        )
      })}
    </TableBody>
  )

  const tableBlock = (
    <div
      className="overflow-auto"
      style={maxHeight ? { maxHeight } : undefined}
    >
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {header}
        {body}
      </Table>
    </div>
  )

  return (
    <div className={cn("space-y-3", className)}>
      {selectable && someSelected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-bone-raised/40 px-3 py-2">
          <p className="text-[13px] text-ink">
            <span className="font-medium">{selected.size}</span> selected
          </p>
          <div className="flex flex-wrap items-center gap-2">{bulkActions}</div>
        </div>
      ) : null}

      <div className="rounded-xl border border-line bg-bone">
        {renderCard ? (
          <>
            <div className="hidden md:block">{tableBlock}</div>
            <div className="md:hidden">
              {loading ? (
                Array.from({ length: loadingRows }).map((_, index) => (
                  <div key={index} className="space-y-2 border-b border-line/60 p-4 last:border-b-0">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                ))
              ) : error ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" role="alert">
                  <AlertTriangle className="size-5 text-status-danger" aria-hidden="true" />
                  <p className="text-sm font-medium text-ink">Could not load these records.</p>
                  <p className="text-[13px] text-graphite">{error}</p>
                </div>
              ) : rows.length === 0 ? (
                empty
              ) : (
                rows.map((row) => (
                  <div
                    key={rowKey(row)}
                    className={cn(
                      "border-b border-line/60 p-4 last:border-b-0",
                      clickable && "cursor-pointer",
                    )}
                    onClick={clickable ? () => onRowClick!(row) : undefined}
                  >
                    {renderCard(row)}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          tableBlock
        )}
      </div>

      {footer}
    </div>
  )
}
