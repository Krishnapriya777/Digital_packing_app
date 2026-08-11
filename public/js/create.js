// Parse initial draft items safely from hidden container
const draftContainer = document.getElementById('draft-data');
const INITIAL_ITEMS = draftContainer ? JSON.parse(draftContainer.dataset.items || '[]') : [];

// Local memory store for current parcel items
const items = [...INITIAL_ITEMS];

// ---- Tabs ----
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.item-panel');

tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset.type;
        panels.forEach((p) => (p.style.display = p.dataset.panel === type ? 'block' : 'none'));
    });
});

// ---- Drawing Canvas ----
const canvas = document.getElementById('drawPad');
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.lineWidth = 4;
ctx.lineCap = 'round';
let drawing = false;
let lastX = 0, lastY = 0;
let drawTool = 'pen'; // 'pen' | 'eraser'

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = e.touches ? e.touches[0] : e;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
}

function startDraw(e) { drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; e.preventDefault(); }
function moveDraw(e) {
    if (!drawing) return;
    const p = getPos(e);
    ctx.lineWidth = drawTool === 'eraser' ? 18 : 4;
    ctx.strokeStyle = drawTool === 'eraser' ? '#ffffff' : document.getElementById('drawColor').value;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
    e.preventDefault();
}
function endDraw() { drawing = false; }

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', moveDraw, { passive: false });
canvas.addEventListener('touchend', endDraw);

document.getElementById('drawClear').addEventListener('click', () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
});

// ---- Doodle Tools: Pen / Eraser / Fill Color (new, additive) ----
const drawPenBtn = document.getElementById('drawPenBtn');
const drawEraserBtn = document.getElementById('drawEraserBtn');
const fillColorInput = document.getElementById('fillColor');
const fillCanvasBtn = document.getElementById('fillCanvasBtn');

if (drawPenBtn && drawEraserBtn) {
    drawPenBtn.addEventListener('click', () => {
        drawTool = 'pen';
        drawPenBtn.classList.add('tool-active');
        drawEraserBtn.classList.remove('tool-active');
    });
    drawEraserBtn.addEventListener('click', () => {
        drawTool = 'eraser';
        drawEraserBtn.classList.add('tool-active');
        drawPenBtn.classList.remove('tool-active');
    });
}

if (fillCanvasBtn && fillColorInput) {
    // Fills the whole canvas with the chosen color (a colored background to doodle on top of)
    fillCanvasBtn.addEventListener('click', () => {
        ctx.fillStyle = fillColorInput.value;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
}

// ---- Helper Functions ----
async function uploadFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return data.path;
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function renderPackedList() {
    const list = document.getElementById('packedList');
    list.innerHTML = '';
    const labelMap = { image: 'Photo', drawing: 'Drawing', video: 'Video', music: 'Song', text: 'Note', jewellery: 'Jewellery', bouquet: 'Bouquet', coupon: 'Coupon' };
    const svgTypes = ['jewellery', 'bouquet', 'coupon'];

    items.forEach((item, idx) => {
        const li = document.createElement('li');
        let preview;
        if (item.type === 'text') {
            preview = item.content.slice(0, 40);
        } else if (svgTypes.includes(item.type)) {
            preview = item.caption || ('Custom ' + (labelMap[item.type] || item.type));
        } else {
            preview = item.caption || item.content.split('/').pop();
        }

        li.innerHTML = `<span><span class="tag">${labelMap[item.type] || 'Item'}</span>${preview}</span>`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
            items.splice(idx, 1);
            renderPackedList();
        });
        li.appendChild(removeBtn);
        list.appendChild(li);
    });

    const itemCountEl = document.getElementById('itemCount');
    if (itemCountEl) itemCountEl.textContent = items.length;
}

function showStatus(msg, isError) {
    const el = document.getElementById('statusMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg ' + (isError ? 'err' : 'ok');
}

// ================= Jewellery Maker (new) =================
const JEWELLERY_TYPES = {
    women: ['Bracelet', 'Anklet', 'Waist Chain', 'Bangle', 'Necklace', 'Earrings', 'Ring', 'Nosering', 'Pendant'],
    men: ['Bracelet', 'Necklace', 'Ring', 'Chain', 'Bangle', 'Pendant']
};

const jwCategory = document.getElementById('jwCategory');
const jwType = document.getElementById('jwType');
const jwMetal = document.getElementById('jwMetal');
const jwStyle = document.getElementById('jwStyle');
const jwCharm = document.getElementById('jwCharm');
const jwInitials = document.getElementById('jwInitials');
const jwEngraving = document.getElementById('jwEngraving');
const jwPreview = document.getElementById('jwPreview');

function populateJwTypes() {
    if (!jwType || !jwCategory) return;
    const list = JEWELLERY_TYPES[jwCategory.value] || JEWELLERY_TYPES.women;
    jwType.innerHTML = list.map((t) => `<option value="${t}">${t}</option>`).join('');
    renderJwPreview();
}

function buildJewellerySVG() {
    const type = (jwType && jwType.value) || 'Bracelet';
    const metal = (jwMetal && jwMetal.value) || '#D4AF37';
    const style = (jwStyle && jwStyle.value) || 'minimal';
    const charm = (jwCharm && jwCharm.value) || '';
    const initials = escapeXml((jwInitials && jwInitials.value.trim().toUpperCase()) || '');
    const engraving = escapeXml((jwEngraving && jwEngraving.value.trim()) || '');
    const dash = (style === 'beaded' || style === 'chain') ? '6 6' : '0';
    const lower = type.toLowerCase();

    let shape = '';
    let centerY = 150;

    if (lower.includes('earring')) {
        shape = `
      <circle cx="112" cy="120" r="10" fill="none" stroke="${metal}" stroke-width="5"/>
      <path d="M112 130 L112 175" stroke="${metal}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="188" cy="120" r="10" fill="none" stroke="${metal}" stroke-width="5"/>
      <path d="M188 130 L188 175" stroke="${metal}" stroke-width="5" stroke-linecap="round"/>
    `;
    } else if (lower.includes('ring')) {
        shape = `<circle cx="150" cy="150" r="46" fill="none" stroke="${metal}" stroke-width="10" stroke-dasharray="${dash}"/>`;
    } else if (lower.includes('necklace') || lower.includes('pendant') || lower.includes('chain')) {
        shape = `
      <path d="M70 90 Q150 190 230 90" fill="none" stroke="${metal}" stroke-width="6" stroke-dasharray="${dash}"/>
      <circle cx="150" cy="180" r="22" fill="none" stroke="${metal}" stroke-width="6"/>
    `;
        centerY = 180;
    } else {
        // bracelet, anklet, waist chain, bangle
        shape = `<circle cx="150" cy="150" r="92" fill="none" stroke="${metal}" stroke-width="9" stroke-dasharray="${dash}"/>`;
    }

    const charmEl = charm ? `<text x="150" y="42" font-size="26" text-anchor="middle">${charm}</text>` : '';
    const initialsEl = initials
        ? `<text x="150" y="${centerY}" font-family="Fredoka, sans-serif" font-size="18" font-weight="700" fill="${metal}" text-anchor="middle" dominant-baseline="middle">${initials}</text>`
        : '';
    const engravingEl = engraving
        ? `<text x="150" y="256" font-family="Caveat, cursive" font-size="20" fill="#1A1A1A" text-anchor="middle">${engraving}</text>`
        : '';

    return `<svg viewBox="0 0 300 280" xmlns="http://www.w3.org/2000/svg" width="260" height="240">
    <rect x="1" y="1" width="298" height="278" rx="20" fill="#fff" stroke="#1A1A1A" stroke-width="2"/>
    ${shape}
    ${charmEl}
    ${initialsEl}
    ${engravingEl}
  </svg>`;
}

function renderJwPreview() {
    if (!jwPreview) return;
    jwPreview.innerHTML = buildJewellerySVG();
}

[jwCategory, jwType, jwMetal, jwStyle, jwCharm, jwInitials, jwEngraving].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', renderJwPreview);
    el.addEventListener('change', renderJwPreview);
});
if (jwCategory) jwCategory.addEventListener('change', populateJwTypes);

populateJwTypes();

// ================= Bouquet Maker (new) =================
const FLOWERS = [
    { key: 'rose', label: 'Rose', emoji: '🌹' },
    { key: 'tulip', label: 'Tulip', emoji: '🌷' },
    { key: 'sunflower', label: 'Sunflower', emoji: '🌻' },
    { key: 'daisy', label: 'Daisy', emoji: '🌼' },
    { key: 'hibiscus', label: 'Hibiscus', emoji: '🌺' },
    { key: 'blossom', label: 'Blossom', emoji: '🌸' },
    { key: 'lavender', label: 'Lavender', emoji: '💜' }
];

let bouquetSelection = []; // ordered list of {key, emoji, label, qty}

const flowerPicker = document.getElementById('flowerPicker');
const bqWrap = document.getElementById('bqWrap');
const bqRibbon = document.getElementById('bqRibbon');
const bqMessage = document.getElementById('bqMessage');
const bqPreview = document.getElementById('bqPreview');

function renderFlowerPicker() {
    if (!flowerPicker) return;
    flowerPicker.innerHTML = '';
    FLOWERS.forEach((f) => {
        const entry = bouquetSelection.find((s) => s.key === f.key);
        const chip = document.createElement('div');
        chip.className = 'flower-chip' + (entry ? ' selected' : '');
        chip.innerHTML = `
      <span style="cursor:pointer;" data-flower-toggle="${f.key}">${f.emoji} ${f.label}</span>
      ${entry ? `
        <button type="button" class="qty-btn" data-flower-dec="${f.key}">−</button>
        <span class="qty">${entry.qty}</span>
        <button type="button" class="qty-btn" data-flower-inc="${f.key}">+</button>
      ` : ''}
    `;
        flowerPicker.appendChild(chip);
    });

    flowerPicker.querySelectorAll('[data-flower-toggle]').forEach((el) => {
        el.addEventListener('click', () => {
            const key = el.dataset.flowerToggle;
            const f = FLOWERS.find((x) => x.key === key);
            const idx = bouquetSelection.findIndex((s) => s.key === key);
            if (idx === -1) {
                bouquetSelection.push({ key, emoji: f.emoji, label: f.label, qty: 3 });
            } else {
                bouquetSelection.splice(idx, 1);
            }
            renderFlowerPicker();
            renderBqPreview();
        });
    });
    flowerPicker.querySelectorAll('[data-flower-inc]').forEach((el) => {
        el.addEventListener('click', () => {
            const s = bouquetSelection.find((x) => x.key === el.dataset.flowerInc);
            if (s && s.qty < 9) s.qty++;
            renderFlowerPicker();
            renderBqPreview();
        });
    });
    flowerPicker.querySelectorAll('[data-flower-dec]').forEach((el) => {
        el.addEventListener('click', () => {
            const s = bouquetSelection.find((x) => x.key === el.dataset.flowerDec);
            if (s && s.qty > 1) s.qty--;
            renderFlowerPicker();
            renderBqPreview();
        });
    });
}

function buildBouquetSVG() {
    const wrapColor = (bqWrap && bqWrap.value) || '#FFDFEC';
    const ribbonColor = (bqRibbon && bqRibbon.value) || '#E8639A';
    const message = escapeXml((bqMessage && bqMessage.value.trim()) || '').slice(0, 40);

    let stems = [];
    bouquetSelection.forEach((s) => {
        for (let i = 0; i < Math.min(s.qty, 9); i++) stems.push(s.emoji);
    });
    if (stems.length === 0) stems = ['🌷'];
    stems = stems.slice(0, 24);

    const centerX = 150, baseY = 148, spread = 110;
    const heads = stems.map((emoji, i) => {
        const t = stems.length === 1 ? 0.5 : i / (stems.length - 1);
        const x = centerX - spread / 2 + t * spread + Math.sin(i * 2.4) * 8;
        const y = baseY - Math.abs(t - 0.5) * 40 - (i % 3) * 6;
        const size = 22 + (i % 3) * 2;
        return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" text-anchor="middle">${emoji}</text>`;
    }).join('');

    const cardEl = message
        ? `<rect x="180" y="238" width="110" height="42" rx="8" fill="#fff" stroke="#1A1A1A" stroke-width="1.5"/>
       <text x="235" y="263" font-family="Caveat, cursive" font-size="13" fill="#1A1A1A" text-anchor="middle">${message}</text>`
        : '';

    return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" width="260" height="260">
    <rect x="1" y="1" width="298" height="298" rx="20" fill="#fff" stroke="#1A1A1A" stroke-width="2"/>
    <path d="M100 262 L150 165 L200 262 Z" fill="${wrapColor}" stroke="#1A1A1A" stroke-width="2"/>
    <path d="M120 240 Q150 220 180 240" fill="none" stroke="${ribbonColor}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="150" cy="225" r="9" fill="${ribbonColor}" stroke="#1A1A1A" stroke-width="1.5"/>
    ${heads}
    ${cardEl}
  </svg>`;
}

function renderBqPreview() {
    if (!bqPreview) return;
    bqPreview.innerHTML = buildBouquetSVG();
}

if (bqWrap) bqWrap.addEventListener('change', renderBqPreview);
if (bqRibbon) bqRibbon.addEventListener('change', renderBqPreview);
if (bqMessage) bqMessage.addEventListener('input', renderBqPreview);

renderFlowerPicker();
renderBqPreview();

// ================= Coupon Maker (new) =================
const COUPON_TEMPLATES = [
    { key: 'movie', icon: '🎬', label: 'Movie Night', title: 'Movie Night', desc: 'Redeemable for one cozy movie night, my treat.' },
    { key: 'dinner', icon: '🍽️', label: 'Dinner', title: 'Dinner Date', desc: 'Good for one dinner out, anywhere you pick.' },
    { key: 'icecream', icon: '🍦', label: 'Ice Cream', title: 'Ice Cream Run', desc: 'One ice cream run, my treat, no complaints.' },
    { key: 'hug', icon: '🤗', label: 'Free Hug', title: 'Free Hug', desc: 'Redeemable any time, no expiry on this one.' },
    { key: 'choose', icon: '🎁', label: 'You Choose', title: 'You Choose', desc: 'One favor, your call. I promise to say yes.' },
    { key: 'custom', icon: '💌', label: 'Custom', title: '', desc: '' }
];

let selectedCouponTemplate = COUPON_TEMPLATES[0].key;

const couponTemplatesEl = document.getElementById('couponTemplates');
const cpTitle = document.getElementById('cpTitle');
const cpDesc = document.getElementById('cpDesc');
const cpExpiry = document.getElementById('cpExpiry');
const cpPreview = document.getElementById('cpPreview');

function renderCouponTemplates() {
    if (!couponTemplatesEl) return;
    couponTemplatesEl.innerHTML = COUPON_TEMPLATES.map((t) => `
    <button type="button" class="coupon-template-btn${t.key === selectedCouponTemplate ? ' active' : ''}" data-coupon-template="${t.key}">${t.icon} ${t.label}</button>
  `).join('');

    couponTemplatesEl.querySelectorAll('[data-coupon-template]').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedCouponTemplate = btn.dataset.couponTemplate;
            const t = COUPON_TEMPLATES.find((x) => x.key === selectedCouponTemplate);
            if (t && cpTitle && cpDesc) {
                cpTitle.value = t.title;
                cpDesc.value = t.desc;
            }
            renderCouponTemplates();
            renderCpPreview();
        });
    });
}

function currentCouponIcon() {
    const t = COUPON_TEMPLATES.find((x) => x.key === selectedCouponTemplate);
    return t ? t.icon : '🎟️';
}

function wrapSvgText(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    words.forEach((w) => {
        if ((current + ' ' + w).trim().length > maxChars) {
            if (current) lines.push(current.trim());
            current = w;
        } else {
            current = (current + ' ' + w).trim();
        }
    });
    if (current) lines.push(current);
    return lines.slice(0, 3);
}

function buildCouponSVG() {
    const icon = currentCouponIcon();
    const title = (cpTitle && cpTitle.value.trim()) || 'One Coupon';
    const desc = (cpDesc && cpDesc.value.trim()) || 'Redeemable for something sweet.';
    const expiry = (cpExpiry && cpExpiry.value.trim()) || '';

    const titleLines = wrapSvgText(title, 22).map(escapeXml);
    const descLines = wrapSvgText(desc, 32).map(escapeXml);

    const titleTspans = titleLines.map((l, i) => `<tspan x="150" dy="${i === 0 ? 0 : 24}">${l}</tspan>`).join('');
    const descTspans = descLines.map((l, i) => `<tspan x="150" dy="${i === 0 ? 0 : 17}">${l}</tspan>`).join('');

    return `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" width="300" height="190">
    <rect x="2" y="2" width="316" height="196" rx="18" fill="#FFFBF4" stroke="#1A1A1A" stroke-width="2.5"/>
    <circle cx="2" cy="100" r="10" fill="#F8C8DC" stroke="#1A1A1A" stroke-width="2"/>
    <circle cx="318" cy="100" r="10" fill="#F8C8DC" stroke="#1A1A1A" stroke-width="2"/>
    <line x1="55" y1="10" x2="55" y2="190" stroke="#1A1A1A" stroke-width="1.5" stroke-dasharray="4 5"/>
    <text x="27" y="105" font-size="34" text-anchor="middle" dominant-baseline="middle">${icon}</text>
    <text x="150" y="52" font-family="Sacramento, Caveat, cursive" font-size="24" fill="#1A1A1A" text-anchor="middle">${titleTspans}</text>
    <text x="150" y="92" font-family="Quicksand, sans-serif" font-size="13" font-weight="600" fill="#3B2A52" text-anchor="middle">${descTspans}</text>
    ${expiry ? `<text x="150" y="178" font-family="Fredoka, sans-serif" font-size="11" fill="#1A1A1A" text-anchor="middle">expires ${escapeXml(expiry)}</text>` : ''}
  </svg>`;
}

function renderCpPreview() {
    if (!cpPreview) return;
    cpPreview.innerHTML = buildCouponSVG();
}

if (cpTitle) cpTitle.addEventListener('input', renderCpPreview);
if (cpDesc) cpDesc.addEventListener('input', renderCpPreview);
if (cpExpiry) cpExpiry.addEventListener('input', renderCpPreview);

renderCouponTemplates();
if (cpTitle && cpDesc && !cpTitle.value) {
    const t0 = COUPON_TEMPLATES[0];
    cpTitle.value = t0.title;
    cpDesc.value = t0.desc;
}
renderCpPreview();

// ---- Emoji Picker for Note (new) ----
(function () {
    const EMOJIS = [
        "😀", "😂", "🥹", "😍", "🥰", "😘", "😊", "😉", "😎", "🤩",
        "😢", "😭", "🥺", "😅", "😇", "🤗", "🙃", "😴", "🤔", "😳",
        "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💕", "💖",
        "💗", "💓", "💞", "💌", "💐", "🌸", "🌷", "🌹", "🌻", "🌼",
        "✨", "⭐", "🌟", "🎉", "🎊", "🎁", "🎈", "🍰", "🧁", "🍫",
        "🐶", "🐱", "🐰", "🐻", "🦋", "🌈", "☀️", "🌙", "☁️", "🔥",
        "👍", "🙌", "🙏", "👏", "🤝", "✋", "👋", "💪", "🫶", "🤞"
    ];

    const toggleBtn = document.getElementById("emojiToggleBtn");
    const closeBtn = document.getElementById("emojiCloseBtn");
    const picker = document.getElementById("emojiPicker");
    const grid = document.getElementById("emojiGrid");
    const textNote = document.getElementById("textNote");

    if (toggleBtn && picker && grid && textNote) {
        EMOJIS.forEach((e) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = e;
            btn.addEventListener("click", () => {
                insertAtCursor(textNote, e);
                textNote.focus();
            });
            grid.appendChild(btn);
        });

        toggleBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            picker.hidden = !picker.hidden;
        });

        if (closeBtn) {
            closeBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                picker.hidden = true;
                textNote.focus();
            });
        }

        document.addEventListener("click", (ev) => {
            if (!picker.hidden && !picker.contains(ev.target) && ev.target !== toggleBtn) {
                picker.hidden = true;
            }
        });
    }

    function insertAtCursor(field, text) {
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? field.value.length;
        field.value = field.value.slice(0, start) + text + field.value.slice(end);
        const cursor = start + text.length;
        field.setSelectionRange(cursor, cursor);
    }
})();

// ---- Add Item Handlers ----
document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', async () => {
        const type = btn.dataset.add;
        try {
            if (type === 'image') {
                const fileInput = document.getElementById('imageFile');
                if (!fileInput.files[0]) return showStatus('Choose a photo first.', true);
                const path = await uploadFile(fileInput.files[0]);
                items.push({ type: 'image', content: path, caption: document.getElementById('imageCaption').value });
                fileInput.value = '';
                document.getElementById('imageCaption').value = '';
            } else if (type === 'drawing') {
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
                const file = new File([blob], 'drawing.png', { type: 'image/png' });
                const path = await uploadFile(file);
                items.push({ type: 'drawing', content: path, caption: '' });
            } else if (type === 'video') {
                const url = document.getElementById('videoUrl').value.trim();
                if (!url) return showStatus('Paste a video link first.', true);
                items.push({ type: 'video', content: url, caption: '' });
                document.getElementById('videoUrl').value = '';
            } else if (type === 'music') {
                const url = document.getElementById('musicUrl').value.trim();
                if (!url) return showStatus('Paste a song link first.', true);
                items.push({ type: 'music', content: url, caption: '' });
                document.getElementById('musicUrl').value = '';
            } else if (type === 'text') {
                const text = document.getElementById('textNote').value.trim();
                if (!text) return showStatus('Write something first.', true);
                items.push({ type: 'text', content: text, caption: '' });
                document.getElementById('textNote').value = '';
            } else if (type === 'jewellery') {
                const pieceLabel = jwType ? jwType.value : 'Piece';
                const metalLabel = jwMetal ? jwMetal.options[jwMetal.selectedIndex].text : '';
                items.push({ type: 'jewellery', content: buildJewellerySVG(), caption: `${pieceLabel} · ${metalLabel}` });
            } else if (type === 'bouquet') {
                if (bouquetSelection.length === 0) return showStatus('Add at least one flower first.', true);
                const flowerNames = bouquetSelection.map((s) => `${s.qty} ${s.label}`).join(', ');
                items.push({ type: 'bouquet', content: buildBouquetSVG(), caption: flowerNames });
            } else if (type === 'coupon') {
                if (!cpTitle || !cpTitle.value.trim()) return showStatus('Give your coupon a title first.', true);
                items.push({ type: 'coupon', content: buildCouponSVG(), caption: cpTitle.value.trim() });
            }
            showStatus('Added to the parcel.', false);
            renderPackedList();
        } catch (err) {
            showStatus(err.message, true);
        }
    });
});

// ---- Live Preview Listener ----
const recipientUsernameInput = document.getElementById('recipientUsername');
if (recipientUsernameInput) {
    recipientUsernameInput.addEventListener('input', (e) => {
        const previewTo = document.getElementById('previewTo');
        if (previewTo) previewTo.textContent = e.target.value || '—';
    });
}

// ---- Package Submission (Send & Save Draft) ----
async function submitPackage(isDraft = false) {
    const packageId = document.getElementById('packageId')?.value || '';
    const recipientName = document.getElementById('recipientName').value.trim();
    const recipientUsername = document.getElementById('recipientUsername').value.trim();
    const note = document.getElementById('note').value.trim();
    const sendStatus = document.getElementById('sendStatus');

    if (!recipientUsername) {
        sendStatus.textContent = 'Please specify a recipient username.';
        sendStatus.className = 'status-msg err';
        return;
    }

    if (!isDraft && items.length === 0) {
        sendStatus.textContent = 'Add at least one item to the parcel before sending.';
        sendStatus.className = 'status-msg err';
        return;
    }

    const sendBtn = document.getElementById('sendBtn');
    const draftBtn = document.getElementById('saveDraftBtn');

    sendBtn.disabled = true;
    if (draftBtn) draftBtn.disabled = true;

    sendStatus.textContent = isDraft ? 'Saving draft...' : 'Sending package...';
    sendStatus.className = 'status-msg ok';

    try {
        const res = await fetch('/api/packages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: packageId,
                recipientName,
                recipientUsername,
                note,
                items,
                isDraft,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save package.');

        sendStatus.textContent = isDraft ? 'Draft saved successfully!' : 'Package sent successfully! Redirecting...';

        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 1200);

    } catch (err) {
        sendStatus.textContent = err.message;
        sendStatus.className = 'status-msg err';
        sendBtn.disabled = false;
        if (draftBtn) draftBtn.disabled = false;
    }
}

// Attach submission buttons
document.getElementById('sendBtn').addEventListener('click', () => submitPackage(false));

const saveDraftBtn = document.getElementById('saveDraftBtn');
if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', () => submitPackage(true));
}

// Initialize rendering on load
renderPackedList();
