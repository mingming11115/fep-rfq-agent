import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const sql = readFileSync(new URL('../apps/api/src/main/resources/db/init.sql', import.meta.url), 'utf8');
const rows = (table) => sql.split('\n').filter(line => line.startsWith('INSERT INTO `' + table + '` '));

test('init.sql contains the complete MySQL demo records and Word originals', () => {
  assert.equal(rows('project').filter(line => line.includes("'BU-MYSQL-DEMO'")).length, 8);
  for (const [table, count] of Object.entries({
    requirement: 33, requirement_response: 33, response_review: 7, response_snapshot: 3,
    model_definition: 2, process_definition: 4, capability_record: 5,
    'standard-reply-record': 2, 'history-rfq-record': 2,
  })) {
    assert.equal(rows(table).length, count, table);
  }
  assert.ok(rows('app_user').some(line => line.includes("'mysql_sr'") && line.includes("'张明'")));
  assert.equal(sql.split('\n').filter(line => /^INSERT INTO rfq_demo_document .*X'504b/i.test(line)).length, 7);
});

test('init.sql leaves existing business rows alone', () => {
  const seed = sql.split('-- RFQ_DEMO_INSERTS\n')[1].split('-- RFQ_DEMO_INSERTS_END')[0];
  assert.doesNotMatch(seed, /^(update|delete|replace)\s/mi);
  assert.doesNotMatch(seed, /\bselect id, owner_id, created_by from project;/i);
});

test('match migration preserves applied schema and defines the durable comparison queue', () => {
  const [baseline, versioned] = sql.split('-- RFQ_MIGRATION_V11\n');
  assert.equal(createHash('sha256').update(baseline).digest('hex'),
    '28609e33f0dbc082f5d3cff3d151500762b49ae1d12b7ca96e585ac463131805');
  const v11 = versioned.split('-- RFQ_MIGRATION_V11_END')[0];
  assert.equal(createHash('sha256').update(v11).digest('hex'),
    '84f602fccf84ab3728d26890c49bac1f3ee4c0a6bb50d0b0532e26160c8308ad');
  const v12 = versioned.split('-- RFQ_MIGRATION_V12\n')[1].split('-- RFQ_MIGRATION_V12_END')[0];
  assert.equal(createHash('sha256').update(v12).digest('hex'),
    '88a54d5391826b9154de21b6b97270b0b50ef18f12cd6c211371d55de334d722');
  assert.match(v12, /add unique key .*\(bu_id,\s*fingerprint\)/i);
  assert.match(v12, /create table history_rfq_index_sync like standard_reply_index_sync\b/i);
  const v13 = versioned.split('-- RFQ_MIGRATION_V13\n')[1].split('-- RFQ_MIGRATION_V13_END')[0];
  assert.equal(createHash('sha256').update(v13).digest('hex'),
    '1a8f8fd66f14a8be6e12771156870884216d320d3156503d4ccf44b3f320cf40');
  assert.match(v13, /add unique key .*\(bu_id,\s*source_fingerprint\)/i);
  assert.match(v13, /alter table evidence_record add column revision\b/i);
  const v14 = versioned.split('-- RFQ_MIGRATION_V14\n')[1].split('-- RFQ_MIGRATION_V14_END')[0];
  assert.match(v14, /create table bu_match_policy\b/i);
  assert.match(v14, /create table requirement_match_result\b/i);
  assert.match(v14, /unique key uk_match_current \(requirement_id, current_run\)/i);
  assert.doesNotMatch(sql, /\bupdate\b/i);
});
