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
  const operations=new OperationsService({query:rows});
  const commanderUser={userId:commander,badgeNumber:'0090',role:'COMMANDER'};
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
  console.log(`PASS: ${checks} operations database scenarios (PGlite; production PostgreSQL/Flyway still require verification)`);
} finally { await db.close(); }
