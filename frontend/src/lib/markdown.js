import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

marked.setOptions({ breaks: true });

// Configure DOMPurify to allow MathML tags and KaTeX classes/attributes
const PURIFY_CONFIG = {
  ADD_TAGS: [
    'math',
    'semantics',
    'mrow',
    'mn',
    'mo',
    'mi',
    'mspace',
    'annotation',
    'annotation-xml',
    'msup',
    'msub',
    'msubsup',
    'mfrac',
    'mroot',
    'msqrt',
    'mtable',
    'mtr',
    'mtd',
    'munder',
    'mover',
    'munderover',
  ],
  ADD_ATTR: ['aria-hidden', 'style', 'mathvariant', 'xmlns', 'encoding'],
};

/**
 * Render LaTeX math expressions ($...$ for inline, $$...$$ for display)
 * inside a raw string using KaTeX.
 */
function processMath(text) {
  if (!text) return '';
  // 1. Display math $$...$$
  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return match;
    }
  });

  // 2. Inline math $...$
  out = out.replace(/\$([^\$\n\r]+?)\$/g, (match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return match;
    }
  });

  return out;
}

/**
 * Full markdown + LaTeX renderer with sanitized output.
 * Renders bold, lists, code fences, images, paragraphs, and formulas.
 */
export function renderMarkdownWithMath(content) {
  if (!content) return { __html: '' };
  const withMath = processMath(String(content));
  const rawHtml = marked.parse(withMath);
  return { __html: DOMPurify.sanitize(rawHtml, PURIFY_CONFIG) };
}

/**
 * Specialized renderer for problem constraints lines.
 * Handles both LaTeX math ($1 \le n, m \le 2 \cdot 10^5$) and plain
 * CP constraint strings (1 <= n, m <= 2*10^5, 0 <= k <= 10^9, 1 <= ai, bi <= 10^9),
 * converting them into crisp mathematical typesetting.
 */
export function renderConstraint(raw) {
  if (!raw) return { __html: '' };
  let str = String(raw).trim().replace(/^[\s•\-\*\u2022\u25E6\u2043]+\s*/, '');

  if (str.includes('$')) {
    const html = str.replace(/\$([^\$]+)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { throwOnError: false, displayMode: false });
      } catch {
        return math;
      }
    });
    return { __html: DOMPurify.sanitize(html, PURIFY_CONFIG) };
  }

  // Check if string contains mathematical comparison or exponent notation
  const hasMath = /(?:<=|>=|!=|\^|\*|\\le|\\ge|<|>|=)/.test(str);
  if (hasMath) {
    let latex = str
      .replace(/<=/g, ' \\le ')
      .replace(/>=/g, ' \\ge ')
      .replace(/!=/g, ' \\ne ')
      .replace(/\s*[\*·]\s*10\^/g, ' \\cdot 10^')
      .replace(/10\^([0-9]+)/g, '10^{$1}')
      .replace(/\b([a-zA-Z])([ijkmn])\b/g, '$1_$2');
    try {
      const html = katex.renderToString(latex.trim(), { throwOnError: false, displayMode: false });
      return { __html: DOMPurify.sanitize(html, PURIFY_CONFIG) };
    } catch {
      // Fallback to text
    }
  }

  return { __html: DOMPurify.sanitize(str, PURIFY_CONFIG) };
}
