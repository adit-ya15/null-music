import { query } from './backend/db/postgres.mjs';

const tables = await query("select table_schema, table_name from information_schema.tables where table_name='users' order by table_schema");
console.log('tables', tables.rows);

for (const table of tables.rows) {
	const schema = table.table_schema;
	const cols = await query(`select column_name, data_type from information_schema.columns where table_schema='${schema}' and table_name='users' order by ordinal_position`);
	console.log(`schema ${schema}`);
	console.log(cols.rows);
}
