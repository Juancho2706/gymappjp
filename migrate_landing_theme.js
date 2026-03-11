const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replacements to move from hardcoded dark theme to semantic tailwind theme
const replacements = [
    { from: /bg-\[\#050507\]/g, to: 'bg-background' },
    { from: /text-white/g, to: 'text-foreground' },
    { from: /text-black/g, to: 'text-background' },
    { from: /bg-white\/\[0\.02\]/g, to: 'bg-card' },
    { from: /bg-white\/\[0\.05\]/g, to: 'bg-secondary' },
    { from: /border-white\/\[0\.06\]/g, to: 'border-border' },
    { from: /border-white\/\[0\.08\]/g, to: 'border-border' },
    { from: /border-white\/10/g, to: 'border-border' },
    { from: /border-white\/20/g, to: 'border-border' },
    { from: /bg-black\/80/g, to: 'bg-background/80' },
    { from: /shadow-black\/40/g, to: 'shadow-foreground/5' },
    { from: /text-white\/40/g, to: 'text-muted-foreground' },
    { from: /text-white\/50/g, to: 'text-muted-foreground' },
    { from: /text-white\/60/g, to: 'text-muted-foreground' },
    { from: /text-white\/70/g, to: 'text-muted-foreground' },
    { from: /hover:text-white/g, to: 'hover:text-foreground' },
    { from: /bg-white\/5/g, to: 'hover:bg-accent' },
    { from: /bg-black/g, to: 'bg-background' },
];

replacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
});

// Specifically add the ThemeToggle to the PillNav
const themeToggleImport = "import { ThemeToggle } from '@/components/ThemeToggle'";
if (!content.includes(themeToggleImport)) {
    content = content.replace("import { motion", themeToggleImport + "\nimport { motion");
    
    // Inject ThemeToggle in PillNav next to "Iniciar sesión"
    content = content.replace(
        `<Link\n                    href="/login"`, 
        `<ThemeToggle />\n                <Link\n                    href="/login"`
    );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Migrated page.tsx to semantic colors successfuly.');
