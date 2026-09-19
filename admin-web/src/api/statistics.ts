import { apiRequest, notifyRequest } from './client'
import type { StatisticsSummary } from '../types'

export function getStatisticsSummary(): Promise<StatisticsSummary> {
  return apiRequest<StatisticsSummary>('/api/v1/statistics/summary')
}

export interface AiFeedbackStats {reviewedCount:number;falsePositiveCount:number;falseNegativeCount:number;correctPercent:number|null}
export function getAiFeedbackStats():Promise<AiFeedbackStats>{return notifyRequest('/ai-feedback/stats')}
