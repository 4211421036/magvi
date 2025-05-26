// Global variables
let magneticChart;
let autoSpeakEnabled = false;
let lastValue = 0;
let currentMagneticField = 0;
const speechSynthesis = window.speechSynthesis;

// Visualization constants
const COLS      = 9;    // grid 9×9
const maxAngle  = 90;   // sudut maksimal di kutub (°)
const maxShift  = 8;    // geser horizontal maksimal (px)

// Field meter variables
let fieldMeterEnabled = false;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };


// DOM Elements
const magneticValueEl    = document.getElementById('magneticValue');
const lastUpdateEl       = document.getElementById('lastUpdate');
const speakBtn           = document.getElementById('speakBtn');
const toggleAutoSpeakBtn = document.getElementById('toggleAutoSpeak');
const sensorTypeEl       = document.getElementById('sensorType');
const analogPinEl        = document.getElementById('analogPin');
const uptimeEl           = document.getElementById('uptime');
const dataTableEl        = document.getElementById('dataTable');
const fieldMeterB        = document.getElementById('fieldMeterB');
const fieldMeterBx       = document.getElementById('fieldMeterBx');
const fieldMeterBy       = document.getElementById('fieldMeterBy');
const fieldMeterTheta    = document.getElementById('fieldMeterTheta');

// --- init grid span (9×9) ---
const vizWrapper = document.getElementById('magnetViz');
for (let i = 0; i < COLS * COLS; i++) {
  const span = document.createElement('span');
  // set default CSS vars
  span.style.setProperty('--dx', '0px');
  span.style.setProperty('--ang', '0deg');
  span.style.setProperty('--delay', '0s');
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
        x:{ title:{display:true,text:'Time'}}
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
  magneticValueEl.textContent = B.toFixed(6)+' T';
  lastUpdateEl.textContent    = new Date().toLocaleTimeString();

  if (Math.abs(B - lastValue) > 1e-6) {
    lastValue = B;
    if (autoSpeakEnabled) speakValue(B);
  }

  updateChart(readings);
  updateTable(readings);
  updateMagnetViz(B);
  if (fieldMeterEnabled) {
      updateFieldMeter();
  }
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

// === updateMagnetViz: semua span selalu berputar menuju arah B ===
function updateMagnetViz(B) {
  // strength of effect [0..1]
  const amplitudeScale = Math.min(Math.abs(B) * 5, 1);
  const sign           = B >= 0 ? 1 : -1;
  const duration       = 2;    // detik
  const interval       = 0.1;  // delay antar-kolom (s)

  vizItems.forEach((el, idx) => {
    const col    = idx % COLS;
    const dNorm  = col / (COLS - 1);       // [0..1] dari kiri→kanan
    // compute per-span strength: dekat kutub lebih besar
    const t      = 1 - dNorm;               // [1..0]
    const angle  = sign * maxAngle * t * amplitudeScale;
    const dx     = -sign * maxShift * t * amplitudeScale;
    const delay  = col * interval;         // tiap kolom delay bertambah

    // set custom properties dengan satuan yang benar
    el.style.setProperty('--ang', `${angle}deg`);
    el.style.setProperty('--dx',  `${dx}px`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--duration', `${duration}s`);
  });
}

// Field meter functions
function calculateFieldAtPosition(x, y, containerRect) {
    // Normalize position to [-1, 1] range
    const normalizedX = (x - containerRect.width / 2) / (containerRect.width / 2);
    const normalizedY = (y - containerRect.height / 2) / (containerRect.height / 2);
    
    // Distance from center affects field strength
    const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    const baseMagnitude = currentMagneticField * 10000; // Convert to Gauss and scale
    
    // Simulate field variation based on position
    const magnitude = baseMagnitude * (1 + 0.3 * Math.sin(normalizedX * Math.PI) * Math.cos(normalizedY * Math.PI));
    
    // Calculate components
    const Bx = magnitude * Math.cos(normalizedX + normalizedY);
    const By = magnitude * Math.sin(normalizedX - normalizedY) * 0.3; // Smaller Y component
    const B = Math.sqrt(Bx * Bx + By * By);
    
    // Calculate angle
    const theta = Math.atan2(By, Bx) * 180 / Math.PI;
    
    return { B, Bx, By, theta };
}

function updateFieldMeter() {
    if (!fieldMeterEnabled) return;
    
    const container = document.querySelector('.visualization-container');
    const containerRect = container.getBoundingClientRect();
    const fieldMeterRect = fieldMeter.getBoundingClientRect();
    
    // Get field meter center position relative to container
    const centerX = fieldMeterRect.left + fieldMeterRect.width / 2 - containerRect.left;
    const centerY = fieldMeterRect.top + fieldMeterRect.height / 2 - containerRect.top;
    
    const field = calculateFieldAtPosition(centerX, centerY, containerRect);
    
    // Update field meter display
    fieldMeterB.textContent = `${field.B.toFixed(2)} G`;
    fieldMeterBx.textContent = `${field.Bx.toFixed(2)} G`;
    fieldMeterBy.textContent = `${field.By.toFixed(2)} G`;
    fieldMeterTheta.textContent = `${field.theta.toFixed(0)}°`;
}

function toggleFieldMeter() {
    fieldMeterEnabled = fieldMeterToggle.checked;
    
    if (fieldMeterEnabled) {
        fieldMeter.style.display = 'block';
        // Position at center initially
        const container = document.querySelector('.visualization-container');
        const containerRect = container.getBoundingClientRect();
        fieldMeter.style.left = `${containerRect.width / 2 - 60}px`;
        fieldMeter.style.top = `${containerRect.height / 2 - 40}px`;
        updateFieldMeter();
    } else {
        fieldMeter.style.display = 'none';
    }
}

// Drag functionality
function startDrag(e) {
    if (!fieldMeterEnabled) return;
    
    isDragging = true;
    fieldMeter.classList.add('dragging');
    
    const rect = fieldMeter.getBoundingClientRect();
    const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
    const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
    
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;
    
    e.preventDefault();
}

function drag(e) {
    if (!isDragging || !fieldMeterEnabled) return;
    
    const container = document.querySelector('.visualization-container');
    const containerRect = container.getBoundingClientRect();
    
    const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
    const clientY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
    
    let newX = clientX - containerRect.left - dragOffset.x;
    let newY = clientY - containerRect.top - dragOffset.y;
    
    // Keep within container bounds
    const meterRect = fieldMeter.getBoundingClientRect();
    newX = Math.max(0, Math.min(newX, containerRect.width - meterRect.width));
    newY = Math.max(0, Math.min(newY, containerRect.height - meterRect.height));
    
    fieldMeter.style.left = `${newX}px`;
    fieldMeter.style.top = `${newY}px`;
    
    updateFieldMeter();
    e.preventDefault();
}

function endDrag() {
    if (isDragging) {
        isDragging = false;
        fieldMeter.classList.remove('dragging');
    }
}


// === EVENT LISTENERS ===
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  fetchData().then(processData);
  setInterval(()=>fetchData().then(processData), 5000);
  speakBtn.addEventListener('click', ()=>speakValue(parseFloat(magneticValueEl.textContent)||0));
  toggleAutoSpeakBtn.addEventListener('click', handleAutoSpeakToggle);
});
