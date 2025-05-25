// Global variables
let magneticChart;
let autoSpeakEnabled = false;
let lastValue = 0;
const speechSynthesis = window.speechSynthesis;

// DOM Elements
const magneticValueEl    = document.getElementById('magneticValue');
const lastUpdateEl       = document.getElementById('lastUpdate');
const speakBtn           = document.getElementById('speakBtn');
const toggleAutoSpeakBtn = document.getElementById('toggleAutoSpeak');   // sesuaikan dengan id di HTML
const sensorTypeEl       = document.getElementById('sensorType');
const analogPinEl        = document.getElementById('analogPin');
const uptimeEl           = document.getElementById('uptime');
const dataTableEl        = document.getElementById('dataTable');

// --- inisialisasi magnet visualization ---
const vizWrapper = document.getElementById('magnetViz');
for (let i = 0; i < 81; i++) {
  const span = document.createElement('span');
  span.style.setProperty('--rotate', '0deg');
  vizWrapper.appendChild(span);
}
const vizItems = vizWrapper.querySelectorAll('span');

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
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Tesla (T)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                }
            },
            animation: {
                duration: 1000
            }
        }
    });
}

// Fetch data from GitHub
async function fetchData() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/4211421036/magvi/main/magnet_data.json');
        if (!response.ok) throw new Error('Failed to fetch data');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

// Process and display data
function processData(data) {
    if (!data) return;
    
    // Update configuration info
    sensorTypeEl.textContent = data.config?.sensorType || 'Magnetometer';
    analogPinEl.textContent  = data.config?.analogPin  || 'A0';
    uptimeEl.textContent     = data.uptime             || '0';
    
    const readings = data.readings || [];
    if (readings.length === 0) return;
    
    // Latest reading
    const latestReading = readings[readings.length - 1];
    const currentValue   = parseFloat(latestReading.magneticField) || 0;
    
    // Update display & time
    magneticValueEl.textContent = currentValue.toFixed(6) + ' T';
    lastUpdateEl.textContent    = new Date().toLocaleTimeString();
    
    // Auto-speak
    if (Math.abs(currentValue - lastValue) > 0.000001) {
        lastValue = currentValue;
        if (autoSpeakEnabled) speakValue(currentValue);
    }
    
    // Update chart & table
    updateChart(readings);
    updateTable(readings);
    
    // --- visualisasi medan magnet ---
    if (currentValue !== 0) {
      updateMagnetViz(currentValue);
    }
}

// Update chart
function updateChart(readings) {
    const displayReadings = readings.slice(-20);
    magneticChart.data.labels = displayReadings.map(r => new Date(r.timestamp*1000).toLocaleTimeString());
    magneticChart.data.datasets[0].data = displayReadings.map(r => parseFloat(r.magneticField) || 0);
    magneticChart.update();
}

// Update table
function updateTable(readings) {
    dataTableEl.innerHTML = '';
    readings.slice(-10).reverse().forEach(reading => {
        const row = document.createElement('tr');
        const date = new Date((reading.timestamp || 0)*1000).toLocaleTimeString();
        row.innerHTML = `<td>${date}</td><td>${(parseFloat(reading.magneticField)||0).toFixed(6)}</td>`;
        dataTableEl.appendChild(row);
    });
}

// Speak the current value
function speakValue(value) {
    if (!speechSynthesis) return;
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(`Magnetic field is ${value.toFixed(6)} Tesla`);
    utt.rate = 0.9;
    utt.onerror = e => console.error('Speech error:', e);
    speechSynthesis.speak(utt);
}

// Toggle auto-speak
function handleAutoSpeakToggle() {
    autoSpeakEnabled = !autoSpeakEnabled;
    if (autoSpeakEnabled) {
        toggleAutoSpeakBtn.innerHTML = '<i class="bi bi-megaphone"></i> Auto-Read: ON';
        toggleAutoSpeakBtn.classList.replace('btn-outline-primary', 'btn-primary');
        speakValue(parseFloat(magneticValueEl.textContent) || 0);
    } else {
        toggleAutoSpeakBtn.innerHTML = '<i class="bi bi-megaphone"></i> Auto-Read: OFF';
        toggleAutoSpeakBtn.classList.replace('btn-primary', 'btn-outline-primary');
    }
}

// --- fungsi tambahan untuk visualisasi ---
function updateMagnetViz(value) {
    // skala: 1 Tesla => 90°
    const scale = 90;
    const angle = value * scale;
    vizItems.forEach(item => {
      item.style.setProperty('--rotate', `${angle}deg`);
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    fetchData().then(processData);
    setInterval(() => fetchData().then(processData), 5000);
    speakBtn.addEventListener('click', () => speakValue(parseFloat(magneticValueEl.textContent) || 0));
    toggleAutoSpeakBtn.addEventListener('click', handleAutoSpeakToggle);
});
