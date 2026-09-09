/**
 * Project Card Image Generator
 * Uses Ollama local LLM / image models to generate custom card background artwork.
 * Provides fallback procedural vector artwork when Ollama is offline.
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
 * Generate a procedural modern vector SVG background for a project card
 */
export function generateProceduralCardSvg({ projectName = 'Project', eventType = 'event', style = 'modern-abstract', customPrompt = '' }) {
  const seed = `${projectName}_${eventType}_${style}_${customPrompt}`;
  const rand = createPrng(seed);

  // Palettes tailored to styles and project types
  const palettes = {
    'modern-abstract': {
      bgStart: '#090d16',
      bgEnd: '#131b2e',
      accent1: '#6366f1',
      accent2: '#a855f7',
      glow: '#3b82f6',
      gridColor: 'rgba(99, 102, 241, 0.08)'
    },
    'fintech-growth': {
      bgStart: '#06130e',
      bgEnd: '#0f291e',
      accent1: '#10b981',
      accent2: '#06b6d4',
      glow: '#34d399',
      gridColor: 'rgba(16, 185, 129, 0.09)'
    },
    'startup-cyber': {
      bgStart: '#0d091a',
      bgEnd: '#1e1438',
      accent1: '#ec4899',
      accent2: '#8b5cf6',
      glow: '#f43f5e',
      gridColor: 'rgba(236, 72, 153, 0.08)'
    },
    'trip-horizon': {
      bgStart: '#0f172a',
      bgEnd: '#1e293b',
      accent1: '#f59e0b',
      accent2: '#0ea5e9',
      glow: '#fb923c',
      gridColor: 'rgba(245, 158, 11, 0.08)'
    },
    'architectural-blueprint': {
      bgStart: '#0a1128',
      bgEnd: '#001e3d',
      accent1: '#38bdf8',
      accent2: '#818cf8',
      glow: '#0284c7',
      gridColor: 'rgba(56, 189, 248, 0.12)'
    },
    'cosmic-gradient': {
      bgStart: '#030712',
      bgEnd: '#111827',
      accent1: '#c084fc',
      accent2: '#60a5fa',
      glow: '#e879f9',
      gridColor: 'rgba(192, 132, 252, 0.08)'
    }
  };

  // Determine appropriate palette
  let chosenPalette = palettes[style];
  if (!chosenPalette) {
    if (eventType === 'startup') chosenPalette = palettes['startup-cyber'];
    else if (eventType === 'trip') chosenPalette = palettes['trip-horizon'];
    else if (projectName.toLowerCase().includes('fund') || projectName.toLowerCase().includes('invest') || projectName.toLowerCase().includes('budget')) {
      chosenPalette = palettes['fintech-growth'];
    } else {
      chosenPalette = palettes['modern-abstract'];
    }
  }

  // Generate geometric elements
  const orbX1 = 600 + Math.floor(rand() * 160);
  const orbY1 = 80 + Math.floor(rand() * 120);
  const orbR1 = 180 + Math.floor(rand() * 100);

  const orbX2 = 100 + Math.floor(rand() * 200);
  const orbY2 = 380 + Math.floor(rand() * 100);
  const orbR2 = 140 + Math.floor(rand() * 80);

  // Wave points
  const p1y = 220 + Math.floor(rand() * 80);
  const p2y = 160 + Math.floor(rand() * 120);
  const p3y = 300 + Math.floor(rand() * 80);
  const p4y = 260 + Math.floor(rand() * 100);

  const p5y = 340 + Math.floor(rand() * 60);
  const p6y = 280 + Math.floor(rand() * 90);
  const p7y = 420 + Math.floor(rand() * 50);

  // Grid lines
  const gridLines = [];
  for (let x = 40; x < 800; x += 60) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="500" stroke="${chosenPalette.gridColor}" stroke-width="1" />`);
  }
  for (let y = 40; y < 500; y += 60) {
    gridLines.push(`<line x1="0" y1="${y}" x2="800" y2="${y}" stroke="${chosenPalette.gridColor}" stroke-width="1" />`);
  }

  // Polygon geometric accents
  const polyPoints = [
    `${700 + Math.floor(rand() * 60)},${100 + Math.floor(rand() * 50)}`,
    `${760 + Math.floor(rand() * 30)},${220 + Math.floor(rand() * 60)}`,
    `${640 + Math.floor(rand() * 50)},${260 + Math.floor(rand() * 50)}`,
    `${600 + Math.floor(rand() * 40)},${150 + Math.floor(rand() * 40)}`
  ].join(' ');

  const svg = `<svg width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${chosenPalette.bgStart}" />
      <stop offset="100%" stop-color="${chosenPalette.bgEnd}" />
    </linearGradient>
    <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${chosenPalette.glow}" stop-opacity="0.35" />
      <stop offset="100%" stop-color="${chosenPalette.glow}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${chosenPalette.accent1}" stop-opacity="0.3" />
      <stop offset="100%" stop-color="${chosenPalette.accent1}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${chosenPalette.accent1}" stop-opacity="0.6" />
      <stop offset="50%" stop-color="${chosenPalette.accent2}" stop-opacity="0.4" />
      <stop offset="100%" stop-color="${chosenPalette.glow}" stop-opacity="0.2" />
    </linearGradient>
    <linearGradient id="waveGrad2" x1="100%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="${chosenPalette.accent2}" stop-opacity="0.35" />
      <stop offset="100%" stop-color="${chosenPalette.accent1}" stop-opacity="0.05" />
    </linearGradient>
    <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="35" />
    </filter>
  </defs>

  <!-- Canvas Background -->
  <rect width="800" height="500" fill="url(#bgGrad)" />

  <!-- Ambient Light Orbs -->
  <circle cx="${orbX1}" cy="${orbY1}" r="${orbR1}" fill="url(#glow1)" filter="url(#softBlur)" />
  <circle cx="${orbX2}" cy="${orbY2}" r="${orbR2}" fill="url(#glow2)" filter="url(#softBlur)" />

  <!-- Thematic Matrix Grid -->
  <g opacity="0.7">
    ${gridLines.join('\n    ')}
  </g>

  <!-- Flowing Geometric Curves -->
  <path d="M -50,${p1y} C 200,${p2y} 500,${p3y} 850,${p4y} L 850,550 L -50,550 Z" fill="url(#waveGrad1)" opacity="0.4" />
  <path d="M -50,${p5y} C 250,${p6y} 550,${p7y} 850,${p6y} L 850,550 L -50,550 Z" fill="url(#waveGrad2)" opacity="0.6" />

  <!-- Polygons & Tech Contour -->
  <polygon points="${polyPoints}" fill="${chosenPalette.accent1}" fill-opacity="0.08" stroke="${chosenPalette.accent1}" stroke-width="1.5" stroke-opacity="0.3" />
  <circle cx="${orbX1 - 40}" cy="${orbY1 + 40}" r="6" fill="${chosenPalette.accent2}" opacity="0.6" />
  <circle cx="${orbX1 + 60}" cy="${orbY1 - 20}" r="3.5" fill="${chosenPalette.glow}" opacity="0.8" />
  <line x1="${orbX1 - 40}" y1="${orbY1 + 40}" x2="${orbX1 + 60}" y2="${orbY1 - 20}" stroke="${chosenPalette.accent2}" stroke-width="1" stroke-dasharray="4,4" opacity="0.4" />
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
  style = 'modern-abstract',
  customPrompt = '',
  requestedModel
}) {
  const config = getOllamaConfig();
  const health = await checkOllamaHealth(3000);

  // If Ollama is online, attempt generation with Ollama
  if (health.online) {
    try {
      const targetModel = requestedModel || health.effectiveModel || config.model;

      const system = `You are an expert vector illustrator and UI visual designer specializing in atmospheric, modern background art for dashboards.
Generate ONLY a clean, valid, standalone SVG element.
Requirements:
1. Output MUST start strictly with <svg and end with </svg>.
2. Do NOT write markdown, code blocks (no \`\`\`), or commentary.
3. SVG must have: width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"
4. NO TEXT: Do not include any <text> tags in the SVG. Text will be overlaid on top by the UI.
5. Create modern, dark-toned visual compositions with glowing gradients, abstract geometric waves, meshes, or futuristic shapes fitting the project.`;

      const prompt = `Create a visually stunning card background image for:
Project Name: "${projectName}"
Project Type: ${eventType}
${tasks && tasks.length > 0 ? `Key tasks/phases: ${tasks.slice(0, 3).map(t => typeof t === 'string' ? t : t.name || t.title).join(', ')}` : ''}
Visual Style: ${style}
${customPrompt ? `User Direction: ${customPrompt}` : ''}

Use deep background tones with vivid glowing gradients and modern vector geometry that look professional and atmospheric.
Return ONLY the raw <svg>...</svg> now:`;

      const ollamaRes = await generateOllama({
        prompt,
        system,
        model: targetModel,
        temperature: 0.4,
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
    model: health.model || 'procedural-v1',
    ollamaOnline: health.online,
    note: health.online 
      ? 'Generated via vector generator.' 
      : `Ollama is offline or unreachable at ${config.baseURL}. Generated custom vector artwork. Connect Ollama in Settings to use local models.`,
    style,
    promptUsed: customPrompt || `${projectName} (${style})`
  };
}
