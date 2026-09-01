const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove BUILT_IN_GEMINI_KEY
content = content.replace(/const BUILT_IN_GEMINI_KEY = import\.meta\.env\.VITE_GEMINI_KEY \|\| "";\n*/, '');

// 2. Remove geminiApiKey from Data
content = content.replace(/  geminiApiKey\?: string;\n/, '');

// 3. Remove AI Settings block
content = content.replace(/        <div>\n          <h2>🤖 AI Settings<\/h2>[\s\S]*?<\/div>\n        <hr \/>\n/, '');

// 4. Update handleFileUpload
content = content.replace(
/    if \(!import\.meta\.env\.VITE_GEMINI_KEY && !\(data\.geminiApiKey \|\| BUILT_IN_GEMINI_KEY\)\) \{\n      alert\("Please add your Gemini API key in Settings first!"\);\n      return;\n    \}/,
''
);

content = content.replace(
/      const response = await fetch\(\n        `https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.0-flash:generateContent\?key=\$\{import\.meta\.env\.VITE_GEMINI_KEY \|\| \(data\.geminiApiKey \|\| BUILT_IN_GEMINI_KEY\)\}`,\n        \{\n          method: "POST",\n          headers: \{ "Content-Type": "application\/json" \},\n          body: JSON\.stringify\(\{/,
`      const response = await fetch(
        '/api/gemini',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({`
);

// 5. Update handleTextAnalysis
content = content.replace(
/    if \(!import\.meta\.env\.VITE_GEMINI_KEY && !\(data\.geminiApiKey \|\| BUILT_IN_GEMINI_KEY\)\) \{\n      alert\("Please add your Gemini API key in Settings first!"\);\n      return;\n    \}/,
''
);

content = content.replace(
/      const response = await fetch\(\n        `https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.0-flash:generateContent\?key=\$\{import\.meta\.env\.VITE_GEMINI_KEY \|\| \(data\.geminiApiKey \|\| BUILT_IN_GEMINI_KEY\)\}`,\n        \{\n          method: "POST",\n          headers: \{ "Content-Type": "application\/json" \},\n          body: JSON\.stringify\(\{/,
`      const response = await fetch(
        '/api/gemini',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({`
);

// 6. Remove missing key warning in UI
content = content.replace(
/        \{\!\(import\.meta\.env\.VITE_GEMINI_KEY \|\| \(data\.geminiApiKey \|\| BUILT_IN_GEMINI_KEY\)\)\) && \(\n          <div style=\{\{ background: 'var\(--pale\)', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 13 \}\}>\n            ⚠️ Add your free Gemini API key in <strong>Settings → AI Settings<\/strong> first\.\n          <\/div>\n        \)\}\n\n/,
''
);

// 7. Remove disabled checks
content = content.replace(/disabled=\{aiLoading \|\| !\(import\.meta\.env\.VITE_GEMINI_KEY \|\| \(data\.geminiApiKey \|\| BUILT_IN_GEMINI_KEY\)\)\}/, 'disabled={aiLoading}');
content = content.replace(/disabled=\{aiLoading \|\| !\(import\.meta\.env\.VITE_GEMINI_KEY \|\| \(data\.geminiApiKey \|\| BUILT_IN_GEMINI_KEY\)\) \|\| !syllabusText\.trim\(\)\}/, 'disabled={aiLoading || !syllabusText.trim()}');

fs.writeFileSync(file, content);
console.log('App.tsx patched successfully.');
