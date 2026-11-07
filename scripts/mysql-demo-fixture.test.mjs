import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync(new URL('../apps/api/src/main/resources/db/init.sql', import.meta.url), 'utf8');
const rows = (table) => sql.split('\n').filter(line => line.startsWith('INSERT INTO `' + table + '` '));

test('init.sql contains the complete MySQL demo records and Word originals', () => {
  assert.equal(rows('project').filter(line => line.includes("'BU-MYSQL-DEMO'")).length, 8);
  for (const [table, count] of Object.entries({
    requirement: 33, requirement_response: 33, response_review: 7, response_snapshot: 3,
    model_definition: 2, process_definition: 4, capability_record: 5, knowledge_record: 4,
  })) {
    assert.equal(rows(table).length, count, table);
  }
  assert.ok(rows('app_user').some(line => line.includes("'mysql_sr'") && line.includes("'张明'")));
  assert.equal(sql.split('\n').filter(line => /^INSERT INTO rfq_demo_document .*X'504b/i.test(line)).length, 7);
});
