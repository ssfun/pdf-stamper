import './style.css';

/**
 * 动态加载外部脚本
 * @param {string} src - 脚本URL
 * @returns {Promise} 加载完成的Promise
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ==================== 全局变量定义 ====================

/** @type {PDFDocumentProxy|null} PDF文档对象 */
let pdfDoc = null;

/** @type {Uint8Array|null} 原始PDF字节数据 */
let originalPdfBytes = null;

/** @type {fabric.Canvas[]} Fabric画布数组，每个页面一个 */
let fabricCanvases = [];

/** @type {Image|null} 印章图片对象 */
let sealImage = null;

/** @type {HTMLImageElement|null} 印章图片元素 */
let sealImageElement = null;

/** @type {number} 当前活动页面编号 */
let currentActivePage = 1;

/** @type {number} PDF总页数 */
let totalPages = 0;

/** @type {number[]} 页面适配缩放比例缓存 */
let pageFitScales = [];

/** @type {number} 全局缩放倍数 */
let globalZoomMultiplier = 1.0;

/** @type {number} 印章旋转角度（度） */
let sealRotation = 0;

// ==================== DOM元素获取 ====================

/** @type {HTMLElement} 主应用容器 */
const appContainer = document.getElementById('app');

/** @type {HTMLButtonElement} 侧边栏切换按钮 */
const sidebarToggleBtn = document.getElementById('sidebar-toggle');

/** @type {HTMLElement} 主内容区域 */
const mainContent = document.getElementById('main-content');

/** @type {HTMLInputElement} PDF文件输入框 */
const pdfInputElement = document.getElementById('pdfInput');

/** @type {HTMLInputElement} 印章文件输入框 */
const sealInputElement = document.getElementById('sealInput');

/** @type {HTMLElement} 拖拽区域 */
const dropZone = document.getElementById('drop-zone');

/** @type {HTMLButtonElement} 主上传PDF按钮 */
const mainUploadBtn = document.getElementById('upload-pdf-btn-main');

/** @type {HTMLButtonElement} 上传印章按钮 */
const sealUploadBtn = document.getElementById('upload-seal-btn');

/** @type {HTMLImageElement} 印章预览图片 */
const sealPreviewImg = document.getElementById('seal-preview');

/** @type {HTMLElement} 印章占位符 */
const sealPlaceholder = document.getElementById('seal-placeholder');

/** @type {HTMLElement} 缩略图容器 */
const thumbnailContainer = document.getElementById('thumbnail-container');

/** @type {HTMLButtonElement} 添加普通章按钮 */
const addSealBtn = document.getElementById('addSeal');

/** @type {HTMLButtonElement} 添加骑缝章按钮 */
const addStraddleBtn = document.getElementById('addStraddle');

/** @type {HTMLButtonElement} 删除选中印章按钮 */
const deleteSealBtn = document.getElementById('deleteSeal');

/** @type {HTMLButtonElement} 导出PDF按钮 */
const exportPdfBtn = document.getElementById('exportPDF');

/** @type {HTMLInputElement} 缩放滑块 */
const zoomSlider = document.getElementById('zoom-slider');

/** @type {HTMLElement} 缩放值显示 */
const zoomValue = document.getElementById('zoom-value');

/** @type {HTMLElement} 页面指示器 */
const pageIndicator = document.getElementById('page-indicator');

/** @type {HTMLSelectElement} 页面选择器 */
const pageSelector = document.getElementById('page-selector');

/** @type {HTMLInputElement} 旋转滑块 */
const rotationSlider = document.getElementById('rotation-slider');

/** @type {HTMLInputElement} 旋转角度输入框 */
const rotationInput = document.getElementById('rotation-input');

/**
 * 主程序入口 - 初始化应用
 */
async function main() {
  // 配置PDF.js工作线程路径
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist/build/pdf.worker.min.js`;

  // 初始化事件监听器
  initializeEventListeners();

  console.log('应用已初始化');
}

/**
 * 初始化所有事件监听器
 */
function initializeEventListeners() {
    // 侧边栏切换事件
    sidebarToggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-collapsed');

        // 重置页面缩放缓存，重新计算布局
        pageFitScales = new Array(totalPages).fill(null);

        // 延迟重绘当前页面，等待CSS动画完成
        setTimeout(() => {
            if(pdfDoc) {
                showPage(currentActivePage, true);
            }
        }, 300);
    });
    
    // 拖拽事件处理
    mainContent.addEventListener('dragover', (e) => {
        e.preventDefault();
        mainContent.classList.add('dragover');
    });
    mainContent.addEventListener('dragleave', () => mainContent.classList.remove('dragover'));
    mainContent.addEventListener('drop', (e) => {
        e.preventDefault();
        mainContent.classList.remove('dragover');
        const files = e.dataTransfer.files;
        // 只处理PDF文件
        if (files.length > 0 && files[0].type === 'application/pdf') handlePdfFile(files[0]);
    });

    // 文件上传按钮事件
    mainUploadBtn.addEventListener('click', () => pdfInputElement.click());
    pdfInputElement.addEventListener('change', (e) => e.target.files.length > 0 && handlePdfFile(e.target.files[0]));
    sealUploadBtn.addEventListener('click', () => sealInputElement.click());
    sealInputElement.addEventListener('change', (e) => e.target.files.length > 0 && handleSealFile(e.target.files[0]));

    // 印章操作按钮事件
    addSealBtn.addEventListener('click', addNormalSeal);
    deleteSealBtn.addEventListener('click', deleteSelectedObject);
    addStraddleBtn.addEventListener('click', addStraddleSeal);
    exportPdfBtn.addEventListener('click', exportPDF);

    // 页面导航事件
    pageSelector.addEventListener('change', (e) => {
        const newPage = parseInt(e.target.value, 10);
        if (newPage !== currentActivePage) showPage(newPage);
    });

    // 缩放控制事件
    zoomSlider.addEventListener('input', (e) => {
        globalZoomMultiplier = parseFloat(e.target.value);
        applyZoom();
    });

    // 旋转控制事件
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

    // 键盘快捷键事件
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedObject();
        }
    });
}

/**
 * 应用缩放设置到当前页面画布
 */
function applyZoom() {
    if (!pdfDoc) return;

    // 更新缩放显示文本
    zoomValue.textContent = `${Math.round(globalZoomMultiplier * 100)}% (Fit-Width)`;

    // 获取当前页面的画布
    const canvas = fabricCanvases[currentActivePage - 1];
    if (canvas) {
        const fitScale = pageFitScales[currentActivePage - 1];
        const newZoom = fitScale * globalZoomMultiplier;

        // 设置画布缩放和尺寸
        canvas.setZoom(newZoom);
        canvas.setDimensions({
            width: canvas.originalWidth * newZoom,
            height: canvas.originalHeight * newZoom
        });

        // 重新渲染画布
        canvas.renderAll();
    }
}

/**
 * 更新页面导航器显示
 */
function updatePageNavigator() {
    // 更新页面指示器文本
    pageIndicator.textContent = `第 ${currentActivePage} / ${totalPages} 页`;

    // 清空并重新生成页面选择器选项
    pageSelector.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `第 ${i} 页`;
        pageSelector.appendChild(option);
    }

    // 设置当前选中页面
    pageSelector.value = currentActivePage;
}

/**
 * 获取旋转后的图片数据URL
 * @param {HTMLImageElement} sourceImage - 源图片
 * @param {number} angle - 旋转角度（度）
 * @returns {string} 旋转后的图片数据URL
 */
function getRotatedCroppedImage(sourceImage, angle) {
    // 创建临时画布用于旋转
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = sourceImage.width;
    const h = sourceImage.height;

    // 计算对角线长度，确保旋转后图片不会被裁剪
    const diagonal = Math.sqrt(w * w + h * h);
    canvas.width = diagonal;
    canvas.height = diagonal;

    // 执行旋转操作
    ctx.translate(diagonal / 2, diagonal / 2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.drawImage(sourceImage, -w / 2, -h / 2);

    // 创建最终画布，裁剪回原始尺寸
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = w;
    finalCanvas.height = h;
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.drawImage(canvas, (diagonal - w) / 2, (diagonal - h) / 2, w, h, 0, 0, w, h);

    return finalCanvas.toDataURL();
}

/**
 * 处理PDF文件上传
 * @param {File} file - PDF文件对象
 */
async function handlePdfFile(file) {
    // 移除无PDF状态类
    appContainer.classList.remove('no-pdf-loaded');

    // 显示加载状态
    thumbnailContainer.innerHTML = '<p>渲染中...</p>';
    mainContent.innerHTML = '';

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
        // 保存原始PDF字节数据
        originalPdfBytes = new Uint8Array(e.target.result);

        try {
            // 加载PDF文档
            pdfDoc = await pdfjsLib.getDocument({ data: originalPdfBytes.slice() }).promise;
            totalPages = pdfDoc.numPages;

            // 初始化画布和缩放缓存数组
            fabricCanvases = new Array(totalPages).fill(null);
            pageFitScales = new Array(totalPages).fill(null);

            // 渲染所有页面
            await renderAllPages();
        } catch (error) {
            console.error('加载PDF失败:', error);
            alert('PDF加载失败，请检查文件。');
            appContainer.classList.add('no-pdf-loaded');
        }
    };

    // 读取文件为ArrayBuffer
    fileReader.readAsArrayBuffer(file);
}

/**
 * 渲染所有PDF页面
 */
async function renderAllPages() {
    // 清空缩略图容器
    thumbnailContainer.innerHTML = '';
    currentActivePage = 1;

    // 为每个页面创建缩略图和主画布
    for (let i = 1; i <= totalPages; i++) {
        // 创建缩略图项
        const thumbItem = document.createElement('div');
        thumbItem.className = 'thumbnail-item';
        thumbItem.dataset.pageNumber = i;

        // 创建缩略图画布
        const thumbCanvas = document.createElement('canvas');
        thumbItem.appendChild(thumbCanvas);

        // 添加页码文本
        const pageNumText = document.createElement('p');
        pageNumText.textContent = `第 ${i} 页`;
        thumbItem.appendChild(pageNumText);

        // 添加到缩略图容器
        thumbnailContainer.appendChild(thumbItem);

        // 获取PDF页面并渲染缩略图
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        thumbCanvas.height = viewport.height;
        thumbCanvas.width = viewport.width;
        await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport }).promise;

        // 添加点击事件切换到对应页面
        thumbItem.addEventListener('click', () => showPage(i));

        // 创建主画布包装器
        const mainCanvasWrapper = document.createElement('div');
        mainCanvasWrapper.id = `page-wrapper-${i}`;
        mainCanvasWrapper.className = 'canvas-wrapper';
        mainCanvasWrapper.style.display = 'none';

        // 创建主画布
        const mainCanvas = document.createElement('canvas');
        mainCanvas.id = `canvas-${i}`;
        mainCanvasWrapper.appendChild(mainCanvas);

        // 添加到主内容区域
        mainContent.appendChild(mainCanvasWrapper);
    }

    // 显示第一页
    await showPage(1);
}

/**
 * 初始化指定页面的Fabric画布
 * @param {number} pageNum - 页面编号
 * @param {boolean} forceRecalculate - 是否强制重新计算缩放比例
 * @returns {Promise<fabric.Canvas>} Fabric画布对象
 */
async function initializeFabricCanvasForPage(pageNum, forceRecalculate = false) {
    // 计算或获取页面适配缩放比例
    if (forceRecalculate || !pageFitScales[pageNum - 1]) {
        const page = await pdfDoc.getPage(pageNum);
        const highResViewport = page.getViewport({ scale: 2.0 });
        const containerWidth = mainContent.clientWidth - 40;
        pageFitScales[pageNum - 1] = (containerWidth * 0.9) / highResViewport.width;
    }

    // 如果画布已存在且不需要强制重算，直接返回
    if (fabricCanvases[pageNum - 1] && !forceRecalculate) return fabricCanvases[pageNum - 1];

    // 获取PDF页面和高分辨率视图
    const page = await pdfDoc.getPage(pageNum);
    const highResViewport = page.getViewport({ scale: 2.0 });
    const originalWidth = highResViewport.width;
    const originalHeight = highResViewport.height;

    // 获取或创建Fabric画布
    const canvasEl = document.getElementById(`canvas-${pageNum}`);
    const fabricCanvas = fabricCanvases[pageNum - 1] || new fabric.Canvas(canvasEl);

    // 如果是新画布，进行初始化
    if (!fabricCanvases[pageNum - 1]) {
        // 保存原始尺寸
        fabricCanvas.originalWidth = originalWidth;
        fabricCanvas.originalHeight = originalHeight;

        // 创建临时画布渲染PDF页面
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = originalWidth;
        tempCanvas.height = originalHeight;
        await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: highResViewport }).promise;

        // 设置背景图片
        fabricCanvas.setBackgroundImage(new fabric.Image(tempCanvas), fabricCanvas.renderAll.bind(fabricCanvas));

        // 保存到缓存
        fabricCanvases[pageNum - 1] = fabricCanvas;
    }

    return fabricCanvas;
}

/**
 * 显示指定页面
 * @param {number} pageNum - 要显示的页面编号
 * @param {boolean} forceRecalculate - 是否强制重新计算布局
 */
async function showPage(pageNum, forceRecalculate = false) {
    if (!pdfDoc) return;

    // 更新当前活动页面
    currentActivePage = pageNum;

    // 隐藏所有页面画布
    document.querySelectorAll('.canvas-wrapper').forEach(div => div.style.display = 'none');

    // 移除所有缩略图的激活状态
    document.querySelectorAll('.thumbnail-item').forEach(item => item.classList.remove('active'));

    // 激活当前页面的缩略图
    const activeThumb = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if (activeThumb) activeThumb.classList.add('active');

    // 显示当前页面的画布
    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    wrapper.style.display = 'block';

    // 初始化Fabric画布
    await initializeFabricCanvasForPage(pageNum, forceRecalculate);

    // 应用缩放设置
    applyZoom();

    // 更新页面导航器
    updatePageNavigator();
}

/**
 * 处理印章文件上传
 * @param {File} file - 印章图片文件
 */
function handleSealFile(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const imageUrl = event.target.result;

        // 创建印章图片对象
        sealImageElement = new Image();
        sealImageElement.src = imageUrl;

        // 更新预览图片
        sealPreviewImg.src = imageUrl;
        sealPreviewImg.classList.remove('hidden');
        sealPlaceholder.classList.add('hidden');

        // 图片加载完成后提示用户
        sealImageElement.onload = () => {
            alert('印章已准备好。');
        }
    };

    // 读取文件为DataURL
    reader.readAsDataURL(file);
}

/**
 * 添加普通印章到当前页面
 */
function addNormalSeal() {
    // 验证印章图片是否有效
    if (!sealImageElement || !sealImageElement.src || sealImageElement.naturalWidth === 0 || !pdfDoc) {
        alert('请先选择一个有效的印章图片！');
        return;
    }

    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;

    // 创建新的图片对象进行处理
    const imageToProcess = new Image();
    imageToProcess.onload = () => {
        // 获取旋转后的印章图片
        const rotatedSealUrl = getRotatedCroppedImage(imageToProcess, sealRotation);

        // 从URL创建Fabric图片对象
        fabric.Image.fromURL(rotatedSealUrl, (img) => {
            // 设置印章大小（页面宽度的1/5）
            img.scaleToWidth(canvas.originalWidth / 5);

            // 配置印章属性
            img.set({
                left: canvas.originalWidth / 2,
                top: canvas.originalHeight / 2,
                originX: 'center',
                originY: 'center',
                cornerSize: 10,
                cornerStyle: 'circle',
                cornerColor: '#007bff',
                transparentCorners: false,
                borderColor: '#007bff',
                lockRotation: true,
                angle: 0
            });

            // 添加到画布并设置为活动对象
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.renderAll();
        });
    };

    imageToProcess.onerror = () => {
        alert('无法处理此印章图片。');
    };

    imageToProcess.src = sealImageElement.src;
}

/**
 * 添加骑缝章到所有页面
 */
async function addStraddleSeal() {
    // 验证印章图片是否有效
    if (!sealImageElement || !sealImageElement.src || sealImageElement.naturalWidth === 0 || !pdfDoc) {
        alert('请先选择一个有效的印章图片！');
        return;
    }

    const imageToProcess = new Image();
    imageToProcess.onload = async () => {
        // 获取旋转后的印章图片
        const rotatedSealUrl = getRotatedCroppedImage(imageToProcess, sealRotation);
        const rotatedSealImage = new Image();
        rotatedSealImage.src = rotatedSealUrl;

        rotatedSealImage.onload = async () => {
            const totalPages = pdfDoc.numPages;
            const pieceWidth = sealImageElement.width / totalPages;
            const groupId = `straddle-${Date.now()}`;

            // 为每个页面创建印章片段
            for (let i = 0; i < totalPages; i++) {
                const pageNum = i + 1;
                const canvas = await initializeFabricCanvasForPage(pageNum);
                if (!canvas) continue;

                // 计算初始缩放比例
                const initialScale = (canvas.originalWidth / 5) / sealImageElement.width;

                // 创建印章片段画布
                const tempPieceCanvas = document.createElement('canvas');
                tempPieceCanvas.width = pieceWidth;
                tempPieceCanvas.height = sealImageElement.height;

                // 绘制印章片段
                tempPieceCanvas.getContext('2d').drawImage(
                    rotatedSealImage,
                    i * pieceWidth, 0, pieceWidth, sealImageElement.height,
                    0, 0, pieceWidth, sealImageElement.height
                );

                // 创建Fabric图片对象
                fabric.Image.fromURL(tempPieceCanvas.toDataURL(), (imgPiece) => {
                    imgPiece.scale(initialScale);
                    const scaledPieceWidth = pieceWidth * initialScale;

                    // 配置印章片段属性
                    imgPiece.set({
                        left: canvas.originalWidth - scaledPieceWidth,
                        top: 400,
                        hasControls: true,
                        borderColor: '#007bff',
                        lockMovementX: true,
                        lockRotation: true,
                        straddleGroup: groupId,
                        pageIndex: i,
                        originX: 'left',
                        originY: 'top',
                        angle: 0
                    });

                    // 添加到画布
                    canvas.add(imgPiece);
                    canvas.renderAll();

                    // 同步骑缝章片段
                    const syncObjects = (target) => {
                        fabricCanvases.forEach((c) => {
                            if (!c) return;
                            c.getObjects()
                                .filter(obj => obj.straddleGroup === groupId && obj !== target)
                                .forEach(obj => {
                                    obj.set({ top: target.top, scaleX: target.scaleX, scaleY: target.scaleY }).setCoords();
                                    c.renderAll();
                                });
                        });
                    };

                    // 监听移动和缩放事件进行同步
                    imgPiece.on('moving', () => syncObjects(imgPiece));
                    imgPiece.on('scaling', () => syncObjects(imgPiece));
                });
            }
        }
    };

    imageToProcess.onerror = () => {
        alert('无法处理此印章图片。');
    };

    imageToProcess.src = sealImageElement.src;
}

/**
 * 删除选中的印章对象
 */
function deleteSelectedObject() {
    const canvas = fabricCanvases[currentActivePage - 1];
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (activeObject && confirm('确定要删除选中的印章吗？')) {
        // 检查是否是骑缝章
        if (activeObject.straddleGroup) {
            const groupId = activeObject.straddleGroup;

            // 删除所有页面中属于同一骑缝章组的对象
            fabricCanvases.forEach(c => {
                if (!c) return;
                c.getObjects()
                    .filter(obj => obj.straddleGroup === groupId)
                    .forEach(obj => c.remove(obj));
                c.renderAll();
            });
        } else {
            // 删除普通印章
            canvas.remove(activeObject);
            canvas.renderAll();
        }
    }
}

/**
 * 导出带有印章的PDF文件
 */
async function exportPDF() {
    if (!originalPdfBytes) return alert('请先上传PDF文件！');

    // 更新按钮状态
    const exportButton = document.getElementById('exportPDF');
    exportButton.textContent = '导出中...';
    exportButton.disabled = true;

    try {
        const { PDFDocument, degrees } = window.PDFLib;

        // 加载原始PDF文档
        const pdfDoc = await PDFDocument.load(originalPdfBytes);
        const pages = pdfDoc.getPages();

        // 为每个页面添加印章
        for (let i = 0; i < pages.length; i++) {
            const canvas = fabricCanvases[i];
            if (!canvas) continue;

            const page = pages[i];
            const { width: pageWidth, height: pageHeight } = page.getSize();

            // 获取所有印章对象（排除背景图片）
            const objects = canvas.getObjects().filter(obj => !obj.isBackgroundImage);

            for (const obj of objects) {
                const multiplier = 2;

                // 将印章对象转换为图片
                const imgDataUrl = obj.toDataURL({ format: 'png', multiplier });
                const pngImageBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(pngImageBytes);

                // 计算印章尺寸和位置
                const objWidth = obj.getScaledWidth();
                const objHeight = obj.getScaledHeight();
                let objLeft = obj.left;
                let objTop = obj.top;

                // 调整坐标原点
                if (obj.originX === 'center') objLeft -= objWidth / 2;
                if (obj.originY === 'center') objTop -= objHeight / 2;

                // 转换为PDF坐标系
                const pdfX = (objLeft / canvas.originalWidth) * pageWidth;
                const pdfY = pageHeight - ((objTop + objHeight) / canvas.originalHeight) * pageHeight;

                // 在PDF页面上绘制印章
                page.drawImage(pngImage, {
                    x: pdfX,
                    y: pdfY,
                    width: (objWidth / canvas.originalWidth) * pageWidth,
                    height: (objHeight / canvas.originalHeight) * pageHeight,
                    rotate: degrees(0),
                });
            }
        }

        // 保存并下载PDF
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);

        // 生成文件名
        const fileName = pdfInputElement.files[0]?.name.replace('.pdf', '') || 'document';
        link.download = `${fileName}_盖章版.pdf`;

        // 触发下载
        link.click();
        URL.revokeObjectURL(link.href);

    } catch (error) {
        console.error('导出PDF时发生错误:', error);
        alert('导出失败，详情请查看控制台。');
    } finally {
        // 恢复按钮状态
        exportButton.textContent = '导出为 PDF';
        exportButton.disabled = false;
    }
}

// 启动应用
main();
