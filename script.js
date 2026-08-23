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
    // 🔍 Filtramos las máquinas de Supabase según la línea actual
    const { data: maquinas, error } = await dbSupabase
        .from('maquinas')
        .select('*')
        .eq('linea', currentLine); // <--- FILTRO INDIVIDUAL POR LÍNEA

    if (error) {
        console.error("Error al cargar las maquinas:", error);
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

// ==========================================
// FUNCIÓN DE AGREGAR MÁQUINA INDIVIDUAL
// ==========================================
async function addNewMachine() {
    if (currentRole !== 'admin') {
        alert("No tienes permisos para realizar esta acción.");
        return;
    }

    // ➕ Insertamos la máquina vinculada estrictamente a la línea actual
    const { data, error } = await dbSupabase
        .from('maquinas')
        .insert([
            { 
                nombre: "Nueva Máquina",
                modelo_url: "EMPTY",
                manual_url: "EMPTY",
                linea: currentLine // <--- GUARDAMOS LA LÍNEA ACTUAL
            }
        ]);

    if (error) {
        console.error("Error al agregar máquina:", error.message);
        alert("No se pudo agregar la máquina: " + error.message);
    } else {
        renderMachines();
    }
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

    ocultarBannerEnCreacion();
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

// ==========================================
// CARGA Y EDICIÓN DEL KÁRDEX
// ==========================================
async function loadKardexData() {
    const targetId = typeof currentMachineId !== 'undefined' ? currentMachineId : null;
    if (!targetId) return;

    // Usamos 'dbSupabase' que es el nombre correcto en tu código
    const { data, error } = await dbSupabase
        .from('maquinas')
        .select('*')
        .eq('id', targetId)
        .single();

    if (error || !data) return;

    const sub = document.getElementById('kardex-subtitle');
    if (sub) sub.innerText = `Activo: ${data.nombre}`;

    await cargarKardexMaquina(targetId);
}
// Guardar Metadatos del Kárdex en Supabase
async function guardarCambiosKardexMeta() {
    if (currentRole !== 'admin') return;

    let metaActualizada = {
        area: document.getElementById('k-area').value,
        codigo: document.getElementById('k-codigo').value,
        femision: document.getElementById('k-femision').value,
        eq_marca: document.getElementById('k-eq-marca').value,
        eq_capacidad: document.getElementById('k-eq-capacidad').value,
        eq_material: document.getElementById('k-eq-material').value,
        eq_serie: document.getElementById('k-eq-serie').value,
        eq_modelo: document.getElementById('k-eq-modelo').value
    };

    const { error } = await dbSupabase
        .from('maquinas')
        .update({ meta: metaActualizada })
        .eq('id', currentMachineId);

    if (error) {
        console.error("Error al guardar metadatos del Kárdex:", error.message);
    }
}

// Renderizar y gestionar Motores
function renderMotors(motors, isAdmin) {
    let container = document.getElementById('motors-container');
    if (!container) return;
    container.innerHTML = '';
    
    motors.forEach((motor, index) => {
        let html = `
            <div class="motor-block" style="border: 1px solid #ccc; padding: 8px; margin-bottom: 8px; background: #fff; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 10px; margin-bottom: 4px;">
                    <span>MOTOR Nº ${index + 1}</span>
                    ${isAdmin ? `<span style="color: red; cursor: pointer;" onclick="removeMotorBlock(${index})">Eliminar Motor</span>` : ''}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 9px;">
                    <div>MARCA: <input type="text" ${!isAdmin ? 'readonly' : ''} value="${motor.marca || ''}" oninput="updateMotor(${index}, 'marca', this.value)" style="width:100%"></div>
                    <div>HP: <input type="text" ${!isAdmin ? 'readonly' : ''} value="${motor.hp || ''}" oninput="updateMotor(${index}, 'hp', this.value)" style="width:100%"></div>
                    <div>KW: <input type="text" ${!isAdmin ? 'readonly' : ''} value="${motor.kw || ''}" oninput="updateMotor(${index}, 'kw', this.value)" style="width:100%"></div>
                    <div>RPM: <input type="text" ${!isAdmin ? 'readonly' : ''} value="${motor.rpm || ''}" oninput="updateMotor(${index}, 'rpm', this.value)" style="width:100%"></div>
                    <div>VOLTIOS: <input type="text" ${!isAdmin ? 'readonly' : ''} value="${motor.voltios || ''}" oninput="updateMotor(${index}, 'voltios', this.value)" style="width:100%"></div>
                    <div>AMP: <input type="text" ${!isAdmin ? 'readonly' : ''} value="${motor.amp || ''}" oninput="updateMotor(${index}, 'amp', this.value)" style="width:100%"></div>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

async function addMotorBlock() {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('motors').eq('id', currentMachineId).single();
    let motors = maq?.motors || [];
    motors.push({ marca: '', hp: '', kw: '', rpm: '', voltios: '', amp: '' });
    
    await dbSupabase.from('maquinas').update({ motors }).eq('id', currentMachineId);
    renderMotors(motors, true);
}

async function removeMotorBlock(index) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('motors').eq('id', currentMachineId).single();
    let motors = maq?.motors || [];
    motors.splice(index, 1);
    
    await dbSupabase.from('maquinas').update({ motors }).eq('id', currentMachineId);
    renderMotors(motors, true);
}

async function updateMotor(index, field, value) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('motors').eq('id', currentMachineId).single();
    let motors = maq?.motors || [];
    if(motors[index]) {
        motors[index][field] = value;
        await dbSupabase.from('maquinas').update({ motors }).eq('id', currentMachineId);
    }
}

// Renderizar y gestionar la tabla de repuestos
function renderKardexRows(repuestos, isAdmin) {
    let tbody = document.getElementById('kardex-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    repuestos.forEach((rep, index) => {
        let row = `<tr>
            <td>${index + 1}</td>
            <td><input type="text" ${!isAdmin ? 'readonly' : ''} value="${rep.categoria || ''}" oninput="updateRepuesto(${index}, 'categoria', this.value)" style="width:100%"></td>
            <td><input type="text" ${!isAdmin ? 'readonly' : ''} value="${rep.descripcion || ''}" oninput="updateRepuesto(${index}, 'descripcion', this.value)" style="width:100%"></td>
            <td><input type="text" ${!isAdmin ? 'readonly' : ''} value="${rep.um || ''}" oninput="updateRepuesto(${index}, 'um', this.value)" style="width:100%"></td>
            <td><input type="text" ${!isAdmin ? 'readonly' : ''} value="${rep.cantidad || ''}" oninput="updateRepuesto(${index}, 'cantidad', this.value)" style="width:100%"></td>
            ${isAdmin ? `<td><button onclick="removeKardexRow(${index})" style="color:red; background:none; border:none; cursor:pointer;">X</button></td>` : '<td></td>'}
        </tr>`;
        tbody.innerHTML += row;
    });
}

async function addKardexRow() {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('kardex').eq('id', currentMachineId).single();
    let kardex = maq?.kardex || [];
    kardex.push({ categoria: '', descripcion: '', um: '', cantidad: '' });
    
    await dbSupabase.from('maquinas').update({ kardex }).eq('id', currentMachineId);
    renderKardexRows(kardex, true);
}

async function removeKardexRow(index) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('kardex').eq('id', currentMachineId).single();
    let kardex = maq?.kardex || [];
    kardex.splice(index, 1);
    
    await dbSupabase.from('maquinas').update({ kardex }).eq('id', currentMachineId);
    renderKardexRows(kardex, true);
}

async function updateRepuesto(index, field, value) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('kardex').eq('id', currentMachineId).single();
    let kardex = maq?.kardex || [];
    if(kardex[index]) {
        kardex[index][field] = value;
        await dbSupabase.from('maquinas').update({ kardex }).eq('id', currentMachineId);
    }
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
                <span class="manual-name" title="${man.name || man.nombre}">${man.name || man.nombre}</span>
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

function mostrarBannerEnCreacion(texto) {
    let container = document.getElementById('view-visual3d');
    if (!container) return;
    
    let banner = document.getElementById('banner-modelo-creacion');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'banner-modelo-creacion';
        banner.style.position = 'absolute';
        banner.style.top = '70px';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.backgroundColor = 'rgba(239, 68, 68, 0.95)';
        banner.style.color = '#ffffff';
        banner.style.padding = '12px 24px';
        banner.style.borderRadius = '8px';
        banner.style.fontWeight = 'bold';
        banner.style.fontSize = '15px';
        banner.style.zIndex = '1000';
        banner.style.boxShadow = '0 6px 15px rgba(0,0,0,0.5)';
        banner.style.textAlign = 'center';
        banner.style.border = '2px solid #f87171';
        container.style.position = 'relative';
        container.appendChild(banner);
    }
    banner.innerHTML = `⚠️ ${texto}`;
    banner.style.display = 'block';
}

function ocultarBannerEnCreacion() {
    let banner = document.getElementById('banner-modelo-creacion');
    if (banner) {
        banner.style.display = 'none';
    }
}

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
        inputBuscador.value = "";
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
    
    while(grupoMaquina.children.length > 0) {
        grupoMaquina.remove(grupoMaquina.children[0]);
    }

    const { data: maq } = await dbSupabase.from('maquinas').select('modelo_url').eq('id', currentMachineId).single();

    if (!maq || !maq.modelo_url || maq.modelo_url.trim() === "" || maq.modelo_url === "EMPTY") {
        let indicador = document.getElementById('indicador-equipo');
        if(indicador) indicador.innerText = `⚠️ Modelo aún en creación`;
        
        mostrarBannerEnCreacion("Modelo 3D aún en creación / desarrollo");
        
        if(btnExplo) {
            btnExplo.innerText = "💥 Activar Vista Explosionada";
            btnExplo.disabled = true;
        }
        
        const lista = document.getElementById('lista-partes');
        if(lista) lista.innerHTML = `<span style="color: #888; font-size: 11px; padding: 10px; display: block;">No hay piezas disponibles.</span>`;
        return; 
    }

    ocultarBannerEnCreacion();

    if(btnExplo) {
        btnExplo.innerText = "⏳ Cargando modelo... 0%";
        btnExplo.disabled = true;
    }

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
}

async function cargarModeloPorDefecto() {
    const btnExplo = document.getElementById('btn-explo');
    if(btnExplo) {
        btnExplo.innerText = "💥 Activar Vista Explosionada";
        btnExplo.disabled = false;
    }
    let indicador = document.getElementById('indicador-equipo');
    if(indicador) indicador.innerText = `⚠️ Modelo aún en creación`;
    mostrarBannerEnCreacion("Modelo 3D aún en creación / desarrollo");
}

async function procesarModeloCargado(gltf, nombreEquipo) {
    ocultarBannerEnCreacion();
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
                <div class="mb-2 p-1.5 bg-gray-800 rounded border border-gray-700">
                    <a href="${docInfo.url}" target="_blank" class="w-full py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold text-[11px] text-center block mb-1">
                        📄 Ver Plano / Manual de Pieza
                    </a>
                    ${currentRole === 'admin' ? `<button onclick="eliminarManualPieza('${nombrePieza}')" class="w-full py-1 bg-red-700 hover:bg-red-600 rounded text-white text-[10px]">🗑️ Eliminar Manual de Pieza</button>` : ''}
                </div>`;
        } else if (currentRole === 'admin') {
            contenedorAcciones.innerHTML += `
                <div class="mb-2 p-2 bg-gray-800 rounded border border-gray-700">
                    <label class="block text-[10px] font-bold text-amber-400 mb-1">📎 Adjuntar Manual PDF a esta pieza:</label>
                    <input type="file" id="input-pdf-pieza" accept=".pdf" class="block w-full text-[10px] text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 cursor-pointer mb-1"/>
                    <button onclick="subirManualPieza3D('${nombrePieza}')" class="w-full py-1 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold text-[10px]">
                        💾 Subir y Guardar PDF
                    </button>
                </div>`;
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

async function subirManualPieza3D(nombrePieza) {
    const fileInput = document.getElementById('input-pdf-pieza');
    if (!fileInput || !fileInput.files[0]) {
        alert("Por favor, selecciona un archivo PDF primero.");
        return;
    }

    const archivo = fileInput.files[0];
    const nombreLimpio = nombrePieza.replace(/[^a-zA-Z0-9]/g, "_");
    const rutaArchivo = `piezas/${currentMachineId}_${nombreLimpio}_${Date.now()}.pdf`;

    try {
        const { error: uploadError } = await dbSupabase.storage
            .from('manuales')
            .upload(rutaArchivo, archivo);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = dbSupabase.storage
            .from('manuales')
            .getPublicUrl(rutaArchivo);

        const urlPublica = publicUrlData.publicUrl;

        const { data: maq } = await dbSupabase.from('maquinas').select('documentacion_piezas').eq('id', currentMachineId).maybeSingle();
        let docs = maq?.documentacion_piezas || {};
        docs[nombrePieza] = { url: urlPublica, name: archivo.name };

        const { error: dbError } = await dbSupabase
            .from('maquinas')
            .update({ documentacion_piezas: docs })
            .eq('id', currentMachineId);

        if (dbError) throw dbError;

        alert(`¡Manual PDF subido con éxito para la pieza "${nombrePieza}"!`);
        documentacionPiezasCargada = docs;
        seleccionarComponente(nombrePieza);

    } catch (err) {
        console.error("Error al adjuntar manual:", err);
        alert("Ocurrió un error al subir el PDF: " + err.message);
    }
}

async function eliminarManualPieza(nombrePieza) {
    if (!confirm(`¿Deseas eliminar el manual asociado a la pieza "${nombrePieza}"?`)) return;

    try {
        const { data: maq } = await dbSupabase.from('maquinas').select('documentacion_piezas').eq('id', currentMachineId).maybeSingle();
        let docs = maq?.documentacion_piezas || {};
        delete docs[nombrePieza];

        const { error } = await dbSupabase
            .from('maquinas')
            .update({ documentacion_piezas: docs })
            .eq('id', currentMachineId);

        if (error) throw error;

        alert("Manual de pieza eliminado correctamente.");
        documentacionPiezasCargada = docs;
        seleccionarComponente(nombrePieza);
    } catch (err) {
        console.error("Error al eliminar manual de pieza:", err);
        alert("No se pudo eliminar el manual: " + err.message);
    }
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

    let todosLosObjetos = [];
    grupoMaquina.traverse(child => {
        if (child.isMesh) todosLosObjetos.push(child);
    });

    let listaAExplorar = (modoMedicionActivo && piezaEnMedicion) ? [piezaEnMedicion] : todosLosObjetos;
    const intersects = raycaster.intersectObjects(listaAExplorar, true);
    
    if (intersects.length > 0) {
        let interseccion = intersects[0];
        let objetoSeleccionado = interseccion.object;

        if (objetoSeleccionado.userData && objetoSeleccionado.userData.esNota) {
            let datos = objetoSeleccionado.userData;
            alert(`📌 Nota 3D para el turno:\n\n"${datos.mensaje}"\n\n✍️ Escrito por: ${datos.autor}`);
            return; 
        }

        let puntoInterseccion = interseccion.point; 

        if (window.modoNotaActivo) {
            window.modoNotaActivo = false;
            let mensajeNota = prompt("Escribe tu nota para el siguiente turno:");
            if (mensajeNota) {
                let autorNota = prompt("Tu nombre o turno:") || "Anónimo";
                await guardarNota3D(objetoSeleccionado.name, puntoInterseccion, mensajeNota, autorNota);
            }
            return;
        }

        if (modoMedicionActivo) {
            if (!piezaEnMedicion) {
                aislarPiezaParaMedir(objetoSeleccionado);
            } else {
                manejarPuntoMedicionPreciso(puntoInterseccion, objetoSeleccionado);
            }
            return;
        }

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
                mejorPuntoLocal.copy(tempPuntoArista);
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

async function iniciarRealidadAumentada() {
    if ('xr' in navigator) {
        try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if (supported) {
                const session = await navigator.xr.requestSession('immersive-ar', {
                    requiredFeatures: ['hit-test', 'local-floor']
                });
                
                renderer.xr.enabled = true;
                await renderer.xr.setSession(session);

                session.addEventListener('end', () => {
                    renderer.xr.enabled = false;
                });
            } else {
                fallbackAR_Movil();
            }
        } catch (error) {
            console.error("Error al iniciar WebXR:", error);
            fallbackAR_Movil();
        }
    } else {
        fallbackAR_Movil();
    }
}

async function fallbackAR_Movil() {
    const { data, error } = await dbSupabase
        .from('maquinas')
        .select('modelo_url')
        .eq('id', currentMachineId)
        .single();

    if (data && data.modelo_url) {
        let urlModelo = data.modelo_url;
        let esAndroid = /android/i.test(navigator.userAgent);
        
        if (esAndroid) {
            let intentUrl = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(urlModelo)}&mode=ar_preferred#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;end;`;
            
            let enlace = document.createElement('a');
            enlace.href = intentUrl;
            document.body.appendChild(enlace);
            enlace.click();
            document.body.removeChild(enlace);
        } else {
            window.open(urlModelo, '_blank');
        }
    } else {
        alert("Este dispositivo o modelo no soporta AR directo en este momento.");
    }
}

async function cargarDatosInventarioPieza(nombrePieza) {
    const { data: rep, error } = await dbSupabase
        .from('repuestos_inventario')
        .select('*')
        .eq('maquina_id', currentMachineId)
        .eq('nombre_pieza', nombrePieza)
        .maybeSingle();

    if (error) {
        console.warn("Aviso al cargar inventario de pieza:", error.message);
    }

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
                ${currentRole === 'admin' ? `<button onclick="vincularSkuAhora('${nombrePieza}')" class="mt-1 text-blue-400 underline">Vincular SKU ahora</button>` : ''}
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

window.vincularSkuAhora = typeof vincularSkuAhora !== 'undefined' ? vincularSkuAhora : function(nombrePieza) {
    let sku = prompt(`Ingrese el SKU para la pieza "${nombrePieza}":`);
    if (!sku) return;
    dbSupabase.from('repuestos_inventario').insert([
        { maquina_id: currentMachineId, nombre_pieza: nombrePieza, sku: sku, stock_actual: 0 }
    ]).then(({ error }) => {
        if (error) alert("Error al vincular SKU: " + error.message);
        else {
            alert("¡SKU vinculado con éxito!");
            cargarDatosInventarioPieza(nombrePieza);
        }
    });
};

window.removeInstructionImage = typeof removeInstructionImage !== 'undefined' ? removeInstructionImage : async function(idx) {
    const { data: maq } = await dbSupabase.from('maquinas').select('instruction_images').eq('id', currentMachineId).single();
    let images = maq?.instruction_images || [];
    images.splice(idx, 1);
    await dbSupabase.from('maquinas').update({ instruction_images: images }).eq('id', currentMachineId);
    loadInstructionsData();
};

window.removeManualPdf = typeof removeManualPdf !== 'undefined' ? removeManualPdf : async function(idx) {
    const { data: maq } = await dbSupabase.from('maquinas').select('manuals_pdf').eq('id', currentMachineId).single();
    let manuals = maq?.manuals_pdf || [];
    manuals.splice(idx, 1);
    await dbSupabase.from('maquinas').update({ manuals_pdf: manuals }).eq('id', currentMachineId);
    loadManualsData();
};

async function subirManualPdf() {
    const fileInput = document.getElementById('pdf-file-input');
    if (!fileInput || !fileInput.files[0]) {
        alert("Por favor selecciona un archivo PDF primero.");
        return;
    }

    const file = fileInput.files[0];
    const fileName = `manual_${currentMachineId}_${Date.now()}.pdf`;
    
    const { error } = await dbSupabase.storage
        .from('manuales')
        .upload(fileName, file);

    if (error) {
        alert("Error al subir el PDF: " + error.message);
        return;
    }

    const { data: { publicUrl } } = dbSupabase.storage
        .from('manuales')
        .getPublicUrl(fileName);

    const { data: maq } = await dbSupabase.from('maquinas').select('manuals_pdf').eq('id', currentMachineId).maybeSingle();
    let manuals = maq?.manuals_pdf || [];
    manuals.push({ name: file.name, url: publicUrl });

    const { error: updateError } = await dbSupabase
        .from('maquinas')
        .update({ manuals_pdf: manuals })
        .eq('id', currentMachineId);

    if (updateError) {
        alert("Error al guardar la referencia del manual: " + updateError.message);
    } else {
        alert("¡Manual PDF subido y guardado con éxito!");
        fileInput.value = ""; 
        if (typeof loadManualsData === 'function') loadManualsData();
    }
}

function manejarIncompatibilidadAR() {
    let usarModeloWeb = confirm("Tu dispositivo no soporta Realidad Aumentada en vivo. ¿Deseas explorar la máquina en el visor 3D interactivo en pantalla?");
    if (usarModeloWeb) {
        renderer.xr.enabled = false;
    }
}

function guardarKardexEnNube() {
    // Recolectar datos del kárdex (metadatos, motores, repuestos)
    const kardexData = {
        machine_id: currentMachineId, // 🔑 Vínculo vital con la máquina actual
        area: document.getElementById('k-area').value,
        codigo: document.getElementById('k-codigo').value,
        femision: document.getElementById('k-femision').value,
        eq_marca: document.getElementById('k-eq-marca').value,
        eq_capacidad: document.getElementById('k-eq-capacidad').value,
        eq_material: document.getElementById('k-eq-material').value,
        eq_serie: document.getElementById('k-eq-serie').value,
        eq_modelo: document.getElementById('k-eq-modelo').value,
        repuestos: obtenerDatosTablaRepuestos() // Array con las filas de repuestos
    };

    // Guardar en Supabase o localForage asociado a la máquina
    dbSupabase
        .from('kardex_details')
        .upsert([kardexData], { onConflict: ['machine_id'] })
        .then(({ error }) => {
            if (error) console.error("Error al guardar Kárdex:", error);
        });
}
// Función para procesar el texto plano tabulado de Excel y renderizar la tabla
async function procesarTextoExcel() {
    const rawData = document.getElementById('paste-excel-input').value;
    if (!rawData.trim()) {
        alert("Por favor pega primero las celdas copiadas de Excel.");
        return;
    }

    renderizarTablaKardex(rawData);
    document.getElementById('paste-excel-input').value = '';

    if (currentMachineId) {
        const { error } = await dbSupabase
            .from('maquinas')
            .update({ kardex_raw: rawData })
            .eq('id', currentMachineId);

        if (error) {
            console.error("Error al guardar el Kárdex:", error);
            alert("Hubo un error al guardar en la nube.");
        } else {
            alert("¡Tabla de Kárdex guardada correctamente!");
        }
    }
}
// Guardar los datos de la tabla pegada vinculados al ID de la máquina
async function guardarKardexEnSupabase(rawTextData) {
    if (!currentMachineId) return;

    const { error } = await dbSupabase
        .from('maquina')
        .update({ kardex_raw: rawTextData })
        .eq('id', currentMachineId);

    if (error) {
        console.error("Error al guardar el Kárdex:", error);
        alert("Hubo un error al guardar en la nube.");
    } else {
        alert("¡Tabla de Kárdex guardada correctamente para esta máquina!");
    }
}


// 2. Renderizar el texto tabulado en una tabla HTML idéntica
function renderizarTablaKardex(rawTextData) {
    const container = document.getElementById('kardex-excel-table-container');
    if (!container) return;

    if (!rawTextData || !rawTextData.trim()) {
        container.innerHTML = '<p style="font-size: 12px; color: #888; text-align: center; margin: 20px 0;">No hay información de Kárdex disponible para esta máquina.</p>';
        return;
    }

    const rows = rawTextData.trim().split('\n');
    
    // Contenedor con scroll horizontal para mantener la estructura sin deformarse
    let htmlTable = '<div style="overflow-x: auto; width: 100%;"><table style="width:100%; border-collapse: collapse; font-size: 10px; font-family: Arial, sans-serif; text-align: left; background: #fff;"><tbody>';

    rows.forEach((row, rowIndex) => {
        const cells = row.split('\t');
        htmlTable += '<tr style="height: 24px;">';

        cells.forEach((cell, cellIndex) => {
            const cellValue = cell ? cell.trim() : '';
            
            // Estilo diferente para la primera fila (cabecera principal)
            if (rowIndex === 0) {
                htmlTable += `<th style="border: 1px solid #b0b0b0; padding: 5px 8px; background-color: #2b2d42; color: #fff; font-weight: bold; white-space: nowrap;">${cellValue}</th>`;
            } else {
                // Filas de datos normales con bordes limpios de Excel
                let bgStyle = cellValue === "" ? "background-color: #fafafa;" : "background-color: #ffffff;";
                htmlTable += `<td style="border: 1px solid #d3d3d3; padding: 4px 6px; color: #333; ${bgStyle}">${cellValue}</td>`;
            }
        });

        htmlTable += '</tr>';
    });

    htmlTable += '</tbody></table></div>';
    container.innerHTML = htmlTable;
}
async function procesarUnaSolaHojaExcel() {
    const fileInput = document.getElementById('excel-file-input');
    const sheetNameInput = document.getElementById('excel-sheet-name-input');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Por favor selecciona un archivo de Excel.");
        return;
    }

    const targetSheetName = sheetNameInput.value.trim();
    if (!targetSheetName) {
        alert("Por favor escribe el nombre de la hoja que deseas extraer (ej. ZARANDA).");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Validar si la hoja existe en el archivo
        if (!workbook.Sheets[targetSheetName]) {
            alert(`No se encontró ninguna hoja con el nombre "${targetSheetName}". Hojas disponibles: ${workbook.SheetNames.join(', ')}`);
            return;
        }

        // Extraer únicamente la hoja seleccionada
const worksheet = workbook.Sheets[targetSheetName];
        const htmlTableRaw = XLSX.utils.sheet_to_html(worksheet, { header: "" });
        
        // 🔑 Inyectamos la imagen asegurando la ruta y el tamaño correcto
        const styledHtml = htmlTableRaw
            .replace('<table', '<table style="width:100%; border-collapse: collapse; font-size: 10px; font-family: Arial, sans-serif; background: #fff;"')
            .replace(
                '<td>', 
                '<td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 4px;"><img src="img/logo.jpg" alt="Logo" style="max-height: 35px; width: auto; display: block; margin: 0 auto;" /></td>'
            );
        // Mostrar en pantalla
        const container = document.getElementById('kardex-excel-table-container');
        if (container) {
            container.innerHTML = `<div style="overflow-x: auto; width: 100%;"><p style="font-weight: bold; font-size: 11px; margin-bottom: 5px; color: #2b2d42;">Hoja: ${targetSheetName}</p>${styledHtml}</div>`;
        }

        // Guardar solo esta hoja HTML directamente en Supabase
        if (currentMachineId) {
            const { error } = await dbSupabase
                .from('maquinas') // O 'maquinas' según tu tabla
                .update({ kardex_raw: styledHtml })
                .eq('id', currentMachineId);

            if (error) {
                console.error("Error al guardar en Supabase:", error);
                alert("Hubo un error al guardar en la nube.");
            } else {
                alert(`¡La hoja "${targetSheetName}" se cargó y guardó correctamente!`);
            }
        }
    };

    reader.readAsArrayBuffer(file);
}

// Cargar la hoja guardada al abrir la máquina
async function cargarKardexMaquina(machineId) {
    const pasteZone = document.getElementById('admin-kardex-paste-zone');
    if (pasteZone) {
        pasteZone.style.display = (currentRole === 'admin') ? 'block' : 'none';
    }

    const { data, error } = await dbSupabase
        .from('maquinas') // O 'maquinas' según tu tabla
        .select('kardex_raw')
        .eq('id', machineId)
        .single();

    const container = document.getElementById('kardex-excel-table-container');
    if (!container) return;

    if (error || !data || !data.kardex_raw) {
        container.innerHTML = '<p style="font-size: 12px; color: #888; text-align: center; margin: 20px 0;">No hay información de Kárdex disponible.</p>';
        return;
    }

    // Mostrar el HTML de la hoja guardada para esta máquina
    container.innerHTML = `<div style="overflow-x: auto; width: 100%;">${data.kardex_raw}</div>`;
}
// Exponer funciones globalmente
window.addNewMachine = addNewMachine;
window.subirManualPieza3D = subirManualPieza3D;
window.eliminarManualPieza = eliminarManualPieza;
window.subirManualPdf = subirManualPdf;
window.addMotorBlock = addMotorBlock;
window.removeMotorBlock = removeMotorBlock;
window.updateMotor = updateMotor;
window.addKardexRow = addKardexRow;
window.removeKardexRow = removeKardexRow;
window.updateRepuesto = updateRepuesto;
