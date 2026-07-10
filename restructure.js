// restructure.js
const fs = require('fs');
const path = require('path');

const REPO_PATH = './jarvis-prime'; // Clone your repo here first

// Files to leave as-is
const EXCLUDED = [
  '.kiro',
  '.git',
  '.github',
  'node_modules'
];

// Files with .txt extension to leave as-is
const isTxtFile = (file) => file.endsWith('.txt');

// Mapping: source pattern -> target directory
const MAPPING = {
  'apps/site': 'apps',
  'engine': 'packages/engine',
  'github-icp-scorer': 'packages/github-icp-scorer',
  'engine/src/ai': 'ai',
  'engine/src/agents': 'ai/agents',
  'engine/sql': 'database',
  'business': 'documentation/business',
  'docs': 'documentation/docs',
  'scripts': 'automation',
  'engine/scripts': 'automation'
};

// New directories to create
const NEW_DIRS = [
  'services', 'infrastructure', 'storage', 'tests',
  'monitoring', 'deployment', '.vscode', 'docker'
];

// New files to create (empty)
const NEW_FILES = [
  '.env.example', 'docker-compose.yml', 'package.json', 'turbo.json', 'LICENSE'
];

function moveFile(oldPath, newPath) {
  const fullOldPath = path.join(REPO_PATH, oldPath);
  const fullNewPath = path.join(REPO_PATH, newPath);

  if (!fs.existsSync(fullOldPath)) {
    console.log(`⚠️  Skip: ${oldPath} (not found)`);
    return;
  }

  // Create target directory
  const newDir = path.dirname(fullNewPath);
  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true });
  }

  // Handle filename conflicts by appending parent dir
  let finalNewPath = fullNewPath;
  if (fs.existsSync(finalNewPath)) {
    const dirName = path.basename(path.dirname(oldPath));
    const ext = path.extname(oldPath);
    const base = path.basename(oldPath, ext);
    finalNewPath = path.join(newDir, `${base}-${dirName}${ext}`);
  }

  fs.renameSync(fullOldPath, finalNewPath);
  console.log(`✅ Moved: ${oldPath} → ${path.relative(REPO_PATH, finalNewPath)}`);
}

// Main function
function restructure() {
  console.log('🚀 Starting repository restructure...\\n');

  // Get all files
  const allFiles = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED.includes(entry.name)) {
          walk(fullPath);
        }
      } else {
        allFiles.push(path.relative(REPO_PATH, fullPath));
      }
    }
  }
  walk(path.join(REPO_PATH));

  // Apply mapping
  for (const file of allFiles) {
    if (isTxtFile(file)) {
      console.log(`ℹ️  Skip .txt: ${file}`);
      continue;
    }

    if (file.includes('.kiro/')) {
      console.log(`ℹ️  Skip .kiro: ${file}`);
      continue;
    }

    let moved = false;
    for (const [source, target] of Object.entries(MAPPING)) {
      if (file.startsWith(source + '/')) {
        const relative = path.relative(source, file);
        const newPath = path.join(target, relative);
        moveFile(file, newPath);
        moved = true;
        break;
      }
    }

    if (!moved && !file.includes('/')) {
      // Root level file - move to appropriate location
      if (file.endsWith('.md') && !file.startsWith('README')) {
        moveFile(file, path.join('documentation', file));
      }
    }
  }

  // Create new directories
  for (const dir of NEW_DIRS) {
    const fullPath = path.join(REPO_PATH, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`📁 Created: ${dir}/`);
    }
  }

  // Create new files
  for (const file of NEW_FILES) {
    const fullPath = path.join(REPO_PATH, file);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, '');
      console.log(`📄 Created: ${file}`);
    }
  }

  console.log('\\n✨ Restructure complete! Review changes and commit.');
}

restructure();