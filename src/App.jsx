import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const languages = ["English", "Español", "Français", "हिंदी", "Deutsch"];
const languageCodes = { English: "en-US", Español: "es-ES", Français: "fr-FR", हिंदी: "hi-IN", Deutsch: "de-DE" };
const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function validateEmoji(value) {
  if (!value) return "🛒";
  const str = String(value).trim();
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str)];
  const char = segments[0]?.segment;
  return segments.length === 1 && char && /\p{Extended_Pictographic}/u.test(char) ? char : "🛒";
}

function MicrophoneIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" /><path d="M8 21h8" /></svg>;
}

function triggerHaptic(pattern) {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

function playAudioChime(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    gain.gain.setValueAtTime(0.08, now);

    if (type === "add") {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.14); // G5
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === "remove") {
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(392.00, now + 0.16); // G4
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "listen") {
      osc.frequency.setValueAtTime(440, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  } catch {
    // AudioContext blocked or not allowed
  }
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
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("All");
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [budgetPlan, setBudgetPlan] = useState({ monthlyBudget: 0, plannedSpend: 0, remaining: 0, buyNow: [], defer: [] });
  const [healthProfile, setHealthProfile] = useState({ goal: "balanced", notes: "" });
  const [wellnessPlan, setWellnessPlan] = useState(null);
  const [cartNutrition, setCartNutrition] = useState(null);
  const [isAnalyzingNutrition, setIsAnalyzingNutrition] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [voiceMessage, setVoiceMessage] = useState("Ready for your shopping command.");
  const [voiceFeedback, setVoiceFeedback] = useState(null);
  const [highlightedItemId, setHighlightedItemId] = useState(null);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const recognitionRef = useRef(null);
  const feedbackTimerRef = useRef(null);

  useEffect(() => {
    Promise.all([fetch(`${API_URL}/items`), fetch(`${API_URL}/suggestions`), fetch(`${API_URL}/budget`), fetch(`${API_URL}/budget/plan`)]).then(async ([itemResponse, suggestionResponse, budgetResponse, planResponse]) => {
      if (!itemResponse.ok || !suggestionResponse.ok || !budgetResponse.ok || !planResponse.ok) throw new Error("API unavailable");
      const loadedItems = await itemResponse.json();
      setItems(loadedItems);
      setSuggestions(await suggestionResponse.json());
      const budget = await budgetResponse.json();
      setMonthlyBudget(budget.monthly);
      setBudgetPlan(await planResponse.json());
    }).catch(() => setVoiceMessage("Start the backend server to save your shopping list.")).finally(() => setIsLoading(false));
    Promise.all([fetch(`${API_URL}/health-profile`)]).then(async ([healthResponse]) => {
      if (!healthResponse.ok) return;
      const profile = await healthResponse.json();
      setHealthProfile(profile);
      const wellnessResponse = await fetch(`${API_URL}/wellness-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      if (wellnessResponse.ok) setWellnessPlan(await wellnessResponse.json());
    }).catch(() => {});
  }, []);

  // Refresh cart nutrition whenever items or health profile changes
  useEffect(() => {
    let isMounted = true;
    setIsAnalyzingNutrition(true);
    fetch(`${API_URL}/cart-nutrition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, profile: healthProfile }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) setCartNutrition(data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsAnalyzingNutrition(false);
      });
    return () => {
      isMounted = false;
    };
  }, [items, healthProfile]);

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

  function showVisualFeedback(feedback) {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setVoiceFeedback(feedback);
    feedbackTimerRef.current = setTimeout(() => {
      setVoiceFeedback(null);
    }, 4200);
  }

  async function addItem(name, quantity = 1, category, emoji, priority = "medium", unitPrice) {
    if (!name?.trim()) return;
    const response = await fetch(`${API_URL}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, quantity, category, emoji: validateEmoji(emoji), priority, unitPrice })
    });
    if (!response.ok) throw new Error("Could not add item");
    const item = await response.json();
    setItems((current) => [...current, item]);
    setProducts([]);
    setCommand("");
    await refreshSuggestions();
    await refreshBudgetPlan();

    // Haptic & Visual Feedback
    if (hapticsEnabled) triggerHaptic([40, 50, 45]);
    if (soundEnabled) playAudioChime("add");
    setHighlightedItemId(item.id);
    setTimeout(() => setHighlightedItemId(null), 3800);

    const message = `Added ${item.quantity > 1 ? `${item.quantity}x ` : ""}${item.name} to your list.`;
    setVoiceMessage(message);
    showVisualFeedback({
      type: "add",
      title: "Item Added",
      detail: `${item.quantity > 1 ? `${item.quantity}x ` : ""}${item.name}`,
      emoji: validateEmoji(item.emoji),
      category: item.category,
      priority: item.priority || "medium"
    });
  }

  async function removeItem(name) {
    const rawTarget = String(name || "").trim().toLowerCase();
    const item = items.find((entry) => {
      const entryName = entry.name.toLowerCase();
      return entryName === rawTarget || entryName.includes(rawTarget) || rawTarget.includes(entryName);
    });

    if (!item) {
      if (hapticsEnabled) triggerHaptic([80, 40, 80]);
      setVoiceMessage(`I could not find “${name}” on your list.`);
      showVisualFeedback({
        type: "error",
        title: "Not Found",
        detail: `Could not find “${name}” on your list.`,
        emoji: "🔍"
      });
      return;
    }

    const response = await fetch(`${API_URL}/items/${item.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not remove item");
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    await refreshBudgetPlan();

    // Haptic & Visual Feedback
    if (hapticsEnabled) triggerHaptic([60, 40]);
    if (soundEnabled) playAudioChime("remove");

    const message = `Removed ${item.name} from your list.`;
    setVoiceMessage(message);
    showVisualFeedback({
      type: "remove",
      title: "Item Removed",
      detail: `${item.name}`,
      emoji: validateEmoji(item.emoji),
      category: item.category
    });
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
    if (hapticsEnabled) triggerHaptic([30, 40]);
    const message = result.length ? `Found ${result.length} product${result.length === 1 ? "" : "s"} for "${filters.query || 'search'}".` : "No products matched that search.";
    setVoiceMessage(message);
    showVisualFeedback({
      type: "search",
      title: "Products Searched",
      detail: result.length ? `Found ${result.length} matches for "${filters.query || 'search'}"` : `No matches found for "${filters.query}"`,
      emoji: "🔍"
    });
  }

  async function executeCommand(value) {
    if (!value.trim()) return;
    setIsLoading(true);
    try {
      const action = await parseCommand(value);
      if (action.intent === "search") await searchProducts(action);
      if (action.intent === "remove") await removeItem(action.name || action.item);
      if (action.intent === "add") await addItem(action.item, action.quantity, action.category, action.emoji, action.priority, action.unitPrice);
    } catch {
      if (hapticsEnabled) triggerHaptic([80, 40, 80]);
      setVoiceMessage("Something went wrong. Please make sure the backend server is running.");
    }
    finally { setIsLoading(false); }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage("Speech recognition is not supported in this browser. Please use Chrome, Edge, or type your command below.");
      return;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    if (hapticsEnabled) triggerHaptic([30]);
    if (soundEnabled) playAudioChime("listen");

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = languageCodes[selectedLanguage] || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    setRecognizedText("");
    setIsRecording(true);
    setVoiceMessage("Listening... Speak your shopping command.");

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join("");
      setRecognizedText(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        setIsRecording(false);
        setCommand(transcript);
        recognitionRef.current = null;
        executeCommand(transcript);
      }
    };

    recognition.onerror = (event) => {
      setIsRecording(false);
      recognitionRef.current = null;
      if (hapticsEnabled) triggerHaptic([80, 40, 80]);
      let message = `Voice error: ${event.error}. Please try again.`;
      if (event.error === "not-allowed") {
        message = "Microphone access was blocked. Please click the camera/mic icon in your address bar to allow access.";
      } else if (event.error === "no-speech") {
        message = "No speech was heard. Tap the microphone and try speaking again.";
      } else if (event.error === "audio-capture") {
        message = "No microphone was found. Please ensure a microphone is connected.";
      } else if (event.error === "network") {
        message = "Speech recognition network error. Please check your connection or type in the box.";
      }
      setVoiceMessage(message);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setIsRecording(false);
      recognitionRef.current = null;
      setVoiceMessage("Microphone could not start. Please try again.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setVoiceMessage("Voice input cancelled.");
  }

  return <main className="app">
    <section className="page-content">
      <header className="hero">
        <div className="hero-top-row">
          <p className="eyebrow">VOICE SHOPPING ASSISTANT</p>
          <div className="feedback-toggles">
            <button
              className={`toggle-pill ${hapticsEnabled ? "active" : ""}`}
              onClick={() => {
                const next = !hapticsEnabled;
                setHapticsEnabled(next);
                if (next) triggerHaptic([30, 40]);
              }}
              title="Toggle haptic vibration feedback"
              aria-label="Toggle haptic vibration"
            >
              📳 {hapticsEnabled ? "Haptics On" : "Haptics Off"}
            </button>
            <button
              className={`toggle-pill ${soundEnabled ? "active" : ""}`}
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playAudioChime("listen");
              }}
              title="Toggle audio feedback chimes"
              aria-label="Toggle sound chimes"
            >
              🔔 {soundEnabled ? "Sound On" : "Sound Off"}
            </button>
          </div>
        </div>
        <h1>Voxie</h1>
        <p className="intro">Say “add 2 bottles of water”, “remove milk” or “find toothpaste under $5”.</p>
        <div className="language-list">{languages.map((language) => <button key={language} className={selectedLanguage === language ? "language active" : "language"} onClick={() => setSelectedLanguage(language)}>{language}</button>)}</div>
      </header>

      {voiceFeedback && (
        <aside className={`voice-feedback-hud ${voiceFeedback.type}`} role="status" aria-live="polite">
          <div className="hud-icon-wrap">{voiceFeedback.emoji}</div>
          <div className="hud-content">
            <div className="hud-header">
              <span className={`hud-badge badge-${voiceFeedback.type}`}>
                {voiceFeedback.type === "add" ? "✓ Voice Added" : voiceFeedback.type === "remove" ? "✕ Voice Removed" : voiceFeedback.type === "search" ? "🔍 Searched" : "✦ Voice Info"}
              </span>
              {voiceFeedback.priority && <span className={`hud-priority priority-${voiceFeedback.priority}`}>{voiceFeedback.priority}</span>}
            </div>
            <strong>{voiceFeedback.detail}</strong>
          </div>
          <button className="hud-close" onClick={() => setVoiceFeedback(null)} aria-label="Dismiss feedback">×</button>
        </aside>
      )}

      <section className="summary-card"><p>{totalItems} {totalItems === 1 ? "item" : "items"} to buy</p><strong>~${estimatedTotal.toFixed(2)}</strong><span>{missingPriceCount ? `${missingPriceCount} price${missingPriceCount === 1 ? "" : "s"} needed` : "estimated"}</span></section>
      <p className="notice">{isLoading ? "Processing your request..." : `✦ ${voiceMessage}`}</p>
      <section className="budget-card"><div><p className="section-kicker">MONTHLY PLAN</p><h2>Set your grocery budget</h2><p className="budget-copy">Voxie will protect essentials first and defer lower-priority items when needed.</p></div><label className="budget-input"><span>$</span><input type="number" min="0" step="1" value={monthlyBudget || ""} onChange={(event) => updateBudget(event.target.value).catch(() => setVoiceMessage("Could not update your budget."))} placeholder="0" aria-label="Monthly grocery budget" /></label><div className="budget-stats"><span><strong>${budgetPlan.plannedSpend.toFixed(2)}</strong> planned</span><span><strong>${budgetPlan.remaining.toFixed(2)}</strong> remaining</span></div></section>
      <form className="command-row" onSubmit={(event) => { event.preventDefault(); executeCommand(command); }}><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Type or say a command..." aria-label="Shopping command" /><button className="add-button" aria-label="Submit command">+</button></form>
      <section className="list-section">
        <div className="list-header-row">
          <div>
            <h2>Your list</h2>
            <p className="list-subtitle">
              {totalItems} {totalItems === 1 ? "item" : "items"} &bull; {items.filter((i) => i.completed).length} checked
            </p>
          </div>
          {items.length > 0 && (
            <div className="list-quick-actions">
              <button
                className="clear-completed-btn"
                onClick={() => {
                  const completedItems = items.filter((i) => i.completed);
                  completedItems.forEach((i) => removeItem(i.name));
                }}
                disabled={!items.some((i) => i.completed)}
              >
                Clear checked
              </button>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="list-progress-bar-wrap" title={`${Math.round((items.filter((i) => i.completed).length / items.length) * 100 || 0)}% completed`}>
            <div
              className="list-progress-fill"
              style={{ width: `${(items.filter((i) => i.completed).length / items.length) * 100 || 0}%` }}
            />
          </div>
        )}

        {items.length > 0 && (
          <div className="category-filter-chips">
            {["All", "Produce", "Dairy", "Bakery", "Beverages", "Snacks", "Household"].map((cat) => {
              const count = cat === "All" ? items.length : items.filter((i) => i.category?.toLowerCase() === cat.toLowerCase()).length;
              if (count === 0 && cat !== "All") return null;
              return (
                <button
                  key={cat}
                  className={`filter-chip ${activeCategoryFilter === cat ? "active" : ""}`}
                  onClick={() => setActiveCategoryFilter(cat)}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-list interactive-empty">
            <span className="empty-sparkle">🧺</span>
            <h3>Your list is clean and empty</h3>
            <p>Tap the mic or choose a quick grocery item to get started:</p>
            <div className="quick-add-starters">
              {["🍎 Gala Apples", "🥛 Whole Milk", "🍞 Wheat Bread", "🥚 Farm Eggs", "🥑 Avocados", "🥬 Spinach"].map((itemStr) => (
                <button
                  key={itemStr}
                  className="quick-starter-pill"
                  onClick={() => executeCommand(`add ${itemStr.replace(/^[^\s]+\s*/, "")}`)}
                >
                  + {itemStr}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="item-list">
            {items
              .filter((item) => activeCategoryFilter === "All" || item.category?.toLowerCase() === activeCategoryFilter.toLowerCase())
              .map((item) => {
                const emoji = validateEmoji(item.emoji);
                const isHighlighted = highlightedItemId === item.id;
                return (
                  <article className={`list-item ${item.completed ? "completed" : ""} ${isHighlighted ? "voice-highlighted" : ""}`} key={item.id}>
                    <div className="item-art mint">{emoji}</div>
                    <button
                      className="check-button"
                      aria-label={`Mark ${item.name} complete`}
                      onClick={() => {
                        if (hapticsEnabled) triggerHaptic([35]);
                        updateItem(item, { completed: !item.completed });
                      }}
                    >
                      {item.completed ? "✓" : ""}
                    </button>
                    <div className="item-copy">
                      <strong>{item.name}</strong>
                      <p>{item.quantity} &middot; {item.category}</p>
                      <label className="price-editor">
                        <span>Unit price</span>
                        <div>
                          <b>$</b>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice ?? ""}
                            placeholder="Price"
                            aria-label={`Set price for ${item.name}`}
                            onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, unitPrice: event.target.value } : entry))}
                            onBlur={(event) => updateItem(item, { unitPrice: event.target.value === "" ? null : Number(event.target.value) }).catch(() => setVoiceMessage("Could not save that price."))}
                          />
                        </div>
                      </label>
                    </div>
                    <div className="item-actions">
                      <select value={item.priority || "medium"} aria-label={`Set necessity for ${item.name}`} onChange={(event) => updateItem(item, { priority: event.target.value })}>
                        <option value="high">Essential</option>
                        <option value="medium">Useful</option>
                        <option value="low">Can wait</option>
                      </select>
                      <div className="quantity-controls">
                        <button aria-label={`Decrease ${item.name} quantity`} onClick={() => updateItem(item, { quantity: Math.max(1, item.quantity - 1) })}>−</button>
                        <span>{item.quantity}</span>
                        <button aria-label={`Increase ${item.name} quantity`} onClick={() => updateItem(item, { quantity: item.quantity + 1 })}>+</button>
                      </div>
                    </div>
                    <button className="remove-button" onClick={() => executeCommand(`remove ${item.name}`)}>Remove</button>
                  </article>
                );
              })}
          </div>
        )}
      </section>
      <section className="planner-section"><div className="planner-heading"><div><p className="section-kicker">AI PRIORITY PLAN</p><h2>What to buy first</h2></div><span>{budgetPlan.defer.length ? `${budgetPlan.defer.length} deferred` : "All covered"}</span></div>{budgetPlan.buyNow.length === 0 && budgetPlan.defer.length === 0 ? <p className="planner-empty">Add groceries and set a budget to create your plan.</p> : <div className="plan-columns"><div><h3>Buy first</h3>{budgetPlan.buyNow.length ? budgetPlan.buyNow.map((item) => <div className="plan-item" key={`buy-${item.id}`}><span>{validateEmoji(item.emoji)}</span><div><strong>{item.name}</strong><small>{item.priority === "high" ? "Essential" : "Within budget"}</small></div><b>{item.estimatedCost == null ? "Price needed" : `$${item.estimatedCost.toFixed(2)}`}</b></div>) : <p className="planner-empty">Nothing selected yet.</p>}</div><div><h3>Defer</h3>{budgetPlan.defer.length ? budgetPlan.defer.map((item) => <div className="plan-item deferred" key={`defer-${item.id}`}><span>{validateEmoji(item.emoji)}</span><div><strong>{item.name}</strong><small>{item.estimatedCost == null ? "Add a price to include it" : "Lower priority or over budget"}</small></div><b>{item.estimatedCost == null ? "Price needed" : `$${item.estimatedCost.toFixed(2)}`}</b></div>) : <p className="planner-empty">Nothing needs to wait.</p>}</div></div>}</section>
      <section className="cart-nutrition-card">
        <div className="nutrition-heading">
          <div>
            <p className="section-kicker">NUTRITION & WELLNESS ADVICE</p>
            <h2>Your Cart Nutritional Balance</h2>
            <p className="nutrition-subtitle">Real-time dietary guidance based on the {items.length} {items.length === 1 ? "item" : "items"} currently in your grocery basket.</p>
          </div>
          {cartNutrition?.score && <span className="nutrition-score-badge">{cartNutrition.score}</span>}
        </div>

        {isAnalyzingNutrition && <div className="nutrition-analyzing"><span>✦</span> Analyzing basket nutrition...</div>}

        {cartNutrition && (
          <div className="nutrition-content">
            <div className="nutrition-summary-box">
              <p className="nutrition-summary-text">{cartNutrition.summary}</p>
            </div>

            {cartNutrition.breakdown && (
              <div className="nutrition-groups-grid">
                {cartNutrition.breakdown.map((group) => (
                  <div className={`nutrition-group-pill ${group.count > 0 ? "has-items" : "empty-group"}`} key={group.group}>
                    <span className="group-icon">{group.icon}</span>
                    <div className="group-info">
                      <strong>{group.group}</strong>
                      <small>{group.count} in basket</small>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cartNutrition.highlights && cartNutrition.highlights.length > 0 && (
              <div className="nutrition-highlights">
                <h3>Nutritional Strengths</h3>
                <ul>
                  {cartNutrition.highlights.map((highlight, idx) => (
                    <li key={idx}><span>✓</span> {highlight}</li>
                  ))}
                </ul>
              </div>
            )}

            {cartNutrition.goalAlignment && (
              <div className="nutrition-goal-box">
                <div className="goal-tag">Goal Alignment · {healthProfile.goal.replace("_", " ")}</div>
                <p>{cartNutrition.goalAlignment}</p>
              </div>
            )}

            {cartNutrition.recommendations && cartNutrition.recommendations.length > 0 && (
              <div className="nutrition-recommendations">
                <div className="rec-header">
                  <h3>Recommended Additions</h3>
                  <small>Fill nutritional gaps</small>
                </div>
                <div className="rec-grid">
                  {cartNutrition.recommendations.map((rec) => (
                    <button
                      key={rec.name}
                      className="rec-card"
                      onClick={() => executeCommand(`add ${rec.name}`)}
                      aria-label={`Add ${rec.name} to list`}
                    >
                      <span className="rec-emoji">{validateEmoji(rec.emoji)}</span>
                      <div className="rec-details">
                        <strong>{rec.name}</strong>
                        <p>{rec.reason}</p>
                      </div>
                      <span className="rec-add-label">+ Add</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      <section className="wellness-card"><div className="wellness-heading"><div><p className="section-kicker">WELLNESS MODE</p><h2>Shop for your health focus</h2><p className="budget-copy">Choose a goal and Voxie will shape a grocery starting point around it.</p></div><span className="wellness-mark">Careful choices</span></div><div className="health-goals">{[["balanced", "Balanced"], ["weight_loss", "Weight-aware"], ["blood_sugar", "Blood-sugar aware"], ["iron", "Iron focus"], ["protein", "Higher protein"]].map(([goal, label]) => <button key={goal} className={healthProfile.goal === goal ? "health-goal active" : "health-goal"} onClick={() => updateHealthProfile({ goal }).catch(() => setVoiceMessage("Could not save your health focus."))}>{label}</button>)}</div><label className="health-notes"><span>Anything else to consider?</span><textarea value={healthProfile.notes} onChange={(event) => setHealthProfile((current) => ({ ...current, notes: event.target.value }))} onBlur={() => updateHealthProfile({ notes: healthProfile.notes }).catch(() => setVoiceMessage("Could not save your notes."))} placeholder="Example: vegetarian, food allergy, family preferences" maxLength="500" /></label>{wellnessPlan && <div className="wellness-result"><div><h3>{wellnessPlan.title}</h3><p>{wellnessPlan.guidance}</p></div><div className="wellness-groceries">{wellnessPlan.groceries.map((grocery) => <button key={grocery.name} className="wellness-item" onClick={() => executeCommand(`add ${grocery.name}`)}><strong>{grocery.name}</strong><small>{grocery.reason}</small><span>+ Add</span></button>)}</div><p className="health-safety">{wellnessPlan.safety}</p></div>}</section>
      <section className="suggestions"><h2>✦ Suggested for you</h2><div className="suggestion-list">{suggestions.map((item) => <button key={item} className="suggestion" onClick={() => executeCommand(`add ${item}`)}>+ {item}</button>)}</div></section>
      {products.length > 0 && <section className="results"><h2>Product matches</h2><div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}><div className="product-art mint">{validateEmoji(product.emoji)}</div><p className="product-category">{product.category}</p><strong>{product.name}</strong><p>{product.brand} · {product.size}</p><div><span>${product.price.toFixed(2)}</span>{product.organic && <em>Organic</em>}</div><button onClick={() => executeCommand(`add ${product.name}`)}>Add to list</button></article>)}</div></section>}
    </section>
    <footer className="mic-bar"><button className="mic-button" aria-label="Start voice command" onClick={startListening}><MicrophoneIcon /></button><p>Tap to speak</p></footer>
    {isRecording && <div className="recording-overlay"><section className="recording-card"><button className="close-recording" onClick={stopListening} aria-label="Close recording">×</button><p className="live-transcript">{recognizedText || "Listening for your shopping command"}<span>...</span></p><div className="waveform" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><button className="recording-mic" onClick={stopListening} aria-label="Stop listening"><MicrophoneIcon /></button><p className="listening-label">Listening...</p></section></div>}
  </main>;
}

export default App;
