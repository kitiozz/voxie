import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
const storePath = path.join(__dirname, "server", "data", "store.json");
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(cors());
app.use(express.json());

function validateEmoji(value) {
  if (!value) return "🛒";
  const str = String(value).trim();
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str)];
  const char = segments[0]?.segment;
  return segments.length === 1 && char && /\p{Extended_Pictographic}/u.test(char) ? char : "🛒";
}

function cleanItemName(value) {
  return String(value ?? "")
    .replace(/^(hello|hi|hey|please)\b\s*/i, "")
    .replace(/^(add|buy|get|put|need|i need|i want)\b\s*/i, "")
    .replace(/\s+(to my list|on my list)$/i, "")
    .trim();
}

const defaultProducts = [
  { id: "milk-1", name: "Whole Milk", brand: "Meadow", category: "Dairy", price: 3.49, organic: false, size: "1 litre", substitute: "Almond Milk", emoji: "🥛" },
  { id: "milk-2", name: "Organic Almond Milk", brand: "Almond Breeze", category: "Beverages", price: 4.79, organic: true, size: "1 litre", substitute: "Oat Milk", emoji: "🥛" },
  { id: "apple-1", name: "Organic Gala Apples", brand: "Fresh Field", category: "Produce", price: 4.25, organic: true, size: "1 kg", substitute: "Organic Fuji Apples", emoji: "🍎" },
  { id: "apple-2", name: "Red Apples", brand: "Fresh Field", category: "Produce", price: 2.99, organic: false, size: "1 kg", substitute: "Pears", emoji: "🍎" },
  { id: "water-1", name: "Spring Water", brand: "Clear Drop", category: "Beverages", price: 3.99, organic: false, size: "6 bottles", substitute: "Sparkling Water", emoji: "💧" },
  { id: "toothpaste-1", name: "Fresh Mint Toothpaste", brand: "Smile", category: "Personal Care", price: 3.75, organic: false, size: "100 ml", substitute: "Herbal Toothpaste", emoji: "🪥" },
  { id: "toothpaste-2", name: "Herbal Toothpaste", brand: "Nature Care", category: "Personal Care", price: 4.5, organic: true, size: "100 ml", substitute: "Fresh Mint Toothpaste", emoji: "🪥" },
  { id: "banana-1", name: "Bananas", brand: "Fresh Field", category: "Produce", price: 1.99, organic: false, size: "1 bunch", substitute: "Plantains", emoji: "🍌" },
  { id: "bread-1", name: "Whole Wheat Bread", brand: "Daily Bake", category: "Bakery", price: 2.89, organic: false, size: "1 loaf", substitute: "Multigrain Bread", emoji: "🍞" },
  { id: "coffee-1", name: "Ground Coffee", brand: "Morning Roast", category: "Beverages", price: 6.99, organic: false, size: "250 g", substitute: "Instant Coffee", emoji: "☕" }
];

let inMemoryStore = null;

function readStore() {
  try {
    if (!fs.existsSync(path.dirname(storePath))) {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
    }
    if (fs.existsSync(storePath)) {
      inMemoryStore = JSON.parse(fs.readFileSync(storePath, "utf8"));
    } else {
      inMemoryStore = inMemoryStore || {
        budget: { monthly: 0 },
        items: [],
        history: ["Whole Milk", "Ground Coffee", "Organic Gala Apples"],
        products: defaultProducts,
        healthProfile: { goal: "balanced", notes: "" }
      };
      fs.writeFileSync(storePath, JSON.stringify(inMemoryStore, null, 2));
    }
  } catch {
    inMemoryStore = inMemoryStore || {
      budget: { monthly: 0 },
      items: [],
      history: ["Whole Milk", "Ground Coffee", "Organic Gala Apples"],
      products: defaultProducts,
      healthProfile: { goal: "balanced", notes: "" }
    };
  }

  inMemoryStore.items ??= [];
  inMemoryStore.history ??= [];
  inMemoryStore.products = (inMemoryStore.products && inMemoryStore.products.length > 0) ? inMemoryStore.products : defaultProducts;
  inMemoryStore.budget ??= { monthly: 0 };
  inMemoryStore.healthProfile ??= { goal: "balanced", notes: "" };
  inMemoryStore.items = inMemoryStore.items.map((item) =>
    item.unitPrice === 0 && !item.productId ? { ...item, unitPrice: null } : item
  );
  return inMemoryStore;
}

function writeStore(store) {
  inMemoryStore = store;
  try {
    if (!fs.existsSync(path.dirname(storePath))) {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
    }
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  } catch (err) {
    console.warn("Could not write store to disk:", err.message);
  }
}

const wellnessFallbacks = {
  balanced: {
    title: "Balanced everyday basket",
    guidance: "Build meals around vegetables or fruit, a protein source, whole grains, and water.",
    groceries: [
      { name: "Leafy greens", reason: "Adds vegetables and fiber to meals." },
      { name: "Beans or lentils", reason: "Budget-friendly plant protein." },
      { name: "Whole grains", reason: "A practical source of energy and fiber." },
      { name: "Fruit", reason: "Convenient produce for snacks and meals." },
    ],
  },
  weight_loss: {
    title: "Weight-aware grocery basket",
    guidance: "Prioritize filling, minimally processed foods and plan portions; weight change is individual and not guaranteed by any single food.",
    groceries: [
      { name: "Leafy greens", reason: "Adds volume and variety to meals." },
      { name: "Eggs or tofu", reason: "Flexible protein for breakfast or meals." },
      { name: "Berries", reason: "Fruit option for snacks and yogurt bowls." },
      { name: "Plain yogurt", reason: "Useful base for a filling snack." },
    ],
  },
  blood_sugar: {
    title: "Blood-sugar-aware basket",
    guidance: "Pair carbohydrate foods with protein or fiber and choose unsweetened drinks. If you have diabetes, confirm personal targets with your care team.",
    groceries: [
      { name: "Non-starchy vegetables", reason: "Build meals around vegetables." },
      { name: "Beans or lentils", reason: "Fiber-rich option for balanced meals." },
      { name: "Nuts", reason: "Convenient unsweetened snack option." },
      { name: "Plain yogurt", reason: "Choose unsweetened and check the label." },
    ],
  },
  iron: {
    title: "Iron-focused basket",
    guidance: "Include iron-containing foods and pair plant sources with vitamin-C-rich produce. Confirm suspected deficiency with a clinician rather than self-treating with supplements.",
    groceries: [
      { name: "Lentils", reason: "Plant source of iron and protein." },
      { name: "Spinach", reason: "Leafy green that can add iron to meals." },
      { name: "Bell peppers", reason: "Vitamin-C-rich pairing for plant foods." },
      { name: "Iron-fortified cereal", reason: "Check the nutrition label for iron." },
    ],
  },
  protein: {
    title: "Higher-protein basket",
    guidance: "Spread protein across meals and choose options that fit your health needs, budget, and dietary pattern.",
    groceries: [
      { name: "Eggs", reason: "Versatile protein for several meals." },
      { name: "Greek yogurt", reason: "Convenient protein-rich breakfast or snack." },
      { name: "Tofu", reason: "Plant-based protein option." },
      { name: "Beans", reason: "Affordable protein and fiber." },
    ],
  },
};

function wellnessPlan(profile) {
  const fallback = wellnessFallbacks[profile.goal] || wellnessFallbacks.balanced;
  return {
    ...fallback,
    goal: profile.goal,
    notes: profile.notes || "",
    safety: "This is general grocery guidance, not medical advice. Confirm changes with a qualified clinician if you have a diagnosis, take medication, are pregnant, or have allergies.",
  };
}

function productFor(name, products) {
  const value = String(name).toLowerCase();
  return products.find((product) => {
    const productName = product.name.toLowerCase();
    return (
      productName.includes(value) ||
      value.includes(productName) ||
      value.split(/\s+/).some((word) => word.length > 2 && productName.includes(word))
    );
  });
}

function categoryFor(name) {
  const value = name.toLowerCase();
  if (/milk|cheese|yogurt|butter/.test(value)) return "Dairy";
  if (/apple|orange|banana|mango|tomato|potato|onion|spinach|berry|berries|fruit|vegetable/.test(value)) return "Produce";
  if (/water|juice|coffee|tea|soda/.test(value)) return "Beverages";
  if (/chips|cookie|chocolate|popcorn|nuts/.test(value)) return "Snacks";
  if (/toothpaste|soap|shampoo/.test(value)) return "Personal Care";
  if (/bread|cereal|grain|rice|pasta/.test(value)) return "Bakery";
  return "Other";
}

function emojiFor(name) {
  const value = name.toLowerCase();
  if (/milk/.test(value)) return "🥛";
  if (/apple/.test(value)) return "🍎";
  if (/water/.test(value)) return "💧";
  if (/toothpaste/.test(value)) return "🪥";
  if (/banana/.test(value)) return "🍌";
  if (/bread/.test(value)) return "🍞";
  if (/coffee/.test(value)) return "☕";
  if (/tea/.test(value)) return "🍵";
  if (/egg/.test(value)) return "🥚";
  if (/cheese/.test(value)) return "🧀";
  if (/spinach|greens|lettuce/.test(value)) return "🥬";
  if (/tomato/.test(value)) return "🍅";
  if (/potato/.test(value)) return "🥔";
  if (/orange/.test(value)) return "🍊";
  if (/berry|berries|strawberry/.test(value)) return "🍓";
  if (/cookie|cake|sweet/.test(value)) return "🍪";
  if (/chicken|meat/.test(value)) return "🍗";
  if (/fish/.test(value)) return "🐟";
  if (/rice/.test(value)) return "🍚";
  return "🛒";
}

function parseFallbackCommand(raw) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();

  // Search intent
  if (/^(find|search|show|look for)\b/i.test(lower)) {
    const query = lower.replace(/^(find|search|show|look for)\b\s*/i, "").replace(/under\s*\$?\d+/i, "").trim();
    const maxPriceMatch = lower.match(/under\s*\$?(\d+(?:\.\d+)?)/i);
    const organic = lower.includes("organic");
    return {
      intent: "search",
      query,
      organic,
      maxPrice: maxPriceMatch ? maxPriceMatch[1] : undefined
    };
  }

  // Remove intent
  if (/^(remove|delete|drop)\b/i.test(lower)) {
    const item = lower.replace(/^(remove|delete|drop)\b\s*/i, "").replace(/from my list|on my list/i, "").trim();
    return {
      intent: "remove",
      name: item,
      item: item
    };
  }

  // Add intent
  const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  let qty = 1;
  let remaining = text;

  const numMatch = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:bottles? of|cans? of|bags? of|boxes? of|packs? of|kg of|g of|bunches? of|loaves of|loaf of)?/i);
  if (numMatch) {
    const foundNum = numMatch[1].toLowerCase();
    qty = numberWords[foundNum] || parseInt(foundNum, 10) || 1;
    remaining = text.replace(numMatch[0], "");
  }

  let priority = "medium";
  if (/(essential|urgent|must have|important|critical|staple)/i.test(lower)) {
    priority = "high";
    remaining = remaining.replace(/(essential|urgent|must have|important|critical|staple)/gi, "");
  } else if (/(optional|can wait|treat|snack|luxury|maybe)/i.test(lower)) {
    priority = "low";
    remaining = remaining.replace(/(optional|can wait|treat|snack|luxury|maybe)/gi, "");
  }

  const cleaned = cleanItemName(remaining);
  return {
    intent: "add",
    item: cleaned || text,
    name: cleaned || text,
    quantity: qty,
    priority,
    category: categoryFor(cleaned || text),
    emoji: emojiFor(cleaned || text)
  };
}

// API Routes
app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/health-profile", (_request, response) => {
  response.json(readStore().healthProfile);
});

app.put("/api/health-profile", (request, response) => {
  const store = readStore();
  const allowedGoals = Object.keys(wellnessFallbacks);
  store.healthProfile = {
    goal: allowedGoals.includes(request.body.goal) ? request.body.goal : "balanced",
    notes: String(request.body.notes || "").trim().slice(0, 500),
  };
  writeStore(store);
  response.json({ profile: store.healthProfile, plan: wellnessPlan(store.healthProfile) });
});

app.post("/api/wellness-plan", (request, response) => {
  const profile = {
    goal: String(request.body.goal || "balanced"),
    notes: String(request.body.notes || "").trim().slice(0, 500),
  };
  response.json(wellnessPlan(profile));
});

function analyzeCartNutrition(items, profile = { goal: "balanced", notes: "" }) {
  if (!items || items.length === 0) {
    return {
      summary: "Add items to your grocery list to receive real-time nutritional insights and tailored wellness guidance.",
      score: "Empty Basket",
      breakdown: [
        { group: "Produce & Greens", count: 0, icon: "🥗" },
        { group: "Proteins & Dairy", count: 0, icon: "🥚" },
        { group: "Whole Grains & Fiber", count: 0, icon: "🌾" },
        { group: "Hydration", count: 0, icon: "💧" },
      ],
      highlights: ["Your list is ready for wholesome grocery planning."],
      recommendations: [
        { name: "Organic Gala Apples", reason: "Rich in antioxidants and dietary fiber.", emoji: "🍎" },
        { name: "Spinach", reason: "Essential folate, iron, and carotenoids.", emoji: "🥬" },
        { name: "Whole Milk", reason: "Calcium and high-quality protein.", emoji: "🥛" },
      ],
      goalAlignment: "Select your health focus below to guide your weekly meal and basket planning.",
    };
  }

  const names = items.map((i) => String(i.name || "").toLowerCase());
  const categories = items.map((i) => String(i.category || "").toLowerCase());

  const hasProduce = names.some((n) => /apple|banana|orange|berry|berries|spinach|greens|lettuce|tomato|potato|onion|carrot|broccoli|mango|fruit|vegetable|salad|avocado|cucumber|pepper|kale/i.test(n)) || categories.includes("produce");
  const hasProtein = names.some((n) => /milk|egg|eggs|tofu|chicken|beef|meat|fish|salmon|tuna|beans|lentils|yogurt|cheese|protein|turkey|nuts|peanut/i.test(n)) || categories.includes("dairy");
  const hasGrains = names.some((n) => /bread|oats|oatmeal|rice|pasta|cereal|quinoa|grain|wheat|flour|noodle/i.test(n)) || categories.includes("bakery");
  const hasHydration = names.some((n) => /water|tea|coconut water/i.test(n));
  const hasSnacks = names.some((n) => /chips|cookie|chocolate|candy|soda|popcorn|cake|sweet/i.test(n)) || categories.includes("snacks");

  const produceCount = items.filter((i) => /apple|banana|orange|berry|berries|spinach|greens|lettuce|tomato|potato|onion|carrot|broccoli|mango|fruit|vegetable|salad|avocado|cucumber|pepper|kale/i.test(i.name) || i.category?.toLowerCase() === "produce").length;
  const proteinCount = items.filter((i) => /milk|egg|eggs|tofu|chicken|beef|meat|fish|salmon|tuna|beans|lentils|yogurt|cheese|protein|turkey|nuts|peanut/i.test(i.name) || i.category?.toLowerCase() === "dairy").length;
  const grainCount = items.filter((i) => /bread|oats|oatmeal|rice|pasta|cereal|quinoa|grain|wheat|flour|noodle/i.test(i.name) || i.category?.toLowerCase() === "bakery").length;
  const hydrationCount = items.filter((i) => /water|tea|coconut water/i.test(i.name) || (i.category?.toLowerCase() === "beverages" && !/soda|energy/i.test(i.name))).length;

  const breakdown = [
    { group: "Produce & Fruits", count: produceCount, icon: "🥦" },
    { group: "Protein & Dairy", count: proteinCount, icon: "🥚" },
    { group: "Grains & Complex Carbs", count: grainCount, icon: "🍞" },
    { group: "Hydration", count: hydrationCount, icon: "💧" },
  ];

  const highlights = [];
  if (hasProduce) highlights.push("Great selection of plant-rich produce providing essential vitamins, phytonutrients, and dietary fiber.");
  if (hasProtein) highlights.push("Solid foundation of protein and amino acids to support muscle maintenance and sustained satiety.");
  if (hasHydration) highlights.push("Includes clean hydration sources to maintain daily fluid balance.");
  if (highlights.length === 0) highlights.push("Items logged. Adding diverse whole foods will help balance your weekly nutrient intake.");

  const recommendations = [];
  if (!hasProduce) {
    recommendations.push({ name: "Organic Spinach", reason: "Adds vital folate, iron, and vitamins A & K to your meals.", emoji: "🥬" });
    recommendations.push({ name: "Organic Gala Apples", reason: "Convenient source of soluble fiber and polyphenol antioxidants.", emoji: "🍎" });
  } else if (!hasProtein) {
    recommendations.push({ name: "Eggs", reason: "Versatile, complete protein source rich in choline.", emoji: "🥚" });
    recommendations.push({ name: "Greek Yogurt", reason: "High-protein snack with gut-friendly probiotics.", emoji: "🥛" });
  } else if (!hasGrains) {
    recommendations.push({ name: "Whole Wheat Bread", reason: "Complex carbohydrates and B-vitamins for sustained energy.", emoji: "🍞" });
  } else {
    recommendations.push({ name: "Almonds", reason: "Heart-healthy unsaturated fats and magnesium.", emoji: "🥜" });
    recommendations.push({ name: "Spring Water", reason: "Essential for hydration throughout the day.", emoji: "💧" });
  }

  let goalAlignment = "Basket aligns well with a balanced nutrition profile.";
  if (profile.goal === "weight_loss") {
    goalAlignment = hasProduce && hasProtein
      ? "Strong alignment with your weight-aware goal: combining high-volume produce with protein promotes natural fullness."
      : "For weight awareness, try prioritizing non-starchy vegetables and lean proteins to boost satiety.";
  } else if (profile.goal === "blood_sugar") {
    goalAlignment = hasGrains && !hasProtein
      ? "Blood-sugar tip: Pair carbohydrate foods like bread or pasta with protein or healthy fats to smooth glucose spikes."
      : "Well planned for blood-sugar awareness: includes stabilizing whole food elements.";
  } else if (profile.goal === "iron") {
    goalAlignment = "Iron tip: If consuming plant-based iron (like beans or greens), pair them with Vitamin C sources (like bell peppers or oranges) to boost absorption.";
  } else if (profile.goal === "protein") {
    goalAlignment = hasProtein
      ? "Great protein density in your current selections. Aim to distribute protein evenly across breakfast, lunch, and dinner."
      : "Consider adding another protein source (like Greek yogurt, eggs, or beans) to meet your higher-protein focus.";
  }

  let score = "Balanced Basket";
  if (produceCount >= 2 && proteinCount >= 1 && grainCount >= 1) score = "Nutrient Dense & Balanced";
  else if (produceCount > 2) score = "Produce Rich";
  else if (proteinCount > 2) score = "High Protein";
  else if (hasSnacks && !hasProduce) score = "Snack Leaning";

  return {
    summary: `Your current list has ${items.length} ${items.length === 1 ? "item" : "items"}. ${hasProduce ? "Includes valuable vitamins & fiber." : "Consider adding fresh vegetables or fruit."}`,
    score,
    breakdown,
    highlights,
    recommendations: recommendations.slice(0, 3),
    goalAlignment,
  };
}

app.post("/api/cart-nutrition", async (request, response) => {
  const items = Array.isArray(request.body.items) ? request.body.items : readStore().items;
  const store = readStore();
  const profile = request.body.profile || store.healthProfile || { goal: "balanced", notes: "" };

  if (!items || items.length === 0) {
    return response.json(analyzeCartNutrition([], profile));
  }

  if (!geminiApiKey) {
    return response.json(analyzeCartNutrition(items, profile));
  }

  try {
    const itemListStr = items.map((item) => `${item.quantity}x ${item.name} (${item.category || "Grocery"})`).join(", ");
    const completion = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are a clinical nutritionist reviewing a user's current grocery basket: [${itemListStr}].
User's wellness focus: ${profile.goal || "balanced"} (Notes: "${profile.notes || "None"}").

Return a strict JSON response with:
- "summary": A friendly, motivating 1-2 sentence assessment of the nutrition in this cart.
- "score": A 2-4 word balance descriptor (e.g. "Nutrient-Dense & Fresh", "Produce-Forward", "Protein-Packed", "Needs Fresh Produce").
- "breakdown": An array of objects: [{ "group": "Produce & Greens", "count": number, "icon": "🥦" }, { "group": "Proteins & Dairy", "count": number, "icon": "🥚" }, { "group": "Grains & Fiber", "count": number, "icon": "🍞" }, { "group": "Hydration", "count": number, "icon": "💧" }].
- "highlights": An array of 2 bullet points describing specific nutritional strengths of the items in their cart.
- "recommendations": An array of 2-3 suggested complementary grocery items that fill nutritional gaps, each with {"name": string, "reason": string, "emoji": single food emoji}.
- "goalAlignment": A personalized 1-2 sentence tip linking their actual cart items directly to their health goal (${profile.goal}).`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      }
    );

    if (!completion.ok) {
      return response.json(analyzeCartNutrition(items, profile));
    }

    const payload = await completion.json();
    const result = JSON.parse(payload.candidates[0].content.parts[0].text);
    return response.json(result);
  } catch {
    return response.json(analyzeCartNutrition(items, profile));
  }
});

app.post("/api/parse-command", async (request, response) => {
  const commandStr = String(request.body.command ?? "").trim();
  if (!commandStr) {
    return response.status(400).json({ message: "No command provided." });
  }

  if (!geminiApiKey) {
    const fallback = parseFallbackCommand(commandStr);
    return response.json(fallback);
  }

  try {
    const completion = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Parse this shopping command as JSON only with intent, item, quantity, category, priority ('high', 'medium', or 'low'), and emoji. Intent can be 'add', 'remove', or 'search'. Priority should be 'high' for essentials/staples (water, milk, medicine, produce, baby formula), 'low' for snacks/sweets/treats, and 'medium' for regular items. Quantity must be a positive integer, using 1 if absent. Remove filler words such as hello, please, I need, add, buy, and get from item. Return one specific emoji that visually represents the item. Examples: milk -> 🥛, spinach -> 🥬, mango -> 🥭, T-shirt -> 👕. Command: ${commandStr}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      }
    );

    if (!completion.ok) {
      // Fallback locally if Gemini API error occurs
      const fallback = parseFallbackCommand(commandStr);
      return response.json(fallback);
    }

    const payload = await completion.json();
    const result = JSON.parse(payload.candidates[0].content.parts[0].text);
    const item = cleanItemName(result.item || result.query || commandStr);
    const quantity = Number.isInteger(Number(result.quantity)) && Number(result.quantity) > 0 ? Number(result.quantity) : 1;
    const priority = ["high", "medium", "low"].includes(result.priority) ? result.priority : "medium";
    let emoji = validateEmoji(result.emoji);

    if (emoji === "🛒" && item) {
      emoji = emojiFor(item);
    }

    return response.json({ ...result, item, name: item, query: result.query || item, quantity, priority, emoji });
  } catch {
    const fallback = parseFallbackCommand(commandStr);
    return response.json(fallback);
  }
});

app.get("/api/items", (_request, response) => {
  response.json(readStore().items);
});

app.post("/api/items", (request, response) => {
  const { name, quantity = 1, category, emoji, priority = "medium", unitPrice } = request.body;
  if (!name || !String(name).trim()) {
    return response.status(400).json({ message: "An item name is required." });
  }

  const store = readStore();
  const matchedProduct = productFor(name, store.products);
  const resolvedPrice = (unitPrice !== undefined && unitPrice !== null && unitPrice !== "")
    ? Number(Number(unitPrice).toFixed(2))
    : (matchedProduct ? matchedProduct.price : null);

  const item = {
    id: Date.now().toString(),
    name: String(name).trim(),
    quantity: Math.max(1, Number(quantity) || 1),
    category: category || matchedProduct?.category || categoryFor(name),
    emoji: validateEmoji(emoji) !== "🛒" ? validateEmoji(emoji) : (matchedProduct?.emoji || emojiFor(name)),
    unitPrice: resolvedPrice,
    productId: matchedProduct?.id || null,
    priority: ["high", "medium", "low"].includes(priority) ? priority : "medium",
    completed: false,
  };

  store.items.push(item);
  store.history = [item.name, ...store.history.filter((entry) => entry !== item.name)].slice(0, 12);
  writeStore(store);
  return response.status(201).json(item);
});

app.patch("/api/items/:id", (request, response) => {
  const store = readStore();
  const item = store.items.find((entry) => entry.id === request.params.id);
  if (!item) return response.status(404).json({ message: "Item not found." });

  const { name, quantity, completed, priority, unitPrice } = request.body;
  if (name !== undefined && String(name).trim()) item.name = String(name).trim();
  if (quantity !== undefined) item.quantity = Math.max(1, Number(quantity) || 1);
  if (completed !== undefined) item.completed = Boolean(completed);
  if (priority !== undefined && ["high", "medium", "low"].includes(priority)) item.priority = priority;
  if (unitPrice === null || unitPrice === "") {
    item.unitPrice = null;
  } else if (
    unitPrice !== undefined &&
    Number.isFinite(Number(unitPrice)) &&
    Number(unitPrice) >= 0
  ) {
    item.unitPrice = Number(Number(unitPrice).toFixed(2));
  }
  const matchedProduct = productFor(item.name, store.products);
  item.category = item.category || matchedProduct?.category || categoryFor(item.name);
  if (item.unitPrice === undefined) {
    item.unitPrice = matchedProduct?.price ?? null;
  }
  item.productId = item.productId || matchedProduct?.id || null;
  writeStore(store);
  return response.json(item);
});

app.delete("/api/items/:id", (request, response) => {
  const store = readStore();
  const nextItems = store.items.filter((item) => item.id !== request.params.id);
  if (nextItems.length === store.items.length) {
    return response.status(404).json({ message: "Item not found." });
  }
  store.items = nextItems;
  writeStore(store);
  return response.status(204).end();
});

app.get("/api/products", (request, response) => {
  const { query = "", organic, maxPrice, brand } = request.query;
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const price = Number(maxPrice);
  const store = readStore();

  const products = store.products.filter((product) => {
    const searchable = `${product.name} ${product.brand} ${product.category} ${product.size}`.toLowerCase();
    const matchesWords = words.every((word) => searchable.includes(word));
    const matchesOrganic = organic === undefined || organic === "" || String(product.organic) === organic;
    const matchesPrice = !Number.isFinite(price) || product.price <= price;
    const matchesBrand = !brand || product.brand.toLowerCase().includes(String(brand).toLowerCase());
    return matchesWords && matchesOrganic && matchesPrice && matchesBrand;
  });

  response.json(products);
});

app.get("/api/suggestions", (_request, response) => {
  const store = readStore();
  const defaults = ["Milk", "Bread", "Eggs", "Coffee"];
  const seasonal = ["Mangoes", "Iced Tea"];
  const suggested = [...store.history, ...seasonal, ...defaults]
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 6);
  response.json(suggested);
});

app.get("/api/budget", (_request, response) => {
  response.json(readStore().budget);
});

app.put("/api/budget", (request, response) => {
  const store = readStore();
  store.budget = { monthly: Math.max(0, Number(request.body.monthly) || 0) };
  writeStore(store);
  response.json(store.budget);
});

app.get("/api/budget/plan", (_request, response) => {
  const store = readStore();
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  const monthly = store.budget.monthly || 0;
  const candidates = store.items
    .filter((item) => !item.completed)
    .map((item) => ({
      ...item,
      estimatedCost: (item.unitPrice != null && Number.isFinite(Number(item.unitPrice)))
        ? Number((item.quantity * Number(item.unitPrice)).toFixed(2))
        : null,
    }))
    .sort(
      (left, right) =>
        priorityWeight[right.priority || "medium"] - priorityWeight[left.priority || "medium"] ||
        (left.estimatedCost || 0) - (right.estimatedCost || 0)
    );

  let budgetRemaining = monthly;
  const buyNow = [];
  const defer = [];

  for (const item of candidates) {
    if (item.estimatedCost === null) {
      defer.push(item);
    } else if (monthly === 0 || item.estimatedCost <= budgetRemaining) {
      buyNow.push(item);
      if (monthly > 0) {
        budgetRemaining = Math.max(0, budgetRemaining - item.estimatedCost);
      }
    } else {
      defer.push(item);
    }
  }

  const plannedSpend = buyNow.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
  const remaining = monthly > 0 ? Math.max(0, monthly - plannedSpend) : 0;

  response.json({
    monthlyBudget: monthly,
    plannedSpend: Number(plannedSpend.toFixed(2)),
    remaining: Number(remaining.toFixed(2)),
    buyNow,
    defer,
  });
});

// Vite middleware for dev or static serving for prod
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true, host: "0.0.0.0", port: 3000 },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Voxie server running on http://0.0.0.0:${port}`);
});
