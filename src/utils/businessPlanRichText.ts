import DOMPurify from 'dompurify';

export interface FormattedBlock {
  type: 'h2' | 'h3' | 'paragraph' | 'bullet-list' | 'numbered-list';
  items?: string[];
  content?: string;
}

/**
 * Parses markdown text (headers, bold, italic, bullet & numbered lists) into sanitized HTML.
 */
export function formatBusinessPlanMarkdownToHtml(markdownText?: string): string {
  if (!markdownText || typeof markdownText !== 'string') {
    return '';
  }

  const lines = markdownText.split(/\r?\n/);
  const htmlParts: string[] = [];
  let inBulletList = false;
  let inNumberedList = false;

  const closeOpenLists = () => {
    if (inBulletList) {
      htmlParts.push('</ul>');
      inBulletList = false;
    }
    if (inNumberedList) {
      htmlParts.push('</ol>');
      inNumberedList = false;
    }
  };

  const formatInline = (text: string): string => {
    return text
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-stone-100 px-1 py-0.5 rounded text-xs text-stone-800 font-mono">$1</code>');
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      closeOpenLists();
      continue;
    }

    // Heading 2 (### or ##)
    if (trimmed.startsWith('### ')) {
      closeOpenLists();
      const content = formatInline(trimmed.substring(4));
      htmlParts.push(`<h4 class="text-xs font-bold text-stone-900 mt-3 mb-1 tracking-tight">${content}</h4>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      closeOpenLists();
      const content = formatInline(trimmed.substring(3));
      htmlParts.push(`<h3 class="text-sm font-bold text-stone-900 mt-4 mb-1.5 tracking-tight border-b border-stone-200 pb-1">${content}</h3>`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      closeOpenLists();
      const content = formatInline(trimmed.substring(2));
      htmlParts.push(`<h2 class="text-base font-bold text-stone-900 mt-4 mb-2 tracking-tight">${content}</h2>`);
      continue;
    }

    // Bullet List (- or *)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (inNumberedList) {
        htmlParts.push('</ol>');
        inNumberedList = false;
      }
      if (!inBulletList) {
        htmlParts.push('<ul class="list-disc pl-5 space-y-1 my-2 text-stone-700 text-xs">');
        inBulletList = true;
      }
      const itemContent = formatInline(bulletMatch[1]);
      htmlParts.push(`<li>${itemContent}</li>`);
      continue;
    }

    // Numbered List (1. or 2.)
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      if (inBulletList) {
        htmlParts.push('</ul>');
        inBulletList = false;
      }
      if (!inNumberedList) {
        htmlParts.push('<ol class="list-decimal pl-5 space-y-1 my-2 text-stone-700 text-xs">');
        inNumberedList = true;
      }
      const itemContent = formatInline(numberedMatch[2]);
      htmlParts.push(`<li>${itemContent}</li>`);
      continue;
    }

    // Standard paragraph
    closeOpenLists();
    const paragraphContent = formatInline(trimmed);
    htmlParts.push(`<p class="text-stone-700 text-xs leading-relaxed mb-2">${paragraphContent}</p>`);
  }

  closeOpenLists();
  const rawHtml = htmlParts.join('\n');

  // Sanitize via DOMPurify if in DOM environment, otherwise return rawHtml
  if (typeof window !== 'undefined' && DOMPurify && DOMPurify.sanitize) {
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'strong', 'em', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'code', 'br', 'span', 'div'],
      ALLOWED_ATTR: ['class', 'style']
    });
  }

  return rawHtml;
}
