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

// --- LANGUAGE MODAL SETUP ---
let selectedLang = 'id';  // default Bahasa Indonesia

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
      // revert back
      mdl.style.transform = 'translateY(0%)';
    }
  });
}

langBtn.addEventListener('click', () => {
  languageModal.classList.add('open');
  document.body.classList.add('modal-open');
});

// pilih bahasa
langOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedLang = btn.dataset.lang;
    langOptions.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    // tutup modal setelah pilih
    languageModal.classList.remove('open');
    document.body.classList.remove('modal-open');
  });
});

// swipe-to-dismiss
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
  // reset
  languageModal.style.transform = '';
  setTimeout(() => {
    languageModal.style.transition = '';
  }, 200);
});

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

  const utter = new SpeechSynthesisUtterance();
  // atur bahasa dan teks
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
  // Toggle state
  autoSpeakEnabled = !autoSpeakEnabled;

  // Update ARIA state
  toggleAutoSpeakBtn.setAttribute('aria-checked', String(autoSpeakEnabled));

  // Update tampilan tombol
  if (autoSpeakEnabled) {
    toggleAutoSpeakBtn.innerHTML =
      '<i class="bi bi-megaphone" aria-hidden="true"></i> Auto-Read: ON';
    toggleAutoSpeakBtn.classList.replace('btn-outline-primary', 'btn-primary');
    // Jalankan fungsi bicara dengan nilai terkini
    const value = parseFloat(magneticValueEl.textContent) || 0;
    speakValue(value);
  } else {
    toggleAutoSpeakBtn.innerHTML =
      '<i class="bi bi-megaphone" aria-hidden="true"></i> Auto-Read: OFF';
    toggleAutoSpeakBtn.classList.replace('btn-primary', 'btn-outline-primary');
  }
}

const cardInfo = {
  'magnetic-value': {
    title: 'Magnetic Field Value Formula',
    html: `
      <div class="formulation-container">
        <h3>1. Voltage Reading and Signal Processing</h3>
        <p>The voltage measurement employs digital signal averaging to minimize noise interference:</p>
        <div class="formula-block">
          <strong>V<sub>avg</sub> = <span class="fraction">1<span class="divisor">n</span></span> × Σ<sub>i=1</sub><sup>n</sup> V<sub>ADC,i</sub> × <span class="fraction">V<sub>ref</sub><span class="divisor">2<sup>m</sup> - 1</span></span></strong>
        </div>
        <p>Where:</p>
        <ul>
          <li><strong>V<sub>avg</sub></strong> = Average voltage reading (V)</li>
          <li><strong>n</strong> = Number of samples</li>
          <li><strong>V<sub>ADC,i</sub></strong> = i-th ADC reading (digital count)</li>
          <li><strong>V<sub>ref</sub></strong> = Reference voltage (5.0 V)</li>
          <li><strong>m</strong> = ADC resolution bits (10-bit = 1023 max count)</li>
        </ul>
        
        <h3>2. Zero-Field Calibration</h3>
        <p>The quiescent voltage represents the sensor output under zero magnetic field conditions:</p>
        <div class="formula-block">
          <strong>V<sub>Q</sub> = V<sub>avg</sub>|<sub>B=0</sub></strong>
        </div>
        <p>This calibration compensates for:</p>
        <ul>
          <li>DC offset variations</li>
          <li>Temperature drift effects</li>
          <li>Supply voltage fluctuations</li>
        </ul>

        <h3>3. Magnetic Field in Gauss</h3>
        <p>The magnetic field intensity is calculated using the differential voltage method:</p>
        <div class="formula-block">
          <strong>B<sub>Gauss</sub> = <span class="fraction">(V<sub>out</sub> - V<sub>Q</sub>)<span class="divisor">S</span></span></strong>
        </div>
        <p>Where:</p>
        <ul>
          <li><strong>B<sub>Gauss</sub></strong> = Magnetic field strength (Gauss)</li>
          <li><strong>V<sub>out</sub></strong> = Current sensor output voltage (V)</li>
          <li><strong>V<sub>Q</sub></strong> = Quiescent voltage at zero field (V)</li>
          <li><strong>S</strong> = Sensor sensitivity (V/Gauss)</li>
        </ul>

        <h3>4. Magnetic Field in Tesla (SI Unit)</h3>
        <p>Conversion from Gauss to Tesla follows the standard electromagnetic unit relationship:</p>
        <div class="formula-block">
          <strong>B<sub>Tesla</sub> = <span class="fraction">B<sub>Gauss</sub><span class="divisor">10<sup>4</sup></span></span></strong>
        </div>
        <p>Since: <strong>1 Tesla = 10,000 Gauss</strong></p>

        <h3>5. Complete Mathematical Substitution</h3>
        <p>Substituting all equations yields the final expression:</p>
        <div class="formula-block">
          <strong>B<sub>T</sub> = <span class="fraction">1<span class="divisor">10<sup>4</sup> × S</span></span> × [<span class="fraction">1<span class="divisor">n</span></span> × Σ<sub>i=1</sub><sup>n</sup> V<sub>ADC,i</sub> × <span class="fraction">V<sub>ref</sub><span class="divisor">2<sup>m</sup> - 1</span></span> - V<sub>Q</sub>]</strong>
        </div>

        <div class="code-implementation">
          <h4>C++ Implementation Reference:</h4>
          <pre><code>// Voltage averaging with noise reduction
float MagnetSensor::readVoltage() {
  float sum = 0;
  for(int i=0; i&lt;samples; i++) {
    sum += analogRead(pin);           // V_ADC,i acquisition
    delayMicroseconds(100);          // Anti-aliasing delay
  }
  return (sum / samples) * (5.0 / 1023.0);  // V_avg calculation
}

// Zero-field calibration
void MagnetSensor::calibrateZeroField() {
  vQuiescent = readVoltage();        // V_Q determination
}

// Field calculation in Gauss
float MagnetSensor::getFieldGauss() {
  float vOut = readVoltage();        // V_out measurement
  return (vOut - vQuiescent) / sensitivity;  // B_Gauss
}

// SI unit conversion
float MagnetSensor::getFieldTesla() {
  return getFieldGauss() / 10000.0;  // B_Tesla
}</code></pre>
        </div>

        <div class="technical-notes">
          <h4>Technical Considerations:</h4>
          <ul>
            <li><strong>Sampling Rate:</strong> 100μs delay ensures proper sensor response time (3μs) compliance</li>
            <li><strong>Resolution:</strong> 10-bit ADC provides ~4.9mV resolution with 5V reference</li>
            <li><strong>Sensitivity:</strong> Typical Hall sensors: 1.3-5.0 mV/Gauss</li>
            <li><strong>Noise Reduction:</strong> Multiple sampling reduces random noise by factor of √n</li>
          </ul>
        </div>
      </div>
    `
  },
  'sensor-config': {
    title: 'Sensor Configuration',
    html: `<img src="assets/sensor-circuit.png" alt="Sensor circuit diagram" class="img-fluid" />`
  },
  'history-chart': {
    title: 'Magnetic Field History',
    html: `<p>Grafik menampilkan perubahan medan magnet dari waktu ke waktu. Baca sumbu X untuk waktu dan sumbu Y untuk nilai medan (Tesla).</p>`
  },
  'field-viz': {
    title: 'Magnetic Field Visualization',
    html: `<p>Gunakan kontrol meter untuk mengukur kekuatan medan di posisi manapun. Seret untuk memindahkan meter, dan baca nilai B, Bx, By, dan θ pada bagian meter.</p>`
  },
  'raw-data': {
    title: 'Raw Data Table',
    html: `<p>Kolom <strong>Timestamp</strong> menunjukkan waktu pengukuran. Kolom <strong>Magnetic Field (T)</strong> adalah nilai medan magnet pada saat tersebut.</p>`
  }
};

// === MODAL FUNCTIONALITY ===
function showModal(title, content) {
  const modal = document.getElementById('dynamicModal');
  const modalTitle = document.getElementById('dynamicModalTitle');
  const modalBody = document.getElementById('dynamicModalBody');
  
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  
  // Show modal
  modal.style.display = 'block';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  
  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop fade show';
  document.body.appendChild(backdrop);
  
  // Add class to body
  document.body.classList.add('modal-open');
  
  // Focus on modal
  modal.focus();
}

function hideModal() {
  const modal = document.getElementById('dynamicModal');
  
  // Hide modal
  modal.style.display = 'none';
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  
  // Remove backdrop
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.remove();
  }
  
  // Remove class from body
  document.body.classList.remove('modal-open');
}

// Initialize modal triggers
function initModals() {
  const cards = document.querySelectorAll('.card[role="region"]');
  cards.forEach(card => {
    const header = card.querySelector('.card-header');
    header.classList.add('d-flex', 'justify-content-between', 'align-items-center');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-link p-0 ' + (header.classList.contains('text-white') ? 'text-white' : 'text-dark');
    btn.setAttribute('aria-label', 'More info');
    
    // Store key for later
    const key = card.getAttribute('data-information');
    btn.dataset.infoKey = key;
    btn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
    
    // Add click event listener
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const infoKey = btn.dataset.infoKey;
      const info = cardInfo[infoKey] || {};
      showModal(info.title || 'Information', info.html || '<p>No information available.</p>');
    });

    header.appendChild(btn);
  });
}

// Setup modal close functionality
function setupModalEvents() {
  const modal = document.getElementById('dynamicModal');
  const closeBtn = modal.querySelector('.btn-close');
  
  // Close button click
  if (closeBtn) {
    closeBtn.addEventListener('click', hideModal);
  }
  
  // Click outside modal to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideModal();
    }
  });
  
  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
      hideModal();
    }
  });
}

// Custom swipe to dismiss for modal
// Custom swipe to dismiss for modal - ONLY on header
function enableSwipeToDismiss() {
  const header = document.querySelector('#dynamicModal .modal-header'); // Target header saja
  const content = document.getElementById('swipeableModalContent');
  let yStart = null;
  let isSwipeActive = false;
  
  // Tambahkan visual indicator untuk swipe
  addSwipeIndicator(content);
  
  // Event listener hanya pada header
  header.addEventListener('touchstart', e => { 
    yStart = e.touches[0].clientY;
    isSwipeActive = true;
    // Reset transform jika ada
    content.style.transform = 'translateY(0)';
  });
  
  header.addEventListener('touchmove', e => {
    if (yStart === null || !isSwipeActive) return;
    
    const y = e.touches[0].clientY;
    const deltaY = y - yStart;
    
    if (deltaY > 0) {
      // Only allow downward swipe
      content.style.transform = `translateY(${deltaY}px)`;
      content.style.transition = 'none';
      
      // Prevent default untuk mencegah scroll pada header
      e.preventDefault();
    }
  });
  
  header.addEventListener('touchend', e => {
    if (yStart === null || !isSwipeActive) return;
    
    const y = e.changedTouches[0].clientY;
    const deltaY = y - yStart;
    
    content.style.transition = 'transform 0.3s ease';
    
    if (deltaY > 100) {
      // Swipe down threshold reached - close modal
      hideModal();
    } else {
      // Snap back
      content.style.transform = 'translateY(0)';
    }
    
    // Reset
    setTimeout(() => {
      content.style.transition = '';
      content.style.transform = '';
    }, 300);
    
    yStart = null;
    isSwipeActive = false;
  });
}

// Tambahkan visual indicator untuk swipe
function addSwipeIndicator(header) {
  // Tambahkan garis kecil di tengah header sebagai indicator
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    width: 40px;
    height: 7px;
    background: #ccc;
    border-radius: 12px;
    margin: 0px auto 0.001rem;
  `;
  
  // Insert di awal header
  header.insertBefore(indicator, header.firstChild);
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
  initModals();
  setupModalEvents();
  enableSwipeToDismiss();
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
