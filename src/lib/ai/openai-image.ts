export interface ImageGenResult {
  url: string
}

export async function generatePostImage(
  prompt: string,
  opts?: { size?: string }
): Promise<ImageGenResult> {
  const apiKey = process.env.OPENAI_API_KEY_IMAGE || process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY_IMAGE not configured')

  const size = opts?.size || '1792x1024'

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: prompt.slice(0, 1000),
      n: 1,
      size,
      quality: 'high',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI image generation failed: ${res.status} ${err.slice(0, 200)}`)
  }

  const json = await res.json()
  const item = json.data?.[0]
  if (!item) throw new Error('OpenAI returned no image data')

  // gpt-image-1 returns base64, dall-e-3 returns url
  if (item.b64_json) {
    return { url: `data:image/png;base64,${item.b64_json}` }
  }
  if (item.url) {
    return { url: item.url }
  }
  throw new Error('OpenAI returned no image')
}
