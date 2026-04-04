// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
    frontImageBase64: null, // Imagen final (con filtros)
    frontRawBase64: null,   
    backImageBase64: null,
    backRawBase64: null,
    filters: { front: 'pro', back: 'pro' },
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
    // OCR
    ocrWorker: null,
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

// Auto-detección mejorada de los 4 bordes de la tarjeta
function autoDetectCorners(img, cW, cH) {
    const SMALL = 250; // Resolución ligeramente mayor para mejor detalle
    const sw = SMALL;
    const sh = Math.round(SMALL * img.height / img.width);

    const tc = document.createElement('canvas');
    tc.width = sw; tc.height = sh;
    const tctx = tc.getContext('2d');
    
    // Aplicar un poco de contraste antes de procesar
    tctx.filter = 'contrast(1.4) grayscale(1)';
    tctx.drawImage(img, 0, 0, sw, sh);
    const pixels = tctx.getImageData(0, 0, sw, sh).data;

    const getVal = (x, y) => {
        if (x < 0 || x >= sw || y < 0 || y >= sh) return 128;
        return pixels[(y * sw + x) * 4]; // Grayscale ya aplicado por filter
    };

    const grad = (x, y) => {
        const dx = getVal(x+1,y) - getVal(x-1,y);
        const dy = getVal(x,y+1) - getVal(x,y-1);
        return Math.sqrt(dx*dx + dy*dy);
    };

    // Proyecciones con pesos para ignorar ruidos en los bordes extremos del canvas
    const hProj = new Float32Array(sh);
    const vProj = new Float32Array(sw);
    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const g = grad(x, y);
            hProj[y] += g;
            vProj[x] += g;
        }
    }

    const findBestEdge = (arr, from, to) => {
        let best = from, maxVal = 0;
        for (let i = from; i < to; i++) {
            if (arr[i] > maxVal) { maxVal = arr[i]; best = i; }
        }
        return best;
    };

    // Buscar bordes dentro de márgenes razonables (10% a 90% de la imagen)
    const topY    = findBestEdge(hProj, Math.floor(sh * 0.05), Math.floor(sh * 0.40));
    const bottomY = findBestEdge(hProj, Math.floor(sh * 0.60), Math.floor(sh * 0.95));
    const leftX   = findBestEdge(vProj, Math.floor(sw * 0.05), Math.floor(sw * 0.40));
    const rightX  = findBestEdge(vProj, Math.floor(sw * 0.60), Math.floor(sw * 0.95));

    const DNI_RATIO = 1.585;
    const scaleX = cW / sw, scaleY = cH / sh;
    
    // Si los puntos son demasiado erráticos, fallback al centro
    if ((rightX - leftX) < sw * 0.3) {
        const tw = sw * 0.85;
        const th = tw / DNI_RATIO;
        const pts = [
            { x: (sw-tw)/2, y: (sh-th)/2 },
            { x: (sw+tw)/2, y: (sh-th)/2 },
            { x: (sw+tw)/2, y: (sh+th)/2 },
            { x: (sw-tw)/2, y: (sh+th)/2 }
        ];
        return pts.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
    }

    return [
        { x: leftX * scaleX,  y: topY * scaleY },
        { x: rightX * scaleX, y: topY * scaleY },
        { x: rightX * scaleX, y: bottomY * scaleY },
        { x: leftX * scaleX,  y: bottomY * scaleY }
    ];
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
    const radius = 100; // Pedido por usuario
    const zoom = 0.4;   // Pedido por punto 0.4 (más contexto aún)
    
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

    // 5. Cruz central en la lupa (restaurada por petición del usuario)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(magX - radius, magY); ctx.lineTo(magX + radius, magY);
    ctx.moveTo(magX, magY - radius); ctx.lineTo(magX, magY + radius);
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
    const filtered = await applyImageFilter(warped, 'pro'); // AUTO COLOR PRO

    refs.applyPerspBtn.textContent = '▶ Corregir';
    refs.applyPerspBtn.disabled = false;

    if (state.editingSide === 'front') {
        state.frontRawBase64 = warped;
        state.frontImageBase64 = filtered; 
        updatePreviewUI('front', filtered);
        runOCR('front', filtered); 

        if (!state.backImageBase64) {
            state.currentCaptureMode = 'back';
            refs.captureInstruction.textContent = 'Tomar Foto Atrás';
            initCamera();
        } else {
            showSection('preview');
            checkReadyState();
        }
    } else {
        state.backRawBase64 = warped;
        state.backImageBase64 = filtered;
        updatePreviewUI('back', filtered);
        runOCR('back', filtered);

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
    
    if (ok) balanceBrightness();
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

async function runOCR(side, base64) {
    try {
        if (!state.ocrWorker) {
            state.ocrWorker = await Tesseract.createWorker('spa'); // Usar español para DNI
        }
        
        const { data: { text } } = await state.ocrWorker.recognize(base64);
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        console.log(`OCR [${side}] Lines:`, lines);

        // 1. DNI (8 dígitos)
        const dniMatch = text.match(/\b\d{8}\b/);
        
        // 2. Extraer apellidos y nombres
        const namesFound = [];
        lines.forEach(line => {
            if (/^[A-ZÑÁÉÍÓÚ\s]+$/.test(line) && line.includes(' ')) {
                namesFound.push(line);
            } else {
                const parts = line.split(/\s+/).filter(p => /^[A-ZÑÁÉÍÓÚ]{3,}$/.test(p));
                if (parts.length >= 1) namesFound.push(parts.join(' '));
            }
        });

        if (dniMatch || namesFound.length > 0) {
            let finalDni = dniMatch ? dniMatch[0] : '';
            let firstSurname = '';
            
            // Lógica avanzada para DNI Peruano (Adelante)
            if (side === 'front') {
                // Buscar etiqueta "PRIMER APELLIDO" o similar
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].toUpperCase();
                    if (line.includes('APELLIDO') || line.includes('PRIMER')) {
                        // El apellido suele ser la siguiente línea significativa
                        if (lines[i+1] && /^[A-ZÑÁÉÍÓÚ\s]+$/.test(lines[i+1])) {
                            firstSurname = lines[i+1].split(/\s+/)[0];
                            break;
                        }
                    }
                }
            }

            // Si no se encontró por etiqueta, usar fallback de la primera palabra capturada
            if (!firstSurname) {
                for (const nameGroup of namesFound) {
                    const words = nameGroup.split(/\s+/).filter(w => w.length >= 3);
                    if (words.length > 0) {
                        firstSurname = words[0];
                        break;
                    }
                }
            }

            // Excluir palabras genéricas
            const blacklist = ['DNI', 'IDENTID', 'DOCUM', 'NACIONAL', 'REGISTRO', 'PERU', 'REPUBLICA', 'PRIMER', 'SEGUNDO', 'APELLIDO'];
            if (blacklist.some(b => firstSurname.toUpperCase().includes(b))) firstSurname = '';

            // 3. Montar nombre como DNI [NUMERO] [APELLIDO]
            let val = 'DNI ';
            if (finalDni) val += finalDni;
            if (firstSurname) val += ' ' + firstSurname;
            
            const finalName = val.toUpperCase().trim().substring(0, 40);
            if (finalName) refs.fileNameInput.value = finalName;
        }
    } catch (e) {
        console.error('OCR Error:', e);
    }
}

async function handleFilterChange(side, filterType) {
    state.filters[side] = filterType;
    
    // Actualizar UI de botones
    const btns = document.querySelectorAll(`.btn-filter[data-side="${side}"]`);
    btns.forEach(b => b.classList.toggle('active', b.dataset.filter === filterType));

    const raw = side === 'front' ? state.frontRawBase64 : state.backRawBase64;
    if (!raw) return;

    if (filterType === 'original') {
        updateImageState(side, raw);
    } else {
        const filtered = await applyImageFilter(raw, filterType);
        updateImageState(side, filtered);
    }
}

function updateImageState(side, b64) {
    if (side === 'front') {
        state.frontImageBase64 = b64;
        refs.frontImage.src = b64;
    } else {
        state.backImageBase64 = b64;
        refs.backImage.src = b64;
    }
}

function applyImageFilter(base64, type) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            if (type === 'bw') {
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                    const v = gray > 140 ? 255 : 0;
                    data[i] = data[i+1] = data[i+2] = v;
                }
            } else if (type === 'pro') {
                const contrast = 1.15; 
                const brightness = 8;
                const alpha = 0.25; 
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i+1], b = data[i+2];
                    const procR = Math.min(255, (r - 128) * contrast + 128 + brightness);
                    const procG = Math.min(255, (g - 128) * contrast + 128 + brightness);
                    const procB = Math.min(255, (b - 128) * contrast + 128 + brightness);
                    data[i]   = r * (1 - alpha) + procR * alpha;
                    data[i+1] = g * (1 - alpha) + procG * alpha;
                    data[i+2] = b * (1 - alpha) + procB * alpha;
                }
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.src = base64;
    });
}

// Balancear brillo entre ambas caras para que el PDF sea uniforme
async function balanceBrightness() {
    if (!state.frontImageBase64 || !state.backImageBase64) return;

    const getB = (b64) => new Promise(res => {
        const i = new Image();
        i.onload = () => {
            const c = document.createElement('canvas');
            c.width = 50; c.height = 30; // Muy pequeño para velocidad
            const ctx = c.getContext('2d');
            ctx.drawImage(i, 0, 0, 50, 30);
            const d = ctx.getImageData(0, 0, 50, 30).data;
            let s = 0;
            for(let j=0; j<d.length; j+=4) s += (d[j]+d[j+1]+d[j+2])/3;
            res(s / (50*30));
        };
        i.src = b64;
    });

    const bF = await getB(state.frontImageBase64);
    const bB = await getB(state.backImageBase64);
    const diff = bF - bB; // >0 si adelante es más brillante

    if (Math.abs(diff) > 20) {
        // Aclarar el más oscuro para igualar al más claro
        if (diff > 0) {
            state.backImageBase64 = await adjustBrightness(state.backImageBase64, diff * 0.82);
            refs.backImage.src = state.backImageBase64;
        } else {
            state.frontImageBase64 = await adjustBrightness(state.frontImageBase64, (-diff) * 0.82);
            refs.frontImage.src = state.frontImageBase64;
        }
    }
}

function adjustBrightness(b64, amount) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = id.data;
            for(let i=0; i<d.length; i+=4) {
                d[i] = Math.min(255, d[i] + amount);
                d[i+1] = Math.min(255, d[i+1] + amount);
                d[i+2] = Math.min(255, d[i+2] + amount);
            }
            ctx.putImageData(id, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.src = b64;
    });
}

function showError(msg) { refs.errorMessage.textContent = msg; refs.errorModal.classList.remove('hidden'); }
function hideError()    { refs.errorModal.classList.add('hidden'); }
