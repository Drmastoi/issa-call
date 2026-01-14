/**
 * Enhanced RTF Parser for Medical Documents
 * Handles complex formatting, tables, special characters, and nested groups
 */

interface RTFToken {
  type: 'control' | 'text' | 'group-start' | 'group-end' | 'hex' | 'unicode';
  value: string;
  param?: number;
}

// Windows-1252 codepage for common RTF special characters
const WINDOWS_1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ',
  // Common medical symbols
  0xB0: '°', 0xB1: '±', 0xB2: '²', 0xB3: '³', 0xB5: 'µ', 0xB7: '·',
  0xBC: '¼', 0xBD: '½', 0xBE: '¾', 0xD7: '×', 0xF7: '÷',
  // Extended characters
  0xA0: ' ', 0xA3: '£', 0xA9: '©', 0xAE: '®', 0xA7: '§',
};

// Control words that produce specific output
const CONTROL_WORD_MAP: Record<string, string> = {
  'par': '\n',
  'line': '\n',
  'tab': '\t',
  'cell': '\t',  // Table cells become tabs
  'row': '\n',   // Table rows become newlines
  'page': '\n\n---\n\n',
  'sect': '\n\n',
  'emdash': '—',
  'endash': '–',
  'emspace': ' ',
  'enspace': ' ',
  'qmspace': ' ',
  'bullet': '•',
  'lquote': '‘',
  'rquote': '’',
  'ldblquote': '“',
  'rdblquote': '”',
  '~': ' ',  // Non-breaking space
  '-': '‑',  // Non-breaking hyphen
  '_': '‑',  // Non-breaking hyphen alternative
  'softline': '\n',
  'softcol': ' ',
  'softpage': '\n',
};

// Groups to ignore (don't extract text from these)
const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'title', 'author', 'operator',
  'company', 'category', 'keywords', 'comment', 'doccomm', 'hlinkbase',
  'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
  'pict', 'object', 'objdata', 'blipuid', 'datafield', 'fldinst',
  'xmlnstbl', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl',
  'generator', 'creatim', 'revtim', 'printim', 'buptim', 'nofcharsws',
  'themedata', 'colorschememapping', 'latentstyles', 'datastore',
  'shp', 'shpinst', 'shppict', 'shprslt', 'xe', 'tc', 'bkmkstart', 'bkmkend',
  'field', 'fldrslt', 'formfield', 'mmathPr', 'pgdsctbl',
]);

function tokenize(rtf: string): RTFToken[] {
  const tokens: RTFToken[] = [];
  let i = 0;

  while (i < rtf.length) {
    const char = rtf[i];

    if (char === '{') {
      tokens.push({ type: 'group-start', value: '{' });
      i++;
    } else if (char === '}') {
      tokens.push({ type: 'group-end', value: '}' });
      i++;
    } else if (char === '\\') {
      i++;
      if (i >= rtf.length) break;

      const nextChar = rtf[i];

      // Unicode character \uN
      if (nextChar === 'u' && /\d|-/.test(rtf[i + 1] || '')) {
        i++;
        let numStr = '';
        if (rtf[i] === '-') {
          numStr += '-';
          i++;
        }
        while (i < rtf.length && /\d/.test(rtf[i])) {
          numStr += rtf[i];
          i++;
        }
        const codePoint = parseInt(numStr, 10);
        // Handle negative unicode (convert to unsigned)
        const actualCodePoint = codePoint < 0 ? codePoint + 65536 : codePoint;
        tokens.push({ type: 'unicode', value: String.fromCodePoint(actualCodePoint), param: actualCodePoint });
        
        // Skip the replacement character (usually ?)
        if (rtf[i] === '?') i++;
        continue;
      }

      // Hex character \'XX
      if (nextChar === "'") {
        i++;
        const hexCode = rtf.substring(i, i + 2);
        i += 2;
        const charCode = parseInt(hexCode, 16);
        if (!isNaN(charCode)) {
          const mappedChar = WINDOWS_1252[charCode] || String.fromCharCode(charCode);
          tokens.push({ type: 'hex', value: mappedChar, param: charCode });
        }
        continue;
      }

      // Special escaped characters
      if (nextChar === '\\' || nextChar === '{' || nextChar === '}') {
        tokens.push({ type: 'text', value: nextChar });
        i++;
        continue;
      }

      // Line break sequences
      if (nextChar === '\n' || nextChar === '\r') {
        i++;
        if (rtf[i] === '\n') i++;
        tokens.push({ type: 'control', value: 'par' });
        continue;
      }

      // Control word
      if (/[a-zA-Z]/.test(nextChar)) {
        let word = '';
        while (i < rtf.length && /[a-zA-Z]/.test(rtf[i])) {
          word += rtf[i];
          i++;
        }
        
        // Optional numeric parameter
        let param: number | undefined;
        if (i < rtf.length && (/\d/.test(rtf[i]) || rtf[i] === '-')) {
          let numStr = '';
          if (rtf[i] === '-') {
            numStr += '-';
            i++;
          }
          while (i < rtf.length && /\d/.test(rtf[i])) {
            numStr += rtf[i];
            i++;
          }
          param = parseInt(numStr, 10);
        }
        
        // Consume optional space delimiter
        if (rtf[i] === ' ') i++;
        
        tokens.push({ type: 'control', value: word, param });
        continue;
      }

      // Other escaped characters (symbols like \- \_ \~)
      tokens.push({ type: 'control', value: nextChar });
      i++;
    } else if (char === '\r' || char === '\n') {
      // Skip standalone line breaks (only \par matters)
      i++;
    } else {
      // Regular text - collect continuous text
      let text = '';
      while (i < rtf.length && !/[{}\\]/.test(rtf[i]) && rtf[i] !== '\r' && rtf[i] !== '\n') {
        text += rtf[i];
        i++;
      }
      if (text) {
        tokens.push({ type: 'text', value: text });
      }
    }
  }

  return tokens;
}

function parseTokens(tokens: RTFToken[]): string {
  const output: string[] = [];
  const groupStack: { skip: boolean; destination?: string }[] = [];
  let skipDepth = 0;
  let isDestination = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'group-start') {
      groupStack.push({ skip: skipDepth > 0 });
      if (skipDepth > 0) skipDepth++;
      isDestination = false;
    } else if (token.type === 'group-end') {
      if (skipDepth > 0) skipDepth--;
      groupStack.pop();
      isDestination = false;
    } else if (skipDepth > 0) {
      // Skip content in ignored groups
      continue;
    } else if (token.type === 'control') {
      const word = token.value;

      // Check for destination marker
      if (word === '*') {
        isDestination = true;
        continue;
      }

      // Check if this is a destination to skip
      if (isDestination || SKIP_DESTINATIONS.has(word)) {
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].skip = true;
          groupStack[groupStack.length - 1].destination = word;
          skipDepth = 1;
        }
        isDestination = false;
        continue;
      }

      isDestination = false;

      // Handle known control words
      if (CONTROL_WORD_MAP[word]) {
        output.push(CONTROL_WORD_MAP[word]);
      }
    } else if (token.type === 'text' || token.type === 'hex' || token.type === 'unicode') {
      output.push(token.value);
    }
  }

  return output.join('');
}

function cleanupOutput(text: string): string {
  return text
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive blank lines (keep max 2)
    .replace(/\n{4,}/g, '\n\n\n')
    // Clean up tab-heavy table remnants
    .replace(/\t{3,}/g, '\t\t')
    // Normalize multiple spaces
    .replace(/ {3,}/g, '  ')
    // Clean up spacing around newlines
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    // Trim
    .trim();
}

/**
 * Parse RTF content to plain text
 * Handles complex formatting, tables, and special characters
 */
export function parseRTF(rtfContent: string): string {
  // Quick check if this is actually RTF
  if (!rtfContent.trim().startsWith('{\\rtf')) {
    // Not RTF, return as-is (might be plain text)
    return rtfContent;
  }

  try {
    const tokens = tokenize(rtfContent);
    const rawText = parseTokens(tokens);
    return cleanupOutput(rawText);
  } catch (error) {
    console.error('RTF parsing error:', error);
    // Fallback: aggressive regex-based cleanup
    return fallbackParse(rtfContent);
  }
}

function fallbackParse(rtf: string): string {
  return rtf
    // Remove RTF header
    .replace(/^\{\\rtf1[^}]*/, '')
    // Handle unicode
    .replace(/\\u(\d+)\?/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    // Handle hex characters
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return WINDOWS_1252[code] || String.fromCharCode(code);
    })
    // Handle common control words
    .replace(/\\par\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\cell\b/g, '\t')
    .replace(/\\row\b/g, '\n')
    // Remove remaining control words
    .replace(/\\[a-z]+\d*\s?/gi, '')
    // Remove nested groups (simplified)
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\{[^{}]*\}/g, '')
    // Remove braces
    .replace(/[{}]/g, '')
    // Cleanup
    .replace(/\s+/g, ' ')
    .trim();
}

export default parseRTF;
