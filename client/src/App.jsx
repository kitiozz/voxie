import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const languages = ["English", "Español", "Français", "हिंदी", "Deutsch"];
const languageCodes = { English: "en-US", Español: "es-ES", Français: "fr-FR", हिंदी: "hi-IN", Deutsch: "de-DE" };
const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function productIllustration(name, category = "") {
  const value = name.toLowerCase();
  if (/\b(milk|cheese|yogurt|butter)\b/.test(value)) return { emoji: "🥛", tone: "mint" };
  if (/\bmango(?:es)?\b/.test(value)) return { emoji: "🥭", tone: "peach" };
  if (/\bapple(?:s)?\b/.test(value)) return { emoji: "🍎", tone: "peach" };
  if (/\borange(?:s)?\b/.test(value)) return { emoji: "🍊", tone: "peach" };
  if (/\bbanana(?:s)?\b/.test(value)) return { emoji: "🍌", tone: "butter" };
  if (/\bwater\b/.test(value)) return { emoji: "💧", tone: "sky" };
  if (/\bjuice\b/.test(value)) return { emoji: "🧃", tone: "sky" };
  if (/\bcoffee\b/.test(value)) return { emoji: "☕", tone: "butter" };
  if (/\btea\b/.test(value)) return { emoji: "🍵", tone: "mint" };
  if (/\bsoda\b/.test(value)) return { emoji: "🥤", tone: "sky" };
  if (/\bbread|bakery\b/.test(value)) return { emoji: "🍞", tone: "butter" };
  if (/\btoothpaste\b/.test(value)) return { emoji: "🪥", tone: "lilac" };
  if (/\bsoap\b/.test(value)) return { emoji: "🧼", tone: "lilac" };
  if (/\bshampoo\b/.test(value)) return { emoji: "🧴", tone: "lilac" };
  if (/\beggs?\b/.test(value)) return { emoji: "🥚", tone: "butter" };
  if (/\bchips?\b/.test(value)) return { emoji: "🍟", tone: "pink" };
  if (/\bcookie|snack\b/.test(value)) return { emoji: "🍪", tone: "pink" };
  if (/\bchocolate\b/.test(value)) return { emoji: "🍫", tone: "pink" };
  if (/\bpopcorn\b/.test(value)) return { emoji: "🍿", tone: "butter" };
  if (category === "Produce") return { emoji: "🥬", tone: "mint" };
  if (category === "Dairy") return { emoji: "🥛", tone: "mint" };
  if (category === "Beverages") return { emoji: "🥤", tone: "sky" };
  if (category === "Bakery") return { emoji: "🍞", tone: "butter" };
  if (category === "Personal Care") return { emoji: "🧴", tone: "lilac" };
  if (category === "Snacks") return { emoji: "🍪", tone: "pink" };
  return { emoji: "🛒", tone: "mint" };
}

function MicrophoneIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" /><path d="M8 21h8" /></svg>;
}

function parseCommand(raw) {
  const text = raw.trim().toLowerCase();
  const priceMatch = text.match(/(?:under|below|less than)\s*\$?\s*(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)/);
  const price = priceMatch ? Number(priceMatch[1]) || numberWords[priceMatch[1]] : undefined;
  if (/^(find|search|show)/.test(text)) {
    return { intent: "search", query: text.replace(/^(find|search|show)\s+(for\s+)?/, "").replace(/\borganic\b/g, "").replace(/(?:under|below|less than)\s*\$?\s*(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+dollars?)?/g, "").trim(), organic: /organic/.test(text), maxPrice: price };
  }
  if (/^(remove|delete|take off)/.test(text)) return { intent: "remove", name: text.replace(/^(remove|delete|take off)\s+/, "").replace(/\s+from (my )?list$/, "").trim() };
  const match = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  const quantity = match ? Number(match[1]) || numberWords[match[1]] : 1;
  const name = text.replace(/^(add|buy|i want|i need|need|get|put)\s+/, "").replace(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, "").replace(/\b(bottles?|packs?|pieces?|items?)\s+of\s+/g, "").replace(/\s+to (my )?list$/, "").trim();
  return { intent: "add", name: name || raw.trim(), quantity };
}

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [command, setCommand] = useState("");
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [products, setProducts] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [voiceMessage, setVoiceMessage] = useState("Ready for your shopping command.");

  useEffect(() => {
    Promise.all([fetch(`${API_URL}/items`), fetch(`${API_URL}/suggestions`)]).then(async ([itemResponse, suggestionResponse]) => {
      if (!itemResponse.ok || !suggestionResponse.ok) throw new Error("API unavailable");
      setItems(await itemResponse.json());
      setSuggestions(await suggestionResponse.json());
    }).catch(() => setVoiceMessage("Start the backend server to save your shopping list.")).finally(() => setIsLoading(false));
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const refreshSuggestions = async () => { const response = await fetch(`${API_URL}/suggestions`); if (response.ok) setSuggestions(await response.json()); };

  async function addItem(name, quantity = 1) {
    if (!name?.trim()) return;
    const response = await fetch(`${API_URL}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, quantity }) });
    if (!response.ok) throw new Error("Could not add item");
    const item = await response.json();
    setItems((current) => [...current, item]);
    setProducts([]);
    setCommand("");
    await refreshSuggestions();
    setVoiceMessage(`Added ${item.quantity > 1 ? `${item.quantity} ` : ""}${item.name} to your list.`);
  }

  async function removeItem(name) {
    const item = items.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!item) { setVoiceMessage(`I could not find “${name}” on your list.`); return; }
    const response = await fetch(`${API_URL}/items/${item.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not remove item");
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setVoiceMessage(`Removed ${item.name} from your list.`);
  }

  async function updateItem(item, changes) {
    const response = await fetch(`${API_URL}/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    if (!response.ok) throw new Error("Could not update item");
    const updated = await response.json();
    setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  }

  async function searchProducts(filters) {
    const parameters = new URLSearchParams();
    if (filters.query) parameters.set("query", filters.query);
    if (filters.organic) parameters.set("organic", "true");
    if (filters.maxPrice) parameters.set("maxPrice", filters.maxPrice);
    const response = await fetch(`${API_URL}/products?${parameters}`);
    if (!response.ok) throw new Error("Could not search products");
    const result = await response.json();
    setProducts(result);
    setVoiceMessage(result.length ? `Found ${result.length} product${result.length === 1 ? "" : "s"}.` : "No products matched that search.");
  }

  async function executeCommand(value) {
    if (!value.trim()) return;
    setIsLoading(true);
    try {
      const action = parseCommand(value);
      if (action.intent === "search") await searchProducts(action);
      if (action.intent === "remove") await removeItem(action.name);
      if (action.intent === "add") await addItem(action.name, action.quantity);
    } catch { setVoiceMessage("Something went wrong. Please make sure the backend server is running."); }
    finally { setIsLoading(false); }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceMessage("Speech recognition is not supported here. Please use Chrome or Edge."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = languageCodes[selectedLanguage];
    recognition.continuous = false;
    recognition.interimResults = true;
    setRecognizedText(""); setIsRecording(true); setVoiceMessage("Listening... Speak your shopping command.");
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join("");
      setRecognizedText(transcript);
      if (event.results[event.results.length - 1].isFinal) { setIsRecording(false); setCommand(transcript); executeCommand(transcript); }
    };
    recognition.onerror = (event) => { setIsRecording(false); setVoiceMessage(event.error === "not-allowed" ? "Microphone access was blocked. Enable it in your browser settings." : `Voice error: ${event.error}. Please try again.`); };
    recognition.start();
  }

  return <main className="app">
    <section className="page-content">
      <header className="hero"><p className="eyebrow">VOICE SHOPPING ASSISTANT</p><h1>Voxie</h1><p className="intro">Say “add 2 bottles of water”, “remove milk” or “find toothpaste under $5”.</p><div className="language-list">{languages.map((language) => <button key={language} className={selectedLanguage === language ? "language active" : "language"} onClick={() => setSelectedLanguage(language)}>{language}</button>)}</div></header>
      <section className="summary-card"><p>{totalItems} {totalItems === 1 ? "item" : "items"} to buy</p><strong>~$0.00</strong><span> estimated</span></section>
      <p className="notice">{isLoading ? "Processing your request..." : `✦ ${voiceMessage}`}</p>
      <form className="command-row" onSubmit={(event) => { event.preventDefault(); executeCommand(command); }}><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Type or say a command..." aria-label="Shopping command" /><button className="add-button" aria-label="Submit command">+</button></form>
      <section className="list-section"><h2>Your list</h2>{items.length === 0 ? <div className="empty-list">Nothing here yet. Tap the mic and say what you need.</div> : <div className="item-list">{items.map((item) => { const visual = productIllustration(item.name, item.category); return <article className={`list-item ${item.completed ? "completed" : ""}`} key={item.id}><div className={`item-art ${visual.tone}`}>{visual.emoji}</div><button className="check-button" aria-label={`Mark ${item.name} complete`} onClick={() => updateItem(item, { completed: !item.completed })}>{item.completed ? "✓" : ""}</button><div className="item-copy"><strong>{item.name}</strong><p>{item.quantity} · {item.category}</p></div><div className="quantity-controls"><button aria-label={`Decrease ${item.name} quantity`} onClick={() => updateItem(item, { quantity: Math.max(1, item.quantity - 1) })}>−</button><span>{item.quantity}</span><button aria-label={`Increase ${item.name} quantity`} onClick={() => updateItem(item, { quantity: item.quantity + 1 })}>+</button></div><button className="remove-button" onClick={() => executeCommand(`remove ${item.name}`)}>Remove</button></article>; })}</div>}</section>
      <section className="suggestions"><h2>✦ Suggested for you</h2><div className="suggestion-list">{suggestions.map((item) => <button key={item} className="suggestion" onClick={() => executeCommand(`add ${item}`)}>+ {item}</button>)}</div></section>
      {products.length > 0 && <section className="results"><h2>Product matches</h2><div className="product-grid">{products.map((product) => { const visual = productIllustration(product.name, product.category); return <article className="product-card" key={product.id}><div className={`product-art ${visual.tone}`}>{visual.emoji}</div><p className="product-category">{product.category}</p><strong>{product.name}</strong><p>{product.brand} · {product.size}</p><div><span>${product.price.toFixed(2)}</span>{product.organic && <em>Organic</em>}</div><button onClick={() => executeCommand(`add ${product.name}`)}>Add to list</button></article>; })}</div></section>}
    </section>
    <footer className="mic-bar"><button className="mic-button" aria-label="Start voice command" onClick={startListening}><MicrophoneIcon /></button><p>Tap to speak</p></footer>
    {isRecording && <div className="recording-overlay"><section className="recording-card"><button className="close-recording" onClick={() => setIsRecording(false)} aria-label="Close recording">×</button><p className="live-transcript">{recognizedText || "Listening for your shopping command"}<span>...</span></p><div className="waveform" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><button className="recording-mic" onClick={startListening} aria-label="Listen again"><MicrophoneIcon /></button><p className="listening-label">Listening...</p></section></div>}
  </main>;
}

export default App;
