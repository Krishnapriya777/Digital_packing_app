// Simple JSON-file store. No native compilation needed,
// so this runs the same on Windows, Mac, Linux, and Render without any build step.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { users: [], packages: {}, items: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      users: parsed.users || [],
      packages: parsed.packages || {},
      items: parsed.items || [],
    };
  } catch (e) {
    console.error('data.json was unreadable, starting fresh:', e.message);
    return { users: [], packages: {}, items: [] };
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- User Operations ---

function createUser({ id, name, username, password }) {
  const data = load();
  const user = {
    id,
    name,
    username: username.toLowerCase(),
    password,
    created_at: new Date().toISOString(),
  };
  data.users.push(user);
  save(data);
  return user;
}

function getUserByUsername(username) {
  const data = load();
  const cleanUsername = (username || '').toLowerCase();
  return data.users.find((u) => u.username === cleanUsername) || null;
}

// --- Package Operations ---

function upsertPackage({ id, sender_name, sender_username, recipient_name, recipient_username, note, is_draft, created_at }) {
  const data = load();
  const existingPkg = data.packages[id] || {};

  data.packages[id] = {
    ...existingPkg,
    id,
    sender_name,
    sender_username: (sender_username || '').toLowerCase(),
    recipient_name: recipient_name || '',
    recipient_username: (recipient_username || '').toLowerCase(),
    note: note || '',
    is_draft: is_draft ? 1 : 0,
    created_at: created_at || existingPkg.created_at || new Date().toISOString(),
  };

  save(data);
  return data.packages[id];
}

function getPackage(id) {
  const data = load();
  return data.packages[id] || null;
}

function getInboxPackages(username) {
  const data = load();
  const cleanUsername = (username || '').toLowerCase();
  return Object.values(data.packages)
    .filter((p) => p.recipient_username === cleanUsername && !p.is_draft)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getSentPackages(username) {
  const data = load();
  const cleanUsername = (username || '').toLowerCase();
  return Object.values(data.packages)
    .filter((p) => p.sender_username === cleanUsername && !p.is_draft)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getDraftPackages(username) {
  const data = load();
  const cleanUsername = (username || '').toLowerCase();
  return Object.values(data.packages)
    .filter((p) => p.sender_username === cleanUsername && p.is_draft)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function deletePackage(id) {
  const data = load();
  if (data.packages[id]) {
    delete data.packages[id];
    // Clean up attached items as well
    data.items = data.items.filter((i) => i.package_id !== id);
    save(data);
    return true;
  }
  return false;
}

// --- Item Operations ---

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

function getItems(package_id) {
  const data = load();
  return data.items
    .filter((i) => i.package_id === package_id)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function deleteItemsByPackageId(package_id) {
  const data = load();
  data.items = data.items.filter((i) => i.package_id !== package_id);
  save(data);
}

module.exports = {
  createUser,
  getUserByUsername,
  upsertPackage,
  getPackage,
  getInboxPackages,
  getSentPackages,
  getDraftPackages,
  deletePackage,
  addItem,
  getItems,
  deleteItemsByPackageId,
};