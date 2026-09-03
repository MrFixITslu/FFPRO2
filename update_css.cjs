const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');

const newStyles = `@import "tailwindcss";

@theme {
  --font-sans: "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: "Fraunces", serif;
}

body { 
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif; 
    overscroll-behavior-y: contain;
    -webkit-tap-highlight-color: transparent;
    letter-spacing: -0.01em;
    background-color: #FAFAF9;
    color: #1C1917;
}

h1, h2, h3, h4, h5, h6 {
    font-family: 'Fraunces', serif;
}

.font-tabular {
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
}

.font-display {
    font-family: 'Fraunces', serif;
}

.executive-card {
    background: #ffffff;
    border: 1px solid rgba(231, 229, 228, 0.85);
    box-shadow: 0 1px 2px 0 rgba(28, 25, 23, 0.02);
}

.executive-card-interactive {
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.executive-card-interactive:hover {
    border-color: rgba(168, 162, 158, 0.4);
    box-shadow: 0 8px 24px -4px rgba(28, 25, 23, 0.04), 0 2px 8px -2px rgba(28, 25, 23, 0.02);
}`;

// Assuming the first 700 chars of css are the old ones we want to replace
const oldPrefixEnd = css.indexOf('.custom-scrollbar::-webkit-scrollbar');
if (oldPrefixEnd > -1) {
  css = newStyles + '\n' + css.substring(oldPrefixEnd);
  fs.writeFileSync('src/index.css', css);
}
