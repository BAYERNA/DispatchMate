export function freshDanger<T extends { dangerLevel: string; dangerScore: number; reason: string | null }>(
  data: T | undefined, error: boolean, updatedAt: number, now: number,
): T | undefined {
  if (!data) return undefined
  if (error || !updatedAt || now - updatedAt > 30000) {
    return { ...data, dangerLevel: 'UNKNOWN', dangerScore: 0, reason: error ? '분석 갱신 실패' : '30초 이상 갱신되지 않은 결과' }
  }
  return data
}

