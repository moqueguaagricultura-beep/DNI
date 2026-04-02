// --- Estado de la App ---
const state = {
    frontImageBase64: null,
    backImageBase64: null,
    currentCaptureMode: 'front', // 'front' | 'back'
    cropperInfo: null,
    editingSide: null // 'front' | 'back'
};

// --- Elementos del DOM ---
const refs = {
    cameraInput: document.getElementById('cameraInput'),
    captureBtn: document.getElementById('captureBtn'),
    captureInstruction: document.getElementById('captureInstruction'),

    cameraSection: document.getElementById('cameraSection'),
    previewSection: document.getElementById('previewSection'),
    cropperSection: document.getElementById('cropperSection'),

    cropperImage: document.getElementById('cropperImage'),
    confirmCropBtn: document.getElementById('confirmCropBtn'),
    cancelCropBtn: document.getElementById('cancelCropBtn'),

    frontPreviewBox: document.getElementById('frontPreviewBox'),
    frontImage: document.getElementById('frontImage'),
    frontPlaceholder: document.getElementById('frontPlaceholder'),
    retakeFrontBtn: document.getElementById('retakeFront'),

    backPreviewBox: document.getElementById('backPreviewBox'),
    backImage: document.getElementById('backImage'),
    backPlaceholder: document.getElementById('backPlaceholder'),
    retakeBackBtn: document.getElementById('retakeBack'),

    fileNameInput: document.getElementById('fileName'),
    generatePdfBtn: document.getElementById('generatePdfBtn'),
    sharePdfBtn: document.getElementById('sharePdfBtn'),

    errorModal: document.getElementById('errorModal'),
    errorMessage: document.getElementById('errorMessage'),
    closeModalBtn: document.getElementById('closeModalBtn')
};

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    bindEvents();
});

function initCamera() {
    // Limpiar el input para que el usuario pueda seleccionar la misma foto que antes si desea
    refs.cameraInput.value = '';
    refs.cameraSection.classList.remove('hidden');
    refs.previewSection.classList.add('hidden');
    refs.cropperSection.classList.add('hidden');
}

function bindEvents() {
    // Botón visible → dispara el input file oculto (cámara nativa del SO)
    refs.captureBtn.addEventListener('click', () => {
        refs.cameraInput.click();
    });

    // Cuando el usuario toma la foto y la acepta en la app del SO:
    refs.cameraInput.addEventListener('change', handleNativeCapture);

    // Botones de re-toma
    refs.retakeFrontBtn.addEventListener('click', () => retakePhoto('front'));
    refs.retakeBackBtn.addEventListener('click', () => retakePhoto('back'));

    // Tocar miniatura en revisión → abrir editor opcional
    refs.frontImage.addEventListener('click', () => openCropper('front'));
    refs.backImage.addEventListener('click', () => openCropper('back'));

    // Cropper
    refs.confirmCropBtn.addEventListener('click', handleCropConfirm);
    refs.cancelCropBtn.addEventListener('click', handleCropCancel);

    // PDF
    refs.generatePdfBtn.addEventListener('click', () => handlePdfAction('download'));
    refs.sharePdfBtn.addEventListener('click', () => handlePdfAction('share'));

    refs.closeModalBtn.addEventListener('click', hideError);
}

// --- Captura Nativa ---
function handleNativeCapture(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Vibración de confirmación al recibir de vuelta la foto
    if (navigator.vibrate) {
        navigator.vibrate([80, 40, 80]);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const rawBase64 = event.target.result;
        // Abrir el recortador OBLIGATORIO porque la foto nativa incluye todo el fondo
        state.editingSide = state.currentCaptureMode;
        showCropper(rawBase64, true); // true = forzar aspect-ratio 1.58 de tarjeta
    };
    reader.readAsDataURL(file);
}

// --- Subsistema de Recorte (Cropper.js) ---
function showCropper(imageSrc, forceAspect = false) {
    refs.cameraSection.classList.add('hidden');
    refs.previewSection.classList.add('hidden');
    refs.cropperSection.classList.remove('hidden');

    if (state.cropperInfo) {
        state.cropperInfo.destroy();
        state.cropperInfo = null;
    }

    refs.cropperImage.src = imageSrc;

    const options = {
        viewMode: 1,
        autoCropArea: 0.85,
        dragMode: 'move',
        background: false,
        guides: true,
        movable: true,
        zoomable: true
    };

    // Forzar la proporción estándar de una tarjeta ID/DNI (85.6 × 54 mm = 1.585)
    if (forceAspect) {
        options.aspectRatio = 1.585;
    }

    state.cropperInfo = new Cropper(refs.cropperImage, options);
}

// Clic en miniatura de galería → edición libre (sin forzar ratio)
function openCropper(side) {
    if (side === 'front' && !state.frontImageBase64) return;
    if (side === 'back' && !state.backImageBase64) return;

    state.editingSide = side;
    const base64 = side === 'front' ? state.frontImageBase64 : state.backImageBase64;
    showCropper(base64, false); // Sin forzar ratio → libre
}

function handleCropCancel() {
    if (state.cropperInfo) {
        state.cropperInfo.destroy();
        state.cropperInfo = null;
    }
    refs.cropperSection.classList.add('hidden');

    // Si todavía no completamos el flujo principal, volver a la pantalla de cámara
    const isFlowComplete = state.frontImageBase64 && state.backImageBase64;
    if (!isFlowComplete) {
        initCamera();
    } else {
        refs.previewSection.classList.remove('hidden');
    }
}

function handleCropConfirm() {
    if (!state.cropperInfo) return;

    // Máxima resolución para textos nítidos en DNI (2500px de ancho)
    const croppedCanvas = state.cropperInfo.getCroppedCanvas({
        width: 2500,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    const croppedBase64 = croppedCanvas.toDataURL('image/jpeg', 0.95);

    state.cropperInfo.destroy();
    state.cropperInfo = null;
    refs.cropperSection.classList.add('hidden');

    if (state.editingSide === 'front') {
        state.frontImageBase64 = croppedBase64;
        updatePreviewUI('front', croppedBase64);

        // Flujo inicial: ahora pedir la foto de atrás
        if (state.currentCaptureMode === 'front') {
            state.currentCaptureMode = 'back';
            refs.captureInstruction.textContent = 'Tomar Foto Atrás';
            initCamera();
            return;
        }

    } else {
        state.backImageBase64 = croppedBase64;
        updatePreviewUI('back', croppedBase64);

        // Flujo inicial: ambas listas → ir a revisión
        if (state.currentCaptureMode === 'back') {
            state.currentCaptureMode = 'front';
            refs.captureInstruction.textContent = 'Tomar Foto Adelante';
            refs.previewSection.classList.remove('hidden');
            checkReadyState();
            return;
        }
    }

    // Edición desde galería → volver a revisión
    refs.previewSection.classList.remove('hidden');
    checkReadyState();
}

// --- Interfaz de vista previa ---
function updatePreviewUI(side, base64) {
    const isFront = side === 'front';
    const imgEl = isFront ? refs.frontImage : refs.backImage;
    const placeholderEl = isFront ? refs.frontPlaceholder : refs.backPlaceholder;
    const retakeBtnEl = isFront ? refs.retakeFrontBtn : refs.retakeBackBtn;

    imgEl.src = base64;
    imgEl.classList.remove('hidden');
    placeholderEl.classList.remove('active');
    retakeBtnEl.classList.remove('hidden');
}

function retakePhoto(side) {
    state.currentCaptureMode = side;
    refs.captureInstruction.textContent = side === 'front' ? 'Tomar Foto Adelante' : 'Tomar Foto Atrás';
    refs.previewSection.classList.add('hidden');
    initCamera();
}

function checkReadyState() {
    const isReady = state.frontImageBase64 && state.backImageBase64;
    refs.generatePdfBtn.disabled = !isReady;
    refs.sharePdfBtn.disabled = !(isReady && (navigator.canShare || window.navigator.share));
}

// --- Generación de PDF ---
async function generatePDFBlob() {
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    // DNI estándar: 85.6 × 54 mm → al 150%: 128.4 × 81 mm
    const pdfPageWidth = doc.internal.pageSize.getWidth();
    const cardWidth = 128.4;
    const cardHeight = 81.0;
    const marginX = (pdfPageWidth - cardWidth) / 2;
    let startY = 20;

    // Función auxiliar: obtener dimensiones reales de la imagen recortada
    const getImgSize = (b64) => new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.src = b64;
    });

    if (state.frontImageBase64) {
        const { w, h } = await getImgSize(state.frontImageBase64);
        const ratio = w / h;
        // Respetar el ratio real del recorte para no deformar
        const imgW = cardWidth;
        const imgH = imgW / ratio;
        doc.addImage(state.frontImageBase64, 'JPEG', marginX, startY, imgW, imgH);
        startY += imgH + 12;
    }

    if (state.backImageBase64) {
        const { w, h } = await getImgSize(state.backImageBase64);
        const ratio = w / h;
        const imgW = cardWidth;
        const imgH = imgW / ratio;
        doc.addImage(state.backImageBase64, 'JPEG', marginX, startY, imgW, imgH);
    }

    return doc.output('blob');
}

async function handlePdfAction(action) {
    try {
        const title = refs.fileNameInput.value.trim() || 'Documento_Escaneado';
        const filename = `${title.replace(/\s+/g, '_')}.pdf`;

        const oldText = refs.sharePdfBtn.textContent;
        refs.sharePdfBtn.textContent = 'Procesando...';
        refs.sharePdfBtn.disabled = true;
        refs.generatePdfBtn.disabled = true;

        const pdfBlob = await generatePDFBlob();

        if (action === 'download') {
            downloadBlob(pdfBlob, filename);
        } else {
            await shareBlob(pdfBlob, filename, title);
        }

        refs.sharePdfBtn.textContent = oldText;
        checkReadyState();

    } catch (err) {
        console.error('Error generando PDF:', err);
        showError('Ocurrió un error al generar el documento PDF.');
        checkReadyState();
        refs.sharePdfBtn.textContent = 'Compartir';
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function shareBlob(blob, filename, title) {
    const file = new File([blob], filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ title, text: 'Documento generado.', files: [file] });
        } catch (error) {
            if (error.name !== 'AbortError') {
                showError('No se pudo completar la acción de compartir.');
            }
        }
    } else {
        showError('Compartir no disponible en este dispositivo. Descargando...');
        downloadBlob(blob, filename);
    }
}

// --- Utilidades ---
function showError(msg) {
    refs.errorMessage.textContent = msg;
    refs.errorModal.classList.remove('hidden');
}

function hideError() {
    refs.errorModal.classList.add('hidden');
}
