import { API_BASE, tokenStore } from '../api/client'

export interface SSEMessage {
  event: string
  data: Record<string, unknown>
}

interface StreamHandlers {
  onMessage: (msg: SSEMessage) => void
  onError?: (err: Error) => void
  onDone?: () => void
}

/**
 * Shared frame-consuming loop for both the one-shot generation POST and the
 * reconnect GET below. Neither can use the native EventSource API — it only
 * does GET and can't send an Authorization header — so both consume
 * `text/event-stream` via fetch + a reader and parse SSE frames by hand.
 */
function streamRequest(url: string, method: 'GET' | 'POST', handlers: StreamHandlers): AbortController {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: 'text/event-stream',
          Authorization: tokenStore.access ? `Bearer ${tokenStore.access}` : '',
        },
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let detail = `Request failed (HTTP ${res.status})`
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

/**
 * Starts a brand-new generation run. Returns an AbortController, but the
 * caller should NOT abort this on unmount — the pipeline is driven by this
 * same request on the server; cancelling it stops generation outright, not
 * just the UI's view of it. Aborting is only for an explicit user cancel.
 */
export function streamGeneration(campaignId: string, handlers: StreamHandlers): AbortController {
  return streamRequest(`${API_BASE}/campaigns/${campaignId}/generate`, 'POST', handlers)
}

/**
 * Reconnects to a generation run already in progress (or just finished) —
 * replays everything logged so far, then tails new events. Safe to abort
 * freely (e.g. on unmount): it's a read-only view, not what drives the
 * pipeline.
 */
export function streamGenerationProgress(campaignId: string, handlers: StreamHandlers): AbortController {
  return streamRequest(`${API_BASE}/campaigns/${campaignId}/generate/stream`, 'GET', handlers)
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
