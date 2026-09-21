// Optional PostgreSQL-WASM integration check. Does not access a production database.
// Build first; set PGLITE_ROOT to an independently installed @electric-sql/pglite directory.
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

if (!process.env.PGLITE_ROOT) throw new Error('Set PGLITE_ROOT to the installed @electric-sql/pglite directory');
const root = pathToFileURL(`${process.env.PGLITE_ROOT}/`);
const { PGlite } = await import(new URL('dist/index.js', root));
const { pgcrypto } = await import(new URL('dist/contrib/pgcrypto.js', root));
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { DeliveryService } = require('../dist/alerts/delivery.service.js');
const { AckService } = require('../dist/acknowledgements/ack.service.js');
const { OperationsService } = require('../dist/operations/operations.service.js');
const { MissionService } = require('../dist/mission/mission.service.js');
const { AutomationService } = require('../dist/mission/automation.service.js');
const { AdvancedOperationsService } = require('../dist/advanced-operations/advanced-operations.service.js');
const { GovernanceService } = require('../dist/governance/governance.service.js');
const { AssuranceService } = require('../dist/assurance/assurance.service.js');
const { FieldIntelligenceService } = require('../dist/field-intelligence/field-intelligence.service.js');
const db = new PGlite({ extensions: { pgcrypto } });
const migrations = new URL('../../backend/src/main/resources/db/migration/', import.meta.url);
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const incident = uuid(1), otherIncident = uuid(2), a = uuid(11), b = uuid(12), inactive = uuid(13), later = uuid(14);
const historical = uuid(20), broadcast = uuid(21), targeted = uuid(22);
let checks = 0;
try {
  const files = (await readdir(migrations)).filter(name => /^V[1-7]__/.test(name)).sort();
  for (const file of files) await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  for (const [userId, status] of [[a, 'ACTIVE'], [b, 'ACTIVE'], [inactive, 'INACTIVE'], [later, 'ACTIVE']]) {
    await rows(`INSERT INTO users(user_id,name,role,badge_number,password_hash,status)
      VALUES($1,$2,'RESPONDER',$2,'test',$3)`, [userId, userId.slice(-4), status]);
  }
  for (const id of [incident, otherIncident]) {
    await rows(`INSERT INTO incidents(incident_id,incident_number,incident_type,reported_at,status)
      VALUES($1,$2,'FIRE',now(),'IN_PROGRESS')`, [id, id.slice(-4)]);
  }
  for (const userId of [a, b, inactive]) {
    await rows('INSERT INTO incident_assignments(incident_id,user_id) VALUES($1,$2)', [incident,userId]);
  }
  await rows('INSERT INTO alerts(alert_id,incident_id) VALUES($1,$2)', [historical,incident]);
  await db.exec(await readFile(new URL('V8__alert_delivery_tracking.sql', migrations), 'utf8'));
  await db.exec(await readFile(new URL('V9__operations_timeline_training_and_ai_feedback.sql', migrations), 'utf8'));
  await db.exec(await readFile(new URL('V10__mission_control_and_operational_readiness.sql', migrations), 'utf8'));
  await db.exec(await readFile(new URL('V11__field_safety_and_operational_intelligence.sql', migrations), 'utf8'));
  await db.exec(await readFile(new URL('V12__resilience_governance_and_federation.sql', migrations), 'utf8'));
  await db.exec(await readFile(new URL('V13__production_assurance_and_policy_execution.sql', migrations), 'utf8'));
  await db.exec(await readFile(new URL('V14__field_integration_and_decision_support.sql', migrations), 'utf8'));
  const delivery = new DeliveryService({ query: rows });
  const operator = {userId:uuid(99),role:'COMMANDER'};
  const user = {userId:a,role:'RESPONDER'};
  assert.equal((await delivery.status(incident, operator))[0].tracked, false);
  checks++;
  await rows('INSERT INTO alerts(alert_id,incident_id) VALUES($1,$2)', [broadcast,incident]);
  await rows('INSERT INTO alerts(alert_id,incident_id,target_user_id) VALUES($1,$2,$3)', [targeted,incident,a]);
  let status = await delivery.status(incident, operator);
  assert.equal(status.find(row=>row.alertId===broadcast).recipients.length, 2);
  assert.deepEqual(status.find(row=>row.alertId===targeted).recipients.map(row=>row.userId), [a]);
  checks++;
  await rows('INSERT INTO incident_assignments(incident_id,user_id) VALUES($1,$2)', [incident,later]);
  assert.equal((await delivery.status(incident, operator)).find(row=>row.alertId===broadcast).recipients.length, 2);
  checks++;
  await delivery.receive(otherIncident,user,[broadcast]);
  await delivery.receive(incident,{userId:b,role:'RESPONDER'},[targeted]);
  assert.equal((await rows('SELECT count(*)::int AS n FROM alert_deliveries WHERE received_at IS NOT NULL'))[0].n,0);
  checks++;
  await delivery.receive(incident,user,[broadcast,broadcast]);
  const first = (await rows('SELECT received_at FROM alert_deliveries WHERE alert_id=$1 AND user_id=$2',[broadcast,a]))[0].received_at;
  await delivery.receive(incident,user,[broadcast]);
  assert.deepEqual((await rows('SELECT received_at FROM alert_deliveries WHERE alert_id=$1 AND user_id=$2',[broadcast,a]))[0].received_at,first);
  assert.equal((await rows('SELECT count(*)::int AS n FROM alert_deliveries WHERE acknowledged_at IS NOT NULL'))[0].n,0);
  checks++;

  // Repository adapter executes the service's transaction, lock and real SQL triggers.
  const ackRepository = {
    manager: { transaction: callback => db.transaction(async tx => callback({
      query: (sql,args) => tx.query(sql,args),
      getRepository: () => ({
        create: value => value,
        findOne: async ({where}) => (await tx.query(`SELECT ack_id AS "ackId", alert_id AS "alertId",
          user_id AS "userId", acknowledged_at AS "acknowledgedAt" FROM alert_acknowledgements
          WHERE alert_id=$1 AND user_id=$2 ORDER BY acknowledged_at DESC LIMIT 1`,[where.alertId,where.userId])).rows[0],
        save: async value => (await tx.query(`INSERT INTO alert_acknowledgements(alert_id,user_id) VALUES($1,$2)
          RETURNING ack_id AS "ackId", acknowledged_at AS "acknowledgedAt"`,[value.alertId,value.userId])).rows[0],
      }),
    })) },
  };
  const ack = new AckService(ackRepository, {findOne: async ({where}) =>
    (await rows('SELECT alert_id AS "alertId", incident_id AS "incidentId", target_user_id AS "targetUserId" FROM alerts WHERE alert_id=$1',[where.alertId]))[0]},
    {broadcastToIncident() {}});
  const [one,two] = await Promise.all([ack.acknowledge(targeted,a),ack.acknowledge(targeted,a)]);
  assert.equal(one.ackId,two.ackId);
  assert.equal((await rows('SELECT count(*)::int AS n FROM alert_acknowledgements'))[0].n,1);
  const confirmed = (await delivery.status(incident,operator)).find(row=>row.alertId===targeted).recipients[0];
  assert.ok(confirmed.receivedAt);
  assert.ok(confirmed.acknowledgedAt);
  checks++;
  await assert.rejects(delivery.status(incident,user));
  checks++;
  await assert.rejects(db.transaction(async tx => {
    await tx.query('INSERT INTO alerts(alert_id,incident_id) VALUES($1,$2)',[uuid(50),incident]);
    throw new Error('rollback');
  }));
  assert.equal((await rows('SELECT count(*)::int AS n FROM alert_deliveries WHERE alert_id=$1',[uuid(50)]))[0].n,0);
  checks++;
  const commander=uuid(90);
  await rows(`INSERT INTO users(user_id,name,role,badge_number,password_hash,status) VALUES($1,'지휘관','COMMANDER','0090','test','ACTIVE')`,[commander]);
  const admin=uuid(91);
  await rows(`INSERT INTO users(user_id,name,role,badge_number,password_hash,status) VALUES($1,'관리자','ADMIN','0091','test','ACTIVE')`,[admin]);
  const operations=new OperationsService({query:rows});
  const commanderUser={userId:commander,badgeNumber:'0090',role:'COMMANDER'};
  const adminUser={userId:admin,badgeNumber:'0091',role:'ADMIN'};
  const secondAdmin=uuid(92);await rows(`INSERT INTO users(user_id,name,role,badge_number,password_hash,status) VALUES($1,'보안관리자','ADMIN','0092','test','ACTIVE')`,[secondAdmin]);
  const secondAdminUser={userId:secondAdmin,badgeNumber:'0092',role:'ADMIN'};
  const training=await operations.createTraining(commanderUser,'지하 화재 훈련','FIRE');
  await operations.trainingAction(training.trainingId,commanderUser,'START');
  await operations.trainingAction(training.trainingId,commanderUser,'EVENT','통신 음영 발생');
  await operations.trainingAction(training.trainingId,commanderUser,'COMPLETE');
  const trainingRow=(await operations.trainingList(commanderUser))[0];
  assert.equal(trainingRow.status,'COMPLETED');assert.equal(trainingRow.events[0].note,'통신 음영 발생');checks++;
  const judgment=uuid(70);
  await rows(`INSERT INTO ai_judgment_logs(judgment_id,judgment_type,related_incident_id,summary) VALUES($1,'CCTV_DETECTION',$2,'연기 감지')`,[judgment,incident]);
  await operations.feedback(judgment,commanderUser,'FALSE_POSITIVE','수증기');
  await operations.feedback(judgment,commanderUser,'CORRECT','현장 확인');
  const judgment2=uuid(71),judgment3=uuid(72);
  await rows(`INSERT INTO ai_judgment_logs(judgment_id,judgment_type,related_incident_id,summary) VALUES($1,'CCTV_DETECTION',$2,'감지 실패'),($3,'CCTV_DETECTION',$2,'오탐지')`,[judgment2,incident,judgment3]);
  await operations.feedback(judgment2,commanderUser,'FALSE_NEGATIVE','현장에서 놓친 발화점');
  await operations.feedback(judgment3,commanderUser,'FALSE_POSITIVE','촬영 반사광');
  // correct=1, falsePositive=1, falseNegative=1 → precision=recall=f1=50%(반올림)
  const stats=(await operations.feedbackStats(commanderUser))[0];
  assert.equal(stats.reviewedCount,3);assert.equal(stats.correctCount,1);
  assert.equal(stats.falsePositiveCount,1);assert.equal(stats.falseNegativeCount,1);
  assert.equal(stats.precisionPercent,50);assert.equal(stats.recallPercent,50);assert.equal(stats.f1ScorePercent,50);checks++;
  const timeline=await operations.timeline(incident,commanderUser);assert.ok(timeline.some(event=>event.eventType==='ALERT_ACKNOWLEDGED'));assert.ok(timeline.some(event=>event.eventType==='AI_JUDGMENT'));checks++;
  await assert.rejects(async()=>operations.timeline(incident,{userId:a,badgeNumber:'0011',role:'RESPONDER'}));checks++;
  const alertsCreated=[];
  const missionRepo={query:rows,manager:{transaction:callback=>db.transaction(async tx=>callback({query:async (sql,args)=>(await tx.query(sql,args)).rows}))}};
  const mission=new MissionService(missionRepo,{createFromSystem:async value=>{alertsCreated.push(value);return value}},{get:()=>undefined});
  const initial=await mission.control(incident,commanderUser);assert.ok(initial.sop.length>=3);checks++;
  const command=await mission.createCommand(incident,commanderUser,{commandType:'ASSIGN_TASK',assigneeId:a,title:'2층 수색'});
  assert.equal(alertsCreated[0].automationKey,`command:${command.commandId}`);
  await mission.commandStatus(command.commandId,{userId:a,badgeNumber:'0011',role:'RESPONDER'},'ACKNOWLEDGED');
  await assert.rejects(()=>mission.commandStatus(command.commandId,{userId:b,badgeNumber:'0012',role:'RESPONDER'},'COMPLETED'));checks++;
  const sop=(await mission.control(incident,commanderUser)).sop[0];await mission.sopStatus(sop.sopItemId,{userId:a,badgeNumber:'0011',role:'RESPONDER'},'COMPLETED');checks++;
  const request=await mission.requestResource(incident,{userId:a,badgeNumber:'0011',role:'RESPONDER'},{itemName:'공기호흡기',quantity:2});await mission.resourceStatus(request.requestId,commanderUser,'APPROVED');checks++;
  const inventoryItem=await mission.addInventory(adminUser,{resourceType:'EQUIPMENT',name:'예비 공기통',totalQuantity:3,unit:'개'});
  const linkedRequest=await mission.requestResource(incident,{userId:a,badgeNumber:'0011',role:'RESPONDER'},{resourceId:inventoryItem.resourceId,quantity:2});
  await mission.resourceStatus(linkedRequest.requestId,commanderUser,'APPROVED');
  assert.equal((await mission.inventory(commanderUser)).find(item=>item.resourceId===inventoryItem.resourceId).availableQuantity,1);checks++;
  const floor=await mission.createFloor(incident,commanderUser,{floorLabel:'2F',widthM:30,heightM:20});await mission.marker(incident,commanderUser,{floorId:floor.floorId,markerType:'HAZARD',label:'고온 구역',xPercent:50,yPercent:40});checks++;
  const packet=await mission.packet(incident,commanderUser,{agencyName:'인근 병원',classification:'OPERATIONAL',summary:'환자 이송 준비'});const failedShare=await mission.sharePacket(packet.packetId,commanderUser);assert.equal(failedShare.status,'APPROVED');checks++;
  await mission.addModel(adminUser,{modelName:'fire',version:'1.0',status:'ACTIVE'});await mission.addModel(adminUser,{modelName:'fire',version:'1.1',status:'ACTIVE'});assert.deepEqual((await mission.models(adminUser)).filter(m=>m.modelName==='fire').map(m=>m.status).sort(),['ACTIVE','RETIRED']);checks++;
  await mission.threshold(adminUser,{modelName:'fire',thresholdName:'danger',newValue:0.8,reason:'현장 오탐 감소'});const ready=await mission.readiness(commanderUser);assert.equal(typeof ready.openCommands,'number');checks++;
  const responderControl=await mission.control(incident,{userId:a,badgeNumber:'0011',role:'RESPONDER'});assert.equal(responderControl.packets.length,0);assert.equal(responderControl.channelAttempts.length,0);assert.ok(responderControl.commands.every(item=>!item.assigneeId||item.assigneeId===a));checks++;
  const checkpoint=await mission.checkpoint(adminUser,{artifactRef:'s3://backups/test.dump',checksumSha256:'a'.repeat(64)});const verified=await mission.verifyCheckpoint(checkpoint.checkpointId,adminUser);assert.equal(verified.restoreVerified,true);checks++;
  const advanced=new AdvancedOperationsService(missionRepo,{createFromSystem:async value=>{alertsCreated.push(value);return value}},{get:()=>undefined});
  const responderUser={userId:a,badgeNumber:'0011',role:'RESPONDER'};
  const mayday=await advanced.mayday(incident,responderUser,{location:{latitude:37.5,longitude:127}});assert.equal(mayday.status,'ACTIVE');await advanced.maydayStatus(mayday.signalId,commanderUser,'ACKNOWLEDGED');checks++;
  const par=await advanced.startPar(incident,commanderUser,{deadlineSeconds:120});await advanced.respondPar(par.sessionId,responderUser,{response:'SAFE'});checks++;
  await advanced.position(incident,responderUser,{source:'UWB',floorId:floor.floorId,xPercent:20,yPercent:30,accuracyM:1});checks++;
  await advanced.route(incident,commanderUser,{routeType:'EVACUATION',title:'동측 대피',origin:{latitude:37.5,longitude:127},destination:{latitude:37.51,longitude:127.01}});checks++;
  const zone=await advanced.zone(incident,commanderUser,{name:'고온구역',zoneType:'HOT',geometry:{}});const objective=await advanced.objective(incident,commanderUser,{zoneId:zone.zoneId,title:'2층 수색',priority:1});await advanced.objectiveStatus(objective.objectiveId,commanderUser,'COMPLETED');checks++;
  await advanced.hospital(adminUser,{name:'테스트병원',externalRef:'test-hospital',emergencyStatus:'AVAILABLE',availableBeds:3,specialties:['TRAUMA']});checks++;
  const twin=await advanced.twin(incident,commanderUser,{scenario:'SMOKE',inputs:{elapsedSeconds:300,windMps:2}});assert.equal(twin.result.confidence,'SIMULATION_ONLY');checks++;
  const aar=await advanced.afterAction(incident,commanderUser);assert.ok(aar.summary.eventCount>0);await advanced.trainingFromIncident(incident,commanderUser);checks++;
  const metrics=await advanced.metrics(commanderUser);assert.equal(typeof metrics.activeMaydays,'number');checks++;
  await rows(`INSERT INTO responder_status_logs(incident_id,user_id,recorded_at,risk_level,connection_status,biometric_data,environment_data) VALUES($1,$2,now(),'DANGER','DISCONNECTED','{"heartRate":190}','{"ambientTemperature":90}')`,[incident,a]);
  const automated=[];const automation=new AutomationService({query:rows},{createFromSystem:async value=>{automated.push(value);return value}},{get:()=>undefined});await automation.safety();assert.ok(automated.length>=4);checks++;
  await rows(`UPDATE alert_deliveries SET queued_at=now()-interval '2 minutes' WHERE alert_id=$1`,[broadcast]);await automation.channels();const queued=await rows(`SELECT count(*)::int AS n FROM durable_jobs WHERE payload->>'alertId'=$1`,[broadcast]);assert.equal(queued[0].n,3);checks++;
  const governance=new GovernanceService(missionRepo,{get:(key,fallback)=>fallback});
  const lease=await governance.acquireLease('automation:primary','node-a',30);assert.equal(lease.ownerId,'node-a');assert.equal(await governance.acquireLease('automation:primary','node-b',30),null);assert.equal((await governance.releaseLease('automation:primary','node-a',Number(lease.fencingToken))).released,true);checks++;
  const audit=await governance.audit(adminUser,'INCIDENT_REVIEWED','incident',incident,{result:'ok'},incident);assert.ok(audit.eventHash);assert.equal((await governance.verifyAudit(adminUser)).valid,true);checks++;
  const mutation=uuid(300);const sync1=await governance.sync(responderUser,{mutationId:mutation,incidentId:incident,entityType:'status',entityId:a,operation:'UPDATE',baseVersion:0,payload:{state:'SAFE'}});assert.equal(sync1.resolution,'APPLIED');assert.equal((await governance.sync(responderUser,{mutationId:mutation,entityType:'status',entityId:a,operation:'UPDATE',payload:{}})).serverVersion,1);checks++;
  const sync2=await governance.sync(responderUser,{mutationId:uuid(301),incidentId:incident,entityType:'status',entityId:a,operation:'UPDATE',baseVersion:0,payload:{state:'DANGER'}});assert.equal(sync2.resolution,'CONFLICT');checks++;
  const model=await governance.registerModel(adminUser,{modelName:'fire-v2',version:'2.0',artifactUri:'registry://fire/2.0',artifactHash:'b'.repeat(64),explanation:{dataset:'validated'}});await governance.modelAction(model.releaseId,adminUser,'APPROVE');assert.equal((await governance.modelAction(model.releaseId,adminUser,'ACTIVATE')).status,'ACTIVE');checks++;
  const forecast=await governance.forecast(incident,commanderUser,{horizonMinutes:60});assert.equal(forecast.disclaimer.includes('자동 배치하지 않습니다'),true);checks++;
  const evidence=await governance.evidence(incident,commanderUser,{evidenceType:'VIDEO',sourceUri:'evidence://camera/1',contentHash:'c'.repeat(64),legalHold:true});assert.equal(evidence.custodyHash.length,64);checks++;
  const building=await governance.buildingModel(adminUser,{facilityName:'훈련동',modelFormat:'IFC',version:'1',sourceUri:'bim://training/1',contentHash:'d'.repeat(64)});const radio=await governance.transcript(incident,commanderUser,{channelLabel:'지휘망',transcript:'메이데이, 2층 구조 요청',startedAt:new Date().toISOString()});checks++;
  const publicToken=await governance.createPublicToken(incident,commanderUser,{audience:'PUBLIC',ttlMinutes:10});const publicView=await governance.publicStatus(publicToken.token);assert.equal(publicView.status,'IN_PROGRESS');assert.equal(publicView.location,undefined);checks++;
  await governance.preferences(responderUser,{locale:'ko-KR',highContrast:true,textScale:1.25,roleLayout:{compact:true}});await governance.retention(adminUser,{dataCategory:'radio_transcript',retentionDays:180,action:'ANONYMIZE'});checks++;
  const assurance=new AssuranceService(missionRepo);
  await rows(`INSERT INTO push_subscriptions(user_id,platform,endpoint_token) VALUES($1,'WEB','test-endpoint')`,[a]);
  const originalFetch=global.fetch;let fetchAttempts=0;global.fetch=async()=>{fetchAttempts++;throw new Error('provider down')};
  const providerAutomation=new AutomationService(missionRepo,{createFromSystem:async value=>value},{get:key=>key==='PUSH_GATEWAY_URL'?'http://gateway.test':undefined});
  for(let i=0;i<5;i++) await assert.rejects(()=>providerAutomation.deliver('PUSH',{userId:a,message:'test',alertId:broadcast}));
  assert.equal((await rows(`SELECT state FROM provider_circuit_breakers WHERE provider_key='PUSH'`))[0].state,'OPEN');
  await assert.rejects(()=>providerAutomation.deliver('PUSH',{userId:a,message:'test',alertId:broadcast}));assert.equal(fetchAttempts,5);global.fetch=originalFetch;checks++;
  const retentionPolicy=(await rows(`SELECT policy_id FROM data_retention_policies WHERE data_category='location_history'`))[0];
  await rows(`UPDATE indoor_position_updates SET recorded_at=now()-interval '100 days' WHERE incident_id=$1`,[incident]);
  const preview=await assurance.previewRetention(retentionPolicy.policy_id,adminUser);assert.ok(preview.candidateCount>=1);await assert.rejects(()=>assurance.approveRetention(preview.executionId,adminUser));await assurance.approveRetention(preview.executionId,secondAdminUser);const executed=await assurance.executeRetention(preview.executionId,adminUser);assert.ok(executed.executedCount>=1);checks++;
  await assurance.recordSlo(adminUser,{metricKey:'api_availability',goodCount:99,totalCount:100,dimensions:{region:'test'}});const slo=await assurance.sloDashboard(adminUser);assert.ok(slo.some(item=>item.metricKey==='api_availability'));checks++;
  const approval=await assurance.requestApproval(adminUser,{actionType:'FAILOVER',resourceType:'environment',resourceId:'staging',payload:{reason:'drill'}});await assert.rejects(()=>assurance.decideApproval(approval.approvalId,adminUser,'APPROVED'));assert.equal((await assurance.decideApproval(approval.approvalId,secondAdminUser,'APPROVED')).status,'APPROVED');checks++;
  const device=await assurance.fieldDevice(responderUser,{platform:'ANDROID',deviceFingerprint:'test-device-001',encryptionCapability:'HARDWARE_KEYSTORE',backgroundLocationEnabled:true});assert.equal(device.attestationStatus,'PENDING');const asset=await assurance.offlineAsset(responderUser,{assetId:uuid(400),incidentId:incident,mediaType:'image/jpeg',byteSize:1024,contentHash:'e'.repeat(64),priority:1});assert.equal(asset.priority,1);checks++;
  const manifest=await assurance.auditExport(adminUser,{artifactUri:'worm://audit/export-1',artifactHash:'f'.repeat(64)});assert.ok(manifest.eventCount>=1);checks++;
  const signingPair=generateKeyPairSync('ec',{namedCurve:'P-256'}),publicPem=signingPair.publicKey.export({type:'spki',format:'pem'}),documentHash='9'.repeat(64);await assurance.signingKey(adminUser,{keyId:'hospital-test-key',ownerLabel:'테스트 병원',algorithm:'ECDSA-SHA256',publicKeyPem:publicPem,validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString()});const signatureValue=sign('sha256',Buffer.from(documentHash,'hex'),signingPair.privateKey).toString('base64');const electronicSignature=await governance.signature(commanderUser,{resourceType:'HANDOVER',resourceId:incident,documentHash,signatureValue,publicKeyId:'hospital-test-key',signatureAlgorithm:'ECDSA-SHA256'});assert.equal((await assurance.verifySignature(electronicSignature.signatureId,adminUser)).verificationStatus,'VALID');checks++;
  const oldModel=await governance.registerModel(adminUser,{modelName:'fire-detection',version:'1.0',artifactUri:'registry://fire/1.0',artifactHash:'1'.repeat(64)});await governance.modelAction(oldModel.releaseId,adminUser,'APPROVE');await governance.modelAction(oldModel.releaseId,adminUser,'ACTIVATE');const newModel=await governance.registerModel(adminUser,{modelName:'fire-detection',version:'2.0',artifactUri:'registry://fire/2.0',artifactHash:'2'.repeat(64)});await governance.modelAction(newModel.releaseId,adminUser,'APPROVE');await governance.modelAction(newModel.releaseId,adminUser,'ACTIVATE');await assurance.guardrail(adminUser,{modelName:'fire-detection',minimumSamples:20,maxFalsePositiveRate:.25,maxFalseNegativeRate:.2,autoRollback:true});await providerAutomation.rollbackDriftedModel('fire-detection',25,.4,.1);assert.equal((await rows(`SELECT version FROM ai_model_releases WHERE model_name='fire-detection' AND status='ACTIVE'`))[0].version,'1.0');checks++;
  const field=new FieldIntelligenceService(missionRepo,{get:key=>key==='PROVIDER_TEST_WEBHOOK_SECRET'?'webhook-test-value':undefined},{createFromSystem:async value=>{alertsCreated.push(value);return value}});
  const webhookBody=Buffer.from('{"status":"delivered"}'),webhookSignature=createHmac('sha256','webhook-test-value').update(webhookBody).digest('hex');const receipt=await field.webhook('test','event-1','DELIVERED',webhookSignature,webhookBody);assert.equal(receipt.status,'PROCESSED');assert.equal((await field.webhook('test','event-1','DELIVERED',webhookSignature,webhookBody)).status,'DUPLICATE');await assert.rejects(()=>field.webhook('test','event-2','DELIVERED','bad',webhookBody));checks++;
  await field.uploadChunk(responderUser,{chunkId:uuid(401),assetId:asset.assetId,chunkIndex:0,byteSize:512,contentHash:'a'.repeat(64)});await field.importBim(building.modelId,adminUser,{elements:[{externalId:'exit-1',elementType:'EXIT',label:'동측 비상구',floorLabel:'1F',geometry:{type:'Point',coordinates:[127,37.5]}}]});checks++;
  const detected=await field.analyzeTranscript(radio.transcriptId,commanderUser);assert.ok(detected.detections.some(item=>item.keyword==='MAYDAY'));checks++;
  const flight=await field.flight(incident,commanderUser,{missionType:'RECON',route:[{latitude:37.5,longitude:127}],maxAltitudeM:100});assert.equal((await field.approveFlight(flight.flightId,adminUser,'APPROVED')).approvalStatus,'APPROVED');checks++;
  const board=await field.decisionBoard(incident,commanderUser);assert.ok(board.recommendations.length>=1);await field.decision(board.recommendations[0].recommendationId,commanderUser,'ACCEPTED','현장 위험 우선 대응');checks++;
  await field.anomaly(adminUser,{anomalyType:'DEVICE_CHANGE',riskScore:70,evidence:{device:'new'}});const kpi=await field.kpi(incident,commanderUser);assert.ok('averageDeliverySeconds' in kpi.metrics);checks++;
  console.log(`PASS: ${checks} operations database scenarios (PGlite; production PostgreSQL/Flyway still require verification)`);
} finally { await db.close(); }
