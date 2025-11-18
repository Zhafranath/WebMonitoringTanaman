// js/app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ======================= KONFIGURASI SUPABASE =======================
// GANTI SESUAI PROJECTMU
const SUPABASE_URL = 'LINK SUPABASE';
const SUPABASE_ANON_KEY = 'LINK ANON SUPABASE';

// Nama tabel Supabase untuk menyimpan log sensor
// Kolom yang diasumsikan: created_at (timestamp), temperature, soil_moisture, soil_ph
const SENSOR_TABLE = 'sensor_logs';

// Nama tabel atau mekanisme kontrol pompa
// Contoh: ESP32 akan membaca baris terakhir dari tabel ini
const PUMP_TABLE = 'pump_control';
// atau bisa ganti dengan edge function / RPC sesuai kebutuhanmu

// ===================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elemen DOM
const tempValueEl = document.getElementById('temp-value');
const moistureValueEl = document.getElementById('moisture-value');
const phValueEl = document.getElementById('ph-value');
const lastUpdatedEl = document.getElementById('last-updated');
const pumpBtn = document.getElementById('pump-btn');
const pumpBtnLabel = document.getElementById('pump-btn-label');
const pumpStatusEl = document.getElementById('pump-status');
const datePickerEl = document.getElementById('date-picker');
const chartEmptyEl = document.getElementById('chart-empty');
const yearEl = document.getElementById('year');
const rangeButtons = document.querySelectorAll('.range-btn');

let selectedRange = 'week';
let historyChart = null;

// Set tahun footer
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

// helper: format tanggal pendek
function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

// helper: format waktu terakhir update
function formatLastUpdated(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('id-ID', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

// ======================= FETCH LATEST SENSOR =======================
async function fetchLatestReading() {
  try {
    const { data, error } = await supabase
      .from(SENSOR_TABLE)
      .select('temperature, soil_moisture, soil_ph, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      tempValueEl.textContent = '-';
      moistureValueEl.textContent = '-';
      phValueEl.textContent = '-';
      lastUpdatedEl.textContent = 'Belum ada data';
      return;
    }

    tempValueEl.textContent = data.temperature?.toFixed(1) ?? '-';
    moistureValueEl.textContent = data.soil_moisture?.toFixed(1) ?? '-';
    phValueEl.textContent = data.soil_ph?.toFixed(2) ?? '-';
    lastUpdatedEl.textContent = `Update terakhir: ${formatLastUpdated(data.created_at)}`;
  } catch (err) {
    console.error('Gagal mengambil data terbaru:', err);
    lastUpdatedEl.textContent = 'Gagal memuat data terbaru';
  }
}

// ========================== FETCH HISTORY ==========================
function getRangeDates() {
  const now = new Date();
  let from;
  let to = new Date();

  if (selectedRange === 'week') {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (selectedRange === 'month') {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (selectedRange === 'date') {
    const dateValue = datePickerEl.value;
    if (!dateValue) return { from: null, to: null };
    const d = new Date(dateValue);
    from = new Date(d.setHours(0, 0, 0, 0));
    to = new Date(d.setHours(23, 59, 59, 999));
  } else {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { from, to };
}

async function fetchHistory() {
  const { from, to } = getRangeDates();
  if (!from || !to) {
    chartEmptyEl.classList.remove('hidden');
    if (historyChart) historyChart.data.labels = [];
    if (historyChart) historyChart.update();
    return;
  }

  try {
    const { data, error } = await supabase
      .from(SENSOR_TABLE)
      .select('created_at, temperature, soil_moisture, soil_ph')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      chartEmptyEl.classList.remove('hidden');
      if (historyChart) {
        historyChart.data.labels = [];
        historyChart.data.datasets.forEach(ds => ds.data = []);
        historyChart.update();
      }
      return;
    }

    chartEmptyEl.classList.add('hidden');

    const labels = data.map(row => formatDateLabel(row.created_at));
    const temps = data.map(row => row.temperature ?? null);
    const moistures = data.map(row => row.soil_moisture ?? null);
    const phs = data.map(row => row.soil_ph ?? null);

    updateHistoryChart(labels, temps, moistures, phs);
  } catch (err) {
    console.error('Gagal mengambil history:', err);
    chartEmptyEl.textContent = 'Gagal memuat data riwayat.';
    chartEmptyEl.classList.remove('hidden');
  }
}

// =========================== CHART.JS ==============================
function updateHistoryChart(labels, temps, moistures, phs) {
  const ctx = document.getElementById('historyChart').getContext('2d');

  const datasets = [
    {
      label: 'Suhu (°C)',
      data: temps,
      backgroundColor: 'rgba(16, 185, 129, 0.7)', // hijau
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      label: 'Kelembapan Tanah (%)',
      data: moistures,
      backgroundColor: 'rgba(59, 130, 246, 0.8)', // biru
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      label: 'pH Tanah',
      data: phs,
      backgroundColor: 'rgba(139, 69, 19, 0.9)', // coklat
      borderRadius: 6,
      borderSkipped: false,
    }
  ];

  if (historyChart) {
    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = temps;
    historyChart.data.datasets[1].data = moistures;
    historyChart.data.datasets[2].data = phs;
    historyChart.update();
    return;
  }

  historyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#cbd5f5',
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label || '';
              const value = ctx.formattedValue;
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#9ca3af', maxRotation: 60, minRotation: 45 },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#9ca3af' },
          grid: { color: 'rgba(55, 65, 81, 0.5)' }
        }
      }
    }
  });
}

// ============================ PUMP BTN =============================
async function sendPumpOnCommand() {
  try {
    pumpBtn.disabled = true;
    pumpBtnLabel.textContent = 'Mengirim perintah...';
    pumpStatusEl.textContent = 'Mengirim perintah ke pompa...';

    // Contoh implementasi:
    // ESP32 bisa polling tabel PUMP_TABLE dan membaca baris terakhir
    // dengan kolom: action, requested_at
    const payload = {
      action: 'ON',
      requested_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(PUMP_TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    pumpStatusEl.textContent = 'Perintah pompa terkirim. ESP32 akan mengeksekusi.';
    pumpBtnLabel.textContent = 'Nyalakan Pompa';
  } catch (err) {
    console.error('Gagal mengirim perintah pompa:', err);
    pumpStatusEl.textContent = 'Gagal mengirim perintah pompa.';
    pumpBtnLabel.textContent = 'Nyalakan Pompa';
  } finally {
    pumpBtn.disabled = false;
  }
}

// =========================== EVENT LISTENER ========================
function setupRangeButtons() {
  rangeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      rangeButtons.forEach(b => b.classList.remove('bg-slate-700', 'text-white'));
      btn.classList.add('bg-slate-700', 'text-white');

      selectedRange = btn.dataset.range;

      if (selectedRange === 'date') {
        datePickerEl.classList.remove('hidden');
      } else {
        datePickerEl.classList.add('hidden');
      }

      fetchHistory();
    });
  });

  // Set default: week
  const defaultBtn = document.querySelector('[data-range="week"]');
  if (defaultBtn) {
    defaultBtn.classList.add('bg-slate-700', 'text-white');
  }
}

function setupDatePicker() {
  if (!datePickerEl) return;
  datePickerEl.addEventListener('change', () => {
    if (selectedRange === 'date') {
      fetchHistory();
    }
  });
}

function setupPumpButton() {
  if (!pumpBtn) return;
  pumpBtn.addEventListener('click', sendPumpOnCommand);
}

// ============================== INIT ===============================
async function init() {
  setupRangeButtons();
  setupDatePicker();
  setupPumpButton();

  await fetchLatestReading();
  await fetchHistory();

  // optional: auto refresh tiap beberapa detik
  setInterval(fetchLatestReading, 15_000);
  setInterval(fetchHistory, 60_000);
}

init().catch(err => console.error('Error init:', err));
