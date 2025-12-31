const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const DOWNLOADS_DIR = './downloads';
const OUTPUT_DIR = './docs';
const THUMBS_DIR = './docs/thumbs';
const THUMB_SIZE = 48;

function sanitizeFolderName(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_');
}

async function processImages() {
    console.log('🎁 Preparing for GitHub Pages...\n');
    
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR);
    
    const collections = {};
    const colors = [];
    const folders = fs.readdirSync(DOWNLOADS_DIR);
    let total = 0;
    let processed = 0;
    
    // Count total
    for (const folder of folders) {
        const folderPath = path.join(DOWNLOADS_DIR, folder);
        if (fs.statSync(folderPath).isDirectory()) {
            total += fs.readdirSync(folderPath).filter(f => f.endsWith('.png')).length;
        }
    }
    
    console.log(`Processing ${total} images from ${folders.length} collections...\n`);
    
    for (const folder of folders) {
        const folderPath = path.join(DOWNLOADS_DIR, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        
        const safeFolderName = sanitizeFolderName(folder);
        const collectionThumbDir = path.join(THUMBS_DIR, safeFolderName);
        if (!fs.existsSync(collectionThumbDir)) fs.mkdirSync(collectionThumbDir);
        
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png'));
        collections[safeFolderName] = { name: folder, count: 0 };
        
        for (const file of files) {
            const srcPath = path.join(folderPath, file);
            const id = processed;
            const safeFileName = sanitizeFolderName(file.replace('.png', ''));
            const thumbPath = path.join(collectionThumbDir, `${safeFileName}.png`);
            
            try {
                const img = await loadImage(srcPath);
                
                const canvas = createCanvas(THUMB_SIZE, THUMB_SIZE);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE);
                
                const data = ctx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE).data;
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
                    r = Math.round(r / count);
                    g = Math.round(g / count);
                    b = Math.round(b / count);
                    
                    const buffer = canvas.toBuffer('image/png');
                    fs.writeFileSync(thumbPath, buffer);
                    
                    // [id, r, g, b, collection, filename]
                    colors.push([id, r, g, b, safeFolderName, safeFileName]);
                    collections[safeFolderName].count++;
                    processed++;
                    
                    if (processed % 500 === 0) {
                        console.log(`  ${processed}/${total} (${Math.round(processed/total*100)}%)`);
                    }
                }
            } catch (e) {}
        }
    }
    
    // Save data
    console.log(`\nSaving data for ${colors.length} images in ${Object.keys(collections).length} collections...`);
    
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'colors.json'),
        JSON.stringify(colors)
    );
    
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'collections.json'),
        JSON.stringify(collections)
    );
    
    const thumbsSize = calculateDirSize(THUMBS_DIR);
    
    console.log(`\n✅ Done!`);
    console.log(`   Collections: ${Object.keys(collections).length}`);
    console.log(`   Images: ${colors.length}`);
    console.log(`   Thumbs size: ${(thumbsSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Output: ${OUTPUT_DIR}/`);
}

function calculateDirSize(dir) {
    let size = 0;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
            size += calculateDirSize(itemPath);
        } else {
            size += stat.size;
        }
    }
    return size;
}

processImages().catch(console.error);
