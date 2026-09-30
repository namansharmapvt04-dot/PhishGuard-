import { API_PREFIX, tokenStore } from '../api/client'

export interface SSEMessage {
  event: string
  data: Record<string, unknown>
}

/**
 * The backend exposes campaign generation as an authenticated POST that streams
 * `text/event-stream`. The native EventSource API only does GET and can't send
 * an Authorization header, so we consume the stream with fetch + a reader and
 * parse SSE frames ("event:" / "data:") by hand.
 *
 * Returns an AbortController so the caller can cancel the stream on unmount.
 */
export function streamGeneration(
  campaignId: string,
  handlers: {
    onMessage: (msg: SSEMessage) => void
    onError?: (err: Error) => void
    onDone?: () => void
  },
): AbortController {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(`${API_PREFIX}/campaigns/${campaignId}/generate`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: tokenStore.access ? `Bearer ${tokenStore.access}` : '',
        },
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let detail = `Generation failed (HTTP ${res.status})`
        try {
          const body = await res.json()
          if (body?.detail) detail = String(body.detail)
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // SSE frames are separated by a blank line (\n\n).
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const rawFrame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const parsed = parseFrame(rawFrame)
          if (parsed) handlers.onMessage(parsed)
        }
      }
      handlers.onDone?.()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      handlers.onError?.(err as Error)
    }
  })()

  return controller
}

function parseFrame(frame: string): SSEMessage | null {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }

  if (!dataLines.length) return null
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return { event, data: { raw: dataLines.join('\n') } }
  }
}
