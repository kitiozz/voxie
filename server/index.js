require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 4000;
const storePath = path.join(__dirname, "data", "store.json");
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(cors());
app.use(express.json());

function validateEmoji(value) {
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(String(value ?? ""))];
  const grapheme = segments[0]?.trim();
  return segments.length === 1 && grapheme && !/[\p{Letter}\p{Number}]/u.test(grapheme) ? grapheme : "🛒";
}

function cleanItemName(value) {
  return String(value ?? "")
    .replace(/^(hello|hi|hey|please)\b\s*/i, "")
    .replace(/^(add|buy|get|put|need|i need|i want)\b\s*/i, "")
    .replace(/\s+(to my list|on my list)$/i, "")
    .trim();
}

function readStore() {
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  store.items ??= [];
  store.history ??= [];
  store.products ??= [];
  store.budget ??= { monthly: 0 };
  store.healthProfile ??= { goal: "balanced", notes: "" };
  store.items = store.items.map((item) => item.unitPrice === 0 && !item.productId ? { ...item, unitPrice: null } : item);
  return store;
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
  return { ...fallback, goal: profile.goal, notes: profile.notes || "", safety: "This is general grocery guidance, not medical advice. Confirm changes with a qualified clinician if you have a diagnosis, take medication, are pregnant, or have allergies." };
}

function writeStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function productFor(name, products) {
  const value = String(name).toLowerCase();
  return products.find((product) => {
    const productName = product.name.toLowerCase();
    return productName.includes(value) || value.includes(productName) || value.split(/\s+/).some((word) => word.length > 2 && productName.includes(word));
  });
}

function categoryFor(name) {
  const value = name.toLowerCase();
  if (/milk|cheese|yogurt|butter/.test(value)) return "Dairy";
  if (/apple|orange|banana|mango|tomato|potato|onion/.test(value)) return "Produce";
  if (/water|juice|coffee|tea|soda/.test(value)) return "Beverages";
  if (/chips|cookie|chocolate|popcorn/.test(value)) return "Snacks";
  if (/toothpaste|soap|shampoo/.test(value)) return "Personal Care";
  return "Other";
}

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
  const profile = { goal: String(request.body.goal || "balanced"), notes: String(request.body.notes || "").trim().slice(0, 500) };
  response.json(wellnessPlan(profile));
});

app.post("/api/parse-command", async (request, response) => {
  if (!geminiApiKey) return response.status(503).json({ message: "GEMINI_API_KEY is not configured." });

  try {
    const completion = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Parse this shopping command as JSON only with intent, item, quantity, category, and emoji. Quantity must be a positive integer, using 1 if absent. Remove filler words such as hello, please, I need, add, buy, and get from item. Return one specific emoji that visually represents the item. Never use 🛒 for a recognizable product; use it only for an unknown item. Examples: milk -> 🥛, spinach -> 🥬, mango -> 🥭, T-shirt -> 👕. Command: ${String(request.body.command ?? "")}` }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });

    if (!completion.ok) {
      const status = completion.status === 429 ? 429 : 502;
      return response.status(status).json({ message: status === 429 ? "Gemini quota exceeded. Please wait or check your Gemini billing and limits." : "Gemini request failed." });
    }
    const payload = await completion.json();
    const result = JSON.parse(payload.candidates[0].content.parts[0].text);
    const item = cleanItemName(result.item || result.query);
    const quantity = Number.isInteger(Number(result.quantity)) && Number(result.quantity) > 0 ? Number(result.quantity) : 1;
    let emoji = validateEmoji(result.emoji);
    if (emoji === "🛒" && item) {
      try {
        const emojiCompletion = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Return exactly one emoji character that directly represents this item: ${item}. Do not return text, JSON, or a shopping cart.` }] }], generationConfig: { temperature: 0 } }),
        });
        if (emojiCompletion.ok) {
          const emojiPayload = await emojiCompletion.json();
          emoji = validateEmoji(emojiPayload.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
        }
      } catch {}
    }
    return response.json({ ...result, item, name: item, query: result.query || item, quantity, emoji });
  } catch {
    return response.status(502).json({ message: "Could not parse the shopping command." });
  }
});

app.get("/api/items", (_request, response) => {
  response.json(readStore().items);
});

app.post("/api/items", (request, response) => {
  const { name, quantity = 1, category, emoji, priority = "medium" } = request.body;
  if (!name || !String(name).trim()) {
    return response.status(400).json({ message: "An item name is required." });
  }

  const store = readStore();
  const matchedProduct = productFor(name, store.products);
  const item = {
    id: Date.now().toString(),
    name: String(name).trim(),
    quantity: Math.max(1, Number(quantity) || 1),
    category: category || matchedProduct?.category || categoryFor(name),
    emoji: validateEmoji(emoji),
    unitPrice: matchedProduct?.price || 0,
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
  if (unitPrice === null || unitPrice === "") item.unitPrice = null;
  if (unitPrice !== undefined && unitPrice !== null && unitPrice !== "" && Number.isFinite(Number(unitPrice)) && Number(unitPrice) >= 0) item.unitPrice = Number(Number(unitPrice).toFixed(2));
  const matchedProduct = productFor(item.name, store.products);
  item.category = matchedProduct?.category || categoryFor(item.name);
  if (unitPrice === undefined) item.unitPrice = matchedProduct?.price || item.unitPrice || null;
  item.productId = matchedProduct?.id || item.productId || null;
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
  const candidates = store.items
    .filter((item) => !item.completed)
    .map((item) => ({ ...item, estimatedCost: item.unitPrice == null ? null : Number((item.quantity * item.unitPrice).toFixed(2)) }))
    .sort((left, right) => priorityWeight[right.priority] - priorityWeight[left.priority] || left.estimatedCost - right.estimatedCost);
  let remaining = store.budget.monthly;
  const buyNow = [];
  const defer = [];
  for (const item of candidates) {
    if (item.estimatedCost === null) {
      defer.push(item);
    } else if (!store.budget.monthly || item.estimatedCost <= remaining) {
      buyNow.push(item);
      remaining = Math.max(0, remaining - item.estimatedCost);
    } else {
      defer.push(item);
    }
  }
  response.json({ monthlyBudget: store.budget.monthly, plannedSpend: Number((store.budget.monthly - remaining).toFixed(2)), remaining: Number(remaining.toFixed(2)), buyNow, defer });
});

app.listen(port, () => {
  console.log(`Voxie API running at http://localhost:${port}`);
});
