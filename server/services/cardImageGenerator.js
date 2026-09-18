/**
 * Project Card Image Generator
 * Uses Ollama local LLM / image models to generate custom card background artwork.
 * Provides rich, colorful procedural vector artwork when Ollama is offline or as fallback.
 */

import { generateOllama, checkOllamaHealth, getOllamaConfig } from './ollamaService.js';

// Seeded pseudo-random number generator for deterministic procedural artwork
function createPrng(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  }
  return function() {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    return ((h += h << 5) >>> 0) / 4294967296;
  };
}

/**
 * Rich, high-vibrancy color palettes with vivid stops and luminous glowing accents
 */
export const PALETTES = {
  'tropical-sunset': {
    name: 'Tropical Sunset',
    bgStart: '#1a0826',
    bgMid: '#431407',
    bgEnd: '#082f49',
    accent1: '#f97316', // Vibrant Sunset Orange
    accent2: '#ec4899', // Hot Pink
    accent3: '#06b6d4', // Tropical Cyan
    accent4: '#fbbf24', // Sun Amber
    glow1: '#ff007a',
    glow2: '#fb923c',
    gridColor: 'rgba(251, 146, 60, 0.15)',
    sunColor: '#fde047',
    sunGlow: '#f97316',
    vibe: 'sunset'
  },
  'caribbean-azure': {
    name: 'Caribbean Azure',
    bgStart: '#042f2e',
    bgMid: '#0e7490',
    bgEnd: '#1e3a8a',
    accent1: '#06b6d4', // Bright Cyan
    accent2: '#14b8a6', // Turquoise Teal
    accent3: '#38bdf8', // Sky Blue
    accent4: '#fbbf24', // Island Sun Gold
    glow1: '#00f2fe',
    glow2: '#4facfe',
    gridColor: 'rgba(6, 182, 212, 0.18)',
    sunColor: '#fef08a',
    sunGlow: '#38bdf8',
    vibe: 'ocean'
  },
  'cyber-synthwave': {
    name: 'Cyber Synthwave',
    bgStart: '#090514',
    bgMid: '#1e0836',
    bgEnd: '#0f172a',
    accent1: '#00f5d4', // Electric Neon Mint
    accent2: '#f72585', // Radiant Magenta
    accent3: '#7209b7', // Deep Neon Violet
    accent4: '#4cc9f0', // Neon Sky
    glow1: '#f72585',
    glow2: '#00f5d4',
    gridColor: 'rgba(247, 37, 133, 0.22)',
    sunColor: '#ff007f',
    sunGlow: '#7209b7',
    vibe: 'synthwave'
  },
  'emerald-growth': {
    name: 'Emerald Prosperity',
    bgStart: '#022c22',
    bgMid: '#064e3b',
    bgEnd: '#0f172a',
    accent1: '#10b981', // Vivid Emerald
    accent2: '#34d399', // Mint Glow
    accent3: '#06b6d4', // Aqua Accent
    accent4: '#facc15', // Gold Coin Accent
    glow1: '#10b981',
    glow2: '#06b6d4',
    gridColor: 'rgba(16, 185, 129, 0.18)',
    sunColor: '#a7f3d0',
    sunGlow: '#10b981',
    vibe: 'growth'
  },
  'cosmic-prism': {
    name: 'Cosmic Prism',
    bgStart: '#0b061e',
    bgMid: '#240a34',
    bgEnd: '#020617',
    accent1: '#c084fc', // Bright Lilac
    accent2: '#f43f5e', // Vivid Rose
    accent3: '#38bdf8', // Neon Cyan
    accent4: '#e879f9', // Radiant Fuchsia
    glow1: '#d946ef',
    glow2: '#6366f1',
    gridColor: 'rgba(192, 132, 252, 0.2)',
    sunColor: '#f0abfc',
    sunGlow: '#818cf8',
    vibe: 'cosmic'
  },
  'golden-amber': {
    name: 'Royal Amber & Gold',
    bgStart: '#18120c',
    bgMid: '#382006',
    bgEnd: '#0c0a09',
    accent1: '#f59e0b', // Radiant Amber
    accent2: '#fbbf24', // Pure Gold
    accent3: '#ef4444', // Fiery Ruby
    accent4: '#ea580c', // Burnished Orange
    glow1: '#f59e0b',
    glow2: '#ef4444',
    gridColor: 'rgba(245, 158, 11, 0.2)',
    sunColor: '#fef3c7',
    sunGlow: '#f59e0b',
    vibe: 'luxury'
  },
  'modern-abstract': {
    name: 'Electric Aurora',
    bgStart: '#080d21',
    bgMid: '#161d42',
    bgEnd: '#030712',
    accent1: '#6366f1', // Electric Indigo
    accent2: '#a855f7', // Vivid Purple
    accent3: '#06b6d4', // Cyan Beam
    accent4: '#f43f5e', // Hot Coral
    glow1: '#6366f1',
    glow2: '#06b6d4',
    gridColor: 'rgba(99, 102, 241, 0.2)',
    sunColor: '#c7d2fe',
    sunGlow: '#818cf8',
    vibe: 'aurora'
  },
  'architectural-blueprint': {
    name: 'Neon Blueprint',
    bgStart: '#03192e',
    bgMid: '#0c4a6e',
    bgEnd: '#020617',
    accent1: '#38bdf8', // Bright Cyan Line
    accent2: '#818cf8', // Indigo Glow
    accent3: '#22d3ee', // Electric Aqua
    accent4: '#f472b6', // Laser Magenta
    glow1: '#38bdf8',
    glow2: '#818cf8',
    gridColor: 'rgba(56, 189, 248, 0.25)',
    sunColor: '#bae6fd',
    sunGlow: '#0284c7',
    vibe: 'blueprint'
  }
};

/**
 * Generate a procedural modern, colorful vector SVG background for a project card
 */
export function generateProceduralCardSvg({ projectName = 'Project', eventType = 'event', style = 'modern-abstract', customPrompt = '' }) {
  const seed = `${projectName}_${eventType}_${style}_${customPrompt}`;
  const rand = createPrng(seed);

  // Map legacy style IDs to our rich colorful palettes
  const styleAliases = {
    'trip-horizon': 'tropical-sunset',
    'fintech-growth': 'emerald-growth',
    'startup-cyber': 'cyber-synthwave',
    'cosmic-gradient': 'cosmic-prism'
  };

  const activeStyleKey = styleAliases[style] || style;
  let pal = PALETTES[activeStyleKey];

  if (!pal) {
    if (eventType === 'trip') {
      pal = rand() > 0.5 ? PALETTES['tropical-sunset'] : PALETTES['caribbean-azure'];
    } else if (eventType === 'startup') {
      pal = rand() > 0.5 ? PALETTES['cyber-synthwave'] : PALETTES['emerald-growth'];
    } else if (projectName.toLowerCase().includes('vacation') || projectName.toLowerCase().includes('flight') || projectName.toLowerCase().includes('travel') || projectName.toLowerCase().includes('beach')) {
      pal = PALETTES['caribbean-azure'];
    } else if (projectName.toLowerCase().includes('fund') || projectName.toLowerCase().includes('loan') || projectName.toLowerCase().includes('invest') || projectName.toLowerCase().includes('profit') || projectName.toLowerCase().includes('budget')) {
      pal = PALETTES['emerald-growth'];
    } else {
      const keys = Object.keys(PALETTES);
      pal = PALETTES[keys[Math.floor(rand() * keys.length)]];
    }
  }

  // Pick one of 5 distinct visual layout archetypes based on seed and vibe
  const archetypes = ['horizon-sunburst', 'fluid-chromatic-mesh', 'cyber-perspective-matrix', 'faceted-crystal-prism', 'organic-topographic-waves'];
  let archetype = archetypes[Math.floor(rand() * archetypes.length)];
  if (pal.vibe === 'synthwave') archetype = 'cyber-perspective-matrix';
  if (pal.vibe === 'sunset' || pal.vibe === 'ocean') archetype = rand() > 0.4 ? 'horizon-sunburst' : 'organic-topographic-waves';

  // Luminous orbs & coordinates
  const orbX1 = 550 + Math.floor(rand() * 200);
  const orbY1 = 80 + Math.floor(rand() * 140);
  const orbR1 = 180 + Math.floor(rand() * 120);

  const orbX2 = 80 + Math.floor(rand() * 220);
  const orbY2 = 340 + Math.floor(rand() * 120);
  const orbR2 = 160 + Math.floor(rand() * 100);

  const orbX3 = 380 + Math.floor(rand() * 200);
  const orbY3 = 200 + Math.floor(rand() * 150);
  const orbR3 = 120 + Math.floor(rand() * 80);

  // Gradient ID prefix to ensure unique SVG IDs
  const idPrefix = 'c' + Math.floor(rand() * 100000);

  // Grid lines
  const gridLines = [];
  for (let x = 40; x < 800; x += 50) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="500" stroke="${pal.gridColor}" stroke-width="1" stroke-dasharray="3,3" />`);
  }
  for (let y = 30; y < 500; y += 45) {
    gridLines.push(`<line x1="0" y1="${y}" x2="800" y2="${y}" stroke="${pal.gridColor}" stroke-width="1" stroke-dasharray="3,3" />`);
  }

  // Floating colorful particles & stars
  const particles = [];
  for (let i = 0; i < 16; i++) {
    const px = Math.floor(rand() * 760) + 20;
    const py = Math.floor(rand() * 460) + 20;
    const pr = 1.5 + Math.floor(rand() * 3.5 * 10) / 10;
    const pColor = i % 3 === 0 ? pal.accent1 : i % 3 === 1 ? pal.accent2 : pal.accent4;
    const pOpacity = 0.5 + Math.floor(rand() * 5) / 10;
    particles.push(`<circle cx="${px}" cy="${py}" r="${pr}" fill="${pColor}" opacity="${pOpacity}" />`);
  }

  // Render specific layout archetype content
  let layoutElements = '';

  if (archetype === 'horizon-sunburst') {
    // Glowing radiant sun with horizon rays and flowing landscape/wave layers
    const sunX = 620 + Math.floor(rand() * 80);
    const sunY = 160 + Math.floor(rand() * 80);
    const sunR = 75 + Math.floor(rand() * 30);

    layoutElements = `
    <!-- Luminous Radiant Sun / Disc -->
    <circle cx="${sunX}" cy="${sunY}" r="${sunR + 60}" fill="url(#${idPrefix}_sunGlow)" opacity="0.4" filter="url(#${idPrefix}_blurLg)" />
    <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="url(#${idPrefix}_sunGrad)" />
    <!-- Sun Horizontal Scanlines / Rings -->
    <g opacity="0.65">
      <line x1="${sunX - sunR}" y1="${sunY - 15}" x2="${sunX + sunR}" y2="${sunY - 15}" stroke="${pal.bgStart}" stroke-width="3" />
      <line x1="${sunX - sunR * 0.9}" y1="${sunY + 10}" x2="${sunX + sunR * 0.9}" y2="${sunY + 10}" stroke="${pal.bgStart}" stroke-width="4.5" />
      <line x1="${sunX - sunR * 0.75}" y1="${sunY + 35}" x2="${sunX + sunR * 0.75}" y2="${sunY + 35}" stroke="${pal.bgStart}" stroke-width="6" />
      <line x1="${sunX - sunR * 0.55}" y1="${sunY + 55}" x2="${sunX + sunR * 0.55}" y2="${sunY + 55}" stroke="${pal.bgStart}" stroke-width="7" />
    </g>

    <!-- Layered Mountain / Island / Wave Ridges -->
    <path d="M -50,320 Q 200,240 450,290 T 850,260 L 850,550 L -50,550 Z" fill="url(#${idPrefix}_layer1)" opacity="0.75" />
    <path d="M -50,380 Q 250,310 520,360 T 850,330 L 850,550 L -50,550 Z" fill="url(#${idPrefix}_layer2)" opacity="0.85" />
    <path d="M -50,440 Q 300,390 600,420 T 850,400 L 850,550 L -50,550 Z" fill="url(#${idPrefix}_layer3)" opacity="0.95" />

    <!-- Radiant Light Ribbons -->
    <path d="M 0,260 C 250,180 500,340 800,220" stroke="${pal.accent4}" stroke-width="2.5" fill="none" opacity="0.7" filter="url(#${idPrefix}_blurSm)" />
    <path d="M 0,290 C 280,220 520,370 800,260" stroke="${pal.accent1}" stroke-width="1.5" fill="none" opacity="0.85" />
    `;
  } else if (archetype === 'cyber-perspective-matrix') {
    // 3D Perspective Synthwave / Cyber Grid with Glowing Horizon & Neon Laser Beams
    const horizonY = 250 + Math.floor(rand() * 40);
    const vpX = 400 + Math.floor(rand() * 100) - 50;

    const perspectiveLines = [];
    for (let x = -200; x <= 1000; x += 60) {
      perspectiveLines.push(`<line x1="${vpX}" y1="${horizonY}" x2="${x}" y2="520" stroke="${pal.accent1}" stroke-width="1.5" stroke-opacity="0.5" />`);
    }
    const horizontalGrid = [];
    for (let i = 1; i <= 8; i++) {
      const yPos = horizonY + Math.pow(i / 8, 1.8) * (500 - horizonY);
      horizontalGrid.push(`<line x1="0" y1="${yPos}" x2="800" y2="${yPos}" stroke="${pal.accent2}" stroke-width="${1 + i * 0.3}" stroke-opacity="${0.25 + i * 0.08}" />`);
    }

    layoutElements = `
    <!-- Glowing Laser Horizon Sun -->
    <circle cx="${vpX}" cy="${horizonY}" r="110" fill="url(#${idPrefix}_sunGrad)" filter="url(#${idPrefix}_blurSm)" opacity="0.9" />
    
    <!-- Neon Sky Starburst Lines -->
    <g opacity="0.4">
      <line x1="${vpX}" y1="${horizonY}" x2="100" y2="0" stroke="${pal.accent4}" stroke-width="1.5" />
      <line x1="${vpX}" y1="${horizonY}" x2="350" y2="0" stroke="${pal.accent2}" stroke-width="1" />
      <line x1="${vpX}" y1="${horizonY}" x2="600" y2="0" stroke="${pal.accent3}" stroke-width="1.5" />
      <line x1="${vpX}" y1="${horizonY}" x2="800" y2="80" stroke="${pal.accent1}" stroke-width="1" />
    </g>

    <!-- Perspective Cyber Grid Floor -->
    <rect x="0" y="${horizonY}" width="800" height="${500 - horizonY}" fill="url(#${idPrefix}_gridFloorGrad)" opacity="0.8" />
    <g>
      ${perspectiveLines.join('\n      ')}
      ${horizontalGrid.join('\n      ')}
    </g>

    <!-- Neon Horizon Beam -->
    <line x1="0" y1="${horizonY}" x2="800" y2="${horizonY}" stroke="${pal.accent1}" stroke-width="3" opacity="0.9" filter="url(#${idPrefix}_blurSm)" />
    <line x1="0" y1="${horizonY}" x2="800" y2="${horizonY}" stroke="#ffffff" stroke-width="1.5" opacity="0.9" />
    `;
  } else if (archetype === 'faceted-crystal-prism') {
    // Modern Prismatic Geometric Crystal Mesh & Translucent Facets
    const cx = 580 + Math.floor(rand() * 80);
    const cy = 220 + Math.floor(rand() * 80);

    const nodes = [
      [cx, cy - 140],
      [cx + 120, cy - 60],
      [cx + 140, cy + 70],
      [cx + 40, cy + 150],
      [cx - 90, cy + 120],
      [cx - 130, cy - 30],
      [cx - 20, cy - 10]
    ];

    const facets = [
      `M ${nodes[0][0]},${nodes[0][1]} L ${nodes[1][0]},${nodes[1][1]} L ${nodes[6][0]},${nodes[6][1]} Z`,
      `M ${nodes[1][0]},${nodes[1][1]} L ${nodes[2][0]},${nodes[2][1]} L ${nodes[6][0]},${nodes[6][1]} Z`,
      `M ${nodes[2][0]},${nodes[2][1]} L ${nodes[3][0]},${nodes[3][1]} L ${nodes[6][0]},${nodes[6][1]} Z`,
      `M ${nodes[3][0]},${nodes[3][1]} L ${nodes[4][0]},${nodes[4][1]} L ${nodes[6][0]},${nodes[6][1]} Z`,
      `M ${nodes[4][0]},${nodes[4][1]} L ${nodes[5][0]},${nodes[5][1]} L ${nodes[6][0]},${nodes[6][1]} Z`,
      `M ${nodes[5][0]},${nodes[5][1]} L ${nodes[0][0]},${nodes[0][1]} L ${nodes[6][0]},${nodes[6][1]} Z`
    ];

    layoutElements = `
    <!-- Ambient Prismatic Background Grid -->
    <g opacity="0.6">
      ${gridLines.slice(0, 14).join('\n      ')}
    </g>

    <!-- Glowing Crystal Facets -->
    <path d="${facets[0]}" fill="${pal.accent1}" fill-opacity="0.45" stroke="${pal.accent4}" stroke-width="1.5" />
    <path d="${facets[1]}" fill="${pal.accent2}" fill-opacity="0.55" stroke="${pal.accent1}" stroke-width="1.5" />
    <path d="${facets[2]}" fill="${pal.accent3}" fill-opacity="0.5" stroke="${pal.accent2}" stroke-width="1.5" />
    <path d="${facets[3]}" fill="${pal.accent4}" fill-opacity="0.4" stroke="${pal.accent3}" stroke-width="1.5" />
    <path d="${facets[4]}" fill="${pal.accent1}" fill-opacity="0.6" stroke="${pal.accent4}" stroke-width="1.5" />
    <path d="${facets[5]}" fill="${pal.accent2}" fill-opacity="0.35" stroke="${pal.accent1}" stroke-width="1.5" />

    <!-- Prismatic Node Vertices with Halo Glare -->
    ${nodes.map(n => `<circle cx="${n[0]}" cy="${n[1]}" r="5" fill="#ffffff" stroke="${pal.accent1}" stroke-width="2" />`).join('\n    ')}
    <circle cx="${nodes[6][0]}" cy="${nodes[6][1]}" r="9" fill="${pal.sunColor}" filter="url(#${idPrefix}_blurSm)" />
    
    <!-- Flowing Prismatic Ribbons -->
    <path d="M -50,420 C 220,320 480,480 850,360 L 850,550 L -50,550 Z" fill="url(#${idPrefix}_layer1)" opacity="0.75" />
    `;
  } else if (archetype === 'organic-topographic-waves') {
    // Vivid Topographic Elevation Waves & Caribbean Marine Curves
    const w1y = 180 + Math.floor(rand() * 80);
    const w2y = 260 + Math.floor(rand() * 80);
    const w3y = 340 + Math.floor(rand() * 70);
    const w4y = 420 + Math.floor(rand() * 50);

    layoutElements = `
    <!-- Topographic Ribbons with High-Saturation Gradients -->
    <path d="M -50,${w1y} C 200,${w1y - 80} 500,${w1y + 100} 850,${w1y - 40} L 850,550 L -50,550 Z" fill="url(#${idPrefix}_wave1)" opacity="0.7" />
    <path d="M -50,${w2y} C 250,${w2y + 90} 550,${w2y - 90} 850,${w2y + 40} L 850,550 L -50,550 Z" fill="url(#${idPrefix}_wave2)" opacity="0.8" />
    <path d="M -50,${w3y} C 220,${w3y - 70} 580,${w3y + 80} 850,${w3y - 20} L 850,550 L -50,550 Z" fill="url(#${idPrefix}_wave3)" opacity="0.85" />
    <path d="M -50,${w4y} C 300,${w4y + 60} 600,${w4y - 60} 850,${w4y + 20} L 850,550 L -50,550 Z" fill="url(#${idPrefix}_wave4)" opacity="0.95" />

    <!-- Luminous Contour Edge Accents -->
    <path d="M -50,${w1y} C 200,${w1y - 80} 500,${w1y + 100} 850,${w1y - 40}" stroke="${pal.accent4}" stroke-width="2" fill="none" opacity="0.75" />
    <path d="M -50,${w2y} C 250,${w2y + 90} 550,${w2y - 90} 850,${w2y + 40}" stroke="${pal.accent1}" stroke-width="2.5" fill="none" opacity="0.85" />
    <path d="M -50,${w3y} C 220,${w3y - 70} 580,${w3y + 80} 850,${w3y - 20}" stroke="${pal.accent2}" stroke-width="2" fill="none" opacity="0.9" />
    `;
  } else {
    // Fluid Chromatic Mesh & Luminous Blobs
    layoutElements = `
    <!-- Fluid Chromatic Multi-Stop Organic Mesh -->
    <path d="M -60,200 C 180,80 340,320 600,160 C 720,80 780,240 860,200 L 860,550 L -60,550 Z" fill="url(#${idPrefix}_layer1)" opacity="0.7" />
    <path d="M -60,300 C 140,420 380,220 580,380 C 690,460 760,320 860,360 L 860,550 L -60,550 Z" fill="url(#${idPrefix}_layer2)" opacity="0.85" />
    <path d="M -60,400 C 220,320 460,460 700,380 C 780,340 820,440 860,420 L 860,550 L -60,550 Z" fill="url(#${idPrefix}_layer3)" opacity="0.95" />

    <!-- Chromatic Glowing Spheres with Radial Gradients -->
    <circle cx="${orbX1 - 50}" cy="${orbY1 + 50}" r="35" fill="url(#${idPrefix}_glowOrb1)" opacity="0.85" />
    <circle cx="${orbX2 + 80}" cy="${orbY2 - 60}" r="26" fill="url(#${idPrefix}_glowOrb2)" opacity="0.85" />
    <circle cx="${orbX3}" cy="${orbY3}" r="45" fill="url(#${idPrefix}_glowOrb3)" opacity="0.75" />

    <!-- Connecting Dynamic Laser Arcs -->
    <path d="M ${orbX2 + 80},${orbY2 - 60} Q ${orbX3},${orbY3 - 40} ${orbX1 - 50},${orbY1 + 50}" stroke="${pal.accent4}" stroke-width="2" fill="none" opacity="0.7" stroke-dasharray="6,4" />
    `;
  }

  const svg = `<svg width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Multi-Stop Linear Gradient -->
    <linearGradient id="${idPrefix}_bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pal.bgStart}" />
      <stop offset="50%" stop-color="${pal.bgMid}" />
      <stop offset="100%" stop-color="${pal.bgEnd}" />
    </linearGradient>

    <!-- Vibrant Ambient Light Orbs -->
    <radialGradient id="${idPrefix}_glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal.glow1}" stop-opacity="0.75" />
      <stop offset="40%" stop-color="${pal.accent1}" stop-opacity="0.45" />
      <stop offset="100%" stop-color="${pal.glow1}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="${idPrefix}_glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal.glow2}" stop-opacity="0.7" />
      <stop offset="45%" stop-color="${pal.accent2}" stop-opacity="0.4" />
      <stop offset="100%" stop-color="${pal.glow2}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="${idPrefix}_glow3" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal.accent4}" stop-opacity="0.65" />
      <stop offset="100%" stop-color="${pal.accent4}" stop-opacity="0" />
    </radialGradient>

    <!-- Sun / Focal Light Disc Gradients -->
    <linearGradient id="${idPrefix}_sunGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${pal.sunColor}" />
      <stop offset="60%" stop-color="${pal.accent1}" />
      <stop offset="100%" stop-color="${pal.accent2}" />
    </linearGradient>
    <radialGradient id="${idPrefix}_sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal.sunGlow}" stop-opacity="0.8" />
      <stop offset="100%" stop-color="${pal.sunGlow}" stop-opacity="0" />
    </radialGradient>

    <!-- Flowing Layer Gradients -->
    <linearGradient id="${idPrefix}_layer1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pal.accent1}" stop-opacity="0.85" />
      <stop offset="50%" stop-color="${pal.accent2}" stop-opacity="0.7" />
      <stop offset="100%" stop-color="${pal.accent3}" stop-opacity="0.4" />
    </linearGradient>
    <linearGradient id="${idPrefix}_layer2" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${pal.accent3}" stop-opacity="0.85" />
      <stop offset="50%" stop-color="${pal.accent1}" stop-opacity="0.75" />
      <stop offset="100%" stop-color="${pal.accent4}" stop-opacity="0.4" />
    </linearGradient>
    <linearGradient id="${idPrefix}_layer3" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pal.accent2}" stop-opacity="0.9" />
      <stop offset="60%" stop-color="${pal.accent4}" stop-opacity="0.7" />
      <stop offset="100%" stop-color="${pal.bgEnd}" stop-opacity="0.95" />
    </linearGradient>

    <!-- Wave Gradients -->
    <linearGradient id="${idPrefix}_wave1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pal.accent1}" stop-opacity="0.8" />
      <stop offset="100%" stop-color="${pal.accent2}" stop-opacity="0.5" />
    </linearGradient>
    <linearGradient id="${idPrefix}_wave2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pal.accent3}" stop-opacity="0.85" />
      <stop offset="100%" stop-color="${pal.accent1}" stop-opacity="0.6" />
    </linearGradient>
    <linearGradient id="${idPrefix}_wave3" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pal.accent2}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${pal.accent4}" stop-opacity="0.7" />
    </linearGradient>
    <linearGradient id="${idPrefix}_wave4" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${pal.accent4}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${pal.bgEnd}" stop-opacity="0.95" />
    </linearGradient>

    <!-- Chromatic Glowing Spheres -->
    <radialGradient id="${idPrefix}_glowOrb1" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="30%" stop-color="${pal.accent4}" />
      <stop offset="100%" stop-color="${pal.accent1}" stop-opacity="0.2" />
    </radialGradient>
    <radialGradient id="${idPrefix}_glowOrb2" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="30%" stop-color="${pal.accent3}" />
      <stop offset="100%" stop-color="${pal.accent2}" stop-opacity="0.2" />
    </radialGradient>
    <radialGradient id="${idPrefix}_glowOrb3" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="35%" stop-color="${pal.accent1}" />
      <stop offset="100%" stop-color="${pal.accent2}" stop-opacity="0.2" />
    </radialGradient>

    <!-- Grid Floor Gradient -->
    <linearGradient id="${idPrefix}_gridFloorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${pal.bgMid}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${pal.bgStart}" stop-opacity="0.95" />
    </linearGradient>

    <!-- Bottom Vignette Gradient (ensures text readability over artwork) -->
    <linearGradient id="${idPrefix}_bottomVignette" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0" />
      <stop offset="60%" stop-color="#000000" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.75" />
    </linearGradient>

    <!-- Soft Blur Filters -->
    <filter id="${idPrefix}_blurLg" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="40" />
    </filter>
    <filter id="${idPrefix}_blurSm" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" />
    </filter>
  </defs>

  <!-- Deep Vibrant Canvas Background -->
  <rect width="800" height="500" fill="url(#${idPrefix}_bgGrad)" />

  <!-- Luminous Ambient Light Flares -->
  <circle cx="${orbX1}" cy="${orbY1}" r="${orbR1}" fill="url(#${idPrefix}_glow1)" filter="url(#${idPrefix}_blurLg)" />
  <circle cx="${orbX2}" cy="${orbY2}" r="${orbR2}" fill="url(#${idPrefix}_glow2)" filter="url(#${idPrefix}_blurLg)" />
  <circle cx="${orbX3}" cy="${orbY3}" r="${orbR3}" fill="url(#${idPrefix}_glow3)" filter="url(#${idPrefix}_blurLg)" />

  <!-- Thematic Dynamic Vector Layout Elements -->
  ${layoutElements}

  <!-- Floating Prismatic Stardust / Sparks -->
  <g>
    ${particles.join('\n    ')}
  </g>

  <!-- Bottom Contrast Vignette (Keeps Project Title & Badges Crisp) -->
  <rect width="800" height="500" fill="url(#${idPrefix}_bottomVignette)" />
</svg>`;

  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/**
 * Clean and extract valid SVG from an LLM text output
 */
function extractSvgFromText(text) {
  if (!text || typeof text !== 'string') return null;

  // Find <svg and </svg>
  const startIdx = text.indexOf('<svg');
  const endIdx = text.lastIndexOf('</svg>');

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }

  let svgContent = text.substring(startIdx, endIdx + 6).trim();

  // Ensure mandatory attributes
  if (!svgContent.includes('xmlns=')) {
    svgContent = svgContent.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!svgContent.includes('viewBox=')) {
    svgContent = svgContent.replace('<svg', '<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice"');
  }

  // Remove any stray script tags for security
  svgContent = svgContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  return svgContent;
}

/**
 * Main function: Generate Project Card Image using Ollama (with procedural fallback)
 */
export async function generateProjectCardImage({
  projectName,
  eventType = 'event',
  tasks = [],
  notes = '',
  style = 'tropical-sunset',
  customPrompt = '',
  requestedModel
}) {
  const config = getOllamaConfig();
  const health = await checkOllamaHealth(3000);

  // If Ollama is online, attempt generation with Ollama
  if (health.online) {
    try {
      const targetModel = requestedModel || health.effectiveModel || config.model;

      const system = `You are a world-class vector artist and visual designer creating vibrant, colorful, atmospheric background art for dashboard cards.
Generate ONLY a clean, valid, standalone SVG element.
Requirements:
1. Output MUST start strictly with <svg and end with </svg>.
2. Do NOT write markdown, code blocks (no \`\`\`), or commentary.
3. SVG must have: width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"
4. NO TEXT: Do not include any <text> tags in the SVG. The UI overlays text dynamically.
5. COLOR & VIBRANCY: Use rich, saturated, glowing color palettes (such as vibrant sunset orange, neon cyan, electric magenta, tropical turquoise, gold amber, emerald green, and deep indigo). Avoid dull, dark, or monochromatic designs.
6. COMPOSITION: Include rich vector techniques: multi-stop gradients (<linearGradient>, <radialGradient>), glowing light orbs with gaussian blur (<feGaussianBlur>), layered flowing waves, geometric contour ribbons, or radiant sun discs.`;

      const prompt = `Create a colorful, vibrant, modern card background vector artwork for:
Project Name: "${projectName}"
Project Type: ${eventType}
${tasks && tasks.length > 0 ? `Key Focus/Tasks: ${tasks.slice(0, 3).map(t => typeof t === 'string' ? t : t.name || t.title).join(', ')}` : ''}
Visual Theme/Style: ${style}
${customPrompt ? `User Direction: ${customPrompt}` : ''}

Key Style Guidelines:
- High-saturation, beautiful glowing colors (coral, turquoise, amber, magenta, emerald, cyan, violet).
- Radiant background gradients with glowing circular orbs and elegant layered wave/geometric shapes.
- Visually engaging and atmospheric.

Return ONLY the raw <svg>...</svg> now:`;

      const ollamaRes = await generateOllama({
        prompt,
        system,
        model: targetModel,
        temperature: 0.6,
        timeoutMs: 25000
      });

      const extractedSvg = extractSvgFromText(ollamaRes.text);
      if (extractedSvg) {
        const base64Svg = 'data:image/svg+xml;base64,' + Buffer.from(extractedSvg).toString('base64');
        return {
          imageUrl: base64Svg,
          provider: 'ollama',
          model: ollamaRes.model || targetModel,
          ollamaOnline: true,
          style,
          promptUsed: customPrompt || `${projectName} (${style})`
        };
      }
    } catch (ollamaErr) {
      console.warn('[Ollama Card Image] Ollama generation failed, using procedural vector fallback:', ollamaErr.message);
    }
  }

  // Procedural generative fallback when Ollama is offline or generation encounters an issue
  const fallbackSvgUrl = generateProceduralCardSvg({
    projectName,
    eventType,
    style,
    customPrompt
  });

  return {
    imageUrl: fallbackSvgUrl,
    provider: health.online ? 'procedural-refined' : 'procedural-fallback',
    model: health.model || 'procedural-v2-vibrant',
    ollamaOnline: health.online,
    note: health.online 
      ? 'Generated via vibrant vector artwork engine.' 
      : `Ollama is offline or unreachable at ${config.baseURL}. Generated custom vibrant vector artwork. Connect Ollama in Settings to use local models.`,
    style,
    promptUsed: customPrompt || `${projectName} (${style})`
  };
}
