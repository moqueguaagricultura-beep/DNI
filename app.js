// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
    frontImageBase64: null,
    backImageBase64: null,
    currentCaptureMode: 'front', // 'front' | 'back'
    editingSide: null,           // 'front' | 'back'
    // Perspectiva
    perspSrc: null,
    perspImg: null,
    perspCorners: null,
    perspScale: 1,
    activeDragCorner: null, // índice 0-3 del handle que se está arrastrando
    // Cropper (edición desde galería)
    cropperInfo: null,
};

// ============================================================
// REFS DOM
// ============================================================
const refs = {
    cameraInput:       document.getElementById('cameraInput'),
    captureBtn:        document.getElementById('captureBtn'),
    galleryBtnHome:    document.getElementById('galleryBtnHome'),
    captureInstruction:document.getElementById('captureInstruction'),

    cameraSection:     document.getElementById('cameraSection'),
    perspectiveSection:document.getElementById('perspectiveSection'),
    cropperSection:    document.getElementById('cropperSection'),
    previewSection:    document.getElementById('previewSection'),

    // Perspectiva
    perspContainer:    document.getElementById('perspContainer'),
    perspCanvas:       document.getElementById('perspCanvas'),
    handleTL:          document.getElementById('handleTL'),
    handleTR:          document.getElementById('handleTR'),
    handleBR:          document.getElementById('handleBR'),
    handleBL:          document.getElementById('handleBL'),
    cancelPerspBtn:    document.getElementById('cancelPerspBtn'),
    applyPerspBtn:     document.getElementById('applyPerspBtn'),

    // Cropper
    cropperImage:      document.getElementById('cropperImage'),
    confirmCropBtn:    document.getElementById('confirmCropBtn'),
    cancelCropBtn:     document.getElementById('cancelCropBtn'),

    // Preview
    frontImage:        document.getElementById('frontImage'),
    frontPlaceholder:  document.getElementById('frontPlaceholder'),
    retakeFrontBtn:    document.getElementById('retakeFront'),
    backImage:         document.getElementById('backImage'),
    backPlaceholder:   document.getElementById('backPlaceholder'),
    retakeBackBtn:     document.getElementById('retakeBack'),

    fileNameInput:     document.getElementById('fileName'),
    generatePdfBtn:    document.getElementById('generatePdfBtn'),
    sharePdfBtn:       document.getElementById('sharePdfBtn'),

    errorModal:        document.getElementById('errorModal'),
    errorMessage:      document.getElementById('errorMessage'),
    closeModalBtn:     document.getElementById('closeModalBtn'),

    // Modal de acción (revisión)
    actionModal:       document.getElementById('actionModal'),
    cropCurrentBtn:    document.getElementById('cropCurrentBtn'),
    changeImageBtn:    document.getElementById('changeImageBtn'),
    cancelActionBtn:   document.getElementById('cancelActionBtn'),
    galleryInput:      document.getElementById('galleryInput'),
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    bindEvents();
    registerSW();
    initNavigation();
});

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            // .then(() => console.log('SW Registered'))
            .catch(err => console.error('SW Error', err));
    }
}

function initCamera() {
    refs.cameraInput.value = '';
    hideAll();
    refs.cameraSection.classList.remove('hidden');
    // Al iniciar, nos aseguramos de que el estado de historia esté limpio para la cámara
    if (history.state?.section !== 'camera') {
        history.replaceState({ section: 'camera' }, '');
    }
}

function hideAll() {
    refs.cameraSection.classList.add('hidden');
    refs.perspectiveSection.classList.add('hidden');
    refs.cropperSection.classList.add('hidden');
    refs.previewSection.classList.add('hidden');
}

// Navegación con botón atrás
function initNavigation() {
    window.addEventListener('popstate', (event) => {
        const section = event.state?.section || 'camera';
        showSection(section, true); // true para no hacer pushState de nuevo
    });
}

function showSection(sectionId, isBack = false) {
    hideAll();
    const sectionMap = {
        'camera':      refs.cameraSection,
        'perspective': refs.perspectiveSection,
        'cropper':     refs.cropperSection,
        'preview':     refs.previewSection
    };
    
    const target = sectionMap[sectionId] || refs.cameraSection;
    target.classList.remove('hidden');

    if (!isBack) {
        history.pushState({ section: sectionId }, '');
    }
}

function bindEvents() {
    refs.captureBtn.addEventListener('click', () => refs.cameraInput.click());
    refs.galleryBtnHome.addEventListener('click', () => {
        state.editingSide = state.currentCaptureMode; // Usar el modo actual (adelante/atrás)
        refs.galleryInput.click();
    });
    refs.cameraInput.addEventListener('change', handleNativeCapture);

    // Perspectiva
    refs.cancelPerspBtn.addEventListener('click', handlePerspCancel);
    refs.applyPerspBtn.addEventListener('click', handlePerspApply);

    // Cropper (edición desde galería)
    refs.confirmCropBtn.addEventListener('click', handleCropConfirm);
    refs.cancelCropBtn.addEventListener('click', handleCropCancel);

    // Tocar miniatura → elegir acción
    refs.frontImage.addEventListener('click', () => openActionModal('front'));
    refs.backImage.addEventListener('click', () => openActionModal('back'));

    refs.cropCurrentBtn.addEventListener('click', () => {
        closeActionModal();
        openCropper(state.editingSide);
    });
    refs.changeImageBtn.addEventListener('click', () => {
        closeActionModal();
        refs.galleryInput.click();
    });
    refs.cancelActionBtn.addEventListener('click', closeActionModal);
    refs.galleryInput.addEventListener('change', handleGallerySelect);

    refs.retakeFrontBtn.addEventListener('click', () => retakePhoto('front'));
    refs.retakeBackBtn.addEventListener('click', () => retakePhoto('back'));

    refs.generatePdfBtn.addEventListener('click', () => handlePdfAction('download'));
    refs.sharePdfBtn.addEventListener('click', () => handlePdfAction('share'));
    refs.closeModalBtn.addEventListener('click', hideError);
}

// ============================================================
// CAPTURA NATIVA → PERSPECTIVA
// ============================================================
function handleNativeCapture(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);

    const reader = new FileReader();
    reader.onload = (ev) => {
        state.editingSide = state.currentCaptureMode;
        openPerspective(ev.target.result);
    };
    reader.readAsDataURL(file);
}

// ============================================================
// MÓDULO DE CORRECCIÓN DE PERSPECTIVA TRAPEZOIDAL
// ============================================================
function openPerspective(base64) {
    state.perspSrc = base64;

    const img = new Image();
    img.onload = () => {
        state.perspImg = img;

        const container = refs.perspContainer;
        const maxW = container.clientWidth || window.innerWidth - 40;
        const maxH = Math.round(window.innerHeight * 0.58);

        const scaleW = maxW / img.width;
        const scaleH = maxH / img.height;
        const scale  = Math.min(scaleW, scaleH, 1);

        const cW = Math.round(img.width  * scale);
        const cH = Math.round(img.height * scale);

        state.perspScale = 1 / scale;

        const canvas = refs.perspCanvas;
        canvas.width  = cW;
        canvas.height = cH;
        canvas.style.width  = cW + 'px';
        canvas.style.height = cH + 'px';

        // Intentar auto-detectar bordes de la tarjeta
        state.perspCorners = autoDetectCorners(img, cW, cH);

        drawPerspOverlay();
        positionHandles();

        showSection('perspective');

        const handles = [refs.handleTL, refs.handleTR, refs.handleBR, refs.handleBL];
        handles.forEach((h, i) => setupHandleDrag(h, i));
    };
    img.src = base64;
}

// Auto-detección de los 4 bordes de la tarjeta por proyección de gradiente
function autoDetectCorners(img, cW, cH) {
    const SMALL = 180;
    const sw = SMALL;
    const sh = Math.round(SMALL * img.height / img.width);

    const tc = document.createElement('canvas');
    tc.width = sw; tc.height = sh;
    const tctx = tc.getContext('2d');
    tctx.drawImage(img, 0, 0, sw, sh);
    const pixels = tctx.getImageData(0, 0, sw, sh).data;

    const gray = (x, y) => {
        if (x < 0 || x >= sw || y < 0 || y >= sh) return 128;
        const i = (y * sw + x) * 4;
        return 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2];
    };
    const grad = (x, y) => {
        const dx = gray(x+1,y) - gray(x-1,y);
        const dy = gray(x,y+1) - gray(x,y-1);
        return Math.sqrt(dx*dx + dy*dy);
    };

    const hProj = Array.from({length: sh}, (_, y) => {
        let s = 0;
        for (let x = 0; x < sw; x++) s += grad(x, y);
        return s / sw;
    });
    const vProj = Array.from({length: sw}, (_, x) => {
        let s = 0;
        for (let y = 0; y < sh; y++) s += grad(x, y);
        return s / sh;
    });

    const peakIn = (arr, from, to) => {
        let best = from, bestVal = 0;
        for (let i = from; i < to; i++) {
            if (arr[i] > bestVal) { bestVal = arr[i]; best = i; }
        }
        return best;
    };

    const margin = 0.08;
    const topY    = peakIn(hProj, Math.floor(sh * margin),    Math.floor(sh * 0.45));
    const bottomY = peakIn(hProj, Math.floor(sh * 0.55), Math.floor(sh * (1-margin)));
    const leftX   = peakIn(vProj, Math.floor(sw * margin),    Math.floor(sw * 0.45));
    const rightX  = peakIn(vProj, Math.floor(sw * 0.55), Math.floor(sw * (1-margin)));

    // VALIDACIÓN DE RATIO (DNI estándar ~ 1.585)
    // rightX-leftX / bottomY-topY
    const detectedW = rightX - leftX;
    const detectedH = bottomY - topY;
    const detectedRatio = detectedW / detectedH;
    const DNI_RATIO = 1.585;

    // Si la detección es absurda (muy pequeña o ratio muy desviado), usar fallback central
    const isAbsurd = (detectedW < sw * 0.2) || (detectedH < sh * 0.2) || 
                     (detectedRatio < 1.1) || (detectedRatio > 2.1);

    if (isAbsurd) {
        // Generar un rectángulo centrado con el ratio correcto
        const targetW = sw * 0.8;
        const targetH = targetW / DNI_RATIO;
        const x0 = (sw - targetW) / 2;
        const y0 = (sh - targetH) / 2;
        
        const scaleX = cW / sw, scaleY = cH / sh;
        return [
            { x: x0 * scaleX,             y: y0 * scaleY },
            { x: (x0 + targetW) * scaleX, y: y0 * scaleY },
            { x: (x0 + targetW) * scaleX, y: (y0 + targetH) * scaleY },
            { x: x0 * scaleX,             y: (y0 + targetH) * scaleY },
        ];
    }

    const scaleX = cW / sw, scaleY = cH / sh;
    const pad = 2; 
    return [
        { x: leftX  * scaleX - pad, y: topY    * scaleY - pad }, // TL
        { x: rightX * scaleX + pad, y: topY    * scaleY - pad }, // TR
        { x: rightX * scaleX + pad, y: bottomY * scaleY + pad }, // BR
        { x: leftX  * scaleX - pad, y: bottomY * scaleY + pad }, // BL
    ].map(pt => ({
        x: Math.min(Math.max(pt.x, 0), cW),
        y: Math.min(Math.max(pt.y, 0), cH),
    }));
}

function drawPerspOverlay() {
    const canvas = refs.perspCanvas;
    const ctx = canvas.getContext('2d');
    const img = state.perspImg;
    const c = state.perspCorners;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // 1. Imagen completa atenuada
    ctx.drawImage(img, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);

    // 2. Imagen sin atenuar dentro del cuadrilátero
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();

    // 3. Borde discontinuo del cuadrilátero
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Marcadores en L muy visibles en cada esquina
    const ARM = Math.min(W, H) * 0.12;
    // Dirección de los brazos: hacia el interior del cuadro
    const dirs = [
        { hx: 1,  hy: 0,  vx: 0,  vy: 1  }, // TL: derecha y abajo
        { hx: -1, hy: 0,  vx: 0,  vy: 1  }, // TR: izquierda y abajo
        { hx: -1, hy: 0,  vx: 0,  vy: -1 }, // BR: izquierda y arriba
        { hx: 1,  hy: 0,  vx: 0,  vy: -1 }, // BL: derecha y arriba
    ];

    c.forEach((pt, i) => {
        const d = dirs[i];
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 8;

        // Brazo horizontal + vertical (L blanca gruesa)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pt.x + d.hx * ARM, pt.y + d.hy * ARM);
        ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(pt.x + d.vx * ARM, pt.y + d.vy * ARM);
        ctx.stroke();

        // L azul encima
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(pt.x + d.hx * ARM, pt.y + d.hy * ARM);
        ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(pt.x + d.vx * ARM, pt.y + d.vy * ARM);
        ctx.stroke();

        const isActive = state.activeDragCorner === i;
        if (!isActive) {
            // Círculo blanco grande en pivote
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 12, 0, Math.PI * 2);
            ctx.fill();

            // Borde azul del círculo
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 3.5;
            ctx.stroke();

            // Cruz interior
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pt.x - 5, pt.y); ctx.lineTo(pt.x + 5, pt.y);
            ctx.moveTo(pt.x, pt.y - 5); ctx.lineTo(pt.x, pt.y + 5);
            ctx.stroke();
        } else {
            // Mira de precisión central (finita y semi-transparente)
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(pt.x - 20, pt.y); ctx.lineTo(pt.x + 20, pt.y);
            ctx.moveTo(pt.x, pt.y - 20); ctx.lineTo(pt.x, pt.y + 20);
            ctx.stroke();
        }

        ctx.restore();
    });

    // 5. Lupa de zoom: se dibuja cuando el usuario está arrastrando una esquina
    if (state.activeDragCorner !== null) {
        drawMagnifier(ctx, img, W, H, c[state.activeDragCorner]);
    }
}

function positionHandles() {
    const handles = [refs.handleTL, refs.handleTR, refs.handleBR, refs.handleBL];
    const HALF = 28; // radio del handle (56px)
    handles.forEach((h, i) => {
        const c = state.perspCorners[i];
        h.style.left = (c.x - HALF) + 'px';
        h.style.top  = (c.y - HALF) + 'px';
    });
}

function setupHandleDrag(handle, idx) {
    const canvas = refs.perspCanvas;
    const HALF = 28; 

    // Eliminar listeners previos clonando el nodo
    const fresh = handle.cloneNode(true);
    handle.parentNode.replaceChild(fresh, handle);

    // Actualizar ref
    const ids = ['handleTL','handleTR','handleBR','handleBL'];
    refs[ids[idx]] = fresh;

    const onStart = () => {
        state.activeDragCorner = idx;
        drawPerspOverlay();
    };

    const onMove = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = Math.min(Math.max((clientX - rect.left) * scaleX, 0), canvas.width);
        const y = Math.min(Math.max((clientY - rect.top)  * scaleY, 0), canvas.height);
        state.perspCorners[idx] = { x, y };
        drawPerspOverlay();
        fresh.style.left = (x - HALF) + 'px';
        fresh.style.top  = (y - HALF) + 'px';
    };

    const onEnd = () => {
        state.activeDragCorner = null;
        drawPerspOverlay();
    };

    // Touch
    fresh.addEventListener('touchstart', (e) => { 
        e.preventDefault(); 
        onStart(); 
    }, { passive: false });
    fresh.addEventListener('touchmove',  (e) => {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    fresh.addEventListener('touchend', onEnd);

    // Mouse (escritorio / DevTools)
    let down = false;
    fresh.addEventListener('mousedown', () => { down = true; onStart(); });
    document.addEventListener('mousemove', (e) => { if (down) onMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup',   () => { if (down) { down = false; onEnd(); } });
}

// Implementación de Lupa de Zoom
function drawMagnifier(ctx, img, W, H, pt) {
    const radius = 90; // Aumentado ligeramente para mejor visibilidad
    const zoom = 1.0; // El usuario pidió reducir el zoom a 1.0 (vista natural)
    
    // Posición de la lupa: esquina superior opuesta al punto que arrastramos
    const magX = pt.x < W / 2 ? W - radius - 20 : radius + 20;
    const magY = radius + 20;

    ctx.save();
    
    // 1. Sombras y Estilo premium
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 15;
    
    // 2. Dibujar círculo de recorte
    ctx.beginPath();
    ctx.arc(magX, magY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b'; 
    ctx.fill();
    ctx.clip();

    // 3. Dibujar porción de imagen ampliada
    const sw = radius * 2 / zoom;
    const sh = radius * 2 / zoom;
    const sx = pt.x * (img.width / W) - sw/2;
    const sy = pt.y * (img.height / H) - sh/2;

    ctx.drawImage(img, sx, sy, sw, sh, magX - radius, magY - radius, radius * 2, radius * 2);
    
    ctx.restore();

    // 4. Borde del círculo
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 5. Cruz central en la lupa (precisión)
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(magX - 20, magY); ctx.lineTo(magX + 20, magY);
    ctx.moveTo(magX, magY - 20); ctx.lineTo(magX, magY + 20);
    ctx.stroke();
    ctx.setLineDash([]);
}

function handlePerspCancel() {
    const isFlowComplete = state.frontImageBase64 && state.backImageBase64;
    if (!isFlowComplete) {
        initCamera();
    } else {
        showSection('preview');
    }
}

async function handlePerspApply() {
    refs.applyPerspBtn.textContent = 'Procesando…';
    refs.applyPerspBtn.disabled = true;

    // Convertir corners de canvas a coords de imagen original
    const srcCorners = state.perspCorners.map(c => ({
        x: c.x * state.perspScale,
        y: c.y * state.perspScale,
    }));

    // Ceder el hilo al navegador antes de empezar el cómputo pesado
    await new Promise(r => setTimeout(r, 30));

    const warped = await perspectiveWarp(state.perspSrc, state.perspImg, srcCorners);

    refs.applyPerspBtn.textContent = '▶ Corregir';
    refs.applyPerspBtn.disabled = false;

    if (state.editingSide === 'front') {
        state.frontImageBase64 = warped;
        updatePreviewUI('front', warped);
        if (!state.backImageBase64) {
            state.currentCaptureMode = 'back';
            refs.captureInstruction.textContent = 'Tomar Foto Atrás';
            initCamera();
        } else {
            showSection('preview');
            checkReadyState();
        }
    } else {
        state.backImageBase64 = warped;
        updatePreviewUI('back', warped);
        showSection('preview');
        checkReadyState();
    }
}

// ============================================================
// MATEMÁTICAS DE PERSPECTIVA (Homografía)
// ============================================================
function gaussianElim(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
        }
        [M[col], M[maxRow]] = [M[maxRow], M[col]];
        for (let row = col + 1; row < n; row++) {
            const f = M[row][col] / M[col][col];
            for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = M[i][n] / M[i][i];
        for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
    }
    return x;
}

// Calcula la matriz Homografía 3×3 a partir de 4 correspondencias de puntos
// srcPts y dstPts: arrays de [x,y]
function computeHomography(srcPts, dstPts) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = srcPts[i];
        const [u, v] = dstPts[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        b.push(v);
    }
    const h = gaussianElim(A, b);
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
}

function applyH(H, x, y) {
    const w = H[2][0] * x + H[2][1] * y + H[2][2];
    return [(H[0][0]*x + H[0][1]*y + H[0][2]) / w,
            (H[1][0]*x + H[1][1]*y + H[1][2]) / w];
}

// Render del warp en canvas offscreen
function perspectiveWarp(base64, img, srcCorners) {
    // Output en proporción DNI real, ancho 1200px
    const outW = 1200;
    const outH = Math.round(outW / 1.585); // ≈ 757

    return new Promise(resolve => {
        // Mapeo inverso: para cada pixel DESTINO encontramos el pixel FUENTE
        const dstPts = [[0,0],[outW,0],[outW,outH],[0,outH]];
        const srcPts = srcCorners.map(c => [c.x, c.y]);
        const H_inv = computeHomography(dstPts, srcPts); // dst→src

        const srcCanvas = document.createElement('canvas');
        srcCanvas.width  = img.width;
        srcCanvas.height = img.height;
        const sCtx = srcCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0);
        const srcData = sCtx.getImageData(0, 0, img.width, img.height).data;

        const outCanvas = document.createElement('canvas');
        outCanvas.width  = outW;
        outCanvas.height = outH;
        const oCtx = outCanvas.getContext('2d');
        const outImg = oCtx.createImageData(outW, outH);
        const od = outImg.data;

        const sw = img.width, sh = img.height;

        for (let dy = 0; dy < outH; dy++) {
            for (let dx = 0; dx < outW; dx++) {
                const [sx, sy] = applyH(H_inv, dx, dy);

                // Muestreo bilineal
                const x0 = Math.floor(sx), y0 = Math.floor(sy);
                const x1 = x0 + 1,         y1 = y0 + 1;
                const fx = sx - x0,         fy = sy - y0;

                const clampX = v => Math.min(Math.max(v, 0), sw - 1);
                const clampY = v => Math.min(Math.max(v, 0), sh - 1);
                const px = (x, y) => (clampY(y) * sw + clampX(x)) * 4;

                const i00 = px(x0, y0), i10 = px(x1, y0);
                const i01 = px(x0, y1), i11 = px(x1, y1);

                const di = (dy * outW + dx) * 4;
                for (let c = 0; c < 4; c++) {
                    od[di+c] = Math.round(
                        srcData[i00+c] * (1-fx) * (1-fy) +
                        srcData[i10+c] *    fx  * (1-fy) +
                        srcData[i01+c] * (1-fx) *    fy  +
                        srcData[i11+c] *    fx  *    fy
                    );
                }
            }
        }

        oCtx.putImageData(outImg, 0, 0);
        resolve(outCanvas.toDataURL('image/jpeg', 0.93));
    });
}

// ============================================================
// CROPPER (edición desde galería tocando miniatura)
// ============================================================
function openCropper(side) {
    if (side === 'front' && !state.frontImageBase64) return;
    if (side === 'back'  && !state.backImageBase64)  return;
    state.editingSide = side;
    const b64 = side === 'front' ? state.frontImageBase64 : state.backImageBase64;

    showSection('cropper');

    if (state.cropperInfo) { state.cropperInfo.destroy(); state.cropperInfo = null; }
    refs.cropperImage.src = b64;
    state.cropperInfo = new Cropper(refs.cropperImage, {
        viewMode: 1, autoCropArea: 0.95,
        dragMode: 'move', background: false, guides: true,
    });
}

function handleCropCancel() {
    if (state.cropperInfo) { state.cropperInfo.destroy(); state.cropperInfo = null; }
    showSection('preview');
}

function handleCropConfirm() {
    if (!state.cropperInfo) return;
    const cropped = state.cropperInfo.getCroppedCanvas({
        width: 2000, imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
    }).toDataURL('image/jpeg', 0.93);

    state.cropperInfo.destroy(); state.cropperInfo = null;

    if (state.editingSide === 'front') {
        state.frontImageBase64 = cropped;
        updatePreviewUI('front', cropped);
    } else {
        state.backImageBase64 = cropped;
        updatePreviewUI('back', cropped);
    }
    showSection('preview');
    checkReadyState();
}

// ============================================================
// INTERFAZ DE PREVIEW
// ============================================================
function updatePreviewUI(side, b64) {
    const isFront = side === 'front';
    const img  = isFront ? refs.frontImage       : refs.backImage;
    const ph   = isFront ? refs.frontPlaceholder  : refs.backPlaceholder;
    const btn  = isFront ? refs.retakeFrontBtn    : refs.retakeBackBtn;
    img.src = b64;
    img.classList.remove('hidden');
    ph.classList.remove('active');
    btn.classList.remove('hidden');
}

function retakePhoto(side) {
    state.currentCaptureMode = side;
    refs.captureInstruction.textContent = side === 'front' ? 'Tomar Foto Adelante' : 'Tomar Foto Atrás';
    initCamera();
}

function checkReadyState() {
    const ok = state.frontImageBase64 && state.backImageBase64;
    refs.generatePdfBtn.disabled = !ok;
    refs.sharePdfBtn.disabled    = !(ok && (navigator.canShare || window.navigator.share));
}

// ============================================================
// GENERACIÓN DE PDF
// ============================================================
async function generatePDFBlob() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = doc.internal.pageSize.getWidth();
    const cardW = 128.4;
    const mX = (pdfW - cardW) / 2;
    let y = 20;

    const getSize = b64 => new Promise(res => {
        const i = new Image(); i.onload = () => res({w:i.width, h:i.height}); i.src = b64;
    });

    if (state.frontImageBase64) {
        const {w,h} = await getSize(state.frontImageBase64);
        const imgH = cardW / (w/h);
        doc.addImage(state.frontImageBase64, 'JPEG', mX, y, cardW, imgH);
        y += imgH + 12;
    }
    if (state.backImageBase64) {
        const {w,h} = await getSize(state.backImageBase64);
        const imgH = cardW / (w/h);
        doc.addImage(state.backImageBase64, 'JPEG', mX, y, cardW, imgH);
    }
    return doc.output('blob');
}

async function handlePdfAction(action) {
    try {
        const title = refs.fileNameInput.value.trim() || 'Documento_Escaneado';
        const fname = `${title.replace(/\s+/g, '_')}.pdf`;
        const old = refs.sharePdfBtn.textContent;
        refs.sharePdfBtn.textContent = 'Procesando…';
        refs.sharePdfBtn.disabled = true;
        refs.generatePdfBtn.disabled = true;

        const blob = await generatePDFBlob();
        if (action === 'download') downloadBlob(blob, fname);
        else await shareBlob(blob, fname, title);

        refs.sharePdfBtn.textContent = old;
        checkReadyState();
    } catch(err) {
        console.error(err);
        showError('Ocurrió un error al generar el PDF.');
        refs.sharePdfBtn.textContent = 'Compartir';
        checkReadyState();
    }
}

function downloadBlob(blob, fname) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function shareBlob(blob, fname, title) {
    const file = new File([blob], fname, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ title, text: 'Documento generado.', files: [file] }); }
        catch (e) { if (e.name !== 'AbortError') showError('No se pudo compartir.'); }
    } else {
        showError('Compartir no disponible. Descargando…');
        downloadBlob(blob, fname);
    }
}

// ============================================================
// UTILIDADES
// ============================================================
function openActionModal(side) {
    state.editingSide = side;
    refs.actionModal.classList.remove('hidden');
}

function closeActionModal() {
    refs.actionModal.classList.add('hidden');
}

function handleGallerySelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
        openPerspective(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Resetear para permitir seleccionar el mismo otra vez
}

function showError(msg) { refs.errorMessage.textContent = msg; refs.errorModal.classList.remove('hidden'); }
function hideError()    { refs.errorModal.classList.add('hidden'); }
