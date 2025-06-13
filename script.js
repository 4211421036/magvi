let magneticChart;
let autoSpeakEnabled = false;
let lastValue = 0;
let currentMagneticFieldRaw = 0;
let currentMagneticField = 0;
let zeroOffset = 0;
const speechSynthesis = window.speechSynthesis;

let lastTimestamp = null;

const COLS      = 9;
const maxAngle  = 90;
const maxShift  = 8;

let fieldMeterEnabled = false;
let isDragging       = false;
let dragOffset       = { x: 0, y: 0 };

const magneticValueEl    = document.getElementById('magneticValue');
const lastUpdateEl       = document.getElementById('lastUpdate');
const speakBtn           = document.getElementById('speakBtn');
const toggleAutoSpeakBtn = document.getElementById('toggleAutoSpeak');
const calibrateBtn       = document.getElementById('calibrate-btn');
const sensorTypeEl       = document.getElementById('sensorType');
const analogPinEl        = document.getElementById('analogPin');
const uptimeEl           = document.getElementById('uptime');
const dataTableEl        = document.getElementById('dataTable');

const vizWrapper         = document.getElementById('magnetViz');
const fieldMeter         = document.getElementById('fieldMeter');
const fieldMeterToggle   = document.getElementById('fieldMeterToggle');
const fieldMeterB        = document.getElementById('fieldMeterB');
const fieldMeterBx       = document.getElementById('fieldMeterBx');
const fieldMeterBy       = document.getElementById('fieldMeterBy');
const fieldMeterTheta    = document.getElementById('fieldMeterTheta');

const wrapperRect = () => vizWrapper.getBoundingClientRect();
const cellW = () => wrapperRect().width  / COLS;
const cellH = () => wrapperRect().height / COLS;

const container = vizWrapper.parentElement;
const containerRect = () => container.getBoundingClientRect();

let selectedLang = 'id';

const langBtn      = document.getElementById('langBtn');
const languageModal= document.getElementById('languageModal');
const langOptions  = languageModal.querySelectorAll('.lang-option');

const infoIcon = document.getElementById('infoIcon');
const mdl = document.getElementById('infoModal');

const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

if (isTouchDevice()) {
  infoIcon.removeAttribute("title");

  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  infoIcon.addEventListener("click", () => {
    mdl.classList.add("active");
    document.body.classList.add('modal-open');
    mdl.style.transition = 'transform 0.3s ease';
    mdl.style.transform = 'translateY(0%)';
  });

  mdl.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    mdl.style.transition = 'none';
  });

  mdl.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    let delta = currentY - startY;
    if (delta > 0) {
      mdl.style.transform = `translateY(${delta}px)`;
    }
  });

  mdl.addEventListener("touchend", () => {
    if (!isDragging) return;
    isDragging = false;
    const delta = currentY - startY;

    mdl.style.transition = 'transform 0.2s ease';
    if (delta > 20) {
      // close
      mdl.style.transform = 'translateY(100%)';
      setTimeout(() => {
        mdl.classList.remove("active");
        document.body.classList.remove('modal-open');
      }, 200);
    } else {
      mdl.style.transform = 'translateY(0%)';
    }
  });
}

langBtn.addEventListener('click', () => {
  languageModal.classList.add('open');
  document.body.classList.add('modal-open');
});

langOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedLang = btn.dataset.lang;
    langOptions.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    languageModal.classList.remove('open');
    document.body.classList.remove('modal-open');
  });
});

let startY = 0, currentY = 0, dragging = false;
languageModal.addEventListener('touchstart', e => {
  startY = e.touches[0].clientY;
  dragging = true;
});
languageModal.addEventListener('touchmove', e => {
  if (!dragging) return;
  currentY = e.touches[0].clientY;
  const delta = currentY - startY;
  if (delta > 0) {
    languageModal.style.transform = `translateY(${delta}px)`;
  }
});
languageModal.addEventListener('touchend', e => {
  dragging = false;
  const delta = currentY - startY;
  languageModal.style.transition = 'transform 0.2s ease';
  if (delta > 80) {
    // dismiss
    languageModal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
  languageModal.style.transform = '';
  setTimeout(() => {
    languageModal.style.transition = '';
  }, 200);
});

for (let i = 0; i < COLS * COLS; i++) {
  const span = document.createElement('span');
  span.style.setProperty('--dx',       '0px');
  span.style.setProperty('--ang',      '0deg');
  span.style.setProperty('--delay',    '0s');
  span.style.setProperty('--duration', '2s');
  vizWrapper.appendChild(span);
}
const vizItems = Array.from(vizWrapper.querySelectorAll('span'));

function initChart() {
  const ctx = document.getElementById('magneticChart').getContext('2d');
  magneticChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Magnetic Field (T)',
      data: [], borderWidth:2, tension:0.1, fill:true,
      borderColor:'rgba(75,192,192,1)', backgroundColor:'rgba(75,192,192,0.2)'
    }]},
    options: { responsive:true, animation:{duration:1000},
      scales:{
        y:{beginAtZero:false, title:{display:true,text:'Tesla (T)'}},
        x:{title:{display:true,text:'Time'}}
      }
    }
  });
}

async function fetchData() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/4211421036/magvi/main/magnet_data.json');
    if (!res.ok) throw new Error('Fetch failed');
    return await res.json();
  } catch (e) {
    console.error('Error fetching data:', e);
    return null;
  }
}

calibrateBtn.addEventListener('click', () => {
  zeroOffset = currentMagneticFieldRaw;
  magneticValueEl.textContent = '0.000000 T';
  lastUpdateEl.textContent    = new Date().toLocaleTimeString();
});

// —————— MULAI: Definisi fungsi modal ——————

function initModals() {
  const cards = document.querySelectorAll('.card[role="region"]');
  cards.forEach(card => {
    const header = card.querySelector('.card-header');
    header.classList.add('d-flex', 'justify-content-between', 'align-items-center');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-link p-0 ' + (header.classList.contains('text-white') ? 'text-white' : 'text-dark');
    btn.setAttribute('aria-label', 'More info');

    // Simpan key untuk nanti menampilkan konten modal
    const key = card.getAttribute('data-information');
    btn.dataset.infoKey = key;
    btn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const infoKey = btn.dataset.infoKey;
      const info = cardInfo[infoKey] || {};
      showModal(info.title || 'Information', info.html || '<p>No information available.</p>');
    });

    header.appendChild(btn);
  });
}

function setupModalEvents() {
  const modal = document.getElementById('dynamicModal');
  const closeBtn = modal.querySelector('.btn-close');

  if (closeBtn) {
    closeBtn.addEventListener('click', hideModal);
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
      hideModal();
    }
  });
}

function enableSwipeToDismiss() {
  const header = document.querySelector('#dynamicModal .modal-header');
  const content = document.getElementById('swipeableModalContent');
  let yStart = null, isSwipeActive = false;

  addSwipeIndicator(content);

  header.addEventListener('touchstart', e => {
    yStart = e.touches[0].clientY;
    isSwipeActive = true;
    content.style.transform = 'translateY(0)';
  });

  header.addEventListener('touchmove', e => {
    if (!isSwipeActive) return;
    const y = e.touches[0].clientY;
    const deltaY = y - yStart;
    if (deltaY > 0) {
      content.style.transform = `translateY(${deltaY}px)`;
      content.style.transition = 'none';
      e.preventDefault();
    }
  });

  header.addEventListener('touchend', e => {
    if (!isSwipeActive) return;
    const y = e.changedTouches[0].clientY;
    const deltaY = y - yStart;
    content.style.transition = 'transform 0.3s ease';
    if (deltaY > 100) {
      hideModal();
    } else {
      content.style.transform = 'translateY(0)';
    }
    setTimeout(() => {
      content.style.transition = '';
      content.style.transform = '';
    }, 300);
    yStart = null;
    isSwipeActive = false;
  });
}

function addSwipeIndicator(header) {
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    width: 40px;
    height: 7px;
    background: #ccc;
    border-radius: 12px;
    margin: 0 auto 4px;
  `;
  header.insertBefore(indicator, header.firstChild);
}

function showModal(title, content) {
  const modal = document.getElementById('dynamicModal');
  const modalTitle = document.getElementById('dynamicModalTitle');
  const modalBody = document.getElementById('dynamicModalBody');

  modalTitle.textContent = title;
  modalBody.innerHTML = content;

  modal.style.display = 'block';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop fade show';
  document.body.appendChild(backdrop);

  document.body.classList.add('modal-open');
  modal.focus();
}

function hideModal() {
  const modal = document.getElementById('dynamicModal');
  modal.style.display = 'none';
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');

  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) backdrop.remove();

  document.body.classList.remove('modal-open');
}


function processData(data) {
  if (!data) return;

  sensorTypeEl.textContent = data.config?.sensorType || 'Magnetometer';
  analogPinEl.textContent  = data.config?.analogPin  || 'A0';
  uptimeEl.textContent     = data.uptime             || '0';

  const readings = data.readings || [];
  if (!readings.length) {
    magneticValueEl.textContent = '0.000000 T';
    lastUpdateEl.textContent    = 'Never';
    return;
  }

  const latest = readings[readings.length - 1];
  const ts     = latest.timestamp;
  const B      = parseFloat(latest.magneticField) || 0;

  if (lastTimestamp === null) {
    magneticValueEl.textContent = '0.000000 T';
    lastUpdateEl.textContent    = 'Never';
    lastTimestamp = ts;
    return;
  }

  if (ts !== lastTimestamp) {
    magneticValueEl.textContent = '0.000000 T';
    lastUpdateEl.textContent    = 'Loading...'; 
    setTimeout(() => {
      currentMagneticFieldRaw = B;
      currentMagneticField    = B - zeroOffset;

      magneticValueEl.textContent = currentMagneticField.toFixed(6) + ' T';
      lastUpdateEl.textContent    = new Date().toLocaleTimeString();

      if (Math.abs(currentMagneticField - lastValue) > 1e-6) {
        lastValue = currentMagneticField;
        if (autoSpeakEnabled) speakValue(currentMagneticField);
      }

      updateChart(readings, zeroOffset);
      updateTable(readings, zeroOffset);
      updateMagnetViz(currentMagneticField);
      if (fieldMeterEnabled) updateFieldMeter();
    }, 500);

    lastTimestamp = ts;

  } else {
    magneticValueEl.textContent = '0.000000 T';
    lastUpdateEl.textContent    = 'Never';
  }
}

function updateChart(readings, offset) {
  const dr = readings.slice(-20);
  magneticChart.data.labels          = dr.map(r => new Date(r.timestamp * 1000).toLocaleTimeString());
  magneticChart.data.datasets[0].data = dr.map(r => (parseFloat(r.magneticField) || 0) - offset);
  magneticChart.update();
}

function updateTable(readings) {
  dataTableEl.innerHTML = '';
  readings.slice(-10).reverse().forEach(r => {
    const t = new Date(r.timestamp * 1000).toLocaleTimeString();
    const v = (parseFloat(r.magneticField) || 0).toFixed(6);
    dataTableEl.innerHTML += `<tr><td>${t}</td><td>${v}</td></tr>`;
  });
}

function speakValue(v) {
  if (!speechSynthesis) return;
  if (speechSynthesis.speaking) speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance();
  if (selectedLang === 'en') {
    utter.lang = 'en-US';
    utter.text = `Magnetic field is ${v.toFixed(6)} Tesla.`;
  } else {
    utter.lang = 'id-ID';
    utter.text = `Medan magnet adalah ${v.toFixed(6)} Tesla.`;
  }
  utter.rate = 0.9;
  speechSynthesis.speak(utter);
}

function handleAutoSpeakToggle() {
  autoSpeakEnabled = !autoSpeakEnabled;
  toggleAutoSpeakBtn.setAttribute('aria-checked', String(autoSpeakEnabled));
  if (autoSpeakEnabled) {
    toggleAutoSpeakBtn.innerHTML =
      '<i class="bi bi-megaphone" aria-hidden="true"></i> Auto-Read: ON';
    toggleAutoSpeakBtn.classList.replace('btn-outline-primary', 'btn-primary');
    const value = parseFloat(magneticValueEl.textContent) || 0;
    speakValue(value);
  } else {
    toggleAutoSpeakBtn.innerHTML =
      '<i class="bi bi-megaphone" aria-hidden="true"></i> Auto-Read: OFF';
    toggleAutoSpeakBtn.classList.replace('btn-primary', 'btn-outline-primary');
  }
}

function updateMagnetViz(B) {
  const amplitudeScale = Math.min(Math.abs(B) * 5, 1);
  const sign           = B >= 0 ? 1 : -1;
  const duration       = 2;
  const interval       = 0.1;

  vizItems.forEach((el, idx) => {
    const col   = idx % COLS;
    const dNorm = col / (COLS - 1);
    const t     = 1 - dNorm;
    const ang   = sign * maxAngle * t * amplitudeScale;
    const dx    = -sign * maxShift * t * amplitudeScale;
    const delay = col * interval;

    el.style.setProperty('--ang', `${ang}deg`);
    el.style.setProperty('--dx',  `${dx}px`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--duration', `${duration}s`);
  });
}

function calculateFieldAtPosition(x, y, bounds) {
  const nx = (x - bounds.width/2) / (bounds.width/2);
  const ny = (y - bounds.height/2) / (bounds.height/2);
  const base = currentMagneticField * 10000;
  const mag  = base * (1 + 0.3 * Math.sin(nx * Math.PI) * Math.cos(ny * Math.PI));
  const Bx   = mag * Math.cos(nx + ny);
  const By   = mag * Math.sin(nx - ny) * 0.3;
  const B    = Math.sqrt(Bx*Bx + By*By);
  const theta= Math.atan2(By, Bx) * 180 / Math.PI;
  return { B, Bx, By, theta };
}

function updateFieldMeter() {
  if (!fieldMeterEnabled) return;
  const fmRect = fieldMeter.getBoundingClientRect();
  const wrRect = wrapperRect();
  const cx = fmRect.left + fmRect.width/2  - wrRect.left;
  const cy = fmRect.top  + fmRect.height/2 - wrRect.top;

  let col = Math.floor(cx / cellW());
  let row = Math.floor(cy / cellH());
  col = Math.max(0, Math.min(COLS-1, col));
  row = Math.max(0, Math.min(COLS-1, row));
  const idx = row * COLS + col;
  const span = vizItems[idx];

  const B = currentMagneticField * 1e4;
  const angStr = span.style.getPropertyValue('--ang') || '0deg';
  const theta = parseFloat(angStr);
  const rad   = theta * Math.PI/180;

  const Bx = B * Math.cos(rad);
  const By = B * Math.sin(rad);

  fieldMeterB.textContent     = `${B.toFixed(2)} G`;
  fieldMeterBx.textContent    = `${Bx.toFixed(2)} G`;
  fieldMeterBy.textContent    = `${By.toFixed(2)} G`;
  fieldMeterTheta.textContent = `${theta.toFixed(0)}°`;
}

function toggleFieldMeter() {
  fieldMeterEnabled = fieldMeterToggle.checked;
  fieldMeter.style.display = fieldMeterEnabled ? 'block' : 'none';
  if (fieldMeterEnabled) {
    const bnds = containerRect();
    fieldMeter.style.left = `${(bnds.width - fieldMeter.offsetWidth)/2}px`;
    fieldMeter.style.top  = `${(bnds.height - fieldMeter.offsetHeight)/2}px`;
    updateFieldMeter();
  }
}

function startDrag(e) {
  if (!fieldMeterEnabled) return;
  isDragging = true;
  const bnds = fieldMeter.getBoundingClientRect();
  const cx   = (e.touches? e.touches[0].clientX: e.clientX);
  const cy   = (e.touches? e.touches[0].clientY: e.clientY);
  dragOffset.x = cx - bnds.left;
  dragOffset.y = cy - bnds.top;
  e.preventDefault();
}
function onDrag(e) {
  if (!isDragging) return;
  const bnds = containerRect();
  const cx   = (e.touches? e.touches[0].clientX: e.clientX);
  const cy   = (e.touches? e.touches[0].clientY: e.clientY);
  let nx = cx - bnds.left - dragOffset.x;
  let ny = cy - bnds.top  - dragOffset.y;
  nx = Math.max(0, Math.min(nx, bnds.width  - fieldMeter.offsetWidth));
  ny = Math.max(0, Math.min(ny, bnds.height - fieldMeter.offsetHeight));
  fieldMeter.style.left = `${nx}px`;
  fieldMeter.style.top  = `${ny}px`;
  updateFieldMeter();
  e.preventDefault();
}
function endDrag() { isDragging = false; }

document.addEventListener('DOMContentLoaded', () => {
  initChart();
  initModals();
  setupModalEvents();
  enableSwipeToDismiss();

  magneticValueEl.textContent = '0.000000 T';
  lastUpdateEl.textContent    = 'Never';

  fetchData().then(processData);
  setInterval(() => fetchData().then(processData), 500);

  speakBtn.addEventListener('click', () => speakValue(parseFloat(magneticValueEl.textContent) || 0));
  toggleAutoSpeakBtn.addEventListener('click', handleAutoSpeakToggle);

  fieldMeterToggle.addEventListener('change', toggleFieldMeter);
  fieldMeter.addEventListener('mousedown',  startDrag);
  fieldMeter.addEventListener('touchstart', startDrag, { passive:false });
  document.addEventListener('mousemove',    onDrag);
  document.addEventListener('touchmove',    onDrag, { passive:false });
  document.addEventListener('mouseup',      endDrag);
  document.addEventListener('touchend',     endDrag);
});
