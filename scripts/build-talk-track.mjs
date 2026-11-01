// Writes docs/talk-track.md from the scenario data (so the doc and the presenter view cannot drift).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderTalkTrackMarkdown } from '../server/src/talkTrack.js';

fs.writeFileSync(fileURLToPath(new URL('../docs/talk-track.md', import.meta.url)), renderTalkTrackMarkdown());
console.log('wrote docs/talk-track.md');
