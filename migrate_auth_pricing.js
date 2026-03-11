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
    path.join(__dirname, 'src/app/(auth)'),
    path.join(__dirname, 'src/app/pricing')
];

const replacements = [
    { from: /bg-zinc-950/g, to: 'bg-background' },
    { from: /bg-zinc-900/g, to: 'bg-card' },
    { from: /bg-zinc-800/g, to: 'bg-secondary' },
    { from: /bg-\[\#050507\]/g, to: 'bg-background' },
    
    { from: /border-zinc-800/g, to: 'border-border' },
    { from: /border-zinc-900/g, to: 'border-border' },
    { from: /border-zinc-700/g, to: 'border-border hover:border-accent' },
    
    { from: /text-zinc-100/g, to: 'text-foreground' },
    { from: /text-zinc-300/g, to: 'text-muted-foreground' },
    { from: /text-zinc-400/g, to: 'text-muted-foreground' },
    { from: /text-zinc-500/g, to: 'text-muted-foreground' },
    { from: /text-zinc-600/g, to: 'text-muted-foreground' },
    
    { from: /text-white\/40/g, to: 'text-muted-foreground' },
    { from: /text-white\/50/g, to: 'text-muted-foreground' },
    { from: /text-white\/60/g, to: 'text-muted-foreground' },
    { from: /text-white\/70/g, to: 'text-muted-foreground' },

    { from: /hover:bg-zinc-800/g, to: 'hover:bg-accent' },
    { from: /hover:bg-zinc-900/g, to: 'hover:bg-accent' },
    { from: /bg-accent\/50/g, to: 'hover:bg-accent/50' } // fix possible duplicate
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

console.log('App theme Auth & Pricing migration complete.');
