const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// Clean SVG string of the full horizontal FFPRO logo matching the uploaded image
const fullLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 240" width="820" height="240">
  <defs>
    <!-- Arrow & Chart Gradient -->
    <linearGradient id="chartGrad1" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#072B61" />
      <stop offset="100%" stop-color="#0052CC" />
    </linearGradient>
    <linearGradient id="chartGrad2" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#0047AB" />
      <stop offset="100%" stop-color="#0080E0" />
    </linearGradient>
    <linearGradient id="chartGrad3" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#0066D6" />
      <stop offset="100%" stop-color="#00B4D8" />
    </linearGradient>
    <linearGradient id="arrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#003B8E" />
      <stop offset="40%" stop-color="#0077E6" />
      <stop offset="80%" stop-color="#00C8FF" />
      <stop offset="100%" stop-color="#00F0FF" />
    </linearGradient>

    <!-- Main FFPRO Text Gradient -->
    <linearGradient id="ffproGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#072146" />
      <stop offset="25%" stop-color="#003882" />
      <stop offset="55%" stop-color="#0066CC" />
      <stop offset="80%" stop-color="#00A8E8" />
      <stop offset="100%" stop-color="#00D4FF" />
    </linearGradient>

    <!-- 3D Bevel/Facet Overlay Gradients -->
    <linearGradient id="facetDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#031027" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#002866" stop-opacity="0.05" />
    </linearGradient>
    <linearGradient id="facetLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#0077E6" stop-opacity="0.05" />
    </linearGradient>
  </defs>

  <!-- Left Icon: Growth Bar Chart & Arrow -->
  <g transform="translate(10, 10)">
    <!-- Bar 1 (Shortest) -->
    <path d="M 25,185 L 55,185 L 55,140 C 55,138 53,136 51,136 L 29,136 C 27,136 25,138 25,140 Z" fill="url(#chartGrad1)" />
    <!-- Bar 2 (Middle) -->
    <path d="M 68,185 L 98,185 L 98,115 C 98,113 96,111 94,111 L 72,111 C 70,111 68,113 68,115 Z" fill="url(#chartGrad2)" />
    <!-- Bar 3 (Tallest) -->
    <path d="M 111,185 L 141,185 L 141,88 C 141,86 139,84 137,84 L 115,84 C 113,84 111,86 111,88 Z" fill="url(#chartGrad3)" />

    <!-- Swooping Dynamic Arrow -->
    <path d="M 15,178 C 30,175 75,170 115,125 C 135,102 148,78 158,58 L 175,70 C 163,95 146,122 122,148 C 78,195 28,192 15,190 Z" fill="url(#arrowGrad)" />
    <!-- Arrowhead -->
    <path d="M 140,42 L 188,52 L 175,98 L 160,78 L 148,88 Z" fill="url(#arrowGrad)" />
  </g>

  <!-- Main Text: FFPRO -->
  <g transform="translate(220, 20)">
    <!-- Custom Vector Geometry for FFPRO -->
    <g fill="url(#ffproGrad)">
      <!-- First F -->
      <path d="M 0,35 L 72,35 L 72,59 L 28,59 L 28,80 L 65,80 L 65,104 L 28,104 L 28,140 L 0,140 Z" />
      <path d="M 0,35 L 36,35 L 0,80 Z" fill="url(#facetDark)" />
      <path d="M 28,80 L 65,80 L 28,104 Z" fill="url(#facetLight)" />

      <!-- Second F -->
      <path d="M 82,35 L 154,35 L 154,59 L 110,59 L 110,80 L 147,80 L 147,104 L 110,104 L 110,140 L 82,140 Z" />
      <path d="M 82,35 L 118,35 L 82,80 Z" fill="url(#facetDark)" />
      <path d="M 110,80 L 147,80 L 110,104 Z" fill="url(#facetLight)" />

      <!-- P -->
      <path d="M 164,35 L 222,35 C 244,35 258,47 258,69 C 258,91 244,103 222,103 L 192,103 L 192,140 L 164,140 Z M 192,58 L 192,80 L 218,80 C 227,80 231,76 231,69 C 231,62 227,58 218,58 Z" />
      <path d="M 164,35 L 205,35 L 164,85 Z" fill="url(#facetDark)" />

      <!-- R -->
      <path d="M 268,35 L 326,35 C 348,35 361,46 361,66 C 361,82 350,92 334,96 L 365,140 L 334,140 L 306,99 L 296,99 L 296,140 L 268,140 Z M 296,57 L 296,78 L 322,78 C 330,78 334,74 334,67 C 334,60 330,57 322,57 Z" />
      <path d="M 268,35 L 308,35 L 268,85 Z" fill="url(#facetDark)" />
      <path d="M 334,140 L 306,99 L 334,99 Z" fill="url(#facetLight)" />

      <!-- O -->
      <path d="M 416,33 C 447,33 468,54 468,87 C 468,120 447,142 416,142 C 385,142 364,120 364,87 C 364,54 385,33 416,33 Z M 416,58 C 399,58 392,70 392,87 C 392,104 399,117 416,117 C 433,117 440,104 440,87 C 440,70 433,58 416,58 Z" />
      <path d="M 416,33 C 442,33 468,54 468,87 L 440,87 C 440,70 430,58 416,58 Z" fill="url(#facetLight)" />
    </g>

    <!-- Subtext: FIRE FINANCE PRO -->
    <g transform="translate(0, 178)">
      <text x="0" y="0" font-family="'Plus Jakarta Sans', 'Outfit', 'Montserrat', 'Inter', system-ui, -apple-system, sans-serif" font-size="28" font-weight="900" letter-spacing="9.5">
        <tspan fill="#072146">FIRE FINANCE </tspan>
        <tspan fill="#00B4D8">PRO</tspan>
      </text>
    </g>
  </g>
</svg>`;

// Square Emblem SVG
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="chartGrad1" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#072B61" />
      <stop offset="100%" stop-color="#0052CC" />
    </linearGradient>
    <linearGradient id="chartGrad2" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#0047AB" />
      <stop offset="100%" stop-color="#0080E0" />
    </linearGradient>
    <linearGradient id="chartGrad3" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#0066D6" />
      <stop offset="100%" stop-color="#00B4D8" />
    </linearGradient>
    <linearGradient id="arrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#003B8E" />
      <stop offset="40%" stop-color="#0077E6" />
      <stop offset="80%" stop-color="#00C8FF" />
      <stop offset="100%" stop-color="#00F0FF" />
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="40" fill="#FFFFFF" />
  <g transform="translate(5, 0)">
    <path d="M 25,160 L 55,160 L 55,115 C 55,113 53,111 51,111 L 29,111 C 27,111 25,113 25,115 Z" fill="url(#chartGrad1)" />
    <path d="M 68,160 L 98,160 L 98,90 C 98,88 96,86 94,86 L 72,86 C 70,86 68,88 68,90 Z" fill="url(#chartGrad2)" />
    <path d="M 111,160 L 141,160 L 141,63 C 141,61 139,59 137,59 L 115,59 C 113,59 111,61 111,63 Z" fill="url(#chartGrad3)" />
    <path d="M 15,153 C 30,150 75,145 115,100 C 135,77 148,53 158,33 L 175,45 C 163,70 146,97 122,123 C 78,170 28,167 15,165 Z" fill="url(#arrowGrad)" />
    <path d="M 140,17 L 188,27 L 175,73 L 160,53 L 148,63 Z" fill="url(#arrowGrad)" />
  </g>
</svg>`;

async function generate() {
  console.log('Generating logo assets from SVG...');

  const base64FullSvg = Buffer.from(fullLogoSvg).toString('base64');
  const fullSvgDataUrl = `data:image/svg+xml;base64,${base64FullSvg}`;

  const base64IconSvg = Buffer.from(iconSvg).toString('base64');
  const iconSvgDataUrl = `data:image/svg+xml;base64,${base64IconSvg}`;

  // 1. Write src/assets/logo.ts
  const logoTsContent = `// FFPRO Fire Finance Pro Logo
export const APP_LOGO = "${fullSvgDataUrl}";
export const APP_LOGO_ICON = "${iconSvgDataUrl}";
export default APP_LOGO;
`;
  fs.writeFileSync(path.join(__dirname, '../src/assets/logo.ts'), logoTsContent);
  console.log('✓ Updated src/assets/logo.ts');

  // 2. Render PNGs using @napi-rs/canvas
  const img = await loadImage(`data:image/svg+xml;base64,${base64FullSvg}`);

  // High-res logo (820x240)
  const canvas = createCanvas(820, 240);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 820, 240);
  const pngBuffer = canvas.toBuffer('image/png');

  fs.writeFileSync(path.join(__dirname, '../public/logo.png'), pngBuffer);
  fs.writeFileSync(path.join(__dirname, '../logo.png'), pngBuffer);
  fs.writeFileSync(path.join(__dirname, '../src/assets/images/app_logo_1788351745024.jpg'), pngBuffer);

  if (fs.existsSync(path.join(__dirname, '../dist'))) {
    fs.writeFileSync(path.join(__dirname, '../dist/logo.png'), pngBuffer);
  }

  // Favicon (256x256)
  const iconImg = await loadImage(`data:image/svg+xml;base64,${base64IconSvg}`);
  const favCanvas = createCanvas(256, 256);
  const favCtx = favCanvas.getContext('2d');
  favCtx.drawImage(iconImg, 0, 0, 256, 256);
  const favBuffer = favCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, '../public/favicon.png'), favBuffer);
  if (fs.existsSync(path.join(__dirname, '../dist'))) {
    fs.writeFileSync(path.join(__dirname, '../dist/favicon.png'), favBuffer);
  }
  console.log('✓ Generated public/logo.png, public/favicon.png, logo.png, app_logo_1788351745024.jpg');

  console.log('All logo assets successfully generated!');
}

generate().catch(err => {
  console.error('Error generating logo:', err);
  process.exit(1);
});
