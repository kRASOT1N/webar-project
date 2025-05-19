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
        this.renderer = new THREE.WebGLRenderer({ alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        
        this.models = new Map();
        this.activeModel = null;
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
                if (this.activeModel && !this.modelDetached) {
                    this.modelDetached = true;
                    this.message.textContent = 'Модель откреплена';
                }
            }, 800);
        });
        
        this.renderer.domElement.addEventListener('touchend', () => {
            clearTimeout(this.longPressTimer);
        });
        
        // Кнопки вращения
        document.getElementById('rotateLeft').addEventListener('click', () => this.rotateModel(-Math.PI / 4));
        document.getElementById('rotateRight').addEventListener('click', () => this.rotateModel(Math.PI / 4));
        
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
                this.qrCenter = {
                    x: (code.location.topLeftCorner.x + code.location.topRightCorner.x + code.location.bottomLeftCorner.x + code.location.bottomRightCorner.x) / 4,
                    y: (code.location.topLeftCorner.y + code.location.topRightCorner.y + code.location.bottomLeftCorner.y + code.location.bottomRightCorner.y) / 4
                };
                this.qrVisibleFrames++;
                this.qrLostFrames = 0;
                if (!this.activeModel && this.qrVisibleFrames >= this.qrStableThreshold && !this.modelDetached) {
                    this.loadAndShowModel();
                }
            } else {
                this.qrCenter = null;
                this.qrLostFrames++;
                if (this.qrLostFrames >= this.qrLostThreshold && this.activeModel && !this.modelDetached) {
                    this.scene.remove(this.activeModel);
                    this.activeModel = null;
                    this.controls.style.display = 'none';
                }
            }
        }, 250);
    }
    
    async loadAndShowModel() {
        const modelId = 'model';
        if (!this.models.has(modelId)) {
            try {
                const model = await this.loadModel(modelId);
                this.models.set(modelId, model);
                this.createButtons(model);
            } catch (error) {
                this.message.textContent = 'Ошибка загрузки модели: ' + error.message;
                return;
            }
        }
        this.activeModel = this.models.get(modelId);
        this.modelDetached = false;
        this.scene.add(this.activeModel);
        this.controls.style.display = 'flex';
        this.message.textContent = '';
    }
    
    async loadModel(modelId) {
        const loader = new THREE.GLTFLoader();
        return new Promise((resolve, reject) => {
            loader.load(
                `models/${modelId}.glb`,
                (gltf) => {
                    const model = gltf.scene;
                    model.scale.set(0.1, 0.1, 0.1);
                    resolve(model);
                },
                undefined,
                reject
            );
        });
    }
    
    rotateModel(angle) {
        if (this.activeModel) {
            this.activeModel.rotation.y += angle;
        }
    }
    
    createButtons(model) {
        // Создаем плоскость для кнопок
        const buttonPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 0.5),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 })
        );
        
        // Создаем текстуры для кнопок
        const emailTexture = new THREE.TextureLoader().load('assets/em.png');
        const siteTexture = new THREE.TextureLoader().load('assets/site.png');
        
        // Создаем материалы для кнопок
        const emailMaterial = new THREE.MeshBasicMaterial({ map: emailTexture, transparent: true });
        const siteMaterial = new THREE.MeshBasicMaterial({ map: siteTexture, transparent: true });
        
        // Создаем меши для кнопок
        this.buttons.email = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), emailMaterial);
        this.buttons.site = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), siteMaterial);
        
        // Позиционируем кнопки
        this.buttons.email.position.set(-0.25, -0.3, 0);
        this.buttons.site.position.set(0.25, -0.3, 0);
        
        // Добавляем кнопки к модели
        model.add(this.buttons.email);
        model.add(this.buttons.site);
        
        // Добавляем обработчики кликов
        this.setupButtonInteractions();
    }
    
    setupButtonInteractions() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        this.renderer.domElement.addEventListener('click', (event) => {
            // Вычисляем позицию мыши в нормализованных координатах
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            // Обновляем рейкастер
            raycaster.setFromCamera(mouse, this.camera);
            
            // Проверяем пересечения с кнопками
            const intersects = raycaster.intersectObjects([this.buttons.email, this.buttons.site]);
            
            if (intersects.length > 0) {
                const clickedButton = intersects[0].object;
                if (clickedButton === this.buttons.email) {
                    window.location.href = 'mailto:your@email.com';
                } else if (clickedButton === this.buttons.site) {
                    window.open('https://your-site.com', '_blank');
                }
            }
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Позиционируем модель по центру QR, если она не откреплена
        if (this.activeModel && !this.modelDetached && this.qrCenter) {
            const worldPosition = new THREE.Vector3(
                (this.qrCenter.x / this.canvas.width) * 2 - 1,
                -(this.qrCenter.y / this.canvas.height) * 2 + 1,
                -1
            );
            worldPosition.unproject(this.camera);
            this.activeModel.position.copy(worldPosition);
            this.activeModel.lookAt(this.camera.position);
            this.activeModel.rotation.x = -Math.PI / 6;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Запуск приложения
window.addEventListener('load', () => {
    new WebARApp();
}); 