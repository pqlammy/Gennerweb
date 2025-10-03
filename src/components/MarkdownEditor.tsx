import React, { useId, useMemo, useRef } from 'react';
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Quote, Underline, Heading3 } from 'lucide-react';
import { renderMarkdownDocument, renderMarkdownList } from '../lib/markdown';

type MarkdownEditorProps = {
  label?: string;
  description?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  mode?: 'document' | 'list';
};

export function MarkdownEditor({
  label,
  description,
  value,
  onChange,
  placeholder,
  rows = 6,
  mode = 'document'
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const generatedId = useId();
  const fieldId = `markdown-${generatedId}`;

  const previewHtml = useMemo(() => {
    if (!value || value.trim().length === 0) {
      return '';
    }

    return mode === 'list' ? renderMarkdownList(value) : renderMarkdownDocument(value);
  }, [mode, value]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  const surroundSelection = (before: string, after = before, placeholder = 'Text') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const selected = value.slice(start, end) || placeholder;
    const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;

    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + before.length;
      const selectionEnd = selectionStart + selected.length;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });

    onChange(nextValue);
  };

  const prependCurrentLine = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart ?? 0;
    const before = value.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const alreadyHasPrefix = value.slice(lineStart).startsWith(prefix);
    const effectivePrefix = alreadyHasPrefix ? '' : prefix;
    const nextValue = `${value.slice(0, lineStart)}${effectivePrefix}${value.slice(lineStart)}`;

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + effectivePrefix.length;
      textarea.setSelectionRange(cursor, cursor);
    });

    onChange(nextValue);
  };

  const handleBold = () => surroundSelection('**', '**');
  const handleItalic = () => surroundSelection('*', '*');
  const handleUnderline = () => surroundSelection('__', '__');
  const handleHeading = () => prependCurrentLine('### ');
  const handleLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const selected = value.slice(start, end) || 'Linktext';
    const urlPlaceholder = 'https://';
    const nextValue = `${value.slice(0, start)}[${selected}](${urlPlaceholder})${value.slice(end)}`;

    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + selected.length + 3; // [ + text + ](
      const selectionEnd = selectionStart + urlPlaceholder.length;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });

    onChange(nextValue);
  };
  const handleBullet = () => prependCurrentLine('- ');
  const handleNumbered = () => prependCurrentLine('1. ');
  const handleQuote = () => prependCurrentLine('> ');

  return (
    <div className="space-y-3">
      {(label || description) && (
        <div className="space-y-1">
          {label && <label htmlFor={fieldId} className="text-sm font-medium text-white">{label}</label>}
          {description && <p className="text-xs text-gray-400">{description}</p>}
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-black/40">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-gray-300">
          <button type="button" onClick={handleBold} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <Bold className="h-3.5 w-3.5" /> Fett
          </button>
          <button type="button" onClick={handleItalic} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <Italic className="h-3.5 w-3.5" /> Kursiv
          </button>
          <button type="button" onClick={handleUnderline} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <Underline className="h-3.5 w-3.5" /> Unterstr.
          </button>
          <button type="button" onClick={handleLink} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <LinkIcon className="h-3.5 w-3.5" /> Link
          </button>
          <button type="button" onClick={handleHeading} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <Heading3 className="h-3.5 w-3.5" /> Titel
          </button>
          <button type="button" onClick={handleBullet} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <List className="h-3.5 w-3.5" /> Liste
          </button>
          <button type="button" onClick={handleNumbered} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <ListOrdered className="h-3.5 w-3.5" /> Nummern
          </button>
          <button type="button" onClick={handleQuote} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
            <Quote className="h-3.5 w-3.5" /> Zitat
          </button>
        </div>
        <textarea
          id={fieldId}
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          rows={rows}
          className="block w-full resize-y bg-transparent px-4 py-3 text-sm text-white outline-none"
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-gray-400">Live-Vorschau</p>
        {previewHtml ? (
          <div className="space-y-3 text-sm text-gray-200" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : (
          <p className="text-xs text-gray-500">Noch kein Inhalt vorhanden.</p>
        )}
      </div>
    </div>
  );
}
