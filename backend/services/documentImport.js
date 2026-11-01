const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(buffer, mimetype, filename) {
  const isPdf = mimetype === 'application/pdf' || /\.pdf$/i.test(filename || '');
  const isDocx =
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(filename || '');

  if (isPdf) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result.text || '').replace(/^\s*--\s*\d+\s*of\s*\d+\s*--\s*$/gm, '');
    } finally {
      await parser.destroy();
    }
  }
  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  throw new Error('Unsupported file type — upload a .pdf or .docx file');
}

// ── Quiz question extraction ────────────────────────────────────────────
function parseQuizQuestions(text) {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // Question start: Q1., 1., 1), Question 1:, [1], (1), etc.
  const qStart = /^(?:Q(?:uestion)?\s*#?|\(?\[?)(\d+)[\].):]\s*(.*)$/i;
  // Answer line: Answer: B, Ans: B, Ans - B, Key: B, Correct Answer: (B), Option B, etc.
  const answerLine = /^(?:Correct\s*)?(?:Answer|Ans|Key|Option)\s*[:\-–—\s]+\(?([A-D])\)?/i;

  const blocks = [];
  let current = null;

  for (const line of rawLines) {
    const qMatch = line.match(qStart);
    const ansMatch = line.match(answerLine);

    // Check if line contains one or more options: A) ... B) ... or A. ... B. ...
    // Regex matches e.g. "A) ...", "(A) ...", "A. ..."
    const multiOptMatch = line.match(/(?:^|\s+)(?:\(?([A-D])\)?|[\[(]([A-D])[\])])[.):\s]\s*(.*?)(?=(?:\s+(?:\(?([A-D])\)?|[\[(]([A-D])[\])])[.):\s])|$)/gi);

    if (qMatch && !line.match(/^[A-D][.):]/i)) {
      if (current) blocks.push(current);
      current = { text: qMatch[2].trim(), options: {}, correctOption: null, raw: [line] };
      continue;
    }
    if (!current) continue;

    current.raw.push(line);

    if (ansMatch) {
      current.correctOption = ansMatch[1].toLowerCase();
    } else {
      // Check for inline / multiple options: e.g. "A) 10  B) 20  C) 30  D) 40"
      // or single option per line "A) 10"
      const optRegex = /(?:^|\s+)(?:([A-D])[.):]|\(?([A-D])\)[.):]?|\[([A-D])\])\s*(.*?)(?=(?:\s+(?:[A-D][.):]|\(?[A-D]\)[.):]?|\[[A-D]\])\s*)|$)/gi;
      let match;
      let matchedAnyOpt = false;
      while ((match = optRegex.exec(line)) !== null) {
        const letter = (match[1] || match[2] || match[3] || '').toLowerCase();
        const optText = (match[4] || '').trim();
        if (letter && ['a', 'b', 'c', 'd'].includes(letter)) {
          current.options[letter] = optText;
          matchedAnyOpt = true;
        }
      }

      if (!matchedAnyOpt && Object.keys(current.options).length === 0) {
        // Still part of multiline question text
        current.text += ' ' + line;
      }
    }
  }
  if (current) blocks.push(current);

  const questions = [];
  const warnings = [];

  blocks.forEach((b, i) => {
    const optCount = Object.keys(b.options).length;
    const complete = b.text && optCount === 4 && b.correctOption && b.options[b.correctOption];
    questions.push({
      text: b.text,
      optionA: b.options.a || '',
      optionB: b.options.b || '',
      optionC: b.options.c || '',
      optionD: b.options.d || '',
      correctOption: b.correctOption || 'a',
      points: 10,
      needsReview: !complete,
    });
    if (!complete) {
      warnings.push(
        `Question ${i + 1} looks incomplete (${optCount}/4 options${b.correctOption ? '' : ', no answer'} detected) — check it before saving.`
      );
    }
  });

  return { questions, warnings };
}

// ── Problem section extraction ──────────────────────────────────────────
const GLOBAL_HEADINGS = {
  input: /^(?:#{1,6}\s*)?(?:(?:\d+\.)?\s*)?(?:input(?:\s*description)?|input\s*format)\s*[:\-]?\s*(.*)$/i,
  output: /^(?:#{1,6}\s*)?(?:(?:\d+\.)?\s*)?(?:output(?:\s*description)?|output\s*format)\s*[:\-]?\s*(.*)$/i,
  constraints: /^(?:#{1,6}\s*)?(?:(?:\d+\.)?\s*)?(?:constraints?|subtasks?|limits?)\s*[:\-]?\s*(.*)$/i,
  example: /^(?:#{1,6}\s*)?(?:(?:example|sample)(?:\s*(?:testcase|case|input|output)?)?\s*#?(\d+)?)\s*[:\-]?\s*(.*)$/i,
  editorial: /^(?:#{1,6}\s*)?(?:editorial|explanation|solution|approach)\s*[:\-]?\s*(.*)$/i,
};

function parseProblemDocument(text) {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  const lines = [];
  let lastBlank = false;
  for (const l of rawLines) {
    if (!l) {
      if (!lastBlank) lines.push('');
      lastBlank = true;
    } else {
      lines.push(l);
      lastBlank = false;
    }
  }

  // Find title (first non-empty line)
  const title = lines.find((l) => l.length > 0) || '';
  const startIdx = lines.indexOf(title) + 1;

  let section = 'statement';
  const buckets = { statement: [], input: [], output: [], constraints: [], editorial: [] };
  const examples = [];
  let currentExample = null;
  let exampleField = null; // 'input' | 'output' | 'explanation'

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      // blank line: if in an example, end the current example field if appropriate
      continue;
    }

    // Check if we are inside an example block
    if (section === 'example') {
      // Check if a new example starts (e.g. "Example 2", "Sample 2")
      const newExMatch = line.match(GLOBAL_HEADINGS.example);
      if (newExMatch) {
        if (currentExample) examples.push(currentExample);
        currentExample = { input: '', output: '', explanation: '' };
        exampleField = null;
        continue;
      }

      // Check if a global section heading arrives (Constraints, Editorial)
      const isConstraints = line.match(GLOBAL_HEADINGS.constraints);
      const isEditorial = line.match(GLOBAL_HEADINGS.editorial);
      if (isConstraints) {
        if (currentExample) examples.push(currentExample);
        currentExample = null;
        section = 'constraints';
        if (isConstraints[1]) buckets.constraints.push(cleanConstraintLine(isConstraints[1]));
        continue;
      }
      if (isEditorial) {
        if (currentExample) examples.push(currentExample);
        currentExample = null;
        section = 'editorial';
        if (isEditorial[1]) buckets.editorial.push(isEditorial[1]);
        continue;
      }

      // Within an example, check for Input / Output / Explanation subheadings:
      // Accepts "Input", "Input:", "Sample Input:", "Input -", etc.
      const exInputMatch = line.match(/^(?:sample\s*)?input(?:\s*#?\d*)?\s*[:\-]?\s*(.*)$/i);
      const exOutputMatch = line.match(/^(?:sample\s*)?output(?:\s*#?\d*)?\s*[:\-]?\s*(.*)$/i);
      const exExplMatch = line.match(/^(?:explanation|notes?)\s*[:\-]?\s*(.*)$/i);

      if (exInputMatch) {
        exampleField = 'input';
        if (exInputMatch[1]) currentExample.input = exInputMatch[1];
        continue;
      }
      if (exOutputMatch) {
        exampleField = 'output';
        if (exOutputMatch[1]) currentExample.output = exOutputMatch[1];
        continue;
      }
      if (exExplMatch) {
        exampleField = 'explanation';
        if (exExplMatch[1]) currentExample.explanation = exExplMatch[1];
        continue;
      }

      if (exampleField && currentExample) {
        currentExample[exampleField] += (currentExample[exampleField] ? '\n' : '') + line;
        continue;
      }
    }

    // Global section switches outside example
    const exMatch = line.match(GLOBAL_HEADINGS.example);
    if (exMatch) {
      if (currentExample) examples.push(currentExample);
      currentExample = { input: '', output: '', explanation: '' };
      section = 'example';
      exampleField = null;
      continue;
    }

    const inMatch = line.match(GLOBAL_HEADINGS.input);
    if (inMatch) {
      section = 'input';
      if (inMatch[1]) buckets.input.push(inMatch[1]);
      continue;
    }

    const outMatch = line.match(GLOBAL_HEADINGS.output);
    if (outMatch) {
      section = 'output';
      if (outMatch[1]) buckets.output.push(outMatch[1]);
      continue;
    }

    const conMatch = line.match(GLOBAL_HEADINGS.constraints);
    if (conMatch) {
      section = 'constraints';
      if (conMatch[1]) buckets.constraints.push(cleanConstraintLine(conMatch[1]));
      continue;
    }

    const edMatch = line.match(GLOBAL_HEADINGS.editorial);
    if (edMatch) {
      section = 'editorial';
      if (edMatch[1]) buckets.editorial.push(edMatch[1]);
      continue;
    }

    // Normal line in current section
    if (section === 'constraints') {
      buckets.constraints.push(cleanConstraintLine(line));
    } else {
      buckets[section].push(line);
    }
  }

  if (currentExample) examples.push(currentExample);

  const join = (arr) => arr.join('\n').trim();

  return {
    title: title.trim(),
    statement: join(buckets.statement),
    inputDesc: join(buckets.input),
    outputDesc: join(buckets.output),
    constraints: join(buckets.constraints),
    editorial: join(buckets.editorial),
    samples: examples.length ? examples : [{ input: '', output: '', explanation: '' }],
    needsReview: !title || !join(buckets.statement),
  };
}

function cleanConstraintLine(line) {
  return line.replace(/^[\s•\-\*\u2022\u25E6\u2043]+\s*/, '').trim();
}

module.exports = { extractText, parseQuizQuestions, parseProblemDocument };
