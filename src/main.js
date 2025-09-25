import './style.css';

// 动态加载位于 public 文件夹下的脚本
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // 路径现在从网站根目录开始，Vite会处理好
    script.src = src; 
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ---- 全局变量和状态 ----
let pdfDoc = null;
let originalPdfBytes = null;
let fabricCanvases = []; 
let sealImage = null; 
let sealImageElement = null; 
let currentActivePage = 1;

// ---- DOM 元素获取 ----
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


// ---- 主程序入口 ----
async function main() {
  // *** 路径已更新 ***
  // 加载位于 /lib/ 目录下的库文件
  await Promise.all([
    loadScript('/lib/pdf.min.js'),
    loadScript('/lib/fabric.min.js'),
    loadScript('/lib/pdf-lib.min.js'),
  ]);
    
  // *** 路径已更新 ***
  // 设置PDF.js worker的路径
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';

  // 初始化事件监听
  initializeEventListeners();
  console.log('应用已初始化，所有库加载完毕。');
}

// ---- 事件监听初始化 ----
function initializeEventListeners() {
    // 拖拽区域事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            handlePdfFile(files[0]);
        }
    });
    
    // 点击上传PDF
    mainUploadBtn.addEventListener('click', () => pdfInputElement.click());
    pdfInputElement.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePdfFile(e.target.files[0]);
        }
    });

    // 点击上传印章
    sealUploadBtn.addEventListener('click', () => sealInputElement.click());
    sealInputElement.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSealFile(e.target.files[0]);
        }
    });

    // 功能按钮事件
    addSealBtn.addEventListener('click', addNormalSeal);
    deleteSealBtn.addEventListener('click', deleteSelectedObject);
    addStraddleBtn.addEventListener('click', addStraddleSeal);
    exportPdfBtn.addEventListener('click', exportPDF);

    // 监听键盘删除事件
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault(); // 防止浏览器后退
            deleteSelectedObject();
        }
    });
}

// ---- 功能函数 ----

/**
 * 处理上传的PDF文件
 * @param {File} file 
 */
async function handlePdfFile(file) {
    console.log('开始处理PDF文件:', file.name);
    dropZone.classList.add('hidden');
    thumbnailContainer.innerHTML = '<p style="padding: 20px; text-align: center;">正在渲染页面...</p>';
    canvasContainer.innerHTML = '';

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
        const typedarray = new Uint8Array(e.target.result);
        originalPdfBytes = typedarray; // 保存原始字节
        try {
            pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
            console.log(`PDF加载成功，共 ${pdfDoc.numPages} 页。`);
            await renderAllPages();
        } catch(error) {
            console.error('加载PDF失败:', error);
            alert('无法加载此PDF文件，请检查文件是否损坏。');
            dropZone.classList.remove('hidden');
        }
    };
    fileReader.readAsArrayBuffer(file);
}

/**
 * 渲染所有PDF页面为Canvas，并创建缩略图
 */
async function renderAllPages() {
    thumbnailContainer.innerHTML = '';
    fabricCanvases = [];
    currentActivePage = 1;

    for (let i = 1; i <= pdfDoc.numPages; i++) {
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
    await showPage(1); // 默认显示第一页
}

/**
 * 在主工作区显示指定页码的PDF
 * @param {number} pageNum 
 */
async function showPage(pageNum) {
    if (!pdfDoc) return;
    currentActivePage = pageNum;
    
    document.querySelectorAll('#canvas-container > div').forEach(div => div.style.display = 'none');
    document.querySelectorAll('.thumbnail-item').forEach(item => item.classList.remove('active'));
    
    const activeThumb = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if(activeThumb) activeThumb.classList.add('active');

    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    wrapper.style.display = 'block';

    if (!fabricCanvases[pageNum - 1]) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.getElementById(`canvas-${pageNum}`);
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport }).promise;

        const fabricCanvas = new fabric.Canvas(canvas);
        fabricCanvas.setBackgroundImage(
            new fabric.Image(tempCanvas),
            fabricCanvas.renderAll.bind(fabricCanvas)
        );
        fabricCanvases[pageNum - 1] = fabricCanvas;
    }
}

/**
 * 处理上传的印章文件
 * @param {File} file 
 */
function handleSealFile(file) {
    const reader = new FileReader();
    reader.onload = function (event) {
        sealImageElement = new Image();
        sealImageElement.src = event.target.result;
        sealImageElement.onload = () => {
             fabric.Image.fromURL(event.target.result, function (img) {
                sealImage = img;
                console.log('印章图片加载成功。');
                sealNameElement.textContent = file.name;
                alert('印章已准备好，现在可以点击“添加印章”按钮了。');
            });
        }
    };
    reader.readAsDataURL(file);
}

/**
 * 添加普通印章到当前活动页面
 */
function addNormalSeal() {
    if (!sealImage) {
        alert('请先选择印章图片！');
        return;
    }
    if (fabricCanvases.length === 0) {
        alert('请先上传PDF文件！');
        return;
    }

    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;

    sealImage.clone((cloned) => {
        const scale = canvas.width / 8;
        cloned.scaleToWidth(scale);
        cloned.set({
            left: (canvas.width - cloned.getScaledWidth()) / 2,
            top: (canvas.height - cloned.getScaledHeight()) / 2,
            cornerSize: 10,
            cornerStyle: 'circle',
            cornerColor: '#007bff',
            transparentCorners: false,
            borderColor: '#007bff',
        });
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        canvas.renderAll();
    });
}

/**
 * 添加骑缝章到所有页面
 */
function addStraddleSeal() {
    if (!sealImageElement) {
        alert('请先选择印章图片！');
        return;
    }
    if (fabricCanvases.length === 0) {
        alert('请先上传PDF文件！');
        return;
    }

    const totalPages = pdfDoc.numPages;
    const pieceWidth = sealImageElement.width / totalPages;
    const initialScale = (fabricCanvases[0].width / 8) / sealImageElement.width;

    const groupId = `mainStraddle-${Date.now()}`; // 为这一组骑缝章生成一个唯一的ID

    fabricCanvases.forEach((canvas, index) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = pieceWidth;
        tempCanvas.height = sealImageElement.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(sealImageElement, index * pieceWidth, 0, pieceWidth, sealImageElement.height, 0, 0, pieceWidth, sealImageElement.height);
        
        const pieceDataUrl = tempCanvas.toDataURL();

        fabric.Image.fromURL(pieceDataUrl, (imgPiece) => {
            imgPiece.scale(initialScale);
            imgPiece.set({
                left: canvas.width - (pieceWidth * initialScale),
                top: 200,
                hasControls: false,
                borderColor: '#007bff',
                straddleGroup: groupId,
                pageIndex: index
            });
            canvas.add(imgPiece);
            canvas.renderAll();

            imgPiece.on('moving', function() {
                const currentTop = this.top;
                fabricCanvases.forEach(c => {
                    c.getObjects().forEach(obj => {
                        if (obj.straddleGroup === groupId && obj !== this) {
                            obj.set('top', currentTop).setCoords();
                        }
                    });
                    c.renderAll();
                });
            });
        });
    });
}

/**
 * 删除当前选中的对象（普通章或骑缝章的一部分）
 */
function deleteSelectedObject() {
    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (activeObject) {
        if (activeObject.straddleGroup) {
            const groupId = activeObject.straddleGroup;
            fabricCanvases.forEach(c => {
                const objectsToDelete = c.getObjects().filter(obj => obj.straddleGroup === groupId);
                objectsToDelete.forEach(obj => c.remove(obj));
                c.renderAll();
            });
        } else {
            canvas.remove(activeObject);
            canvas.renderAll();
        }
    } else {
        // 用户可能没有选中任何东西，静默处理即可，无需弹窗
    }
}

/**
 * 导出带有印章的PDF文件
 */
async function exportPDF() {
    if (!originalPdfBytes) {
        alert('请先上传一个PDF文件！');
        return;
    }
    
    const exportButton = document.getElementById('exportPDF');
    const originalText = exportButton.textContent;
    exportButton.textContent = '正在导出...';
    exportButton.disabled = true;

    try {
        const { PDFDocument, degrees } = window.PDFLib;
        const pdfDoc = await PDFDocument.load(originalPdfBytes);
        const pages = pdfDoc.getPages();

        for (let i = 0; i < fabricCanvases.length; i++) {
            const canvas = fabricCanvases[i];
            if (!canvas) continue;
            
            const page = pages[i];
            const { width: pageWidth, height: pageHeight } = page.getSize();
            
            const objects = canvas.getObjects().filter(obj => obj.type === 'image');
            for (const obj of objects) {
                const imgDataUrl = obj.toDataURL({ format: 'png' });
                const pngImageBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(pngImageBytes);

                const objWidth = obj.getScaledWidth();
                const objHeight = obj.getScaledHeight();
                
                const x = obj.left;
                const y = pageHeight - obj.top - objHeight;

                page.drawImage(pngImage, {
                    x: x / canvas.width * pageWidth,
                    y: y / canvas.height * pageHeight,
                    width: objWidth / canvas.width * pageWidth,
                    height: objHeight / canvas.height * pageHeight,
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

    } catch(error) {
        console.error('导出PDF时发生错误:', error);
        alert('导出失败，详情请查看控制台。');
    } finally {
        exportButton.textContent = originalText;
        exportButton.disabled = false;
    }
}


// 启动应用
main();
