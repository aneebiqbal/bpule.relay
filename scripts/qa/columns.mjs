/** Print NOT NULL columns without defaults for the fixture-relevant tables. */
import pg from 'pg'

const url = process.env.RELAY_STAGING_DATABASE_URL ?? 'postgres://mac@127.0.0.1:5433/relay_staging_local'
const db = new pg.Client({ connectionString: url })
await db.connect()
const tables = (process.argv[2] ?? '').split(',').filter(Boolean)
const { rows } = await db.query(
  `select table_name, column_name, data_type, is_nullable, column_default
     from information_schema.columns
    where table_schema='public' and table_name = any($1)
    order by table_name, ordinal_position`,
  [tables],
)
let current = null
for (const r of rows) {
  if (r.table_name !== current) {
    current = r.table_name
    console.log(`\n## ${current}`)
  }
  const req = r.is_nullable === 'NO' && !r.column_default ? 'REQUIRED' : ''
  console.log(`  ${r.column_name} ${r.data_type} ${req}`)
}
await db.end()
