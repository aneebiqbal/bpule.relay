# Responsive & accessibility

## Measured

| Check | Result |
|---|---|
| axe WCAG 2.1 A/AA sweep, Inbox fixture, 1440 / 1024 / 375 | **0 critical / 0 serious** in every sweep |
| Queue states × roles axe sweep | clean |
| Unauthenticated route render (112 routes) | 0 page errors |

## Fixed since the previous sprint

- `V4Drawer`: Escape, Tab trap, scroll lock, focus restore (prior sprint, preserved).
- `Dialog`: focus trap, body scroll lock, `max-h-[90dvh] overflow-y-auto` (prior sprint, preserved).

## Not measured

- Authenticated surfaces at 390 / 768 / 1280 / 1440 and 200% zoom.
- Horizontal-overflow sweep of every table at 390px.
- Screen-reader pass on Work Setup, setup assistant or assignment drawer.

Static review found wide tables wrapped in `overflow-x-auto` with mobile card alternatives; no
automated confirmation was taken. These remain open, not claimed.
