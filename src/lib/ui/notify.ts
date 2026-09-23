import type { ToastInput } from '@/components/ui/toast'

type Push = (toast: ToastInput) => void

let pushToast: Push | null = null
let lastKey = ''
let lastAt = 0

export function bindToast(push: Push | null) {
  pushToast = push
}

/** Show a toast. Identical messages inside 2.5s collapse to one. */
export function notify(toast: ToastInput) {
  const key = `${toast.variant ?? 'default'}|${toast.description ?? toast.title}`
  const now = Date.now()
  if (key === lastKey && now - lastAt < 2500) return
  lastKey = key
  lastAt = now
  pushToast?.(toast)
}

export function notifyError(description: string, title = 'Something failed') {
  const message = description.trim()
  if (!message) return
  notify({ title, description: message, variant: 'destructive' })
}
