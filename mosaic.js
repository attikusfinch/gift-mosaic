const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const DOWNLOADS_DIR = './downloads';
const OUTPUT_FILE = './gradient_mosaic.png';
const THUMB_SIZE = 64;
const IMAGES_PER_ROW = 80;

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

async function getDominantColor(imagePath) {
    try {
        const img = await loadImage(imagePath);
        const canvas = createCanvas(50, 50);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 50, 50);
        
        const imageData = ctx.getImageData(0, 0, 50, 50);
        const data = imageData.data;
        
        let r = 0, g = 0, b = 0, count = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha > 128) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }
        }
        
        if (count === 0) return null;
        
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        
        const hsl = rgbToHsl(r, g, b);
        
        return { r, g, b, ...hsl, path: imagePath };
    } catch (err) {
        return null;
    }
}

function getAllImages(dir) {
    const images = [];
    const folders = fs.readdirSync(dir);
    
    for (const folder of folders) {
        const folderPath = path.join(dir, folder);
        if (fs.statSync(folderPath).isDirectory()) {
            const files = fs.readdirSync(folderPath);
            for (const file of files) {
                if (file.endsWith('.png')) {
                    images.push(path.join(folderPath, file));
                }
            }
        }
    }
    return images;
}

async function main() {
    console.log('Scanning images...');
    const imagePaths = getAllImages(DOWNLOADS_DIR);
    console.log(`Found ${imagePaths.length} images\n`);
    
    console.log('Extracting dominant colors...');
    const colorData = [];
    let processed = 0;
    
    for (const imgPath of imagePaths) {
        const color = await getDominantColor(imgPath);
        if (color) {
            colorData.push(color);
        }
        processed++;
        if (processed % 500 === 0) {
            console.log(`  Processed ${processed}/${imagePaths.length}`);
        }
    }
    
    console.log(`\nExtracted colors from ${colorData.length} images`);
    
    // Sort by hue for rainbow gradient, then by lightness
    console.log('Sorting by color gradient...');
    colorData.sort((a, b) => {
        // Primary sort: hue (0-360)
        const hueDiff = a.h - b.h;
        if (Math.abs(hueDiff) > 10) return hueDiff;
        // Secondary: saturation
        const satDiff = b.s - a.s;
        if (Math.abs(satDiff) > 10) return satDiff;
        // Tertiary: lightness
        return a.l - b.l;
    });
    
    // Calculate mosaic dimensions
    const cols = IMAGES_PER_ROW;
    const rows = Math.ceil(colorData.length / cols);
    const width = cols * THUMB_SIZE;
    const height = rows * THUMB_SIZE;
    
    console.log(`\nCreating mosaic: ${width}x${height} (${cols}x${rows} grid)`);
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill background with dark color
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw each image
    let drawn = 0;
    for (let i = 0; i < colorData.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * THUMB_SIZE;
        const y = row * THUMB_SIZE;
        
        try {
            const img = await loadImage(colorData[i].path);
            ctx.drawImage(img, x, y, THUMB_SIZE, THUMB_SIZE);
            drawn++;
            
            if (drawn % 500 === 0) {
                console.log(`  Drawing ${drawn}/${colorData.length}`);
            }
        } catch (err) {
            // Skip failed images
        }
    }
    
    console.log('\nSaving mosaic...');
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(OUTPUT_FILE, buffer);
    
    console.log(`\n✅ Done! Saved to ${OUTPUT_FILE}`);
    console.log(`   Size: ${width}x${height} pixels`);
    console.log(`   Images: ${drawn}`);
}

main().catch(console.error);
