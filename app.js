// --- Estado de la App ---
const state = {
    frontImageBase64: null,
    backImageBase64: null,
    currentCaptureMode: 'front', // 'front' o 'back'
    stream: null
};

// --- Elementos del DOM ---
const refs = {
    video: document.getElementById('cameraStream'),
    canvas: document.getElementById('captureCanvas'),
    captureBtn: document.getElementById('captureBtn'),
    captureInstruction: document.getElementById('captureInstruction'),
    cameraSection: document.getElementById('cameraSection'),
    previewSection: document.getElementById('previewSection'),
    
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

function bindEvents() {
    refs.captureBtn.addEventListener('click', handleCapture);
    refs.retakeFrontBtn.addEventListener('click', () => retakePhoto('front'));
    refs.retakeBackBtn.addEventListener('click', () => retakePhoto('back'));
    refs.generatePdfBtn.addEventListener('click', () => handlePdfAction('download'));
    refs.sharePdfBtn.addEventListener('click', () => handlePdfAction('share'));
    refs.closeModalBtn.addEventListener('click', hideError);
}

// --- Subsistema de Cámara ---
async function initCamera() {
    try {
        if (refs.stream) {
            stopCamera();
        }
        
        // Solicitar cámara trasera por defecto
        const constraints = {
            video: {
                facingMode: 'environment', // Trasera
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };
        
        refs.stream = await navigator.mediaDevices.getUserMedia(constraints);
        refs.video.srcObject = refs.stream;

        // Reproducir video cuando esté cargado
        refs.video.onloadedmetadata = () => {
            refs.video.play();
        };
        
        refs.cameraSection.classList.remove('hidden');
    } catch (err) {
        console.error("Error accediendo a la cámara:", err);
        showError("No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios o de servir la página en HTTPS/localhost.");
    }
}

function stopCamera() {
    if (refs.stream) {
        refs.stream.getTracks().forEach(track => track.stop());
        refs.stream = null;
    }
}

// --- Subsistema de Captura ---
function handleCapture() {
    if (!refs.video.videoWidth) return;

    // Ajustar canvas al tamaño del video
    const width = refs.video.videoWidth;
    const height = refs.video.videoHeight;
    refs.canvas.width = width;
    refs.canvas.height = height;
    
    const ctx = refs.canvas.getContext('2d');
    ctx.drawImage(refs.video, 0, 0, width, height);
    
    // Obtener imagen en base64 (JPEG, calidad 0.85)
    const base64Image = refs.canvas.toDataURL('image/jpeg', 0.85);

    if (state.currentCaptureMode === 'front') {
        state.frontImageBase64 = base64Image;
        updatePreviewUI('front', base64Image);
        state.currentCaptureMode = 'back';
        refs.captureInstruction.textContent = 'Capturar Reverso';
    } else {
        state.backImageBase64 = base64Image;
        updatePreviewUI('back', base64Image);
        state.currentCaptureMode = 'front';
        refs.captureInstruction.textContent = 'Ambos lados capturados';
        
        // Transición a vista previa
        stopCamera();
        refs.cameraSection.classList.add('hidden');
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
    refs.captureInstruction.textContent = `Capturar ${side === 'front' ? 'Anverso' : 'Reverso'}`;
    
    // Limpiar UI visual
    const imgEl = side === 'front' ? refs.frontImage : refs.backImage;
    const placeholderEl = side === 'front' ? refs.frontPlaceholder : refs.backPlaceholder;
    const retakeBtnEl = side === 'front' ? refs.retakeFrontBtn : refs.retakeBackBtn;
    
    imgEl.classList.add('hidden');
    imgEl.src = "";
    placeholderEl.classList.add('active');
    retakeBtnEl.classList.add('hidden');

    if (side === 'front') state.frontImageBase64 = null;
    if (side === 'back') state.backImageBase64 = null;

    checkReadyState();

    // Volver a iniciar la cámara si estábamos en preview
    if (refs.cameraSection.classList.contains('hidden')) {
        refs.previewSection.classList.add('hidden');
        initCamera();
    }
}

function checkReadyState() {
    const isReady = state.frontImageBase64 && state.backImageBase64;
    refs.generatePdfBtn.disabled = !isReady;
    
    // Habilitar shareSolo si el navegador lo soporta y estamos listos
    refs.sharePdfBtn.disabled = !(isReady && (navigator.canShare || window.navigator.share));
}

// --- Subsistema de PDF y Compartir ---
async function generatePDFBlob() {
    const { jsPDF } = window.jspdf;
    // Formato A4, unidad en mm
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pdfWidth = doc.internal.pageSize.getWidth();
    // Dimensiones proporcionales para una tarjeta (ej. 8.5cm x 5.4cm -> aprox 1.58 ratio)
    const margin = 20;
    const imgWidth = pdfWidth - (margin * 2);
    const imgHeight = imgWidth / 1.58;

    // Añadir anverso
    if(state.frontImageBase64) {
        doc.addImage(state.frontImageBase64, 'JPEG', margin, margin, imgWidth, imgHeight);
    }
    
    // Añadir reverso debajo
    if(state.backImageBase64) {
        doc.addImage(state.backImageBase64, 'JPEG', margin, margin + imgHeight + 15, imgWidth, imgHeight);
    }

    return doc.output('blob');
}

async function handlePdfAction(action) {
    try {
        const title = refs.fileNameInput.value.trim() || 'Documento_Escaneado';
        const filename = `${title.replace(/\s+/g, '_')}.pdf`;

        // Modificar botones para mostrar carga (opcional)
        const oldShareText = refs.sharePdfBtn.textContent;
        refs.sharePdfBtn.textContent = 'Procesando...';

        const pdfBlob = await generatePDFBlob();

        if (action === 'download') {
            downloadBlob(pdfBlob, filename);
        } else if (action === 'share') {
            await shareBlob(pdfBlob, filename, title);
        }

        refs.sharePdfBtn.textContent = oldShareText;

    } catch(err) {
        console.error("Error procesando PDF:", err);
        showError("Ocurrió un error al generar el documento PDF.");
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
                text: 'Aquí tienes el documento escaneado.',
                files: [file]
            });
        } catch (error) {
            console.error('Error al compartir:', error);
            // Ignorar errores abortados (cuando el usuario cierra el modal de compartir)
            if (error.name !== 'AbortError') {
                showError("No se pudo completar la acción de compartir.");
            }
        }
    } else {
        showError("Tu navegador no soporta la API de compartir archivos.");
        // Fallback a descarga
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
