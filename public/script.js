const form = document.getElementById('registrationForm');
const formMessage = document.getElementById('formMessage');
const tableBody = document.getElementById('registrationTableBody');
const refreshButton = document.getElementById('refreshRegistrations');
const galleryGrid = document.getElementById('galleryGrid');

const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginCard = document.getElementById('adminLoginCard');
const adminPanel = document.getElementById('adminPanel');
const adminAuthMessage = document.getElementById('adminAuthMessage');
const adminLogoutButton = document.getElementById('adminLogoutButton');

const canvas = document.getElementById('signaturePad');
const ctx = canvas.getContext('2d');
let drawing = false;
let signed = false;

ctx.strokeStyle = '#0f172a';
ctx.lineWidth = 2;
ctx.lineCap = 'round';

function getCanvasPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const touch = event.touches?.[0];
  const clientX = touch ? touch.clientX : event.clientX;
  const clientY = touch ? touch.clientY : event.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startDrawing(event) {
  drawing = true;
  const pos = getCanvasPosition(event);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  event.preventDefault();
}

function draw(event) {
  if (!drawing) return;
  const pos = getCanvasPosition(event);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  signed = true;
  event.preventDefault();
}

function stopDrawing() {
  drawing = false;
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);
canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing);

function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signed = false;
}
document.getElementById('clearSignature').addEventListener('click', clearSignature);

function setAdminUI(isAuthenticated) {
  adminLoginCard.classList.toggle('hidden', isAuthenticated);
  adminPanel.classList.toggle('hidden', !isAuthenticated);
  adminAuthMessage.textContent = '';
  if (!isAuthenticated) {
    tableBody.innerHTML = '<tr><td colspan="6">Admin login required.</td></tr>';
  }
}

async function checkAdminSession() {
  try {
    const response = await fetch('/api/admin/session');
    const data = await response.json();
    setAdminUI(Boolean(data.authenticated));
    if (data.authenticated) {
      await loadRegistrations();
    }
  } catch (error) {
    setAdminUI(false);
  }
}

async function loadGallery() {
  galleryGrid.innerHTML = '<p>Loading pictures...</p>';
  try {
    const response = await fetch('/api/gallery');
    if (!response.ok) throw new Error('Could not load gallery.');
    const data = await response.json();
    if (!data.images.length) {
      galleryGrid.innerHTML = '<p>No gallery pictures yet.</p>';
      return;
    }

    galleryGrid.innerHTML = data.images
      .map((img) => `
        <figure class="photo-card">
          <img src="${img.src}" alt="${img.caption}" loading="lazy" />
          <figcaption>${img.caption}</figcaption>
        </figure>
      `)
      .join('');
  } catch (error) {
    galleryGrid.innerHTML = `<p>${error.message}</p>`;
  }
}

async function loadRegistrations() {
  tableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  try {
    const response = await fetch('/api/registrations');
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        setAdminUI(false);
      }
      throw new Error(data.error || 'Could not load registrations');
    }

    if (!data.length) {
      tableBody.innerHTML = '<tr><td colspan="6">No registrations yet.</td></tr>';
      return;
    }

    tableBody.innerHTML = data
      .map((row) => `
        <tr>
          <td>${new Date(row.created_at).toLocaleDateString()}</td>
          <td>${row.child_name}</td>
          <td>${row.child_age}</td>
          <td>${row.parent_name}</td>
          <td>${row.email}<br>${row.phone}<br><small>Emergency: ${row.emergency_contact} (${row.emergency_phone})</small></td>
          <td>
            <strong>Allergies:</strong> ${row.allergies || '-'}<br>
            <strong>Medication:</strong> ${row.medications || '-'}<br>
            <strong>Diet:</strong> ${row.dietary_needs || '-'}<br>
            <strong>Photos:</strong> ${row.consent_photo ? 'Yes' : 'No'}<br>
            <strong>Notes:</strong> ${row.notes || '-'}
          </td>
        </tr>
      `)
      .join('');
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
  }
}

refreshButton.addEventListener('click', loadRegistrations);

adminLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  adminAuthMessage.style.color = '#1e40af';
  adminAuthMessage.textContent = 'Logging in...';
  const formData = new FormData(adminLoginForm);

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: formData.get('password') })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed.');

    adminLoginForm.reset();
    setAdminUI(true);
    await loadRegistrations();
  } catch (error) {
    adminAuthMessage.style.color = '#dc2626';
    adminAuthMessage.textContent = error.message;
  }
});

adminLogoutButton.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  setAdminUI(false);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';

  if (!signed) {
    formMessage.style.color = '#dc2626';
    formMessage.textContent = 'Please provide a parent signature before submitting.';
    return;
  }

  const formData = new FormData(form);
  const payload = {
    childName: formData.get('childName'),
    childAge: formData.get('childAge'),
    parentName: formData.get('parentName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    allergies: formData.get('allergies'),
    medications: formData.get('medications'),
    dietaryNeeds: formData.get('dietaryNeeds'),
    emergencyContact: formData.get('emergencyContact'),
    emergencyPhone: formData.get('emergencyPhone'),
    notes: formData.get('notes'),
    consentPhoto: formData.get('consentPhoto') === 'on',
    agreed: formData.get('agreed') === 'on',
    signatureData: canvas.toDataURL('image/png')
  };

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Submission failed');

    formMessage.style.color = '#15803d';
    formMessage.textContent = 'Registration sent successfully.';
    form.reset();
    clearSignature();
  } catch (error) {
    formMessage.style.color = '#dc2626';
    formMessage.textContent = error.message;
  }
});

loadGallery();
checkAdminSession();
