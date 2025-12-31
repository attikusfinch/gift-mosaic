const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const app = express();
const upload = multer({ dest: 'uploads/' });

const DOWNLOADS_DIR = './downloads';
const TILE_SIZE = 20; // Size of each tile in source image analysis
const OUTPUT_TILE_SIZE = 32; // Size of each gift in output

let giftColors = null;

// Pre-calculate all gift colors on startup
async function preloadGiftColors() {
    console.log('Loading gift colors...');
    const colors = [];
    const folders = fs.readdirSync(DOWNLOADS_DIR);
    
    for (const folder of folders) {
        const folderPath = path.join(DOWNLOADS_DIR, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            if (!file.endsWith('.png')) continue;
            
            const imgPath = path.join(folderPath, file);
            try {
                const img = await loadImage(imgPath);
                const canvas = createCanvas(30, 30);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 30, 30);
                
                const data = ctx.getImageData(0, 0, 30, 30).data;
                let r = 0, g = 0, b = 0, count = 0;
                
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] > 128) {
                        r += data[i];
                        g += data[i + 1];
                        b += data[i + 2];
                        count++;
                    }
                }
                
                if (count > 0) {
                    colors.push({
                        path: imgPath,
                        r: Math.round(r / count),
                        g: Math.round(g / count),
                        b: Math.round(b / count)
                    });
                }
            } catch (e) {}
        }
    }
    
    console.log(`Loaded ${colors.length} gift colors`);
    return colors;
}

function findClosestGift(r, g, b, usedRecently = new Set()) {
    let best = null;
    let bestDist = Infinity;
    
    for (const gift of giftColors) {
        // Avoid repeating same gift too often
        if (usedRecently.has(gift.path)) continue;
        
        const dr = gift.r - r;
        const dg = gift.g - g;
        const db = gift.b - b;
        const dist = dr * dr + dg * dg + db * db;
        
        if (dist < bestDist) {
            bestDist = dist;
            best = gift;
        }
    }
    
    return best || giftColors[Math.floor(Math.random() * giftColors.length)];
}

async function generateMosaic(imagePath, tileSize, outputTileSize) {
    const sourceImg = await loadImage(imagePath);
    
    const cols = Math.floor(sourceImg.width / tileSize);
    const rows = Math.floor(sourceImg.height / tileSize);
    
    // Analyze source image
    const analyzeCanvas = createCanvas(sourceImg.width, sourceImg.height);
    const analyzeCtx = analyzeCanvas.getContext('2d');
    analyzeCtx.drawImage(sourceImg, 0, 0);
    
    // Create output canvas
    const outWidth = cols * outputTileSize;
    const outHeight = rows * outputTileSize;
    const outCanvas = createCanvas(outWidth, outHeight);
    const outCtx = outCanvas.getContext('2d');
    
    outCtx.fillStyle = '#0a0a0a';
    outCtx.fillRect(0, 0, outWidth, outHeight);
    
    const usedRecently = new Set();
    const maxRecent = Math.min(50, Math.floor(giftColors.length / 10));
    const recentQueue = [];
    
    console.log(`Generating ${cols}x${rows} mosaic...`);
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Get average color of this tile
            const tileData = analyzeCtx.getImageData(
                col * tileSize, row * tileSize, tileSize, tileSize
            ).data;
            
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < tileData.length; i += 4) {
                r += tileData[i];
                g += tileData[i + 1];
                b += tileData[i + 2];
                count++;
            }
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            
            // Find closest gift
            const gift = findClosestGift(r, g, b, usedRecently);
            
            // Track recently used
            recentQueue.push(gift.path);
            usedRecently.add(gift.path);
            if (recentQueue.length > maxRecent) {
                usedRecently.delete(recentQueue.shift());
            }
            
            // Draw gift
            try {
                const giftImg = await loadImage(gift.path);
                outCtx.drawImage(giftImg, col * outputTileSize, row * outputTileSize, outputTileSize, outputTileSize);
            } catch (e) {}
        }
        
        if (row % 10 === 0) {
            console.log(`  Row ${row}/${rows}`);
        }
    }
    
    return outCanvas.toBuffer('image/png');
}

// Serve static HTML
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Gift Mosaic Generator</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            color: #fff;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #f093fb, #f5576c);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 30px;
        }
        .upload-area {
            border: 3px dashed #444;
            border-radius: 20px;
            padding: 60px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            background: rgba(255,255,255,0.02);
        }
        .upload-area:hover {
            border-color: #f5576c;
            background: rgba(245, 87, 108, 0.05);
        }
        .upload-area.dragover {
            border-color: #f093fb;
            background: rgba(240, 147, 251, 0.1);
        }
        .upload-icon { font-size: 4em; margin-bottom: 20px; }
        #fileInput { display: none; }
        .controls {
            display: flex;
            gap: 20px;
            margin: 30px 0;
            flex-wrap: wrap;
            justify-content: center;
        }
        .control-group {
            background: rgba(255,255,255,0.05);
            padding: 15px 25px;
            border-radius: 12px;
        }
        label { display: block; margin-bottom: 8px; color: #aaa; font-size: 0.9em; }
        input[type="range"] { width: 150px; }
        .value { color: #f5576c; font-weight: bold; }
        button {
            background: linear-gradient(90deg, #f093fb, #f5576c);
            border: none;
            padding: 15px 50px;
            font-size: 1.2em;
            border-radius: 30px;
            cursor: pointer;
            color: #fff;
            font-weight: bold;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 30px rgba(245, 87, 108, 0.3);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        .preview-container {
            display: flex;
            gap: 30px;
            margin-top: 30px;
            flex-wrap: wrap;
            justify-content: center;
        }
        .preview-box {
            background: rgba(0,0,0,0.3);
            border-radius: 15px;
            padding: 15px;
            text-align: center;
        }
        .preview-box h3 { margin: 0 0 15px 0; color: #888; }
        .preview-box img {
            max-width: 500px;
            max-height: 500px;
            border-radius: 10px;
        }
        .loading {
            display: none;
            text-align: center;
            padding: 40px;
        }
        .spinner {
            width: 60px;
            height: 60px;
            border: 4px solid #333;
            border-top-color: #f5576c;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .download-btn {
            display: none;
            margin-top: 20px;
        }
        .stats {
            color: #666;
            font-size: 0.9em;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎁 Gift Mosaic Generator</h1>
        <p class="subtitle">Transform your photos into beautiful mosaics made of Telegram gifts</p>
        
        <div class="upload-area" id="uploadArea">
            <div class="upload-icon">📷</div>
            <p>Drop an image here or click to upload</p>
            <input type="file" id="fileInput" accept="image/*">
        </div>
        
        <div class="controls">
            <div class="control-group">
                <label>Tile Size: <span class="value" id="tileSizeVal">20</span>px</label>
                <input type="range" id="tileSize" min="10" max="50" value="20">
            </div>
            <div class="control-group">
                <label>Output Tile: <span class="value" id="outputTileVal">32</span>px</label>
                <input type="range" id="outputTile" min="16" max="64" value="32">
            </div>
            <div class="control-group" style="display: flex; align-items: flex-end;">
                <button id="generateBtn" disabled>Generate Mosaic</button>
            </div>
        </div>
        
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Generating your mosaic... This may take a minute</p>
        </div>
        
        <div class="preview-container">
            <div class="preview-box" id="sourceBox" style="display:none">
                <h3>Original</h3>
                <img id="sourcePreview">
            </div>
            <div class="preview-box" id="resultBox" style="display:none">
                <h3>Mosaic</h3>
                <img id="resultPreview">
                <div class="stats" id="stats"></div>
                <a id="downloadLink" class="download-btn" download="gift_mosaic.png">
                    <button type="button">Download Mosaic</button>
                </a>
            </div>
        </div>
    </div>
    
    <script>
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const generateBtn = document.getElementById('generateBtn');
        const tileSize = document.getElementById('tileSize');
        const outputTile = document.getElementById('outputTile');
        const loading = document.getElementById('loading');
        
        let selectedFile = null;
        
        uploadArea.onclick = () => fileInput.click();
        
        uploadArea.ondragover = (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        };
        
        uploadArea.ondragleave = () => uploadArea.classList.remove('dragover');
        
        uploadArea.ondrop = (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
            }
        };
        
        fileInput.onchange = () => {
            if (fileInput.files[0]) handleFile(fileInput.files[0]);
        };
        
        function handleFile(file) {
            selectedFile = file;
            generateBtn.disabled = false;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('sourcePreview').src = e.target.result;
                document.getElementById('sourceBox').style.display = 'block';
            };
            reader.readAsDataURL(file);
            
            uploadArea.innerHTML = '<div class="upload-icon">✅</div><p>' + file.name + '</p>';
        }
        
        tileSize.oninput = () => document.getElementById('tileSizeVal').textContent = tileSize.value;
        outputTile.oninput = () => document.getElementById('outputTileVal').textContent = outputTile.value;
        
        generateBtn.onclick = async () => {
            if (!selectedFile) return;
            
            generateBtn.disabled = true;
            loading.style.display = 'block';
            document.getElementById('resultBox').style.display = 'none';
            
            const formData = new FormData();
            formData.append('image', selectedFile);
            formData.append('tileSize', tileSize.value);
            formData.append('outputTile', outputTile.value);
            
            try {
                const response = await fetch('/generate', {
                    method: 'POST',
                    body: formData
                });
                
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                
                document.getElementById('resultPreview').src = url;
                document.getElementById('downloadLink').href = url;
                document.getElementById('downloadLink').style.display = 'inline-block';
                document.getElementById('resultBox').style.display = 'block';
                
                const img = new Image();
                img.onload = () => {
                    document.getElementById('stats').textContent = img.width + ' × ' + img.height + ' pixels';
                };
                img.src = url;
                
            } catch (err) {
                alert('Error generating mosaic: ' + err.message);
            }
            
            loading.style.display = 'none';
            generateBtn.disabled = false;
        };
    </script>
</body>
</html>`);
});

app.post('/generate', upload.single('image'), async (req, res) => {
    try {
        const tileSize = parseInt(req.body.tileSize) || TILE_SIZE;
        const outputTileSize = parseInt(req.body.outputTile) || OUTPUT_TILE_SIZE;
        
        console.log(`\nGenerating mosaic: tile=${tileSize}, output=${outputTileSize}`);
        
        const buffer = await generateMosaic(req.file.path, tileSize, outputTileSize);
        
        // Cleanup uploaded file
        fs.unlinkSync(req.file.path);
        
        res.set('Content-Type', 'image/png');
        res.send(buffer);
        
        console.log('Mosaic sent successfully');
    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Error generating mosaic');
    }
});

async function start() {
    giftColors = await preloadGiftColors();
    
    // Create uploads dir
    if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
    
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`\n🎁 Gift Mosaic Generator running at http://localhost:${PORT}\n`);
    });
}

start();
