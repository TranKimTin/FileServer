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
//app.use(
//    morgan(
//        ":remote-addr :remote-user :user-agent :method :url HTTP/:http-version :status :res[content-length] - :response-time ms"
//    )
//);
app.use(body_parser.json({ limit: "50mb" }));
app.use(body_parser.urlencoded({ extended: false, limit: "50mb" }));
// app.use('/api/', routes);
app.get("/", function (req, res, next) {
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
        let form = new formidable.IncomingForm({ maxFileSize: 10 * 1024 * 1024 * 1024 });
        form.multiples = true;
        form.maxFileSize = 10 * 1024 * 1024 * 1024;
        form.parse(req, function (err, fields, files) {
            try {
                if (err) {
                    console.log(err)
                    res.redirect(`/?alert=Lỗi upload`);
                    return;
                }
                let oldpath = files.filetoupload.filepath;
                let newpath = __dirname + '/public/' + files.filetoupload.originalFilename;
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
        if (!req.body.data) return res.send('Lỗi');
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
                
                .file-upload-content {
                    display: none;
                    text-align: center;
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
                
                .image-title-wrap {
                    padding: 0 15px 15px 15px;
                    color: #222;
                }
                
                .drag-text {
                    text-align: center;
                }
                
                .drag-text h3 {
                    font-weight: 100;
                    text-transform: uppercase;
                    color: #15824B;
                    padding: 60px 0;
                }
                
                .file-upload-image {
                    max-height: 200px;
                    max-width: 200px;
                    margin: auto;
                    padding: 20px;
                }
                
                .remove-image {
                    width: 200px;
                    margin: 0;
                    color: #fff;
                    background: #cd4535;
                    border: none;
                    padding: 10px;
                    border-radius: 4px;
                    border-bottom: 4px solid #b02818;
                    transition: all .2s ease;
                    outline: none;
                    text-transform: uppercase;
                    font-weight: 700;
                }
                
                .remove-image:hover {
                    background: #c13b2a;
                    color: #ffffff;
                    transition: all .2s ease;
                    cursor: pointer;
                }
                
                .remove-image:active {
                    border: 0;
                    transition: all .2s ease;
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
                    height: 50vh;
                }
            </style>
            <form action="upload" method="post" enctype="multipart/form-data">
                <div class="image-upload-wrap">
                    <input id="files" type="file" name="filetoupload" class="file-upload-input" onchange="onUpload(this.value)">
                    <div class="drag-text">
                        <h3 id='filename'>Drag and drop a file or select </h3>
                    </div>
                </div>
                <div class="file-upload-content">
                    <img class="file-upload-image" src="#" alt="your image">
                    <div class="image-title-wrap">
                    <button type="button" onclick="removeUpload()" class="remove-image">Remove <span class="image-title">Uploaded Image</span></button>
                    </div>
                </div>
                <input type="submit" style="margin: 5px;" value="upload">
            </form>
            </br>
            <div>Total : ${files.length} file</div>
            <table>
            <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Created date</th>
                <th>Delete</th>
            </tr>
            ${files
                .map((item) => `<tr>
                                    <td><a href='./${item.name}' download='${item.name}'>${item.name}</a></td>
                                    <td>${item.size}</td>
                                    <td>${moment(item.time).format('DD/MM/YYYY HH:mm:ss')}</td>
                                    <td><a href='/delete/${item.name}' style='color:red; margin-left: 50px;'>Xóa</a></td>
                                </tr> 
                    `)
                .join("\n")}
            </table>

            </br>
            <div><a href='./note.txt' download='note.txt'>Note.txt</a></div>
            <textarea id='note' onchange='onChangeNote(this.value)' onkeydown='onChangeNote(this.value)'>${note}</textarea>
            
            <script>
                function onUpload(value){
                    value = value.slice(value.lastIndexOf('\\\\') + 1) || 'Drag and drop a file or select';
                    console.log(value);
                    document.getElementById("filename").innerText = value;
                }
                function onChangeNote(value){
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
                        fetch("/note", requestOptions)
                        .then(response => response.text())
                        .then(result => console.log(result))
                        .catch(error => console.log('error', error));
                    }, 1000);
                }
            </script>
            `;
        fs.writeFileSync(`${folderPath}/index.html`, html);
    } catch (err) {
        console.log(err);
    }
}

app.listen(80, () => {
    console.log(`\nStart server at: ${new Date()}
                HTTP server is listening at: ${"localhost"}:${"8080"}
    `);
});
