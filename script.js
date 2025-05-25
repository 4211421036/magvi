// Global variables
let magneticChart;
let autoSpeakEnabled = false;
let lastValue = 0;
const speechSynthesis = window.speechSynthesis;

// DOM Elements
const magneticValueEl = document.getElementById('magneticValue');
const lastUpdateEl = document.getElementById('lastUpdate');
const speakBtn = document.getElementById('speakBtn');
const toggleAutoSpeakBtn = document.getElementById('toggleAutoSpeak'); // Ubah nama variabel
const sensorTypeEl = document.getElementById('sensorType');
const analogPinEl = document.getElementById('analogPin');
const uptimeEl = document.getElementById('uptime');
const dataTableEl = document.getElementById('dataTable');

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
        const response = await fetch('https://raw.githubusercontent.com/4211421036/flowsense/main/magnet_data.json');
        
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }
        
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
    sensorTypeEl.textContent = data.config.sensorType || 'Magnetometer';
    analogPinEl.textContent = data.config.analogPin || 'A0';
    uptimeEl.textContent = data.uptime || '0';
    
    // Get the latest reading
    const readings = data.readings || [];
    if (readings.length === 0) return;
    
    const latestReading = readings[readings.length - 1];
    const currentValue = parseFloat(latestReading.magneticField) || 0;
    
    // Update value display
    magneticValueEl.textContent = currentValue.toFixed(6) + ' T';
    
    // Update last updated time
    const now = new Date();
    lastUpdateEl.textContent = now.toLocaleTimeString();
    
    // Check if value changed significantly (more than 0.000001 T)
    if (Math.abs(currentValue - lastValue) > 0.000001) {
        lastValue = currentValue;
        
        // Speak the value if auto-speak is enabled
        if (autoSpeakEnabled) {
            speakValue(currentValue);
        }
    }
    
    // Update chart
    updateChart(readings);
    
    // Update table
    updateTable(readings);
}

// Update chart with new data
function updateChart(readings) {
    // Limit to last 20 readings for better visibility
    const displayReadings = readings.slice(-20);
    
    const labels = displayReadings.map(reading => {
        const date = new Date((reading.timestamp || 0) * 1000);
        return date.toLocaleTimeString();
    });
    
    const data = displayReadings.map(reading => parseFloat(reading.magneticField) || 0);
    
    magneticChart.data.labels = labels;
    magneticChart.data.datasets[0].data = data;
    magneticChart.update();
}

// Update table with data
function updateTable(readings) {
    // Clear existing rows
    dataTableEl.innerHTML = '';
    
    // Add new rows (show latest 10 readings)
    const displayReadings = readings.slice(-10).reverse();
    
    displayReadings.forEach(reading => {
        const row = document.createElement('tr');
        
        const timeCell = document.createElement('td');
        const date = new Date((reading.timestamp || 0) * 1000);
        timeCell.textContent = date.toLocaleTimeString();
        
        const valueCell = document.createElement('td');
        valueCell.textContent = (parseFloat(reading.magneticField) || 0).toFixed(6);
        
        row.appendChild(timeCell);
        row.appendChild(valueCell);
        dataTableEl.appendChild(row);
    });
}

// Speak the current value
function speakValue(value) {
    // Check if speech synthesis is supported
    if (!speechSynthesis) {
        console.warn('Text-to-speech not supported in this browser');
        return;
    }
    
    // Cancel any ongoing speech
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance();
    utterance.text = `Magnetic field is ${value.toFixed(6)} Tesla`;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    // Handle potential errors
    utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
    };
    
    speechSynthesis.speak(utterance);
}

// Toggle auto-speak function
function toggleAutoSpeakFunction() {
    autoSpeakEnabled = !autoSpeakEnabled;
    
    if (autoSpeakEnabled) {
        toggleAutoSpeakBtn.innerHTML = '<i class="bi bi-megaphone"></i> Auto-Read: ON';
        toggleAutoSpeakBtn.classList.add('auto-speak-on');
        toggleAutoSpeakBtn.classList.remove('btn-outline-primary');
        toggleAutoSpeakBtn.classList.add('btn-primary');
        
        // Speak the current value when enabling
        const currentValue = parseFloat(magneticValueEl.textContent) || 0;
        speakValue(currentValue);
    } else {
        toggleAutoSpeakBtn.innerHTML = '<i class="bi bi-megaphone"></i> Auto-Read: OFF';
        toggleAutoSpeakBtn.classList.remove('auto-speak-on');
        toggleAutoSpeakBtn.classList.add('btn-outline-primary');
        toggleAutoSpeakBtn.classList.remove('btn-primary');
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    
    // Initial data load
    fetchData().then(processData);
    
    // Refresh data every 5 seconds
    setInterval(() => {
        fetchData().then(processData);
    }, 5000);
    
    // Button event listeners
    speakBtn.addEventListener('click', () => {
        const currentValue = parseFloat(magneticValueEl.textContent) || 0;
        speakValue(currentValue);
    });
    
    toggleAutoSpeakBtn.addEventListener('click', toggleAutoSpeakFunction);
});
