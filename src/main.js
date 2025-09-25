import './style.css';

// 提醒：请确保您的库文件已放置在 /src/lib/ 目录下
// 因为这些库不是标准的ES模块，我们通过动态创建script标签来加载它们
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ---- 全局变量和状态 ----
let pdfDoc = null;
let originalPdfBytes = null; // 存储原始PDF文件的二进制数据，用于导出
let fabricCanvases = []; // 存储每个页面的 Fabric.js canvas 实例
let sealImage = null; // 存储印章图片对象 (Fabric Image)
let sealImageElement = null; // 存储印章图片的HTMLImageElement，用于骑缝章
let currentActivePage = 1; // 当前活动页面

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
  // 动态加载依赖的库文件
  await Promise.all([
    loadScript('./src/lib/pdf.min.js'),
    loadScript('./src/lib/fabric.min.js'),
    // jspdf is not used in the original logic, pdf-lib is used for exporting
    // loadScript('./src/lib/jspdf.umd.min.js'), 
    loadScript('./src/lib/pdf-lib.min.js'),
  ]);

  // 设置PDF.js worker的路径
  // 确保你已经将 pdf.worker.min.js 文件放在了 /public/src/lib/ 目录下
  pdfjsLib.GlobalWorkerOptions.workerSrc = './src/lib/pdf.worker.min.js';

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
        
        // 渲染PDF页面到临时canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport }).promise;

        // 初始化Fabric Canvas并设置PDF页面为背景
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
        const scale = canvas.width / 8; // 调整印章初始大小
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
    const initialScale = (fabricCanvases[0].width / 8) / sealImageElement.width; // 初始缩放比例

    fabricCanvases.forEach((canvas, index) => {
        // 创建一个临时canvas来裁剪图片
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
                hasControls: false, // 骑缝章通常整体移动
                borderColor: '#007bff',
                straddleGroup: `mainStraddle-${Date.now()}`, // 唯一标识一组骑缝章
                pageIndex: index
            });
            canvas.add(imgPiece);
            canvas.renderAll();

            // 同步移动
            imgPiece.on('moving', function() {
                const currentTop = this.top;
                const groupId = this.straddleGroup;
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
        // 如果是骑缝章，则删除所有关联部分
        if (activeObject.straddleGroup) {
            const groupId = activeObject.straddleGroup;
            fabricCanvases.forEach(c => {
                const objectsToDelete = c.getObjects().filter(obj => obj.straddleGroup === groupId);
                objectsToDelete.forEach(obj => c.remove(obj));
                c.renderAll();
            });
        } else { // 否则只删除当前对象
            canvas.remove(activeObject);
            canvas.renderAll();
        }
    } else {
        alert('请先在画布上选中一个印章！');
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
    
    alert('正在导出PDF，请稍候...');

    try {
        const { PDFDocument } = window.PDFLib;
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

                const scaleX = obj.scaleX;
                const scaleY = obj.scaleY;
                const objWidth = obj.width * scaleX;
                const objHeight = obj.height * scaleY;
                
                // 转换坐标系：Fabric左上角为(0,0)，PDF-Lib左下角为(0,0)
                const x = obj.left;
                const y = pageHeight - obj.top - objHeight;

                page.drawImage(pngImage, {
                    x: x / canvas.width * pageWidth,
                    y: y / canvas.height * pageHeight,
                    width: objWidth / canvas.width * pageWidth,
                    height: objHeight / canvas.height * pageHeight,
                    rotate: PDFLib.degrees(-obj.angle), // Fabric顺时针为正, PDF-Lib逆时针为正
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
    }
}


// 启动应用
main();
