const fs = require('fs');
const file = '/Users/ayushsingh/Documents/ChatGPT/Daily Tracker/src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update API endpoints to use VITE_GEMINI_KEY
content = content.replace(
  /\`https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.0-flash:generateContent\?key=\$\{data\.geminiApiKey\}\`/g,
  `\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${import.meta.env.VITE_GEMINI_KEY || data.geminiApiKey}\``
);

// Update warnings in ScheduleBuilder
content = content.replace(
  /if \(\!data\.geminiApiKey\) \{/g,
  `if (!import.meta.env.VITE_GEMINI_KEY && !data.geminiApiKey) {`
);

content = content.replace(
  /\{\!data\.geminiApiKey && \(/g,
  `{!(import.meta.env.VITE_GEMINI_KEY || data.geminiApiKey) && (`
);

content = content.replace(
  /disabled=\{aiLoading \|\| \!data\.geminiApiKey/g,
  `disabled={aiLoading || !(import.meta.env.VITE_GEMINI_KEY || data.geminiApiKey)`
);

// Hide API Key field in Settings if env key exists
content = content.replace(
  /<div>\s*<h2>🤖 AI Settings<\/h2>/g,
  `{!import.meta.env.VITE_GEMINI_KEY && (\n        <div>\n          <h2>🤖 AI Settings</h2>`
);

content = content.replace(
  /<p className="muted" style=\{\{ marginTop: 6, fontSize: 11 \}\}>\s*\{data\.geminiApiKey \? "✅ API key saved" : "Get a free key at aistudio\.google\.com\/apikey"\}\s*<\/p>\s*<\/div>/g,
  `<p className="muted" style={{ marginTop: 6, fontSize: 11 }}>\n            {data.geminiApiKey ? "✅ API key saved" : "Get a free key at aistudio.google.com/apikey"}\n          </p>\n        </div>\n        )}`
);

fs.writeFileSync(file, content);
console.log('patched');
