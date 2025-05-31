/*****************************************
 * decrypt-and-app.js
 *
 * 1) Bagian pertama: implementasi fungsi‐fungsi LAI (decryptor.js)
 * 2) Bagian kedua: “skeleton” aplikasi asli di dalam mainApp()
 *****************************************/

/*****************************************
 * BAGIAN 1: DECRYPTOR (LAI PORT) 
 *****************************************/

// Helper: convert ArrayBuffer → hex string
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// H_js(x, y, s, p): SHA-256(`${x}|${y}|${s}`) mod p
async function H_js(x, y, s, p) {
  const str = `${x}|${y}|${s}`;
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = bytesToHex(hashArray);
  const hashBig = BigInt("0x" + hashHex);
  return hashBig % BigInt(p);
}

// Modular exponentiation (BigInt): base^exp mod mod
function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

// Tonelli–Shanks untuk sqrt_mod(a, p)
function legendreSymbol(a, p) {
  return modPow(a, (p - 1n) / 2n, p);
}

function sqrt_mod_js(a_in, p_in) {
  const a = ((a_in % p_in) + p_in) % p_in;
  if (a === 0n) return 0n;
  const ls = legendreSymbol(a, p_in);
  if (ls === p_in - 1n) {
    return null;
  }
  // Jika p ≡ 3 mod 4, akarnya langsung:
  if ((p_in % 4n) === 3n) {
    return modPow(a, (p_in + 1n) / 4n, p_in);
  }
  // Tonelli–Shanks untuk kasus umum p ≡ 1 mod 4:
  let q = p_in - 1n;
  let s = 0n;
  while ((q & 1n) === 0n) {
    q >>= 1n;
    s += 1n;
  }
  let z = 2n;
  while (legendreSymbol(z, p_in) !== p_in - 1n) {
    z += 1n;
  }
  let m = s;
  let c = modPow(z, q, p_in);
  let t = modPow(a, q, p_in);
  let r = modPow(a, (q + 1n) / 2n, p_in);

  while (t !== 1n) {
    let t2i = t;
    let i = 0n;
    for (let j = 1n; j < m; j++) {
      t2i = (t2i * t2i) % p_in;
      if (t2i === 1n) {
        i = j;
        break;
      }
    }
    const b = modPow(c, 1n << (m - i - 1n), p_in);
    m = i;
    c = (b * b) % p_in;
    t = (t * c) % p_in;
    r = (r * b) % p_in;
  }
  return r;
}

// T_js(point, s, a, p) → [x', y']
async function T_js(point, s, a, p) {
  let [x, y] = [BigInt(point[0]), BigInt(point[1])];
  const inv2 = modPow(2n, BigInt(p) - 2n, BigInt(p)); // invers 2 mod p
  let trials = 0;
  let s_cur = BigInt(s);

  while (trials < 10) {
    const h_val = await H_js(x, y, s_cur, p);
    const x_cand = ((x + BigInt(a) + h_val) * inv2) % BigInt(p);
    const y_sq = (x * y + h_val) % BigInt(p);
    const y_cand = sqrt_mod_js(y_sq, BigInt(p));
    if (y_cand !== null) {
      return [x_cand, y_cand];
    }
    s_cur += 1n;
    trials += 1;
  }
  throw new Error(`T_js: Gagal menemukan sqrt untuk y^2 mod p setelah ${trials} percobaan.`);
}

// _pow_T_range_js(P, startS, exp, a, p)
async function _pow_T_range_js(P, startS, exp, a, p) {
  let result = [BigInt(P[0]), BigInt(P[1])];
  let s_idx = BigInt(startS);
  for (let i = 0; i < exp; i++) {
    result = await T_js(result, s_idx, a, p);
    s_idx += 1n;
  }
  return result;
}

// decrypt_block_js(C1, C2, k, r, a, p) → BigInt (M_int)
async function decrypt_block_js(C1, C2, k, r, a, p) {
  const p_big = BigInt(p);
  const a_big = BigInt(a);
  const C1_b = [BigInt(C1[0]), BigInt(C1[1])];
  const C2_b = [BigInt(C2[0]), BigInt(C2[1])];
  const k_big = BigInt(k);
  const r_big = BigInt(r);

  const startSeed = r_big + 1n; // seeds = (r+1), …, (r+k)
  const S = await _pow_T_range_js(C1_b, startSeed, Number(k_big), a_big, p_big);
  const M_int = (C2_b[0] - S[0] + p_big) % p_big;
  return M_int;
}

// decrypt_all_text_js(laiData) → String (isi JS asli)
async function decrypt_all_text_js(laiData) {
  const p_big = BigInt(laiData.p);
  const a_big = BigInt(laiData.a);
  const k_big = BigInt(laiData.k);
  const blocks = laiData.blocks; // array of { C1:[x1,y1], C2:[x2,y2], r }

  // Hitung ukuran blok B (bytes) agar saat konversi BigInt → bytes bisa tepat
  const bit_len = p_big.toString(2).length;
  const B = Math.floor((bit_len - 1) / 8);

  function intToBytes(m_int) {
    if (m_int === 0n) return new Uint8Array([0x00]);
    const arr = new Uint8Array(B); // kita force setiap blok jadi panjang B
    let temp = m_int;
    for (let i = B - 1; i >= 0; i--) {
      arr[i] = Number(temp & 0xffn);
      temp >>= 8n;
    }
    return arr;
  }

  let combined = new Uint8Array(0);
  for (const blk of blocks) {
    const M_int = await decrypt_block_js(blk.C1, blk.C2, laiData.k, blk.r, laiData.a, laiData.p);
    const chunkBytes = intToBytes(M_int);
    const tmp = new Uint8Array(combined.length + chunkBytes.length);
    tmp.set(combined, 0);
    tmp.set(chunkBytes, combined.length);
    combined = tmp;
  }

  const decoder = new TextDecoder("utf-8");
  return decoder.decode(combined);
}

// Expose ke global agar bisa dipanggil di bagian berikutnya
window.decrypt_all_text_js = decrypt_all_text_js;


/*****************************************
 * BAGIAN 2: APLIKASI ASLI (Skeleton di dalam mainApp)
 *****************************************/

// Variabel-variabel global (bisa diisi/diinisialisasi di dalam mainApp juga)
let magneticChart;
let autoSpeakEnabled = false;
let lastValue = 0;
let currentMagneticField = 0;
const speechSynthesis = window.speechSynthesis;

// Konstanta visualisasi
const COLS      = 9;
const maxAngle  = 90;
const maxShift  = 8;

// State untuk field meter
let fieldMeterEnabled = false;
let isDragging       = false;
let dragOffset       = { x: 0, y: 0 };

// DOM Elements (akan di‐ambil saat mainApp dipanggil)
let magneticValueEl;
let lastUpdateEl;
let speakBtn;
let toggleAutoSpeakBtn;
let sensorTypeEl;
let analogPinEl;
let uptimeEl;
let dataTableEl;
let vizWrapper;
let fieldMeter;
let fieldMeterToggle;
let fieldMeterB;
let fieldMeterBx;
let fieldMeterBy;
let fieldMeterTheta;
let vizItems;
let container, containerRect, wrapperRect, cellW, cellH;

// Fungsi-fungsi aplikasi:
// 1) initChart()
// 2) fetchData(), processData()
// 3) updateChart(), updateTable()
// 4) speakValue(), handleAutoSpeakToggle()
// 5) modal‐related: initModals(), setupModalEvents(), enableSwipeToDismiss()
// 6) visualisasi magnet: updateMagnetViz()
// 7) field meter: calculateFieldAtPosition(), updateFieldMeter(), toggleFieldMeter()
// 8) drag listeners: startDrag(), onDrag(), endDrag()
// Semua fungsi ini *sama persis* dengan kode asli Anda, kecuali kita hapus wrapper `document.addEventListener('DOMContentLoaded', …)`.  

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
      '<i class="bi bi-megaphone"></i> Auto-Read: ON';
    toggleAutoSpeakBtn.classList.replace('btn-outline-primary', 'btn-primary');
    const value = parseFloat(magneticValueEl.textContent) || 0;
    speakValue(value);
  } else {
    toggleAutoSpeakBtn.innerHTML =
      '<i class="bi bi-megaphone"></i> Auto-Read: OFF';
    toggleAutoSpeakBtn.classList.replace('btn-primary', 'btn-outline-primary');
  }
}

// Modal & swipe‐to‐dismiss
function initModals() {
  const cards = document.querySelectorAll('.card[role="region"]');
  cards.forEach(card => {
    const header = card.querySelector('.card-header');
    header.classList.add('d-flex', 'justify-content-between', 'align-items-center');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-link p-0 ' + (header.classList.contains('text-white') ? 'text-white' : 'text-dark');
    btn.setAttribute('aria-label', 'More info');
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
  const modal = document.getElementById('infoModal');
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
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      hideModal();
    }
  });
}

function enableSwipeToDismiss() {
  const header = document.querySelector('#infoModal .modal-header');
  const content = document.getElementById('swipeableModalContent');
  let yStart = null;
  let isSwipeActive = false;

  addSwipeIndicator(content);

  header.addEventListener('touchstart', e => {
    yStart = e.touches[0].clientY;
    isSwipeActive = true;
    content.style.transform = 'translateY(0)';
  });
  header.addEventListener('touchmove', e => {
    if (yStart === null || !isSwipeActive) return;
    const y = e.touches[0].clientY;
    const deltaY = y - yStart;
    if (deltaY > 0) {
      content.style.transform = `translateY(${deltaY}px)`;
      content.style.transition = 'none';
      e.preventDefault();
    }
  });
  header.addEventListener('touchend', e => {
    if (yStart === null || !isSwipeActive) return;
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
    height: 5px;
    background: #ccc;
    border-radius: 4px;
    margin: 0 auto 12px;
  `;
  header.insertBefore(indicator, header.firstChild);
}

// Formasi modal show/hide (jika Anda menggunakan modal manual)
function showModal(title, content) {
  const modal = document.getElementById('infoModal');
  const modalTitle = modal.querySelector('.modal-title');
  const modalBody = modal.querySelector('.db');
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modal.classList.add('active');
  document.body.classList.add('modal-open');
}

function hideModal() {
  const modal = document.getElementById('infoModal');
  modal.classList.remove('active');
  document.body.classList.remove('modal-open');
}

// Visualisasi magnet
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

// Hitung medan pada posisi (x,y) di grid
function calculateFieldAtPosition(x, y, bounds) {
  const nx = (x - bounds.width/2)/(bounds.width/2);
  const ny = (y - bounds.height/2)/(bounds.height/2);
  const base = currentMagneticField * 10000; // Tesla → Gauss
  const mag  = base * (1 + 0.3*Math.sin(nx*Math.PI)*Math.cos(ny*Math.PI));
  const Bx   = mag * Math.cos(nx+ny);
  const By   = mag * Math.sin(nx-ny)*0.3;
  const B    = Math.sqrt(Bx*Bx + By*By);
  const theta= Math.atan2(By, Bx)*180/Math.PI;
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

  const B = currentMagneticField * 1e4; // Tesla → Gauss
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

// Drag listeners untuk field meter
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
function endDrag() {
  isDragging = false;
}

/*****************************************
 * mainApp(): TEMPAT SEMUA LOGIKA APLIKASI ASLI
 * Dipanggil hanya setelah dekripsi selesai.
 *****************************************/
async function mainApp() {
  // 1) Ambil semua elemen DOM yang dibutuhkan
  magneticValueEl    = document.getElementById('magneticValue');
  lastUpdateEl       = document.getElementById('lastUpdate');
  speakBtn           = document.getElementById('speakBtn');
  toggleAutoSpeakBtn = document.getElementById('toggleAutoSpeak');
  sensorTypeEl       = document.getElementById('sensorType');
  analogPinEl        = document.getElementById('analogPin');
  uptimeEl           = document.getElementById('uptime');
  dataTableEl        = document.getElementById('dataTable');

  vizWrapper         = document.getElementById('magnetViz');
  fieldMeter         = document.getElementById('fieldMeter');
  fieldMeterToggle   = document.getElementById('fieldMeterToggle');
  fieldMeterB        = document.getElementById('fieldMeterB');
  fieldMeterBx       = document.getElementById('fieldMeterBx');
  fieldMeterBy       = document.getElementById('fieldMeterBy');
  fieldMeterTheta    = document.getElementById('fieldMeterTheta');

  // Persiapan grid span (9×9)
  for (let i = 0; i < COLS * COLS; i++) {
    const span = document.createElement('span');
    span.style.setProperty('--dx',       '0px');
    span.style.setProperty('--ang',      '0deg');
    span.style.setProperty('--delay',    '0s');
    span.style.setProperty('--duration', '2s');
    vizWrapper.appendChild(span);
  }
  vizItems = Array.from(vizWrapper.querySelectorAll('span'));

  // Fungsi pembantu untuk bounding box & ukuran cell
  container = vizWrapper.parentElement;
  wrapperRect = () => vizWrapper.getBoundingClientRect();
  containerRect = () => container.getBoundingClientRect();
  cellW = () => wrapperRect().width  / COLS;
  cellH = () => wrapperRect().height / COLS;

  // 2) Jalankan inisialisasi aplikasi:
  initChart();
  initModals();
  setupModalEvents();
  enableSwipeToDismiss();

  // 3) Jalankan fetch/pengolahan data IoT:
  fetchData().then(processData);
  setInterval(() => fetchData().then(processData), 5000);

  // 4) Bind event listener untuk tombol:
  speakBtn.addEventListener('click', () => {
    const value = parseFloat(magneticValueEl.textContent) || 0;
    speakValue(value);
  });
  toggleAutoSpeakBtn.addEventListener('click', handleAutoSpeakToggle);

  // 5) Field meter toggle & drag:
  fieldMeterToggle.addEventListener('change', toggleFieldMeter);
  fieldMeter.addEventListener('mousedown',  startDrag);
  fieldMeter.addEventListener('touchstart', startDrag, {passive:false});
  document.addEventListener('mousemove',    onDrag);
  document.addEventListener('touchmove',    onDrag, {passive:false});
  document.addEventListener('mouseup',      endDrag);
  document.addEventListener('touchend',     endDrag);

  // 6) Tampilkan field meter (jika saat load sudah checked)
  if (fieldMeterToggle.checked) {
    fieldMeterEnabled = true;
    fieldMeter.style.display = 'block';
    toggleFieldMeter();
  }
}

/*****************************************
 * Setelah halaman load, jalankan dekripsi
 * lalu panggil mainApp()
 *****************************************/
window.addEventListener("load", async () => {
  try {
    // 1. Ambil file JSON terenkripsi
    const resp = await fetch("script.json");
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} saat fetch 'script.json'`);
    }
    const laiData = await resp.json();

    // 2. Jalankan dekripsi → dapatkan isi app.js (string)
    const decryptedCode = await decrypt_all_text_js(laiData);

    // 3. Inject script baru ke dalam body
    const scriptEl = document.createElement("script");
    scriptEl.type = "application/javascript";
    scriptEl.text = decryptedCode;
    document.body.appendChild(scriptEl);

    // 4. Panggil mainApp() yang didefinisikan di dalam decryptedCode
    if (typeof mainApp === "function") {
      mainApp();
    } else {
      console.error("mainApp() tidak ditemukan di kode terdekripsi!");
    }
  } catch (err) {
    console.error("Terjadi kesalahan saat dekripsi atau inject:", err);
  }
});
