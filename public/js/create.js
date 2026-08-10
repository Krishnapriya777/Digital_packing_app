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
  ctx.strokeStyle = document.getElementById('drawColor').value;
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

// ---- Helper Functions ----
async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.path;
}

function renderPackedList() {
  const list = document.getElementById('packedList');
  list.innerHTML = '';
  items.forEach((item, idx) => {
    const li = document.createElement('li');
    const labelMap = { image: 'Photo', drawing: 'Drawing', video: 'Video', music: 'Song', text: 'Note' };
    const preview = item.type === 'text' ? item.content.slice(0, 40) : (item.caption || item.content.split('/').pop());
    
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