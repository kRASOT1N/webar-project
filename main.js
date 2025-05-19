import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/loaders/GLTFLoader.js';

class WebARApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.loading = document.getElementById('loading');
        this.message = document.getElementById('message');
        this.controls = document.getElementById('controls');
        this.info = document.getElementById('info');
        this.startCameraButton = document.getElementById('startCamera');
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 3); // Simpler camera position
        
        // Stronger lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 3.0);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
        
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0); // transparent background
        document.body.appendChild(this.renderer.domElement);
        
        // Debug indicator to show if WebGL is working
        this.debugElement = document.createElement('div');
        this.debugElement.style.position = 'fixed';
        this.debugElement.style.bottom = '10px';
        this.debugElement.style.left = '10px';
        this.debugElement.style.color = 'green';
        this.debugElement.style.zIndex = '1000';
        this.debugElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.debugElement.style.padding = '5px';
        document.body.appendChild(this.debugElement);
        
        this.models = [];
        this.qrDetected = false;
        this.lastProcessedQR = null;
        this.objectsAdded = false;
        
        this.raycaster = new THREE.Raycaster();
        
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        
        this.init();
    }
    
    async init() {
        // Добавляем обработчик для кнопки запуска камеры
        this.startCameraButton.addEventListener('click', () => {
            this.initCamera();
        });
        
        // Инициализируем ресурсы, не связанные с камерой
        this.addInitialDebugObject();
        this.setupEventListeners();
        this.animate();
        
        // Show WebGL info
        const gl = this.renderer.getContext();
        this.debugElement.textContent = `WebGL: ${gl.getParameter(gl.VERSION)}`;
        
        console.log('Инициализация завершена, ожидаем запуска камеры');
    }
    
    async initCamera() {
        try {
            console.log('Запрашиваем доступ к камере...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            
            console.log('Доступ к камере получен!');
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
            this.startQRDetection();
            
            console.log('Камера запущена, можно сканировать QR-коды');
        } catch (error) {
            console.error('Ошибка при инициализации камеры:', error);
            this.message.textContent = 'Ошибка доступа к камере: ' + error.message;
            this.loading.innerHTML = `
                <div style="color: red; font-weight: bold;">Ошибка доступа к камере!</div>
                <div style="margin-top: 10px;">${error.message}</div>
                <button id="retryCamera" style="margin-top: 20px;">Попробовать снова</button>
            `;
            
            document.getElementById('retryCamera').addEventListener('click', () => {
                this.initCamera();
            });
        }
    }
    
    addInitialDebugObject() {
        // Add a small green square in the bottom right corner to confirm rendering is working
        const geometry = new THREE.PlaneGeometry(0.2, 0.2);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(geometry, material);
        plane.position.set(0.8, -0.8, -1);
        this.scene.add(plane);
        console.log('Добавлен индикатор работы Three.js');
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
        
        // Add a manual trigger button for testing
        const testButton = document.createElement('button');
        testButton.textContent = 'Показать объекты';
        testButton.style.position = 'fixed';
        testButton.style.bottom = '70px';
        testButton.style.left = '50%';
        testButton.style.transform = 'translateX(-50%)';
        testButton.style.zIndex = '1000';
        testButton.style.padding = '10px 20px';
        document.body.appendChild(testButton);
        
        testButton.addEventListener('click', () => {
            if (!this.objectsAdded) {
                this.addVisibleObjects();
                this.objectsAdded = true;
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
                    
                    if (this.lastProcessedQR !== code.data) {
                        this.lastProcessedQR = code.data;
                        console.log('QR-код обнаружен:', code.data);
                        this.message.textContent = 'QR найден: ' + code.data;
                        
                        if (!this.objectsAdded) {
                            this.addVisibleObjects();
                            this.objectsAdded = true;
                            
                            // Show controls
                            this.controls.style.display = 'flex';
                        }
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
    
    addVisibleObjects() {
        // Clear existing models
        this.models.forEach(model => {
            this.scene.remove(model);
        });
        this.models = [];
        
        // Set of highly visible objects using BasicMaterial (not affected by lighting)
        
        // Large red cube
        const cubeGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const cubeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const cube = new THREE.Mesh(cubeGeo, cubeMat);
        cube.position.set(0, 0, -2);
        this.scene.add(cube);
        this.models.push(cube);
        
        // Blue sphere
        const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.set(1, 0, -2);
        this.scene.add(sphere);
        this.models.push(sphere);
        
        // Green cylinder
        const cylinderGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 32);
        const cylinderMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
        cylinder.position.set(-1, 0, -2);
        this.scene.add(cylinder);
        this.models.push(cylinder);
        
        // Yellow cone
        const coneGeo = new THREE.ConeGeometry(0.4, 1, 32);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(0, 1, -2);
        this.scene.add(cone);
        this.models.push(cone);
        
        // Simple wireframe to show depth
        const wireGeo = new THREE.TorusKnotGeometry(0.5, 0.2, 64, 16);
        const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        const wireObj = new THREE.Mesh(wireGeo, wireMat);
        wireObj.position.set(0, -1, -2);
        this.scene.add(wireObj);
        this.models.push(wireObj);
        
        console.log('Объекты добавлены, их должно быть видно');
        this.message.textContent = 'Модели добавлены!';
    }
    
    loadGLTFModel() {
        const loader = new GLTFLoader();
        loader.load('models/model.glb', (gltf) => {
            const model = gltf.scene;
            model.position.set(0, 0, -2);
            model.scale.set(0.5, 0.5, 0.5);
            this.scene.add(model);
            this.models.push(model);
            this.message.textContent = 'Модель загружена!';
            console.log('GLTF модель загружена');
            
            // Show controls
            this.controls.style.display = 'flex';
        }, 
        (xhr) => {
            this.message.textContent = 'Загрузка: ' + Math.floor(xhr.loaded / xhr.total * 100) + '%';
        },
        (error) => {
            console.error('Ошибка загрузки модели:', error);
            this.message.textContent = 'Ошибка загрузки модели';
            // Still show basic objects if model fails
            this.addVisibleObjects();
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Rotate models for better visibility
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