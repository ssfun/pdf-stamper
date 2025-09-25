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
let sealImage = null;
let sealImageElement = null;
let currentActivePage = 1;
let totalPages = 0;
let pageFitScales = []; // **FIX 3: 存储每页的自适应缩放比例**
let globalZoomMultiplier = 1.0; // **FIX 3: 存储用户选择的缩放乘数**

// ---- DOM 元素获取 ----
const appContainer = document.getElementById('app');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const mainContent = document.getElementById('main-content');
const pdfInputElement = document.getElementById('pdfInput');
const sealInputElement = document.getElementById('sealInput');
const dropZone = document.getElementById('drop-zone');
const mainUploadBtn = document.getElementById('upload-pdf-btn-main');
const sealUploadBtn = document.getElementById('upload-seal-btn');
const sealNameElement = document.getElementById('seal-name');
const thumbnailContainer = document.getElementById('thumbnail-container');
const addSealBtn = document.getElementById('addSeal');
const addStraddleBtn = document.getElementById('addStraddle');
const deleteSealBtn = document.getElementById('deleteSeal');
const exportPdfBtn = document.getElementById('exportPDF');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');
const pageIndicator = document.getElementById('page-indicator');
const pageSelector = document.getElementById('page-selector');


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
        // **FIX 3: 侧边栏变化时，重新计算当前页面的自适应布局**
        setTimeout(() => {
            if(pdfDoc) showPage(currentActivePage);
        }, 300); // 等待CSS过渡完成
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
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

    // **FIX 3: 缩放逻辑更新**
    zoomSlider.addEventListener('input', (e) => {
        globalZoomMultiplier = parseFloat(e.target.value);
        zoomValue.textContent = `${Math.round(globalZoomMultiplier * 100)}% (Fit)`;
        const canvas = fabricCanvases[currentActivePage - 1];
        if (canvas) {
            // 只更新 Fabric 内部的缩放，不改变 canvas 元素大小
            const fitScale = pageFitScales[currentActivePage - 1];
            canvas.setZoom(fitScale * globalZoomMultiplier);
            canvas.renderAll();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedObject();
        }
    });
}

// ---- 导航与UI更新函数 ----
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
    dropZone.classList.add('hidden');
    thumbnailContainer.innerHTML = '<p>渲染中...</p>';
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
            dropZone.classList.remove('hidden');
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
        mainCanvasWrapper.style.display = 'none';
        const mainCanvas = document.createElement('canvas');
        mainCanvas.id = `canvas-${i}`;
        mainCanvasWrapper.appendChild(mainCanvas);
        mainContent.appendChild(mainCanvasWrapper); // 直接附加到主内容区
    }
    await showPage(1);
}

// **FIX 3: 重写画布初始化逻辑，实现自适应**
async function initializeFabricCanvasForPage(pageNum) {
    if (fabricCanvases[pageNum - 1]) return fabricCanvases[pageNum - 1];

    const page = await pdfDoc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    // 计算自适应缩放比例
    const containerWidth = mainContent.clientWidth - 40; // 减去padding
    const containerHeight = mainContent.clientHeight - 40;
    const scaleX = containerWidth / unscaledViewport.width;
    const scaleY = containerHeight / unscaledViewport.height;
    const fitScale = Math.min(scaleX, scaleY);
    pageFitScales[pageNum - 1] = fitScale; // 存储自适应比例

    const viewport = page.getViewport({ scale: fitScale });
    
    const canvasEl = document.getElementById(`canvas-${pageNum}`);
    canvasEl.width = viewport.width;
    canvasEl.height = viewport.height;

    const fabricCanvas = new fabric.Canvas(canvasEl);
    await page.render({ 
        canvasContext: fabricCanvas.getContext(), 
        viewport: viewport 
    }).promise;
    
    fabricCanvases[pageNum - 1] = fabricCanvas;
    return fabricCanvas;
}

async function showPage(pageNum) {
    if (!pdfDoc) return;
    currentActivePage = pageNum;
    
    document.querySelectorAll('.main-content > div').forEach(div => {
        if(div.id.startsWith('page-wrapper-')) div.style.display = 'none'
    });
    document.querySelectorAll('.thumbnail-item').forEach(item => item.classList.remove('active'));
    
    const activeThumb = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if (activeThumb) activeThumb.classList.add('active');
    
    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    wrapper.style.display = 'block';

    const canvas = await initializeFabricCanvasForPage(pageNum);
    if (canvas) {
        canvas.setZoom(pageFitScales[pageNum - 1] * globalZoomMultiplier);
        canvas.renderAll();
    }
    
    zoomSlider.value = globalZoomMultiplier;
    zoomValue.textContent = `${Math.round(globalZoomMultiplier * 100)}% (Fit)`;
    updatePageNavigator();
}

function handleSealFile(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        sealImageElement = new Image();
        sealImageElement.src = event.target.result;
        sealImageElement.onload = () => {
            fabric.Image.fromURL(event.target.result, function(img) {
                sealImage = img;
                sealNameElement.textContent = file.name;
                alert('印章已准备好。');
            });
        }
    };
    reader.readAsDataURL(file);
}

function addNormalSeal() {
    if (!sealImage) return alert('请先选择印章图片！');
    if (!pdfDoc) return alert('请先上传PDF文件！');
    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;
    sealImage.clone((cloned) => {
        // 基于未缩放的画布尺寸计算初始大小
        cloned.scaleToWidth(canvas.width / pageFitScales[currentActivePage-1] / 5);
        cloned.set({
            left: canvas.width / 2, top: canvas.height / 2,
            originX: 'center', originY: 'center',
            cornerSize: 10, cornerStyle: 'circle', cornerColor: '#007bff',
            transparentCorners: false, borderColor: '#007bff',
        });
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        canvas.renderAll();
    });
}

async function addStraddleSeal() {
    if (!sealImageElement) return alert('请先选择印章图片！');
    if (!pdfDoc) return alert('请先上传PDF文件！');
    const totalPages = pdfDoc.numPages;
    const pieceWidth = sealImageElement.width / totalPages;
    const groupId = `straddle-${Date.now()}`;
    
    for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1;
        const canvas = await initializeFabricCanvasForPage(pageNum);
        if (!canvas) continue;
        const fitScale = pageFitScales[i];
        const unscaledWidth = canvas.width / fitScale;
        const initialScale = (unscaledWidth / 5) / sealImageElement.width;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = pieceWidth;
        tempCanvas.height = sealImageElement.height;
        tempCanvas.getContext('2d').drawImage(sealImageElement, i * pieceWidth, 0, pieceWidth, sealImageElement.height, 0, 0, pieceWidth, sealImageElement.height);
        
        fabric.Image.fromURL(tempCanvas.toDataURL(), (imgPiece) => {
            imgPiece.scale(initialScale);
            imgPiece.set({
                left: unscaledWidth - (pieceWidth * initialScale),
                top: 400, hasControls: true, borderColor: '#007bff',
                lockMovementX: true, straddleGroup: groupId, pageIndex: i
            });
            canvas.add(imgPiece);
            canvas.renderAll();
            
            const syncObjects = (target) => {
                fabricCanvases.forEach(c => {
                    if (!c) return;
                    c.getObjects().forEach(obj => {
                        if (obj.straddleGroup === groupId && obj !== target) {
                            obj.set({ top: target.top, scaleX: target.scaleX, scaleY: target.scaleY, angle: target.angle }).setCoords();
                        }
                    });
                    c.renderAll();
                });
            };
            imgPiece.on('moving', () => syncObjects(imgPiece));
            imgPiece.on('scaling', () => syncObjects(imgPiece));
            imgPiece.on('rotating', () => syncObjects(imgPiece));
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
            const fitScale = pageFitScales[i];
            const unscaledWidth = canvas.width / fitScale;
            const unscaledHeight = canvas.height / fitScale;
            
            const objects = canvas.getObjects().filter(obj => !obj.isBackgroundImage);
            for (const obj of objects) {
                const multiplier = 2;
                const imgDataUrl = obj.toDataURL({ format: 'png', multiplier });
                const pngImageBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(pngImageBytes);
                
                // 计算在未缩放画布上的位置和尺寸
                const objWidth = obj.getScaledWidth() / fitScale;
                const objHeight = obj.getScaledHeight() / fitScale;
                const objLeft = obj.left / fitScale;
                const objTop = obj.top / fitScale;
                
                const pdfX = (objLeft / unscaledWidth) * pageWidth;
                const pdfY = pageHeight - ((objTop + objHeight) / unscaledHeight) * pageHeight;

                page.drawImage(pngImage, {
                    x: pdfX, y: pdfY,
                    width: (objWidth / unscaledWidth) * pageWidth,
                    height: (objHeight / unscaledHeight) * pageHeight,
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
