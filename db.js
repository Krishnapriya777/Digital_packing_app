// Simple JSON-file store. No native compilation needed (unlike better-sqlite3),
// so this runs the same on Windows, Mac, Linux, and Render without any build step.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { packages: {}, items: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('data.json was unreadable, starting fresh:', e.message);
    return { packages: {}, items: [] };
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function createPackage({ id, sender_name, recipient_name, recipient_email, note }) {
  const data = load();
  data.packages[id] = {
    id,
    sender_name,
    recipient_name,
    recipient_email,
    note: note || '',
    created_at: new Date().toISOString(),
  };
  save(data);
  return data.packages[id];
}

function addItem({ package_id, type, content, caption, sort_order }) {
  const data = load();
  const item = {
    id: data.items.length ? Math.max(...data.items.map((i) => i.id)) + 1 : 1,
    package_id,
    type,
    content,
    caption: caption || '',
    sort_order: sort_order || 0,
  };
  data.items.push(item);
  save(data);
  return item;
}

function getPackage(id) {
  const data = load();
  return data.packages[id];
}

function getItems(package_id) {
  const data = load();
  return data.items
    .filter((i) => i.package_id === package_id)
    .sort((a, b) => a.sort_order - b.sort_order);
}

module.exports = { createPackage, addItem, getPackage, getItems };