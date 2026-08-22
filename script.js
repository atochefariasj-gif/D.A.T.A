// Credenciales de Supabase
const SUPABASE_URL = 'https://glgkfuiqwconjjffxgln.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YxHDEuQiZ06ywaT5Yha68w_DX35lUVO';

const { createClient } = supabase;
const dbSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentRole = 'visitante';
let currentLine = '';
let currentMachineId = null;
let isEditMode = false;
let rolPendiente = '';
let mapaNombres = {}; // Aquí se guardarán los nombres del JSON[cite: 1]
let reportesCargados = {}; // Variable para guardar el estado de las piezas[cite: 1]
let documentacionPiezasCargada = {}; // Variable para guardar los links/planos de las piezas

let centroModeloGlobal = new THREE.Vector3(); // Centro global para las vistas rápidas y centrado

const PASSWORDS = {
    'mantenimiento': '123',
    'admin': 'admin123'
};

// Función para cargar los nombres desde el archivo JSON[cite: 1]
async function cargarTraducciones() {
    try {
        const response = await fetch('nombres.json');
        if (!response.ok) throw new Error("No se pudo cargar el archivo nombres.json");
        mapaNombres = await response.json();
        console.log("Traducciones cargadas correctamente.");
    } catch (error) {
        console.warn("No se pudo cargar nombres.json, usando nombres originales.", error);
        mapaNombres = {}; // Si falla, queda vacío y no se rompe nada[cite: 1]
    }
}

async function solicitarPassword(rol) {
    rolPendiente = rol;
    document.getElementById('modal-password-title').innerText = `Contraseña para ${rol.toUpperCase()}`;
    document.getElementById('input-password-val').value = '';
    document.getElementById('modal-password').style.display = 'flex';
}

async function cerrarModalPassword() {
    document.getElementById('modal-password').style.display = 'none';
}

async function verificarPassword() {
    let passInput = document.getElementById('input-password-val').value;
    if (passInput === PASSWORDS[rolPendiente]) {
        cerrarModalPassword();
        selectRole(rolPendiente);
    } else {
        alert("Contraseña incorrecta");
    }
}

async function selectRole(role) {
    currentRole = role;
    document.getElementById('main-menu').classList.remove('active-view');
    document.getElementById('view-lines').classList.add('active-view');
}

async function openLine(lineName, icon) {
    currentLine = lineName;
    document.getElementById('lines-header-title').innerText = `${icon} ${lineName}`;
    document.getElementById('view-lines').classList.remove('active-view');
    document.getElementById('view-machines').classList.add('active-view');
    
    let toolbar = document.getElementById('admin-toolbar');
    if (currentRole === 'admin') {
        toolbar.style.display = 'flex';
    } else {
        toolbar.style.display = 'none';
    }
    renderMachines();
}

async function renderMachines() {
    const { data: maquinas, error } = await dbSupabase
        .from('maquinas')
        .select('*');

    if (error) {
        console.error("Error al cargar las máquinas:", error);
        return;
    }

    let container = document.getElementById('machines-grid-container');
    container.innerHTML = "";

    maquinas.forEach(maq => { 
        let card = document.createElement('div');
        card.className = 'card-item';

        if (currentRole === 'admin' && isEditMode) {
            card.onclick = (e) => e.stopPropagation();
            card.innerHTML = `
                <span class="card-icon"></span>
                <input type="text" class="mach-input" data-id="${maq.id}" value="${maq.nombre || ''}" onchange="updateMachineNameInline('${maq.id}', this.value)">
            `;
        } else {
            card.onclick = () => openMachineDetail(maq.id, maq.nombre);
            card.innerHTML = `
                <span class="card-icon"></span>
                <div class="card-title">${maq.nombre || ''}</div>
            `;
        }
        container.appendChild(card);
    });
}

async function updateMachineNameInline(id, nuevoNombre) {
    if (currentRole !== 'admin') {
        alert("No tienes permisos para modificar este campo.");
        return;
    }
    const { error } = await dbSupabase
        .from('maquinas')
        .update({ nombre: nuevoNombre })
        .eq('id', id);

    if (error) console.error("Error al actualizar nombre:", error.message);
}

async function openMachineDetail(id, name) {
    currentMachineId = id;
    document.getElementById('selected-machine-title').innerText = name;
    document.getElementById('view-machines').classList.remove('active-view');
    document.getElementById('view-machine-detail').classList.add('active-view');
}

async function openOption(opt) {
    document.getElementById('view-machine-detail').classList.remove('active-view');
    
    if (opt === 'Kardex') {
        document.getElementById('view-kardex').classList.add('active-view', 'fullscreen-mode');
        loadKardexData();
    } else if (opt === 'Instrucciones') {
        document.getElementById('view-instructions').classList.add('active-view', 'fullscreen-mode');
        loadInstructionsData();
    } else if (opt === 'Manuals') {
        document.getElementById('view-manuals').classList.add('active-view', 'fullscreen-mode');
        loadManualsData();
    } else if (opt === 'Visual3D') {
        const vista3D = document.getElementById('view-visual3d');
        vista3D.classList.add('active-view', 'fullscreen-mode');
        
        const innerBox = document.getElementById('visual3d-wrapper-box');
        if(innerBox) {
            innerBox.style.height = window.innerWidth < 768 ? '70vh' : 'calc(100vh - 65px)';
        }

        const contenedorImportar = document.getElementById('contenedor-importar-3d');
        const contenedorAdminBtn = document.getElementById('contenedor-admin-reportes-btn');
        
        const btnDesensamblaje = document.getElementById('btn-iniciar-desensamblaje'); 
        const btnMedicion = document.getElementById('btn-medir');

        if (currentRole === 'admin') {
            if (contenedorImportar) contenedorImportar.style.display = 'block';
            if (contenedorAdminBtn) contenedorAdminBtn.style.display = 'block';
            if (btnDesensamblaje) btnDesensamblaje.style.display = 'inline-block';
            if (btnMedicion) btnMedicion.style.display = 'inline-block';
        } else if (currentRole === 'mantenimiento') {
            if (contenedorImportar) contenedorImportar.style.display = 'none';
            if (contenedorAdminBtn) contenedorAdminBtn.style.display = 'block';
            if (btnDesensamblaje) btnDesensamblaje.style.display = 'inline-block';
            if (btnMedicion) btnMedicion.style.display = 'inline-block';
        } else {
            if (contenedorImportar) contenedorImportar.style.display = 'none';
            if (contenedorAdminBtn) contenedorAdminBtn.style.display = 'none';
            if (btnDesensamblaje) btnDesensamblaje.style.display = 'none';
            if (btnMedicion) btnMedicion.style.display = 'none';
        }

        if (!window.is3DInitialized) {
            init3D();
            window.is3DInitialized = true;
        } else {
            cargarModeloMaquinaActual();
            setTimeout(redimensionarCanvas3D, 50);
        }
    }
}

async function salirKardex() {
    document.getElementById('view-kardex').classList.remove('fullscreen-mode');
    goBack('detail');
}

async function salirInstrucciones() {
    document.getElementById('view-instructions').classList.remove('fullscreen-mode');
    goBack('detail');
}

async function salirManuales() {
    document.getElementById('view-manuals').classList.remove('fullscreen-mode');
    goBack('detail');
}

async function salirVisual3D() {
    const vista3D = document.getElementById('view-visual3d');
    vista3D.classList.remove('fullscreen-mode');
    
    const innerBox = document.getElementById('visual3d-wrapper-box');
    if(innerBox) innerBox.style.height = '480px';

    goBack('detail');
}

async function redimensionarCanvas3D() {
    const container = document.getElementById('canvas-3d');
    if (container && renderer && camera) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
}

async function goBack(target) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    if (target === 'main') {
        document.getElementById('main-menu').classList.add('active-view');
    } else if (target === 'lines') {
        document.getElementById('view-lines').classList.add('active-view');
    } else if (target === 'machines') {
        document.getElementById('view-machines').classList.add('active-view');
    } else if (target === 'detail') {
        document.getElementById('view-machine-detail').classList.add('active-view');
    }
}

async function toggleEditMode() {
    if (currentRole !== 'admin') {
        alert("Acceso denegado.");
        return;
    }

    if (isEditMode) {
        const inputs = document.querySelectorAll('.mach-input');
        for (const input of inputs) {
            const id = input.getAttribute('data-id');
            const nuevoNombre = input.value.trim();

            if (nuevoNombre) {
                await dbSupabase
                    .from('maquinas')
                    .update({ nombre: nuevoNombre })
                    .eq('id', id);
            }
        }
    }

    isEditMode = !isEditMode;
    let btn = document.getElementById('toggle-edit-btn');
    if (btn) {
        if (isEditMode) {
            btn.classList.add('btn-toggle-on');
            btn.innerText = "💾 Guardar Nombres";
        } else {
            btn.classList.remove('btn-toggle-on');
            btn.innerText = "✏️ Editar Nombres";
        }
    }
    renderMachines();
}

async function loadKardexData() {
    const { data: maq, error } = await dbSupabase
        .from('maquinas')
        .select('*')
        .eq('id', currentMachineId)
        .single();

    if (error || !maq) return;

    document.getElementById('kardex-subtitle').innerText = `Activo: ${maq.nombre}`;
    document.getElementById('k-maquina-lbl').innerText = maq.nombre;
    
    let isAdmin = (currentRole === 'admin');

    let fields = ['k-area', 'k-codigo', 'k-femision', 'k-eq-marca', 'k-eq-capacidad', 'k-eq-material', 'k-eq-serie', 'k-eq-modelo'];
    fields.forEach(f => document.getElementById(f).readOnly = !isAdmin);

    let meta = maq.meta || {};
    document.getElementById('k-area').value = meta.area || '';
    document.getElementById('k-codigo').value = meta.codigo || '';
    document.getElementById('k-femision').value = meta.femision || '';
    document.getElementById('k-eq-marca').value = meta.eq_marca || '';
    document.getElementById('k-eq-capacidad').value = meta.eq_capacidad || '';
    document.getElementById('k-eq-material').value = meta.eq_material || '';
    document.getElementById('k-eq-serie').value = meta.eq_serie || '';
    document.getElementById('k-eq-modelo').value = meta.eq_modelo || '';

    const addRowBtn = document.getElementById('add-row-btn');
    const addMotorBtn = document.getElementById('add-motor-btn');
    const thAction = document.getElementById('th-action');
    if (addRowBtn) addRowBtn.style.display = isAdmin ? 'block' : 'none';
    if (addMotorBtn) addMotorBtn.style.display = isAdmin ? 'block' : 'none';
    if (thAction) thAction.style.display = isAdmin ? 'table-cell' : 'none';

    if (typeof renderMotors === 'function') renderMotors(maq.motors || [], isAdmin);
    if (typeof renderKardexRows === 'function') renderKardexRows(maq.kardex || [], isAdmin);
}

async function loadInstructionsData() {
    const { data: maq } = await dbSupabase.from('maquinas').select('instruction_images').eq('id', currentMachineId).single();
    let isAdmin = (currentRole === 'admin');
    const adminImgUpload = document.getElementById('admin-img-upload');
    if (adminImgUpload) adminImgUpload.style.display = isAdmin ? 'block' : 'none';

    let wrapper = document.getElementById('instructions-gallery-wrapper');
    wrapper.innerHTML = '';
    
    let images = maq?.instruction_images || [];
    if (images.length === 0) {
        wrapper.innerHTML = `<span style="color: #888; font-size: 11px; grid-column: span 2; padding: 20px;">No hay instrucciones registradas.</span>`;
        return;
    }

    images.forEach((imgUrl, idx) => {
        let card = document.createElement('div');
        card.className = 'instruction-card';
        card.innerHTML = `
            ${isAdmin ? `<button class="btn-img-del" onclick="event.stopPropagation(); removeInstructionImage(${idx})">✕</button>` : ''}
            <img src="${imgUrl}" class="instruction-card-thumb" onclick="openImageModal('${imgUrl}')">
            <div class="instruction-card-info">Paso ${idx + 1}</div>
        `;
        wrapper.appendChild(card);
    });
}

async function loadManualsData() {
    const { data: maq } = await dbSupabase.from('maquinas').select('manuals_pdf').eq('id', currentMachineId).single();
    let isAdmin = (currentRole === 'admin');
    const adminPdfUpload = document.getElementById('admin-pdf-upload');
    if (adminPdfUpload) adminPdfUpload.style.display = isAdmin ? 'block' : 'none';

    let wrapper = document.getElementById('manuals-list-wrapper');
    wrapper.innerHTML = '';

    let manuals = maq?.manuals_pdf || [];
    if (manuals.length === 0) {
        wrapper.innerHTML = `<span style="color: #888; font-size: 11px; padding: 20px;">No hay manuales PDF cargados.</span>`;
        return;
    }

    manuals.forEach((man, idx) => {
        let row = document.createElement('div');
        row.className = 'manual-item-row';
        row.innerHTML = `
            <div class="manual-info">
                <span class="manual-icon">📄</span>
                <span class="manual-name" title="${man.name}">${man.name}</span>
            </div>
            <div class="manual-actions">
                <a href="${man.url}" target="_blank" class="btn-pdf-download">📥 Ver / Descargar</a>
                ${isAdmin ? `<button class="btn-pdf-del" onclick="removeManualPdf(${idx})">Eliminar</button>` : ''}
            </div>
        `;
        wrapper.appendChild(row);
    });
}

async function openImageModal(src) {
    document.getElementById('modal-img-tag').src = src;
    document.getElementById('img-modal').style.display = 'flex';
}

async function closeImageModal() {
    document.getElementById('img-modal').style.display = 'none';
}

// ==========================================
// LÓGICA 3D, VISTA EXPLOSIONADA, GIZMO Y ANIMACIÓN FLUIDA
// ==========================================
let scene, camera, renderer, grupoMaquina, controls, raycaster, mouse, gltfLoader;
let viewHelper = null; 
let viewHelperContainer = null;
let piezaSeleccionadaActual = "";
let vistaExplosionada = false;
let piezasDetectadas = [];

let targetCameraPos = null;
let targetControlsTarget = null;

let pointerDownX = 0;
let pointerDownY = 0;
let hasMoved = false;

async function init3D() {
    await cargarTraducciones(); 
    const container = document.getElementById('canvas-3d');
    const initW = container.clientWidth > 0 ? container.clientWidth : 300;
    const initH = container.clientHeight > 0 ? container.clientHeight : 480;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);

    camera = new THREE.PerspectiveCamera(50, initW / initH, 0.1, 100);
    camera.position.set(5, 5, 8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(initW, initH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false; 
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    if (typeof THREE.ViewHelper !== 'undefined') {
        viewHelper = new THREE.ViewHelper(camera, renderer);
        
        viewHelperContainer = document.createElement('div');
        viewHelperContainer.style.position = 'absolute';
        viewHelperContainer.style.top = '10px';
        viewHelperContainer.style.right = '10px';
        viewHelperContainer.style.width = '128px';
        viewHelperContainer.style.height = '128px';
        viewHelperContainer.style.zIndex = '10';
        container.style.position = 'relative';
        container.appendChild(viewHelperContainer);

        viewHelperContainer.addEventListener('pointerdown', (e) => {
            const rect = viewHelperContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (viewHelper.handleClick({ clientX: x, clientY: y, target: viewHelperContainer })) {
                e.stopPropagation();
            }
        });
    }

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    gltfLoader = new THREE.GLTFLoader();

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    grupoMaquina = new THREE.Group();
    scene.add(grupoMaquina);

    cargarModeloMaquinaActual();
    cargarNotas3DEnModelo();

    const inputBuscador = document.querySelector('input[placeholder*="Buscar"]');
    if (inputBuscador) {
        inputBuscador.addEventListener('input', (e) => {
            const textoFiltro = e.target.value.toLowerCase();
            const lista = document.getElementById('lista-partes');
            if (lista) {
                const botones = lista.getElementsByTagName('button');
                Array.from(botones).forEach(boton => {
                    const nombrePieza = boton.innerText.toLowerCase();
                    if (nombrePieza.includes(textoFiltro)) {
                        boton.style.display = "block";
                    } else {
                        boton.style.display = "none";
                    }
                });
            }
        });
    }

    const inputArchivo = document.getElementById('input-archivo');
    if (inputArchivo) {
        inputArchivo.addEventListener('change', async function(e) {
            if (currentRole !== 'admin') {
                alert("Acceso denegado.");
                return;
            }
            const archivo = e.target.files[0];
            if (!archivo) return;
            
            let fileName = `glb_${currentMachineId}_${Date.now()}.glb`;
            let { error } = await dbSupabase.storage.from('modelos-glb').upload(fileName, archivo);
            if (error) {
                alert("Error al subir modelo 3D: " + error.message);
                return;
            }

            let { data: pubUrl } = dbSupabase.storage.from('modelos-glb').getPublicUrl(fileName);
            if (pubUrl?.publicUrl) {
                await dbSupabase.from('maquinas').update({ modelo_url: pubUrl.publicUrl }).eq('id', currentMachineId);
                cargarModeloMaquinaActual();
                alert("¡Modelo 3D guardado en la nube correctamente!");
            }
        });
    }

    renderer.domElement.addEventListener('pointerdown', (e) => {
        pointerDownX = e.clientX;
        pointerDownY = e.clientY;
        hasMoved = false;
    });

    renderer.domElement.addEventListener('pointermove', (e) => {
        if (Math.abs(e.clientX - pointerDownX) > 4 || Math.abs(e.clientY - pointerDownY) > 4) {
            hasMoved = true;
        }
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
        if (!hasMoved) detectarToque(e.clientX, e.clientY);
    });

    function animate() {
        requestAnimationFrame(animate);
        
        if (targetCameraPos && targetControlsTarget) {
            camera.position.lerp(targetCameraPos, 0.1);
            controls.target.lerp(targetControlsTarget, 0.1);

            if (camera.position.distanceTo(targetCameraPos) < 0.01 && controls.target.distanceTo(targetControlsTarget) < 0.01) {
                camera.position.copy(targetCameraPos);
                controls.target.copy(targetControlsTarget);
                targetCameraPos = null;
                targetControlsTarget = null;
            }
        }

        controls.update();
        
        if (!modoDesensamblajeActivo) {
            piezasDetectadas.forEach(pieza => {
                if (pieza.userData && pieza.userData.posOrig && pieza.userData.posExp) {
                    const target = vistaExplosionada ? pieza.userData.posExp : pieza.userData.posOrig;
                    pieza.position.lerp(target, 0.1); 
                }
            });
        } else {
            listaPiezasOrdenadas.forEach((pieza, index) => {
                if (pieza.userData && pieza.userData.posOrig && pieza.userData.posExp) {
                    let targetPos = index < pasoActualIndice ? pieza.userData.posExp : pieza.userData.posOrig;
                    pieza.position.lerp(targetPos, 0.12);

                    if (pieza.material) {
                        pieza.material.transparent = true;
                        let targetOpacity = index < pasoActualIndice ? 0.05 : 1.0;
                        pieza.material.opacity += (targetOpacity - pieza.material.opacity) * 0.12;
                    }
                }
            });

            piezasDetectadas.forEach(pieza => {
                if (!listaPiezasOrdenadas.includes(pieza)) {
                    if (pieza.userData && pieza.userData.posOrig) {
                        pieza.position.lerp(pieza.userData.posOrig, 0.12);
                        if (pieza.material) {
                            pieza.material.transparent = true;
                            pieza.material.opacity += (1.0 - pieza.material.opacity) * 0.12;
                        }
                    }
                }
            });
        }
        
        renderer.clear();
        renderer.render(scene, camera);
        
        if (viewHelper) {
            viewHelper.render(renderer);
        }
    }
    animate();
}

function toggleVistaExplosionada() {
    vistaExplosionada = !vistaExplosionada;
    const btnExplo = document.getElementById('btn-explo');
    
    if (vistaExplosionada) {
        btnExplo.innerText = "📦 Unir Piezas";
    } else {
        btnExplo.innerText = "💥 Activar Vista Explosionada";
    }
}

function centrarVistaGeneral() {
    if (!controls || !camera) return;
    targetControlsTarget = centroModeloGlobal.clone();
    targetCameraPos = centroModeloGlobal.clone().add(new THREE.Vector3(0, 3, 7));
}

function cambiarVistaRapida(tipo) {
    if (!camera || !controls) return;
    const distancia = 7;
    targetControlsTarget = centroModeloGlobal.clone();

    if (tipo === 'frontal') {
        targetCameraPos = centroModeloGlobal.clone().add(new THREE.Vector3(0, 0, distancia));
    } else if (tipo === 'superior') {
        targetCameraPos = centroModeloGlobal.clone().add(new THREE.Vector3(0, distancia, 0.01));
    } else if (tipo === 'lateral') {
        targetCameraPos = centroModeloGlobal.clone().add(new THREE.Vector3(distancia, 0, 0));
    } else if (tipo === 'isometrica') {
        targetCameraPos = centroModeloGlobal.clone().add(new THREE.Vector3(distancia, distancia, distancia));
    }
}

async function cargarModeloMaquinaActual() {
    const btnExplo = document.getElementById('btn-explo');
    if(btnExplo) {
        btnExplo.innerText = "⏳ Cargando modelo... 0%";
        btnExplo.disabled = true;
    }

    while(grupoMaquina.children.length > 0) {
        grupoMaquina.remove(grupoMaquina.children[0]);
    }

    const { data: maq } = await dbSupabase.from('maquinas').select('modelo_url').eq('id', currentMachineId).single();

    if (maq && maq.modelo_url && maq.modelo_url.trim() !== "" && maq.modelo_url !== "EMPTY") {
        const manager = new THREE.LoadingManager();
        
        manager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const percentComplete = Math.round((itemsLoaded / itemsTotal) * 100);
            if(btnExplo) btnExplo.innerText = `Cargando: ${percentComplete}%`;
        };

        const loader = new THREE.GLTFLoader(manager);
        loader.load(maq.modelo_url, (gltf) => {
            procesarModeloCargado(gltf, "Modelo Cloud (Optimizado)");
        }, undefined, (err) => {
            console.error("Error al cargar modelo 3D:", err);
            cargarModeloPorDefecto();
        });
    } else {
        cargarModeloPorDefecto();
    }
}

async function cargarModeloPorDefecto() {
    const btnExplo = document.getElementById('btn-explo');
    if(btnExplo) {
        btnExplo.innerText = "💥 Activar Vista Explosionada";
        btnExplo.disabled = false;
    }
    let indicador = document.getElementById('indicador-equipo');
    if(indicador) indicador.innerText = `📍 Vista: Sin modelo 3D`;
}

async function procesarModeloCargado(gltf, nombreEquipo) {
    const modelo = gltf.scene;
    
    modelo.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            if (child.material) {
                child.material.precision = 'mediump';
                if (child.material.map) child.material.map.generateMipmaps = true;
            }
        }
    });

    const boxCentro = new THREE.Box3().setFromObject(modelo);
    const center = boxCentro.getCenter(new THREE.Vector3());
    modelo.position.sub(center); 

    centroModeloGlobal = center.clone();

    piezasDetectadas = [];
    const lista = document.getElementById('lista-partes');
    if(lista) lista.innerHTML = "";
    let indexPieza = 1;

    const { data: maq } = await dbSupabase.from('maquinas').select('reportes_piezas, documentacion_piezas').eq('id', currentMachineId).single();
    reportesCargados = maq?.reportes_piezas || {}; 
    documentacionPiezasCargada = maq?.documentacion_piezas || {};

    modelo.traverse((child) => {
        if (child.isMesh) {
            let nombreBruto = child.parent && child.parent.name && child.parent.name !== "Scene" ? child.parent.name : (child.name || `Pieza_${indexPieza}`);
            let nombreVisual = mapaNombres[nombreBruto] || nombreBruto;

            child.name = nombreVisual;
            piezasDetectadas.push(child);

            const posOrig = child.position.clone();
            const meshBox = new THREE.Box3().setFromObject(child);
            const meshCenter = meshBox.getCenter(new THREE.Vector3());
            const direccionExplosion = meshCenter.clone().sub(center).normalize();
            if(direccionExplosion.lengthSq() === 0) direccionExplosion.set(0, 1, 0);
            const posExp = posOrig.clone().add(direccionExplosion.multiplyScalar(2));

            let colorOriginal = 0x888888;
            if (child.material) {
                if (child.material.color) colorOriginal = child.material.color.getHex();
                else if (Array.isArray(child.material) && child.material[0]?.color) colorOriginal = child.material[0].color.getHex();
            }

            let repInfo = reportesCargados[child.name];
            let colorHex = colorOriginal;
            if (repInfo) {
                if (repInfo.estado === 'mantenimiento') colorHex = 0xef4444; 
                else if (repInfo.estado === 'preventivo') colorHex = 0xf59e0b; 
            }

            child.userData = { posOrig, posExp, colorBase: colorOriginal };

            child.material = new THREE.MeshStandardMaterial({ 
                color: colorHex,
                roughness: 0.4, metalness: 0.2, transparent: true, opacity: 1.0
            });

            if(lista) {
                const btn = document.createElement('button');
                btn.className = "w-full text-left p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-white text-xs mb-1";
                btn.innerHTML = `⚙️ ${child.name}`;
                btn.onclick = () => seleccionarComponente(child.name);
                lista.appendChild(btn);
            }
            indexPieza++;
        }
    });

    grupoMaquina.add(modelo);
    let indicador = document.getElementById('indicador-equipo');
    if(indicador) indicador.innerText = `📍 Vista: ${nombreEquipo}`;

    const btnExplo = document.getElementById('btn-explo');
    if(btnExplo) {
        btnExplo.innerText = "💥 Activar Vista Explosionada";
        btnExplo.disabled = false;
    }
}

async function seleccionarComponente(nombrePieza) {
    const panel = document.getElementById('panel-info');
    const piezaEncontrada = piezasDetectadas.find(p => p.name === nombrePieza);

    if (piezaSeleccionadaActual === nombrePieza) {
        panel.classList.add('hidden');
        piezaSeleccionadaActual = null;

        piezasDetectadas.forEach(p => {
            if (p.material) {
                p.material.transparent = true;
                p.material.opacity = 1.0;
                
                let repInfo = reportesCargados[p.name];
                let colorHex = p.userData.colorBase;
                if (repInfo) {
                    if (repInfo.estado === 'mantenimiento') colorHex = 0xef4444;
                    else if (repInfo.estado === 'preventivo') colorHex = 0xf59e0b;
                }
                p.material.color.setHex(colorHex);
            }
        });
        return;
    }

    if (piezaEncontrada) {
        piezaSeleccionadaActual = nombrePieza;
        panel.classList.remove('hidden');
        document.getElementById('info-titulo').innerText = nombrePieza;

        piezasDetectadas.forEach(p => {
            if (p.material) {
                p.material.transparent = true;
                if (p.name === nombrePieza) {
                    p.material.color.setHex(0xfacc15); 
                    p.material.opacity = 1.0;
                } else {
                    p.material.opacity = 0.15;
                    let repInfo = reportesCargados[p.name];
                    let colorHex = p.userData.colorBase;
                    if (repInfo) {
                        if (repInfo.estado === 'mantenimiento') colorHex = 0xef4444;
                        else if (repInfo.estado === 'preventivo') colorHex = 0xf59e0b;
                    }
                    p.material.color.setHex(colorHex);
                }
            }
        });

        const boxPieza = new THREE.Box3().setFromObject(piezaEncontrada);
        const centroPieza = boxPieza.getCenter(new THREE.Vector3());
        targetControlsTarget = centroPieza.clone();
        const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(2.2); 
        targetCameraPos = centroPieza.clone().add(offset);

        let repInfo = reportesCargados[nombrePieza];
        let docInfo = documentacionPiezasCargada[nombrePieza];

        const lblEstado = document.getElementById('info-estado');
        const boxMotivo = document.getElementById('info-motivo-box');
        const txtMotivo = document.getElementById('info-motivo-txt');
        const contenedorAcciones = document.getElementById('panel-acciones-pieza');
        contenedorAcciones.innerHTML = '';

        if (repInfo) {
            if (repInfo.estado === 'mantenimiento') {
                lblEstado.innerText = "🚨 Requiere Mantenimiento Crítico";
                lblEstado.className = "text-red-400 font-bold";
            } else if (repInfo.estado === 'preventivo') {
                lblEstado.innerText = "⚠️ Alerta Preventiva / Desgaste";
                lblEstado.className = "text-yellow-400 font-bold";
            } else {
                lblEstado.innerText = "✅ Operativo";
                lblEstado.className = "text-green-400 font-bold";
            }
            boxMotivo.classList.remove('hidden');
            txtMotivo.innerHTML = `<b>${repInfo.motivo}</b><br><span class="text-[10px] text-gray-400">${repInfo.fecha}</span>`;
        } else {
            lblEstado.innerText = "✅ Operativo";
            lblEstado.className = "text-green-400 font-bold";
            boxMotivo.classList.add('hidden');
        }

        if (docInfo && docInfo.url) {
            contenedorAcciones.innerHTML += `
                <a href="${docInfo.url}" target="_blank" class="w-full py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold text-[11px] text-center block mb-1">
                    📄 Ver Plano / Manual de Pieza
                </a>`;
        } else if (currentRole === 'admin') {
            contenedorAcciones.innerHTML += `
                <button onclick="abrirModalAsociarDocumento('${nombrePieza}')" class="w-full py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-[11px] mb-1">
                    ➕ Adjuntar Manual a Pieza
                </button>`;
        }

        if (currentRole === 'mantenimiento' || currentRole === 'admin') {
            contenedorAcciones.innerHTML += `
                <button onclick="abrirModalMotivoReporte('${nombrePieza}', 'preventivo')" class="w-full py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-white font-bold text-[11px] mb-1">⚠️ Marcar Alerta Preventiva</button>
                <button onclick="abrirModalMotivoReporte('${nombrePieza}', 'mantenimiento')" class="w-full py-1.5 bg-red-600 hover:bg-red-500 rounded text-white font-bold text-[11px] mb-1">🔴 Reportar Mantenimiento</button>
                <button onclick="activarModoCrearNota('${nombrePieza}')" class="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white font-bold text-[11px] mb-1">📌 Dejar Nota 3D</button>
            `;
            if (repInfo) {
                contenedorAcciones.innerHTML += `
                    <button onclick="marcarPiezaOperativa('${nombrePieza}')" class="w-full py-1.5 bg-green-600 hover:bg-green-500 rounded text-white font-bold text-[11px]">✅ Marcar como Operativa</button>
                `;
            }
        }
        
        cargarDatosInventarioPieza(nombrePieza);
    }
}

let estadoReporteSeleccionado = 'mantenimiento';

async function abrirModalMotivoReporte(nombrePieza, estado = 'mantenimiento') {
    estadoReporteSeleccionado = estado;
    document.getElementById('lbl-pieza-a-reportar').innerText = `Pieza: ${nombrePieza} (${estado.toUpperCase()})`;
    document.getElementById('txt-motivo-input').value = '';
    document.getElementById('modal-motivo-reporte').style.display = 'flex';
}

async function cerrarModalMotivo() {
    document.getElementById('modal-motivo-reporte').style.display = 'none';
}

async function guardarReporteMantenimiento() {
    let motivo = document.getElementById('txt-motivo-input').value.trim();
    if (!motivo) return alert("Ingresa el motivo.");

    let fechaHoraStr = new Date().toLocaleString();
    const { data: maq } = await dbSupabase.from('maquinas').select('reportes_piezas').eq('id', currentMachineId).single();
    let reportes = maq?.reportes_piezas || {};

    reportes[piezaSeleccionadaActual] = { estado: estadoReporteSeleccionado, motivo, fecha: fechaHoraStr };
    await dbSupabase.from('maquinas').update({ reportes_piezas: reportes }).eq('id', currentMachineId);

    cerrarModalMotivo();
    cargarModeloMaquinaActual();
}

async function marcarPiezaOperativa(nombrePieza) {
    if (currentRole !== 'admin' && currentRole !== 'mantenimiento') return;

    const { data: maq } = await dbSupabase.from('maquinas').select('reportes_piezas').eq('id', currentMachineId).single();
    let reportes = maq?.reportes_piezas || {};
    delete reportes[nombrePieza];

    await dbSupabase.from('maquinas').update({ reportes_piezas: reportes }).eq('id', currentMachineId);

    if (reportesCargados[nombrePieza]) {
        delete reportesCargados[nombrePieza];
    }

    cargarModeloMaquinaActual();
}

async function abrirModalAsociarDocumento(nombrePieza) {
    let urlDoc = prompt(`Ingrese la URL del plano o manual PDF para la pieza "${nombrePieza}":`);
    if (!urlDoc) return;

    const { data: maq } = await dbSupabase.from('maquinas').select('documentacion_piezas').eq('id', currentMachineId).single();
    let docs = maq?.documentacion_piezas || {};
    docs[nombrePieza] = { url: urlDoc };

    await dbSupabase.from('maquinas').update({ documentacion_piezas: docs }).eq('id', currentMachineId);
    alert("¡Documentación asociada correctamente!");
    cargarModeloMaquinaActual();
    seleccionarComponente(nombrePieza);
}

async function abrirModalVerReportes() {
    const { data: maq } = await dbSupabase.from('maquinas').select('reportes_piezas').eq('id', currentMachineId).single();
    let reportes = maq?.reportes_piezas || {};

    let contenedor = document.getElementById('lista-reportes-container');
    let tbodyExcel = document.getElementById('tbody-reportes-excel');
    contenedor.innerHTML = '';
    tbodyExcel.innerHTML = '';

    Object.keys(reportes).forEach(piezaName => {
        let rep = reportes[piezaName];
        
        contenedor.innerHTML += `
            <div class="bg-gray-900 border border-gray-700 p-2 rounded mb-2 cursor-pointer hover:border-blue-500 transition-colors" onclick="enfocarPiezaDesdeReporte('${piezaName}')">
                <span class="text-blue-400 font-bold">⚙️ ${piezaName}</span>
                <p class="text-xs text-gray-300 mt-1"><b>Estado:</b> ${rep.estado} | <b>Motivo:</b> ${rep.motivo}</p>
                <p class="text-[10px] text-gray-400 mt-0.5"><b>Fecha:</b> ${rep.fecha}</p>
            </div>`;
            
        tbodyExcel.innerHTML += `<tr><td>${piezaName}</td><td>${rep.estado}</td><td>${rep.motivo}</td><td>${rep.fecha}</td></tr>`;
    });

    const btnExportarExcel = document.getElementById('btn-exportar-excel');
    if (btnExportarExcel) {
        if (currentRole === 'admin') {
            btnExportarExcel.style.display = 'flex';
        } else {
            btnExportarExcel.style.display = 'none';
        }
    }

    document.getElementById('modal-ver-reportes').style.display = 'flex';
}

async function cerrarModalVerReportes() {
    document.getElementById('modal-ver-reportes').style.display = 'none';
}

function enfocarPiezaDesdeReporte(nombrePieza) {
    cerrarModalVerReportes();
    seleccionarComponente(nombrePieza);
}

function exportarReportesExcel() {
    let tbodyExcel = document.getElementById('tbody-reportes-excel');
    if (!tbodyExcel || tbodyExcel.rows.length === 0) {
        alert("No hay reportes para exportar.");
        return;
    }

    let csv = [];
    csv.push(["Pieza", "Estado", "Motivo", "Fecha y Hora"].join(","));

    for (let i = 0; i < tbodyExcel.rows.length; i++) {
        let row = tbodyExcel.rows[i];
        let cols = Array.from(row.cells).map(td => `"${td.innerText.replace(/"/g, '""')}"`);
        csv.push(cols.join(","));
    }

    let csvFile = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    let downloadLink = document.createElement("a");
    downloadLink.download = `Reportes_Mantenimiento_${currentMachineId}_${Date.now()}.csv`;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

async function detectarToque(x, y) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    let listaAExplorar = (modoMedicionActivo && piezaEnMedicion) ? [piezaEnMedicion] : piezasDetectadas;
    const intersects = raycaster.intersectObjects(listaAExplorar, true);
    
    if (intersects.length > 0) {
        let interseccion = intersects[0];
        let puntoInterseccion = interseccion.point; 

        if (window.modoNotaActivo) {
            window.modoNotaActivo = false;
            let mensajeNota = prompt("Escribe tu nota para el siguiente turno:");
            if (mensajeNota) {
                let autorNota = prompt("Tu nombre o turno:") || "Anónimo";
                await guardarNota3D(interseccion.object.name, puntoInterseccion, mensajeNota, autorNota);
            }
            return;
        }

        if (modoMedicionActivo) {
            if (!piezaEnMedicion) {
                aislarPiezaParaMedir(interseccion.object);
            } else {
                manejarPuntoMedicionPreciso(puntoInterseccion, interseccion.object);
            }
            return;
        }

        let objetoSeleccionado = interseccion.object;
        let nombrePieza = objetoSeleccionado.name;
        
        if (modoConfiguracionAdmin) {
            if (!secuenciaPersonalizada.includes(nombrePieza)) {
                secuenciaPersonalizada.push(nombrePieza);
                actualizarUIAdminSecuencia();
                if (objetoSeleccionado.material) {
                    objetoSeleccionado.material.color.setHex(0x3b82f6);
                }
            }
            return;
        }

        seleccionarComponente(nombrePieza);
    }
}

function fijarCamara(tipo) {
    if (tipo === 'iso') {
        cambiarVistaRapida('isometrica');
    } else {
        cambiarVistaRapida(tipo);
    }
}

let secuenciaPersonalizada = []; 
let modoConfiguracionAdmin = false;
let listaPiezasOrdenadas = [];
let pasoActualIndice = 0;
let modoDesensamblajeActivo = false;

async function iniciarDesensamblaje() {
    if (piezasDetectadas.length === 0) {
        alert("No hay piezas detectadas en el modelo 3D.");
        return;
    }

    if (vistaExplosionada) toggleVistaExplosionada();
    modoDesensamblajeActivo = true;
    pasoActualIndice = 0;

    const { data: maq } = await dbSupabase.from('maquinas').select('secuencia_desmontaje').eq('id', currentMachineId).single();
    
    listaPiezasOrdenadas = [];
    if (maq && maq.secuencia_desmontaje && maq.secuencia_desmontaje.length > 0) {
        maq.secuencia_desmontaje.forEach(nombrePieza => {
            let encontrada = piezasDetectadas.find(p => p.name === nombrePieza);
            if (encontrada) listaPiezasOrdenadas.push(encontrada);
        });
    } else {
        listaPiezasOrdenadas = [...piezasDetectadas];
    }
    
    piezasDetectadas.forEach(pieza => {
        if (pieza.userData && pieza.userData.posOrig) {
            pieza.position.copy(pieza.userData.posOrig);
            if (pieza.material) {
                pieza.material.transparent = true;
                pieza.material.opacity = 1.0;
            }
        }
    });

    document.getElementById('panel-paso-a-paso').classList.remove('hidden');

    if (currentRole === 'admin') {
        modoConfiguracionAdmin = true;
        secuenciaPersonalizada = []; 
        document.getElementById('panel-admin-secuencia').classList.remove('hidden');
        actualizarUIAdminSecuencia();
    } else {
        modoConfiguracionAdmin = false;
        document.getElementById('panel-admin-secuencia').classList.add('hidden');
    }

    actualizarEstadoDesensamblaje();
}

function pasoSiguiente() {
    if (!listaPiezasOrdenadas || listaPiezasOrdenadas.length === 0) {
        listaPiezasOrdenadas = [...piezasDetectadas];
    }
    
    let maxPasos = listaPiezasOrdenadas.length > 0 ? listaPiezasOrdenadas.length : piezasDetectadas.length;
    if (pasoActualIndice < maxPasos) {
        pasoActualIndice++;
        actualizarEstadoDesensamblaje();
    }
}

function pasoAnterior() {
    if (pasoActualIndice > 0) {
        pasoActualIndice--;
        actualizarEstadoDesensamblaje();
    }
}

function actualizarEstadoDesensamblaje() {
    const lblPaso = document.getElementById('texto-paso-actual');
    if (lblPaso) {
        let totalPasos = listaPiezasOrdenadas.length > 0 ? listaPiezasOrdenadas.length : piezasDetectadas.length;
        if (pasoActualIndice === 0) {
            lblPaso.innerText = `Paso 0: Preparación`;
        } else {
            lblPaso.innerText = `Paso ${pasoActualIndice} de ${totalPasos}`;
        }
    }
}

function actualizarUIAdminSecuencia() {
    let contenedor = document.getElementById('lista-secuencia-admin');
    if(contenedor) {
        contenedor.innerHTML = "<b>Orden actual:</b> " + (secuenciaPersonalizada.length > 0 ? secuenciaPersonalizada.join(" ➡️ ") : "Ninguna pieza seleccionada aún.");
    }
}

function limpiarSecuenciaActual() {
    secuenciaPersonalizada = [];
    actualizarUIAdminSecuencia();
    
    piezasDetectadas.forEach(p => {
        if (p.material && p.userData) {
            let repInfo = reportesCargados[p.name];
            let colorHex = p.userData.colorBase;
            if (repInfo) {
                if (repInfo.estado === 'mantenimiento') colorHex = 0xef4444;
                else if (repInfo.estado === 'preventivo') colorHex = 0xf59e0b;
            }
            p.material.color.setHex(colorHex);
        }
    });
}

async function borrarSecuenciaGuardada() {
    if (currentRole !== 'admin') {
        alert("Acceso denegado.");
        return;
    }

    if (!confirm("¿Estás seguro de borrar la secuencia guardada de esta máquina?")) return;

    const { error } = await dbSupabase
        .from('maquinas')
        .update({ secuencia_desmontaje: [] })
        .eq('id', currentMachineId);

    if (error) {
        alert("Error al borrar la secuencia: " + error.message);
    } else {
        alert("Secuencia borrada correctamente. Ahora puedes crear una nueva.");
        secuenciaPersonalizada = [];
        listaPiezasOrdenadas = [...piezasDetectadas];
        pasoActualIndice = 0;
        actualizarUIAdminSecuencia();
        actualizarEstadoDesensamblaje();
    }
}

async function guardarSecuenciaPersonalizada() {
    if (secuenciaPersonalizada.length === 0) {
        alert("Primero haz clic en las piezas en orden para definir la secuencia.");
        return;
    }

    const { error } = await dbSupabase
        .from('maquinas')
        .update({ secuencia_desmontaje: secuenciaPersonalizada })
        .eq('id', currentMachineId);

    if (error) {
        alert("Error al guardar la secuencia: " + error.message);
    } else {
        alert("¡Secuencia de desmontaje guardada con éxito!");
        modoConfiguracionAdmin = false;
        document.getElementById('panel-admin-secuencia').classList.add('hidden');
        
        listaPiezasOrdenadas = [];
        secuenciaPersonalizada.forEach(nombre => {
            let p = piezasDetectadas.find(x => x.name === nombre);
            if (p) listaPiezasOrdenadas.push(p);
        });

        pasoActualIndice = 0;
        
        piezasDetectadas.forEach(p => {
            if (p.material && p.userData) {
                let repInfo = reportesCargados[p.name];
                let colorHex = p.userData.colorBase;
                if (repInfo) {
                    if (repInfo.estado === 'mantenimiento') colorHex = 0xef4444;
                    else if (repInfo.estado === 'preventivo') colorHex = 0xf59e0b;
                }
                p.material.color.setHex(colorHex);
            }
        });

        piezasDetectadas.forEach(pieza => {
            if (pieza.userData && pieza.userData.posOrig) {
                pieza.position.copy(pieza.userData.posOrig);
                if (pieza.material) {
                    pieza.material.transparent = true;
                    pieza.material.opacity = 1.0;
                }
            }
        });

        actualizarEstadoDesensamblaje();
    }
}

function cerrarDesensamblaje() {
    modoDesensamblajeActivo = false;
    modoConfiguracionAdmin = false;
    pasoActualIndice = 0;
    document.getElementById('panel-paso-a-paso').classList.add('hidden');
    document.getElementById('panel-admin-secuencia').classList.add('hidden');
    
    piezasDetectadas.forEach(p => {
        if (p.userData && p.userData.posOrig) {
            p.position.copy(p.userData.posOrig);
            if(p.material) {
                p.material.transparent = true;
                p.material.opacity = 1.0;
            }
        }
    });
}

// ==========================================
// HERRAMIENTA DE MEDICIÓN MEJORADA
// ==========================================
let modoMedicionActivo = false;
let piezaEnMedicion = null;
let puntoMedicion1 = null;
let puntoMedicion2 = null;
let lineaMedicionMesh = null;
let esferaPunto1 = null;
let esferaPunto2 = null;

function toggleModoMedicion() {
    modoMedicionActivo = !modoMedicionActivo;
    const panel = document.getElementById('panel-medicion');
    const btn = document.getElementById('btn-medir');

    if (modoMedicionActivo) {
        panel.classList.remove('hidden');
        btn.classList.add('bg-amber-700');
        document.getElementById('resultado-medicion').innerText = "Haga clic en una pieza para aislarla y medir con precisión.";
        document.getElementById('panel-info').classList.add('hidden');
        limpiarMedicionManteniendoModo();
    } else {
        panel.classList.add('hidden');
        btn.classList.remove('bg-amber-700');
        limpiarMedicion();
    }
}

function aislarPiezaParaMedir(piezaSeleccionada) {
    piezaEnMedicion = piezaSeleccionada;
    
    piezasDetectadas.forEach(p => {
        if (p.name === piezaSeleccionada.name) {
            p.visible = true;
            if (p.material) {
                p.material.transparent = false;
                p.material.opacity = 1.0;
                p.material.color.setHex(p.userData.colorBase);
            }
        } else {
            p.visible = false; 
        }
    });

    const box = new THREE.Box3().setFromObject(piezaSeleccionada);
    const centro = box.getCenter(new THREE.Vector3());
    targetControlsTarget = centro.clone();
    const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(2.0); 
    targetCameraPos = centro.clone().add(offset);

    document.getElementById('resultado-medicion').innerText = "Pieza aislada. Haga clic en el primer punto.";
}

function restaurarVisibilidadPiezas() {
    piezaEnMedicion = null;
    piezasDetectadas.forEach(p => {
        p.visible = true;
        if (p.material) {
            p.material.transparent = true;
            p.material.opacity = 1.0;
            let repInfo = reportesCargados[p.name];
            let colorHex = p.userData.colorBase;
            if (repInfo) {
                if (repInfo.estado === 'mantenimiento') colorHex = 0xef4444;
                else if (repInfo.estado === 'preventivo') colorHex = 0xf59e0b;
            }
            p.material.color.setHex(colorHex);
        }
    });
}

const TOLERANCIA_SNAP_AMPLIADA = 0.08; 

function manejarPuntoMedicionPreciso(puntoInterseccionGlobal, meshObjetivo) {
    const res = document.getElementById('resultado-medicion');

    const resultadoSnap = calcularSnappingInteligente(puntoInterseccionGlobal, meshObjetivo, TOLERANCIA_SNAP_AMPLIADA);

    if (!resultadoSnap) {
        res.innerText = "⚠️ Acerque un poco más el cursor al vértice o arista de la pieza.";
        return; 
    }

    const puntoAjustado = resultadoSnap.punto.clone();

    if (!puntoMedicion1) {
        puntoMedicion1 = puntoAjustado.clone();
        res.innerText = "Punto 1 fijado correctamente. Seleccione el segundo punto.";
        
        const geometry = new THREE.SphereGeometry(0.003, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        esferaPunto1 = new THREE.Mesh(geometry, material);
        esferaPunto1.position.copy(puntoMedicion1);
        scene.add(esferaPunto1);

    } else if (!puntoMedicion2) {
        puntoMedicion2 = puntoAjustado.clone();
        
        const geometry = new THREE.SphereGeometry(0.003, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        esferaPunto2 = new THREE.Mesh(geometry, material);
        esferaPunto2.position.copy(puntoMedicion2);
        scene.add(esferaPunto2);

        let distancia = puntoMedicion1.distanceTo(puntoMedicion2);
        let distanciaMm = distancia * 1000; 
        
        let textoMedida = `<b>Distancia:</b> ${distancia.toFixed(4)} m (${distanciaMm.toFixed(2)} mm)`;
        if (resultadoSnap.esCercanoACilindro || distanciaMm > 1) {
            let diametroEstimadoMm = distanciaMm; 
            let radioEstimadoMm = diametroEstimadoMm / 2;
            textoMedida += `<br><b>Ø Diámetro Est.:</b> ${diametroEstimadoMm.toFixed(2)} mm | <b>Radio:</b> ${radioEstimadoMm.toFixed(2)} mm`;
        }

        res.innerHTML = textoMedida;

        const materialLinea = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 3 });
        const puntosLinea = [puntoMedicion1, puntoMedicion2];
        const geometriaLinea = new THREE.BufferGeometry().setFromPoints(puntosLinea);
        lineaMedicionMesh = new THREE.Line(geometriaLinea, materialLinea);
        scene.add(lineaMedicionMesh);

    } else {
        if (esferaPunto1) scene.remove(esferaPunto1);
        if (esferaPunto2) scene.remove(esferaPunto2);
        if (lineaMedicionMesh) scene.remove(lineaMedicionMesh);

        puntoMedicion1 = puntoAjustado.clone();
        puntoMedicion2 = null;
        esferaPunto2 = null;
        lineaMedicionMesh = null;

        res.innerText = "Punto 1 fijado. Seleccione el segundo punto.";
        const geometry = new THREE.SphereGeometry(0.003, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        esferaPunto1 = new THREE.Mesh(geometry, material);
        esferaPunto1.position.copy(puntoMedicion1);
        scene.add(esferaPunto1);
    }
}

function calcularSnappingInteligente(puntoGlobal, mesh, tolerancia) {
    const geometry = mesh.geometry;
    const positionAttribute = geometry.attributes.position;
    
    let localPoint = puntoGlobal.clone();
    mesh.worldToLocal(localPoint);

    let minDist = Infinity;
    let mejorPuntoLocal = localPoint.clone();

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const tempPuntoArista = new THREE.Vector3();

    const index = geometry.index;
    
    if (index) {
        for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i);
            const b = index.getX(i + 1);
            const c = index.getX(i + 2);

            vA.fromBufferAttribute(positionAttribute, a);
            vB.fromBufferAttribute(positionAttribute, b);

            [vA, vB].forEach(v => {
                let dist = localPoint.distanceTo(v);
                if (dist < minDist) {
                    minDist = dist;
                    mejorPuntoLocal.copy(v);
                }
            });

            let distArista = distanciaPuntoSegmento(localPoint, vA, vB, tempPuntoArista);
            if (distArista < minDist) {
                minDist = distArista;
                mejorPontoLocal.copy(tempPuntoArista);
            }
        }
    }

    if (minDist <= tolerancia) {
        let mejorPuntoGlobal = mejorPuntoLocal.clone();
        mesh.localToWorld(mejorPuntoGlobal);
        return { punto: mejorPuntoGlobal, esCercanoACilindro: false };
    }

    return { punto: puntoGlobal, esCercanoACilindro: true };
}

function distanciaPuntoSegmento(p, a, b, target) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);
    let t = ap.dot(ab) / ab.dot(ab);
    t = Math.max(0, Math.min(1, t));
    target.copy(a).addScaledVector(ab, t);
    return p.distanceTo(target);
}

function limpiarMedicionManteniendoModo() {
    puntoMedicion1 = null;
    puntoMedicion2 = null;
    
    if (lineaMedicionMesh) { scene.remove(lineaMedicionMesh); lineaMedicionMesh = null; }
    if (esferaPunto1) { scene.remove(esferaPunto1); esferaPunto1 = null; }
    if (esferaPunto2) { scene.remove(esferaPunto2); esferaPunto2 = null; }
    
    restaurarVisibilidadPiezas();
}

function limpiarMedicion() {
    limpiarMedicionManteniendoModo();
    const res = document.getElementById('resultado-medicion');
    if (res && modoMedicionActivo) res.innerText = "Haga clic en una pieza para aislarla y medir con precisión.";
}

// ==========================================
// 1. REALIDAD AUMENTADA (AR / WebXR) - CORREGIDO
// ==========================================
function iniciarRealidadAumentada() {
    if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            if (supported) {
                alert("Iniciando modo AR. Apunte la cámara hacia una superficie plana en planta.");
            } else {
                fallbackAR_Movil();
            }
        }).catch(() => {
            fallbackAR_Movil();
        });
    } else {
        fallbackAR_Movil();
    }
}

async function fallbackAR_Movil() {
    const { data: maq } = await dbSupabase.from('maquinas').select('modelo_url').eq('id', currentMachineId).single();
    if (maq && maq.modelo_url) {
        window.open(maq.modelo_url, '_blank');
    } else {
        alert("Este dispositivo o modelo no soporta AR directo en este momento.");
    }
}

// ==========================================
// 2. BIBLIOTECA DE REPUESTOS Y STOCK (SKU)
// ==========================================
async function cargarDatosInventarioPieza(nombrePieza) {
    const { data: rep } = await dbSupabase
        .from('repuestos_inventario')
        .select('*')
        .eq('maquina_id', currentMachineId)
        .eq('nombre_pieza', nombrePieza)
        .single();

    const contenedorInventario = document.getElementById('panel-inventario-pieza');
    if (!contenedorInventario) return;

    if (rep) {
        contenedorInventario.innerHTML = `
            <div class="bg-gray-800 p-2 rounded mt-2 border border-gray-700 text-xs">
                <p><b>SKU:</b> ${rep.sku}</p>
                <p><b>Stock Almacén:</b> <span class="${rep.stock_actual > 0 ? 'text-green-400' : 'text-red-400 font-bold'}">${rep.stock_actual} unidades</span></p>
                <p><b>Ubicación:</b> ${rep.ubicacion_almacen || 'No especificada'}</p>
                <button onclick="solicitarRepuestoAlPanol('${nombrePieza}', '${rep.sku}')" class="mt-2 w-full py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white font-bold">
                    🛒 Solicitar al Pañol
                </button>
            </div>
        `;
    } else {
        contenedorInventario.innerHTML = `
            <div class="bg-gray-800 p-2 rounded mt-2 text-xs text-gray-400">
                <p>No hay SKU vinculado a esta pieza.</p>
                ${currentRole === 'admin' ? `<button onclick="vincularSkuPrompt('${nombrePieza}')" class="mt-1 text-blue-400 underline">Vincular SKU ahora</button>` : ''}
            </div>
        `;
    }
}

async function solicitarRepuestoAlPanol(nombrePieza, sku) {
    let solicitantName = prompt("Ingrese su nombre y turno para la solicitud:");
    if (!solicitantName) return;

    const { error } = await dbSupabase.from('solicitudes_repuestos').insert([
        { maquina_id: currentMachineId, nombre_pieza: nombrePieza, sku: sku, solicitante: solicitantName, estado: 'pendiente' }
    ]);

    if (error) alert("Error al solicitar: " + error.message);
    else alert("¡Solicitud enviada al pañol con éxito!");
}

// ==========================================
// 3. ANOTACIONES COLABORATIVAS 3D
// ==========================================
let puntoClicadoParaNota = null;

function activarModoCrearNota(nombrePieza) {
    alert("Haz clic en el punto exacto de la pieza donde deseas dejar la nota colaborativa.");
    window.modoNotaActivo = true;
}

async function guardarNota3D(nombrePieza, puntoCoord, mensaje, autor) {
    const { error } = await dbSupabase.from('anotaciones_3d').insert([{
        maquina_id: currentMachineId,
        nombre_pieza: nombrePieza,
        pos_x: puntoCoord.x,
        pos_y: puntoCoord.y,
        pos_z: puntoCoord.z,
        autor: autor,
        mensaje: mensaje
    }]);

    if (!error) {
        alert("Nota 3D guardada para el siguiente turno.");
        cargarNotas3DEnModelo();
    }
}

async function cargarNotas3DEnModelo() {
    const { data: notas } = await dbSupabase
        .from('anotaciones_3d')
        .select('*')
        .eq('maquina_id', currentMachineId);

    if (!notas) return;

    notas.forEach(nota => {
        const geometry = new THREE.ConeGeometry(0.02, 0.05, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const pin = new THREE.Mesh(geometry, material);
        
        pin.position.set(nota.pos_x, nota.pos_y, nota.pos_z);
        pin.userData = { esNota: true, mensaje: nota.mensaje, autor: nota.autor, fecha: nota.fecha };
        grupoMaquina.add(pin);
    });
}
