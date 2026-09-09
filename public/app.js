let file;
let transfer;
let scanner;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const format = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const label = (name) => (name.split('.').pop() || 'file').slice(0, 4).toUpperCase();

function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 3200); }
function view(id) { $$('.view').forEach((element) => element.classList.toggle('active', element.id === id)); if (id !== 'receive-view') stopScanner(); scrollTo(0, 0); }
$$('[data-view]').forEach((element) => element.addEventListener('click', () => view(element.dataset.view)));

async function choose(selected) {
  if (!selected) return;
    if (selected.size > 1400000) return toast('That file is too large for one QR code. Choose a file under 1.4 MB.');
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
    const payload = JSON.stringify({ name: file.name, size: file.size, data: dataUrl });
    $('#qrcode').innerHTML = '';
    new QRCode($('#qrcode'), { text: payload, width: 230, height: 230, correctLevel: QRCode.CorrectLevel.L });
    $('#qr-empty').classList.add('hidden');
    $('#qr-result').classList.remove('hidden');
    $('#signal').textContent = 'LIVE';
    $('#meta').textContent = `${label(file.name)} / ${format(file.size)} / LOCAL`;
  } catch (error) { toast(error.message || 'Upload failed.'); $('#signal').textContent = 'ERROR'; }
}

function reset() { file = null; transfer = null; $('#file-input').value = ''; $('#selected').classList.add('hidden'); $('#drop').classList.remove('hidden'); $('#qr-result').classList.add('hidden'); $('#qr-empty').classList.remove('hidden'); $('#signal').textContent = 'WAITING'; $('#meta').textContent = 'NO FILE LOADED'; }
$('#file-input').addEventListener('change', (event) => choose(event.target.files[0]));
$('#remove').addEventListener('click', reset);
$('#new-file').addEventListener('click', reset);
$('#drop').addEventListener('dragover', (event) => event.preventDefault());
$('#drop').addEventListener('drop', (event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); });

function showTransfer(text) {
  try {
    const data = JSON.parse(text);
    if (!data.name || !data.data) throw new Error();
    view('receive-view');
    received(data);
  } catch { toast('That QR code is not a Beam file.'); }
}
function received(data) {
  transfer = data;
  $('#received-name').textContent = data.name;
  $('#received-size').textContent = `${format(data.size)} / ready`;
  $('#received').classList.remove('hidden');
  $('#empty').classList.add('hidden');
  $('#download').onclick = () => { const link = document.createElement('a'); link.href = data.data; link.download = data.name; link.click(); toast('Download started.'); };
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
