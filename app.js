// --- Estado de la App ---
const state = {
    frontImageBase64: null,
    backImageBase64: null,
    currentCaptureMode: 'front', // 'front' (Adelante) o 'back' (Atrás)
    stream: null,
    cropperInfo: null, // Guardará la ref a la instancia de cropper
    editingSide: null // 'front' o 'back'
};

// --- Elementos del DOM ---
const refs = {
    video: document.getElementById('cameraStream'),
    canvas: document.getElementById('captureCanvas'),
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

// --- Sonido de Cámara (Audio HTML) ---
const beepAudio = new Audio("data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
// El base64 superior es un silencio, pero añadimos una URL de "camera shutter" limpia
beepAudio.src = "https://actions.google.com/sounds/v1/water/camera_shutter.ogg";
beepAudio.preload = "auto";

function playShutterSound() {
    try {
        beepAudio.currentTime = 0;
        beepAudio.play().catch(e => console.log("Audio blockeado por navegador", e));
    } catch(e) {}
}
        


// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    bindEvents();
});

function bindEvents() {
    refs.captureBtn.addEventListener('click', handleCaptureClick);
    
    refs.retakeFrontBtn.addEventListener('click', () => retakePhoto('front'));
    refs.retakeBackBtn.addEventListener('click', () => retakePhoto('back'));
    
    refs.frontImage.addEventListener('click', () => openCropper('front'));
    refs.backImage.addEventListener('click', () => openCropper('back'));

    refs.confirmCropBtn.addEventListener('click', handleCropConfirm);
    refs.cancelCropBtn.addEventListener('click', handleCropCancel);
    
    refs.generatePdfBtn.addEventListener('click', () => handlePdfAction('download'));
    refs.sharePdfBtn.addEventListener('click', () => handlePdfAction('share'));
    
    refs.closeModalBtn.addEventListener('click', hideError);
}

// --- Subsistema de Cámara ---
async function initCamera() {
    try {
        if (state.stream) {
            stopCamera();
        }
        
        const constraints = {
            video: {
                facingMode: 'environment', // Trasera
                width: { ideal: 3840, min: 1920 },
                height: { ideal: 2160, min: 1080 },
                advanced: [{ focusMode: "continuous" }]
            },
            audio: false
        };
        
        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        refs.video.srcObject = state.stream;

        refs.video.onloadedmetadata = () => {
            refs.video.play();
        };
        
        refs.cameraSection.classList.remove('hidden');
        refs.previewSection.classList.add('hidden');
    } catch (err) {
        console.error("Error accediendo a la cámara:", err);
        showError("No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios.");
    }
}

function stopCamera() {
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
    }
}

// --- Subsistema de Captura y Recorte ---
async function handleCaptureClick() {
    if (!refs.video.videoWidth) return;

    // 1. Sonido y Vibración (Feedback)
    playShutterSound();
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // Vibración rítmica rápida
    }

    // 2. Extraer fotograma tal cual se ve (WYSIWYG con object-fit: cover en ratio 1.58)
    const targetRatio = 1.58; 
    let base64Image;

    const vw = refs.video.videoWidth;
    const vh = refs.video.videoHeight;
    
    let sWidth = vw;
    let sHeight = vh;
    let sx = 0; 
    let sy = 0;

    const videoRatio = vw / vh;
    if (videoRatio > targetRatio) {
        sWidth = vh * targetRatio;
        sx = (vw - sWidth) / 2;
    } else {
        sHeight = vw / targetRatio;
        sy = (vh - sHeight) / 2;
    }

    refs.canvas.width = sWidth;
    refs.canvas.height = sHeight;
    
    const ctx = refs.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(refs.video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    
    // Guardar en alta calidad
    base64Image = refs.canvas.toDataURL('image/jpeg', 0.98);

    // 3. Guardar estado
    if (state.currentCaptureMode === 'front') {
        state.frontImageBase64 = base64Image;
        updatePreviewUI('front', base64Image);
        state.currentCaptureMode = 'back';
        refs.captureInstruction.textContent = 'Capturar Atrás';
    } else {
        state.backImageBase64 = base64Image;
        updatePreviewUI('back', base64Image);
        state.currentCaptureMode = 'front';
        refs.captureInstruction.textContent = 'Ambos capturados';
        
        stopCamera();
        refs.cameraSection.classList.add('hidden');
        refs.previewSection.classList.remove('hidden');
        checkReadyState();
    }
}

// --- Subsistema de Edición / Recorte On-Demand ---
function openCropper(side) {
    if (side === 'front' && !state.frontImageBase64) return;
    if (side === 'back' && !state.backImageBase64) return;

    state.editingSide = side;
    const base64 = side === 'front' ? state.frontImageBase64 : state.backImageBase64;
    
    refs.previewSection.classList.add('hidden');
    refs.cropperSection.classList.remove('hidden');

    // Destruir si existía previo
    if (state.cropperInfo) {
        state.cropperInfo.destroy();
    }

    refs.cropperImage.src = base64;
    state.cropperInfo = new Cropper(refs.cropperImage, {
        viewMode: 1, 
        autoCropArea: 0.9,
        dragMode: 'move',
        background: false,
        guides: true
    });
}

function handleCropCancel() {
    if (state.cropperInfo) {
        state.cropperInfo.destroy();
        state.cropperInfo = null;
    }
    refs.cropperSection.classList.add('hidden');
    refs.previewSection.classList.remove('hidden');
}

function handleCropConfirm() {
    if (!state.cropperInfo) return;

    const croppedCanvas = state.cropperInfo.getCroppedCanvas({
        width: 1500, // Limitar un poco para que el PDF no pese 10MB
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    const croppedBase64 = croppedCanvas.toDataURL('image/jpeg', 0.95);

    state.cropperInfo.destroy();
    state.cropperInfo = null;

    if (state.editingSide === 'front') {
        state.frontImageBase64 = croppedBase64;
        updatePreviewUI('front', croppedBase64);
    } else {
        state.backImageBase64 = croppedBase64;
        updatePreviewUI('back', croppedBase64);
    }

    refs.cropperSection.classList.add('hidden');
    refs.previewSection.classList.remove('hidden');
    checkReadyState();
}

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
    refs.captureInstruction.textContent = side === 'front' ? 'Capturar Adelante' : 'Capturar Atrás';
    
    // Ocultar sección preview
    refs.previewSection.classList.add('hidden');
    
    // Iniciar cámara de nuevo
    initCamera();
}

function checkReadyState() {
    const isReady = state.frontImageBase64 && state.backImageBase64;
    refs.generatePdfBtn.disabled = !isReady;
    
    refs.sharePdfBtn.disabled = !(isReady && (navigator.canShare || window.navigator.share));
}

// --- Subsistema de PDF y Compartir ---
async function generatePDFBlob() {
    const { jsPDF } = window.jspdf;
    
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    // Un DNI estándar mide aproximadamente 85.6 mm x 54 mm.
    // Al 150% de tamaño, el ancho es 85.6 * 1.5 = 128.4 mm.
    const pdfPageWidth = doc.internal.pageSize.getWidth();
    const desiredWidth = 128.4; 
    
    // Al estar forzado el ratio a 1.58, calculamos altura exacta sin deformar
    const desiredHeight = desiredWidth / 1.58; 

    // Centrar horizontalmente en la página A4
    const marginX = (pdfPageWidth - desiredWidth) / 2;
    let startY = 20; // Margen superior

    // Función auxiliar para forzar tamaño
    if(state.frontImageBase64) {
        doc.addImage(state.frontImageBase64, 'JPEG', marginX, startY, desiredWidth, desiredHeight);
        startY += desiredHeight + 15; // Dejar espacio para la siguiente tarjeta
    }
    
    if(state.backImageBase64) {
        doc.addImage(state.backImageBase64, 'JPEG', marginX, startY, desiredWidth, desiredHeight);
    }

    return doc.output('blob');
}

async function handlePdfAction(action) {
    try {
        const title = refs.fileNameInput.value.trim() || 'Documento_Escaneado';
        const filename = `${title.replace(/\s+/g, '_')}.pdf`;

        const oldShareText = refs.sharePdfBtn.textContent;
        refs.sharePdfBtn.textContent = 'Procesando...';
        refs.sharePdfBtn.disabled = true;

        const pdfBlob = await generatePDFBlob();

        if (action === 'download') {
            downloadBlob(pdfBlob, filename);
        } else if (action === 'share') {
            await shareBlob(pdfBlob, filename, title);
        }

        refs.sharePdfBtn.textContent = oldShareText;
        refs.sharePdfBtn.disabled = false;

    } catch(err) {
        console.error("Error procesando PDF:", err);
        showError("Ocurrió un error al generar el documento PDF.");
        refs.sharePdfBtn.disabled = false;
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
            await navigator.share({
                title: title,
                text: 'PDF Generado desde la aplicación.',
                files: [file]
            });
        } catch (error) {
            console.error('Error al compartir:', error);
            if (error.name !== 'AbortError') {
                showError("No se pudo completar la acción de compartir.");
            }
        }
    } else {
        showError("API de compartir no nativa en tu dispositivo. Descargando localmente...");
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
