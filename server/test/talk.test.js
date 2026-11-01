import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, VERTICALS } from '../src/stories.js';
import { renderTalkTrackMarkdown, talkLines } from '../src/talkTrack.js';
import { withServer } from './helpers.js';

test('every scenario has a talk line, with no {{token}} and no host or key in it, and the generated markdown has one entry per scenario', () => {
  assert.equal(talkLines().length, SCENARIOS.length);
  for (const s of SCENARIOS) { assert.equal(typeof s.talk, 'string'); assert.ok(s.talk.length > 10, s.id); assert.ok(!/\{\{/.test(s.talk), s.id); }
  const md = renderTalkTrackMarkdown();
  for (const s of SCENARIOS) assert.ok(md.includes(`**${s.id} ${s.title}.** ${s.talk}`), s.id);
  assert.match(md, /Mock mode/); assert.match(md, /mutation proof/);
});

test('the catalog carries each scenario\'s talk line for the presenter view, in every vertical', async () => {
  await withServer(async (b) => {
    for (const v of VERTICALS) {
      const j = await (await fetch(`${b}/api/catalog?vertical=${v.id}`)).json();
      assert.deepEqual(j.scenarios.map((s) => s.talk), SCENARIOS.map((s) => s.talk), v.id);
    }
  });
});
