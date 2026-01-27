const fs = require('fs');
const path = require('path');

const sourceDir = process.argv[2];
const targetDir = process.argv[3];
const packages = process.argv.slice(4);

const copied = new Set();

function copyPackageWithDeps(pkgName) {
  if (copied.has(pkgName)) return;
  copied.add(pkgName);
  
  const sourcePath = path.join(sourceDir, 'node_modules', pkgName);
  const targetPath = path.join(targetDir, 'nodejs/node_modules', pkgName);
  
  if (!fs.existsSync(sourcePath)) {
    console.log(`⚠️  Package not found: ${pkgName}`);
    return;
  }
  
  // Copy package
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  console.log(`✅ ${pkgName}`);
  
  // Read package.json and copy dependencies
  const pkgJsonPath = path.join(sourcePath, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const deps = Object.keys(pkgJson.dependencies || {});
    
    for (const dep of deps) {
      if (dep.startsWith('@aws-sdk/') || dep.startsWith('@smithy/') || dep.startsWith('@aws-crypto/') || dep.startsWith('@aws/')) {
        copyPackageWithDeps(dep);
      }
    }
  }
}

// Copy initial packages
for (const pkg of packages) {
  copyPackageWithDeps(pkg);
}

console.log(`\n📦 Total packages copied: ${copied.size}`);
