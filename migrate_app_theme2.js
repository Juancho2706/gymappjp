const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const targetDirs = [
    path.join(__dirname, 'src/app/c'),
];

const replacements = [
    { from: /bg-black\/50/g, to: 'bg-background/50' },
    { from: /border-white\/10/g, to: 'border-border' },
    { from: /text-white focus:border-/g, to: 'text-foreground focus:border-' },
    { from: /text-white focus:outline-none/g, to: 'text-foreground focus:outline-none' },
    { from: /font-black text-white/g, to: 'font-black text-foreground' },
];

targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        walkDir(dir, (filePath) => {
            if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
                const content = fs.readFileSync(filePath, 'utf8');
                let newContent = content;
                
                replacements.forEach(({ from, to }) => {
                    newContent = newContent.replace(from, to);
                });

                if (newContent !== content) {
                    fs.writeFileSync(filePath, newContent, 'utf8');
                    console.log(`Updated: ${filePath}`);
                }
            }
        });
    }
});

console.log('App theme text-white/black migration complete.');
