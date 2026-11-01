// The diagram is diagram-studio/1 DATA (server/diagrams/*.json), loaded by name and checked with the studio's own validator copy.
// Nothing here or in the web app builds nodes or edges by hand. {{cast}} tokens in labels are filled from the chosen vertical.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDiagram } from './diagramStudioValidate.js';
import { render } from './stories.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../diagrams');
export const DIAGRAM_NAMES = ['replay'];

export function loadDiagram(name) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
  const problems = validateDiagram(doc);
  if (problems.length) throw new Error(`diagram ${name} is not valid diagram-studio/1: ${problems.join('; ')}`);
  return doc;
}
const DOCS = Object.fromEntries(DIAGRAM_NAMES.map((n) => [n, loadDiagram(n)]));
export const rawDiagram = (name = DIAGRAM_NAMES[0]) => DOCS[name];

// The document for the page: tokens filled from the vertical's cast. Unknown names fall back to the first diagram.
export const buildDiagram = (cast, name = DIAGRAM_NAMES[0]) => render(DOCS[DIAGRAM_NAMES.includes(name) ? name : DIAGRAM_NAMES[0]], cast);
