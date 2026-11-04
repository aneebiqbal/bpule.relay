import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Drawer } from '@/components/ui/drawer'

/**
 * A deep link can open a drawer before hydration (?task=…). Portals need
 * document.body, which does not exist while React is server-rendering — the
 * drawer must wait for mount instead of touching `document`.
 */
describe('DRAWER_SSR_SAFETY', () => {
  it('renders an open drawer during server rendering without touching document', () => {
    let html = ''
    expect(() => {
      html = renderToStaticMarkup(
        createElement(Drawer, { open: true, onClose: () => {}, title: 'Task' }, createElement('p', null, 'body')),
      )
    }).not.toThrow()
    // Nothing is painted on the server; the portal appears after mount.
    expect(html).toBe('')
  })

  it('still renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      createElement(Drawer, { open: false, onClose: () => {}, title: 'Task' }, createElement('p', null, 'body')),
    )
    expect(html).toBe('')
  })
})
