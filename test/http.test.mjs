import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createApplication } from '../server.mjs';

test('HTTP registration, approval, family isolation, and authenticated styled previews',async()=>{
  process.env.APP_URL='http://calendar.test';process.env.COOKIE_SECURE='false';process.env.SETUP_TOKEN='a'.repeat(32);
  const pg=new PGlite();
  const query=async(sql,args)=>{if(args===undefined && sql.includes('CREATE TABLE')){await pg.exec(sql);return {rows:[],rowCount:0};}const r=await pg.query(sql,args);return {...r,rowCount:r.rows.length || r.affectedRows || 0};};
  const pool={query,connect:async()=>({query,release(){}})};
  const server=await createApplication(pool);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,cookie,origin='http://calendar.test')=>{
    const res=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  };
  const register=(email,token)=>call('register',{name:email.split('@')[0],email,password:'test-password-long',token});
  try {
    assert.equal((await register('owner@example.com')).status,400);
    const first=await register('owner@example.com',process.env.SETUP_TOKEN);assert.equal(first.status,200);
    assert.equal((await call('data',null,first.cookie)).data.needsFamily,true);
    assert.equal((await call('family/create',{name:'Worley Family'},first.cookie)).status,201);
    const original=(await call('data',null,first.cookie)).data;
    assert.equal(original.family.name,'Worley Family');assert.equal(original.family.join_code.length,16);
    const applicant=await register('applicant@example.com');assert.equal(applicant.status,200);
    assert.equal((await call('family/join',{code:original.family.join_code},applicant.cookie)).status,200);
    assert.equal((await call('data',null,applicant.cookie)).data.pending,true);
    for(const path of ['mail'])assert.equal((await call(path,null,applicant.cookie)).status,403);
    assert.equal((await call('feed',{},applicant.cookie)).status,403);
    assert.equal((await call('members',{name:'Forbidden'},applicant.cookie)).status,403);
    const outsider=await register('outsider@example.com');await call('family/create',{name:'Other Family'},outsider.cookie);
    const requests=(await call('data',null,first.cookie)).data.requests;
    assert.equal(requests.length,1);const applicantId=requests[0].id;
    assert.equal((await call('family/review',{id:applicantId,approve:true},outsider.cookie)).status,400);
    assert.equal((await call('family/review',{id:applicantId,approve:true},first.cookie)).status,200);
    const approved=(await call('data',null,applicant.cookie)).data;assert.equal(approved.family.id,original.family.id);
    assert.equal((await call('family/name',{name:'Worley Family'},applicant.cookie)).status,200);
    await call('members',{name:'Child'},applicant.cookie);
    const memberData=(await call('data',null,first.cookie)).data;
    const child=memberData.members.find(m=>m.kind==='child');assert.ok(child);
    const plan={title:'Family event',start:'2026-10-20T12:00',end:'2026-10-20T13:00',repeat:'none',reminder:15,members:[child.id]};
    const saved=await call('events',plan,first.cookie);assert.equal(saved.status,201);
    const other=(await call('data?from=2026-10-19&to=2026-10-26',null,outsider.cookie)).data;assert.equal(other.events.length,0);assert.equal(other.requests.length,0);
    assert.equal((await call('events',{...plan,id:saved.data.id,version:1,members:[other.account.id]},outsider.cookie)).status,409);
    assert.equal((await call('events/delete',{id:saved.data.id,version:1},outsider.cookie)).status,409);
    assert.equal((await call('events',plan,outsider.cookie)).status,400);
    assert.equal((await call('family/name',{name:'Spoofed'},first.cookie,'http://evil.test')).status,403);
    await query("INSERT INTO mail_jobs(id,family_id,recipient,subject,body,html,due_at) VALUES ('preview',$1,'owner@example.com','Test','Text','<h1>Private</h1><img src=\"cid:family-header\">',now())",[original.family.id]);
    const allowed=await fetch(base+'/api/mail/preview/preview',{headers:{Cookie:first.cookie}});assert.equal(allowed.status,200);assert.match(await allowed.text(),/\/email-header.png/);
    assert.match(allowed.headers.get('content-security-policy'),/sandbox/);
    assert.equal((await fetch(base+'/api/mail/preview/preview',{headers:{Cookie:outsider.cookie}})).status,404);
    assert.equal((await fetch(base+'/api/mail/preview/preview')).status,401);
    assert.equal((await fetch(base+'/email-header.png')).status,200);
  } finally {await new Promise(resolve=>server.close(resolve));await pg.close();}
});
