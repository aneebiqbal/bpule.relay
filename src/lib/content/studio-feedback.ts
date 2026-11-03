/** Studio feedback copy — one contract for every action that writes. */
export function copyFeedbackLabel(copied: boolean): string {
  return copied ? 'Copied' : 'Copy'
}

export function saveFeedbackLabel(saved: boolean): string {
  return saved ? 'Draft saved' : 'Save draft'
}

export function publishFeedbackLabel(posted: boolean): string {
  return posted ? 'Marked published' : 'Mark published'
}
