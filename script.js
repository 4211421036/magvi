// Global variables
let magneticChart;
let autoSpeakEnabled = false;
let lastValue = 0;
let currentMagneticField = 0;
const speechSynthesis = window.speechSynthesis;

// Visualization constants
const COLS      = 9;
const maxAngle  = 90;
const maxShift  = 8;

// Field meter state
let fieldMeterEnabled = false;
let isDragging       = false;
let dragOffset       = { x: 0, y: 0 };

// DOM Elements
const magneticValueEl    = document.getElementById('magneticValue');
const lastUpdateEl       = document.getElementById('lastUpdate');
const speakBtn           = document.getElementById('speakBtn');
const toggleAutoSpeakBtn = document.getElementById('toggleAutoSpeak');
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

// setelah const vizItems = …
const wrapperRect = () => vizWrapper.getBoundingClientRect(); 
const cellW = () => wrapperRect().width  / COLS;
const cellH = () => wrapperRect().height / COLS;

// container for drag bounds
const container = vizWrapper.parentElement;
const containerRect = () => container.getBoundingClientRect();

// --- init grid span (9×9) ---
for (let i = 0; i < COLS * COLS; i++) {
  const span = document.createElement('span');
  span.style.setProperty('--dx',       '0px');
  span.style.setProperty('--ang',      '0deg');
  span.style.setProperty('--delay',    '0s');
  span.style.setProperty('--duration', '2s');
  vizWrapper.appendChild(span);
}
const vizItems = Array.from(vizWrapper.querySelectorAll('span'));

// === CHART & FETCH ===
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

function processData(data) {
  if (!data) return;
  sensorTypeEl.textContent = data.config?.sensorType || 'Magnetometer';
  analogPinEl.textContent  = data.config?.analogPin  || 'A0';
  uptimeEl.textContent     = data.uptime             || '0';

  const readings = data.readings || [];
  if (!readings.length) return;

  const latest = readings[readings.length - 1];
  const B      = parseFloat(latest.magneticField) || 0;
  currentMagneticField = B;                    // simpan untuk field meter
  magneticValueEl.textContent = B.toFixed(6)+' T';
  lastUpdateEl.textContent    = new Date().toLocaleTimeString();

  if (Math.abs(B - lastValue) > 1e-6) {
    lastValue = B;
    if (autoSpeakEnabled) speakValue(B);
  }

  updateChart(readings);
  updateTable(readings);
  updateMagnetViz(B);

  if (fieldMeterEnabled) updateFieldMeter();
}

function updateChart(readings) {
  const dr = readings.slice(-20);
  magneticChart.data.labels        = dr.map(r=>new Date(r.timestamp*1000).toLocaleTimeString());
  magneticChart.data.datasets[0].data = dr.map(r=>parseFloat(r.magneticField)||0);
  magneticChart.update();
}

function updateTable(readings) {
  dataTableEl.innerHTML = '';
  readings.slice(-10).reverse().forEach(r=>{
    const t = new Date(r.timestamp*1000).toLocaleTimeString();
    const v = (parseFloat(r.magneticField)||0).toFixed(6);
    dataTableEl.innerHTML += `<tr><td>${t}</td><td>${v}</td></tr>`;
  });
}

// === TTS & AUTO-SPEAK ===
function speakValue(v) {
  if (!speechSynthesis) return;
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`Magnetic field is ${v.toFixed(6)} Tesla`);
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

function handleAutoSpeakToggle() {
  autoSpeakEnabled = !autoSpeakEnabled;
  if (autoSpeakEnabled) {
    toggleAutoSpeakBtn.innerHTML = '<i class="bi bi-megaphone"></i> Auto-Read: ON';
    toggleAutoSpeakBtn.classList.replace('btn-outline-primary','btn-primary');
    speakValue(parseFloat(magneticValueEl.textContent)||0);
  } else {
    toggleAutoSpeakBtn.innerHTML = '<i class="bi bi-megaphone"></i> Auto-Read: OFF';
    toggleAutoSpeakBtn.classList.replace('btn-primary','btn-outline-primary');
  }
}

// === VISUALIZATION UPDATE ===
function updateMagnetViz(B) {
  const amplitudeScale = Math.min(Math.abs(B)*5, 1);
  const sign           = B>=0?1:-1;
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

// === FIELD METER ===
function calculateFieldAtPosition(x, y, bounds) {
  // normalized [-1..1]
  const nx = (x - bounds.width/2)/(bounds.width/2);
  const ny = (y - bounds.height/2)/(bounds.height/2);
  // base in Gauss
  const base = currentMagneticField * 10000;
  const mag  = base * (1 + 0.3*Math.sin(nx*Math.PI)*Math.cos(ny*Math.PI));
  const Bx   = mag * Math.cos(nx+ny);
  const By   = mag * Math.sin(nx-ny)*0.3;
  const B    = Math.sqrt(Bx*Bx + By*By);
  const theta= Math.atan2(By, Bx)*180/Math.PI;
  return { B, Bx, By, theta };
}

function updateFieldMeter() {
  if (!fieldMeterEnabled) return;

  // dapatkan koordinat tengah meter relatif ke wrapper
  const fmRect = fieldMeter.getBoundingClientRect();
  const wrRect = wrapperRect();
  const cx = fmRect.left + fmRect.width/2  - wrRect.left;
  const cy = fmRect.top  + fmRect.height/2 - wrRect.top;

  // cari indeks row/col di grid
  let col = Math.floor(cx / cellW());
  let row = Math.floor(cy / cellH());
  // clamp di 0..COLS-1
  col = Math.max(0, Math.min(COLS-1, col));
  row = Math.max(0, Math.min(COLS-1, row));
  const idx = row * COLS + col;
  const span = vizItems[idx];

  // magnitude = data sensor
  const B = currentMagneticField * 1e4;          // Tesla → Gauss
  // ambil sudut dari CSS var
  const angStr = span.style.getPropertyValue('--ang') || '0deg';
  const theta = parseFloat(angStr);              // derajat
  const rad   = theta * Math.PI/180;

  // komponen
  const Bx = B * Math.cos(rad);
  const By = B * Math.sin(rad);

  // update UI
  fieldMeterB.textContent     = `${B.toFixed(2)} G`;
  fieldMeterBx.textContent    = `${Bx.toFixed(2)} G`;
  fieldMeterBy.textContent    = `${By.toFixed(2)} G`;
  fieldMeterTheta.textContent = `${theta.toFixed(0)}°`;
}

function toggleFieldMeter() {
  fieldMeterEnabled = fieldMeterToggle.checked;
  fieldMeter.style.display = fieldMeterEnabled ? 'block' : 'none';
  if (fieldMeterEnabled) {
    // center it
    const bnds = containerRect();
    fieldMeter.style.left = `${(bnds.width - fieldMeter.offsetWidth)/2}px`;
    fieldMeter.style.top  = `${(bnds.height - fieldMeter.offsetHeight)/2}px`;
    updateFieldMeter();
  }
}

// === DRAG LISTENERS ===
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
  // constrain
  nx = Math.max(0, Math.min(nx, bnds.width  - fieldMeter.offsetWidth));
  ny = Math.max(0, Math.min(ny, bnds.height - fieldMeter.offsetHeight));
  fieldMeter.style.left = `${nx}px`;
  fieldMeter.style.top  = `${ny}px`;
  updateFieldMeter();
  e.preventDefault();
}
function endDrag() { isDragging = false; }

// === EVENT BINDING ===
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  fetchData().then(processData);
  setInterval(()=>fetchData().then(processData), 5000);

  speakBtn.addEventListener('click', ()=>speakValue(parseFloat(magneticValueEl.textContent)||0));
  toggleAutoSpeakBtn.addEventListener('click', handleAutoSpeakToggle);

  fieldMeterToggle.addEventListener('change', toggleFieldMeter);
  fieldMeter.addEventListener('mousedown',  startDrag);
  fieldMeter.addEventListener('touchstart', startDrag, {passive:false});
  document.addEventListener('mousemove',    onDrag);
  document.addEventListener('touchmove',    onDrag, {passive:false});
  document.addEventListener('mouseup',      endDrag);
  document.addEventListener('touchend',     endDrag);
});
