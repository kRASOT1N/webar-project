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
        this.qrPosition = null;
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
            await this.video.play();
            
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            this.loading.style.display = 'none';
            this.startQRDetection();
            this.animate();
            
            // Обработчики событий
            this.setupEventListeners();
        } catch (error) {
            console.error('Ошибка при инициализации камеры:', error);
            this.message.textContent = 'Ошибка доступа к камере';
        }
    }
    
    setupEventListeners() {
        // Обработка долгого нажатия
        this.renderer.domElement.addEventListener('touchstart', (e) => {
            this.longPressTimer = setTimeout(() => {
                if (this.activeModel) {
                    this.detachModel();
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
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                this.qrPosition = {
                    x: code.location.topLeftCorner.x,
                    y: code.location.topLeftCorner.y
                };
                this.handleQRCode(code.data);
            } else {
                this.qrPosition = null;
            }
        }, 100);
    }
    
    async handleQRCode(data) {
        if (!this.models.has(data)) {
            try {
                const model = await this.loadModel(data);
                this.models.set(data, model);
                
                // Создаем кнопки под моделью
                this.createButtons(model);
            } catch (error) {
                console.error('Ошибка загрузки модели:', error);
                return;
            }
        }
        
        this.activeModel = this.models.get(data);
        this.controls.style.display = 'flex';
    }
    
    async loadModel(modelId) {
        const loader = new THREE.GLTFLoader();
        return new Promise((resolve, reject) => {
            loader.load(
                `models/${modelId}.glb`,
                (gltf) => {
                    const model = gltf.scene;
                    model.scale.set(0.1, 0.1, 0.1);
                    this.scene.add(model);
                    resolve(model);
                },
                undefined,
                reject
            );
        });
    }
    
    detachModel() {
        if (this.activeModel) {
            this.activeModel.userData.detached = true;
            this.activeModel = null;
            this.controls.style.display = 'none';
        }
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
        const emailTexture = new THREE.TextureLoader().load('assets/email.png');
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
        
        // Обновление позиции активной модели
        if (this.activeModel && !this.activeModel.userData.detached) {
            if (this.qrPosition) {
                // Преобразуем координаты QR-кода в мировые координаты
                const worldPosition = new THREE.Vector3(
                    (this.qrPosition.x / this.canvas.width) * 2 - 1,
                    -(this.qrPosition.y / this.canvas.height) * 2 + 1,
                    -1
                );
                
                // Преобразуем в мировые координаты
                worldPosition.unproject(this.camera);
                
                // Устанавливаем позицию модели
                this.activeModel.position.copy(worldPosition);
                
                // Поворачиваем модель к камере
                this.activeModel.lookAt(this.camera.position);
                
                // Наклоняем модель немного вверх
                this.activeModel.rotation.x = -Math.PI / 6;
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Запуск приложения
window.addEventListener('load', () => {
    new WebARApp();
}); 