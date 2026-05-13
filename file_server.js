// pkg -t node18-win --public file_server.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const body_parser = require("body-parser");
const path = require("path");
const fs = require("fs");
const app = express();
const moment = require("moment");
const formidable = require('formidable');

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(cors());
app.use(
    morgan(
        ":date[iso] :remote-addr :remote-user :user-agent :method :url HTTP/:http-version :status :res[content-length] - :response-time ms"
    )
);
app.use(body_parser.json({ limit: "50mb" }));
app.use(body_parser.urlencoded({ extended: false, limit: "50mb" }));
// app.use('/api/', routes);
app.use("/", function (req, res, next) {
    try {
        const publicRoot = __dirname + "/public";
        if (!fs.existsSync(publicRoot)) {
            fs.mkdirSync(publicRoot);
        }

        if (!fs.existsSync(publicRoot + "/note")) {
            fs.mkdirSync(publicRoot + "/note");
        }

        let { alert = null } = req.query;
        if (alert) {
            return res.send(`
                <script> 
                    alert('${alert}');
                    window.location.href = '/';
                </script >
            `);
        }
        else {
            let dir = sanitizeRelativePath(req.query.dir || '', '') || '';
            if (dir) {
                const target = resolvePathInPublic(dir);
                if (!target || !fs.existsSync(target.absolutePath) || !fs.statSync(target.absolutePath).isDirectory()) {
                    return res.redirect('/?alert=Folder không tồn tại');
                }
            }
            createIndex(publicRoot, dir);
            // res.redirect('/');
            next();
        }
    }
    catch (err) {
        console.log(err);
        next();
    }

}, express.static(__dirname + "/public"));

const logPath = __dirname + '/../BotFather/botfather_c++/logs';
if (fs.existsSync(logPath)) {
    app.use(express.static(logPath));
    console.log('public ', logPath);
    app.get("/logs", (req, res) => {
        const latest = `botfather_${moment().format('YYYY-MM-DD')}.log`;
        res.redirect('/' + latest);
    });
}

function sanitizeRelativePath(relativePath, fallbackName = '') {
    let raw = String(relativePath || fallbackName || '').trim();
    if (!raw) return null;
    raw = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    let parts = raw.split('/').filter(Boolean).filter(part => part !== '.' && part !== '..');
    if (parts.length === 0) return null;
    return parts.join('/');
}

function resolvePathInPublic(relativePath, fallbackName = '') {
    const safePath = sanitizeRelativePath(relativePath, fallbackName);
    if (!safePath) return null;
    const publicRoot = path.join(__dirname, 'public');
    const absolutePath = path.resolve(publicRoot, safePath);
    if (absolutePath !== publicRoot && !absolutePath.startsWith(publicRoot + path.sep)) {
        return null;
    }
    return { safePath, absolutePath };
}

app.get("/delete", (req, res) => {
    try {
        let file = req.query.path || '';
        let dir = sanitizeRelativePath(req.query.dir || '', '') || '';
        const redirectUrl = dir ? `/?dir=${encodeURIComponent(dir)}` : '/';
        const target = resolvePathInPublic(file);
        if (!target || !fs.existsSync(target.absolutePath)) {
            return res.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}alert=Lỗi delete`);
        }
        console.log(`/delete ${target.safePath}`);
        if (fs.statSync(target.absolutePath).isDirectory()) {
            fs.rmSync(target.absolutePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(target.absolutePath);
        }
        res.redirect(redirectUrl);
    } catch (err) {
        console.log(err);
        res.redirect(`/?alert=Lỗi delete`);
    }
});

function getnote(id) {
    let path = __dirname + '/public/note/note_' + id + '.txt';
    if (!fs.existsSync(path)) {
        return '';
    }
    let note = fs.readFileSync(path).toString();
    return note;
}

app.get("/getnote/:id", (req, res) => {
    try {
        let id = req.params.id;
        let note = getnote(id);
        res.send({ text: note });
    } catch (err) {
        console.log(err)
        res.send(`Error`);
    }
});

app.post('/upload', (req, res) => {
    try {
        console.log('/upload');
        let maxFileSize = 10 * 1024 * 1024 * 1024; //10GB
        let form = new formidable.IncomingForm({
            maxFileSize,
            multiples: true,
            maxFiles: 1000
        });
        form.parse(req, function (err, fields, files) {
            try {
                if (err) {
                    console.log(err)
                    res.redirect(`/?alert=Lỗi upload`);
                    return;
                }
                let uploadFiles = [];
                for (let key of Object.keys(files || {})) {
                    let fileValue = files[key];
                    if (Array.isArray(fileValue)) {
                        uploadFiles.push(...fileValue);
                    } else if (fileValue) {
                        uploadFiles.push(fileValue);
                    }
                }
                let currentDir = sanitizeRelativePath(fields.currentDir || '', '') || '';
                const relativePathsRaw = fields['relativePaths[]'] ?? fields.relativePaths;
                const relativePaths = Array.isArray(relativePathsRaw)
                    ? relativePathsRaw
                    : (relativePathsRaw ? [relativePathsRaw] : []);
                const redirectUrl = currentDir ? `/?dir=${encodeURIComponent(currentDir)}` : '/';
                uploadFiles = uploadFiles.filter(file => file && (file.originalFilename || '').trim() !== '');
                if (uploadFiles.length === 0) return res.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}alert=Chưa chọn file`);

                for (let index = 0; index < uploadFiles.length; index++) {
                    let file = uploadFiles[index];
                    let originalName = (file.originalFilename || '').trim();
                    let filename = path.basename(originalName);
                    if (!filename) continue;
                    let oldpath = file.filepath;
                    let clientRelativePath = sanitizeRelativePath(relativePaths[index] || '', '') || filename;
                    let relativePath = currentDir ? `${currentDir}/${clientRelativePath}` : clientRelativePath;
                    const target = resolvePathInPublic(relativePath, filename);
                    if (!target) continue;
                    let newpath = target.absolutePath;
                    fs.mkdirSync(path.dirname(newpath), { recursive: true });
                    console.log(`copy file ${oldpath} to ${newpath}`);
                    fs.copyFileSync(oldpath, newpath);
                    console.log(`delete file ${oldpath}`)
                    fs.unlinkSync(oldpath);
                }
                res.redirect(redirectUrl);
            }
            catch (err) {
                console.log(err)
                res.redirect(`/?alert=Lỗi upload`);
            }
        });
    }
    catch (err) {
        console.log(err)
        res.redirect(`/`);
    }
});

app.post("/note/:id", (req, res) => {
    try {
        let id = req.params.id;
        console.log('write note ' + id);
        let text = req.body.data || '';
        fs.writeFileSync(__dirname + "/public/note/note_" + id + ".txt", text);
        res.send(`ok`);
    } catch (err) {
        console.log(err);
        res.send(`Lỗi note`);
    }
});

function formatFileSize(size) {
    let unit = 'B';
    if (size > 1024) {
        size = (size / 1024).toFixed(1);
        unit = 'KB';
        if (size > 1024) {
            size = (size / 1024).toFixed(1);
            unit = 'MB';
            if (size > 1024) {
                size = (size / 1024).toFixed(1);
                unit = 'GB';
            }
        }
    }
    return size + ' ' + unit;
}

function getSortedFiles(dir, rootDir, currentDir) {
    let files = fs.readdirSync(dir, { withFileTypes: true }).map(entry => {
        let fullPath = path.join(dir, entry.name);
        let relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        if (!relativePath) relativePath = entry.name;
        let f = fs.statSync(fullPath);
        return {
            name: entry.name,
            path: relativePath,
            isDir: entry.isDirectory(),
            time: f.mtime.getTime(),
            size: entry.isDirectory() ? '-' : formatFileSize(f.size)
        };
    });
    files = files.filter(item => {
        if (item.path === 'index.html') return false;
        if (item.path === 'note' && !currentDir) return false;
        return true;
    });
    files.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return files;
};

function createIndex(rootPath, currentDir = '') {
    try {
        const target = currentDir ? resolvePathInPublic(currentDir) : { safePath: '', absolutePath: rootPath };
        if (!target || !fs.existsSync(target.absolutePath)) return;
        let files = getSortedFiles(target.absolutePath, rootPath, currentDir);
        let note = getnote(1);
        let currentPathLabel = currentDir ? '/' + currentDir : '/';
        let parentDir = '';
        if (currentDir) {
            const chunks = currentDir.split('/');
            chunks.pop();
            parentDir = chunks.join('/');
        }

        let html = `
            <style>
                body {
                    font-family: sans-serif;
                    background-color: #eeeeee;
                    zoom: 1;
                }
                
                .file-upload {
                    background-color: #ffffff;
                    width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                .file-upload-btn {
                    width: 100%;
                    margin: 0;
                    color: #fff;
                    background: #1FB264;
                    border: none;
                    padding: 10px;
                    border-radius: 4px;
                    border-bottom: 4px solid #15824B;
                    transition: all .2s ease;
                    outline: none;
                    text-transform: uppercase;
                    font-weight: 700;
                }
                
                .file-upload-btn:hover {
                    background: #1AA059;
                    color: #ffffff;
                    transition: all .2s ease;
                    cursor: pointer;
                }
                
                .file-upload-btn:active {
                    border: 0;
                    transition: all .2s ease;
                }
                
                .file-upload-input {
                    position: absolute;
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                    outline: none;
                    opacity: 0;
                    cursor: pointer;
                }
                
                .image-upload-wrap {
                    margin-top: 20px;
                    border: 4px dashed #1FB264;
                    position: relative;
                }
                
                .image-dropping,
                .image-upload-wrap:hover {
                    background-color: #1FB264;
                    border: 4px dashed #ffffff;
                }
                
                .drag-text {
                    text-align: center;
                }
                
                .drag-text h3 {
                    font-weight: 100;
                    text-transform: uppercase;
                    color: #15824B;
                    padding: 25px 0;
                }

                #search {
                    padding: 6px 15px;
                    border: 0;
                    font-size: 24px;
                    margin-top: 5px;
                    margin-bottom: 5px;
                }
              
                table {
                    border-collapse: collapse;
                    width: 60% !important;
                }

                td, th {
                    border: 1px solid black;
                    padding: 10px;
                    text-align: left;
                }

                #note {
                    width: 100%;
                    height: 65vh;
                }

                #snackbar {
                    visibility: hidden;
                    min-width: 150px;
                    margin-left: -125px;
                    background-color: #28A745;
                    color: #fff;
                    text-align: center; 
                    border-radius: 2px; 
                    padding: 16px; 
                    position: fixed; 
                    z-index: 1; 
                    right: 10px; 
                    top: 10px; 
                }
                  
                /* Show the snackbar when clicking on a button (class added with JavaScript) */
                  #snackbar.show {
                    visibility: visible; /* Show the snackbar */
                    /* Add animation: Take 0.5 seconds to fade in and out the snackbar.
                    However, delay the fade out process for 2.5 seconds */
                    -webkit-animation: fadein 0.5s, fadeout 0.5s 2.5s;
                    animation: fadein 0.5s, fadeout 0.5s 2.5s;
                }
                  
                /* Animations to fade the snackbar in and out */
                @-webkit-keyframes fadein {
                    from {top: 0; opacity: 0;}
                    to {top: 10px; opacity: 1;}
                }
                  
                @keyframes fadein {
                    from {top: 0; opacity: 0;}
                    to {top: 10px; opacity: 1;}
                }
                  
                @-webkit-keyframes fadeout {
                    from {top: 10px; opacity: 1;}
                    to {top: 0; opacity: 0;}
                }
                  
                @keyframes fadeout {
                    from {top: 10px; opacity: 1;}
                    to {top: 0; opacity: 0;}
                }

                .remove{
                    color:red; 
                    cursor:pointer;
                }

                .loader {
                    border: 2px solid #f3f3f3;
                    border-radius: 50%;
                    border-top: 2px solid #3498db;
                    width: 15px;
                    height: 15px;
                    -webkit-animation: spin 2s linear infinite; /* Safari */
                    animation: spin 2s linear infinite;
                    margin-left: auto;
                    margin-right: auto;
                    margin-top: 5px;
                }

                .btn-copy {
                    cursor: pointer;
                    outline: 0;
                    color: #fff;
                    background-color: #0d6efd;
                    border-color: #0d6efd;
                    display: inline-block;
                    font-weight: 400;
                    line-height: 1.5;
                    text-align: center;
                    border: 1px solid transparent;
                    padding: 6px 12px;
                    font-size: 16px;
                    border-radius: .25rem;
                    transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out;
                    :hover {
                        color: #fff;
                        background-color: #0b5ed7;
                        border-color: #0a58ca;
                    }
                }
                  
                /* Safari */
                  @-webkit-keyframes spin {
                    0% { -webkit-transform: rotate(0deg); }
                    100% { -webkit-transform: rotate(360deg); }
                }
                  
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
            <form id="form-upload" action="upload" method="post" enctype="multipart/form-data">
                <div class="image-upload-wrap">
                    <input id="files" type="file" name="filetoupload[]" class="file-upload-input" onchange="onUpload(this)" multiple>
                    <div class="drag-text">
                        <h3 id='filename'>Drag and drop or select file</h3>
                    </div>
                </div>
            </form>
            <input id="folders" type="file" style="display:none" onchange="onUploadFolder(this)" webkitdirectory directory multiple>
            <button type="button" class="btn-copy" onclick="document.getElementById('folders').click()">Upload folder</button>
            <button type="button" class="btn-copy" onclick="pasteClipboardImage()">Paste image from clipboard</button>
            <div>Current folder: <b>${currentPathLabel}</b></div>
            ${currentDir ? `<button type="button" class="btn-copy" onclick="location.href='/?dir=${encodeURIComponent(parentDir)}'">Up</button>` : ''}
            <div>Tip: Nhấn <b>Ctrl+V</b> để dán ảnh trực tiếp vào trang khi đang focus.</div>
            </br>
            <div>Total : ${files.length} item</div>
            <input type='text' placeholder='Search...' id='search' onchange="filter(this.value)" onkeyup="filter(this.value)">
            <table>
            <tr>
                <th></th>
                <th></th>
                <th>Type</th>
                <th>Name</th>
                <th>Size</th>
                <th>Created date</th>
                <th>Delete</th>
            </tr>
            ${files
                .map((item, index) => `<tr>
                                    <td>${index}</td>
                                    <td>${item.isDir ? '-' : `<button class='btn-copy' onclick='copy(${JSON.stringify(item.path)})'>Copy</button>`}</td>
                                    <td>${item.isDir ? 'Folder' : 'File'}</td>
                                    <td>${item.isDir ? `<a href='/?dir=${encodeURIComponent(item.path)}'>${item.name}</a>` : `<a href='/${encodeURI(item.path)}' download='${item.name}'>${item.name}</a>`}</td>
                                    <td>${item.size}</td>
                                    <td>${moment(item.time).format('DD/MM/YYYY HH:mm:ss')}</td>
                                    <td><div onClick='Delete(${JSON.stringify(item.path)})' class='remove'>Xóa</div></td>
                                </tr> 
                    `)
                .join("\n")}
            </table>

            </br>
            <div>Share text, code thì paste xuống dưới này</div>
            <span>Note id </span> <input type='number' value='1' id='notes' min='1' onchange="getNotes(this.value)">
            <button onclick="copyNote()">Copy</button>
            <textarea id='note' onchange='onChangeNote()' onkeyup='onChangeNote()'>${note}</textarea>
            <div id="snackbar">Some text some message..</div>
            <script>
                const CURRENT_DIR = ${JSON.stringify(currentDir)};
                function onUpload(input){
                    let files = (input && input.files) ? input.files : [];
                    uploadFiles(files, false);
                }
                function onUploadFolder(input){
                    let files = (input && input.files) ? input.files : [];
                    uploadFiles(files, true);
                }
                function uploadFiles(files, keepRelativePath) {
                    if (!files || !files.length) return;
                    let label = files.length === 1 ? files[0].name : files.length + ' files selected';
                    document.getElementById("filename").innerText = label;
                    toast('Uploading ' + label + '...');

                    let formData = new FormData();
                    for (let i = 0; i < files.length; i++) {
                        formData.append('filetoupload[]', files[i], files[i].name);
                        if (keepRelativePath) {
                            let relativePath = files[i].webkitRelativePath || files[i].name;
                            formData.append('relativePaths[]', relativePath);
                        }
                    }
                    formData.append('currentDir', CURRENT_DIR);
                    fetch('/upload', {
                        method: 'POST',
                        body: formData
                    })
                    .then(() => location.reload())
                    .catch(err => {
                        console.log('upload error', err);
                        toast('Lỗi upload', 1000);
                    });
                }
                let uploadWrap = document.querySelector('.image-upload-wrap');
                uploadWrap.addEventListener('dragover', function (event) {
                    event.preventDefault();
                });
                uploadWrap.addEventListener('drop', function (event) {
                    event.preventDefault();
                    uploadFiles(event.dataTransfer.files, false);
                });
                document.addEventListener('paste', handlePasteEvent);

                function handlePasteEvent(event) {
                    if (!event.clipboardData) return;
                    let items = Array.from(event.clipboardData.items || []);
                    let imageItem = items.find(item => item.type.startsWith('image/'));
                    if (!imageItem) return;
                    let file = imageItem.getAsFile();
                    if (!file) return;
                    event.preventDefault();
                    uploadFiles([file], false);
                }

                function pasteClipboardImage() {
                    if (navigator.clipboard && navigator.clipboard.read) {
                        navigator.clipboard.read().then(items => {
                            for (let item of items) {
                                let imageType = item.types.find(t => t.startsWith('image/'));
                                if (!imageType) continue;
                                item.getType(imageType).then(imageBlob => {
                                    let file = new File([imageBlob], generateClipboardFilename(imageBlob.type), { type: imageBlob.type });
                                    uploadFiles([file], false);
                                });
                                return;
                            }
                            toast('Không tìm thấy ảnh trong clipboard', 2000);
                        }).catch(err => {
                            console.log('clipboard read error', err);
                            toast('Không thể đọc clipboard', 2000);
                        });
                    } else {
                        toast('Nhấn Ctrl+V để dán ảnh từ clipboard', 2000);
                    }
                }

                function generateClipboardFilename(mimeType) {
                    let ext = 'png';
                    if (mimeType) {
                        const parts = mimeType.split('/');
                        if (parts.length === 2) ext = parts[1];
                    }
                    if (ext === 'jpeg') ext = 'jpg';
                    return 'clipboard_' + Date.now() + '.' + ext;
                }

                var cacheNote = '';
                onChangeNote(true);
                function onChangeNote(noUpdate){
                    console.log('change note')
                    let value = document.getElementById('note').value;
                    let id = document.getElementById('notes').value;
                    if(value == cacheNote) return;
                    cacheNote = value;
                    if(noUpdate) return;
                    clearTimeout(this.timeout);
                    this.timeout = setTimeout(()=>{
                        console.log(value);
                        let myHeaders = new Headers();
                        myHeaders.append("Content-Type", "application/json");

                        let raw = JSON.stringify({data: value});
                        let requestOptions = {
                            method: 'POST',
                            headers: myHeaders,
                            body: raw,
                            redirect: 'follow'
                        };
                        toast("saving...");
                        fetch("/note/" + id, requestOptions)
                        .then(response => response.text())
                        .then(result => {
                            toast("saved", 400);
                            console.log(result);
                        })
                        .catch(error =>{
                            toast("save note error");
                            console.log('error', error)
                        });
                    }, 500);
                }
                function toast(mess, timeout = 99999) {
                    console.log('toast', mess, timeout);
                    let tag = document.getElementById("snackbar");
                    tag.innerHTML = mess + (timeout == 99999 ? " <div class='loader'></div>" : "");
                    tag.className = "show";
                    clearTimeout(this.timeouts);
                    if(timeout < 99999) {
                        this.timeouts = setTimeout(()=>tag.className = tag.className.replace("show", ""), timeout);
                    }
                }
                function Delete(filename){
                    console.log('delete ' + filename);
                    toast('Deleting... ' + filename);
                    fetch('/delete?path=' + encodeURIComponent(filename) + '&dir=' + encodeURIComponent(CURRENT_DIR))
                    .then(x => {
                        toast('Success', 200);
                        setTimeout(()=>location.reload(), 200);
                    })
                    .catch(err => {
                        toast('Error', 200);
                    });
                }

                function copy(text) {
                    text = encodeURI(text);
                    text = 'http://' + location.host + '/' + text;
                    var input = document.createElement('input');
                    input.setAttribute('value', text);
                    document.body.appendChild(input);
                    input.select();
                    var result = document.execCommand('copy');
                    document.body.removeChild(input);
                    toast('Copy ' + text, 1000);
                    return result;
                }

                function copyNote() {
                    let id = document.getElementById('notes').value;
                    let filename = 'note_' + id + '.txt';
                    copy('note/' + filename);
                }
                
                function filter(text) {
                    text = text.toLowerCase();
                    let tr = document.getElementsByTagName('tr');
                    for (let i=1; i<tr.length; i++){
                        let filename = tr[i].cells[3].innerText.toLowerCase();
                        tr[i].hidden =  !filename.includes(text);
                    }
                    toast('Filter ' + text, 1000);
                }

                function getNotes(id) {
                    if (id == '') {
                        id = 1;
                        document.getElementById('notes').value = id;
                    }
                    toast('Get note ' + id + '...');
                    fetch('/getnote/' + id)
                    .then((response) => response.json())
                    .then((response) => response.text)
                    .then(response => {
                        toast('Get note ' + id, 200);
                        document.getElementById('note').value = response;
                        cacheNote = response;
                    })
                    .catch(err => {
                        console.log('errr',err)
                        toast('Error', 200);
                    });
                }
                
            </script>
            `;
        fs.writeFileSync(`${rootPath}/index.html`, html);
    } catch (err) {
        console.log(err);
    }
}

const port = 8082;
app.listen(port, () => {
    console.log(`\nStart server at: ${new Date()}
                HTTP server is listening at: ${"localhost"}:${port}
    `);
});
