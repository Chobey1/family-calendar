import pg from 'pg';
import { readFile } from 'node:fs/promises';
export const db = new pg.Pool({connectionString: process.env.DATABASE_URL});
export async function initialize() {
  await db.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
}
export async function familyData(familyId) {
  const [members, events] = await Promise.all([
    db.query('SELECT id, name, kind, email, color FROM members WHERE family_id=$1 ORDER BY created_at', [familyId]),
    db.query('SELECT * FROM events WHERE family_id=$1 AND deleted=false', [familyId])
  ]);
  return {members: members.rows, events: events.rows};
}
