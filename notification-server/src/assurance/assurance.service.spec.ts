import { AssuranceService } from './assurance.service';

describe('AssuranceService organization isolation', () => {
  const admin: any = { userId: 'u', role: 'ADMIN', organizationId: 'org-1' };

  it('rejects a temporary access grant scoped to another organization\'s incident before writing anything', async () => {
    const db: any = { query: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new AssuranceService(db, orgScope);

    await expect(
      service.temporaryGrant(admin, { userId: 'target', permission: 'READ', reason: 'test', incidentId: 'incident-in-org-2' }),
    ).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('allows a temporary access grant with no incidentId without consulting organization scope', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([{ grantId: 'g', expiresAt: new Date() }]) };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new AssuranceService(db, orgScope);

    await service.temporaryGrant(admin, { userId: 'target', permission: 'READ', reason: 'test' });
    expect(orgScope.assertIncident).not.toHaveBeenCalled();
  });
});

// 데이터 보존(retention) preview/approve/execute 흐름은 radio_transcripts/
// indoor_position_updates/evidence_assets/immutable_audit_events 자체에는
// organization_id가 없다 — incidents로 조인해서만 어느 조직 것인지 알 수 있다.
// 여기서 스코프가 하나라도 빠지면 한 조직의 관리자가 다른 조직의 무선 교신 기록·위치
// 이력·증거·감사 로그를 세거나(preview), 승인하거나(approve), 실제로 지우고
// 익명화할(execute) 수 있게 된다 — 그중 execute가 가장 치명적이다: preview에서만
// 조직별로 후보를 세고 실제 UPDATE/DELETE 구문에는 organization_id 조건이 없다면,
// 승인된 계획 하나로 cutoff 이전의 "모든 조직" 데이터가 지워진다.
describe('AssuranceService retention organization isolation', () => {
  const admin: any = { userId: 'u', role: 'ADMIN', organizationId: 'org-1' };

  it('previewRetention은 후보 카운트/샘플링/생성된 실행계획을 모두 호출자 조직으로 스코프한다', async () => {
    const db: any = { query: jest.fn() };
    db.query
      .mockResolvedValueOnce([
        { policy_id: 'p1', data_category: 'radio_transcript', retention_days: 90, action: 'ANONYMIZE', legal_hold: false, enabled: true },
      ])
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ ref: 't1' }, { ref: 't2' }])
      .mockResolvedValueOnce([{ executionId: 'e1', status: 'PREVIEW' }]);
    const service = new AssuranceService(db, {} as any);

    await service.previewRetention('p1', admin);

    const [countSql, countParams] = db.query.mock.calls[1];
    expect(countSql).toContain('i.organization_id=$2');
    expect(countParams[1]).toBe('org-1');

    const [sampleSql, sampleParams] = db.query.mock.calls[2];
    expect(sampleSql).toContain('i.organization_id=$2');
    expect(sampleParams[1]).toBe('org-1');

    const [insertSql, insertParams] = db.query.mock.calls[3];
    expect(insertSql).toContain('retention_execution_plans(policy_id,organization_id');
    expect(insertParams[1]).toBe('org-1');
  });

  it('approveRetention은 호출자 조직 소유의 실행계획만 승인할 수 있다', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([]) };
    const service = new AssuranceService(db, {} as any);

    await expect(service.approveRetention('e1', admin)).rejects.toThrow();

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('organization_id=$3');
    expect(params).toEqual(['e1', 'u', 'org-1']);
  });

  it('executeRetention은 실행계획 조회뿐 아니라 실제 DELETE/UPDATE 구문도 조직으로 다시 스코프한다', async () => {
    const manager = { query: jest.fn() };
    manager.query
      .mockResolvedValueOnce([
        { execution_id: 'e1', status: 'APPROVED', cutoff_at: '2020-01-01T00:00:00.000Z', organization_id: 'org-1', data_category: 'location_history', action: 'DELETE' },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ position_id: 'pos-1' }])
      .mockResolvedValueOnce([{ executionId: 'e1', status: 'SUCCEEDED', executedCount: 1 }]);
    const db: any = { manager: { transaction: (fn: any) => fn(manager) } };
    const service = new AssuranceService(db, {} as any);

    await service.executeRetention('e1', admin);

    const [selectSql, selectParams] = manager.query.mock.calls[0];
    expect(selectSql).toContain('e.organization_id=$2');
    expect(selectParams).toEqual(['e1', 'org-1']);

    const [deleteSql, deleteParams] = manager.query.mock.calls[2];
    expect(deleteSql).toContain('i.organization_id=$2');
    expect(deleteParams).toEqual(['2020-01-01T00:00:00.000Z', 'org-1']);
  });

  it('overview()의 최근 실행계획 목록도 호출자 조직으로 스코프한다', async () => {
    const db: any = {
      query: jest.fn((sql: string) => {
        if (sql.includes('FROM retention_execution_plans')) return Promise.resolve([]);
        if (sql.includes('FROM privileged_action_approvals')) return Promise.resolve([{ count: 0 }]);
        if (sql.includes('attestation_status') && sql.includes('managed_field_devices') && sql.includes('COUNT(*)')) {
          return Promise.resolve([{ total: 0, verified: 0 }]);
        }
        if (sql.includes('FROM offline_asset_manifests')) return Promise.resolve([{ total: 0, verified: 0 }]);
        return Promise.resolve([]);
      }),
    };
    const service = new AssuranceService(db, {} as any);

    await service.overview(admin);

    const retentionCall = db.query.mock.calls.find(([sql]: [string]) => sql.includes('FROM retention_execution_plans'));
    expect(retentionCall![0]).toContain('WHERE organization_id=$1');
    expect(retentionCall![1]).toEqual(['org-1']);
  });
});
