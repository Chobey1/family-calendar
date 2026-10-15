import { randomUUID, randomBytes } from 'node:crypto';
import { digest, token } from './calendar.mjs';

export const familyCode = () => randomBytes(8).toString('hex').toUpperCase();
export function familyName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\r\n]/.test(value)) throw new Error('Enter a family name of 1–80 characters.');
  return value.trim();
}
export const normalizeCode = value => String(value || '').replace(/[\s-]/g,'').toUpperCase();

export async function transaction(pool, callback) {
  const client=await pool.connect();
  try {await client.query('BEGIN'); const result=await callback(client); await client.query('COMMIT'); return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function createFamily(pool,memberId,name) {
  name=familyName(name);
  return transaction(pool,async client=>{
    const member=(await client.query('SELECT family_id FROM members WHERE id=$1 FOR UPDATE',[memberId])).rows[0];
    if(!member || member.family_id) throw new Error('You already belong to a family.');
    const family={id:randomUUID(),name,join_code:familyCode()};
    await client.query('INSERT INTO families (id,name,feed_token,join_code) VALUES ($1,$2,$3,$4)',[family.id,name,digest(token()),family.join_code]);
    await client.query('UPDATE members SET family_id=$1 WHERE id=$2',[family.id,memberId]);
    await client.query('DELETE FROM join_requests WHERE member_id=$1',[memberId]);
    return family;
  });
}
export async function requestJoin(pool,memberId,code) {
  code=normalizeCode(code);
  if(!/^[A-F0-9]{16}$/.test(code)) throw new Error('Family code not found. Check the code and try again.');
  return transaction(pool,async client=>{
    const member=(await client.query('SELECT family_id FROM members WHERE id=$1 FOR UPDATE',[memberId])).rows[0];
    if(!member || member.family_id) throw new Error('You already belong to a family.');
    const family=(await client.query('SELECT id FROM families WHERE join_code=$1',[code])).rows[0];
    if(!family) throw new Error('Family code not found. Check the code and try again.');
    // One outstanding request; knowing a code never grants access to family data.
    await client.query('INSERT INTO join_requests (member_id,family_id) VALUES ($1,$2) ON CONFLICT (member_id) DO UPDATE SET family_id=$2,created_at=now()',[memberId,family.id]);
  });
}
export async function reviewJoin(pool,adultId,memberId,approve) {
  return transaction(pool,async client=>{
    const adult=(await client.query("SELECT family_id FROM members WHERE id=$1 AND kind='adult'",[adultId])).rows[0];
    if(!adult?.family_id) throw new Error('An approved adult must review requests.');
    // Lock the applicant first, using the same order as createFamily/requestJoin.
    const applicant=(await client.query('SELECT family_id FROM members WHERE id=$1 FOR UPDATE',[memberId])).rows[0];
    const request=(await client.query('SELECT family_id FROM join_requests WHERE member_id=$1 FOR UPDATE',[memberId])).rows[0];
    if(!applicant || applicant.family_id || request?.family_id!==adult.family_id) throw new Error('This request is no longer available.');
    if(approve) await client.query('UPDATE members SET family_id=$1 WHERE id=$2',[adult.family_id,memberId]);
    await client.query('DELETE FROM join_requests WHERE member_id=$1',[memberId]);
  });
}
