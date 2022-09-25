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
app.use(cors({ origin: true, credentials: true }));
//app.use(
//    morgan(
//        ":remote-addr :remote-user :user-agent :method :url HTTP/:http-version :status :res[content-length] - :response-time ms"
//    )
//);
app.use(body_parser.json({ limit: "500mb" }));
app.use(body_parser.urlencoded({ extended: false, limit: "500mb" }));
// app.use('/api/', routes);
app.use("/", function (req, res, next) {
    try{
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
    catch(err){
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
function createIndex(folderPath) {
    try {
        console.log('createIndex ' + folderPath)
        let files = fs.readdirSync(folderPath);
        for (let file of files) {
            if (!file.includes(".") && file != "node_modules") {
                createIndex(`${folderPath}/${file}`);
            }
        }
        let html = `
            <style>
                body {
                    font-family: sans-serif;
                    background-color: #eeeeee;
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
            <div>Total : ${files.filter((item) => item != "index.html").length} file</div>
            <table>
            ${files
                .filter((item) => item != "index.html")
                .map((item) => `<tr>  
                                    <td><a href='./${item}' download='${item}'>${item}</a></td>
                                    <td><a href='/delete/${item}' style='color:red; margin-left: 50px;'>Xóa</a></td>
                                </tr> 
                    `)
                .join("\n")}
            </table>
            
            <script>
                function onUpload(value){
                    value = value.slice(value.lastIndexOf('\\\\') + 1) || 'Drag and drop a file or select';
                    console.log(value);
                    document.getElementById("filename").innerText = value;
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
                HTTP server is listening at: ${"localhost"}:${"8080"}
    `);
});
