// Global variables
let magneticChart;
let autoSpeakEnabled = false;
let lastValue = 0;
const speechSynthesis = window.speechSynthesis;

// Visualization constants
const COLS     = 9;    // grid 9×9
const maxAngle = 90;   // rotasi maksimal di kutub (°)
const maxShift = 8;    // pergeseran horizontal maksimal (px)
let prevAffected = new Set();  // span yang sebelumnya terpengaruh

// DOM Elements
const magneticValueEl    = document.getElementById('magneticValue');
const lastUpdateEl       = document.getElementById('lastUpdate');
const speakBtn           = document.getElementById('speakBtn');
const toggleAutoSpeakBtn = document.getElementById('toggleAutoSpeak');
const sensorTypeEl       = document.getElementById('sensorType');
const analogPinEl        = document.getElementById('analogPin');
const uptimeEl           = document.getElementById('uptime');
const dataTableEl        = document.getElementById('dataTable');

// --- inisialisasi magnet visualization (9×9 grid) ---
const vizWrapper = document.getElementById('magnetViz');
for (let i = 0; i < COLS * COLS; i++) {
  const span = document.createElement('span');
  span.style.transition = 'transform 0.3s ease-out';
  vizWrapper.appendChild(span);
}
const vizItems = Array.from(vizWrapper.querySelectorAll('span'));

// Initialize Chart
function initChart() {
  const ctx = document.getElementById('magneticChart').getContext('2d');
  magneticChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Magnetic Field (T)',
        data: [],
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderWidth: 2,
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: false, title: { display: true, text: 'Tesla (T)' } },
        x: { title: { display: true, text: 'Time' } }
      },
      animation: { duration: 1000 }
    }
  });
}

// Fetch data from GitHub
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

// Process & display
function processData(data) {
  if (!data) return;
  // config
  sensorTypeEl.textContent = data.config?.sensorType || 'Magnetometer';
  analogPinEl.textContent  = data.config?.analogPin  || 'A0';
  uptimeEl.textContent     = data.uptime             || '0';
  const readings = data.readings || [];
  if (!readings.length) return;

  const latest = readings[readings.length - 1];
  const B      = parseFloat(latest.magneticField) || 0;
  magneticValueEl.textContent = B.toFixed(6) + ' T';
  lastUpdateEl.textContent    = new Date().toLocaleTimeString();

  if (Math.abs(B - lastValue) > 1e-6) {
    lastValue = B;
    if (autoSpeakEnabled) speakValue(B);
  }

  updateChart(readings);
  updateTable(readings);

  // panggil visualisasi
  updateMagnetViz(B);
}

// Chart & Table
function updateChart(readings) {
  const dr = readings.slice(-20);
  magneticChart.data.labels = dr.map(r => new Date(r.timestamp*1000).toLocaleTimeString());
  magneticChart.data.datasets[0].data = dr.map(r => parseFloat(r.magneticField) || 0);
  magneticChart.update();
}
function updateTable(readings) {
  dataTableEl.innerHTML = '';
  readings.slice(-10).reverse().forEach(r => {
    const t = new Date(r.timestamp*1000).toLocaleTimeString();
    const v = (parseFloat(r.magneticField)||0).toFixed(6);
    dataTableEl.innerHTML += `<tr><td>${t}</td><td>${v}</td></tr>`;
  });
}

// Text-to-speech
function speakValue(v) {
  if (!speechSynthesis) return;
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`Magnetic field is ${v.toFixed(6)} Tesla`);
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// Auto-speak toggle
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

// === fungsi animasi span per-kutub ===
function updateMagnetViz(B) {
  const colRange    = Math.min(Math.abs(B) * 5, COLS);
  const sign        = B >= 0 ? 1 : -1;
  const newAffected = new Set();

  vizItems.forEach((el, idx) => {
    const col = idx % COLS;
    const d   = sign > 0 ? col : (COLS - 1 - col);

    if (d <= colRange) {
      newAffected.add(el);
      const t   = 1 - d/colRange;
      const ang = sign * maxAngle * t;
      const dx  = -sign * maxShift * t;

      setTimeout(() => {
        el.style.transform = `translateX(${dx}px) rotate(${ang}deg)`;
      }, d * 80);
    }
    else if (prevAffected.has(el)) {
      // reset yang dulu terpengaruh
      setTimeout(() => {
        el.style.transform = `translateX(0px) rotate(0deg)`;
      }, (colRange + 1) * 80);
    }
  });

  prevAffected = newAffected;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  fetchData().then(processData);
  setInterval(() => fetchData().then(processData), 5000);
  speakBtn.addEventListener('click', () => speakValue(parseFloat(magneticValueEl.textContent)||0));
  toggleAutoSpeakBtn.addEventListener('click', handleAutoSpeakToggle);
});
