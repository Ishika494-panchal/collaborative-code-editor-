const express = require('express');

const app = express();
const PORT = process.env.EXECUTION_PORT || 3003;

app.use(express.json());

// Map frontend languages to Piston API language names and versions
const STATIC_LANGUAGE_MAP = {
  javascript: { language: 'javascript', version: '*' },
  typescript: { language: 'typescript', version: '*' },
  python:     { language: 'python',     version: '*' },
  java:       { language: 'java',       version: '*' },
  c:          { language: 'c',          version: '*' },
  cpp:        { language: 'c++',        version: '*' },
  go:         { language: 'go',         version: '*' },
  rust:       { language: 'rust',       version: '*' },
  ruby:       { language: 'ruby',       version: '*' },
  php:        { language: 'php',        version: '*' },
  csharp:     { language: 'csharp.net', version: '*' },
  swift:      { language: 'swift',      version: '*' },
  shell:      { language: 'bash',       version: '*' },
};

let LANGUAGE_MAP = {};

// Fetch Piston runtimes dynamically to get exact version strings
async function initPistonRuntimes() {
  try {
    const response = await fetch('https://emkc.org/api/v2/piston/runtimes');
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const runtimes = await response.json();
    
    const map = {};
    for (const key of Object.keys(STATIC_LANGUAGE_MAP)) {
      const targetLang = STATIC_LANGUAGE_MAP[key].language;
      // Find the best match in runtimes
      const match = runtimes.find(r => r.language === targetLang || (r.aliases && r.aliases.includes(targetLang)));
      if (match) {
        map[key] = { language: match.language, version: match.version };
      } else {
        // Fallback to static config format
        map[key] = { language: targetLang, version: '*' };
      }
    }
    LANGUAGE_MAP = map;
    console.log('✅ Loaded dynamic Piston language maps');
  } catch (err) {
    console.warn('⚠️ Failed to fetch dynamic Piston runtimes, falling back to hardcoded versions:', err.message);
    // Hardcoded known-good fallback list
    LANGUAGE_MAP = {
      javascript: { language: 'javascript', version: '18.15.0' },
      typescript: { language: 'typescript', version: '5.0.3' },
      python:     { language: 'python',     version: '3.10.0' },
      java:       { language: 'java',       version: '15.0.2' },
      c:          { language: 'c',          version: '10.2.0' },
      cpp:        { language: 'c++',        version: '10.2.0' },
      go:         { language: 'go',         version: '1.16.2' },
      rust:       { language: 'rust',       version: '1.68.2' },
      ruby:       { language: 'ruby',       version: '3.0.1' },
      php:        { language: 'php',        version: '8.2.3' },
      csharp:     { language: 'csharp.net', version: '5.0.201' },
      swift:      { language: 'swift',      version: '5.3.3' },
      shell:      { language: 'bash',       version: '5.2.0' },
    };
  }
}

initPistonRuntimes();

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

async function executeLocally(language, code) {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const fileId = uuidv4();
  let fileName = '';
  let command = '';

  switch (language) {
    case 'javascript':
      fileName = `${fileId}.js`;
      command = `node "${path.join(tempDir, fileName)}"`;
      break;
    case 'python':
      fileName = `${fileId}.py`;
      // Try python first. We will handle fallback if not found
      command = `python "${path.join(tempDir, fileName)}"`;
      break;
    case 'typescript':
      fileName = `${fileId}.ts`;
      command = `npx ts-node "${path.join(tempDir, fileName)}"`;
      break;
    case 'shell':
      fileName = `${fileId}.sh`;
      command = `bash "${path.join(tempDir, fileName)}"`;
      break;
    default:
      throw new Error('local_not_supported');
  }

  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, code);

  return new Promise((resolve, reject) => {
    exec(command, { timeout: 6000 }, (error, stdout, stderr) => {
      // Clean up temp file
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}

      if (error) {
        if (error.killed) {
          return resolve('[Error] Local execution timed out (6s limit).');
        }
        // Check for common 'command not found' errors to trigger Piston fallback
        const errMsg = (stderr || error.message).toLowerCase();
        if (
          errMsg.includes('not recognized') || 
          errMsg.includes('not found') || 
          errMsg.includes('no such file') ||
          error.code === 127
        ) {
          if (language === 'python') {
            // Try fallback to python3 before giving up on local run
            const fallbackPath = path.join(tempDir, fileName);
            fs.writeFileSync(fallbackPath, code);
            exec(`python3 "${fallbackPath}"`, { timeout: 6000 }, (py3Err, py3Out, py3Stderr) => {
              try { fs.unlinkSync(fallbackPath); } catch(e) {}
              if (py3Err) {
                const py3ErrMsg = (py3Stderr || py3Err.message).toLowerCase();
                if (py3ErrMsg.includes('not recognized') || py3ErrMsg.includes('not found') || py3Err.code === 127) {
                  return reject(new Error('runtime_not_installed'));
                }
                return resolve((py3Out + py3Stderr).trim());
              }
              return resolve(py3Out.trim());
            });
            return;
          }
          return reject(new Error('runtime_not_installed'));
        }
      }

      const output = (stdout + stderr).trim();
      resolve(output || 'Execution finished with no output.');
    });
  });
}

app.post('/', async (req, res) => {
  const { language, code } = req.body;

  const nonExecutable = ['html', 'css', 'sql', 'yaml', 'json', 'xml', 'markdown'];
  if (nonExecutable.includes(language)) {
    return res.json({ output: `[Info] ${language.toUpperCase()} is a markup/data language.\nIt provides syntax highlighting only in this editor and cannot be "executed" in a terminal.` });
  }

  // 1. Try local execution first for supported scripting languages
  try {
    const localOutput = await executeLocally(language, code);
    return res.json({ output: localOutput });
  } catch (localErr) {
    if (localErr.message !== 'local_not_supported' && localErr.message !== 'runtime_not_installed') {
      console.error('Local Execution Error:', localErr);
    }
    // If local execution is not supported or runtime isn't installed, fall back to Piston
  }

  // 2. Fall back to Piston API
  const pistonLang = LANGUAGE_MAP[language];
  if (!pistonLang) {
    return res.status(400).json({ error: `Language "${language}" is not supported for execution.` });
  }

  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: pistonLang.language,
        version: pistonLang.version,
        files: [
          { content: code }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Piston API returned ${response.status}`);
    }

    const data = await response.json();
    
    let output = '';
    if (data.compile && data.compile.code !== 0) {
      output = data.compile.output;
    } else if (data.run) {
      output = data.run.output;
    }

    res.json({ output: output.trim() || 'Execution finished with no output.' });

  } catch (error) {
    console.error('Execution API Error:', error);
    res.status(500).json({ error: `Failed to execute code.\n[Local Fallback]: Please install the '${language}' runtime on your local machine to run it locally, or host your own Piston service.` });
  }
});

app.listen(PORT, () => {
  console.log(`Execution Service running on port ${PORT}`);
});
