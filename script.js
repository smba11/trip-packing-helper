const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "trip_packing_helper_v2";
const confettiCanvas = $("confetti");
const ctx = confettiCanvas.getContext("2d");

let confettiParticles = [];
let confettiRunning = false;
let lastComplete = false;

const emojiByType = {
  city: "🏙️",
  beach: "🏖️",
  cold: "❄️",
  hiking: "🥾",
  business: "💼",
};

const emojiByWeather = {
  mixed: "🌤️",
  hot: "☀️",
  mild: "🌿",
  cold: "🧊",
  rainy: "🌧️",
};

const emojiByLuggage = {
  carryon: "🎒",
  checked: "🧳",
};

const baseTemplates = {
  essentials: [
    ["ID + wallet + cards", "Keep on you"],
    ["Phone + charger", "Bring a backup cable if you have one"],
    ["AirPods / headphones", ""],
    ["Keys", ""],
    ["Meds / prescriptions", "Pack enough + 2 extra days"],
    ["Toothbrush + toothpaste", ""],
    ["Deodorant", ""],
    ["Lip balm", ""],
    ["Hand sanitizer", ""],
  ],
  clothing: [
    ["T-shirts", ""],
    ["Pants / shorts", ""],
    ["Underwear", ""],
    ["Socks", ""],
    ["Sleepwear", ""],
    ["Shoes", "1 comfy pair minimum"],
    ["Light jacket / hoodie", ""],
  ],
  toiletries: [
    ["Shampoo / conditioner", "Travel size if carry-on"],
    ["Face wash / skincare", ""],
    ["Razor", ""],
    ["Hair brush/comb", ""],
    ["Sunscreen", ""],
  ],
  tech: [
    ["Power bank", ""],
    ["Laptop + charger", "If needed"],
    ["Adapters (if international)", ""],
  ],
  misc: [
    ["Reusable water bottle", ""],
    ["Snacks", ""],
    ["Gum / mints", ""],
  ],
};

const addOns = {
  beach: {
    clothing: [
      ["Swimsuit(s)", ""],
      ["Flip flops / slides", ""],
      ["Beach towel", "Optional if hotel provides"],
      ["Hat / sunglasses", ""],
    ],
    misc: [
      ["Aloe / after-sun", ""],
    ],
  },
  cold: {
    clothing: [
      ["Warm coat", ""],
      ["Beanie + gloves", ""],
      ["Thermal base layer", ""],
      ["Scarf", ""],
    ],
    toiletries: [
      ["Moisturizer", "Cold air = dry skin"],
    ],
  },
  hiking: {
    clothing: [
      ["Hiking shoes", ""],
      ["Hiking socks", "Blister prevention"],
      ["Rain shell", ""],
      ["Daypack", ""],
    ],
    misc: [
      ["Trail snacks", ""],
      ["Sunglasses", ""],
      ["Bug spray", ""],
    ],
  },
  business: {
    clothing: [
      ["Business outfit(s)", ""],
      ["Belt", ""],
      ["Dress shoes", ""],
    ],
    essentials: [
      ["Notebook / pen", ""],
      ["Business cards", "If you have them"],
    ],
  },
};

const weatherAdds = {
  rainy: {
    essentials: [["Umbrella", ""]],
    clothing: [["Waterproof jacket", ""]],
  },
  hot: {
    toiletries: [["Extra deodorant / body wipes", ""]],
    clothing: [["Breathable layers", ""]],
  },
  cold: {
    clothing: [["Extra warm socks", ""]],
  },
};

function qty(label, days, laundry) {
  const d = Math.max(1, Number(days) || 1);
  const effectiveDays = laundry ? Math.ceil(d / 2) : d;

  const lower = label.toLowerCase();
  if (lower.includes("underwear")) return Math.min(effectiveDays + 1, 12);
  if (lower.includes("sock")) return Math.min(effectiveDays + 1, 12);
  if (lower.includes("t-shirt")) return Math.min(effectiveDays, 10);
  if (lower.includes("pants") || lower.includes("shorts")) return Math.min(Math.ceil(effectiveDays / 2), 6);
  if (lower.includes("sleepwear")) return 1;
  if (lower.includes("shoes")) return 1;
  if (lower.includes("swimsuit")) return Math.min(Math.ceil(d / 3), 3);
  if (lower.includes("business outfit")) return Math.min(d, 6);
  return null;
}

function buildChecklist({ tripType, days, weather, luggage, laundry, gym }) {
  const list = JSON.parse(JSON.stringify(baseTemplates));

  if (addOns[tripType]) {
    for (const [group, items] of Object.entries(addOns[tripType])) {
      list[group] = (list[group] || []).concat(items);
    }
  }

  if (weatherAdds[weather]) {
    for (const [group, items] of Object.entries(weatherAdds[weather])) {
      list[group] = (list[group] || []).concat(items);
    }
  }

  if (gym) {
    list.clothing = list.clothing.concat([
      ["Gym clothes", "1–2 sets"],
      ["Gym shoes (if different)", ""],
    ]);
    list.toiletries = list.toiletries.concat([["Body wash / wipes", ""]]);
  }

  if (luggage === "carryon") {
    list.toiletries = list.toiletries.map(([a, b]) => {
      const lower = a.toLowerCase();
      if (["shampoo", "conditioner", "face wash", "sunscreen"].some(k => lower.includes(k))) {
        return [a, (b ? b + " • " : "") + "3.4oz / 100ml rule"];
      }
      return [a, b];
    });
    list.misc = list.misc.concat([["Quart-size liquids bag", "Carry-on only"]]);
  }

  const withQty = {};
  for (const [group, items] of Object.entries(list)) {
    withQty[group] = items.map(([title, note]) => {
      const q = qty(title, days, laundry);
      const titled = q ? `${title} (${q})` : title;
      return { title: titled, note: note || "", checked: false, custom: false };
    });
  }
  return withQty;
}

function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function ensureState() {
  const existing = load();
  if (existing && existing.checklist) return existing;

  return {
    meta: {
      tripType: "city",
      days: 5,
      weather: "mixed",
      luggage: "carryon",
      laundry: false,
      gym: false,
    },
    checklist: {},
  };
}

let state = ensureState();

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function groupLabel(group) {
  const map = {
    essentials: "Essentials",
    clothing: "Clothing",
    toiletries: "Toiletries",
    tech: "Tech",
    misc: "Extras",
  };
  return map[group] || group;
}

function syncInputsFromState() {
  $("tripType").value = state.meta.tripType;
  $("days").value = state.meta.days;
  $("weather").value = state.meta.weather;
  $("luggage").value = state.meta.luggage;
  $("laundry").checked = !!state.meta.laundry;
  $("gym").checked = !!state.meta.gym;
  renderChips(state.meta);
}

function readMetaFromInputs() {
  return {
    tripType: $("tripType").value,
    days: Number($("days").value || 1),
    weather: $("weather").value,
    luggage: $("luggage").value,
    laundry: $("laundry").checked,
    gym: $("gym").checked,
  };
}

function renderChips(meta) {
  const chips = $("chips");
  chips.innerHTML = "";
  const data = [
    `${emojiByType[meta.tripType] || "🗺️"} ${meta.tripType}`,
    `${emojiByWeather[meta.weather] || "🌤️"} ${meta.weather}`,
    `${emojiByLuggage[meta.luggage] || "🎒"} ${meta.luggage}`,
    meta.laundry ? "🧺 laundry" : "🧼 no laundry",
    meta.gym ? "🏋️ gym" : "🛋️ no gym",
    `🗓️ ${meta.days} days`,
  ];
  data.forEach((t) => {
    const s = document.createElement("span");
    s.className = "chip";
    s.textContent = t;
    chips.appendChild(s);
  });
}

function updateSubtitle() {
  const total = getCounts(state).total;
  if (!total) {
    $("subtitle").textContent = "Generate your checklist to get started.";
    return;
  }
  $("subtitle").textContent = "Tap items as you pack — you’ll feel the progress.";
}

function getCounts(state) {
  let total = 0, checked = 0;
  for (const items of Object.values(state.checklist)) {
    total += items.length;
    checked += items.filter(i => i.checked).length;
  }
  return { total, checked };
}

function updateCount(state) {
  const { total, checked } = getCounts(state);
  $("count").textContent = `${checked} / ${total} checked`;

  // Trigger confetti when completed all (and only once per completion)
  const completed = total > 0 && checked === total;
  if (completed && !lastComplete) {
    blastConfetti();
  }
  lastComplete = completed;
}

function render(state) {
  const listEl = $("list");
  listEl.innerHTML = "";

  const groups = Object.keys(state.checklist);
  if (!groups.length) {
    listEl.innerHTML = `<div class="empty"><p>👆 Enter your trip details and hit <b>Generate</b>.</p></div>`;
    updateSubtitle();
    updateCount(state);
    return;
  }

  for (const group of groups) {
    const box = document.createElement("div");
    box.className = "group";

    const header = document.createElement("div");
    header.className = "groupTitle";
    header.innerHTML = `<span>${escapeHtml(groupLabel(group))}</span><span class="badge">${state.checklist[group].length} items</span>`;
    box.appendChild(header);

    state.checklist[group].forEach((item, idx) => {
      const row = document.createElement("label");
      row.className = "item" + (item.checked ? " checked" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!item.checked;

      cb.addEventListener("change", () => {
        state.checklist[group][idx].checked = cb.checked;
        save(state);

        // animate "pop" on click
        row.classList.toggle("checked", cb.checked);
        row.animate(
          [{ transform: "translateY(0px) scale(1)" }, { transform: "translateY(-1px) scale(1.02)" }, { transform: "translateY(0px) scale(1)" }],
          { duration: 180, easing: "ease-out" }
        );

        updateCount(state);
      });

      const text = document.createElement("div");
      text.className = "itemText";
      text.innerHTML = `
        <div class="main">${escapeHtml(item.title)}</div>
        ${item.note ? `<div class="sub">${escapeHtml(item.note)}</div>` : ""}
      `;

      row.appendChild(cb);
      row.appendChild(text);
      box.appendChild(row);
    });

    listEl.appendChild(box);
  }

  updateSubtitle();
  updateCount(state);
}

/* ===== Buttons ===== */
$("generate").addEventListener("click", () => {
  state.meta = readMetaFromInputs();
  renderChips(state.meta);

  state.checklist = buildChecklist(state.meta);
  save(state);

  // small "generate" animation
  $("generate").animate(
    [{ transform: "translateY(0px)" }, { transform: "translateY(-2px)" }, { transform: "translateY(0px)" }],
    { duration: 220, easing: "ease-out" }
  );

  render(state);
});

$("reset").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state = ensureState();
  syncInputsFromState();
  render(state);
});

$("addCustom").addEventListener("click", () => {
  const text = $("customText").value.trim();
  if (!text) return;

  state.checklist.essentials = state.checklist.essentials || [];
  state.checklist.essentials.unshift({ title: text, note: "Custom", checked: false, custom: true });

  $("customText").value = "";
  save(state);
  render(state);
});

$("checkAll").addEventListener("click", () => {
  for (const group of Object.keys(state.checklist)) {
    state.checklist[group] = state.checklist[group].map(i => ({ ...i, checked: true }));
  }
  save(state);
  render(state);
});

$("uncheckAll").addEventListener("click", () => {
  for (const group of Object.keys(state.checklist)) {
    state.checklist[group] = state.checklist[group].map(i => ({ ...i, checked: false }));
  }
  save(state);
  render(state);
});

$("copy").addEventListener("click", async () => {
  const lines = [];
  lines.push(`Trip Packing Checklist`);
  lines.push(`Type: ${state.meta.tripType} | Days: ${state.meta.days} | Weather: ${state.meta.weather} | Luggage: ${state.meta.luggage}`);
  lines.push("");

  for (const [group, items] of Object.entries(state.checklist)) {
    lines.push(groupLabel(group).toUpperCase());
    items.forEach(i => lines.push(`${i.checked ? "[x]" : "[ ]"} ${i.title}${i.note ? " — " + i.note : ""}`));
    lines.push("");
  }

  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    $("copy").textContent = "Copied ✅";
    setTimeout(() => ($("copy").textContent = "Copy list"), 1200);
  } catch {
    alert("Copy failed — your browser blocked clipboard access.");
  }
});

/* ===== Confetti ===== */
function resizeConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeConfetti);
resizeConfetti();

function blastConfetti() {
  // Respect reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  confettiCanvas.classList.add("show");

  const count = 160;
  confettiParticles = Array.from({ length: count }, () => createParticle());
  if (!confettiRunning) {
    confettiRunning = true;
    requestAnimationFrame(tickConfetti);
  }

  setTimeout(() => {
    confettiCanvas.classList.remove("show");
  }, 1200);
}

function createParticle() {
  const colors = ["#7c5cff", "#4e8cff", "#2ee6a6", "#ff5cc3", "#ffe66d"];
  return {
    x: Math.random() * confettiCanvas.width,
    y: -20 - Math.random() * 200,
    r: 2 + Math.random() * 4,
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 5,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 60 + Math.floor(Math.random() * 40),
  };
}

function tickConfetti() {
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

  confettiParticles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.vy += 0.06; // gravity
    p.life -= 1;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.r, -p.r, p.r * 2.2, p.r * 1.2);
    ctx.restore();
  });

  confettiParticles = confettiParticles.filter(p => p.life > 0 && p.y < confettiCanvas.height + 40);

  if (confettiParticles.length > 0) {
    requestAnimationFrame(tickConfetti);
  } else {
    confettiRunning = false;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

/* ===== Init ===== */
syncInputsFromState();
render(state);
