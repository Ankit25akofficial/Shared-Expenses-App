import fs from 'fs';
import path from 'path';

function searchDir(dir: string, term: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        searchDir(fullPath, term);
      }
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(term)) {
        console.log(`Found "${term}" in: ${fullPath}`);
      }
    }
  }
}

console.log('Searching for "House Cleaning Supplies"...');
searchDir(process.cwd(), 'House Cleaning Supplies');

console.log('Searching for "Welcome Dinner"...');
searchDir(process.cwd(), 'Welcome Dinner');

console.log('Searching for "Rohan Paid Aisha Back"...');
searchDir(process.cwd(), 'Rohan Paid Aisha Back');
