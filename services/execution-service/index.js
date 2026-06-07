const express = require('express');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// Map frontend languages to Piston API language names
const LANGUAGE_MAP = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  csharp: 'csharp',
  swift: 'swift',
  shell: 'bash'
};

app.post('/', async (req, res) => {
  const { language, code } = req.body;

  const nonExecutable = ['html', 'css', 'sql', 'yaml', 'json', 'xml', 'markdown'];
  if (nonExecutable.includes(language)) {
    return res.json({ output: `[Info] ${language.toUpperCase()} is a markup/data language.\nIt provides syntax highlighting only in this editor and cannot be "executed" in a terminal.` });
  }

  const pistonLang = LANGUAGE_MAP[language];
  if (!pistonLang) {
    return res.status(400).json({ error: `Language "${language}" is not supported for execution.` });
  }

  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: pistonLang,
        version: '*', // Use the latest available version
        files: [
          { content: code }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Piston API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Piston returns output in data.run.output (and data.compile.output if compilation failed)
    let output = '';
    if (data.compile && data.compile.code !== 0) {
      output = data.compile.output;
    } else if (data.run) {
      output = data.run.output;
    }

    res.json({ output: output.trim() || 'Execution finished with no output.' });

  } catch (error) {
    console.error('Execution API Error:', error);
    res.status(500).json({ error: 'Failed to execute code via Piston API.' });
  }
});

app.listen(PORT, () => {
  console.log(`Execution Service running on port ${PORT}`);
});
