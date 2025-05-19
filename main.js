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
        this.camera.position.set(0, 1.6, 3); // Позиция как если бы камера была на уровне глаз
        this.camera.lookAt(0, 0, 0);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
        
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0); // прозрачный фон
        document.body.appendChild(this.renderer.domElement);
        
        this.models = [];
        this.qrDetected = false;
        this.lastProcessedQR = null;
        
        this.raycaster = new THREE.Raycaster();
        
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        
        this.init();
    }
    
    async init() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            this.video.srcObject = stream;
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
            };
            await this.video.play();
            this.canvas.width = this.video.videoWidth || 640;
            this.canvas.height = this.video.videoHeight || 480;
            
            this.loading.style.display = 'none';
            this.message.textContent = 'Наведи на QR';
            
            this.addDebugObjects();
            
            this.startQRDetection();
            this.animate();
            this.setupEventListeners();
        } catch (error) {
            this.message.textContent = 'Ошибка доступа к камере: ' + error.message;
            console.error('Ошибка при инициализации камеры:', error);
        }
    }
    
    addDebugObjects() {
        const gridHelper = new THREE.GridHelper(10, 10, 0xff0000, 0xffffff);
        gridHelper.position.set(0, -0.5, 0);
        this.scene.add(gridHelper);
        
        const testCube = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.5),
            new THREE.MeshStandardMaterial({ color: 0xff0000 })
        );
        testCube.position.set(0, 0, -2);
        this.scene.add(testCube);
        console.log('Тестовые объекты добавлены для отладки');
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        document.getElementById('rotateLeft').addEventListener('click', () => {
            if (this.models.length > 0) {
                this.models[this.models.length - 1].rotation.y += Math.PI / 4;
            }
        });
        
        document.getElementById('rotateRight').addEventListener('click', () => {
            if (this.models.length > 0) {
                this.models[this.models.length - 1].rotation.y -= Math.PI / 4;
            }
        });
    }
    
    startQRDetection() {
        setInterval(() => {
            if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;
            
            if (this.canvas.width !== this.video.videoWidth || 
                this.canvas.height !== this.video.videoHeight) {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
            }
            
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            
            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                
                if (code) {
                    this.qrDetected = true;
                    
                    const centerX = (code.location.topLeftCorner.x + 
                                    code.location.topRightCorner.x + 
                                    code.location.bottomLeftCorner.x + 
                                    code.location.bottomRightCorner.x) / 4;
                    
                    const centerY = (code.location.topLeftCorner.y + 
                                    code.location.topRightCorner.y + 
                                    code.location.bottomLeftCorner.y + 
                                    code.location.bottomRightCorner.y) / 4;
                    
                    if (this.lastProcessedQR !== code.data) {
                        this.lastProcessedQR = code.data;
                        console.log('QR-код обнаружен:', code.data);
                        this.message.textContent = 'QR найден: ' + code.data;
                        
                        this.placeModelAtScreenPosition(centerX, centerY);
                    }
                } else {
                    if (this.qrDetected) {
                        this.message.textContent = 'Наведи на QR';
                        this.qrDetected = false;
                    }
                }
            } catch (e) {
                console.error('Ошибка при обработке изображения:', e);
                this.message.textContent = 'Ошибка: ' + e.message;
            }
        }, 200);
    }
    
    placeModelAtScreenPosition(screenX, screenY) {
        console.log('Размещаем модель по координатам экрана:', screenX, screenY);
        
        const normalizedX = (screenX / this.canvas.width) * 2 - 1;
        const normalizedY = -(screenY / this.canvas.height) * 2 + 1;
        
        console.log('Нормализованные координаты:', normalizedX, normalizedY);
        
        this.raycaster.setFromCamera(
            new THREE.Vector2(normalizedX, normalizedY), 
            this.camera
        );
        
        const intersectPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint);
        
        console.log('Точка пересечения с плоскостью:', intersectPoint);
        
        if (!intersectPoint.x && !intersectPoint.y && !intersectPoint.z) {
            intersectPoint.set(0, 0, -2);
            console.log('Точка пересечения не найдена, используем позицию по умолчанию');
        }
        
        this.loadModelAtPosition(intersectPoint);
    }
    
    loadModelAtPosition(position) {
        console.log('Загружаем модель в позиции:', position);
        
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00,
            metalness: 0.5,
            roughness: 0.5
        });
        
        const model = new THREE.Mesh(geometry, material);
        model.position.copy(position);
        
        model.position.y += 0.25;
        
        this.scene.add(model);
        this.models.push(model);
        
        console.log('Модель добавлена в сцену:', model);
        this.message.textContent = 'Модель добавлена';
        
        this.loadGLBModel(position);
    }
    
    async loadGLBModel(position) {
        try {
            const loader = new THREE.GLTFLoader();
            loader.load(
                'models/model.glb',
                (gltf) => {
                    console.log('GLB модель успешно загружена:', gltf);
                    
                    const model = gltf.scene;
                    model.position.copy(position);
                    
                    model.scale.set(1, 1, 1);
                    
                    model.position.y += 0.25;
                    
                    this.scene.add(model);
                    this.models.push(model);
                    
                    console.log('GLB модель добавлена в сцену');
                    this.message.textContent = 'GLB модель добавлена';
                },
                (progress) => {
                    console.log('Загрузка модели:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Ошибка загрузки GLB модели:', error);
                    this.message.textContent = 'Ошибка загрузки модели: ' + error.message;
                }
            );
        } catch (error) {
            console.error('Ошибка при загрузке модели:', error);
            this.message.textContent = 'Ошибка: ' + error.message;
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.models.forEach(model => {
            model.rotation.y += 0.01;
        });
        
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => {
    console.log('Страница загружена, инициализируем приложение');
    new WebARApp();
}); 