import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createFamily, requestJoin, reviewJoin, normalizeCode, familyName } from '../lib/families.mjs';

test('migration preserves existing family, sessions, events and email history; new adults remain isolated until approval',async()=>{
  const pg=new PGlite();
  const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
  const legacy=schema.split('-- Additive')[0];
  await pg.exec(legacy);
  const family=randomUUID(),adult=randomUUID(),child=randomUUID(),event=randomUUID(),outsider=randomUUID(),otherAdult=randomUUID();
  await pg.query('INSERT INTO families VALUES ($1,$2,$3)',[family,'Worley Family','legacy-feed']);
  await pg.query("INSERT INTO members (id,family_id,name,kind,email) VALUES ($1,$2,'Parent','adult','parent@example.com')",[adult,family]);
  await pg.query("INSERT INTO members (id,family_id,name,kind) VALUES ($1,$2,'Child','child')",[child,family]);
  await pg.query("INSERT INTO sessions VALUES ('session',$1,now()+interval '1 day')",[adult]);
  await pg.query('INSERT INTO events (id,family_id,data) VALUES ($1,$2,$3)',[event,family,{title:'Keep me',members:[child]}]);
  await pg.query("INSERT INTO mail_jobs (id,family_id,recipient,subject,body,due_at,status) VALUES ('old',$1,'parent@example.com','Old','Existing mail',now(),'sent')",[family]);
  await pg.exec(schema);await pg.exec(schema); // Upgrades must be safe to rerun.
  assert.equal((await pg.query('SELECT * FROM events')).rows[0].data.title,'Keep me');
  assert.equal((await pg.query('SELECT * FROM sessions')).rows[0].member_id,adult);
  assert.equal((await pg.query('SELECT * FROM mail_jobs')).rows[0].body,'Existing mail');
  assert.equal((await pg.query('SELECT * FROM families')).rows[0].name,'Worley Family');
  await pg.query("UPDATE families SET join_code='AABBCCDDEEFF0011' WHERE id=$1",[family]);
  for(const [id,name] of [[outsider,'Applicant'],[otherAdult,'Other parent']])await pg.query("INSERT INTO members (id,name,kind,email) VALUES ($1,$2,'adult',$3)",[id,name,id+'@example.com']);
  const client={query:async(sql,params)=>{const r=await pg.query(sql,params);return {...r,rowCount:r.rows.length || r.affectedRows || 0};},release:()=>{}};
  const pool={connect:async()=>client};
  const otherFamily=await createFamily(pool,otherAdult,'Other Family');
  await assert.rejects(requestJoin(pool,outsider,'WRONG'),/code not found/);
  await requestJoin(pool,outsider,'aabb-ccdd-eeff-0011');
  assert.equal((await pg.query('SELECT family_id FROM members WHERE id=$1',[outsider])).rows[0].family_id,null);
  assert.equal((await pg.query('SELECT * FROM members WHERE family_id=$1',[family])).rows.length,2);
  await assert.rejects(reviewJoin(pool,otherAdult,outsider,true),/no longer available/);
  await assert.rejects(reviewJoin(pool,outsider,outsider,true),/approved adult/);
  await reviewJoin(pool,adult,outsider,false);
  assert.equal((await pg.query('SELECT * FROM join_requests')).rows.length,0);
  await requestJoin(pool,outsider,'AABBCCDDEEFF0011');
  await reviewJoin(pool,adult,outsider,true);
  assert.equal((await pg.query('SELECT family_id FROM members WHERE id=$1',[outsider])).rows[0].family_id,family);
  await assert.rejects(createFamily(pool,outsider,'Another'),/already belong/);
  // Any approved adult has the same authority to approve subsequent adults.
  const next=randomUUID();await pg.query("INSERT INTO members (id,name,kind,email) VALUES ($1,'Next','adult','next@example.com')",[next]);
  await requestJoin(pool,next,'AABBCCDDEEFF0011');await reviewJoin(pool,outsider,next,true);
  assert.equal((await pg.query('SELECT family_id FROM members WHERE id=$1',[next])).rows[0].family_id,family);
  assert.equal((await pg.query('SELECT count(*) FROM events WHERE family_id=$1',[otherFamily.id])).rows[0].count,0);
  assert.equal((await pg.query('SELECT count(*) FROM mail_jobs WHERE family_id=$1',[otherFamily.id])).rows[0].count,0);
  // Invalidated codes stop accepting new requests; existing requests are not auto-approved.
  const last=randomUUID();await pg.query("INSERT INTO members (id,name,kind,email) VALUES ($1,'Last','adult','last@example.com')",[last]);
  await pg.query("UPDATE families SET join_code='1122334455667788' WHERE id=$1",[family]);
  await assert.rejects(requestJoin(pool,last,'AABBCCDDEEFF0011'),/code not found/);
  await pg.close();
});
test('family names and codes validate and normalize',()=>{
  assert.equal(normalizeCode(' aabb-ccdd-eeff-0011 '),'AABBCCDDEEFF0011');
  assert.equal(familyName(' Worley Family '),'Worley Family');
  for(const name of ['',null,'a'.repeat(81),'Name\nInjected'])assert.throws(()=>familyName(name));
});
