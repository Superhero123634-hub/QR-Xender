let file;
let transfer;
let scanner;
let qrFrames = [];
let qrFrameIndex = 0;
const chunkSize = 1200;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const format = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const label = (name) => (name.split('.').pop() || 'file').slice(0, 4).toUpperCase();

function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 3200); }
function view(id) { $$('.view').forEach((element) => element.classList.toggle('active', element.id === id)); if (id !== 'receive-view') stopScanner(); scrollTo(0, 0); }
$$('[data-view]').forEach((element) => element.addEventListener('click', () => view(element.dataset.view)));

async function choose(selected) {
  if (!selected) return;
  file = selected;
  $('#file-name').textContent = file.name;
  $('#file-size').textContent = format(file.size);
  $('#file-type').textContent = label(file.name);
  $('#selected').classList.remove('hidden');
  $('#drop').classList.add('hidden');
  $('#signal').textContent = 'PACKING';
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });
      if (!window.QRCode) throw new Error('QR generator is still loading. Refresh and try again.');
      const chunks = dataUrl.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
      qrFrames = chunks.map((chunk, index) => JSON.stringify({ name: file.name, size: file.size, index, total: chunks.length, data: chunk }));
      qrFrameIndex = 0;
      renderQrFrame();
    $('#qr-empty').classList.add('hidden');
    $('#qr-result').classList.remove('hidden');
    $('#signal').textContent = 'LIVE';
    $('#meta').textContent = `${label(file.name)} / ${format(file.size)} / ${qrFrames.length} FRAMES`;
  } catch (error) { toast(error.message || 'Upload failed.'); $('#signal').textContent = 'ERROR'; }
}

function reset() { file = null; transfer = null; $('#file-input').value = ''; $('#selected').classList.add('hidden'); $('#drop').classList.remove('hidden'); $('#qr-result').classList.add('hidden'); $('#qr-empty').classList.remove('hidden'); $('#signal').textContent = 'WAITING'; $('#meta').textContent = 'NO FILE LOADED'; }
function renderQrFrame() {
  $('#qrcode').innerHTML = '';
  new QRCode($('#qrcode'), { text: qrFrames[qrFrameIndex], width: 230, height: 230, correctLevel: QRCode.CorrectLevel.L });
  $('#frame-count').textContent = `FRAME ${qrFrameIndex + 1} / ${qrFrames.length}`;
  $('#previous-frame').disabled = qrFrameIndex === 0;
  $('#next-frame').disabled = qrFrameIndex === qrFrames.length - 1;
}
$('#file-input').addEventListener('change', (event) => choose(event.target.files[0]));
$('#remove').addEventListener('click', reset);
$('#new-file').addEventListener('click', reset);
$('#previous-frame').addEventListener('click', () => { if (qrFrameIndex > 0) { qrFrameIndex -= 1; renderQrFrame(); } });
$('#next-frame').addEventListener('click', () => { if (qrFrameIndex < qrFrames.length - 1) { qrFrameIndex += 1; renderQrFrame(); } });
$('#drop').addEventListener('dragover', (event) => event.preventDefault());
$('#drop').addEventListener('drop', (event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); });

function showTransfer(text) {
  try {
    const data = JSON.parse(text);
    if (!data.name || !data.data) throw new Error();
    collectFrame(data);
  } catch { toast('That QR code is not a Beam file.'); }
}
const receivedFrames = new Map();
function collectFrame(data) {
  if (!data.total || data.index === undefined) return received(data);
  receivedFrames.set(`${data.name}:${data.index}`, data);
  const frames = [...receivedFrames.values()].filter((frame) => frame.name === data.name).sort((a, b) => a.index - b.index);
  view('receive-view');
  $('#receive-progress').textContent = `${frames.length} / ${data.total} FRAMES RECEIVED`;
  if (frames.length === data.total) received({ name: data.name, size: data.size, data: frames.map((frame) => frame.data).join('').replace(/^data:[^,]+,/, '') , type: data.data.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream' });
}
function received(data) {
  transfer = data;
  $('#received-name').textContent = data.name;
  $('#received-size').textContent = `${format(data.size)} / ready`;
  $('#received').classList.remove('hidden');
  $('#empty').classList.add('hidden');
  $('#download').onclick = () => { const link = document.createElement('a'); link.href = data.data.startsWith('data:') ? data.data : `data:${data.type || 'application/octet-stream'};base64,${data.data}`; link.download = data.name; link.click(); toast('Download started.'); };
}
function startScanner() {
  if (scanner || !window.Html5Qrcode) return toast('Scanner is loading, try again in a moment.');
  scanner = new Html5Qrcode('reader');
  scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (text) => {
    showTransfer(text);
    stopScanner();
  }, () => {}).then(() => { $('#start').textContent = 'camera active'; $('#scan-state').textContent = 'SCANNING'; }).catch(() => { scanner = null; toast('Camera access was blocked. Upload a QR image instead.'); });
}
function stopScanner() { if (!scanner) return; scanner.stop().then(() => scanner.clear()).catch(() => {}); scanner = null; if ($('#start')) $('#start').textContent = 'start camera ↗'; if ($('#scan-state')) $('#scan-state').textContent = 'READY'; }
$('#start').addEventListener('click', startScanner);
$('#qr-image').addEventListener('change', (event) => {
  if (!window.Html5Qrcode) return toast('Scanner is loading.');
  const image = new Html5Qrcode('reader');
  image.scanFile(event.target.files[0], true).then((text) => { showTransfer(text); image.clear(); }).catch(() => { image.clear(); toast('No readable Beam code found.'); });
});
