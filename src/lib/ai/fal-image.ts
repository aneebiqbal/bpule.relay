export interface FalImageResult {
  url: string
  seed?: number
}

export async function generatePostImage(
  prompt: string,
  opts?: { aspectRatio?: string; model?: string }
): Promise<FalImageResult> {
  const apiKey = process.env.FAL_API_KEY
  if (!apiKey) throw new Error('FAL_API_KEY not configured')

  const model = opts?.model || 'fal-ai/flux/dev'
  const imageSize = opts?.aspectRatio === '16:9' ? 'landscape_16_9' : opts?.aspectRatio === '1:1' ? 'square' : 'landscape_16_9'

  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: imageSize,
      num_images: 1,
      enable_safety_checker: true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`FAL generation failed: ${res.status} ${err.slice(0, 200)}`)
  }

  const json = await res.json()
  const imageUrl = json.images?.[0]?.url
  if (!imageUrl) throw new Error('FAL returned no image')

  return { url: imageUrl, seed: json.seed }
}
