
        let zxing = null;
        ZXing().then(function (instance) {
            zxing = instance;
        });


        const modalConnectButton = document.getElementById('qr-code-scanner');
        const modalConnectSettings = document.getElementById('modal-connect-share');
        const closeModalConnectButton = document.getElementById('delete-button-modal');
        const resultContainer = document.getElementById('qr-result');
        const qrScannerDiv = document.getElementById('qrScannerDiv');
        const connectButton = document.getElementById('connect-button');
        const connectionCodeInput = document.getElementById('connection-code');


        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        canvas.id = 'qr-canvas';
        canvas.className = 'w-full h-auto rounded-lg';
        qrScannerDiv.appendChild(canvas);

        const video = document.createElement('video');
        video.width = 640;
        video.height = 480;
        video.autoplay = true;
        video.setAttribute('playsinline', true);

        let scanning = false;
        let stream = null;






        async function startQRCodeScanner() {
            if (!zxing) {
                console.warn("ZXing WASM not yet initialized, waiting...");
                setTimeout(startQRCodeScanner, 500);
                return;
            }

            try {

                const constraints = {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    },
                    audio: false
                };

                stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = stream;

 
                const videoTrack = stream.getVideoTracks()[0];


                const scanningIndicator = document.createElement('div');
                scanningIndicator.className = 'text-center py-2 bg-gray-200 rounded mb-2';
                scanningIndicator.innerHTML = '<i class="fas fa-camera text-gray-600 mr-2"></i> Scanning for QR code...';
                qrScannerDiv.insertBefore(scanningIndicator, canvas);


                const enhanceIndicator = document.createElement('div');
                enhanceIndicator.className = 'text-center py-1 text-xs text-gray-600 mb-2';
                enhanceIndicator.innerHTML = 'Auto-magnification active';
                qrScannerDiv.insertBefore(enhanceIndicator, canvas);


                let scanAttempts = 0;
                let partialDetectionCount = 0;
                let currentMagnification = 1.0;
                const maxMagnification = 2.0;


                video.onloadedmetadata = () => {

                    const settings = videoTrack.getSettings();


                    const videoAspectRatio = settings.width / settings.height;


                    const containerWidth = qrScannerDiv.clientWidth;
                    let canvasWidth = containerWidth;
                    let canvasHeight = containerWidth / videoAspectRatio;


                    canvas.width = canvasWidth;
                    canvas.height = canvasHeight;

                    video.play();
                    scanning = true;
                    processFrame();
                };

                const ctx = canvas.getContext('2d', { willReadFrequently: true });

                function processFrame() {
                    if (!scanning) return;

                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    const centerX = video.videoWidth / 2;
                    const centerY = video.videoHeight / 2;
                    const scaledWidth = video.videoWidth / currentMagnification;
                    const scaledHeight = video.videoHeight / currentMagnification;


                    ctx.drawImage(
                        video,
                        centerX - (scaledWidth / 2),
                        centerY - (scaledHeight / 2),
                        scaledWidth,
                        scaledHeight,
                        0, 0, canvas.width, canvas.height
                    );


                    drawTargetingGuide(ctx, canvas.width, canvas.height);


                    const code = readQRcodeFromCanvas(canvas);
                    scanAttempts++;

                    if (code.format) {

                        const sanitizedData = escapeTags(code.text);
                        resultContainer.textContent = sanitizedData;
                        connectionCodeInput.value = sanitizedData;
                        drawResult(ctx, code);
                        stopScanning();
                        connectButton.disabled = false;
                    } else {
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const hasPartialQR = detectPartialQRPatterns(imageData);

                        if (hasPartialQR) {
                            partialDetectionCount++;

                            // If we consistently detect partial QR patterns, increase magnification
                            if (partialDetectionCount >= 5 && currentMagnification < maxMagnification) {
                                currentMagnification = Math.min(maxMagnification, currentMagnification + 0.1);
                                enhanceIndicator.innerHTML = `Auto-magnification: ${Math.round((currentMagnification - 1) * 100)}%`;
                                partialDetectionCount = 0;
                            }
                        } else {
                            // Occasionally reduce magnification if nothing is detected for a while
                            if (scanAttempts % 30 === 0 && currentMagnification > 1.0) {
                                currentMagnification = Math.max(1.0, currentMagnification - 0.05);
                                enhanceIndicator.innerHTML = `Auto-magnification: ${Math.round((currentMagnification - 1) * 100)}%`;
                            }
                        }

                        requestAnimationFrame(processFrame);
                    }
                }

                function detectPartialQRPatterns(imageData) {
                    const data = imageData.data;
                    const width = imageData.width;
                    const height = imageData.height;
                    let patternCount = 0;


                    const sampleSize = 20;
                    for (let y = sampleSize; y < height - sampleSize; y += sampleSize) {
                        for (let x = sampleSize; x < width - sampleSize; x += sampleSize) {
                            const centerIndex = (y * width + x) * 4;
                            const centerValue = data[centerIndex];


                            let transitions = 0;
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    if (dx === 0 && dy === 0) continue;

                                    const nx = x + dx * sampleSize;
                                    const ny = y + dy * sampleSize;
                                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                        const neighborIndex = (ny * width + nx) * 4;
                                        const neighborValue = data[neighborIndex];

                                        if (Math.abs(centerValue - neighborValue) > 50) {
                                            transitions++;
                                        }
                                    }
                                }
                            }
                            if (transitions >= 4) {
                                patternCount++;
                            }
                        }
                    }

                    return patternCount >= 3;
                }

                function drawTargetingGuide(ctx, width, height) {
                    const centerX = width / 2;
                    const centerY = height / 2;
                    const size = Math.min(width, height) * 0.7;

                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 2;


                    const cornerSize = size * 0.1;

                    ctx.beginPath();
                    ctx.moveTo(centerX - size / 2, centerY - size / 2 + cornerSize);
                    ctx.lineTo(centerX - size / 2, centerY - size / 2);
                    ctx.lineTo(centerX - size / 2 + cornerSize, centerY - size / 2);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(centerX + size / 2 - cornerSize, centerY - size / 2);
                    ctx.lineTo(centerX + size / 2, centerY - size / 2);
                    ctx.lineTo(centerX + size / 2, centerY - size / 2 + cornerSize);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(centerX - size / 2, centerY + size / 2 - cornerSize);
                    ctx.lineTo(centerX - size / 2, centerY + size / 2);
                    ctx.lineTo(centerX - size / 2 + cornerSize, centerY + size / 2);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(centerX + size / 2 - cornerSize, centerY + size / 2);
                    ctx.lineTo(centerX + size / 2, centerY + size / 2);
                    ctx.lineTo(centerX + size / 2, centerY + size / 2 - cornerSize);
                    ctx.stroke();
                }

            } catch (error) {
                console.error('Camera access issue:', error);
                const errorMessage = document.createElement('div');
                errorMessage.className = 'p-4 bg-red-100 text-red-700 rounded-lg';
                errorMessage.innerHTML = `
            <p class="font-bold mb-2">Camera access error</p>
            <p>Please ensure your browser has permission to access the camera and try again.</p>
            <p class="text-sm mt-2">Tip: Try using Chrome or Safari on your mobile device for best results.</p>
        `;
                qrScannerDiv.appendChild(errorMessage);
            }
        }

        function stopScanning() {
            scanning = false;
            stopCamera();
            qrScannerDiv.classList.add('hidden');

            const indicators = qrScannerDiv.querySelectorAll('div:not(#qr-canvas)');
            indicators.forEach(indicator => indicator.remove());
        }

        function stopCamera() {
            if (stream) {
                const tracks = stream.getTracks();
                tracks.forEach(track => track.stop());
                video.srcObject = null;
                stream = null;
            }
        }



        function readQRcodeFromCanvas(canvas) {
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const imageData = canvas.getContext('2d').getImageData(0, 0, imgWidth, imgHeight);
            const sourceBuffer = imageData.data;

            if (zxing != null) {
                const buffer = zxing._malloc(sourceBuffer.byteLength);
                zxing.HEAPU8.set(sourceBuffer, buffer);
                const result = zxing.readBarcodeFromPixmap(buffer, imgWidth, imgHeight, true, "QRCode");
                zxing._free(buffer);
                return result;
            } else {
                return { error: "ZXing not yet initialized" };
            }
        }

        function drawResult(ctx, code) {
            if (!code.position) return;

            ctx.beginPath();
            ctx.lineWidth = 4;
            ctx.strokeStyle = "red";

            with (code.position) {
                ctx.moveTo(topLeft.x, topLeft.y);
                ctx.lineTo(topRight.x, topRight.y);
                ctx.lineTo(bottomRight.x, bottomRight.y);
                ctx.lineTo(bottomLeft.x, bottomLeft.y);
                ctx.lineTo(topLeft.x, topLeft.y);
            }

            ctx.stroke();
        }

        function escapeTags(htmlStr) {
            return htmlStr.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }




        modalConnectButton.addEventListener('click', () => {
            modalConnectSettings.classList.remove('hidden');
            startQRCodeScanner();
            qrScannerDiv.classList.remove('hidden');
        });

        closeModalConnectButton.addEventListener('click', () => {
            modalConnectSettings.classList.add('hidden');
            stopScanning();
        });

        document.getElementById('close-modal-button').addEventListener('click', () => {
            stopScanning();
            modalConnectSettings.classList.add('hidden');
        });

        connectionCodeInput.addEventListener('input', () => {
            connectButton.disabled = !connectionCodeInput.value.trim();
        });


        function validateShareLink(url) {
            if (!url.startsWith('https://mytextwriter.com/portal/')) {
                alert("Invalid link. Link must start with https://mytextwriter.com/portal/");
                return false;
            }

            try {
                const parsedUrl = new URL(url);

                if (parsedUrl.protocol !== 'https:') {
                    console.log("Invalid URL protocol. Only https:// is allowed.");
                    return false;
                }

                const harmfulPatterns = [
                    /javascript:/i,
                    /<script>/i,
                    /onerror=/i,
                    /<iframe>/i,
                    /<img/i,
                ];

                for (let pattern of harmfulPatterns) {
                    if (pattern.test(url)) {
                        return false;
                    }
                }

                return true;
            } catch (error) {
                console.log("Invalid URL format.");
                return false;
            }
        }

        connectButton.addEventListener('click', () => {
            const connectionCode = connectionCodeInput.value.trim();

            if (!connectionCode) {
                alert("Please enter the access key link.");
                return;
            }

            const formnedUrlShared = connectionCode;
            if (validateShareLink(formnedUrlShared)) {
                window.location.href = formnedUrlShared;
            } else {
                console.log("Invalid or unsafe URL.");
            }
        });

        document.addEventListener('DOMContentLoaded', function () {
            const generateLinkButton = document.getElementById('generate-link-btn');
            function generateLink() {
                window.location.href = '/starter';
            }
            generateLinkButton.addEventListener('click', generateLink);
        });
