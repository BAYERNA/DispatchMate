// Optional PostgreSQL-WASM integration check. Does not access a production database.
// Build first; set PGLITE_ROOT to an independently installed @electric-sql/pglite directory.
import assert from 'node:assert/strict';
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
  const stats=(await operations.feedbackStats(commanderUser))[0];assert.equal(stats.reviewedCount,1);assert.equal(stats.falsePositiveCount,0);checks++;
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
  const packet=await mission.packet(incident,commanderUser,{agencyName:'인근 병원',classification:'OPERATIONAL',summary:'환자 이송 준비'});const failedShare=await mission.sharePacket(packet.packetId,commanderUser);assert.equal(failedShare.status,'FAILED');checks++;
  await mission.addModel(adminUser,{modelName:'fire',version:'1.0',status:'ACTIVE'});await mission.addModel(adminUser,{modelName:'fire',version:'1.1',status:'ACTIVE'});assert.deepEqual((await mission.models(adminUser)).filter(m=>m.modelName==='fire').map(m=>m.status).sort(),['ACTIVE','RETIRED']);checks++;
  await mission.threshold(adminUser,{modelName:'fire',thresholdName:'danger',newValue:0.8,reason:'현장 오탐 감소'});const ready=await mission.readiness(commanderUser);assert.equal(typeof ready.openCommands,'number');checks++;
  const responderControl=await mission.control(incident,{userId:a,badgeNumber:'0011',role:'RESPONDER'});assert.equal(responderControl.packets.length,0);assert.equal(responderControl.channelAttempts.length,0);assert.ok(responderControl.commands.every(item=>!item.assigneeId||item.assigneeId===a));checks++;
  const checkpoint=await mission.checkpoint(adminUser,{artifactRef:'s3://backups/test.dump',checksumSha256:'a'.repeat(64)});const verified=await mission.verifyCheckpoint(checkpoint.checkpointId,adminUser);assert.equal(verified.restoreVerified,true);checks++;
  await rows(`INSERT INTO responder_status_logs(incident_id,user_id,recorded_at,risk_level,connection_status,biometric_data,environment_data) VALUES($1,$2,now(),'DANGER','DISCONNECTED','{"heartRate":190}','{"ambientTemperature":90}')`,[incident,a]);
  const automated=[];const automation=new AutomationService({query:rows},{createFromSystem:async value=>{automated.push(value);return value}},{get:()=>undefined});await automation.safety();assert.ok(automated.length>=4);checks++;
  await rows(`UPDATE alert_deliveries SET queued_at=now()-interval '2 minutes' WHERE alert_id=$1`,[broadcast]);await automation.channels();const channelRows=await rows(`SELECT channel,status FROM notification_channel_attempts WHERE alert_id=$1 ORDER BY channel,user_id`,[broadcast]);assert.equal(channelRows.length,2);assert.ok(channelRows.every(r=>r.status==='UNAVAILABLE'));checks++;
  console.log(`PASS: ${checks} operations database scenarios (PGlite; production PostgreSQL/Flyway still require verification)`);
} finally { await db.close(); }
