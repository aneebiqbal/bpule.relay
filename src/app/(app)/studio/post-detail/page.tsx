'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SimplePostEditor } from '@/components/post-editor-simple'

interface PostData {
  id: string
  title: string
  angle: string
  whyNow: string
  postCaption: string
  territory?: string
  trendGrounded?: boolean
  platform?: string
  visualType?: string | null
  visualConcept?: string | null
  visualPrompt?: string | null
  qualityResult?: {
    overall: number
    dimensions: Record<string, number>
    failures: string[]
  } | null
}

export default function PostDetailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ideaId = searchParams.get('ideaId')
    if (!ideaId) {
      setError('No post specified')
      setLoading(false)
      return
    }

    // Try sessionStorage first (always available for any idea)
    try {
      const stored = sessionStorage.getItem(`studio-idea-${ideaId}`)
      if (stored) {
        setPost(JSON.parse(stored))
        setLoading(false)
        return
      }
    } catch { /* ignore */ }

    // Try database fetch (for persisted ideas)
    fetch(`/api/content/personas/ideas/${ideaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setPost(data)
        } else {
          setError('Post not found')
        }
      })
      .catch(() => setError('Failed to load post'))
      .finally(() => setLoading(false))
  }, [searchParams])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bone">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cobalt/30 border-t-cobalt" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bone">
        <div className="text-center space-y-3">
          <p className="text-sm text-status-danger">{error || 'Post not found'}</p>
          <button onClick={() => router.back()} className="text-sm text-graphite hover:underline">
            Go back
          </button>
        </div>
      </div>
    )
  }

  return <SimplePostEditor post={post} />
}
