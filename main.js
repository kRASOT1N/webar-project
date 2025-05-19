class WebARApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.loading = document.getElementById('loading');
        this.message = document.getElementById('message');
        this.controls = document.getElementById('controls');
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 2); // ближе к центру
        this.camera.lookAt(0, 0, 0);
        // Добавляем свет
        const light = new THREE.AmbientLight(0xffffff, 1);
        this.scene.add(light);
        this.renderer = new THREE.WebGLRenderer({ alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        
        this.models = [];
        this.modelPositions = [];
        this.modelIdCounter = 0;
        this.lastQR = null;
        this.longPressTimer = null;
        this.isDragging = false;
        this.qrCenter = null;
        this.qrVisibleFrames = 0;
        this.qrLostFrames = 0;
        this.qrStableThreshold = 2; // сколько кадров подряд QR должен быть виден
        this.qrLostThreshold = 2; // сколько кадров подряд QR должен быть не виден, чтобы убрать модель
        this.modelDetached = false;
        this.buttons = {
            email: null,
            site: null
        };
        
        this.init();
    }
    
    async init() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            this.video.srcObject = stream;
            // Ждем, пока видео получит размеры
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
            };
            await this.video.play();
            // На всякий случай задаем размеры canvas
            this.canvas.width = this.video.videoWidth || 640;
            this.canvas.height = this.video.videoHeight || 480;
            this.loading.style.display = 'none';
            this.startQRDetection();
            this.animate();
            
            // Обработчики событий
            this.setupEventListeners();
        } catch (error) {
            console.error('Ошибка при инициализации камеры:', error);
            this.message.textContent = 'Ошибка доступа к камере: ' + error.message;
        }
    }
    
    setupEventListeners() {
        // Открепление модели долгим нажатием
        this.renderer.domElement.addEventListener('touchstart', (e) => {
            this.longPressTimer = setTimeout(() => {
                if (this.models.length > 0 && !this.modelDetached) {
                    this.modelDetached = true;
                    this.message.textContent = 'Модель откреплена';
                }
            }, 800);
        });
        
        this.renderer.domElement.addEventListener('touchend', () => {
            clearTimeout(this.longPressTimer);
        });
        
        // Кнопки вращения
        document.getElementById('rotateLeft').addEventListener('click', () => this.rotateActiveModel(-Math.PI / 4));
        document.getElementById('rotateRight').addEventListener('click', () => this.rotateActiveModel(Math.PI / 4));
        
        // Обработка изменения размера окна
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    startQRDetection() {
        setInterval(() => {
            if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;
            if (this.canvas.width !== this.video.videoWidth || this.canvas.height !== this.video.videoHeight) {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
            }
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            let code = null;
            try {
                code = jsQR(imageData.data, imageData.width, imageData.height);
            } catch (e) {
                this.message.textContent = 'Ошибка jsQR: ' + e.message;
                return;
            }
            if (code) {
                // Центр QR
                const qrCenter = {
                    x: (code.location.topLeftCorner.x + code.location.topRightCorner.x + code.location.bottomLeftCorner.x + code.location.bottomRightCorner.x) / 4,
                    y: (code.location.topLeftCorner.y + code.location.topRightCorner.y + code.location.bottomLeftCorner.y + code.location.bottomRightCorner.y) / 4
                };
                // Проверяем, не добавляли ли мы уже модель на этот QR (по содержимому)
                if (this.lastQR !== code.data) {
                    this.lastQR = code.data;
                    this.addModelAt(qrCenter);
                }
            }
        }, 250);
    }
    
    async addModelAt(qrCenter) {
        const modelId = 'model';
        try {
            const loader = new THREE.GLTFLoader();
            console.log('Пытаюсь загрузить модель:', `models/${modelId}.glb`);
            loader.load(
                `models/${modelId}.glb`,
                (gltf) => {
                    const model = gltf.scene;
                    model.scale.set(1, 1, 1); // увеличиваем масштаб для теста
                    // Позиционируем модель по центру QR
                    const worldPosition = new THREE.Vector3(
                        (qrCenter.x / this.canvas.width) * 2 - 1,
                        -(qrCenter.y / this.canvas.height) * 2 + 1,
                        -1
                    );
                    worldPosition.unproject(this.camera);
                    model.position.copy(worldPosition);
                    model.lookAt(this.camera.position);
                    model.rotation.x = -Math.PI / 6;
                    this.scene.add(model);
                    this.models.push(model);
                    this.modelPositions.push(qrCenter);
                    this.message.textContent = 'Модель добавлена';
                    console.log('Модель успешно добавлена в сцену');
                },
                undefined,
                (error) => {
                    this.message.textContent = 'Ошибка загрузки модели: ' + error.message;
                    console.error('Ошибка загрузки модели:', error);
                }
            );
        } catch (error) {
            this.message.textContent = 'Ошибка загрузки модели: ' + error.message;
            console.error('Ошибка загрузки модели:', error);
        }
    }
    
    rotateActiveModel(angle) {
        if (this.models.length > 0) {
            // Вращаем последнюю добавленную модель
            this.models[this.models.length - 1].rotation.y += angle;
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }
}

// Запуск приложения
window.addEventListener('load', () => {
    new WebARApp();
}); 