// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
    frontImageBase64: null,
    backImageBase64: null,
    currentCaptureMode: 'front', // 'front' | 'back'
    editingSide: null,           // 'front' | 'back'
    // Perspectiva
    perspSrc: null,              // base64 original de la foto nativa
    perspImg: null,              // HTMLImageElement cargado
    perspCorners: null,          // [{x,y}] en coords del canvas
    perspScale: 1,               // ratio: imgPx = canvasPx * perspScale
    // Cropper (edición desde galería)
    cropperInfo: null,
};

// ============================================================
// REFS DOM
// ============================================================
const refs = {
    cameraInput:       document.getElementById('cameraInput'),
    captureBtn:        document.getElementById('captureBtn'),
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
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    bindEvents();
});

function initCamera() {
    refs.cameraInput.value = '';
    hideAll();
    refs.cameraSection.classList.remove('hidden');
}

function hideAll() {
    refs.cameraSection.classList.add('hidden');
    refs.perspectiveSection.classList.add('hidden');
    refs.cropperSection.classList.add('hidden');
    refs.previewSection.classList.add('hidden');
}

function bindEvents() {
    refs.captureBtn.addEventListener('click', () => refs.cameraInput.click());
    refs.cameraInput.addEventListener('change', handleNativeCapture);

    // Perspectiva
    refs.cancelPerspBtn.addEventListener('click', handlePerspCancel);
    refs.applyPerspBtn.addEventListener('click', handlePerspApply);

    // Cropper (edición desde galería)
    refs.confirmCropBtn.addEventListener('click', handleCropConfirm);
    refs.cancelCropBtn.addEventListener('click', handleCropCancel);

    // Tocar miniatura → edición con cropper
    refs.frontImage.addEventListener('click', () => openCropper('front'));
    refs.backImage.addEventListener('click', () => openCropper('back'));

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

        // Dimensiones del canvas de visualización
        const container = refs.perspContainer;
        const maxW = container.clientWidth || window.innerWidth - 40;
        const maxH = Math.round(window.innerHeight * 0.58);

        const scaleW = maxW / img.width;
        const scaleH = maxH / img.height;
        const scale  = Math.min(scaleW, scaleH, 1);

        const cW = Math.round(img.width  * scale);
        const cH = Math.round(img.height * scale);

        state.perspScale = 1 / scale; // canvas→image multiplier

        const canvas = refs.perspCanvas;
        canvas.width  = cW;
        canvas.height = cH;
        canvas.style.width  = cW + 'px';
        canvas.style.height = cH + 'px';

        // Esquinas iniciales: 12% de margen
        const m = 0.12;
        state.perspCorners = [
            { x: cW * m,       y: cH * m },       // TL
            { x: cW * (1 - m), y: cH * m },       // TR
            { x: cW * (1 - m), y: cH * (1 - m) }, // BR
            { x: cW * m,       y: cH * (1 - m) }  // BL
        ];

        drawPerspOverlay();
        positionHandles();

        hideAll();
        refs.perspectiveSection.classList.remove('hidden');

        // Configurar arrastre de cada handle
        const handles = [refs.handleTL, refs.handleTR, refs.handleBR, refs.handleBL];
        handles.forEach((h, i) => setupHandleDrag(h, i));
    };
    img.src = base64;
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
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
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

    // 3. Borde azul del cuadrilátero
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.stroke();
}

function positionHandles() {
    const canvas = refs.perspCanvas;
    const handles = [refs.handleTL, refs.handleTR, refs.handleBR, refs.handleBL];
    const HALF = 22; // radio del handle (44px)
    handles.forEach((h, i) => {
        const c = state.perspCorners[i];
        h.style.left = (c.x - HALF) + 'px';
        h.style.top  = (c.y - HALF) + 'px';
    });
}

function setupHandleDrag(handle, idx) {
    const canvas = refs.perspCanvas;
    const HALF = 22;

    // Eliminar listeners previos clonando el nodo
    const fresh = handle.cloneNode(true);
    handle.parentNode.replaceChild(fresh, handle);

    // Actualizar ref
    const ids = ['handleTL','handleTR','handleBR','handleBL'];
    refs[ids[idx]] = fresh;

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

    // Touch
    fresh.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
    fresh.addEventListener('touchmove',  (e) => {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    // Mouse (escritorio / DevTools)
    let down = false;
    fresh.addEventListener('mousedown', () => { down = true; });
    document.addEventListener('mousemove', (e) => { if (down) onMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup',   () => { down = false; });
}

function handlePerspCancel() {
    hideAll();
    const isFlowComplete = state.frontImageBase64 && state.backImageBase64;
    if (!isFlowComplete) {
        initCamera();
    } else {
        refs.previewSection.classList.remove('hidden');
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

    hideAll();

    if (state.editingSide === 'front') {
        state.frontImageBase64 = warped;
        updatePreviewUI('front', warped);
        if (!state.backImageBase64) {
            state.currentCaptureMode = 'back';
            refs.captureInstruction.textContent = 'Tomar Foto Atrás';
            initCamera();
        } else {
            refs.previewSection.classList.remove('hidden');
            checkReadyState();
        }
    } else {
        state.backImageBase64 = warped;
        updatePreviewUI('back', warped);
        refs.previewSection.classList.remove('hidden');
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

    hideAll();
    refs.cropperSection.classList.remove('hidden');

    if (state.cropperInfo) { state.cropperInfo.destroy(); state.cropperInfo = null; }
    refs.cropperImage.src = b64;
    state.cropperInfo = new Cropper(refs.cropperImage, {
        viewMode: 1, autoCropArea: 0.95,
        dragMode: 'move', background: false, guides: true,
    });
}

function handleCropCancel() {
    if (state.cropperInfo) { state.cropperInfo.destroy(); state.cropperInfo = null; }
    hideAll();
    refs.previewSection.classList.remove('hidden');
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
    hideAll();
    refs.previewSection.classList.remove('hidden');
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
    hideAll();
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
function showError(msg) { refs.errorMessage.textContent = msg; refs.errorModal.classList.remove('hidden'); }
function hideError()    { refs.errorModal.classList.add('hidden'); }
