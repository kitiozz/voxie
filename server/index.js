const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 4000;
const storePath = path.join(__dirname, "data", "store.json");

app.use(cors());
app.use(express.json());

function readStore() {
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  store.items ??= [];
  store.history ??= [];
  store.products ??= [];
  store.budget ??= { monthly: 0 };
  return store;
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

app.get("/api/items", (_request, response) => {
  response.json(readStore().items);
});

app.post("/api/items", (request, response) => {
  const { name, quantity = 1, category, priority = "medium" } = request.body;
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

  const { name, quantity, completed, priority } = request.body;
  if (name !== undefined && String(name).trim()) item.name = String(name).trim();
  if (quantity !== undefined) item.quantity = Math.max(1, Number(quantity) || 1);
  if (completed !== undefined) item.completed = Boolean(completed);
  if (priority !== undefined && ["high", "medium", "low"].includes(priority)) item.priority = priority;
  const matchedProduct = productFor(item.name, store.products);
  item.category = matchedProduct?.category || categoryFor(item.name);
  item.unitPrice = matchedProduct?.price || item.unitPrice || 0;
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
    .map((item) => ({ ...item, estimatedCost: Number((item.quantity * (item.unitPrice || 0)).toFixed(2)) }))
    .sort((left, right) => priorityWeight[right.priority] - priorityWeight[left.priority] || left.estimatedCost - right.estimatedCost);
  let remaining = store.budget.monthly;
  const buyNow = [];
  const defer = [];
  for (const item of candidates) {
    if (!item.estimatedCost || !store.budget.monthly || item.estimatedCost <= remaining) {
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
