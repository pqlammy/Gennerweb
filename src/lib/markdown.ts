const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const applyInlineFormatting = (value: string): string => {
  if (!value) {
    return '';
  }

  let transformed = escapeHtml(value);

  // Links
  transformed = transformed.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--accent-color)] underline">$1</a>');

  // Bold
  transformed = transformed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  transformed = transformed.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic (after bold to avoid conflicts)
  transformed = transformed.replace(/\*(?!\*)([^*]+)\*/g, '<em>$1</em>');
  transformed = transformed.replace(/_(?!_)([^_]+)_/g, '<em>$1</em>');

  // Strikethrough
  transformed = transformed.replace(/~~([^~]+)~~/g, '<span class="line-through">$1</span>');

  // Inline code
  transformed = transformed.replace(/`([^`]+)`/g, '<code class="rounded bg-black/50 px-1 py-0.5 text-xs font-mono text-[var(--accent-color)]">$1</code>');

  return transformed;
};

const closeOpenStructures = (html: string[], state: { list: 'ul' | 'ol' | null; paragraph: string[] }) => {
  if (state.paragraph.length > 0) {
    const content = state.paragraph.join(' ').trim();
    if (content) {
      html.push(`<p class="leading-relaxed">${applyInlineFormatting(content)}</p>`);
    }
    state.paragraph = [];
  }

  if (state.list) {
    html.push(`</${state.list}>`);
    state.list = null;
  }
};

const HEADING_CLASSES: Record<number, string> = {
  1: 'text-3xl font-bold tracking-tight mt-6 mb-3 text-white',
  2: 'text-2xl font-semibold tracking-tight mt-5 mb-2 text-white',
  3: 'text-xl font-semibold mt-4 mb-2 text-white',
  4: 'text-lg font-semibold mt-3 mb-2 text-white'
};

export const renderMarkdownDocument = (markdown: string): string => {
  if (!markdown || markdown.trim().length === 0) {
    return '';
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  const state = {
    list: null as 'ul' | 'ol' | null,
    paragraph: [] as string[]
  };

  const openList = (type: 'ul' | 'ol') => {
    if (state.list !== type) {
      if (state.list) {
        html.push(`</${state.list}>`);
      }
      state.list = type;
      const baseClasses = type === 'ul' ? 'list-disc' : 'list-decimal';
      html.push(`<${type} class="${baseClasses} list-inside space-y-1 pl-5 marker:text-[var(--accent-color)]">`);
    }
  };

  const flushParagraph = () => {
    if (state.paragraph.length > 0) {
      const content = state.paragraph.join(' ').trim();
      if (content) {
        html.push(`<p class="leading-relaxed">${applyInlineFormatting(content)}</p>`);
      }
      state.paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, '');
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      if (state.list) {
        html.push(`</${state.list}>`);
        state.list = null;
      }
      continue;
    }

    const headingMatch = /^#{1,4}\s+/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      if (state.list) {
        html.push(`</${state.list}>`);
        state.list = null;
      }
      const level = headingMatch[0].trim().length;
      const content = trimmed.slice(level).trim();
      const clampedLevel = Math.min(level, 4);
      const headingClass = HEADING_CLASSES[clampedLevel] ?? HEADING_CLASSES[4];
      html.push(`<h${clampedLevel} class="${headingClass}">${applyInlineFormatting(content)}</h${clampedLevel}>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      openList('ul');
      html.push(`<li class="text-sm text-gray-200">${applyInlineFormatting(trimmed.replace(/^[-*+]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      openList('ol');
      html.push(`<li class="text-sm text-gray-200">${applyInlineFormatting(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      flushParagraph();
      if (state.list) {
        html.push(`</${state.list}>`);
        state.list = null;
      }
      const content = trimmed.replace(/^>\s+/, '');
      html.push(`<blockquote class="border-l-2 border-[var(--accent-color)]/60 pl-4 text-sm text-gray-300 italic">${applyInlineFormatting(content)}</blockquote>`);
      continue;
    }

    state.paragraph.push(trimmed);
  }

  closeOpenStructures(html, state);

  return html.join('');
};

export const renderMarkdownList = (markdown: string): string => {
  if (!markdown || markdown.trim().length === 0) {
    return '';
  }

  const items = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    return '';
  }

  const listItems = items
    .map((item) => `<li class="text-sm text-gray-200">${applyInlineFormatting(item)}</li>`)
    .join('');

  return `<ul class="list-disc list-inside space-y-1 pl-5 marker:text-[var(--accent-color)]">${listItems}</ul>`;
};

export const renderMarkdownInline = (markdown: string): string => applyInlineFormatting(markdown ?? '');
