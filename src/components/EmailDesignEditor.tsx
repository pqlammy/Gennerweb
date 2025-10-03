import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link,
  Type
} from 'lucide-react';

const DEFAULT_COMMANDS = [
  { icon: Bold, label: 'Fett', command: 'bold' },
  { icon: Italic, label: 'Kursiv', command: 'italic' },
  { icon: Underline, label: 'Unterstrichen', command: 'underline' },
  { icon: Strikethrough, label: 'Durchgestrichen', command: 'strikeThrough' },
  { icon: Type, label: 'Überschrift', command: 'formatBlock', value: 'H2' },
  { icon: Minus, label: 'Absatz', command: 'formatBlock', value: 'P' },
  { icon: List, label: 'Liste', command: 'insertUnorderedList' },
  { icon: ListOrdered, label: 'Nummerierte Liste', command: 'insertOrderedList' },
  { icon: Quote, label: 'Zitat', command: 'formatBlock', value: 'BLOCKQUOTE' },
  { icon: AlignLeft, label: 'Links ausrichten', command: 'justifyLeft' },
  { icon: AlignCenter, label: 'Zentrieren', command: 'justifyCenter' },
  { icon: AlignRight, label: 'Rechts ausrichten', command: 'justifyRight' }
] as const;

type CommandDescriptor = typeof DEFAULT_COMMANDS[number];

type EmailDesignEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  accentColor?: string;
  loginLogo?: string | null;
};

const execCommand = (descriptor: CommandDescriptor) => {
  const { command, value } = descriptor;
  document.execCommand(command, false, value ?? undefined);
};

const applyLink = () => {
  const url = window.prompt('Link URL eingeben:');
  if (!url) {
    return;
  }
  document.execCommand('createLink', false, url.trim());
};

const createInlineSvgDataUrl = (markup: string) => {
  try {
    const encoded = encodeURIComponent(markup)
      .replace(/'/g, '%27')
      .replace(/"/g, '%22');
    return `data:image/svg+xml,${encoded}`;
  } catch (error) {
    console.warn('Failed to encode SVG for email insertion', error);
    return null;
  }
};

const resolveLogoMarkup = (rawLogo?: string | null) => {
  if (!rawLogo) {
    return null;
  }

  const trimmed = rawLogo.trim();
  if (trimmed.startsWith('<svg')) {
    const dataUrl = createInlineSvgDataUrl(trimmed);
    if (dataUrl) {
      return `<img src="${dataUrl}" alt="Logo" style="max-width:200px; height:auto;" />`;
    }
    return null;
  }

  if (trimmed.startsWith('data:image/')) {
    return `<img src="${trimmed}" alt="Logo" style="max-width:200px; height:auto;" />`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return `<img src="${trimmed}" alt="Logo" style="max-width:200px; height:auto;" />`;
  }

  return null;
};

export function EmailDesignEditor({ value, onChange, placeholder, accentColor = '#dc2626', loginLogo }: EmailDesignEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [selectionColor, setSelectionColor] = useState<string>(accentColor);
  const sanitizedValue = useMemo(() => value || '', [value]);
  const logoMarkup = useMemo(() => resolveLogoMarkup(loginLogo), [loginLogo]);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) {
      return;
    }
    if (node.innerHTML !== sanitizedValue) {
      node.innerHTML = sanitizedValue;
    }
  }, [sanitizedValue]);

  const handleInput = () => {
    const html = editorRef.current?.innerHTML ?? '';
    onChange(html);
  };

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const color = event.target.value;
    setSelectionColor(color);
    document.execCommand('foreColor', false, color);
  };

  const handleInsertLogo = () => {
    if (!logoMarkup) {
      window.alert('Kein Logo hinterlegt. Speichere zuerst ein Login-Logo in den Einstellungen.');
      return;
    }
    document.execCommand('insertHTML', false, logoMarkup);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-gray-200">
        {DEFAULT_COMMANDS.map((descriptor) => {
          const Icon = descriptor.icon;
          return (
            <button
              key={descriptor.label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => execCommand(descriptor)}
              className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10"
              aria-label={descriptor.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
        <label className="ml-2 flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
          <span className="hidden text-[10px] uppercase tracking-wide text-gray-400 sm:inline">Farbe</span>
          <input
            type="color"
            value={selectionColor}
            onChange={handleColorChange}
            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyLink}
          className="inline-flex h-8 items-center gap-1 rounded px-2 py-1 hover:bg-white/10"
        >
          <Link className="h-4 w-4" />
          <span className="hidden text-[10px] uppercase tracking-wide text-gray-400 sm:inline">Link</span>
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleInsertLogo}
          className="inline-flex h-8 items-center gap-1 rounded px-2 py-1 hover:bg-white/10"
          disabled={!logoMarkup}
        >
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            Logo
          </span>
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="prose prose-invert min-h-[200px] rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm text-gray-100 shadow-inner focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        style={{ caretColor: accentColor }}
      />
      {(!value || value.trim().length === 0) && (
        <p className="-mt-6 select-none px-4 text-[11px] text-gray-500">{placeholder ?? 'Gib deinen E-Mail-Inhalt ein …'}</p>
      )}
      <p className="text-[11px] text-gray-500">
        Verwende die Buttons für schnelle Formatierungen. Platzhalter wie <code className="bg-black/40 px-1">{'{{firstName}}'}</code> bleiben im Text erhalten und
        werden beim Versand automatisch ersetzt.
      </p>
    </div>
  );
}
