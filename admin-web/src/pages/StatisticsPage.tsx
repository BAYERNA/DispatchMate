import { useQuery } from '@tanstack/react-query'
import { AdminLayout } from '../components/AdminLayout'
import { StatCard } from '../components/StatCard'
import { BarChart } from '../components/BarChart'
import { getAiFeedbackStats, getFireRiskRegions, getStatisticsSummary } from '../api/statistics'
import type { FireRiskRegion } from '../api/statistics'

const RISK_GRADE_COLOR: Record<FireRiskRegion['riskGrade'], string> = {
  상: 'var(--color-alert)',
  중: 'var(--color-drone)',
  하: 'var(--color-success)',
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}분 ${s}초`
}

const JUDGMENT_TYPE_LABEL: Record<string, string> = {
  PRE_ANALYSIS: '사전분석',
  REPORT_SOP_MATCH: 'SOP대조',
  RISK_DETECTION: '위험감지',
  CCTV_DETECTION: 'CCTV감지',
  DRONE_RECON: '드론정찰',
}

// ADM-009 기관 통계 대시보드 (FR-13, FR-27)
export function StatisticsPage() {
  const query = useQuery({ queryKey: ['statistics-summary'], queryFn: getStatisticsSummary })
  const feedbackQuery = useQuery({ queryKey: ['ai-feedback-stats'], queryFn: getAiFeedbackStats })
  const fireRiskQuery = useQuery({ queryKey: ['fire-risk-regions'], queryFn: getFireRiskRegions })
  const data = query.data
  const topRiskRegions = (fireRiskQuery.data ?? []).slice(0, 5)

  return (
    <AdminLayout screenId="ADM-009" title="기관 통계 대시보드">
      {query.isLoading && <div className="spinner-text">불러오는 중…</div>}
      {query.isError && <div className="banner error">통계를 불러오지 못했습니다.</div>}

      {data && (
        <>
          <div className="stat-grid">
            <StatCard value={data.totalAiJudgments} label="AI 판단 총 건수" />
            <StatCard value={`${data.sopMatchAccuracyPercent}%`} label="SOP 대조 정확도" />
            <StatCard value={`${data.reviewCompletionRatePercent}%`} label="검토 완료율" />
            <StatCard value={`${data.averageJudgmentSeconds}초`} label="평균 판정 시간" />
          </div>

          <div className="wf" style={{ marginBottom: 14, borderColor: 'var(--color-drone)' }}>
            <div className="wf-header" style={{ background: 'var(--color-drone-fill)', color: 'var(--color-drone)', borderColor: 'var(--color-drone)' }}>
              <span>🚁 골든타임 단축효과 (FR-27)</span>
            </div>
            <div className="wf-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div className="wf-box">
                <span className="label">기존 평균 출동시간</span>
                {formatSeconds(data.goldenTime.existingAverageSeconds)}
              </div>
              <div className="wf-box" style={{ borderColor: 'var(--color-success)' }}>
                <span className="label">드론 활용 시 현장 최초 도착</span>
                {formatSeconds(data.goldenTime.droneAverageArrivalSeconds)}
              </div>
              <div className="wf-box" style={{ borderColor: 'var(--color-drone)', background: 'var(--color-drone-fill)' }}>
                <span className="label">단축 효과</span>
                {data.goldenTime.reductionSeconds != null ? `평균 ${formatSeconds(data.goldenTime.reductionSeconds)} 단축` : '드론 출동 이력 없음'}
              </div>
            </div>
          </div>

          <div className="wf" style={{ marginBottom: 14, borderColor: 'var(--color-alert)' }}>
            <div className="wf-header" style={{ background: 'var(--color-alert-fill)', color: 'var(--color-alert)', borderColor: 'var(--color-alert)' }}>
              <span>🔥 CCTV 자동 화재감지 (FR-24)</span>
            </div>
            <div className="wf-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div className="wf-box">
                <span className="label">감지 건수</span>
                {data.cctvDetectionCount}건
              </div>
              <div className="wf-box">
                <span className="label">관제실 수동 등록 비율 (ADM-010)</span>
                {data.manualDetectionRatioPercent != null ? `${data.manualDetectionRatioPercent}%` : '감지 이력 없음'}
              </div>
              <div className="wf-box">
                <span className="label">평균 위험도 점수</span>
                {data.averageCctvDangerScore != null ? `${data.averageCctvDangerScore}점` : '감지 이력 없음'}
              </div>
            </div>
          </div>

          <div className="wf" style={{ marginBottom: 14 }}>
            <div className="wf-header">
              <span>위험지역 Top 5 (Fire Risk Score)</span>
            </div>
            <div className="wf-body">
              {fireRiskQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
              {fireRiskQuery.isError && <div className="banner error">위험지역 데이터를 불러오지 못했습니다.</div>}
              {fireRiskQuery.data && (
                <table className="wf-table">
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>지역</th>
                      <th>위험도 점수</th>
                      <th>등급</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRiskRegions.map((region) => (
                      <tr key={region.regionCode}>
                        <td>{region.rank}</td>
                        <td>{region.regionName}</td>
                        <td>{region.riskScore}</td>
                        <td>
                          <span className="tag" style={{ color: RISK_GRADE_COLOR[region.riskGrade] }}>
                            {region.riskGrade}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {topRiskRegions.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center' }}>
                          아직 계산된 위험지역 데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
              <div className="alert-meta">소방청 화재이력 6개 지표를 정규화해 산출한 지역별 상대 위험도입니다 — 전국 절대 기준이 아니라 마지막으로 제출된 지역 묶음 내 상대 순위입니다.</div>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: 14 }}>
            <BarChart label="월별 AI 판단 빈도" data={data.monthlyJudgmentCounts} />
            <BarChart
              label="유형별 AI 판단 빈도"
              data={data.judgmentTypeFrequency.map((d) => ({ ...d, label: JUDGMENT_TYPE_LABEL[d.label] ?? d.label }))}
            />
          </div>

          <div className="wf" style={{marginBottom:14}}><div className="wf-header"><span>현장 검토 기반 AI 성능</span></div><div className="wf-body">
            {feedbackQuery.isError&&<div className="banner error">AI 피드백 통계를 불러오지 못했습니다.</div>}
            {feedbackQuery.data&&<div className="stat-grid"><StatCard value={feedbackQuery.data.reviewedCount} label="검토 건수"/><StatCard value={feedbackQuery.data.correctPercent==null?'—':`${feedbackQuery.data.correctPercent}%`} label="정확도(Accuracy)"/><StatCard value={feedbackQuery.data.precisionPercent==null?'—':`${feedbackQuery.data.precisionPercent}%`} label="정밀도(Precision)"/><StatCard value={feedbackQuery.data.recallPercent==null?'—':`${feedbackQuery.data.recallPercent}%`} label="재현율(Recall)"/><StatCard value={feedbackQuery.data.f1ScorePercent==null?'—':`${feedbackQuery.data.f1ScorePercent}%`} label="F1 Score"/><StatCard value={feedbackQuery.data.falsePositiveCount} label="오탐"/><StatCard value={feedbackQuery.data.falseNegativeCount} label="미탐"/></div>}
            <div className="alert-meta">현장 지휘관이 직접 평가한 건만 집계합니다. 검토 표본이 적으면 모델 전체 성능으로 해석할 수 없습니다.</div>
          </div></div>

          <div className="wf">
            <div className="wf-header">
              <span>최근 AI 판단 이력</span>
            </div>
            <div className="wf-body">
              <table className="wf-table">
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>유형</th>
                    <th>신뢰도</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentJudgments.map((item, index) => (
                    <tr key={index}>
                      <td>{new Date(item.createdAt).toLocaleString('ko-KR')}</td>
                      <td>{JUDGMENT_TYPE_LABEL[item.judgmentType] ?? item.judgmentType}</td>
                      <td>{item.confidenceScore != null ? `${item.confidenceScore}%` : '—'}</td>
                    </tr>
                  ))}
                  {data.recentJudgments.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center' }}>
                        판단 이력이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  )
}
