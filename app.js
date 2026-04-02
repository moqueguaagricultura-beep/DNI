// --- Estado de la App ---
const state = {
    frontImageBase64: null,
    backImageBase64: null,
    currentCaptureMode: 'front', // 'front' (Adelante) o 'back' (Atrás)
    stream: null,
    cropperInfo: null // Guardará la ref a la instancia de cropper
};

// --- Elementos del DOM ---
const refs = {
    video: document.getElementById('cameraStream'),
    canvas: document.getElementById('captureCanvas'),
    captureBtn: document.getElementById('captureBtn'),
    captureInstruction: document.getElementById('captureInstruction'),
    
    cameraSection: document.getElementById('cameraSection'),
    cropperSection: document.getElementById('cropperSection'),
    previewSection: document.getElementById('previewSection'),
    
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
    resetAppBtn: document.getElementById('resetAppBtn'),
    
    errorModal: document.getElementById('errorModal'),
    errorMessage: document.getElementById('errorMessage'),
    closeModalBtn: document.getElementById('closeModalBtn')
};

// --- Sonido de Cámara (Sintetizador Web) ---
function playShutterSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        // Oscilador 1: Click agudo
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(800, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);
        gain1.gain.setValueAtTime(1, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.05);

        // Oscilador 2: Ruido mecánico grave
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(200, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
        gain2.gain.setValueAtTime(0.5, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.1);
    } catch(e) {
        console.log("No se pudo reproducir el sonido (quizás falta interacción del usuario primero)", e);
    }
}

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    bindEvents();
});

function bindEvents() {
    refs.captureBtn.addEventListener('click', handleCaptureClick);
    
    refs.confirmCropBtn.addEventListener('click', handleCropConfirm);
    refs.cancelCropBtn.addEventListener('click', handleCropCancel);
    
    refs.retakeFrontBtn.addEventListener('click', () => retakePhoto('front'));
    refs.retakeBackBtn.addEventListener('click', () => retakePhoto('back'));
    
    refs.generatePdfBtn.addEventListener('click', () => handlePdfAction('download'));
    refs.sharePdfBtn.addEventListener('click', () => handlePdfAction('share'));
    refs.resetAppBtn.addEventListener('click', resetApp);
    
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
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };
        
        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        refs.video.srcObject = state.stream;

        refs.video.onloadedmetadata = () => {
            refs.video.play();
        };
        
        refs.cameraSection.classList.remove('hidden');
        refs.cropperSection.classList.add('hidden');
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
function handleCaptureClick() {
    if (!refs.video.videoWidth) return;

    // 1. Sonido
    playShutterSound();

    // 2. Extraer fotograma
    const width = refs.video.videoWidth;
    const height = refs.video.videoHeight;
    refs.canvas.width = width;
    refs.canvas.height = height;
    
    const ctx = refs.canvas.getContext('2d');
    ctx.drawImage(refs.video, 0, 0, width, height);
    
    const base64RawImage = refs.canvas.toDataURL('image/jpeg', 0.9);

    // 3. Pausar y ocultar cámara, mostrar Cropper
    refs.video.pause();
    refs.cameraSection.classList.add('hidden');
    refs.cropperSection.classList.remove('hidden');

    initCropper(base64RawImage);
}

function initCropper(imageSrc) {
    // Si ya había uno, lo destruimos
    if (state.cropperInfo) {
        state.cropperInfo.destroy();
    }

    refs.cropperImage.src = imageSrc;
    
    state.cropperInfo = new Cropper(refs.cropperImage, {
        aspectRatio: 1.58, // Proporción natural aproximada de un DNI/Tarjeta
        viewMode: 1, // Evitar que el cuadro salga de los límites de la foto
        autoCropArea: 0.8,
        dragMode: 'move', // Permite mover la imagen
        guides: true,
        background: false
    });
}

function handleCropCancel() {
    // Ocultar cropper y volver a cámara (cancelar foto actual)
    if (state.cropperInfo) {
        state.cropperInfo.destroy();
        state.cropperInfo = null;
    }
    refs.cropperSection.classList.add('hidden');
    
    if (!state.frontImageBase64 || !state.backImageBase64) {
        initCamera(); // Asegurar que arranque de nuevo si no completamos
    } else {
        // Estábamos re-tomando y cancelamos, regresamos a preview
        refs.previewSection.classList.remove('hidden');
    }
}

function handleCropConfirm() {
    if (!state.cropperInfo) return;

    // Obtener la imagen ya recortada en un canvas ajustado
    const croppedCanvas = state.cropperInfo.getCroppedCanvas({
        width: 1000, // Fijar un máximo de resolución para que el PDF no pese demasiado
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    const croppedBase64 = croppedCanvas.toDataURL('image/jpeg', 0.85);

    // Limpiar 
    state.cropperInfo.destroy();
    state.cropperInfo = null;
    refs.cropperSection.classList.add('hidden');

    // Procesar estado
    if (state.currentCaptureMode === 'front') {
        state.frontImageBase64 = croppedBase64;
        updatePreviewUI('front', croppedBase64);
        state.currentCaptureMode = 'back';
        refs.captureInstruction.textContent = 'Capturar Atrás';
        
        // Volver a encender cámara para reverso
        initCamera();
    } else {
        state.backImageBase64 = croppedBase64;
        updatePreviewUI('back', croppedBase64);
        state.currentCaptureMode = 'front'; // Reset para futuro
        refs.captureInstruction.textContent = 'Todo capturado';
        
        // Transición a vista previa definitivamente
        stopCamera();
        refs.previewSection.classList.remove('hidden');
        checkReadyState();
    }
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

function resetApp() {
    // Confirmación opcional (deshabilitada para que sea más rápido)
    // if(!confirm("¿Estás seguro de borrar todo y empezar de nuevo?")) return;

    state.frontImageBase64 = null;
    state.backImageBase64 = null;
    state.currentCaptureMode = 'front';
    
    refs.frontImage.src = "";
    refs.frontImage.classList.add('hidden');
    refs.frontPlaceholder.classList.add('active');
    refs.retakeFrontBtn.classList.add('hidden');

    refs.backImage.src = "";
    refs.backImage.classList.add('hidden');
    refs.backPlaceholder.classList.add('active');
    refs.retakeBackBtn.classList.add('hidden');

    refs.captureInstruction.textContent = 'Capturar Adelante';
    refs.fileNameInput.value = 'Mi_Documento';
    
    checkReadyState();

    refs.previewSection.classList.add('hidden');
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
    
    // Al haber usado Cropper, ya tenemos una proporción fija (1.58), 
    // pero leeremos el aspecto de la imagen extraída al canvas para no fallar.
    
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pdfWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxImgWidth = pdfWidth - (margin * 2);

    // Función auxiliar para obtener dimensiones base64
    const getImageDimensions = (base64) => {
        return new Promise((resolve) => {
            const i = new Image();
            i.onload = () => resolve({ w: i.width, h: i.height });
            i.src = base64;
        });
    };

    let startY = margin;

    // Agregar adelante
    if(state.frontImageBase64) {
        const dimF = await getImageDimensions(state.frontImageBase64);
        const ratioF = dimF.w / dimF.h;
        const imgH = maxImgWidth / ratioF; // Alto relativo a la proporción real del recorte
        doc.addImage(state.frontImageBase64, 'JPEG', margin, startY, maxImgWidth, imgH);
        startY += imgH + 15; // Dejar espacio
    }
    
    // Agregar Atrás
    if(state.backImageBase64) {
        const dimB = await getImageDimensions(state.backImageBase64);
        const ratioB = dimB.w / dimB.h;
        const imgH = maxImgWidth / ratioB;
        doc.addImage(state.backImageBase64, 'JPEG', margin, startY, maxImgWidth, imgH);
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
