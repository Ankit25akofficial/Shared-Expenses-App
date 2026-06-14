import fs from 'fs';
import path from 'path';

function findPages(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        findPages(fullPath);
      }
    } else if (file === 'page.tsx') {
      console.log(fullPath);
    }
  }
}

findPages(process.cwd());
