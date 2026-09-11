"use client"

import * as React from "react"

/**
 * A minimal fixed-row-height windowing list. Only the rows that fit the
 * scrollport (plus a small overscan) are mounted, so a long queue stays smooth
 * to scroll. Rows must have a uniform height (see `rowHeight`).
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderItem,
  className,
  overscan = 4,
}: {
  items: T[]
  rowHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  overscan?: number
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = React.useState(0)
  const [scrollTop, setScrollTop] = React.useState(0)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setViewport(el.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const total = items.length * rowHeight
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(viewport / rowHeight) + overscan * 2
  const end = Math.min(items.length, start + visibleCount)
  const slice = items.slice(start, end)

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={className}
      style={{ overflowY: "auto" }}
    >
      <div style={{ height: total, position: "relative" }}>
        {slice.map((item, i) => {
          const index = start + i
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                top: index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
