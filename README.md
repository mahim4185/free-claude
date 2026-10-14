# Free Claude Code Web Client for Render

একটি সম্পূর্ণ রেডি-টু-ডিপ্লয় Node.js + HTML5 ওয়েব ইন্টারফেস যা Render-এ বিনামূল্যে হোস্ট করা যায় এবং `free-claude-code` প্রক্সি বা যেকোনো Anthropic API-এর সাথে সংযুক্ত হতে পারে।

## প্রজেক্টের ফাইলসমূহ:
- `server.js` - Express ব্যাকএন্ড সার্ভার (Render Web Service-এর জন্য)।
- `package.json` - Node.js ডিপেন্ডেন্সি তালিকা।
- `render.yaml` - Render-এর অটো ডিপ্লয়মেন্ট কনফিগারেশন।
- `public/index.html` - স্বয়ংসম্পূর্ণ আধুনিক AI চ্যাট ওয়ার্কস্পেস (বাংলা ও ইংরেজি সাপোর্টসহ)।

## গিটহাব ও রেন্ডারে ডিপ্লয় করার ধাপসমূহ:
১. জিপ ফাইলটি আনজিপ করে আপনার নতুন GitHub রিপোজিটরিতে সব ফাইল আপলোড (Push) করুন।
২. [Render Dashboard](https://dashboard.render.com)-এ যান।
৩. `New +` বাটনে ক্লিক করে `Web Service` সিলেক্ট করুন।
৪. আপনার GitHub রিপোজিটরিটি কানেক্ট করুন।
৫. Settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`
৬. `Create Web Service` বাটনে ক্লিক করলেই আপনার নিজস্ব লাইভ URL তৈরি হয়ে যাবে!
