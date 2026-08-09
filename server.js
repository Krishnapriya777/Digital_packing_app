require('dotenv').config({ quiet: true });
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const sgMail = require('@sendgrid/mail');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- SendGrid Mailer Setup ---
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid Web API configured successfully');
} else {
  console.log('⚠️ SENDGRID_API_KEY is missing from environment variables');
}

// --- File Uploads ---
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

// --- Routes ---
app.get('/', (req, res) => res.redirect('/create'));

app.get('/create', (req, res) => {
  res.render('create', { baseUrl: BASE_URL });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

app.post('/api/packages', async (req, res) => {
  const { senderName, recipientName, recipientEmail, note, items } = req.body;

  if (!senderName || !recipientName || !recipientEmail) {
    return res.status(400).json({ error: 'Missing sender, recipient name, or recipient email.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one item to the parcel.' });
  }

  const id = nanoid(10);
  db.createPackage({
    id,
    sender_name: senderName,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    note,
  });

  items.forEach((item, idx) => {
    db.addItem({
      package_id: id,
      type: item.type,
      content: item.content,
      caption: item.caption || '',
      sort_order: idx,
    });
  });

  const link = `${BASE_URL}/p/${id}`;

  let emailStatus = 'not_configured';
  let emailError = null;

  if (process.env.SENDGRID_API_KEY) {
    try {
      await sgMail.send({
        to: recipientEmail,
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        subject: `${senderName} sent you a little box of goodies 🎁`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 480px; margin: auto; padding: 32px; background: #F3EAD8; border: 1px solid #C9AD82;">
            <p style="font-size: 14px; letter-spacing: 2px; text-transform: uppercase; color: #B7472A; margin-bottom: 4px;">A parcel has arrived</p>
            <h1 style="font-size: 22px; color: #1F1B16; margin-top: 0;">Hi ${recipientName},</h1>
            <p style="color: #1F1B16; line-height: 1.6;">${senderName} packed something for you.${note ? ` They left a note: "${note}"` : ''}</p>
            <p style="margin: 28px 0;">
              <a href="${link}" style="background: #B7472A; color: #F3EAD8; padding: 12px 24px; text-decoration: none; font-weight: bold; display: inline-block;">Open your parcel</a>
            </p>
            <p style="font-size: 12px; color: #6b6255;">Or copy this link: ${link}</p>
          </div>
        `,
      });
      emailStatus = 'sent';
    } catch (err) {
      console.error('SendGrid email failure:', err.response ? err.response.body : err.message);
      emailStatus = 'failed';
      emailError = err.response ? JSON.stringify(err.response.body) : err.message;
    }
  }

  res.json({ id, link, emailStatus, emailError });
});

app.get('/p/:id', (req, res) => {
  const pkg = db.getPackage(req.params.id);
  if (!pkg) return res.status(404).render('not-found');

  const items = db
    .getItems(pkg.id)
    .map((item) => {
      if (item.type === 'video' || item.type === 'music') {
        return { ...item, embed: embedForUrl(item.type, item.content) };
      }
      return item;
    });

  res.render('package', { pkg, items });
});

app.listen(PORT, () => {
  console.log(`A Little Box of Goodies running at ${BASE_URL}`);
  if (!process.env.SENDGRID_API_KEY) {
    console.log('⚠️ SENDGRID_API_KEY is not set — emails will not send.');
  }
});