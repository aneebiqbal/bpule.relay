import { redirect } from 'next/navigation'

/**
 * Compatibility: Team → Tasks moved to Work → /tasks?scope=team.
 * The task engine is one surface; this route only redirects.
 */
export default function TeamTasksRedirect() {
  redirect('/tasks?scope=team')
}
