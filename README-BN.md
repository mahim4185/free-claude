# AI Developer Workspace — v2

এই সংস্করণে OpenRouter-এর পাশাপাশি কয়েকটি OpenAI-compatible provider, ছবি, ZIP source inspection, voice input, AI উত্তরের read-aloud এবং আগের chat history সংরক্ষণ আছে।

## গুরুত্বপূর্ণ সীমা

- কোনো provider-এর ফ্রি API আনলিমিটেড নয়। Free tier-এর quota, rate limit, context limit ও availability provider নির্ধারণ করে; এই প্রজেক্ট সেগুলো bypass করে না।
- OpenRouter key একই OpenRouter catalog-এর মডেলগুলোতে ব্যবহার করা যায়। Google Gemini, Groq, Mistral বা অন্য provider-এর জন্য সেই provider-এর নিজের key দরকার।
- `custom` provider শুধু OpenAI Chat Completions-compatible endpoint-এ কাজ করে; browser CORS অনুমতি না দিলে custom endpoint কাজ নাও করতে পারে।
- ছবি পাঠানোর জন্য selected model-কে image/vision input সমর্থন করতে হবে। OpenRouter Free Router-এ ছবি দিলে সেটি multimodal free model বেছে নেওয়ার চেষ্টা করে। Provider/model availability বদলাতে পারে।
- ZIP raw archive হিসেবে AI-কে দেওয়া হয় না। Server নিরাপদে archive-টি memory-তে পড়ে supported code/text file পাঠায়; সর্বোচ্চ 10 MB ZIP, সর্বোচ্চ 40 source file, প্রতিটি 32 KB এবং মোট 120 KB text। `node_modules`, `.git`, `dist`, `build` ইত্যাদি বাদ যায়; disk-এ ZIP extract করা হয় না।
- Voice input browser speech recognition ব্যবহার করে; Android APK-তে native Bengali recognizer fallback আছে। AI-এর উত্তর browser speech synthesis দিয়ে শোনানো যায়—ফোনে Bengali voice থাকলে ফল ভালো হবে।
- API keys browser-এর local storage-এ থাকে; এই app server-এ keys save করে না। নিজের key গোপন রাখুন।

## Render-এ আপডেট

আপনার repository-তে নিচের ফাইলগুলো প্রতিস্থাপন/যোগ করুন:

1. `server.js`
2. `package.json`
3. `package-lock.json`
4. `public/index.html`

তারপর GitHub-এ commit করুন। Render-এর existing Node Web Service সাধারণত `npm install` এবং `npm start` দিয়ে নিজে deploy করবে। `render.yaml`-এর build/start command আগের মতো থাকলে সেটি বদলানোর দরকার নেই।

Deploy শেষ হলে live site-এ Settings খুলে provider, তার নিজস্ব API key এবং model ID সেভ করুন। OpenRouter-এ default `openrouter/free` দিয়ে শুরু করা যায়।

## Android APK

Android app WebView দিয়ে আপনার live URL `https://free-claude-i0r3.onrender.com/` খোলে। Android APK-তে পরিবর্তন করা হলে সেটি microphone permission, Bengali native speech input এবং image/ZIP file picker সামলায়. Website source Render-এ deploy হলে app-এও নতুন web features দেখা যাবে.
