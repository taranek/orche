import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { php } from '@codemirror/lang-php';
import { sass } from '@codemirror/lang-sass';
import { go } from '@codemirror/lang-go';

export function getLanguageExtension(filePath?: string): Extension {
  if (!filePath) return [];
  const ext = filePath.split('.').pop()?.toLowerCase();
  const name = filePath.split('/').pop()?.toLowerCase() ?? '';

  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return [];
  if (name === 'makefile' || name === 'gnumakefile') return [];

  switch (ext) {
    case 'ts':
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return javascript({ jsx: true });
    case 'json':
      return json();
    case 'css':
      return css();
    case 'scss':
    case 'less':
      return sass();
    case 'html':
    case 'htm':
      return html();
    case 'xml':
    case 'svg':
      return xml();
    case 'md':
    case 'mdx':
      return markdown();
    case 'py':
      return python();
    case 'rs':
      return rust();
    case 'java':
    case 'kt':
      return java();
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'cs':
      return cpp();
    case 'go':
      return go();
    case 'sql':
      return sql();
    case 'yaml':
    case 'yml':
      return yaml();
    case 'php':
      return php();
    default:
      return [];
  }
}
