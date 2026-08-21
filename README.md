# Voxie — Voice Shopping Assistant

Voxie is a mobile-first shopping assistant that accepts typed or spoken shopping commands, maintains a persistent list, recommends products, and searches a small catalogue.

## Features

- Voice recognition via the browser Web Speech API (Chrome and Edge)
- English, Spanish, French, Hindi, and German recognition selectors
- Natural-language commands: add, remove, quantities, and product search
- Automatic categories such as Produce, Dairy, Beverages, and Snacks
- Product filters for organic items and a maximum budget, for example `find organic apples under $5`
- Persistent Express API with a small local JSON data store
- Recurring and seasonal suggestion chips

## Run locally

Open two terminals from the project folder.

```powershell
cd server
npm.cmd start
```

```powershell
cd client
npm.cmd run dev
```

Open the displayed `localhost:5173` URL in Chrome or Edge, then allow microphone access when asked.

## Example commands

```text
Add milk
I need two bottles of water
Remove milk from my list
Find organic apples
Find toothpaste under five dollars
```

## Approach (under 200 words)

Voxie keeps the eight-hour scope practical. The mobile React interface uses the browser Web Speech API to turn spoken commands into text, with a text input fallback for unsupported browsers or denied microphone access. A lightweight rule-based parser identifies add, remove, and search intents, extracts English number words or digits, and recognises organic and budget filters. This makes the core interaction fast, explainable, and independent of a paid AI service.

An Express API persists list items and history to a small JSON store for the demo. It automatically assigns an item category, returns a mock product catalogue for voice search, and produces recurring/seasonal suggestion chips. The frontend provides real-time listening, processing, confirmation, and error feedback. For deployment, host `client` on Vercel or Netlify and `server` on Render or Railway, setting `VITE_API_URL` to the deployed API URL.
