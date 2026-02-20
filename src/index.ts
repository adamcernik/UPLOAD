export interface Env {
	FILES: R2Bucket;
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.container { width: 100%; max-width: 480px; padding: 2rem; }
h1 { font-size: 1.25rem; font-weight: 500; margin-bottom: 1.5rem; color: #fff; }
.drop-zone { border: 2px dashed #333; border-radius: 12px; padding: 3rem 1.5rem; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
.drop-zone.dragover { border-color: #4f8ff7; background: rgba(79, 143, 247, 0.05); }
.drop-zone.has-file { border-color: #555; }
.drop-zone p { color: #888; font-size: 0.9rem; }
.drop-zone .filename { color: #fff; font-weight: 500; margin-top: 0.5rem; word-break: break-all; }
input[type="file"] { display: none; }
button { width: 100%; margin-top: 1rem; padding: 0.75rem; background: #4f8ff7; color: #fff; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: opacity 0.2s; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
button:hover:not(:disabled) { opacity: 0.85; }
.status { margin-top: 1rem; font-size: 0.85rem; text-align: center; min-height: 1.2em; }
.status.error { color: #f74f4f; }
.status.success { color: #4fcf7f; }
.progress-bar { margin-top: 1rem; height: 4px; background: #222; border-radius: 2px; overflow: hidden; display: none; }
.progress-bar .fill { height: 100%; width: 0%; background: #4f8ff7; transition: width 0.3s; }
</style>
</head>
<body>
<div class="container">
	<h1>Upload a file</h1>
	<div class="drop-zone" id="dropZone">
		<p>Drag & drop a file here or click to browse</p>
	</div>
	<input type="file" id="fileInput">
	<div class="progress-bar" id="progressBar"><div class="fill" id="progressFill"></div></div>
	<button id="uploadBtn" disabled>Upload</button>
	<div class="status" id="status"></div>
</div>
<script>
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const status = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
let selectedFile = null;

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
	e.preventDefault();
	dropZone.classList.remove('dragover');
	if (e.dataTransfer.files.length) selectFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) selectFile(fileInput.files[0]); });

function selectFile(file) {
	selectedFile = file;
	dropZone.classList.add('has-file');
	dropZone.innerHTML = '<p>Selected file:</p><div class="filename">' + escapeHtml(file.name) + '</div>';
	uploadBtn.disabled = false;
	status.textContent = '';
	status.className = 'status';
}

function escapeHtml(s) {
	const d = document.createElement('div');
	d.textContent = s;
	return d.innerHTML;
}

uploadBtn.addEventListener('click', async () => {
	if (!selectedFile) return;
	uploadBtn.disabled = true;
	status.textContent = 'Uploading…';
	status.className = 'status';
	progressBar.style.display = 'block';
	progressFill.style.width = '0%';

	try {
		const form = new FormData();
		form.append('file', selectedFile);

		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/upload');

		xhr.upload.onprogress = e => {
			if (e.lengthComputable) progressFill.style.width = Math.round((e.loaded / e.total) * 100) + '%';
		};

		const result = await new Promise((resolve, reject) => {
			xhr.onload = () => {
				try { resolve(JSON.parse(xhr.responseText)); }
				catch { reject(new Error('Invalid response')); }
			};
			xhr.onerror = () => reject(new Error('Network error'));
			xhr.send(form);
		});

		if (result.success) {
			status.textContent = 'Uploaded: ' + result.key;
			status.className = 'status success';
		} else {
			status.textContent = result.error || 'Upload failed';
			status.className = 'status error';
		}
	} catch (err) {
		status.textContent = err.message || 'Upload failed';
		status.className = 'status error';
	} finally {
		progressFill.style.width = '100%';
		uploadBtn.disabled = false;
	}
});
</script>
</body>
</html>`;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
			return new Response(HTML, {
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			});
		}

		if (request.method === 'POST' && url.pathname === '/upload') {
			try {
				const formData = await request.formData();
				const file = formData.get('file');

				if (!file || !(file instanceof File)) {
					return Response.json({ success: false, error: 'No file provided' }, { status: 400 });
				}

				const timestamp = Date.now();
				const key = `${timestamp}-${file.name}`;

				await env.FILES.put(key, file.stream(), {
					httpMetadata: { contentType: file.type },
				});

				return Response.json({ success: true, key });
			} catch (err) {
				return Response.json(
					{ success: false, error: err instanceof Error ? err.message : 'Upload failed' },
					{ status: 500 }
				);
			}
		}

		return Response.json({ error: 'Not found' }, { status: 404 });
	},
};
