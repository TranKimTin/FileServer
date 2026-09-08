// pkg -t node18-win --public file_server.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
const moment = require("moment");
const formidable = require("formidable");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(cors());
app.use(
    morgan(
        ":date[iso] :remote-addr :remote-user :user-agent :method :url HTTP/:http-version :status :res[content-length] - :response-time ms"
    )
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// 1. Khoi tao thu muc Public va Note
const publicRoot = path.join(__dirname, "public");
if (!fs.existsSync(publicRoot)) {
    fs.mkdirSync(publicRoot, { recursive: true });
}
const noteDir = path.join(publicRoot, "note");
if (!fs.existsSync(noteDir)) {
    fs.mkdirSync(noteDir, { recursive: true });
}

// Phuc vu static assets
app.use(express.static(publicRoot, { index: false }));

// Tich hop log BotFather (neu ton tai)
const logPath = path.join(__dirname, "..", "BotFather", "botfather_c++", "logs");
if (fs.existsSync(logPath)) {
    app.use("/logs-static", express.static(logPath));
    app.get("/logs", (req, res) => {
        const latest = `botfather_${moment().format("YYYY-MM-DD")}.log`;
        res.redirect("/logs-static/" + latest);
    });
}

// 2. Cac ham tien ich bao mat va duong dan
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function sanitizeRelativePath(relativePath, fallbackName = "") {
    let raw = String(relativePath || fallbackName || "").trim();
    if (!raw) return null;
    raw = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    let parts = raw
        .split("/")
        .map(p => p.trim().replace(/[. ]+$/, ""))
        .filter(Boolean)
        .filter(part => part !== "." && part !== "..");
    if (parts.length === 0) return null;
    return parts.join("/");
}

function isSystemProtectedPath(safePath) {
    if (!safePath) return true;
    const lower = safePath.toLowerCase().trim().replace(/[. ]+$/, "");
    return lower === "index.html" || lower === "note" || lower.startsWith("note/");
}

function resolvePathInPublic(relativePath, fallbackName = "") {
    const safePath = sanitizeRelativePath(relativePath, fallbackName);
    if (!safePath) return null;
    const absolutePath = path.resolve(publicRoot, safePath);
    if (absolutePath !== publicRoot && !absolutePath.startsWith(publicRoot + path.sep)) {
        return null;
    }
    return { safePath, absolutePath };
}

function safeUrlPath(relPath) {
    return (relPath || "")
        .split("/")
        .map(encodeURIComponent)
        .join("/");
}

function formatFileSize(size) {
    if (isNaN(size) || size < 0) return "-";
    if (size < 1024) return size + " B";
    let kb = size / 1024;
    if (kb < 1024) return kb.toFixed(1) + " KB";
    let mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(1) + " MB";
    let gb = mb / 1024;
    return gb.toFixed(1) + " GB";
}

function getSortedFiles(dir, rootDir, currentDir) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        console.error("readdirSync error:", err.message);
        return [];
    }

    let files = [];
    for (let entry of entries) {
        try {
            let fullPath = path.join(dir, entry.name);
            let relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
            if (!relativePath) relativePath = entry.name;
            let mtime = 0;
            let size = "-";
            try {
                let f = fs.statSync(fullPath);
                mtime = f.mtime.getTime();
                size = entry.isDirectory() ? "-" : formatFileSize(f.size);
            } catch (statErr) {
                console.warn(`statSync error for ${fullPath}:`, statErr.message);
            }
            files.push({
                name: entry.name,
                path: relativePath,
                isDir: entry.isDirectory(),
                time: mtime,
                size: size
            });
        } catch (itemErr) {
            console.warn("Error processing item in getSortedFiles:", itemErr.message);
        }
    }

    files = files.filter(item => {
        let lower = item.path.toLowerCase().replace(/[. ]+$/, "");
        if (lower === "index.html") return false;
        if (lower === "note" && !currentDir) return false;
        return true;
    });

    files.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    return files;
}

function getnote(id) {
    if (!/^\d+$/.test(String(id))) return "";
    let noteFilePath = path.join(publicRoot, "note", `note_${id}.txt`);
    if (!fs.existsSync(noteFilePath)) return "";
    try {
        return fs.readFileSync(noteFilePath, "utf8");
    } catch (e) {
        console.error("Error reading note file:", e.message);
        return "";
    }
}

// 3. Render giao dien Web HTML
function createIndex(rootDir, currentDir = "") {
    try {
        const target = currentDir ? resolvePathInPublic(currentDir) : { safePath: "", absolutePath: rootDir };
        if (!target || !fs.existsSync(target.absolutePath)) {
            return "<h1>Thu muc khong ton tai</h1>";
        }
        let files = getSortedFiles(target.absolutePath, rootDir, currentDir);
        let note = getnote(1);
        let currentPathLabel = currentDir ? "/" + currentDir : "/";
        let parentDir = "";
        if (currentDir) {
            const chunks = currentDir.split("/");
            chunks.pop();
            parentDir = chunks.join("/");
        }

        return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>File Server</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f6f8; margin: 20px; color: #333; }
        .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .image-upload-wrap { border: 3px dashed #1FB264; border-radius: 8px; position: relative; padding: 30px 20px; text-align: center; background: #fafdfb; cursor: pointer; transition: all .2s; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f0f2f5; margin: 0; padding: 15px 25px; color: #333; }
        .container { width: 100%; max-width: 100%; box-sizing: border-box; background: #fff; padding: 20px 25px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .image-upload-wrap { border: 2px dashed #1FB264; border-radius: 8px; position: relative; padding: 20px; text-align: center; background: #fafdfb; cursor: pointer; transition: all .2s; }
        .image-upload-wrap:hover, .image-upload-wrap.image-dropping { background-color: #eafaf1; border-color: #15824B; }
        .file-upload-input { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
        .drag-text h3 { margin: 0; color: #15824B; font-size: 18px; font-weight: 600; }
        .controls-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin: 20px 0 15px 0; }
        .drag-text h3 { margin: 0; color: #15824B; font-size: 16px; font-weight: 600; }
        .controls-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin: 15px 0 12px 0; }
        .nav-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        #search { padding: 8px 14px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; width: 280px; outline: none; }
        #search { padding: 8px 14px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; width: 300px; outline: none; }
        #search:focus { border-color: #0d6efd; box-shadow: 0 0 0 2px rgba(13,110,253,0.25); }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; background: #fff; }
        th, td { border: 1px solid #e9ecef; padding: 10px 12px; text-align: left; font-size: 14px; }
        th { background-color: #f8f9fa; font-weight: 600; color: #495057; }
        table { border-collapse: collapse; width: 100%; margin-top: 5px; background: #fff; }
        th, td { border: 1px solid #e9ecef; padding: 9px 12px; text-align: left; font-size: 14px; }
        th { background-color: #f8f9fa; font-weight: 600; color: #495057; white-space: nowrap; }
        tr:hover { background-color: #f8fbfd; }
        .selected-row { background-color: #e8f4fd !important; }
        .file-checkbox { width: 18px; height: 18px; cursor: pointer; margin: 0; vertical-align: middle; }
        .btn { cursor: pointer; outline: 0; border: 1px solid transparent; padding: 6px 12px; font-size: 13px; font-weight: 500; border-radius: 4px; transition: all .15s; display: inline-flex; align-items: center; gap: 5px; text-decoration: none; }
        .btn-primary { color: #fff; background-color: #0d6efd; border-color: #0d6efd; }
        .btn-primary:hover { background-color: #0b5ed7; }
        .btn-danger { color: #fff; background-color: #dc3545; border-color: #dc3545; }
        .btn-danger:hover { background-color: #bb2d3b; }
        .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
        .remove-link { color: #dc3545; cursor: pointer; font-weight: 600; text-decoration: none; }
        .remove-link:hover { text-decoration: underline; }
        .note-section { margin-top: 30px; border-top: 2px solid #e9ecef; padding-top: 20px; }
        #note { width: 100%; height: 35vh; box-sizing: border-box; padding: 12px; font-family: Consolas, monospace; font-size: 14px; border: 1px solid #ced4da; border-radius: 4px; resize: vertical; outline: none; }
        #note:focus { border-color: #0d6efd; box-shadow: 0 0 0 2px rgba(13,110,253,0.25); }
        #snackbar { visibility: hidden; min-width: 200px; background-color: #212529; color: #fff; text-align: center; border-radius: 6px; padding: 12px 20px; position: fixed; z-index: 9999; right: 25px; top: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 10px; }
        #snackbar.show { visibility: visible; }
        .loader { border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top: 2px solid #ffffff; width: 14px; height: 14px; animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <form id="form-upload" action="/upload" method="post" enctype="multipart/form-data" onsubmit="event.preventDefault()">
            <input type="hidden" name="currentDir" value="${escapeHtml(currentDir)}">
            <div class="image-upload-wrap" id="drop-zone">
                <input id="files" type="file" name="filetoupload[]" class="file-upload-input" onchange="onUpload(this)" multiple>
                <div class="drag-text">
                    <h3 id="upload-label">Kéo thả file vào đây hoặc nhấn để chọn file</h3>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 5px;">Hỗ trợ dán ảnh trực tiếp từ Clipboard (Ctrl+V)</div>
                </div>
            </div>
        </form>

        <div class="controls-row">
            <div class="nav-actions">
                <input id="folders" type="file" style="display:none" onchange="onUploadFolder(this)" webkitdirectory directory multiple>
                <button type="button" class="btn btn-primary" onclick="document.getElementById('folders').click()">📁 Upload Folder</button>
                <button type="button" class="btn btn-primary" onclick="pasteClipboardImage()">📋 Dán ảnh từ Clipboard</button>
                ${currentDir ? `<button type="button" class="btn btn-primary" onclick="location.href='/?dir=${encodeURIComponent(parentDir)}'">⬆️ Lên thư mục cha</button>` : ""}
            </div>
            <div>
                <input type="text" placeholder="Tìm kiếm file/folder..." id="search" oninput="filter(this.value)">
            </div>
        </div>

        <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; background: #f8f9fa; padding: 10px 14px; border-radius: 6px; border: 1px solid #dee2e6;">
            <div>Thư mục hiện tại: <b>${escapeHtml(currentPathLabel)}</b></div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div>Tổng số: <b>${files.length}</b> mục</div>
                <span id="selected-info" style="display: none; font-weight: bold; color: #0d6efd; background: #e7f1ff; padding: 4px 10px; border-radius: 4px;">| Đã chọn: <span id="selected-count">0</span></span>
                <button type="button" id="btn-delete-selected" class="btn btn-danger" style="display: none; font-weight: bold; padding: 6px 14px; box-shadow: 0 2px 4px rgba(220,53,69,0.25);" onclick="deleteSelected()">
                    🗑️ Xóa đã chọn (<span id="btn-delete-count">0</span>)
                </button>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 35px; text-align: center;">
                    <th style="width: 38px; text-align: center;">
                        <input type="checkbox" id="check-all" class="file-checkbox" onclick="toggleSelectAll(this)" title="Chọn tất cả">
                    </th>
                    <th style="width: 35px; text-align: center;">#</th>
                    <th style="width: 60px;">Link</th>
                    <th>Loại</th>
                    <th style="width: 45px; text-align: center;">#</th>
                    <th style="width: 70px; text-align: center;">Link</th>
                    <th style="width: 75px;">Loại</th>
                    <th>Tên</th>
                    <th>Kích thước</th>
                    <th>Ngày sửa đổi</th>
                    <th style="width: 60px; text-align: center;">Xóa</th>
                    <th style="width: 100px; white-space: nowrap;">Kích thước</th>
                    <th style="width: 170px; white-space: nowrap;">Ngày sửa đổi</th>
                    <th style="width: 70px; text-align: center;">Xóa</th>
                </tr>
            </thead>
            <tbody>
                ${files.map((item, index) => `
                    <tr class="file-row" data-name="${escapeHtml(item.name)}">
                        <td style="text-align: center;">
                            <input type="checkbox" class="file-checkbox row-checkbox" data-path="${encodeURIComponent(item.path)}" onchange="onRowCheckboxChange()">
                        </td>
                        <td style="text-align: center;">${index + 1}</td>
                        <td>
                        <td style="text-align: center;">
                            ${item.isDir ? "-" : `<button type="button" class="btn btn-primary" style="padding: 2px 8px; font-size: 12px;" data-path="${encodeURIComponent(item.path)}" onclick="copy(decodeURIComponent(this.getAttribute('data-path')))">Copy</button>`}
                        </td>
                        <td>${item.isDir ? "Folder" : "File"}</td>
                        <td>
                        <td style="word-break: break-word;">
                            ${item.isDir 
                                ? `<a href="/?dir=${encodeURIComponent(item.path)}" style="font-weight: 600; text-decoration: none; color: #0d6efd;">📁 ${escapeHtml(item.name)}</a>`
                                : `<a href="/${safeUrlPath(item.path)}" download="${escapeHtml(item.name)}" style="text-decoration: none; color: #212529;">📄 ${escapeHtml(item.name)}</a>`}
                        </td>
                        <td>${escapeHtml(item.size)}</td>
                        <td>${moment(item.time).format("DD/MM/YYYY HH:mm:ss")}</td>
                        <td style="white-space: nowrap;">${escapeHtml(item.size)}</td>
                        <td style="white-space: nowrap;">${moment(item.time).format("DD/MM/YYYY HH:mm:ss")}</td>
                        <td style="text-align: center;">
                            <span class="remove-link" data-path="${encodeURIComponent(item.path)}" onclick="deleteSingle(decodeURIComponent(this.getAttribute('data-path')))">Xóa</span>
                        </td>
                    </tr>
                `).join("\n")}
                ${files.length === 0 ? `<tr><td colspan="8" style="text-align: center; color: #6c757d; padding: 25px;">Thư mục trống</td></tr>` : ""}
            </tbody>
        </table>

        <div class="note-section">
            <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">📝 Chia sẻ ghi chú nhanh</div>
            <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                <span>ID Note:</span>
                <input type="number" value="1" id="notes" min="1" style="width: 70px; padding: 4px 8px;" onchange="getNotes(this.value)">
                <button type="button" class="btn btn-primary" onclick="copyNoteLink()">Copy Link Note</button>
            </div>
            <textarea id="note" oninput="onChangeNote()">${escapeHtml(note)}</textarea>
        </div>
    </div>

    <div id="floating-delete-bar" style="display: none; position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #212529; color: #fff; padding: 10px 22px; border-radius: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.35); z-index: 9998; align-items: center; gap: 16px;">
        <span style="font-size: 14px;">Đã chọn: <b id="floating-selected-count" style="color: #ffc107; font-size: 16px;">0</b> mục</span>
        <button type="button" class="btn btn-danger" style="border-radius: 20px; padding: 6px 18px; font-weight: bold;" onclick="deleteSelected()">
            🗑️ Xóa các mục đã chọn
        </button>
    </div>

    <div id="snackbar">
        <span id="snackbar-msg"></span>
        <div id="snackbar-loader" class="loader" style="display: none;"></div>
    </div>

    <script>
        const CURRENT_DIR = ${JSON.stringify(currentDir)};
        let toastTimer = null;
        let noteTimer = null;
        let cacheNote = document.getElementById('note').value;

        function toast(mess, timeout = 99999) {
            const tag = document.getElementById("snackbar");
            const msgSpan = document.getElementById("snackbar-msg");
            const loader = document.getElementById("snackbar-loader");
            if (msgSpan) msgSpan.textContent = mess;
            if (loader) loader.style.display = (timeout === 99999 ? "inline-block" : "none");
            tag.className = "show";
            clearTimeout(toastTimer);
            if (timeout < 99999) {
                toastTimer = setTimeout(() => { tag.className = tag.className.replace("show", ""); }, timeout);
            }
        }

        function onUpload(input) {
            const files = (input && input.files) ? input.files : [];
            uploadFiles(files, false);
        }
        function onUploadFolder(input) {
            const files = (input && input.files) ? input.files : [];
            uploadFiles(files, true);
        }

        function uploadFiles(files, keepRelativePath) {
            if (!files || !files.length) return;
            const label = files.length === 1 ? files[0].name : files.length + ' files';
            const uploadLabel = document.getElementById("upload-label");
            if (uploadLabel) uploadLabel.textContent = 'Đang tải lên ' + label + '...';
            toast('Đang tải lên ' + label + '...');

            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append('filetoupload[]', files[i], files[i].name);
                if (keepRelativePath) {
                    const rel = files[i].webkitRelativePath || files[i].name;
                    formData.append('relativePaths[]', rel);
                }
            }
            formData.append('currentDir', CURRENT_DIR);

            fetch('/upload', { method: 'POST', body: formData })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        toast('Tải lên thành công!', 800);
                        setTimeout(() => location.reload(), 600);
                    } else {
                        alert('Lỗi tải lên: ' + (data.message || 'Thất bại'));
                        location.reload();
                    }
                })
                .catch(err => {
                    console.error('Upload error:', err);
                    toast('Lỗi kết nối khi upload', 2000);
                });
        }

        const dropZone = document.getElementById('drop-zone');
        if (dropZone) {
            dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('image-dropping'); });
            dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.classList.remove('image-dropping'); });
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('image-dropping');
                if (e.dataTransfer && e.dataTransfer.files) uploadFiles(e.dataTransfer.files, false);
            });
        }

        document.addEventListener('paste', e => {
            if (!e.clipboardData) return;
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            const items = Array.from(e.clipboardData.items || []);
            const imgItem = items.find(i => i.type && i.type.startsWith('image/'));
            if (!imgItem) return;
            const file = imgItem.getAsFile();
            if (file) {
                e.preventDefault();
                uploadFiles([file], false);
            }
        });

        function pasteClipboardImage() {
            if (navigator.clipboard && navigator.clipboard.read) {
                navigator.clipboard.read().then(items => {
                    let found = false;
                    for (const item of items) {
                        const imgType = item.types.find(t => t.startsWith('image/'));
                        if (imgType) {
                            found = true;
                            item.getType(imgType).then(blob => {
                                const ext = imgType === 'image/jpeg' ? 'jpg' : (imgType.split('/')[1] || 'png');
                                const file = new File([blob], 'clipboard_' + Date.now() + '.' + ext, { type: imgType });
                                uploadFiles([file], false);
                            });
                            break;
                        }
                    }
                    if (!found) toast('Không tìm thấy ảnh trong clipboard', 2000);
                }).catch(err => {
                    console.warn('Clipboard read error:', err);
                    toast('Nhấn Ctrl+V để dán ảnh', 2000);
                });
            } else {
                toast('Nhấn Ctrl+V để dán ảnh', 2000);
            }
        }

        function safeEncodePath(p) {
            return (p || '').split('/').map(encodeURIComponent).join('/');
        }

        function copy(relPath) {
            const url = location.protocol + '//' + location.host + '/' + safeEncodePath(relPath);
            navigator.clipboard.writeText(url).then(() => {
                toast('Đã sao chép link file', 1000);
            }).catch(() => {
                const input = document.createElement('input');
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                toast('Đã sao chép link file', 1000);
            });
        }

        function copyNoteLink() {
            const id = document.getElementById('notes').value || '1';
            const url = location.protocol + '//' + location.host + '/note/note_' + encodeURIComponent(id) + '.txt';
            navigator.clipboard.writeText(url).then(() => {
                toast('Đã sao chép link note', 1000);
            });
        }

        function removeVietnameseTones(str) {
            return (str || '')
                .normalize('NFD')
                .replace(/[\\u0300-\\u036f]/g, '')
                .replace(/đ/g, 'd').replace(/Đ/g, 'D')
                .toLowerCase();
        }

        function filter(text) {
            const query = removeVietnameseTones((text || '').trim());
            const rows = document.querySelectorAll('tr.file-row');
            rows.forEach(row => {
                const name = removeVietnameseTones(row.getAttribute('data-name') || '');
                row.hidden = !name.includes(query);
            });
            updateSelectedCount();
        }

        function toggleSelectAll(masterCb) {
            const rows = document.querySelectorAll('tr.file-row');
            rows.forEach(row => {
                if (!row.hidden) {
                    const cb = row.querySelector('.row-checkbox');
                    if (cb) cb.checked = masterCb.checked;
                }
            });
            updateSelectedCount();
        }

        function onRowCheckboxChange() {
            updateSelectedCount();
        }

        function getSelectedItems() {
            const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
            const items = [];
            checkedBoxes.forEach(cb => {
                const p = decodeURIComponent(cb.getAttribute('data-path') || '');
                const row = cb.closest('tr');
                if (p) items.push({ path: p, isHidden: row ? row.hidden : false });
            });
            return items;
        }

        function updateSelectedCount() {
            const visibleRows = Array.from(document.querySelectorAll('tr.file-row')).filter(r => !r.hidden);
            const visibleCbs = visibleRows.map(r => r.querySelector('.row-checkbox')).filter(Boolean);
            const allChecked = document.querySelectorAll('.row-checkbox:checked');
            const count = allChecked.length;

            const selectedInfo = document.getElementById('selected-info');
            const selectedCount = document.getElementById('selected-count');
            const btnDelete = document.getElementById('btn-delete-selected');
            const btnDeleteCount = document.getElementById('btn-delete-count');
            const floatingBar = document.getElementById('floating-delete-bar');
            const floatingCount = document.getElementById('floating-selected-count');

            if (selectedInfo) selectedInfo.style.display = count > 0 ? 'inline' : 'none';
            if (selectedCount) selectedCount.textContent = count;
            if (btnDelete) {
                btnDelete.style.display = count > 0 ? 'inline-flex' : 'none';
                btnDelete.disabled = false;
            }
            if (btnDeleteCount) btnDeleteCount.textContent = count;
            if (floatingBar) floatingBar.style.display = count > 0 ? 'flex' : 'none';
            if (floatingCount) floatingCount.textContent = count;

            document.querySelectorAll('tr.file-row').forEach(row => {
                const cb = row.querySelector('.row-checkbox');
                if (cb && cb.checked) row.classList.add('selected-row');
                else row.classList.remove('selected-row');
            });

            const masterCb = document.getElementById('check-all');
            if (masterCb) {
                const visibleChecked = visibleCbs.filter(cb => cb.checked).length;
                if (visibleCbs.length > 0 && visibleChecked === visibleCbs.length) {
                    masterCb.checked = true;
                    masterCb.indeterminate = false;
                } else if (visibleChecked > 0) {
                    masterCb.checked = false;
                    masterCb.indeterminate = true;
                } else {
                    masterCb.checked = false;
                    masterCb.indeterminate = false;
                }
            }
        }

        function deleteSingle(filename) {
            if (!confirm('Bạn có chắc chắn muốn xóa: "' + filename + '"?')) return;
            executeDelete([filename]);
        }
        window.Delete = deleteSingle;

        function deleteSelected() {
            const items = getSelectedItems();
            if (!items.length) {
                toast('Chưa chọn mục nào để xóa', 1500);
                return;
            }
            const hiddenCount = items.filter(i => i.isHidden).length;
            let msg = 'Bạn có chắc muốn xóa ' + items.length + ' mục đã chọn không?';
            if (hiddenCount > 0) msg += '\\n(Lưu ý: Có ' + hiddenCount + ' mục đang bị ẩn bởi bộ lọc tìm kiếm)';
            msg += '\\n\\nThao tác này không thể hoàn tác!';
            if (!confirm(msg)) return;

            executeDelete(items.map(i => i.path));
        }

        function executeDelete(paths) {
            toast('Đang xóa...');
            const btn = document.getElementById('btn-delete-selected');
            if (btn) btn.disabled = true;

            fetch('/delete-multiple', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: paths })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (data.errors && data.errors.length > 0) {
                        const errMsg = 'Đã xóa ' + data.count + ' mục.\\nMột số mục không thể xóa:\\n' +
                            data.errors.map(e => '- ' + e.path + ': ' + e.error).join('\\n');
                        alert(errMsg);
                    } else {
                        toast('Đã xóa thành công ' + data.count + ' mục', 600);
                    }
                    setTimeout(() => location.reload(), 600);
                } else {
                    alert('Lỗi khi xóa: ' + (data.message || 'Thất bại'));
                    if (btn) btn.disabled = false;
                }
            })
            .catch(err => {
                console.error('Delete error:', err);
                toast('Lỗi kết nối máy chủ', 2000);
                if (btn) btn.disabled = false;
            });
        }

        function onChangeNote() {
            const val = document.getElementById('note').value;
            const id = document.getElementById('notes').value || '1';
            if (val === cacheNote) return;
            cacheNote = val;
            clearTimeout(noteTimer);
            noteTimer = setTimeout(() => {
                toast('Đang lưu note...');
                fetch('/note/' + encodeURIComponent(id), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: val })
                })
                .then(r => r.text())
                .then(() => toast('Đã lưu note', 500))
                .catch(err => {
                    console.error('Save note error:', err);
                    toast('Lỗi khi lưu note', 2000);
                });
            }, 600);
        }

        function getNotes(id) {
            if (!/^\\d+$/.test(id)) {
                id = 1;
                document.getElementById('notes').value = id;
            }
            toast('Đang tải note ' + id + '...');
            fetch('/getnote/' + encodeURIComponent(id))
                .then(r => r.json())
                .then(data => {
                    toast('Đã tải note ' + id, 300);
                    const text = data.text || '';
                    document.getElementById('note').value = text;
                    cacheNote = text;
                })
                .catch(err => {
                    console.error('getNotes error:', err);
                    toast('Lỗi tải note', 2000);
                });
        }
    </script>
</body>
</html>`;
    } catch (err) {
        console.error("createIndex error:", err);
        return "<h1>Đã xảy ra lỗi khi tạo giao diện</h1>";
    }
}

// 4. Cac Endpoints API

app.get("/", function (req, res) {
    try {
        let dir = sanitizeRelativePath(req.query.dir || "", "") || "";
        if (dir) {
            const target = resolvePathInPublic(dir);
            if (!target || !fs.existsSync(target.absolutePath) || !fs.statSync(target.absolutePath).isDirectory()) {
                return res.redirect("/");
            }
        }
        let html = createIndex(publicRoot, dir);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    } catch (err) {
        console.error("Error in GET /:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/delete-multiple", (req, res) => {
    try {
        let rawPaths = req.body && req.body.paths;
        if (!Array.isArray(rawPaths)) {
            if (typeof rawPaths === "string" && rawPaths.trim()) rawPaths = [rawPaths];
            else rawPaths = [];
        }

        if (rawPaths.length === 0) {
            return res.status(400).json({ success: false, message: "Chưa chọn file hoặc thư mục nào để xóa" });
        }

        let deletedCount = 0;
        let errors = [];

        for (let itemPath of rawPaths) {
            const target = resolvePathInPublic(itemPath);
            if (!target || !fs.existsSync(target.absolutePath)) {
                errors.push({ path: itemPath, error: "Mục không tồn tại" });
                continue;
            }
            if (target.absolutePath === publicRoot || isSystemProtectedPath(target.safePath)) {
                errors.push({ path: itemPath, error: "Không thể xóa file hoặc thư mục hệ thống" });
                continue;
            }
            try {
                if (fs.statSync(target.absolutePath).isDirectory()) {
                    fs.rmSync(target.absolutePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(target.absolutePath);
                }
                deletedCount++;
            } catch (delErr) {
                console.error(`Error deleting ${target.safePath}:`, delErr.message);
                errors.push({ path: itemPath, error: delErr.message });
            }
        }

        res.json({
            success: true,
            count: deletedCount,
            errors: errors
        });
    } catch (err) {
        console.error("Error in /delete-multiple:", err);
        res.status(500).json({ success: false, message: "Lỗi server khi xóa file" });
    }
});

// Chan GET /delete de bao ve chong CSRF
app.get("/delete", (req, res) => {
    res.status(405).send("Phương thức GET không được hỗ trợ để xóa file vì lý do an toàn. Vui lòng sử dụng giao diện chính.");
});

app.post("/upload", (req, res) => {
    try {
        let maxFileSize = 10 * 1024 * 1024 * 1024; // 10GB
        let form = new formidable.IncomingForm({
            maxFileSize,
            multiples: true,
            maxFiles: 1000
        });

        form.parse(req, function (err, fields, files) {
            if (err) {
                console.error("Formidable parse error:", err);
                return res.status(500).json({ success: false, message: "Lỗi xử lý file upload" });
            }

            let uploadFiles = [];
            for (let key of Object.keys(files || {})) {
                let fileValue = files[key];
                if (Array.isArray(fileValue)) uploadFiles.push(...fileValue);
                else if (fileValue) uploadFiles.push(fileValue);
            }

            let currentDirRaw = Array.isArray(fields.currentDir) ? fields.currentDir[0] : fields.currentDir;
            let currentDir = sanitizeRelativePath(currentDirRaw || "", "") || "";
            const relativePathsRaw = fields["relativePaths[]"] ?? fields.relativePaths;
            const relativePaths = Array.isArray(relativePathsRaw)
                ? relativePathsRaw
                : (relativePathsRaw ? [relativePathsRaw] : []);

            uploadFiles = uploadFiles.filter(f => f && (f.originalFilename || "").trim() !== "");
            if (uploadFiles.length === 0) {
                return res.status(400).json({ success: false, message: "Chưa chọn file nào" });
            }

            let successCount = 0;
            for (let index = 0; index < uploadFiles.length; index++) {
                let file = uploadFiles[index];
                let originalName = (file.originalFilename || "").trim();
                let filename = path.basename(originalName);
                let oldpath = file.filepath || file.path;
                if (!filename || !oldpath) continue;

                let clientRel = sanitizeRelativePath(relativePaths[index] || "", "") || filename;
                let relPath = currentDir ? `${currentDir}/${clientRel}` : clientRel;
                const target = resolvePathInPublic(relPath, filename);

                if (!target || isSystemProtectedPath(target.safePath)) {
                    try { if (fs.existsSync(oldpath)) fs.unlinkSync(oldpath); } catch (e) {}
                    continue;
                }

                let newpath = target.absolutePath;
                try {
                    fs.mkdirSync(path.dirname(newpath), { recursive: true });
                    fs.copyFileSync(oldpath, newpath);
                    successCount++;
                } catch (copyErr) {
                    console.error(`Copy file error for ${newpath}:`, copyErr.message);
                } finally {
                    try { if (fs.existsSync(oldpath)) fs.unlinkSync(oldpath); } catch (e) {}
                }
            }

            res.json({ success: true, count: successCount });
        });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ success: false, message: "Lỗi server khi upload" });
    }
});

app.get("/getnote/:id", (req, res) => {
    try {
        let id = req.params.id;
        if (!/^\d+$/.test(id)) {
            return res.status(400).json({ error: "Invalid note ID" });
        }
        let note = getnote(id);
        res.json({ text: note });
    } catch (err) {
        console.error("Error in /getnote/:id:", err);
        res.status(500).json({ error: "Error" });
    }
});

app.post("/note/:id", (req, res) => {
    try {
        let id = req.params.id;
        if (!/^\d+$/.test(id)) {
            return res.status(400).send("Invalid note ID");
        }
        let text = (req.body && req.body.data !== undefined) ? String(req.body.data) : "";
        let noteFilePath = path.join(publicRoot, "note", `note_${id}.txt`);
        fs.writeFileSync(noteFilePath, text, "utf8");
        res.send("ok");
    } catch (err) {
        console.error("Note write error:", err);
        res.status(500).send("Lỗi note");
    }
});

const port = 8082;
app.listen(port, () => {
    console.log(`\nStart server at: ${new Date()}
                HTTP server is listening at: localhost:${port}
    `);
});
