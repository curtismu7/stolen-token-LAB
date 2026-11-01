// The talk track is generated from the scenario data (each scenario's `talk` line), so docs/talk-track.md and the presenter view cannot drift
// from the scenarios. `npm run talk-track` writes the file; a test fails when the committed copy differs.
import { SCENARIOS } from './stories.js';

export const TALK_INTRO = 'One line per scenario; the lab says the rest. The banner (everything simulated, mTLS especially, and the Mock mode) stays on screen, also in presenter mode.';
export const TALK_OUTRO = 'Toggle the defence off on the Gateway tab and show exactly that attack get through: that is the mutation proof, shown to people.';

export const talkLines = () => SCENARIOS.map((s) => ({ id: s.id, title: s.title, say: s.talk }));

export function renderTalkTrackMarkdown() {
  return `# Talk track\n\n${TALK_INTRO}\n\n${talkLines().map((l) => `- **${l.id} ${l.title}.** ${l.say}`).join('\n')}\n\n${TALK_OUTRO}\n`;
}
