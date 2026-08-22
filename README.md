# VoxList — Voice Command Shopping Assistant

VoxList is a production-ready, mobile-first voice-activated grocery assistant built with React, Vite, Node.js/Express, and the browser Web Speech & Web Audio APIs.

---

## 🌟 Key Features

### 1. Voice Input & NLP Engine
- **Voice Command Recognition**: Hands-free voice addition and removal using standard browser speech synthesis (`Web Speech API`).
- **Flexible NLP Intent Parsing**: Parses conversational phrases such as *"I want to buy bananas"*, *"Add 2 cartons of milk"*, *"Scratch gala apples"*, and *"Find toothpaste under $5"*.
- **Multilingual Support**: Real-time speech recognition and command parsing in English, Spanish, French, German, and Hindi.

### 2. Smart Suggestions & Wellness
- **History & Preference Recommendations**: Suggests items dynamically based on shopping frequency and past activity.
- **Seasonal & Health-Aware Picks**: Curates seasonal staples and budget-friendly suggestions.
- **Dietary Substitutes & Health Modes**: Suggests smart nutritional alternatives (e.g., almond milk vs. whole milk) with wellness guidance for balanced, weight-aware, or protein-focused diets.

### 3. Shopping List Management
- **Add / Remove / Modify**: Full voice and tactile control to check off, edit prices, adjust quantities, or remove items.
- **Automatic Categorization**: Automatically categorizes products into Produce, Dairy, Bakery, Beverages, Snacks, and Household.
- **Quantity & Necessity Tracking**: Recognizes spoken numbers and words (e.g., *"3 avocados"*), unit price inputs, and priority tags (*Essential*, *Useful*, *Can wait*).

### 4. Voice-Activated Search & Price Filters
- **Product Search**: Search catalog items by keyword, organic preference, brand, or size (e.g., *"Find organic apples"*).
- **Price Range Filtering**: Voice-based filter to query items under specific budgets (e.g., *"Find toothpaste under $5"*).

### 5. UI/UX & Feedback Systems
- **Real-Time Visual HUD**: Instant toast banner displaying recognized voice actions, target emoji, quantity, and priority tags.
- **Haptic & Audio Feedback**: Tactile device vibration patterns and Web Audio synthesizer chimes for starts, completions, and deletions.
- **Interactive List Filtering**: Live progress bar, category filter chips with counters, and quick-add starter pills.

---

## 🚀 Getting Started Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the development server (runs full-stack Express + Vite on port 3000)
npm run dev
```

Open `http://localhost:3000` in Chrome, Edge, or Safari, and allow microphone permissions.

---

## 📝 Approach & Architectural Summary (under 200 words)

> **VoxList Approach Write-up:**
> 
> VoxList delivers a robust, accessible voice-driven shopping assistant optimized for speed, reliability, and zero external latency. The client leverages the native browser Web Speech API for low-latency voice recognition across multiple languages (English, Spanish, French, German, Hindi) with instant text input fallback. 
> 
> Spoken queries flow through a deterministic Natural Language Processing (NLP) pipeline that extracts user intent (add, remove, search, filter), parses numerical quantities, and isolates price/attribute constraints (e.g., "under $5", "organic"). An Express backend manages item state, handles automated category classification (Produce, Dairy, Bakery, etc.), and matches products against an extensible catalog. 
> 
> Smart suggestions incorporate historical frequency, seasonal availability, and dietary substitutions. For UX feedback, the interface pairs an animated real-time recognition HUD with Web Audio synthesizer chimes and device haptic vibrations. The full-stack app compiles cleanly into a standalone Node.js production service, ready for containerized deployment on Google Cloud Run, AWS, or Firebase.

---

## ☁️ Deployment

- **Google Cloud Run / AWS / Container**: Run `npm run build && npm start`.
- **Static Frontend + Backend**: Host the frontend build on Vercel/Firebase Hosting and the Express API on Cloud Run / Render.
