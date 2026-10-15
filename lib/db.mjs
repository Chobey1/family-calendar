import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
export const db = new pg.Pool({connectionString: process.env.DATABASE_URL});
export async function initialize(pool=db) {
  await pool.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const families = await pool.query('SELECT id FROM families WHERE join_code IS NULL');
  for (const family of families.rows) await pool.query('UPDATE families SET join_code=$1 WHERE id=$2 AND join_code IS NULL', [randomBytes(8).toString('hex').toUpperCase(),family.id]);
}
export async function familyData(familyId,pool=db) {
  const [members, events] = await Promise.all([
    pool.query('SELECT id, name, kind, email, color FROM members WHERE family_id=$1 ORDER BY created_at', [familyId]),
    pool.query('SELECT * FROM events WHERE family_id=$1 AND deleted=false', [familyId])
  ]);
  return {members: members.rows, events: events.rows};
}
