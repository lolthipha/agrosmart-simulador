const $ = (id) => document.getElementById(id);
let simulationTimer = null;
let audioContext = null;
let soundEnabled = false;
let previousMosquitoState = false;
let currentState = null;

async function apiRequest(path, data = null) {
  const options = data === null
    ? { method: 'GET' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}

function formatLiters(value) {
  return `${Number(value).toLocaleString('es-CO', { maximumFractionDigits: 0 })} L`;
}

function setPill(element, text, className) {
  element.textContent = text;
  element.className = `status-pill ${className}`;
}

function renderState(state) {
  currentState = state;
  $('simClock').textContent = state.clock;
  $('simDay').textContent = state.day;
  $('soilValue').textContent = `${Math.round(state.soil_moisture)}%`;
  $('soilBar').style.width = `${Math.max(0, Math.min(100, state.soil_moisture))}%`;
  $('soilState').textContent = state.soil_moisture >= state.settings.target_moisture ? 'Humedad suficiente' : 'Requiere seguimiento';
  $('targetLabel').textContent = `${state.settings.target_moisture}%`;
  $('tempValue').textContent = `${state.temperature.toFixed(1)}°C`;
  $('airHumidityValue').textContent = `${Math.round(state.air_humidity)}%`;
  $('tempRangeLabel').textContent = `${state.settings.temp_min}–${state.settings.temp_max}°C`;
  $('airMinLabel').textContent = `${state.settings.humidity_min}%`;
  $('savedValue').textContent = formatLiters(state.metrics.water_saved_l);
  $('usedValue').textContent = formatLiters(state.metrics.water_used_l);

  const irrigationLabels = {
    active: ['Riego activo', 'active'],
    blocked: ['Bloqueado por humedad', 'blocked'],
    outside: ['Fuera de horario', 'warning'],
    waiting: ['En espera', 'neutral'],
  };
  const irrigation = irrigationLabels[state.irrigation.status] || irrigationLabels.waiting;
  setPill($('irrigationStatus'), irrigation[0], irrigation[1]);
  $('irrigationMessage').textContent = state.irrigation.message;

  if (state.mosquito.active) {
    setPill($('mosquitoStatus'), 'Señal activa', 'active');
    $('mosquitoMessage').textContent = `Coinciden las 3 condiciones. Índice del modelo: ${state.mosquito.score}/100.`;
  } else {
    setPill($('mosquitoStatus'), 'En espera', 'neutral');
    const missing = Object.entries(state.mosquito.conditions)
      .filter(([, ok]) => !ok)
      .map(([key]) => ({ time: 'horario', temperature: 'temperatura', humidity: 'humedad ambiental' }[key]));
    $('mosquitoMessage').textContent = missing.length
      ? `Condiciones pendientes: ${missing.join(', ')}.`
      : 'Evaluando condiciones del entorno.';
  }

  // El pitido solo se dispara cuando la alerta cambia de inactiva a activa.
  if (state.mosquito.active && !previousMosquitoState && soundEnabled) playBeep();
  previousMosquitoState = state.mosquito.active;

  renderSettings(state.settings);
  renderLogs(state.logs);
  drawMoistureChart(state.history, state.settings.target_moisture);
  drawWaterChart(state.history);
  document.querySelectorAll('.scenario-button').forEach((button) => {
    button.classList.toggle('selected', button.dataset.scenario === state.scenario);
  });
}

function renderSettings(settings) {
  const fields = {
    targetMoisture: 'target_moisture', irrigationStart: 'irrigation_start', irrigationEnd: 'irrigation_end',
    tempMin: 'temp_min', tempMax: 'temp_max', humidityMin: 'humidity_min',
    morningStart: 'morning_start', morningEnd: 'morning_end', eveningStart: 'evening_start', eveningEnd: 'evening_end',
  };
  for (const [id, key] of Object.entries(fields)) {
    const field = $(id);
    if (document.activeElement !== field) field.value = settings[key];
  }
}

function renderLogs(logs) {
  $('logCount').textContent = `${logs.length} ${logs.length === 1 ? 'evento' : 'eventos'}`;
  const list = $('eventList');
  list.replaceChildren();
  if (!logs.length) {
    list.innerHTML = '<div class="empty-state">Los eventos del simulador aparecerán aquí.</div>';
    return;
  }
  logs.forEach((log) => {
    const row = document.createElement('div');
    row.className = `event-item ${log.kind || ''}`;
    const time = document.createElement('span');
    time.className = 'event-time';
    time.textContent = log.time;
    const message = document.createElement('span');
    message.className = 'event-message';
    const mark = document.createElement('i');
    mark.className = 'event-mark';
    message.append(mark, document.createTextNode(log.message));
    row.append(time, message);
    list.append(row);
  });
}

function prepareCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(280, canvas.clientWidth);
  const height = 180;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  return { ctx, width, height };
}

function drawMoistureChart(history, target) {
  const canvas = $('moistureChart');
  const { ctx, width, height } = prepareCanvas(canvas);
  const left = 31, right = width - 10, top = 12, bottom = height - 25;
  ctx.clearRect(0, 0, width, height);
  ctx.font = '9px DM Sans, sans-serif';
  ctx.fillStyle = '#8b9890';
  [0, 25, 50, 75, 100].forEach((value) => {
    const y = bottom - (value / 100) * (bottom - top);
    ctx.strokeStyle = '#edf1ed'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillText(String(value), 5, y + 3);
  });
  if (!history.length) return;
  const xAt = (index) => history.length === 1 ? (left + right) / 2 : left + (index / (history.length - 1)) * (right - left);
  const yAt = (value) => bottom - (Math.max(0, Math.min(100, value)) / 100) * (bottom - top);
  const targetY = yAt(target);
  ctx.setLineDash([5, 4]); ctx.strokeStyle = '#d49a53'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(left, targetY); ctx.lineTo(right, targetY); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#46956c'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
  history.forEach((point, index) => index === 0 ? ctx.moveTo(xAt(index), yAt(point.moisture)) : ctx.lineTo(xAt(index), yAt(point.moisture)));
  ctx.stroke();
  ctx.fillStyle = '#46956c';
  history.forEach((point, index) => { ctx.beginPath(); ctx.arc(xAt(index), yAt(point.moisture), 2.5, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#8b9890';
  [0, Math.floor((history.length - 1) / 2), history.length - 1].forEach((index) => {
    if (history[index]) ctx.fillText(history[index].label, Math.max(left, xAt(index) - 18), height - 7);
  });
}

function drawWaterChart(history) {
  const canvas = $('waterChart');
  const { ctx, width, height } = prepareCanvas(canvas);
  const left = 35, right = width - 12, top = 12, bottom = height - 25;
  ctx.clearRect(0, 0, width, height);
  if (!history.length) return;
  const latest = history[history.length - 1];
  const maxValue = Math.max(100, latest.used, latest.saved) * 1.15;
  [0, .25, .5, .75, 1].forEach((fraction) => {
    const y = bottom - fraction * (bottom - top);
    ctx.strokeStyle = '#edf1ed'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillStyle = '#8b9890'; ctx.font = '9px DM Sans, sans-serif';
    ctx.fillText(`${Math.round(maxValue * fraction)}`, 2, y + 3);
  });
  const barWidth = Math.min(34, (right - left) / 5);
  const gap = 18;
  const totalWidth = barWidth * 2 + gap;
  const startX = (left + right - totalWidth) / 2;
  const values = [
    { label: 'Utilizada', value: latest.used, color: '#4b9270' },
    { label: 'Ahorrada', value: latest.saved, color: '#d9a15e' },
  ];
  values.forEach((item, index) => {
    const barHeight = (item.value / maxValue) * (bottom - top);
    const x = startX + index * (barWidth + gap);
    ctx.fillStyle = item.color;
    ctx.beginPath(); ctx.roundRect(x, bottom - barHeight, barWidth, barHeight, 5); ctx.fill();
    ctx.fillStyle = '#65756b'; ctx.font = '9px DM Sans, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(item.value)} L`, x + barWidth / 2, Math.max(10, bottom - barHeight - 6));
    ctx.fillText(item.label, x + barWidth / 2, height - 7);
  });
  ctx.textAlign = 'start';
}

async function refreshState() {
  try { renderState(await apiRequest('/api/state')); }
  catch (error) { showFeedback(error.message, true); }
}

async function advance(hours = 1) {
  try { renderState(await apiRequest('/api/tick', { hours })); }
  catch (error) { stopSimulation(); showFeedback(error.message, true); }
}

function startSimulation() {
  if (simulationTimer) return;
  const seconds = Number($('speedSelect').value);
  $('startBtn').disabled = true;
  $('pauseBtn').disabled = false;
  simulationTimer = window.setInterval(() => advance(1), seconds * 1000);
}

function stopSimulation() {
  if (simulationTimer) window.clearInterval(simulationTimer);
  simulationTimer = null;
  $('startBtn').disabled = false;
  $('pauseBtn').disabled = true;
}

function showFeedback(message, isError = false) {
  const feedback = $('settingsFeedback');
  feedback.textContent = message;
  feedback.style.color = isError ? '#b65b4d' : '#3c8a61';
}

function playBeep() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  [0, 0.24].forEach((offset) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(now + offset); oscillator.stop(now + offset + 0.14);
  });
}

$('startBtn').addEventListener('click', startSimulation);
$('pauseBtn').addEventListener('click', stopSimulation);
$('stepBtn').addEventListener('click', () => advance(1));
$('sixHoursBtn').addEventListener('click', () => advance(6));
$('dayBtn').addEventListener('click', () => advance(24));
$('speedSelect').addEventListener('change', () => { if (simulationTimer) { stopSimulation(); startSimulation(); } });
$('resetBtn').addEventListener('click', async () => {
  stopSimulation();
  try { previousMosquitoState = false; renderState(await apiRequest('/api/reset', {})); }
  catch (error) { showFeedback(error.message, true); }
});

document.querySelectorAll('.scenario-button').forEach((button) => {
  button.addEventListener('click', async () => {
    stopSimulation();
    try { renderState(await apiRequest('/api/scenario', { scenario: button.dataset.scenario })); }
    catch (error) { showFeedback(error.message, true); }
  });
});

$('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const settings = {
    target_moisture: $('targetMoisture').value,
    irrigation_start: $('irrigationStart').value,
    irrigation_end: $('irrigationEnd').value,
    temp_min: $('tempMin').value,
    temp_max: $('tempMax').value,
    humidity_min: $('humidityMin').value,
    morning_start: $('morningStart').value,
    morning_end: $('morningEnd').value,
    evening_start: $('eveningStart').value,
    evening_end: $('eveningEnd').value,
  };
  try {
    renderState(await apiRequest('/api/settings', settings));
    showFeedback('Configuración guardada correctamente.');
  } catch (error) { showFeedback(error.message, true); }
});

$('enableSoundBtn').addEventListener('click', async () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Este navegador no permite generar audio.');
    if (!audioContext) audioContext = new AudioContextClass();
    await audioContext.resume();
    soundEnabled = true;
    $('soundLed').classList.add('enabled');
    $('soundStateText').textContent = 'Audio habilitado';
    $('enableSoundBtn').textContent = 'Sonido habilitado';
    playBeep();
  } catch (error) { showFeedback(error.message, true); }
});
$('testSoundBtn').addEventListener('click', () => {
  if (!soundEnabled) { showFeedback('Primero habilita el sonido del navegador.', true); return; }
  playBeep();
});

window.addEventListener('resize', () => {
  if (currentState) {
    drawMoistureChart(currentState.history, currentState.settings.target_moisture);
    drawWaterChart(currentState.history);
  }
});

refreshState();
