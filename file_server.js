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
        if (!fs.existsSync(__dirname + "/public")) {
            fs.mkdirSync(__dirname + "/public");
        }

        if (!fs.existsSync(__dirname + "/public/note.txt")) {
            fs.writeFileSync(__dirname + "/public/note.txt", '');
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
            createIndex(__dirname + "/public", alert);
            // res.redirect('/');
            next();
        }
    }
    catch (err) {
        console.log(err);
        next();
    }

}, express.static(__dirname + "/public"));

app.get("/delete/:file", (req, res) => {
    try {
        let file = req.params.file;
        console.log(`/delete/${file}`);
        fs.unlinkSync(__dirname + `/public/${file}`);
        res.redirect(`/`);
    } catch (err) {
        console.log(err);
        res.redirect(`/?alert=Lỗi delete`);
    }
});
app.post('/upload', (req, res) => {
    try {
        console.log('/upload');
        let maxFileSize = 10 * 1024 * 1024 * 1024; //10GB
        let form = new formidable.IncomingForm({ maxFileSize });
        form.multiples = true;
        form.maxFileSize = maxFileSize;
        form.parse(req, function (err, fields, files) {
            try {
                if (err) {
                    console.log(err)
                    res.redirect(`/?alert=Lỗi upload`);
                    return;
                }
                let filename = files.filetoupload.originalFilename.trim();
                if (filename == '') return res.redirect(`/?alert=Chưa chọn file`);
                let oldpath = files.filetoupload.filepath;
                let newpath = __dirname + '/public/' + filename;
                console.log(`copy file ${oldpath} to ${newpath}`);
                fs.copyFileSync(oldpath, newpath);
                console.log(`delete file ${oldpath}`)
                fs.unlinkSync(oldpath);
                res.redirect(`/`);
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

app.post("/note", (req, res) => {
    try {
        console.log('write note ');
        let text = req.body.data || '';
        console.log(text);
        fs.writeFileSync(__dirname + "/public/note.txt", text);
        res.send(`ok`);
    } catch (err) {
        console.log(err);
        res.send(`Lỗi note`);
    }
});

function getSortedFiles(dir) {
    let files = fs.readdirSync(dir);
    files = files.map(fileName => {
        let f = fs.statSync(`${dir}/${fileName}`);
        return {
            name: fileName,
            time: f.mtime.getTime(),
            size: f.size
        };
    }).sort((a, b) => a.time - b.time);
    for (let file of files) {
        let unit = 'b';
        if (file.size > 1024) {
            file.size = (file.size / 1024).toFixed(1);
            unit = 'Kb';
            if (file.size > 1024) {
                file.size = (file.size / 1024).toFixed(1);
                unit = 'Mb';
                if (file.size > 1024) {
                    file.size = (file.size / 1024).toFixed(1);
                    unit = 'Gb';
                }
            }
        }
        file.size = file.size + ' ' + unit;
    }
    files = files.filter(item => item.name != 'index.html' && item.name != 'note.txt');
    return files;
};

function createIndex(folderPath) {
    try {
        let files = getSortedFiles(folderPath);
        let note = fs.readFileSync(folderPath + '/note.txt').toString();

        let html = `
            <style>
                body {
                    font-family: sans-serif;
                    background-color: #eeeeee;
                    zoom: 1.5;
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
              
                table, td, th {
                    border: 1px solid black;
                    padding: 10px;
                    text-align: left;
                }

                table {
                    border-collapse: collapse;
                    max-width: 100%;
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
                    <input id="files" type="file" name="filetoupload" class="file-upload-input" onchange="onUpload(this.value)" multiplee="multiple">
                    <div class="drag-text">
                        <h3 id='filename'>Drag and drop or select file</h3>
                    </div>
                </div>
            </form>
            </br>
            <div>Total : ${files.length} file</div>
            <table>
            <tr>
                <th></th>
                <th>Name</th>
                <th>Size</th>
                <th>Created date</th>
                <th>Delete</th>
            </tr>
            ${files
                .map((item, index) => `<tr>
                                    <td>${index}</td>
                                    <td><a href='/${item.name}' download='${item.name}'>${item.name}</a></td>
                                    <td>${item.size}</td>
                                    <td>${moment(item.time).format('DD/MM/YYYY HH:mm:ss')}</td>
                                    <td><div onClick="Delete('${item.name}')" class='remove'>Xóa</div></td>
                                </tr> 
                    `)
                .join("\n")}
            </table>

            </br>
            <div>Share text, code thì paste xuống dưới này</div>
            <div><a href='/note.txt' download='note.txt'>Note.txt</a></div>
            <textarea id='note' onchange='onChangeNote()' onkeyup='onChangeNote()'>${note}</textarea>
            <div id="snackbar">Some text some message..</div>
            <script>
                function onUpload(value){
                    console.log(value);
                    value = value.slice(value.lastIndexOf('\\\\') + 1) || 'Drag and drop or select file';
                    document.getElementById("filename").innerText = value;
                    if(value){
                        toast(value);
                        document.getElementById("form-upload").submit();
                    }
                }
                onChangeNote(true);
                function onChangeNote(noUpdate){
                    let value = document.getElementById('note').value;
                    if(value == this.value) return;
                    this.value = value;
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
                        fetch("/note", requestOptions)
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
                    fetch('/delete/' + filename)
                    .then(x => {
                        toast('Success', 200);
                        setTimeout(()=>location.reload(), 200);
                    })
                    .catch(err => {
                        toast('Error', 200);
                    });
                }
            </script>
            `;
        fs.writeFileSync(`${folderPath}/index.html`, html);
    } catch (err) {
        console.log(err);
    }
}

app.listen(8080, () => {
    console.log(`\nStart server at: ${new Date()}
                HTTP server is listening at: ${"localhost"}:${"80"}
    `);
});
