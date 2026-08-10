require('dotenv').config({ quiet: true });
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const session = require('express-session');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// --- App Configurations & Middleware ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- Session Setup ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'goodies-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1 day
  })
);

// --- File Uploads (Images + Drawings) ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${nanoid(10)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// --- Middleware: Auth & Context ---
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

// Pass user data to views automatically
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// --- Helpers ---
function embedForUrl(type, url) {
  try {
    if (type === 'video') {
      const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
      if (yt) return { kind: 'youtube', embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
      return { kind: 'link', embedUrl: url };
    }
    if (type === 'music') {
      const sp = url.match(/open\.spotify\.com\/(track|album|playlist)\/([\w]+)/);
      if (sp) return { kind: 'spotify', embedUrl: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}` };
      return { kind: 'link', embedUrl: url };
    }
  } catch (e) {}
  return { kind: 'link', embedUrl: url };
}

// --- Auth Routes ---

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { error: 'Please enter both username and password.' });
  }

  const user = db.getUserByUsername(username.trim().toLowerCase());
  if (!user || user.password !== password) {
    return res.render('login', { error: 'Invalid username or password.' });
  }

  req.session.user = { id: user.id, username: user.username, name: user.name };
  res.redirect('/dashboard');
});

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.render('register', { error: 'All fields are required.' });
  }

  // Validate username format: name@littlegoodies.com
  const emailRegex = /^[a-zA-Z0-9._%+-]+@littlegoodies\.com$/;
  if (!emailRegex.test(username.trim().toLowerCase())) {
    return res.render('register', {
      error: 'Username must end with @littlegoodies.com (e.g., alex@littlegoodies.com)',
    });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const existingUser = db.getUserByUsername(normalizedUsername);

  if (existingUser) {
    return res.render('register', { error: 'Username is already taken.' });
  }

  const newUser = db.createUser({
    id: nanoid(10),
    name,
    username: normalizedUsername,
    password, // Note: In production, hash passwords using bcrypt
  });

  req.session.user = { id: newUser.id, username: newUser.username, name: newUser.name };
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// --- App Routes ---

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// Dashboard with tabs: inbox, sent, drafts
app.get('/dashboard', requireAuth, (req, res) => {
  const tab = req.query.tab || 'inbox';
  const user = req.session.user;

  let packages = [];
  if (tab === 'inbox') {
    packages = db.getInboxPackages(user.username);
  } else if (tab === 'sent') {
    packages = db.getSentPackages(user.username);
  } else if (tab === 'drafts') {
    packages = db.getDraftPackages(user.username);
  }

  res.render('dashboard', {
    tab, // Passed as 'tab' for dashboard tab highlighting
    inbox: db.getInboxPackages(user.username),
    sent: db.getSentPackages(user.username),
    drafts: db.getDraftPackages(user.username),
    user,
  });
});

app.get('/create', requireAuth, (req, res) => {
  const draftId = req.query.draft || req.query.draftId;
  let draft = null;
  let draftItems = [];

  if (draftId) {
    draft = db.getPackage(draftId);
    if (draft && draft.sender_username === req.session.user.username && draft.is_draft) {
      draftItems = db.getItems(draft.id);
    } else {
      draft = null;
    }
  }

  res.render('create', { baseUrl: BASE_URL, draft, draftItems });
});

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

// Create or Update Package / Draft
app.post('/api/packages', requireAuth, async (req, res) => {
  const { recipientUsername, recipientName, note, items, isDraft, packageId, id: bodyId } = req.body;
  const sender = req.session.user;
  const id = packageId || bodyId || nanoid(10);

  if (!isDraft) {
    if (!recipientUsername) {
      return res.status(400).json({ error: 'Recipient username is required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one item to the parcel.' });
    }
  }

  // Clear previous items if updating an existing package or draft
  db.deleteItemsByPackageId(id);

  db.upsertPackage({
    id,
    sender_name: sender.name,
    sender_username: sender.username,
    recipient_name: recipientName || recipientUsername || '',
    recipient_username: recipientUsername ? recipientUsername.trim().toLowerCase() : '',
    note: note || '',
    is_draft: isDraft ? 1 : 0,
    created_at: new Date().toISOString(),
  });

  if (Array.isArray(items)) {
    items.forEach((item, idx) => {
      db.addItem({
        package_id: id,
        type: item.type,
        content: item.content,
        caption: item.caption || '',
        sort_order: idx,
      });
    });
  }

  const link = `${BASE_URL}/package/${id}`;
  res.json({ id, link, isDraft: !!isDraft });
});

// Support POST route to delete package from Dashboard forms
app.post('/api/packages/:id/delete', requireAuth, (req, res) => {
  const pkg = db.getPackage(req.params.id);
  const currentUser = req.session.user.username;

  if (!pkg) return res.redirect('/dashboard');

  if (pkg.sender_username === currentUser || pkg.recipient_username === currentUser) {
    db.deletePackage(req.params.id);
  }
  res.redirect('/dashboard');
});

// Delete a package or draft via API
app.delete('/api/packages/:id', requireAuth, (req, res) => {
  const pkg = db.getPackage(req.params.id);
  const currentUser = req.session.user.username;

  if (!pkg) {
    return res.status(404).json({ error: 'Package not found.' });
  }

  if (pkg.sender_username !== currentUser && pkg.recipient_username !== currentUser) {
    return res.status(403).json({ error: 'Unauthorized to delete this package.' });
  }

  db.deletePackage(req.params.id);
  res.json({ success: true });
});

// View a package (supports both /package/:id and /p/:id)
const renderPackageView = (req, res) => {
  const pkg = db.getPackage(req.params.id);
  if (!pkg) return res.status(404).render('not-found');

  const currentUser = req.session.user.username;

  // Restrict viewing to sender or recipient
  if (pkg.sender_username !== currentUser && pkg.recipient_username !== currentUser) {
    return res.status(403).render('not-found');
  }

  const items = db
    .getItems(pkg.id)
    .map((item) => {
      if (item.type === 'video' || item.type === 'music') {
        return { ...item, embed: embedForUrl(item.type, item.content) };
      }
      return item;
    });

  res.render('package', { pkg, items });
};

app.get('/package/:id', requireAuth, renderPackageView);
app.get('/p/:id', requireAuth, renderPackageView);

app.listen(PORT, () => {
  console.log(`A Little Box of Goodies running at ${BASE_URL}`);
});