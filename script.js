// Reemplaza con tus credenciales reales de tu proyecto de Supabase
const SUPABASE_URL = 'https://glgkfuiqwconjjffxgln.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YxHDEuQiZ06ywaT5Yha68w_DX35lUVO';

const { createClient } = supabase;
const dbSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentRole = 'visitante';
let currentLine = '';
let currentMachineId = null;
let isEditMode = false;
let rolPendiente = '';

const PASSWORDS = {
    'mantenimiento': 'mantenimiento123',
    'admin': 'admin123'
};

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

        // Si es admin y el modo edición está activo, mostramos el input para cambiar el nombre
        if (currentRole === 'admin' && isEditMode) {
            card.onclick = (e) => e.stopPropagation();
            card.innerHTML = `
                <span class="card-icon"></span>
                <input type="text" class="mach-input" data-id="${maq.id}" value="${maq.nombre || ''}" onchange="updateMachineNameInline('${maq.id}', this.value)">
            `;
        } else {
            // Si no está en modo edición (o es visitante/mantenimiento), al hacer clic entra al detalle
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
    } else if (opt === 'Manuales') {
        document.getElementById('view-manuals').classList.add('active-view', 'fullscreen-mode');
        loadManualsData();
    } else if (opt === 'Visual3D') {
        const vista3D = document.getElementById('view-visual3d');
        vista3D.classList.add('active-view', 'fullscreen-mode');
        
        const innerBox = document.getElementById('visual3d-wrapper-box');
        if(innerBox) innerBox.style.height = 'calc(100vh - 65px)';

        const contenedorImportar = document.getElementById('contenedor-importar-3d');
        const contenedorAdminBtn = document.getElementById('contenedor-admin-reportes-btn');

        if (currentRole === 'admin') {
            contenedorImportar.style.display = 'block';
            contenedorAdminBtn.style.display = 'block';
        } else {
            contenedorImportar.style.display = 'none';
            contenedorAdminBtn.style.display = 'none';
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

async function addNewMachine() {
    if (currentRole !== 'admin') {
        alert("Solo el administrador puede agregar máquinas.");
        return;
    }

    const nuevaMaquina = {
        nombre: "Nueva Máquina",
        linea: currentLine,
        meta: {},
        motors: [],
        kardex: [],
        instruction_images: [],
        manuals_pdf: [],
        reportes_piezas: {}
    };

    const { error } = await dbSupabase.from('maquinas').insert([nuevaMaquina]);
    if (error) {
        alert("Error al crear máquina: " + error.message);
    } else {
        renderMachines();
    }
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

    document.getElementById('add-row-btn').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('add-motor-btn').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('th-action').style.display = isAdmin ? 'table-cell' : 'none';

    renderMotors(maq.motors || [], isAdmin);
    renderKardexRows(maq.kardex || [], isAdmin);
}

async function updateMeta(field, val) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('meta').eq('id', currentMachineId).single();
    let meta = maq?.meta || {};
    meta[field] = val;
    await dbSupabase.from('maquinas').update({ meta }).eq('id', currentMachineId);
}

async function renderMotors(motors, isAdmin) {
    let container = document.getElementById('motors-container');
    container.innerHTML = '';
    motors.forEach((m, idx) => {
        let div = document.createElement('div');
        div.className = 'motor-block-container';
        div.innerHTML = `
            <div class="motor-block-header">
                <span>MOTOR Nº ${idx + 1}</span>
                ${isAdmin && motors.length > 1 ? `<button class="btn-row-del" onclick="removeMotorBlock(${idx})">Eliminar Motor</button>` : ''}
            </div>
            <div class="form-grid-motor-1" style="display:grid; grid-template-columns: repeat(3, 1fr);">
                <div class="field-box"><label>MARCA</label><input type="text" ${!isAdmin?'readonly':''} value="${m.marca||''}" oninput="updateMotor(${idx},'marca',this.value)"></div>
                <div class="field-box"><label>HP</label><input type="text" ${!isAdmin?'readonly':''} value="${m.hp||''}" oninput="updateMotor(${idx},'hp',this.value)"></div>
                <div class="field-box"><label>KW</label><input type="text" ${!isAdmin?'readonly':''} value="${m.kw||''}" oninput="updateMotor(${idx},'kw',this.value)"></div>
                <div class="field-box"><label>RPM</label><input type="text" ${!isAdmin?'readonly':''} value="${m.rpm||''}" oninput="updateMotor(${idx},'rpm',this.value)"></div>
                <div class="field-box"><label>VOLTIOS</label><input type="text" ${!isAdmin?'readonly':''} value="${m.voltios||''}" oninput="updateMotor(${idx},'voltios',this.value)"></div>
                <div class="field-box"><label>AMP</label><input type="text" ${!isAdmin?'readonly':''} value="${m.amperios||''}" oninput="updateMotor(${idx},'amperios',this.value)"></div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function addMotorBlock() {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('motors').eq('id', currentMachineId).single();
    let motors = maq?.motors || [];
    motors.push({ marca: '', hp: '', kw: '', rpm: '', voltios: '', amperios: '' });
    await dbSupabase.from('maquinas').update({ motors }).eq('id', currentMachineId);
    loadKardexData();
}

async function removeMotorBlock(idx) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('motors').eq('id', currentMachineId).single();
    let motors = maq?.motors || [];
    motors.splice(idx, 1);
    await dbSupabase.from('maquinas').update({ motors }).eq('id', currentMachineId);
    loadKardexData();
}

async function updateMotor(idx, field, val) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('motors').eq('id', currentMachineId).single();
    let motors = maq?.motors || [];
    if (motors[idx]) {
        motors[idx][field] = val;
        await dbSupabase.from('maquinas').update({ motors }).eq('id', currentMachineId);
    }
}

async function renderKardexRows(kardex, isAdmin) {
    let tbody = document.getElementById('kardex-tbody');
    tbody.innerHTML = '';
    kardex.forEach((row, idx) => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><input type="text" ${!isAdmin?'readonly':''} value="${row.categoria||''}" oninput="updateKardex(${idx},'categoria',this.value)"></td>
            <td><input type="text" ${!isAdmin?'readonly':''} value="${row.desc||''}" oninput="updateKardex(${idx},'desc',this.value)"></td>
            <td><input type="text" ${!isAdmin?'readonly':''} value="${row.um||''}" oninput="updateKardex(${idx},'um',this.value)"></td>
            <td><input type="number" ${!isAdmin?'readonly':''} value="${row.cant||''}" oninput="updateKardex(${idx},'cant',this.value)"></td>
            ${isAdmin ? `<td><button class="btn-row-del" onclick="removeKardexRow(${idx})">X</button></td>` : ''}
        `;
        tbody.appendChild(tr);
    });
}

async function addKardexRow() {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('kardex').eq('id', currentMachineId).single();
    let kardex = maq?.kardex || [];
    kardex.push({ categoria: '', desc: '', um: 'Pza', cant: 1 });
    await dbSupabase.from('maquinas').update({ kardex }).eq('id', currentMachineId);
    loadKardexData();
}

async function removeKardexRow(idx) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('kardex').eq('id', currentMachineId).single();
    let kardex = maq?.kardex || [];
    kardex.splice(idx, 1);
    await dbSupabase.from('maquinas').update({ kardex }).eq('id', currentMachineId);
    loadKardexData();
}

async function updateKardex(idx, field, val) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('kardex').eq('id', currentMachineId).single();
    let kardex = maq?.kardex || [];
    if (kardex[idx]) {
        kardex[idx][field] = val;
        await dbSupabase.from('maquinas').update({ kardex }).eq('id', currentMachineId);
    }
}

async function loadInstructionsData() {
    const { data: maq } = await dbSupabase.from('maquinas').select('instruction_images').eq('id', currentMachineId).single();
    let isAdmin = (currentRole === 'admin');
    document.getElementById('admin-img-upload').style.display = isAdmin ? 'block' : 'none';

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

async function uploadInstructionImages(event) {
    if (currentRole !== 'admin') return;
    let files = event.target.files;
    if (!files.length) return;

    const { data: maq } = await dbSupabase.from('maquinas').select('instruction_images').eq('id', currentMachineId).single();
    let images = maq?.instruction_images || [];

    for (let file of files) {
        let fileName = `inst_${currentMachineId}_${Date.now()}_${file.name}`;
        let { data, error } = await dbSupabase.storage.from('instrucciones').upload(fileName, file);
        if (!error) {
            let { data: pubUrl } = dbSupabase.storage.from('instrucciones').getPublicUrl(fileName);
            if (pubUrl?.publicUrl) images.push(pubUrl.publicUrl);
        }
    }

    await dbSupabase.from('maquinas').update({ instruction_images: images }).eq('id', currentMachineId);
    loadInstructionsData();
    event.target.value = '';
}

async function removeInstructionImage(idx) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('instruction_images').eq('id', currentMachineId).single();
    let images = maq?.instruction_images || [];
    images.splice(idx, 1);
    await dbSupabase.from('maquinas').update({ instruction_images: images }).eq('id', currentMachineId);
    loadInstructionsData();
}

async function loadManualsData() {
    const { data: maq } = await dbSupabase.from('maquinas').select('manuals_pdf').eq('id', currentMachineId).single();
    let isAdmin = (currentRole === 'admin');
    document.getElementById('admin-pdf-upload').style.display = isAdmin ? 'block' : 'none';

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

async function uploadManualsPdf(event) {
    if (currentRole !== 'admin') return;
    let files = event.target.files;
    if (!files.length) return;

    const { data: maq } = await dbSupabase.from('maquinas').select('manuals_pdf').eq('id', currentMachineId).single();
    let manuals = maq?.manuals_pdf || [];

    for (let file of files) {
        let fileName = `pdf_${currentMachineId}_${Date.now()}_${file.name}`;
        let { data, error } = await dbSupabase.storage.from('manuales').upload(fileName, file);
        if (!error) {
            let { data: pubUrl } = dbSupabase.storage.from('manuales').getPublicUrl(fileName);
            if (pubUrl?.publicUrl) {
                manuals.push({ name: file.name, url: pubUrl.publicUrl });
            }
        }
    }

    await dbSupabase.from('maquinas').update({ manuals_pdf: manuals }).eq('id', currentMachineId);
    loadManualsData();
    event.target.value = '';
}

async function removeManualPdf(idx) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('manuals_pdf').eq('id', currentMachineId).single();
    let manuals = maq?.manuals_pdf || [];
    manuals.splice(idx, 1);
    await dbSupabase.from('maquinas').update({ manuals_pdf: manuals }).eq('id', currentMachineId);
    loadManualsData();
}

async function openImageModal(src) {
    document.getElementById('modal-img-tag').src = src;
    document.getElementById('img-modal').style.display = 'flex';
}

async function closeImageModal() {
    document.getElementById('img-modal').style.display = 'none';
}

// ==========================================
// LÓGICA 3D (SUPABASE STORAGE & DB)
// ==========================================
let scene, camera, renderer, grupoMaquina, controls, raycaster, mouse, gltfLoader;
let piezaSeleccionadaActual = "";
let vistaExplosionada = false;
let piezasDetectadas = [];

let pointerDownX = 0;
let pointerDownY = 0;
let hasMoved = false;

const defaultGLBUrl = "modelos/EXTRACTORA_POLICYTRUS.glb";

async function init3D() {
    const container = document.getElementById('canvas-3d');
    const initW = container.clientWidth > 0 ? container.clientWidth : 300;
    const initH = container.clientHeight > 0 ? container.clientHeight : 480;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);

    camera = new THREE.PerspectiveCamera(50, initW / initH, 0.1, 100);
    camera.position.set(5, 5, 8);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(initW, initH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    gltfLoader = new THREE.GLTFLoader();

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    grupoMaquina = new THREE.Group();
    scene.add(grupoMaquina);

    cargarModeloMaquinaActual();

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
        if (Math.abs(e.clientX - pointerDownX) > 5 || Math.abs(e.clientY - pointerDownY) > 5) {
            hasMoved = true;
        }
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
        if (!hasMoved) detectarToque(e.clientX, e.clientY);
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        piezasDetectadas.forEach(pieza => {
            if (pieza.userData.posOrig && pieza.userData.posExp) {
                const target = vistaExplosionada ? pieza.userData.posExp : pieza.userData.posOrig;
                pieza.position.lerp(target, 0.08); 
            }
        });
        renderer.render(scene, camera);
    }
    animate();
}

async function cargarModeloMaquinaActual() {
    const btnExplo = document.getElementById('btn-explo');
    btnExplo.innerText = "⏳ Cargando modelo...";
    btnExplo.disabled = true;

    while(grupoMaquina.children.length > 0) {
        grupoMaquina.remove(grupoMaquina.children[0]);
    }

    const { data: maq } = await dbSupabase.from('maquinas').select('modelo_url').eq('id', currentMachineId).single();

    if (maq && maq.modelo_url) {
        gltfLoader.load(maq.modelo_url, (gltf) => {
            procesarModeloCargado(gltf, "Modelo Personalizado");
        }, undefined, () => cargarModeloPorDefecto());
    } else {
        cargarModeloPorDefecto();
    }
}

async function cargarModeloPorDefecto() {
    gltfLoader.load(defaultGLBUrl, (gltf) => {
        procesarModeloCargado(gltf, "EXTRACTORA POLICYTRUS");
    }, undefined, () => {
        const btnExplo = document.getElementById('btn-explo');
        btnExplo.innerText = "💥 Activar Vista Explosionada";
        btnExplo.disabled = false;
    });
}

async function procesarModeloCargado(gltf, nombreEquipo) {
    const modelo = gltf.scene;
    const boxCentro = new THREE.Box3().setFromObject(modelo);
    const center = boxCentro.getCenter(new THREE.Vector3());
    modelo.position.sub(center); 

    piezasDetectadas = [];
    const lista = document.getElementById('lista-partes');
    lista.innerHTML = "";
    let indexPieza = 1;

    const { data: maq } = await dbSupabase.from('maquinas').select('reportes_piezas').eq('id', currentMachineId).single();
    let reportes = maq?.reportes_piezas || {};

    modelo.traverse((child) => {
        if (child.isMesh) {
            piezasDetectadas.push(child);
            child.name = child.name || `Pieza_${indexPieza}`; 

            const posOrig = child.position.clone();
            const meshBox = new THREE.Box3().setFromObject(child);
            const meshCenter = meshBox.getCenter(new THREE.Vector3());
            const direccionExplosion = meshCenter.clone().sub(center).normalize();
            if(direccionExplosion.lengthSq() === 0) direccionExplosion.set(0, 1, 0);
            const posExp = posOrig.clone().add(direccionExplosion.multiplyScalar(2));

            let colorOriginal = child.material.color ? child.material.color.getHex() : 0x888888;
            let tieneReporte = reportes[child.name] && reportes[child.name].estado === 'mantenimiento';

            child.userData = { posOrig, posExp, colorBase: colorOriginal };

            child.material = new THREE.MeshStandardMaterial({ 
                color: tieneReporte ? 0xef4444 : colorOriginal,
                roughness: 0.5, metalness: 0.1, transparent: true, opacity: 1.0
            });

            const btn = document.createElement('button');
            btn.className = "item-partes w-full text-left p-1.5 rounded hover:bg-gray-700 text-gray-300 text-xs flex justify-between items-center";
            btn.innerHTML = `<span>⚙️ ${child.name}</span> ${tieneReporte ? '<span class="text-[9px] bg-red-600 text-white px-1 rounded">Mantenimiento</span>' : ''}`;
            btn.onclick = () => seleccionarComponente(child.name);
            lista.appendChild(btn);
            indexPieza++;
        }
    });

    grupoMaquina.add(modelo);
    document.getElementById('indicador-equipo').innerText = `📍 Vista: ${nombreEquipo}`;

    const btnExplo = document.getElementById('btn-explo');
    btnExplo.innerText = "💥 Activar Vista Explosionada";
    btnExplo.disabled = false;
}

async function seleccionarComponente(nombrePieza) {
    const panel = document.getElementById('panel-info');
    const piezaEncontrada = piezasDetectadas.find(p => p.name === nombrePieza);

    if (piezaSeleccionadaActual === nombrePieza) {
        panel.classList.add('hidden');
        piezaSeleccionadaActual = null;
        return;
    }

    if (piezaEncontrada) {
        piezaSeleccionadaActual = nombrePieza;
        panel.classList.remove('hidden');
        document.getElementById('info-titulo').innerText = nombrePieza;

        const { data: maq } = await dbSupabase.from('maquinas').select('reportes_piezas').eq('id', currentMachineId).single();
        let reportes = maq?.reportes_piezas || {};
        let repInfo = reportes[nombrePieza];

        const lblEstado = document.getElementById('info-estado');
        const boxMotivo = document.getElementById('info-motivo-box');
        const txtMotivo = document.getElementById('info-motivo-txt');
        const contenedorAcciones = document.getElementById('panel-acciones-pieza');
        contenedorAcciones.innerHTML = '';

        if (repInfo && repInfo.estado === 'mantenimiento') {
            lblEstado.innerText = "Requiere Mantenimiento";
            lblEstado.className = "text-red-400 font-bold";
            boxMotivo.classList.remove('hidden');
            txtMotivo.innerText = `${repInfo.motivo} (${repInfo.fecha})`;
        } else {
            lblEstado.innerText = "Operativo";
            lblEstado.className = "text-green-400 font-bold";
            boxMotivo.classList.add('hidden');
        }

        if (currentRole === 'mantenimiento' || currentRole === 'admin') {
            if (!repInfo || repInfo.estado !== 'mantenimiento') {
                contenedorAcciones.innerHTML = `<button onclick="abrirModalMotivoReporte('${nombrePieza}')" class="w-full py-1.5 bg-red-600 hover:bg-red-500 rounded text-white font-bold text-[11px]">⚠️ Requiere Mantenimiento</button>`;
            } else if (currentRole === 'admin') {
                contenedorAcciones.innerHTML = `<button onclick="marcarPiezaOperativa('${nombrePieza}')" class="w-full py-1.5 bg-green-600 hover:bg-green-500 rounded text-white font-bold text-[11px]">✅ Marcar como Operativa</button>`;
            }
        }
    }
}

async function abrirModalMotivoReporte(nombrePieza) {
    document.getElementById('lbl-pieza-a-reportar').innerText = `Pieza: ${nombrePieza}`;
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

    reportes[piezaSeleccionadaActual] = { estado: 'mantenimiento', motivo, fecha: fechaHoraStr };
    await dbSupabase.from('maquinas').update({ reportes_piezas: reportes }).eq('id', currentMachineId);

    cerrarModalMotivo();
    cargarModeloMaquinaActual();
}

async function marcarPiezaOperativa(nombrePieza) {
    if (currentRole !== 'admin') return;
    const { data: maq } = await dbSupabase.from('maquinas').select('reportes_piezas').eq('id', currentMachineId).single();
    let reportes = maq?.reportes_piezas || {};
    delete reportes[nombrePieza];
    
    await dbSupabase.from('maquinas').update({ reportes_piezas: reportes }).eq('id', currentMachineId);
    cargarModeloMaquinaActual();
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
        contenedor.innerHTML += `<div class="bg-gray-900 border border-gray-700 p-2 rounded mb-2"><span class="text-blue-400 font-bold">${piezaName}</span> - ${rep.motivo}</div>`;
        tbodyExcel.innerHTML += `<tr><td>${piezaName}</td><td>Mantenimiento</td><td>${rep.motivo}</td><td>${rep.fecha}</td></tr>`;
    });

    document.getElementById('modal-ver-reportes').style.display = 'flex';
}

async function cerrarModalVerReportes() {
    document.getElementById('modal-ver-reportes').style.display = 'none';
}

async function detectarToque(x, y) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(piezasDetectadas, true);
    if (intersects.length > 0 && intersects[0].object.name) {
        seleccionarComponente(intersects[0].object.name);
    }
}
