const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(__dirname, 'uploads');
const galleryDir = path.join(uploadDir, 'gallery');
const dataFile = path.join(__dirname, 'registrations.json');
const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-admin-password';
const sessionTtlMs = 1000 * 60 * 60 * 8;
const sessions = new Map();

for (const dir of [uploadDir, galleryDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, '[]', 'utf8');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(data));
}

function readRegistrations() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    return [];
  }
}

function writeRegistrations(items) {
  fs.writeFileSync(dataFile, JSON.stringify(items, null, 2), 'utf8');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function validateRegistration(data) {
  const required = [
    'childName', 'childAge', 'parentName', 'email', 'phone',
    'emergencyContact', 'emergencyPhone', 'signatureData'
  ];
  for (const field of required) {
    if (!data[field]) {
      return `Missing required field: ${field}`;
    }
  }

  const age = Number.parseInt(data.childAge, 10);
  if (Number.isNaN(age) || age < 6 || age > 18) {
    return 'Age must be between 6 and 18.';
  }

  if (!data.agreed) {
    return 'Consent checkbox must be accepted.';
  }

  if (!/^data:image\/png;base64,/.test(data.signatureData)) {
    return 'Invalid signature format.';
  }

  return null;
}

function listGalleryImages() {
  return fs
    .readdirSync(galleryDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ src: `/uploads/gallery/${name}`, caption: path.parse(name).name.replace(/[_-]/g, ' ') }));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + sessionTtlMs);
  return token;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + sessionTtlMs);
  return true;
}

function clearSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;
  if (token) {
    sessions.delete(token);
  }
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function serveStatic(req, res) {
  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(requestPath).replace(/^\.+/, '');

  if (safePath.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, safePath);
    if (!filePath.startsWith(uploadDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    return serveFile(res, filePath);
  }

  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  return serveFile(res, filePath);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/admin/login') {
    try {
      const data = await parseJsonBody(req);
      if (data.password !== adminPassword) {
        return sendJson(res, 401, { error: 'Invalid admin password.' });
      }
      const token = createSession();
      return sendJson(
        res,
        200,
        { message: 'Logged in.' },
        { 'Set-Cookie': `admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionTtlMs / 1000}` }
      );
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'Invalid request body.' });
    }
  }

  if (req.method === 'POST' && req.url === '/api/admin/logout') {
    clearSession(req);
    return sendJson(
      res,
      200,
      { message: 'Logged out.' },
      { 'Set-Cookie': 'admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' }
    );
  }

  if (req.method === 'GET' && req.url === '/api/admin/session') {
    return sendJson(res, 200, { authenticated: isAuthenticated(req) });
  }

  if (req.method === 'GET' && req.url === '/api/registrations') {
    if (!isAuthenticated(req)) {
      return sendJson(res, 401, { error: 'Admin authentication required.' });
    }
    const registrations = readRegistrations().map(({ signatureData, ...rest }) => rest);
    return sendJson(res, 200, registrations);
  }

  if (req.method === 'GET' && req.url === '/api/gallery') {
    return sendJson(res, 200, { images: listGalleryImages() });
  }

  if (req.method === 'POST' && req.url === '/api/register') {
    try {
      const data = await parseJsonBody(req);
      const validationError = validateRegistration(data);
      if (validationError) {
        return sendJson(res, 400, { error: validationError });
      }

      const registrations = readRegistrations();
      const entry = {
        id: registrations.length ? registrations[registrations.length - 1].id + 1 : 1,
        created_at: new Date().toISOString(),
        child_name: data.childName.trim(),
        child_age: Number.parseInt(data.childAge, 10),
        parent_name: data.parentName.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        allergies: data.allergies?.trim() || '',
        medications: data.medications?.trim() || '',
        dietary_needs: data.dietaryNeeds?.trim() || '',
        emergency_contact: data.emergencyContact.trim(),
        emergency_phone: data.emergencyPhone.trim(),
        notes: data.notes?.trim() || '',
        consent_photo: data.consentPhoto ? 1 : 0,
        signatureData: data.signatureData
      };

      registrations.push(entry);
      writeRegistrations(registrations);
      return sendJson(res, 201, { id: entry.id, message: 'Registration submitted successfully.' });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'Invalid request body.' });
    }
  }

  return serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Camp website is running at http://localhost:${port}`);
});
