import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const languages = ["English", "Español", "Français", "हिंदी", "Deutsch"];
const languageCodes = { English: "en-US", Español: "es-ES", Français: "fr-FR", हिंदी: "hi-IN", Deutsch: "de-DE" };
const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function validateEmoji(value) {
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(String(value ?? ""))];
  return segments.length === 1 && /\p{Extended_Pictographic}/u.test(segments[0]) ? segments[0] : "🛒";
}

function MicrophoneIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" /><path d="M8 21h8" /></svg>;
}

async function parseCommand(raw) {
  const response = await fetch(`${API_URL}/parse-command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: raw }) });
  if (!response.ok) throw new Error("Could not parse command");
  return response.json();
}

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [command, setCommand] = useState("");
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [products, setProducts] = useState([]);
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [budgetPlan, setBudgetPlan] = useState({ monthlyBudget: 0, plannedSpend: 0, remaining: 0, buyNow: [], defer: [] });
  const [healthProfile, setHealthProfile] = useState({ goal: "balanced", notes: "" });
  const [wellnessPlan, setWellnessPlan] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [voiceMessage, setVoiceMessage] = useState("Ready for your shopping command.");
  const recognitionRef = useRef(null);

  useEffect(() => {
    Promise.all([fetch(`${API_URL}/items`), fetch(`${API_URL}/suggestions`), fetch(`${API_URL}/budget`), fetch(`${API_URL}/budget/plan`), fetch(`${API_URL}/health-profile`)]).then(async ([itemResponse, suggestionResponse, budgetResponse, planResponse, healthResponse]) => {
      if (!itemResponse.ok || !suggestionResponse.ok || !budgetResponse.ok || !planResponse.ok || !healthResponse.ok) throw new Error("API unavailable");
      setItems(await itemResponse.json());
      setSuggestions(await suggestionResponse.json());
      const budget = await budgetResponse.json();
      setMonthlyBudget(budget.monthly);
      setBudgetPlan(await planResponse.json());
      const profile = await healthResponse.json();
      setHealthProfile(profile);
      const wellnessResponse = await fetch(`${API_URL}/wellness-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      if (wellnessResponse.ok) setWellnessPlan(await wellnessResponse.json());
    }).catch(() => setVoiceMessage("Start the backend server to save your shopping list.")).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const estimatedTotal = items.reduce((sum, item) => sum + (item.unitPrice == null ? 0 : item.quantity * item.unitPrice), 0);
  const missingPriceCount = items.filter((item) => item.unitPrice == null).length;
  const refreshSuggestions = async () => { const response = await fetch(`${API_URL}/suggestions`); if (response.ok) setSuggestions(await response.json()); };
  const refreshBudgetPlan = async () => { const response = await fetch(`${API_URL}/budget/plan`); if (response.ok) setBudgetPlan(await response.json()); };

  async function updateHealthProfile(changes) {
    const nextProfile = { ...healthProfile, ...changes };
    setHealthProfile(nextProfile);
    const response = await fetch(`${API_URL}/health-profile`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextProfile) });
    if (!response.ok) throw new Error("Could not save health focus");
    const result = await response.json();
    setHealthProfile(result.profile);
    setWellnessPlan(result.plan);
  }

  async function updateBudget(value) {
    const monthly = Math.max(0, Number(value) || 0);
    const response = await fetch(`${API_URL}/budget`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly }) });
    if (!response.ok) throw new Error("Could not update budget");
    setMonthlyBudget(monthly);
    await refreshBudgetPlan();
  }

  async function addItem(name, quantity = 1, category, emoji) {
    if (!name?.trim()) return;
    const response = await fetch(`${API_URL}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, quantity, category, emoji: validateEmoji(emoji) }) });
    if (!response.ok) throw new Error("Could not add item");
    const item = await response.json();
    setItems((current) => [...current, item]);
    setProducts([]);
    setCommand("");
    await refreshSuggestions();
    await refreshBudgetPlan();
    setVoiceMessage(`Added ${item.quantity > 1 ? `${item.quantity} ` : ""}${item.name} to your list.`);
  }

  async function removeItem(name) {
    const item = items.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!item) { setVoiceMessage(`I could not find “${name}” on your list.`); return; }
    const response = await fetch(`${API_URL}/items/${item.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not remove item");
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    await refreshBudgetPlan();
    setVoiceMessage(`Removed ${item.name} from your list.`);
  }

  async function updateItem(item, changes) {
    const response = await fetch(`${API_URL}/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    if (!response.ok) throw new Error("Could not update item");
    const updated = await response.json();
    setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    await refreshBudgetPlan();
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
      if (action.intent === "remove") await removeItem(action.name || action.item);
      if (action.intent === "add") await addItem(action.item, action.quantity, action.category, action.emoji);
    } catch { setVoiceMessage("Something went wrong. Please make sure the backend server is running."); }
    finally { setIsLoading(false); }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceMessage("Speech recognition is not supported here. Please use Chrome or Edge."); return; }
    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = languageCodes[selectedLanguage];
    recognition.continuous = false;
    recognition.interimResults = true;
    setRecognizedText(""); setIsRecording(true); setVoiceMessage("Listening... Speak your shopping command.");
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join("");
      setRecognizedText(transcript);
      if (event.results[event.results.length - 1].isFinal) { setIsRecording(false); setCommand(transcript); recognitionRef.current = null; executeCommand(transcript); }
    };
    recognition.onerror = (event) => { setIsRecording(false); recognitionRef.current = null; const message = event.error === "not-allowed" ? "Microphone access was blocked. Enable it in your browser settings." : event.error === "network" ? "Speech recognition could not reach the browser voice service. Check your connection or use the text box." : `Voice error: ${event.error}. Please try again.`; setVoiceMessage(message); };
    recognition.onend = () => { setIsRecording(false); recognitionRef.current = null; };
    try { recognition.start(); } catch { setIsRecording(false); recognitionRef.current = null; setVoiceMessage("The microphone is already starting. Please try again."); }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setVoiceMessage("Voice input cancelled.");
  }

  return <main className="app">
    <section className="page-content">
      <header className="hero"><p className="eyebrow">VOICE SHOPPING ASSISTANT</p><h1>Voxie</h1><p className="intro">Say “add 2 bottles of water”, “remove milk” or “find toothpaste under $5”.</p><div className="language-list">{languages.map((language) => <button key={language} className={selectedLanguage === language ? "language active" : "language"} onClick={() => setSelectedLanguage(language)}>{language}</button>)}</div></header>
      <section className="summary-card"><p>{totalItems} {totalItems === 1 ? "item" : "items"} to buy</p><strong>~${estimatedTotal.toFixed(2)}</strong><span>{missingPriceCount ? `${missingPriceCount} price${missingPriceCount === 1 ? "" : "s"} needed` : "estimated"}</span></section>
      <p className="notice">{isLoading ? "Processing your request..." : `✦ ${voiceMessage}`}</p>
      <section className="budget-card"><div><p className="section-kicker">MONTHLY PLAN</p><h2>Set your grocery budget</h2><p className="budget-copy">Voxie will protect essentials first and defer lower-priority items when needed.</p></div><label className="budget-input"><span>$</span><input type="number" min="0" step="1" value={monthlyBudget || ""} onChange={(event) => updateBudget(event.target.value).catch(() => setVoiceMessage("Could not update your budget."))} placeholder="0" aria-label="Monthly grocery budget" /></label><div className="budget-stats"><span><strong>${budgetPlan.plannedSpend.toFixed(2)}</strong> planned</span><span><strong>${budgetPlan.remaining.toFixed(2)}</strong> remaining</span></div></section>
      <form className="command-row" onSubmit={(event) => { event.preventDefault(); executeCommand(command); }}><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Type or say a command..." aria-label="Shopping command" /><button className="add-button" aria-label="Submit command">+</button></form>
      <section className="list-section"><h2>Your list</h2>{items.length === 0 ? <div className="empty-list">Nothing here yet. Tap the mic and say what you need.</div> : <div className="item-list">{items.map((item) => { const emoji = validateEmoji(item.emoji); return <article className={`list-item ${item.completed ? "completed" : ""}`} key={item.id}><div className="item-art mint">{emoji}</div><button className="check-button" aria-label={`Mark ${item.name} complete`} onClick={() => updateItem(item, { completed: !item.completed })}>{item.completed ? "✓" : ""}</button><div className="item-copy"><strong>{item.name}</strong><p>{item.quantity} · {item.category}</p><label className="price-editor"><span>Unit price</span><div><b>$</b><input type="number" min="0" step="0.01" value={item.unitPrice ?? ""} placeholder="Price" aria-label={`Set price for ${item.name}`} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, unitPrice: event.target.value } : entry))} onBlur={(event) => updateItem(item, { unitPrice: event.target.value === "" ? null : Number(event.target.value) }).catch(() => setVoiceMessage("Could not save that price."))} /></div></label></div><div className="item-actions"><select value={item.priority || "medium"} aria-label={`Set necessity for ${item.name}`} onChange={(event) => updateItem(item, { priority: event.target.value })}><option value="high">Essential</option><option value="medium">Useful</option><option value="low">Can wait</option></select><div className="quantity-controls"><button aria-label={`Decrease ${item.name} quantity`} onClick={() => updateItem(item, { quantity: Math.max(1, item.quantity - 1) })}>−</button><span>{item.quantity}</span><button aria-label={`Increase ${item.name} quantity`} onClick={() => updateItem(item, { quantity: item.quantity + 1 })}>+</button></div></div><button className="remove-button" onClick={() => executeCommand(`remove ${item.name}`)}>Remove</button></article>; })}</div>}</section>
      <section className="planner-section"><div className="planner-heading"><div><p className="section-kicker">AI PRIORITY PLAN</p><h2>What to buy first</h2></div><span>{budgetPlan.defer.length ? `${budgetPlan.defer.length} deferred` : "All covered"}</span></div>{budgetPlan.buyNow.length === 0 && budgetPlan.defer.length === 0 ? <p className="planner-empty">Add groceries and set a budget to create your plan.</p> : <div className="plan-columns"><div><h3>Buy first</h3>{budgetPlan.buyNow.length ? budgetPlan.buyNow.map((item) => <div className="plan-item" key={`buy-${item.id}`}><span>{validateEmoji(item.emoji)}</span><div><strong>{item.name}</strong><small>{item.priority === "high" ? "Essential" : "Within budget"}</small></div><b>{item.estimatedCost == null ? "Price needed" : `$${item.estimatedCost.toFixed(2)}`}</b></div>) : <p className="planner-empty">Nothing selected yet.</p>}</div><div><h3>Defer</h3>{budgetPlan.defer.length ? budgetPlan.defer.map((item) => <div className="plan-item deferred" key={`defer-${item.id}`}><span>{validateEmoji(item.emoji)}</span><div><strong>{item.name}</strong><small>{item.estimatedCost == null ? "Add a price to include it" : "Lower priority or over budget"}</small></div><b>{item.estimatedCost == null ? "Price needed" : `$${item.estimatedCost.toFixed(2)}`}</b></div>) : <p className="planner-empty">Nothing needs to wait.</p>}</div></div>}</section>
      <section className="wellness-card"><div className="wellness-heading"><div><p className="section-kicker">WELLNESS MODE</p><h2>Shop for your health focus</h2><p className="budget-copy">Choose a goal and Voxie will shape a grocery starting point around it.</p></div><span className="wellness-mark">Careful choices</span></div><div className="health-goals">{[["balanced", "Balanced"], ["weight_loss", "Weight-aware"], ["blood_sugar", "Blood-sugar aware"], ["iron", "Iron focus"], ["protein", "Higher protein"]].map(([goal, label]) => <button key={goal} className={healthProfile.goal === goal ? "health-goal active" : "health-goal"} onClick={() => updateHealthProfile({ goal }).catch(() => setVoiceMessage("Could not save your health focus."))}>{label}</button>)}</div><label className="health-notes"><span>Anything else to consider?</span><textarea value={healthProfile.notes} onChange={(event) => setHealthProfile((current) => ({ ...current, notes: event.target.value }))} onBlur={() => updateHealthProfile({ notes: healthProfile.notes }).catch(() => setVoiceMessage("Could not save your notes."))} placeholder="Example: vegetarian, food allergy, family preferences" maxLength="500" /></label>{wellnessPlan && <div className="wellness-result"><div><h3>{wellnessPlan.title}</h3><p>{wellnessPlan.guidance}</p></div><div className="wellness-groceries">{wellnessPlan.groceries.map((grocery) => <button key={grocery.name} className="wellness-item" onClick={() => executeCommand(`add ${grocery.name}`)}><strong>{grocery.name}</strong><small>{grocery.reason}</small><span>+ Add</span></button>)}</div><p className="health-safety">{wellnessPlan.safety}</p></div>}</section>
      <section className="suggestions"><h2>✦ Suggested for you</h2><div className="suggestion-list">{suggestions.map((item) => <button key={item} className="suggestion" onClick={() => executeCommand(`add ${item}`)}>+ {item}</button>)}</div></section>
      {products.length > 0 && <section className="results"><h2>Product matches</h2><div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}><div className="product-art mint">{validateEmoji(product.emoji)}</div><p className="product-category">{product.category}</p><strong>{product.name}</strong><p>{product.brand} · {product.size}</p><div><span>${product.price.toFixed(2)}</span>{product.organic && <em>Organic</em>}</div><button onClick={() => executeCommand(`add ${product.name}`)}>Add to list</button></article>)}</div></section>}
    </section>
    <footer className="mic-bar"><button className="mic-button" aria-label="Start voice command" onClick={startListening}><MicrophoneIcon /></button><p>Tap to speak</p></footer>
    {isRecording && <div className="recording-overlay"><section className="recording-card"><button className="close-recording" onClick={stopListening} aria-label="Close recording">×</button><p className="live-transcript">{recognizedText || "Listening for your shopping command"}<span>...</span></p><div className="waveform" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><button className="recording-mic" onClick={stopListening} aria-label="Stop listening"><MicrophoneIcon /></button><p className="listening-label">Listening...</p></section></div>}
  </main>;
}

export default App;
