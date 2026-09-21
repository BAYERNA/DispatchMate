import { apiRequest, notifyRequest } from './client'
import type { StatisticsSummary } from '../types'

export function getStatisticsSummary(): Promise<StatisticsSummary> {
  return apiRequest<StatisticsSummary>('/api/v1/statistics/summary')
}

export interface AiFeedbackStats {reviewedCount:number;correctCount:number;falsePositiveCount:number;falseNegativeCount:number;correctPercent:number|null;precisionPercent:number|null;recallPercent:number|null;f1ScorePercent:number|null}
export function getAiFeedbackStats():Promise<AiFeedbackStats>{return notifyRequest('/ai-feedback/stats')}
