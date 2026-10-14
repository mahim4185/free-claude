AI fallback replacement files

GitHub repository root-এ server.js replace করুন এবং public/index.html replace করুন। package.json/package-lock.json একই রাখতে পারেন; ZIP-এ reference হিসেবে আছে।

Render → Environment-এ এই variables যোগ করুন (Value নিজে বসাবেন, chat-এ পাঠাবেন না):
GEMINI_API_KEY = নতুন Gemini key
OPENROUTER_API_KEY = নতুন OpenRouter key
GROQ_API_KEY = Groq key (না থাকলে বাদ দিন)

ঐচ্ছিক model variables:
GEMINI_MODEL=gemini-2.5-flash
GROQ_MODEL=llama-3.3-70b-versatile
OPENROUTER_MODEL=openrouter/free

সতর্কতা: keys GitHub code-এ বসাবেন না। প্রকাশিত পুরোনো keys revoke করে নতুন key ব্যবহার করুন।
Deploy শেষে Settings-এ provider Gemini/OpenRouter বেছে নিলেও server fallback enabled থাকবে।
