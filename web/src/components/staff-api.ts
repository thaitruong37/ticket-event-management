'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) as unknown } catch { return text }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const payload = await parseResponse(response)
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `Yêu cầu thất bại (${response.status})`
    throw new ApiError(message, response.status)
  }
  if (typeof payload === 'object' && payload && 'error' in payload) {
    throw new ApiError(String((payload as { error: unknown }).error), response.status)
  }
  return payload as T
}

export function useApi<T>(path: string, fallback: T) {
  const queryClient = useQueryClient()

  const { data, isPending, error, refetch } = useQuery<T, Error>({
    queryKey: [path],
    queryFn: () => apiRequest<T>(path),
    placeholderData: (prev) => prev,
  })

  const reload = useCallback(async () => {
    await refetch()
  }, [refetch])

  const setData = useCallback(
    (updater: T | ((prev: T | undefined) => T)) => {
      queryClient.setQueryData<T>([path], updater)
    },
    [queryClient, path]
  )

  return {
    data: data ?? fallback,
    loading: isPending && data === undefined,
    error: error ? (error instanceof Error ? error.message : 'Không thể tải dữ liệu.') : null,
    reload,
    setData,
  }
}

export const postJson = <T,>(path: string, body: unknown) => apiRequest<T>(path, {
  method: 'POST',
  body: JSON.stringify(body),
})

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}
