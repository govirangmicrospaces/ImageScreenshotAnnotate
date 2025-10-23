/**
 * Screenshot and Annotation Utility (Refactored)
 * Production-ready with fixed blur undo and UI/UX guidelines compliance
 */

// Application state with enhanced blur tracking
const state = {
    currentTool: 'arrow',
    currentColor: '#FF4D4F',
    strokeWidth: 3,
    isDrawing: false,
    startX: 0,
    startY: 0,
    annotations: [],
    baseImage: null,
    canvas: null,
    ctx: null,
    isSelectingArea: false,
    areaSelectionCanvas: null,
    areaSelectionCtx: null,
    capturedStream: null,
    tempTextX: 0,
    tempTextY: 0,
    theme: 'light'
};

// DOM Elements
const elements = {
    captureSection: document.getElementById('capture-section'),
    editorSection: document.getElementById('editor-section'),
    notification: document.getElementById('notification'),
    captureScreenBtn: document.getElementById('capture-screen-btn'),
    captureAreaBtn: document.getElementById('capture-area-btn'),
    imageUpload: document.getElementById('image-upload'),
    canvas: document.getElementById('editor-canvas'),
    colorPicker: document.getElementById('color-picker'),
    strokeWidth: document.getElementById('stroke-width'),
    undoBtn: document.getElementById('undo-btn'),
    clearBtn: document.getElementById('clear-btn'),
    downloadBtn: document.getElementById('download-btn'),
    shareBtn: document.getElementById('share-btn'),
    backToCapture: document.getElementById('back-to-capture'),
    toolBtns: document.querySelectorAll('.tool-btn[data-tool]'),
    areaOverlay: document.getElementById('area-selection-overlay'),
    areaCanvas: document.getElementById('area-selection-canvas'),
    cancelAreaSelection: document.getElementById('cancel-area-selection'),
    confirmModal: document.getElementById('confirm-modal'),
    modalCancel: document.getElementById('modal-cancel'),
    modalConfirm: document.getElementById('modal-confirm'),
    modalMessage: document.getElementById('modal-message'),
    textModal: document.getElementById('text-modal'),
    textModalInput: document.getElementById('text-modal-input'),
    textModalCancel: document.getElementById('text-modal-cancel'),
    textModalOk: document.getElementById('text-modal-ok'),
    guideModal: document.getElementById('guide-modal'),
    guideBtn: document.getElementById('guide-btn'),
    guideClose: document.getElementById('guide-close'),
    themeBtn: document.getElementById('theme-btn'),
    themeIcon: document.getElementById('theme-icon'),
    progressIndicator: document.getElementById('progress-indicator'),
    progressMessage: document.querySelector('.progress-message')
};

/**
 * Sanitize user input to prevent XSS
 */
function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

/**
 * Get accurate mouse position on canvas
 */
function getCanvasMousePosition(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

/**
 * Initialize application
 */
function init() {
    state.canvas = elements.canvas;
    state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
    state.areaSelectionCanvas = elements.areaCanvas;
    state.areaSelectionCtx = state.areaSelectionCanvas.getContext('2d');
    
    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        state.theme = 'dark';
        elements.themeIcon.textContent = '☀️';
    }
    
    attachEventListeners();
    checkBrowserSupport();
    
    // Show guide for first-time users
    if (!localStorage.getItem('guide-seen')) {
        setTimeout(() => showGuideModal(), 500);
        localStorage.setItem('guide-seen', 'true');
    }
}

/**
 * Attach all event listeners
 */
function attachEventListeners() {
    // Capture
    elements.captureScreenBtn.addEventListener('click', captureScreen);
    elements.captureAreaBtn.addEventListener('click', captureAreaStart);
    elements.imageUpload.addEventListener('change', handleImageUpload);
    
    // Tools
    elements.toolBtns.forEach(btn => {
        btn.addEventListener('click', () => selectTool(btn.dataset.tool));
    });
    
    // Style
    elements.colorPicker.addEventListener('input', (e) => {
        state.currentColor = e.target.value;
    });
    
    elements.strokeWidth.addEventListener('input', (e) => {
        state.strokeWidth = parseInt(e.target.value);
    });
    
    // Canvas
    elements.canvas.addEventListener('mousedown', startDrawing);
    elements.canvas.addEventListener('mousemove', draw);
    elements.canvas.addEventListener('mouseup', stopDrawing);
    elements.canvas.addEventListener('mouseleave', stopDrawing);
    elements.canvas.addEventListener('touchstart', handleTouchStart);
    elements.canvas.addEventListener('touchmove', handleTouchMove);
    elements.canvas.addEventListener('touchend', stopDrawing);
    
    // Actions
    elements.undoBtn.addEventListener('click', undo);
    elements.clearBtn.addEventListener('click', () => showConfirmModal('Clear all annotations?', clearAnnotations));
    elements.downloadBtn.addEventListener('click', downloadImage);
    elements.shareBtn.addEventListener('click', shareImage);
    elements.backToCapture.addEventListener('click', () => {
        if (state.annotations.length > 0) {
            showConfirmModal('Discard current annotations?', backToCapture);
        } else {
            backToCapture();
        }
    });
    
    // Area selection
    elements.cancelAreaSelection.addEventListener('click', cancelAreaSelection);
    elements.areaCanvas.addEventListener('mousedown', startAreaDrag);
    elements.areaCanvas.addEventListener('mousemove', drawAreaSelection);
    elements.areaCanvas.addEventListener('mouseup', finishAreaSelection);
    
    // Modals
    elements.modalCancel.addEventListener('click', hideConfirmModal);
    elements.textModalCancel.addEventListener('click', hideTextModal);
    elements.textModalOk.addEventListener('click', submitTextModal);
    elements.textModalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitTextModal();
    });
    
    // User guide
    elements.guideBtn.addEventListener('click', showGuideModal);
    elements.guideClose.addEventListener('click', hideGuideModal);
    
    // Theme
    elements.themeBtn.addEventListener('click', toggleTheme);
    
    // Close modal on overlay click
    document.querySelectorAll('.modal__overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideAllModals();
            }
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideAllModals();
            cancelAreaSelection();
        }
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
        }
    });
}

/**
 * Check browser support
 */
function checkBrowserSupport() {
    const features = {
        mediaDevices: !!navigator.mediaDevices?.getDisplayMedia,
        canvas: !!document.createElement('canvas').getContext,
        fileReader: !!window.FileReader
    };
    
    if (!features.mediaDevices) {
        showNotification('⚠️ Screen capture not supported in this browser', 'error');
    }
}

/**
 * Capture entire screen
 */
async function captureScreen() {
    showProgress('Capturing screen...');
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        
        video.onloadedmetadata = () => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            tempCtx.drawImage(video, 0, 0);
            
            stream.getTracks().forEach(track => track.stop());
            
            const dataURL = tempCanvas.toDataURL('image/png');
            loadImageToEditor(dataURL);
            hideProgress();
            showNotification('✅ Screen captured successfully', 'success');
        };
    } catch (error) {
        hideProgress();
        console.error('Screen capture error:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('❌ Screen capture permission denied', 'error');
        } else {
            showNotification('❌ Screen capture cancelled or failed', 'error');
        }
    }
}

/**
 * Start area capture
 */
async function captureAreaStart() {
    showProgress('Capturing screen for area selection...');
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        
        video.onloadedmetadata = () => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            tempCtx.drawImage(video, 0, 0);
            
            stream.getTracks().forEach(track => track.stop());
            
            state.capturedScreenImage = tempCanvas.toDataURL('image/png');
            hideProgress();
            showAreaSelectionOverlay();
        };
    } catch (error) {
        hideProgress();
        console.error('Area capture error:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('❌ Screen capture permission denied', 'error');
        } else {
            showNotification('❌ Screen capture cancelled', 'error');
        }
    }
}

/**
 * Show area selection overlay
 */
function showAreaSelectionOverlay() {
    state.isSelectingArea = true;
    state.areaSelectionCanvas.width = window.innerWidth;
    state.areaSelectionCanvas.height = window.innerHeight;
    
    const img = new Image();
    img.onload = () => {
        const scale = Math.min(
            state.areaSelectionCanvas.width / img.width,
            state.areaSelectionCanvas.height / img.height
        );
        
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (state.areaSelectionCanvas.width - scaledWidth) / 2;
        const offsetY = (state.areaSelectionCanvas.height - scaledHeight) / 2;
        
        state.areaSelectionCtx.fillStyle = '#000000';
        state.areaSelectionCtx.fillRect(0, 0, state.areaSelectionCanvas.width, state.areaSelectionCanvas.height);
        state.areaSelectionCtx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
        
        state.areaImageScale = scale;
        state.areaImageOffset = { x: offsetX, y: offsetY };
        state.capturedScreenImageObj = img;
    };
    
    img.src = state.capturedScreenImage;
    elements.areaOverlay.classList.remove('area-overlay--hidden');
    showNotification('✂️ Click and drag to select an area', 'info');
}

/**
 * Cancel area selection
 */
function cancelAreaSelection() {
    state.isSelectingArea = false;
    state.isDrawing = false;
    elements.areaOverlay.classList.add('area-overlay--hidden');
    state.areaSelectionCtx.clearRect(0, 0, state.areaSelectionCanvas.width, state.areaSelectionCanvas.height);
    state.capturedScreenImage = null;
    state.capturedScreenImageObj = null;
}

/**
 * Start area drag
 */
function startAreaDrag(event) {
    if (!state.isSelectingArea) return;
    state.isDrawing = true;
    const pos = getCanvasMousePosition(state.areaSelectionCanvas, event);
    state.startX = pos.x;
    state.startY = pos.y;
}

/**
 * Draw area selection
 */
function drawAreaSelection(event) {
    if (!state.isDrawing || !state.isSelectingArea) return;
    
    const pos = getCanvasMousePosition(state.areaSelectionCanvas, event);
    const currentX = pos.x;
    const currentY = pos.y;
    
    state.areaSelectionCtx.clearRect(0, 0, state.areaSelectionCanvas.width, state.areaSelectionCanvas.height);
    state.areaSelectionCtx.fillStyle = '#000000';
    state.areaSelectionCtx.fillRect(0, 0, state.areaSelectionCanvas.width, state.areaSelectionCanvas.height);
    
    if (state.capturedScreenImageObj) {
        const scaledWidth = state.capturedScreenImageObj.width * state.areaImageScale;
        const scaledHeight = state.capturedScreenImageObj.height * state.areaImageScale;
        state.areaSelectionCtx.drawImage(
            state.capturedScreenImageObj,
            state.areaImageOffset.x,
            state.areaImageOffset.y,
            scaledWidth,
            scaledHeight
        );
    }
    
    const width = currentX - state.startX;
    const height = currentY - state.startY;
    
    state.areaSelectionCtx.strokeStyle = '#4A90E2';
    state.areaSelectionCtx.lineWidth = 3;
    state.areaSelectionCtx.setLineDash([8, 4]);
    state.areaSelectionCtx.strokeRect(state.startX, state.startY, width, height);
    state.areaSelectionCtx.fillStyle = 'rgba(74, 144, 226, 0.15)';
    state.areaSelectionCtx.fillRect(state.startX, state.startY, width, height);
    state.areaSelectionCtx.setLineDash([]);
}

/**
 * Finish area selection
 */
function finishAreaSelection(event) {
    if (!state.isDrawing || !state.isSelectingArea) return;
    
    const pos = getCanvasMousePosition(state.areaSelectionCanvas, event);
    const endX = pos.x;
    const endY = pos.y;
    
    const selectionX = Math.min(state.startX, endX);
    const selectionY = Math.min(state.startY, endY);
    const selectionWidth = Math.abs(endX - state.startX);
    const selectionHeight = Math.abs(endY - state.startY);
    
    if (selectionWidth < 10 || selectionHeight < 10) {
        showNotification('⚠️ Selected area too small', 'error');
        cancelAreaSelection();
        return;
    }
    
    try {
        const cropX = (selectionX - state.areaImageOffset.x) / state.areaImageScale;
        const cropY = (selectionY - state.areaImageOffset.y) / state.areaImageScale;
        const cropWidth = selectionWidth / state.areaImageScale;
        const cropHeight = selectionHeight / state.areaImageScale;
        
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
        
        cropCtx.drawImage(
            state.capturedScreenImageObj,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, cropWidth, cropHeight
        );
        
        const dataURL = cropCanvas.toDataURL('image/png');
        loadImageToEditor(dataURL);
        showNotification('✅ Area captured successfully', 'success');
        cancelAreaSelection();
    } catch (error) {
        console.error('Area crop error:', error);
        showNotification('❌ Failed to crop selected area', 'error');
        cancelAreaSelection();
    }
    
    state.isDrawing = false;
}

/**
 * Handle image upload
 */
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showNotification('⚠️ Please select a valid image file', 'error');
        return;
    }
    
    showProgress('Loading image...');
    const reader = new FileReader();
    
    reader.onload = (e) => {
        loadImageToEditor(e.target.result);
        hideProgress();
        showNotification('✅ Image imported successfully', 'success');
    };
    
    reader.onerror = () => {
        hideProgress();
        showNotification('❌ Failed to read image file', 'error');
    };
    
    reader.readAsDataURL(file);
}

/**
 * Load image to editor
 */
function loadImageToEditor(dataURL) {
    const img = new Image();
    img.onload = () => {
        state.canvas.width = img.width;
        state.canvas.height = img.height;
        state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
        state.ctx.drawImage(img, 0, 0);
        state.baseImage = img;
        
        elements.captureSection.classList.add('section--hidden');
        elements.editorSection.classList.remove('section--hidden');
        state.annotations = [];
        updateUndoButton();
    };
    img.src = dataURL;
}

/**
 * Select tool
 */
function selectTool(tool) {
    state.currentTool = tool;
    elements.toolBtns.forEach(btn => {
        const isActive = btn.dataset.tool === tool;
        btn.classList.toggle('tool-btn--active', isActive);
        btn.setAttribute('aria-pressed', isActive);
    });
}

/**
 * Start drawing
 */
function startDrawing(event) {
    state.isDrawing = true;
    const pos = getCanvasMousePosition(state.canvas, event);
    state.startX = pos.x;
    state.startY = pos.y;
    
    if (state.currentTool === 'text') {
        showTextModal(state.startX, state.startY);
        state.isDrawing = false;
    } else if (state.currentTool === 'blur') {
        // Store original imageData for undo capability
        const width = state.canvas.width;
        const height = state.canvas.height;
        state.tempBlurBackup = state.ctx.getImageData(0, 0, width, height);
    }
}

/**
 * Draw annotation
 */
function draw(event) {
    if (!state.isDrawing) return;
    
    const pos = getCanvasMousePosition(state.canvas, event);
    const currentX = pos.x;
    const currentY = pos.y;
    
    redrawCanvas();
    
    state.ctx.strokeStyle = state.currentColor;
    state.ctx.fillStyle = state.currentTool === 'highlight'
        ? `${state.currentColor}40`
        : state.currentColor;
    state.ctx.lineWidth = state.strokeWidth;
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';
    
    switch (state.currentTool) {
        case 'arrow':
            drawArrow(state.startX, state.startY, currentX, currentY);
            break;
        case 'rect':
            drawRect(state.startX, state.startY, currentX, currentY);
            break;
        case 'circle':
            drawCircle(state.startX, state.startY, currentX, currentY);
            break;
        case 'highlight':
            drawHighlight(state.startX, state.startY, currentX, currentY);
            break;
        case 'blur':
            drawBlurPreview(state.startX, state.startY, currentX, currentY);
            break;
    }
}

/**
 * Stop drawing - FIXED: Store blur annotations properly
 */
function stopDrawing(event) {
    if (!state.isDrawing) return;
    
    const pos = getCanvasMousePosition(state.canvas, event);
    const endX = pos.x;
    const endY = pos.y;
    
    // For blur tool, store the original imageData BEFORE applying blur
    if (state.currentTool === 'blur') {
        const minX = Math.min(state.startX, endX);
        const minY = Math.min(state.startY, endY);
        const width = Math.abs(endX - state.startX);
        const height = Math.abs(endY - state.startY);
        
        if (width > 1 && height > 1) {
            // Store annotation with original imageData for undo
            state.annotations.push({
                tool: 'blur',
                startX: state.startX,
                startY: state.startY,
                endX: endX,
                endY: endY,
                color: state.currentColor,
                strokeWidth: state.strokeWidth,
                originalImageData: state.tempBlurBackup // Store backup for undo
            });
            
            // Apply blur effect
            applyBlurEffect(minX, minY, width, height);
        }
    } else {
        // For other tools, store annotation normally
        state.annotations.push({
            tool: state.currentTool,
            startX: state.startX,
            startY: state.startY,
            endX: endX,
            endY: endY,
            color: state.currentColor,
            strokeWidth: state.strokeWidth
        });
    }
    
    state.isDrawing = false;
    state.tempBlurBackup = null;
    updateUndoButton();
}

/**
 * Touch handlers
 */
function handleTouchStart(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    state.canvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    state.canvas.dispatchEvent(mouseEvent);
}

/**
 * Draw arrow
 */
function drawArrow(x1, y1, x2, y2) {
    const headLength = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    state.ctx.beginPath();
    state.ctx.moveTo(x1, y1);
    state.ctx.lineTo(x2, y2);
    state.ctx.stroke();
    
    state.ctx.beginPath();
    state.ctx.moveTo(x2, y2);
    state.ctx.lineTo(
        x2 - headLength * Math.cos(angle - Math.PI / 6),
        y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    state.ctx.moveTo(x2, y2);
    state.ctx.lineTo(
        x2 - headLength * Math.cos(angle + Math.PI / 6),
        y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    state.ctx.stroke();
}

/**
 * Draw rectangle
 */
function drawRect(x1, y1, x2, y2) {
    const width = x2 - x1;
    const height = y2 - y1;
    state.ctx.strokeRect(x1, y1, width, height);
}

/**
 * Draw circle
 */
function drawCircle(x1, y1, x2, y2) {
    const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    state.ctx.beginPath();
    state.ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
    state.ctx.stroke();
}

/**
 * Draw highlight
 */
function drawHighlight(x1, y1, x2, y2) {
    const width = x2 - x1;
    const height = y2 - y1;
    state.ctx.fillRect(x1, y1, width, height);
}

/**
 * Draw blur preview
 */
function drawBlurPreview(x1, y1, x2, y2) {
    const width = x2 - x1;
    const height = y2 - y1;
    state.ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
    state.ctx.fillRect(x1, y1, width, height);
    state.ctx.strokeStyle = '#999999';
    state.ctx.lineWidth = 2;
    state.ctx.setLineDash([5, 5]);
    state.ctx.strokeRect(x1, y1, width, height);
    state.ctx.setLineDash([]);
}

/**
 * Apply blur effect - Pixelation
 */
function applyBlurEffect(x, y, width, height) {
    if (width < 1 || height < 1) return;
    
    try {
        const safeX = Math.max(0, Math.floor(Math.min(x, state.canvas.width - 1)));
        const safeY = Math.max(0, Math.floor(Math.min(y, state.canvas.height - 1)));
        const safeWidth = Math.floor(Math.min(width, state.canvas.width - safeX));
        const safeHeight = Math.floor(Math.min(height, state.canvas.height - safeY));
        
        if (safeWidth < 1 || safeHeight < 1) return;
        
        const imageData = state.ctx.getImageData(safeX, safeY, safeWidth, safeHeight);
        const pixelSize = Math.max(8, state.strokeWidth * 2);
        
        for (let py = 0; py < safeHeight; py += pixelSize) {
            for (let px = 0; px < safeWidth; px += pixelSize) {
                const pixelIndex = (py * safeWidth + px) * 4;
                const r = imageData.data[pixelIndex];
                const g = imageData.data[pixelIndex + 1];
                const b = imageData.data[pixelIndex + 2];
                const a = imageData.data[pixelIndex + 3];
                
                for (let blockY = py; blockY < Math.min(py + pixelSize, safeHeight); blockY++) {
                    for (let blockX = px; blockX < Math.min(px + pixelSize, safeWidth); blockX++) {
                        const blockIndex = (blockY * safeWidth + blockX) * 4;
                        imageData.data[blockIndex] = r;
                        imageData.data[blockIndex + 1] = g;
                        imageData.data[blockIndex + 2] = b;
                        imageData.data[blockIndex + 3] = a;
                    }
                }
            }
        }
        
        state.ctx.putImageData(imageData, safeX, safeY);
    } catch (error) {
        console.error('Blur effect error:', error);
    }
}

/**
 * Redraw canvas - FIXED: Handle blur annotations with restoration
 */
function redrawCanvas() {
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    
    if (state.baseImage) {
        state.ctx.drawImage(state.baseImage, 0, 0);
    }
    
    state.annotations.forEach(annotation => {
        if (annotation.tool === 'blur') {
            // For blur, apply the effect
            const minX = Math.min(annotation.startX, annotation.endX);
            const minY = Math.min(annotation.startY, annotation.endY);
            const width = Math.abs(annotation.endX - annotation.startX);
            const height = Math.abs(annotation.endY - annotation.startY);
            applyBlurEffect(minX, minY, width, height);
        } else {
            // For other annotations, redraw them
            state.ctx.strokeStyle = annotation.color;
            state.ctx.fillStyle = annotation.tool === 'highlight'
                ? `${annotation.color}40`
                : annotation.color;
            state.ctx.lineWidth = annotation.strokeWidth;
            state.ctx.lineCap = 'round';
            state.ctx.lineJoin = 'round';
            
            switch (annotation.tool) {
                case 'arrow':
                    drawArrow(annotation.startX, annotation.startY, annotation.endX, annotation.endY);
                    break;
                case 'rect':
                    drawRect(annotation.startX, annotation.startY, annotation.endX, annotation.endY);
                    break;
                case 'circle':
                    drawCircle(annotation.startX, annotation.startY, annotation.endX, annotation.endY);
                    break;
                case 'highlight':
                    drawHighlight(annotation.startX, annotation.startY, annotation.endX, annotation.endY);
                    break;
                case 'text':
                    state.ctx.font = `${annotation.fontSize}px Inter, sans-serif`;
                    state.ctx.fillText(annotation.text, annotation.x, annotation.y);
                    break;
            }
        }
    });
}

/**
 * Undo - FIXED: Restore from backup for blur annotations
 */
function undo() {
    if (state.annotations.length === 0) return;
    
    const lastAnnotation = state.annotations[state.annotations.length - 1];
    
    // If last annotation was blur, restore the original imageData
    if (lastAnnotation.tool === 'blur' && lastAnnotation.originalImageData) {
        state.ctx.putImageData(lastAnnotation.originalImageData, 0, 0);
    }
    
    state.annotations.pop();
    redrawCanvas();
    updateUndoButton();
    showNotification('↩️ Annotation undone', 'info');
}

/**
 * Clear annotations
 */
function clearAnnotations() {
    state.annotations = [];
    redrawCanvas();
    updateUndoButton();
    hideConfirmModal();
    showNotification('🗑️ All annotations cleared', 'info');
}

/**
 * Update undo button
 */
function updateUndoButton() {
    elements.undoBtn.disabled = state.annotations.length === 0;
}

/**
 * Download image
 */
function downloadImage() {
    try {
        const dataURL = state.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `the-deets-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
        showNotification('💾 Image downloaded successfully', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showNotification('❌ Failed to download image', 'error');
    }
}

/**
 * Share image
 */
async function shareImage() {
    try {
        const blob = await new Promise(resolve =>
            state.canvas.toBlob(resolve, 'image/png')
        );
        const file = new File([blob], `the-deets-${Date.now()}.png`, { type: 'image/png' });
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Annotated Screenshot',
                text: 'Check out this annotated image from the-deets'
            });
            showNotification('📤 Image shared successfully', 'success');
        } else {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            showNotification('📋 Image copied to clipboard', 'success');
        }
    } catch (error) {
        console.error('Share error:', error);
        showNotification('ℹ️ Sharing not supported. Image downloaded instead.', 'info');
        downloadImage();
    }
}

/**
 * Back to capture
 */
function backToCapture() {
    elements.editorSection.classList.add('section--hidden');
    elements.captureSection.classList.remove('section--hidden');
    state.annotations = [];
    state.baseImage = null;
    elements.imageUpload.value = '';
    hideConfirmModal();
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    elements.notification.textContent = message;
    elements.notification.className = `notification notification--${type}`;
    elements.notification.classList.remove('notification--hidden');
    setTimeout(() => {
        elements.notification.classList.add('notification--hidden');
    }, 4000);
}

/**
 * Show confirm modal
 */
function showConfirmModal(message, onConfirm) {
    elements.modalMessage.textContent = message;
    elements.confirmModal.classList.remove('modal--hidden');
    elements.modalConfirm.onclick = () => {
        onConfirm();
    };
}

/**
 * Hide confirm modal
 */
function hideConfirmModal() {
    elements.confirmModal.classList.add('modal--hidden');
    elements.modalConfirm.onclick = null;
}

/**
 * Show text modal
 */
function showTextModal(x, y) {
    elements.textModal.classList.remove('modal--hidden');
    elements.textModalInput.value = '';
    elements.textModalInput.focus();
    state.tempTextX = x;
    state.tempTextY = y;
}

/**
 * Hide text modal
 */
function hideTextModal() {
    elements.textModal.classList.add('modal--hidden');
    elements.textModalInput.value = '';
}

/**
 * Submit text modal
 */
function submitTextModal() {
    const text = sanitizeInput(elements.textModalInput.value.trim());
    if (!text) {
        hideTextModal();
        return;
    }
    
    state.annotations.push({
        tool: 'text',
        x: state.tempTextX,
        y: state.tempTextY,
        text: text,
        color: state.currentColor,
        fontSize: state.strokeWidth * 5
    });
    
    redrawCanvas();
    updateUndoButton();
    hideTextModal();
}

/**
 * Show guide modal
 */
function showGuideModal() {
    elements.guideModal.classList.remove('modal--hidden');
}

/**
 * Hide guide modal
 */
function hideGuideModal() {
    elements.guideModal.classList.add('modal--hidden');
}

/**
 * Toggle theme
 */
function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme');
    elements.themeIcon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', state.theme);
    showNotification(`🎨 ${state.theme === 'dark' ? 'Dark' : 'Light'} theme activated`, 'info');
}

/**
 * Hide all modals
 */
function hideAllModals() {
    hideConfirmModal();
    hideTextModal();
    hideGuideModal();
}

/**
 * Show progress indicator
 */
function showProgress(message = 'Processing...') {
    elements.progressMessage.textContent = message;
    elements.progressIndicator.classList.remove('progress-indicator--hidden');
}

/**
 * Hide progress indicator
 */
function hideProgress() {
    elements.progressIndicator.classList.add('progress-indicator--hidden');
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
