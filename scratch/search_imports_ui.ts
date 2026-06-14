import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('src/app/groups/[id]/page.tsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for imports UI blocks...');
lines.forEach((line, idx) => {
  if (line.includes("activeTab === 'imports'") || line.includes("tab === 'imports'") || line.includes("importJob")) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});
