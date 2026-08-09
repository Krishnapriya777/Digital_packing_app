const items = [];

// ---- tabs ----
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

// ---- drawing canvas ----
const canvas = document.getElementById('drawPad');
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#fff';
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
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
});

// ---- add item handlers ----
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
    li.innerHTML = `<span><span class="tag">${labelMap[item.type]}</span>${preview}</span>`;
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
  document.getElementById('itemCount').textContent = items.length;
}

function showStatus(msg, isError) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg ' + (isError ? 'err' : 'ok');
}

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

// ---- live preview fields ----
document.getElementById('recipientName').addEventListener('input', (e) => {
  document.getElementById('previewTo').textContent = e.target.value || '—';
});
document.getElementById('senderName').addEventListener('input', (e) => {
  document.getElementById('previewFrom').textContent = e.target.value || '—';
});

// ---- submit ----
document.getElementById('sendBtn').addEventListener('click', async () => {
  const senderName = document.getElementById('senderName').value.trim();
  const recipientName = document.getElementById('recipientName').value.trim();
  const recipientEmail = document.getElementById('recipientEmail').value.trim();
  const note = document.getElementById('note').value.trim();
  const sendStatus = document.getElementById('sendStatus');

  if (!senderName || !recipientName || !recipientEmail) {
    sendStatus.textContent = 'Fill in from, to, and their email.';
    sendStatus.className = 'status-msg err';
    return;
  }
  if (items.length === 0) {
    sendStatus.textContent = 'Add at least one item to the parcel.';
    sendStatus.className = 'status-msg err';
    return;
  }

  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.textContent = 'Wrapping it up...';

  try {
    const res = await fetch('/api/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderName, recipientName, recipientEmail, note, items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    if (data.emailStatus === 'sent') {
      sendStatus.textContent = `Sent! Also viewable at ${data.link}`;
      sendStatus.className = 'status-msg ok';
    } else if (data.emailStatus === 'not_configured') {
      sendStatus.textContent = `Parcel created (email not configured). Link: ${data.link}`;
      sendStatus.className = 'status-msg ok';
    } else {
      sendStatus.textContent = `Parcel created, but email failed to send. Link: ${data.link}`;
      sendStatus.className = 'status-msg err';
    }
    btn.textContent = 'Sent ✓';
  } catch (err) {
    sendStatus.textContent = err.message;
    sendStatus.className = 'status-msg err';
    btn.disabled = false;
    btn.textContent = 'Send with love 💌';
  }
});

renderPackedList();