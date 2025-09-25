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
let originalCanvasDimensions = []; 
let globalZoom = 1.0; 

// ---- DOM 元素获取 ----
const appContainer = document.getElementById('app');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const pdfInputElement = document.getElementById('pdfInput');
const sealInputElement = document.getElementById('sealInput');
const dropZone = document.getElementById('drop-zone');
const mainUploadBtn = document.getElementById('upload-pdf-btn-main');
const sealUploadBtn = document.getElementById('upload-seal-btn');
const sealNameElement = document.getElementById('seal-name');
const thumbnailContainer = document.getElementById('thumbnail-container');
const canvasContainer = document.getElementById('canvas-container');
const addSealBtn = document.getElementById('addSeal');
const addStraddleBtn = document.getElementById('addStraddle');
const deleteSealBtn = document.getElementById('deleteSeal');
const exportPdfBtn = document.getElementById('exportPDF');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');
// **FIX 4: 新增页码导航DOM**
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
  console.log('应用已初始化，所有库加载完毕。');
}

// ---- 事件监听初始化 ----
function initializeEventListeners() {
    // **FIX 1: 侧边栏开关事件**
    sidebarToggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-collapsed');
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
    
    // **FIX 4: 页码选择器事件**
    pageSelector.addEventListener('change', (e) => {
        const newPage = parseInt(e.target.value, 10);
        if (newPage !== currentActivePage) {
            showPage(newPage);
        }
    });

    zoomSlider.addEventListener('input', (e) => {
        globalZoom = parseFloat(e.target.value);
        zoomValue.textContent = `${Math.round(globalZoom * 100)}%`;
        const canvas = fabricCanvases[currentActivePage - 1];
        if (canvas) {
            const dimensions = originalCanvasDimensions[currentActivePage - 1];
            canvas.setZoom(globalZoom);
            canvas.setWidth(dimensions.width * globalZoom);
            canvas.setHeight(dimensions.height * globalZoom);
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
// **FIX 4: 新增函数，用于更新页码导航**
function updatePageNavigator() {
    pageIndicator.textContent = `第 ${currentActivePage} / ${totalPages} 页`;
    
    // 重新生成下拉选项
    pageSelector.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `第 ${i} 页`;
        pageSelector.appendChild(option);
    }
    // 设置当前选中的项
    pageSelector.value = currentActivePage;
}


// ---- 核心功能函数 ----

async function handlePdfFile(file) {
    dropZone.classList.add('hidden');
    thumbnailContainer.innerHTML = '<p style="padding: 20px; text-align: center;">正在渲染页面...</p>';
    canvasContainer.innerHTML = '';
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
        const typedarray = new Uint8Array(e.target.result);
        originalPdfBytes = typedarray;
        try {
            pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
            totalPages = pdfDoc.numPages; // 更新总页数
            fabricCanvases = new Array(totalPages).fill(null);
            originalCanvasDimensions = new Array(totalPages).fill(null);
            await renderAllPages();
        } catch (error) {
            console.error('加载PDF失败:', error);
            alert('无法加载此PDF文件，请检查文件是否损坏。');
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
        canvasContainer.appendChild(mainCanvasWrapper);
    }
    await showPage(1);
}

async function initializeFabricCanvasForPage(pageNum) {
    if (fabricCanvases[pageNum - 1]) return fabricCanvases[pageNum - 1];
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.getElementById(`canvas-${pageNum}`);
    if (!canvas) {
      console.error(`无法找到 page ${pageNum} 的 canvas 元素`);
      return null;
    }
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    originalCanvasDimensions[pageNum - 1] = { width: viewport.width, height: viewport.height };
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;
    await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport }).promise;
    const fabricCanvas = new fabric.Canvas(canvas);
    fabricCanvas.setBackgroundImage(new fabric.Image(tempCanvas), fabricCanvas.renderAll.bind(fabricCanvas));
    fabricCanvases[pageNum - 1] = fabricCanvas;
    return fabricCanvas;
}

async function showPage(pageNum) {
    if (!pdfDoc) return;
    currentActivePage = pageNum;
    document.querySelectorAll('#canvas-container > div').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.thumbnail-item').forEach(item => item.classList.remove('active'));
    const activeThumb = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if (activeThumb) activeThumb.classList.add('active');
    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    wrapper.style.display = 'block';
    const canvas = await initializeFabricCanvasForPage(pageNum);
    if (canvas) {
        const dimensions = originalCanvasDimensions[pageNum - 1];
        canvas.setZoom(globalZoom);
        canvas.setWidth(dimensions.width * globalZoom);
        canvas.setHeight(dimensions.height * globalZoom);
        canvas.renderAll();
    }
    zoomSlider.value = globalZoom;
    zoomValue.textContent = `${Math.round(globalZoom * 100)}%`;
    // 更新页码导航
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
                alert('印章已准备好，现在可以添加印章了。');
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
        cloned.scaleToWidth(originalCanvasDimensions[currentActivePage - 1].width / 5);
        cloned.set({
            left: originalCanvasDimensions[currentActivePage - 1].width / 2,
            top: originalCanvasDimensions[currentActivePage - 1].height / 2,
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
    const refCanvas = await initializeFabricCanvasForPage(1);
    if (!refCanvas) return;
    const initialScale = (originalCanvasDimensions[0].width / 5) / sealImageElement.width;
    for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1;
        const canvas = await initializeFabricCanvasForPage(pageNum);
        if (!canvas) continue;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = pieceWidth;
        tempCanvas.height = sealImageElement.height;
        tempCanvas.getContext('2d').drawImage(sealImageElement, i * pieceWidth, 0, pieceWidth, sealImageElement.height, 0, 0, pieceWidth, sealImageElement.height);
        (function(currentCanvas, currentIndex) {
            fabric.Image.fromURL(tempCanvas.to-dataurl(), (imgPiece) => {
                const originalDims = originalCanvasDimensions[currentIndex];
                imgPiece.scale(initialScale);
                imgPiece.set({
                    left: originalDims.width - (pieceWidth * initialScale),
                    top: 400,
                    hasControls: true, borderColor: '#007bff',
                    lockMovementX: true, 
                    straddleGroup: groupId,
                    pageIndex: currentIndex
                });
                currentCanvas.add(imgPiece);
                currentCanvas.renderAll();
                const syncObjects = (target) => {
                    fabricCanvases.forEach(c => {
                        if (!c) return;
                        c.getObjects().forEach(obj => {
                            if (obj.straddleGroup === groupId && obj !== target) {
                                obj.set({
                                    top: target.top, scaleX: target.scaleX,
                                    scaleY: target.scaleY, angle: target.angle
                                }).setCoords();
                            }
                        });
                        c.renderAll();
                    });
                };
                imgPiece.on('moving', () => syncObjects(imgPiece));
                imgPiece.on('scaling', () => syncObjects(imgPiece));
                imgPiece.on('rotating', () => syncObjects(imgPiece));
            });
        })(canvas, i);
    }
}

function deleteSelectedObject() {
    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
        if (confirm('确定要删除选中的印章吗？')) {
            if (activeObject.straddleGroup) {
                const groupId = active-object.straddleGroup;
                fabricCanvases.forEach(c => {
                    if (!c) return;
                    const objectsToDelete = c.getObjects().filter(obj => obj.straddleGroup === groupId);
                    objectsToDelete.forEach(obj => c.remove(obj));
                    c.renderAll();
                });
            } else {
                canvas.remove(activeObject);
                canvas.renderAll();
            }
        }
    }
}

async function exportPDF() {
    if (!originalPdfBytes) return alert('请先上传一个PDF文件！');
    const exportButton = document.getElementById('exportPDF');
    const originalText = exportButton.textContent;
    exportButton.textContent = '正在导出...';
    exportButton.disabled = true;
    try {
        const { PDFDocument, degrees } = window.PDFLib;
        const pdfDoc = await PDFDocument.load(originalPdfBytes);
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
            const canvas = fabricCanvases[i];
            if (!canvas) continue; 
            const page = pages[i];
            const { width: pageWidth, height: pageHeight } = page.getSize();
            const originalDims = originalCanvasDimensions[i];
            const objects = canvas.getObjects();
            for (const obj of objects) {
                if (obj.isBackgroundImage) continue;
                const multiplier = 2;
                const imgDataUrl = obj.to-dataurl({ format: 'png', multiplier: multiplier });
                const pngImageBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(pngImageBytes);
                const objWidth = obj.getScaledWidth();
                const objHeight = obj.getScaledHeight();
                const pdfX = (obj.left / originalDims.width) * pageWidth;
                const pdfY = pageHeight - ((obj.top + objHeight) / originalDims.height) * pageHeight;
                page.drawImage(pngImage, {
                    x: pdfX, y: pdfY,
                    width: (objWidth / originalDims.width) * pageWidth,
                    height: (objHeight / originalDims.height) * pageHeight,
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
        exportButton.textContent = originalText;
        exportButton.disabled = false;
    }
}

main();
