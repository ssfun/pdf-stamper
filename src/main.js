import './style.css';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ---- 全局变量 ----
let pdfDoc = null;
let originalPdfBytes = null;
let fabricCanvases = [];
let sealImageElement = null; // 只存储原始、未旋转的印章图片元素
let currentActivePage = 1;
let totalPages = 0;
let pageFitScales = [];
let globalZoomMultiplier = 1.0;
let sealRotation = 0;

// ---- DOM 元素获取 ----
const appContainer = document.getElementById('app');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const mainContent = document.getElementById('main-content');
const pdfInputElement = document.getElementById('pdfInput');
const sealInputElement = document.getElementById('sealInput');
const dropZone = document.getElementById('drop-zone');
const mainUploadBtn = document.getElementById('upload-pdf-btn-main');
const sealUploadBtn = document.getElementById('upload-seal-btn');
const sealPreviewImg = document.getElementById('seal-preview');
const sealPlaceholder = document.getElementById('seal-placeholder');
const thumbnailContainer = document.getElementById('thumbnail-container');
const addSealBtn = document.getElementById('addSeal');
const addStraddleBtn = document.getElementById('addStraddle');
const deleteSealBtn = document.getElementById('deleteSeal');
const exportPdfBtn = document.getElementById('exportPDF');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');
const pageIndicator = document.getElementById('page-indicator');
const pageSelector = document.getElementById('page-selector');
const rotationSlider = document.getElementById('rotation-slider');
const rotationInput = document.getElementById('rotation-input');

// ---- 主程序入口 ----
async function main() {
  await Promise.all([
    loadScript('/lib/pdf.min.js'),
    loadScript('/lib/fabric.min.js'),
    loadScript('/lib/pdf-lib.min.js'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
  initializeEventListeners();
}

// ---- 事件监听初始化 ----
function initializeEventListeners() {
    sidebarToggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-collapsed');
        setTimeout(() => { if(pdfDoc) showPage(currentActivePage, true); }, 300);
    });
    
    mainContent.addEventListener('dragover', (e) => { e.preventDefault(); mainContent.classList.add('dragover'); });
    mainContent.addEventListener('dragleave', () => mainContent.classList.remove('dragover'));
    mainContent.addEventListener('drop', (e) => {
        e.preventDefault();
        mainContent.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') handlePdfFile(files[0]);
    });

    mainUploadBtn.addEventListener('click', () => pdfInputElement.click());
    pdfInputElement.addEventListener('change', (e) => e.target.files.length > 0 && handlePdfFile(e.target.files[0]));
    sealUploadBtn.addEventListener('click', () => sealInputElement.click());
    sealInputElement.addEventListener('change', (e) => e.target.files.length > 0 && handleSealFile(e.target.files[0]));

    addSealBtn.addEventListener('click', addNormalSeal);
    deleteSealBtn.addEventListener('click', deleteSelectedObject);
    addStraddleBtn.addEventListener('click', addStraddleSeal);
    exportPdfBtn.addEventListener('click', exportPDF);
    
    pageSelector.addEventListener('change', (e) => {
        const newPage = parseInt(e.target.value, 10);
        if (newPage !== currentActivePage) showPage(newPage);
    });

    zoomSlider.addEventListener('input', (e) => {
        globalZoomMultiplier = parseFloat(e.target.value);
        applyZoom();
    });

    rotationSlider.addEventListener('input', (e) => {
        const angle = parseInt(e.target.value, 10);
        rotationInput.value = angle;
        sealRotation = angle;
        sealPreviewImg.style.transform = `rotate(${angle}deg)`;
    });
    rotationInput.addEventListener('input', (e) => {
        const angle = parseInt(e.target.value, 10);
        if(!isNaN(angle) && angle >= -180 && angle <= 180) {
            rotationSlider.value = angle;
            sealRotation = angle;
            sealPreviewImg.style.transform = `rotate(${angle}deg)`;
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedObject();
        }
    });
}

// ---- UI 与导航函数 ----
function applyZoom() {
    if (!pdfDoc) return;
    zoomValue.textContent = `${Math.round(globalZoomMultiplier * 100)}% (Fit-Width)`;
    const canvas = fabricCanvases[currentActivePage - 1];
    if (canvas) {
        const fitScale = pageFitScales[currentActivePage - 1];
        const newZoom = fitScale * globalZoomMultiplier;
        canvas.setZoom(newZoom);
        canvas.setDimensions({ 
            width: canvas.originalWidth * newZoom,
            height: canvas.originalHeight * newZoom
        });
        canvas.renderAll();
    }
}

function updatePageNavigator() {
    pageIndicator.textContent = `第 ${currentActivePage} / ${totalPages} 页`;
    pageSelector.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `第 ${i} 页`;
        pageSelector.appendChild(option);
    }
    pageSelector.value = currentActivePage;
}

// ---- 核心功能函数 ----
async function handlePdfFile(file) {
    appContainer.classList.remove('no-pdf-loaded');
    thumbnailContainer.innerHTML = '<p>渲染中...</p>';
    mainContent.innerHTML = '';
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
        originalPdfBytes = new Uint8Array(e.target.result);
        try {
            pdfDoc = await pdfjsLib.getDocument({ data: originalPdfBytes }).promise;
            totalPages = pdfDoc.numPages;
            fabricCanvases = new Array(totalPages).fill(null);
            pageFitScales = new Array(totalPages).fill(null);
            await renderAllPages();
        } catch (error) {
            console.error('加载PDF失败:', error);
            alert('PDF加载失败，请检查文件。');
            appContainer.classList.add('no-pdf-loaded');
        }
    };
    fileReader.readAsArrayBuffer(file);
}

async function renderAllPages() {
    thumbnailContainer.innerHTML = '';
    currentActivePage = 1;
    for (let i = 1; i <= totalPages; i++) {
        const thumbItem = document.createElement('div');
        thumbItem.className = 'thumbnail-item';
        thumbItem.dataset.pageNumber = i;
        const thumbCanvas = document.createElement('canvas');
        thumbItem.appendChild(thumbCanvas);
        const pageNumText = document.createElement('p');
        pageNumText.textContent = `第 ${i} 页`;
        thumbItem.appendChild(pageNumText);
        thumbnailContainer.appendChild(thumbItem);
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        thumbCanvas.height = viewport.height;
        thumbCanvas.width = viewport.width;
        await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport }).promise;
        thumbItem.addEventListener('click', () => showPage(i));
        
        const mainCanvasWrapper = document.createElement('div');
        mainCanvasWrapper.id = `page-wrapper-${i}`;
        mainCanvasWrapper.className = 'canvas-wrapper';
        mainCanvasWrapper.style.display = 'none';
        const mainCanvas = document.createElement('canvas');
        mainCanvas.id = `canvas-${i}`;
        mainCanvasWrapper.appendChild(mainCanvas);
        mainContent.appendChild(mainCanvasWrapper);
    }
    await showPage(1);
}

async function initializeFabricCanvasForPage(pageNum, forceRecalculate = false) {
    if (fabricCanvases[pageNum - 1] && !forceRecalculate) return fabricCanvases[pageNum - 1];

    const page = await pdfDoc.getPage(pageNum);
    const highResViewport = page.getViewport({ scale: 2.0 });
    const originalWidth = highResViewport.width;
    const originalHeight = highResViewport.height;

    const containerWidth = mainContent.clientWidth - 40;
    const fitScale = containerWidth / originalWidth;
    pageFitScales[pageNum - 1] = fitScale;

    const canvasEl = document.getElementById(`canvas-${pageNum}`);
    const fabricCanvas = fabricCanvases[pageNum - 1] || new fabric.Canvas(canvasEl);
    
    if (!fabricCanvases[pageNum - 1]) {
        fabricCanvas.originalWidth = originalWidth;
        fabricCanvas.originalHeight = originalHeight;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = originalWidth;
        tempCanvas.height = originalHeight;
        await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: highResViewport }).promise;
        
        fabricCanvas.setBackgroundImage(new fabric.Image(tempCanvas), fabricCanvas.renderAll.bind(fabricCanvas));
        fabricCanvases[pageNum - 1] = fabricCanvas;
    }
    return fabricCanvas;
}

async function showPage(pageNum, forceRecalculate = false) {
    if (!pdfDoc) return;
    currentActivePage = pageNum;
    
    document.querySelectorAll('.canvas-wrapper').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.thumbnail-item').forEach(item => item.classList.remove('active'));
    
    const activeThumb = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if (activeThumb) activeThumb.classList.add('active');
    
    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    wrapper.style.display = 'block';

    await initializeFabricCanvasForPage(pageNum, forceRecalculate);
    applyZoom();
    updatePageNavigator();
}

function handleSealFile(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const imageUrl = event.target.result;
        sealImageElement = new Image();
        sealImageElement.src = imageUrl;

        sealPreviewImg.src = imageUrl;
        sealPreviewImg.classList.remove('hidden');
        sealPlaceholder.classList.add('hidden');

        sealImageElement.onload = () => {
            alert('印章已准备好。');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * **核心函数：根据您的思路实现**
 * 创建一个预旋转、预裁剪的、标准的矩形印章图片
 * @param {HTMLImageElement} originalImage - 原始印章图
 * @param {number} angle - 旋转角度
 * @returns {Promise<HTMLImageElement>} - 返回一个新的、处理好的图片元素
 */
function getRotatedSealImage(originalImage, angle) {
    return new Promise((resolve) => {
        const offscreenCanvas = document.createElement('canvas');
        const ctx = offscreenCanvas.getContext('2d');

        const rad = angle * Math.PI / 180;
        const sin = Math.abs(Math.sin(rad));
        const cos = Math.abs(Math.cos(rad));
        
        // 计算旋转后完整图像的边界框大小
        const rotatedWidth = originalImage.width * cos + originalImage.height * sin;
        const rotatedHeight = originalImage.width * sin + originalImage.height * cos;

        offscreenCanvas.width = rotatedWidth;
        offscreenCanvas.height = rotatedHeight;

        // 在新画布中心进行旋转
        ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
        ctx.rotate(rad);
        ctx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2);
        
        // 从旋转后的画布中，裁剪出与原始图像尺寸相同的中心区域
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = originalImage.width;
        finalCanvas.height = originalImage.height;
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.drawImage(
            offscreenCanvas,
            (rotatedWidth - originalImage.width) / 2,
            (rotatedHeight - originalImage.height) / 2,
            originalImage.width,
            originalImage.height,
            0, 0,
            originalImage.width,
            originalImage.height
        );
        
        const finalImage = new Image();
        finalImage.src = finalCanvas.toDataURL();
        finalImage.onload = () => resolve(finalImage);
    });
}


async function addNormalSeal() {
    if (!sealImageElement || !pdfDoc) return;
    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;

    // 获取预旋转、预裁剪的印章图
    const finalSealImage = await getRotatedSealImage(sealImageElement, sealRotation);
    
    fabric.Image.fromURL(finalSealImage.src, (fabricImg) => {
        fabricImg.scaleToWidth(canvas.originalWidth / 5);
        fabricImg.set({
            left: canvas.originalWidth / 2, top: canvas.originalHeight / 2,
            originX: 'center', originY: 'center',
            cornerSize: 10, cornerStyle: 'circle', cornerColor: '#007bff',
            transparentCorners: false, borderColor: '#007bff',
            lockRotation: true, // 锁定旋转
        });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
    });
}

async function addStraddleSeal() {
    if (!sealImageElement || !pdfDoc) return;
    const totalPages = pdfDoc.numPages;
    const groupId = `straddle-${Date.now()}`;
    
    // 1. 获取预旋转、预裁剪的完整印章图
    const finalSealImage = await getRotatedSealImage(sealImageElement, sealRotation);
    const pieceWidth = finalSealImage.width / totalPages;
    
    for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1;
        const canvas = await initializeFabricCanvasForPage(pageNum);
        if (!canvas) continue;
        const initialScale = (canvas.originalWidth / 5) / finalSealImage.width;
        
        // 2. 从处理好的完整印章图上切割碎片
        const tempPieceCanvas = document.createElement('canvas');
        tempPieceCanvas.width = pieceWidth;
        tempPieceCanvas.height = finalSealImage.height;
        tempPieceCanvas.getContext('2d').drawImage(
            finalSealImage,
            i * pieceWidth, 0, // 从 finalSealImage 上切割
            pieceWidth, finalSealImage.height,
            0, 0,
            pieceWidth, finalSealImage.height
        );
        
        fabric.Image.fromURL(tempPieceCanvas.toDataURL(), (imgPiece) => {
            imgPiece.scale(initialScale);
            imgPiece.set({
                // 3. 精准定位
                left: canvas.originalWidth - (finalSealImage.width * initialScale),
                top: 400, hasControls: true, borderColor: '#007bff',
                lockMovementX: true, 
                lockRotation: true,
                straddleGroup: groupId, pageIndex: i,
                originX: 'left', originY: 'top', 
            });
            canvas.add(imgPiece);
            canvas.renderAll();
            
            const syncObjects = (target) => {
                fabricCanvases.forEach((c) => {
                    if (!c) return;
                    c.getObjects().filter(obj => obj.straddleGroup === groupId && obj !== target)
                     .forEach(obj => {
                         obj.set({ top: target.top, scaleX: target.scaleX, scaleY: target.scaleY }).setCoords();
                         c.renderAll();
                    });
                });
            };
            imgPiece.on('moving', () => syncObjects(imgPiece));
            imgPiece.on('scaling', () => syncObjects(imgPiece));
        });
    }
}

function deleteSelectedObject() {
    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject && confirm('确定要删除选中的印章吗？')) {
        if (activeObject.straddleGroup) {
            const groupId = activeObject.straddleGroup;
            fabricCanvases.forEach(c => {
                if (!c) return;
                c.getObjects().filter(obj => obj.straddleGroup === groupId).forEach(obj => c.remove(obj));
                c.renderAll();
            });
        } else {
            canvas.remove(activeObject);
            canvas.renderAll();
        }
    }
}

async function exportPDF() {
    if (!originalPdfBytes) return alert('请先上传PDF文件！');
    const exportButton = document.getElementById('exportPDF');
    exportButton.textContent = '导出中...'; exportButton.disabled = true;
    try {
        const { PDFDocument, degrees } = window.PDFLib;
        const pdfDoc = await PDFDocument.load(originalPdfBytes);
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
            const canvas = fabricCanvases[i];
            if (!canvas) continue;
            const page = pages[i];
            const { width: pageWidth, height: pageHeight } = page.getSize();
            
            const objects = canvas.getObjects().filter(obj => !obj.isBackgroundImage);
            for (const obj of objects) {
                const multiplier = 2;
                const imgDataUrl = obj.toDataURL({ format: 'png', multiplier });
                const pngImageBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(pngImageBytes);
                
                const objWidth = obj.getScaledWidth();
                const objHeight = obj.getScaledHeight();
                
                let objLeft = obj.left;
                let objTop = obj.top;

                if (obj.originX === 'center') objLeft -= objWidth / 2;
                if (obj.originY === 'center') objTop -= objHeight / 2;
                
                const pdfX = (objLeft / canvas.originalWidth) * pageWidth;
                const pdfY = pageHeight - ((objTop + objHeight) / canvas.originalHeight) * pageHeight;

                page.drawImage(pngImage, {
                    x: pdfX, y: pdfY,
                    width: (objWidth / canvas.originalWidth) * pageWidth,
                    height: (objHeight / canvas.originalHeight) * pageHeight,
                    // 因为所有对象的角度都是0，所以这里直接使用
                    rotate: degrees(-obj.angle),
                });
            }
        }
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const fileName = pdfInputElement.files[0]?.name.replace('.pdf', '') || 'document';
        link.download = `${fileName}_盖章版.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error('导出PDF时发生错误:', error);
        alert('导出失败，详情请查看控制台。');
    } finally {
        exportButton.textContent = '导出为 PDF';
        exportButton.disabled = false;
    }
}

main();
