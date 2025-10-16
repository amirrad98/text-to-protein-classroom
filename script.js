// Text to Protein Conversion Logic
class ProteinGenerator {
    constructor() {
        this.aminoAcids = ['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V'];
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.proteinMesh = null;
        this.isRotating = false;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setup3DViewer();
    }

    setupEventListeners() {
        // Generate button
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateProtein();
        });

        // Test buttons
        document.querySelectorAll('.test-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const text = e.target.dataset.text;
                document.getElementById('textInput').value = text;
                this.generateProtein();
            });
        });

        // Control buttons
        document.getElementById('rotateBtn').addEventListener('click', () => {
            this.toggleRotation();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetView();
        });
    }

    textToProtein(text) {
        if (!text) return '';
        
        // Convert text to protein sequence
        let sequence = '';
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            const aminoIndex = charCode % this.aminoAcids.length;
            sequence += this.aminoAcids[aminoIndex];
        }
        
        return sequence;
    }

    generateProtein() {
        const textInput = document.getElementById('textInput');
        const generateBtn = document.getElementById('generateBtn');
        const sequenceDisplay = document.getElementById('proteinSequence');
        
        const text = textInput.value.trim();
        if (!text) {
            alert('Please enter some text first!');
            return;
        }

        // Show loading state
        generateBtn.classList.add('loading');
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';

        // Simulate processing time for better UX
        setTimeout(() => {
            const proteinSequence = this.textToProtein(text);
            
            // Display sequence
            sequenceDisplay.innerHTML = this.formatSequence(proteinSequence);
            
            // Generate 3D structure
            this.create3DProtein(proteinSequence);
            
            // Reset button state
            generateBtn.classList.remove('loading');
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Protein';
        }, 500);
    }

    formatSequence(sequence) {
        // Format sequence with spaces every 10 amino acids for readability
        return sequence.replace(/(.{10})/g, '$1 ').trim();
    }

    setup3DViewer() {
        const viewer = document.getElementById('proteinViewer');
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf8fafc);
        
        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, viewer.clientWidth / viewer.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 50);
        
        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(viewer.clientWidth, viewer.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        viewer.appendChild(this.renderer.domElement);
        
        // Controls setup
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        // Start render loop
        this.animate();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Create initial protein structure
        this.create3DProtein('HELLO');
    }

    create3DProtein(sequence) {
        // Remove existing protein
        if (this.proteinMesh) {
            this.scene.remove(this.proteinMesh);
        }
        
        // Create protein group
        this.proteinMesh = new THREE.Group();
        
        // Color mapping for amino acids
        const colorMap = {
            'A': 0xff6b6b, 'R': 0x4ecdc4, 'N': 0x45b7d1, 'D': 0xf9ca24,
            'C': 0xf0932b, 'E': 0xeb4d4b, 'Q': 0x6c5ce7, 'G': 0xa55eea,
            'H': 0x26de81, 'I': 0x2bcbba, 'L': 0x0fb9b1, 'K': 0x3867d6,
            'M': 0x8854d0, 'F': 0xfa8231, 'P': 0xf8b500, 'S': 0x20bf6b,
            'T': 0x01a3a4, 'W': 0x2d3436, 'Y': 0xff3838, 'V': 0xff9ff3
        };
        
        // Create spheres for each amino acid
        const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
        
        for (let i = 0; i < sequence.length; i++) {
            const aminoAcid = sequence[i];
            const color = colorMap[aminoAcid] || 0x888888;
            
            const material = new THREE.MeshPhongMaterial({ 
                color: color,
                shininess: 100
            });
            
            const sphere = new THREE.Mesh(sphereGeometry, material);
            
            // Position spheres in a helix pattern
            const angle = (i * 100) * Math.PI / 180;
            const radius = 10;
            const height = i * 2;
            
            sphere.position.x = radius * Math.cos(angle);
            sphere.position.y = height - (sequence.length * 1);
            sphere.position.z = radius * Math.sin(angle);
            
            sphere.castShadow = true;
            sphere.receiveShadow = true;
            
            this.proteinMesh.add(sphere);
            
            // Add connections between adjacent amino acids
            if (i > 0) {
                const prevSphere = this.proteinMesh.children[i - 1];
                const connection = this.createConnection(prevSphere.position, sphere.position);
                this.proteinMesh.add(connection);
            }
        }
        
        // Center the protein
        const box = new THREE.Box3().setFromObject(this.proteinMesh);
        const center = box.getCenter(new THREE.Vector3());
        this.proteinMesh.position.sub(center);
        
        this.scene.add(this.proteinMesh);
    }

    createConnection(pos1, pos2) {
        const direction = new THREE.Vector3().subVectors(pos2, pos1);
        const length = direction.length();
        
        const geometry = new THREE.CylinderGeometry(0.2, 0.2, length);
        const material = new THREE.MeshPhongMaterial({ color: 0x666666 });
        const cylinder = new THREE.Mesh(geometry, material);
        
        // Position cylinder between the two spheres
        cylinder.position.copy(pos1).add(direction.multiplyScalar(0.5));
        cylinder.lookAt(pos2);
        cylinder.rotateX(Math.PI / 2);
        
        return cylinder;
    }

    toggleRotation() {
        this.isRotating = !this.isRotating;
        const rotateBtn = document.getElementById('rotateBtn');
        rotateBtn.textContent = this.isRotating ? 'Stop Rotation' : 'Auto Rotate';
    }

    resetView() {
        if (this.controls) {
            this.controls.reset();
        }
        this.isRotating = false;
        document.getElementById('rotateBtn').textContent = 'Auto Rotate';
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.isRotating && this.proteinMesh) {
            this.proteinMesh.rotation.y += 0.01;
        }
        
        if (this.controls) {
            this.controls.update();
        }
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        const viewer = document.getElementById('proteinViewer');
        
        this.camera.aspect = viewer.clientWidth / viewer.clientHeight;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(viewer.clientWidth, viewer.clientHeight);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ProteinGenerator();
});

// Add some interactive feedback
document.addEventListener('DOMContentLoaded', () => {
    // Add hover effects to cards
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
        });
    });
    
    // Add typing animation to textarea
    const textarea = document.getElementById('textInput');
    textarea.addEventListener('focus', () => {
        textarea.style.borderColor = 'hsl(221.2 83.2% 53.3%)';
    });
    
    textarea.addEventListener('blur', () => {
        textarea.style.borderColor = 'hsl(214.3 31.8% 91.4%)';
    });
});