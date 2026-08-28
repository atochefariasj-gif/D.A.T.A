// Credenciales de Supabase
const SUPABASE_URL = 'https://glgkfuiqwconjjffxgln.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YxHDEuQiZ06ywaT5Yha68w_DX35lUVO';

const { createClient } = supabase;
const dbSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentRole = 'visitante';
let currentLine = '';
let currentMachineId = null;
let currentMachineName = null; 
let currentMachineToken = null;
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

// ==========================================
// NUEVO: DETECCIÓN DE QR AL CARGAR LA PÁGINA
// ==========================================
// Variable global (colócala fuera de DOMContentLoaded o arriba del archivo)
// NUEVO: DETECCIÓN DE URL AL CARGAR LA PÁGINA
let pendienteRedireccion = null;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const machineId = urlParams.get('machineId') || urlParams.get('maquina');
    const piezaQr = urlParams.get('pieza') || urlParams.get('piezas');

    // 1. Si viene de una Notificación Push para ir directo al Visor 3D
    if (action === 'view3d' && machineId) {
        sessionStorage.setItem('maquina_3d_pendiente', machineId);
    } 
    // 2. Si viene de un código QR tradicional
    else if (piezaQr) {
        sessionStorage.setItem('maquina_qr_pendiente', piezaQr);
    }

    // Inicializar Notificaciones
    if (typeof inicializarNotificaciones === 'function') {
        inicializarNotificaciones();
    }
    if (typeof activarEscuchaNotificacionesRealtime === 'function') {
        activarEscuchaNotificacionesRealtime();
    }

    // Listener cuando la app ya está abierta en segundo plano
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.action === 'CARGAR_MAQUINA') {
                const targetId = event.data.machineId;
                if (targetId) {
                    currentMachineId = isNaN(Number(targetId)) ? targetId : Number(targetId);
                    if (typeof cargarModeloMaquinaActual === 'function') {
                        cargarModeloMaquinaActual();
                    }
                }
            }
        });
    }
});

// Función para restringir descargas/impresiones de QR solo a administradores
function verificarPermisoQRAdmin() {
    if (currentRole !== 'admin') {
        alert("Acceso denegado: Solo el Administrador puede descargar o imprimir códigos QR.");
        return false;
    }
    return true;
}

function descargarOImprimirQR(idMaquina) {
    if (!verificarPermisoQRAdmin()) return;
    console.log("Generando descarga de QR para la máquina:", idMaquina);
}

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
    document.getElementById('modal-password-title').innerText = `🔐Contraseña para ${rol.toUpperCase()}`;
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
    actualizarVisibilidadQR();
}

async function selectRole(role) {
    currentRole = role;

    // 1. VERIFICAR SI VIENE DE NOTIFICACIÓN PUSH (Redirigir directo al Visor 3D)
    const token3DPendiente = sessionStorage.getItem('maquina_3d_pendiente');
    if (token3DPendiente) {
        sessionStorage.removeItem('maquina_3d_pendiente');

        const mId = isNaN(Number(token3DPendiente)) ? token3DPendiente : Number(token3DPendiente);

        // Consultar el nombre de la máquina en Supabase para inicializarla correctamente
        let nombreMaquina = "Máquina";
        if (typeof dbSupabase !== 'undefined') {
            const { data } = await dbSupabase
                .from('maquinas')
                .select('nombre')
                .eq('id', mId)
                .maybeSingle();
            if (data && data.nombre) {
                nombreMaquina = data.nombre;
            }
        }

        // 1. Configurar contexto de la máquina en la app
        if (typeof openMachineDetail === 'function') {
            openMachineDetail(mId, nombreMaquina);
        }

        // 2. Saltar de inmediato al Visor 3D
        if (typeof openOption === 'function') {
            openOption('Visual3D');
        } else {
            document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active-view'));
            const vista3D = document.getElementById('view-visual3d');
            if (vista3D) vista3D.classList.add('active-view');
        }

        return; // Finalizar aquí
    }

    // 2. VERIFICAR SI VIENE DE ESCÁNER QR (Redirigir a los Datos/Opciones de la Máquina)
    const tokenPendiente = sessionStorage.getItem('maquina_qr_pendiente');
    if (tokenPendiente) {
        sessionStorage.removeItem('maquina_qr_pendiente');

        if (typeof dbSupabase !== 'undefined') {
            const { data, error } = await dbSupabase
                .from('maquinas')
                .select('id, nombre')
                .eq('qr_token', tokenPendiente)
                .maybeSingle();

            if (data && !error) {
                // Abre el panel de opciones de la máquina (Kárdex, Manuales, etc.)
                openMachineDetail(data.id, data.nombre);
                return;
            } else {
                console.error('No se encontró la máquina con ese token en Supabase');
            }
        }
    }

    // 3. NAVEGACIÓN NORMAL (Mostrar vista de líneas)
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active-view'));
    const viewLines = document.getElementById('view-lines');
    if (viewLines) {
        viewLines.classList.add('active-view');
    }
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
    .select('id, nombre, modelo_url, manual_url, linea, estado_alerta')
    .eq('linea', currentLine)
    .order('id', { ascending: true });

    if (error) {
        console.error("Error al cargar las máquinas:", error);
        return;
    }

    let container = document.getElementById('machines-grid-container');
    container.innerHTML = "";

    maquinas.forEach(maq => { 
        let card = document.createElement('div');
        card.className = 'card-item';
        
        function obtenerClaseLed(estado) {
            if (estado === 'falla') return 'led-indicator led-rojo';
            if (estado === 'revision') return 'led-indicator led-amarillo';
            return 'led-indicator led-verde';
        }

        if (currentRole === 'admin' && isEditMode) {
            card.onclick = (e) => e.stopPropagation();
            card.innerHTML = `
                <span class="card-icon"></span>
                <input type="text" class="mach-input" data-id="${maq.id}" value="${maq.nombre || ''}" onchange="updateMachineNameInline('${maq.id}', this.value)">
                <button class="btn-delete-mach" onclick="deleteMachine('${maq.id}')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-top: 5px; font-size: 10px;">🗑️ Eliminar</button>
            `;
        } else {
            card.onclick = () => openMachineDetail(maq.id, maq.nombre);
            card.innerHTML = `
                <span class="card-icon">⚙️</span>
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                   <div class="card-title">${maq.nombre}</div>
                   <span class="${obtenerClaseLed(maq.estado_alerta)}" title="Estado: ${maq.estado_alerta || 'normal'}"></span>
                </div>
            `;
        }
        
        container.appendChild(card);
    });
}

async function addNewMachine() {
    if (currentRole !== 'admin') {
        alert("No tienes permisos para realizar esta acción.");
        return;
    }
 
    const { data, error } = await dbSupabase
        .from('maquinas')
        .insert([
            { 
                nombre: "⚙️Nueva Máquina",
                modelo_url: "EMPTY",
                manual_url: "EMPTY",
                linea: currentLine 
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

async function openMachineDetail(id, name, token) {
    currentMachineId = id;
    currentMachineName = name; 
    const { data, error } = await dbSupabase
        .from('maquinas')
        .select('qr_token')
        .eq('id', id)
        .maybeSingle();

    if (data) {
        currentMachineToken = data.qr_token;
    }
    document.getElementById('selected-machine-title').innerText = name;
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.getElementById('view-machine-detail').classList.add('active-view');
}

async function openOption(opt) {
    document.getElementById('view-machine-detail').classList.remove('active-view');

    if (opt === 'Kardex') {
        document.getElementById('view-kardex').classList.add('active-view', 'fullscreen-mode');
        abrirKardexDeMaquina(currentMachineName); 
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

        if (currentRole === 'admin') {
            if (contenedorImportar) contenedorImportar.style.display = 'block';
            if (contenedorAdminBtn) contenedorAdminBtn.style.display = 'block';
            if (btnDesensamblaje) btnDesensamblaje.style.display = 'inline-block';
        } else if (currentRole === 'mantenimiento') {
            if (contenedorImportar) contenedorImportar.style.display = 'none';
            if (contenedorAdminBtn) contenedorAdminBtn.style.display = 'block';
            if (btnDesensamblaje) btnDesensamblaje.style.display = 'inline-block';
        } else {
            if (contenedorImportar) contenedorImportar.style.display = 'none';
            if (contenedorAdminBtn) contenedorAdminBtn.style.display = 'none';
            if (btnDesensamblaje) btnDesensamblaje.style.display = 'none';
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
// MÓDULO DE INSTRUCCIONES Y PASOS (JSONB)
// ==========================================
async function loadInstructionsData() {
    let wrapper = document.getElementById('instructions-gallery-wrapper');
    if (!wrapper) return;

    const { data: maq, error } = await dbSupabase
        .from('maquinas')
        .select('instrucciones')
        .eq('id', currentMachineId)
        .single();

    if (error) {
        console.error("Error al cargar instrucciones:", error);
    }

    window.currentInstructionsList = maq?.instrucciones || [];
    let instrucciones = window.currentInstructionsList;

    let isAdmin = (currentRole === 'admin');
    const adminPanel = document.getElementById('admin-instructions-toolbar');
    if (adminPanel) adminPanel.style.display = isAdmin ? 'flex' : 'none';

    if (instrucciones.length === 0) {
        wrapper.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">No hay instrucciones cargadas para esta máquina.</div>`;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
    
    instrucciones.forEach((inst, index) => {
        html += `
            <div style="background: #1e293b; color: white; padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <span onclick="abrirDetalleInstruccion(${index})" style="font-weight: bold; font-size: 14px; cursor: pointer; flex-grow: 1;">🔧 ${inst.titulo}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button onclick="abrirDetalleInstruccion(${index})" style="background: #2563eb; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">Ver Pasos ➡️</button>
                    ${isAdmin ? `<button onclick="eliminarInstruccionCompleta(${index})" style="background: #dc2626; color: white; border: none; padding: 5px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;">🗑️</button>` : ''}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    wrapper.innerHTML = html;
}

window.abrirDetalleInstruccion = function(index) {
    let instrucciones = window.currentInstructionsList || [];
    let inst = instrucciones[index];
    let wrapper = document.getElementById('instructions-gallery-wrapper');
    if (!wrapper || !inst) return;

    let isAdmin = (currentRole === 'admin');
    let botonAgregarPasoHTML = isAdmin ? `
        <button onclick="abrirModalAgregarPaso(${index})" style="background: #10b981; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-bottom: 15px;">
            ➕ Añadir Paso con Imagen
        </button>
    ` : '';
    
    let pasosHTML = '';
    if (inst.pasos && inst.pasos.length > 0) {
        inst.pasos.forEach((paso, pIndex) => {
            pasosHTML += `
                <div style="background: white; color: #333; padding: 12px; margin-bottom: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #cbd5e1;">
                    <div style="flex-grow: 1; padding-right: 15px;">
                        <strong style="color: #2563eb;">Paso ${pIndex + 1}:</strong> ${paso.descripcion}
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${paso.imagen ? `<img src="${paso.imagen}" style="width: 100px; height: 70px; object-fit: cover; border-radius: 6px; border: 1px solid #94a3b8; cursor: pointer;" onclick="openImageModal('${paso.imagen}')" />` : '<span style="font-size: 11px; color: #94a3b8;">Sin imagen</span>'}
                        ${isAdmin ? `<button onclick="eliminarPasoDeInstruccion(${index}, ${pIndex})" style="background: #dc2626; color: white; border: none; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">🗑️</button>` : ''}
                    </div>
                </div>
            `;
        });
    } else {
        pasosHTML = `<p style="color: #666; font-style: italic;">No hay pasos definidos para esta instrucción.</p>`;
    }

    wrapper.innerHTML = `
        <button onclick="loadInstructionsData()" style="background: #64748b; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; margin-bottom: 15px; font-weight: bold;">
            ⬅️ Volver a Instrucciones
        </button>
        <h3 style="color: #2026A0; margin-bottom: 15px; border-bottom: 2px solid #2026A0; padding-bottom: 5px;">${inst.titulo}</h3>
        ${botonAgregarPasoHTML}
        <div style="display: flex; flex-direction: column;">
            ${pasosHTML}
        </div>
    `;
};

async function guardarInstruccionesEnSupabase() {
    const { error } = await dbSupabase
        .from('maquinas')
        .update({ instrucciones: window.currentInstructionsList })
        .eq('id', currentMachineId);

    if (error) {
        console.error("Error al sincronizar instrucciones:", error);
        alert("Error al guardar cambios en la base de datos.");
    }
}

window.agregarNuevaInstruccion = async function() {
    let titulo = prompt("Ingrese el título de la nueva instrucción:");
    if (!titulo || !titulo.trim()) return;

    if (!window.currentInstructionsList) window.currentInstructionsList = [];
    window.currentInstructionsList.push({
        titulo: titulo.trim(),
        pasos: []
    });

    await guardarInstruccionesEnSupabase();
    loadInstructionsData();
};

window.eliminarInstruccionCompleta = async function(index) {
    if (!confirm("¿Está seguro de eliminar esta instrucción completa?")) return;
    
    window.currentInstructionsList.splice(index, 1);
    await guardarInstruccionesEnSupabase();
    loadInstructionsData();
};

let instruccionActivaIndex = null;

window.abrirModalAgregarPaso = function(index) {
    instruccionActivaIndex = index;
    document.getElementById('input-paso-desc').value = '';
    document.getElementById('input-paso-img').value = '';
    document.getElementById('modal-agregar-paso').style.display = 'flex';
};

window.cerrarModalPaso = function() {
    document.getElementById('modal-agregar-paso').style.display = 'none';
    instruccionActivaIndex = null;
};

window.guardarNuevoPasoConImagen = async function() {
    let descripcion = document.getElementById('input-paso-desc').value.trim();
    let fileInput = document.getElementById('input-paso-img');
    
    if (!descripcion) {
        alert("Por favor, ingresa una descripción para el paso.");
        return;
    }

    let guardarPasoData = async (imagenUrl = '') => {
        let inst = window.currentInstructionsList[instruccionActivaIndex];
        if (!inst.pasos) inst.pasos = [];
        
        inst.pasos.push({
            descripcion: descripcion,
            imagen: imagenUrl
        });

        await guardarInstruccionesEnSupabase();
        cerrarModalPaso();
        abrirDetalleInstruccion(instruccionActivaIndex);
    };

    if (fileInput.files && fileInput.files[0]) {
        let reader = new FileReader();
        reader.onload = async function(e) {
            await guardarPasoData(e.target.result);
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        await guardarPasoData(''); 
    }
};

window.eliminarPasoDeInstruccion = async function(instIndex, pasoIndex) {
    if (!confirm("¿Eliminar este paso?")) return;

    let inst = window.currentInstructionsList[instIndex];
    if (inst && inst.pasos) {
        inst.pasos.splice(pasoIndex, 1);
        await guardarInstruccionesEnSupabase();
        abrirDetalleInstruccion(instIndex);
    }
};

// ==========================================
// MANUALES PDF
// ==========================================
async function loadManualsData() {
    const { data: maq, error } = await dbSupabase
        .from('maquinas')
        .select('manuals_pdf')
        .eq('id', currentMachineId)
        .maybeSingle();

    let isAdmin = (currentRole === 'admin');
    const adminPdfUpload = document.getElementById('admin-pdf-upload');
    if (adminPdfUpload) adminPdfUpload.style.display = isAdmin ? 'block' : 'none';

    let wrapper = document.getElementById('manuals-list-wrapper');
    wrapper.innerHTML = '';

    let manuals = maq?.manuals_pdf;
    if (typeof manuals === 'string') {
        try {
            manuals = JSON.parse(manuals);
        } catch (e) {
            manuals = [];
        }
    }
    manuals = manuals || [];

    let searchInputHTML = `
        <div style="margin-bottom: 12px;">
            <input type="text" id="input-buscar-manual" placeholder="🔍 Buscar manual por nombre..." oninput="filtrarManualesPDF()" style="width: 100%; padding: 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
        </div>
    `;

    if (manuals.length === 0) {
        wrapper.innerHTML = searchInputHTML + `<div style="color: #888; font-size: 11px; padding: 20px; text-align: center;">No hay manuales PDF cargados.</div>`;
        return;
    }

    let listHTML = searchInputHTML + '<div id="manuals-items-container" style="display: flex; flex-direction: column; gap: 8px;">';

    manuals.forEach((man, idx) => {
        let nombreManual = man.name || man.nombre || `Manual ${idx + 1}`;
        let urlManual = man.url || man.enlace || '#';
        listHTML += `
            <div class="manual-item-row" data-name="${nombreManual.toLowerCase()}" style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <div class="manual-info" style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                    <span class="manual-icon" style="font-size: 16px;">📄</span>
                    <span class="manual-name" style="font-size: 12px; color: #1e293b; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${nombreManual}">${nombreManual}</span>
                </div>
                <div class="manual-actions" style="display: flex; gap: 6px; flex-shrink: 0;">
                    <button onclick="verPdfEnVisor('${urlManual}', '${nombreManual}')" style="background: #2563eb; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">👁️ Ver Visor</button>
                    <a href="${urlManual}" target="_blank" style="background: #64748b; color: white; text-decoration: none; padding: 5px 8px; border-radius: 4px; font-size: 11px; display: inline-flex; align-items: center;">📥 Descargar</a>
                    ${isAdmin ? `<button onclick="removeManualPdf(${idx})" style="background: #dc2626; color: white; border: none; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">🗑️</button>` : ''}
                </div>
            </div>
        `;
    });

    listHTML += '</div>';
    wrapper.innerHTML = listHTML;
}

function filtrarManualesPDF() {
    let filtro = document.getElementById('input-buscar-manual').value.toLowerCase();
    let filas = document.querySelectorAll('#manuals-items-container > div');
    filas.forEach(fila => {
        let nombre = fila.getAttribute('data-name');
        if (nombre.includes(filtro)) {
            fila.style.display = 'flex';
        } else {
            fila.style.display = 'none';
        }
    });
}

function verPdfEnVisor(urlPdf, titulo) {
    let modalId = 'modal-visor-pdf-global';
    let modal = document.getElementById(modalId);

    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.75); z-index: 9999; display: flex; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box;";
        
        modal.innerHTML = `
            <div style="background: #ffffff; width: 100%; max-width: 1000px; height: 90vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
                <div style="background: #1e293b; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <span id="visor-pdf-titulo" style="font-weight: bold; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;"></span>
                    <button onclick="cerrarVisorPdfGlobal()" style="background: #dc2626; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px;">✕ Cerrar</button>
                </div>
                <div style="flex-grow: 1; background: #e2e8f0; width: 100%; position: relative;">
                    <iframe id="iframe-pdf-visor" style="width: 100%; height: 100%; border: none;"></iframe>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('visor-pdf-titulo').innerText = `📄 ${titulo}`;
    const iframe = document.getElementById('iframe-pdf-visor');
    const urlVisualizador = `https://docs.google.com/gview?url=${encodeURIComponent(urlPdf)}&embedded=true`;
    
    iframe.src = urlVisualizador;
    modal.style.display = 'flex';
}

function cerrarVisorPdfGlobal() {
    let modal = document.getElementById('modal-visor-pdf-global');
    if (modal) {
        modal.style.display = 'none';
        let iframe = document.getElementById('iframe-pdf-visor');
        if (iframe) iframe.src = '';
    }
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
    if (modoSeleccionMedidasActivo) {
        modoSeleccionMedidasActivo = false;
        abrirModalMedidasPorPieza(nombrePieza);
        return;
    }

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
    if (!motivo) {
        mostrarToast("Ingresa el motivo del reporte.", "error");
        return;
    }

    // 1. Obtener el botón de envío para deshabilitarlo temporalmente
    const btnEnviar = document.querySelector("#modal-motivo-reporte button[onclick*='guardarReporteMantenimiento']");
    if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.textContent = "Guardando...";
    }

    try {
        let fechaHoraStr = new Date().toLocaleString();
        
        // 2. Consulta a Supabase
        const { data: maq, error: fetchError } = await dbSupabase
            .from('maquinas')
            .select('reportes_piezas')
            .eq('id', currentMachineId)
            .single();

        if (fetchError) throw fetchError;

        let reportes = maq?.reportes_piezas || {};

        // 3. Actualizar objeto local de reportes
        reportes[piezaSeleccionadaActual] = { 
            estado: estadoReporteSeleccionado, 
            motivo: motivo, 
            fecha: fechaHoraStr 
        };

        // 4. Guardar cambios en Supabase
        const { error: updateError } = await dbSupabase
            .from('maquinas')
            .update({ reportes_piezas: reportes })
            .eq('id', currentMachineId);

        if (updateError) throw updateError;

        // 5. Limpiar campo y cerrar modal
        document.getElementById('txt-motivo-input').value = '';
        cerrarModalMotivo();
        cargarModeloMaquinaActual();

// 6. Notificación de éxito
const esPreventivo = estadoReporteSeleccionado === 'preventivo';
const tituloNotif = esPreventivo ? '⚠️ Alerta Preventiva' : '🔴 Reporte de Mantenimiento';
const msjNotif = `Pieza "${piezaSeleccionadaActual}": ${motivo}`;

mostrarToast(`¡${esPreventivo ? 'Alerta' : 'Reporte'} guardado con éxito!`, 'exito');
enviarNotificacionEvento(tituloNotif, msjNotif, currentMachineId);
    } catch (error) {
        console.error("Error al guardar reporte:", error);
        mostrarToast("Ocurrió un error al guardar en la base de datos.", "error");
    } finally {
        // 7. Restaurar estado original del botón
        if (btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.textContent = "Enviar Reporte";
        }
    }
}
function mostrarToast(mensaje, tipo = 'exito') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notificacion ${tipo === 'error' ? 'error' : ''}`;
    
    const icono = tipo === 'error' ? '❌' : '✅';
    toast.innerHTML = `<span>${icono}</span> <span>${mensaje}</span>`;

    container.appendChild(toast);

    // Animación de entrada
    setTimeout(() => toast.classList.add('show'), 10);

    // Salida y remoción automática tras 3.5 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
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

    const intersects = raycaster.intersectObjects(todosLosObjetos, true);
    
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

async function cargarDatosInventarioPieza(nombrePieza) {
    const { data: rep, error } = await dbSupabase
        .from('repuestos_inventario')
        .select('*')
        .eq('maquina_id', currentMachineId)
        .eq('nombre_pieza', nombrePieza)
        .maybeSingle();

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
    mostrarToast("📌 Nota 3D agregada con éxito", "exito");
    
// Borra la línea 1822 (const textoNota = ...)

enviarNotificacionEvento(
    "📌 Nueva Nota 3D",
    `Se agregó una nota en la pieza "${nombrePieza}": ${mensaje}`,
    currentMachineId
);
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

window.vincularSkuAhora = function(nombrePieza) {
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

window.removeManualPdf = async function(idx) {
    const { data: maq } = await dbSupabase.from('maquinas').select('manuals_pdf').eq('id', currentMachineId).single();
    let manuals = maq?.manuals_pdf || [];
    manuals.splice(idx, 1);
    await dbSupabase.from('maquinas').update({ manuals_pdf: manuals }).eq('id', currentMachineId);
    loadManualsData();
};

async function subirManualPdf(event) {
    const fileInput = document.getElementById('pdf-file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Por favor selecciona al menos un archivo PDF.");
        return;
    }

    const files = fileInput.files;
    let isAdmin = (currentRole === 'admin');
    if (!isAdmin) {
        alert("No tienes permisos para realizar esta acción.");
        return;
    }

    alert(`Subiendo ${files.length} archivo(s) PDF. Por favor espera...`);

    const { data: maq, error: fetchError } = await dbSupabase
        .from('maquinas')
        .select('manuals_pdf')
        .eq('id', currentMachineId)
        .maybeSingle();

    if (fetchError) {
        alert("Error al conectar con la base de datos.");
        return;
    }

    let manuals = maq?.manuals_pdf || [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `manual_${currentMachineId}_${Date.now()}_${i}.pdf`;

        const { error: uploadError } = await dbSupabase.storage
            .from('manuales')
            .upload(fileName, file);

        if (uploadError) continue;

        const { data: { publicUrl } } = dbSupabase.storage
            .from('manuales')
            .getPublicUrl(fileName);

        manuals.push({ name: file.name, url: publicUrl });
    }

    const { error: updateError } = await dbSupabase
        .from('maquinas')
        .update({ manuals_pdf: manuals })
        .eq('id', currentMachineId);

    if (updateError) {
        alert("Error al guardar referencias: " + updateError.message);
    } else {
        alert("¡Manuales PDF subidos y guardados con éxito!");
        fileInput.value = ""; 
        if (typeof loadManualsData === 'function') loadManualsData();
    }
}

async function procesarYSubirKardexPdf() {
    const fileInput = document.getElementById('pdf-kardex-file');
    const pageInput = document.getElementById('pdf-page-num');
    
    if (fileInput.files.length === 0) {
        alert("Por favor selecciona un archivo PDF.");
        return;
    }

    const file = fileInput.files[0];
    const pageNumber = parseInt(pageInput.value) || 1;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;

        if (pageNumber > pdfDoc.numPages || pageNumber < 1) {
            alert(`El PDF solo tiene ${pdfDoc.numPages} páginas.`);
            return;
        }

        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const base64Image = canvas.toDataURL('image/jpeg', 0.85);

        const imgElement = document.getElementById('kardex-rendered-img');
        const emptyMsg = document.getElementById('kardex-empty-msg');
        
        imgElement.src = base64Image;
        imgElement.style.display = 'block';
        emptyMsg.style.display = 'none';

        await guardarKardexEnSupabase(base64Image);
        alert("¡Kárdex en PDF guardado y sincronizado correctamente en la nube!");
    } catch (error) {
        alert("Hubo un error al procesar el archivo PDF.");
    }
}

async function guardarKardexEnSupabase(base64Data) {
    if (!currentMachineName && !currentMachineId) return;

    await dbSupabase
        .from('maquinas')
        .update({ kardex_raw: base64Data })
        .eq('nombre', currentMachineName);
}

async function abrirKardexDeMaquina(nombreMaquina) {
    currentMachineName = nombreMaquina;
    
    const adminUploadPanel = document.getElementById('admin-kardex-upload');
    if (adminUploadPanel) {
        adminUploadPanel.style.display = (currentRole === 'admin') ? 'block' : 'none';
    }

    const { data } = await dbSupabase
        .from('maquinas')
        .select('kardex_raw')
        .eq('nombre', nombreMaquina)
        .single();

    const imgElement = document.getElementById('kardex-rendered-img');
    const emptyMsg = document.getElementById('kardex-empty-msg');

    if (data && data.kardex_raw) {
        imgElement.src = data.kardex_raw;
        imgElement.style.display = 'block';
        emptyMsg.style.display = 'none';
    } else {
        imgElement.style.display = 'none';
        emptyMsg.style.display = 'block';
    }
}

async function deleteMachine(id) {
    if (currentRole !== 'admin') {
        alert("No tienes permisos para eliminar máquinas.");
        return;
    }

    if (!confirm("¿Estás seguro de eliminar esta máquina?")) return;

    const { error } = await dbSupabase.from('maquinas').delete().eq('id', id);
    if (error) {
        alert("No se pudo eliminar: " + error.message);
    } else {
        renderMachines();
    }
}

function toggleModoOscuro() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('modo_oscuro', isDark);
    
    const btn = document.getElementById('btn-modo-oscuro');
    if (btn) btn.innerText = isDark ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
    aplicarEstilosModoOscuro(isDark);
}

function aplicarEstilosModoOscuro(isDark) {
    let bgMain = isDark ? '#0f172a' : '#f1f5f9';
    let textCol = isDark ? '#f8fafc' : '#1e293b';
    document.body.style.backgroundColor = bgMain;
    document.body.style.color = textCol;
}

let maquinaIdActualBuzon = null;

function abrirBuzonMaquina(idMaquina, nombreMaquina) {
    maquinaIdActualBuzon = idMaquina;
    document.getElementById('titulo-modal-maquina').innerText = `💡 Sugerencias de la Máquina: ${nombreMaquina || ''}`;
    document.getElementById('modal-buzon-maquina').style.display = 'flex';
    cargarSugerenciasMaquina();
}

function cerrarBuzonMaquina() {
    document.getElementById('modal-buzon-maquina').style.display = 'none';
}

async function cargarSugerenciasMaquina() {
    const { data } = await dbSupabase
        .from('maquinas')
        .select('sugerencias')
        .eq('id', maquinaIdActualBuzon)
        .maybeSingle();

    let sugerencias = data?.sugerencias || [];
    let contenedor = document.getElementById('lista-sugerencias-maquina');
    contenedor.innerHTML = '';

    if (sugerencias.length === 0) {
        contenedor.innerHTML = `<div style="color: #64748b; font-size: 12px; text-align: center; padding: 15px;">No hay sugerencias registradas todavía.</div>`;
        return;
    }

    sugerencias.forEach((item, index) => {
        contenedor.innerHTML += `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; font-size: 12px; color: #1e293b;">
                <b>${index + 1}.</b> ${item.texto} <br>
                <span style="font-size: 10px; color: #64748b;">🕒 ${item.fecha} - 👤 ${item.autor || 'Usuario'}</span>
            </div>
        `;
    });
}

async function enviarSugerenciaMaquina() {
    const textoSugerencia = document.getElementById('input-nueva-sugerencia-maquina').value.trim();
    if (!textoSugerencia) return alert("Escribe una sugerencia.");

    const { data: maqData } = await dbSupabase
        .from('maquinas')
        .select('sugerencias')
        .eq('id', maquinaIdActualBuzon)
        .maybeSingle();

    let lista = maqData?.sugerencias || [];
    lista.push({
        texto: textoSugerencia,
        fecha: new Date().toLocaleString(),
        autor: window.currentUser || window.currentRole || 'Usuario'
    });

    const { error } = await dbSupabase
        .from('maquinas')
        .update({ sugerencias: lista })
        .eq('id', maquinaIdActualBuzon);

    if (!error) {
        document.getElementById('input-nueva-sugerencia-maquina').value = '';
        await cargarSugerenciasMaquina();
    }
}

let lineaActualBuzon = '';

function abrirBuzonPorLinea(nombreLinea) {
    lineaActualBuzon = nombreLinea || currentLine;
    document.getElementById('modal-buzon').style.display = 'flex';
    cargarSugerenciasPorLinea();
}

function cerrarBuzonSugerencias() {
    document.getElementById('modal-buzon').style.display = 'none';
}

async function cargarSugerenciasPorLinea() {
    const { data } = await dbSupabase
        .from('lineas')
        .select('sugerencias')
        .eq('nombre', lineaActualBuzon)
        .maybeSingle();

    let sugerencias = data?.sugerencias || [];
    let contenedor = document.getElementById('lista-sugerencias-linea');
    contenedor.innerHTML = '';

    if (sugerencias.length === 0) {
        contenedor.innerHTML = `<div style="color: #64748b; font-size: 12px; text-align: center; padding: 15px;">No hay sugerencias para la línea ${lineaActualBuzon}.</div>`;
        return;
    }

    sugerencias.forEach((item, index) => {
        contenedor.innerHTML += `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; font-size: 12px; color: #1e293b;">
                <b>${index + 1}.</b> ${item.texto} <br>
                <span style="font-size: 10px; color: #64748b;">🕒 ${item.fecha} - 👤 ${item.autor || 'Usuario'}</span>
            </div>
        `;
    });
}

async function enviarSugerenciaLinea() {
    const textoSugerencia = document.getElementById('input-nueva-sugerencia').value.trim();
    if (!textoSugerencia) return alert("Escribe una sugerencia.");

    const { data: lineaData } = await dbSupabase
        .from('lineas')
        .select('sugerencias')
        .eq('nombre', lineaActualBuzon)
        .maybeSingle();

    let lista = lineaData?.sugerencias || [];
    lista.push({
        texto: textoSugerencia,
        fecha: new Date().toLocaleString(),
        autor: window.currentUser || window.currentRole || 'Usuario'
    });

    const { error } = await dbSupabase
        .from('lineas')
        .update({ sugerencias: lista })
        .eq('nombre', lineaActualBuzon);

    if (!error) {
        document.getElementById('input-nueva-sugerencia').value = '';
        await cargarSugerenciasPorLinea();
    }
}

function generarQRMaquina() {
    const contenedorQR = document.getElementById('contenedor-codigo-qr');
    const modalQR = document.getElementById('modal-qr-dinamico');
    
    contenedorQR.innerHTML = '';
    
    if (!currentMachineToken) {
        alert("No se encontró el token de esta máquina.");
        return;
    }

    modalQR.style.display = 'flex';

    const urlBase = window.location.origin + window.location.pathname;
    const urlApp = `${urlBase}?qr=${currentMachineToken}`;

    new QRCode(contenedorQR, {
        text: urlApp,
        width: 180,
        height: 180
    });
}

function actualizarVisibilidadQR() {
    const seccionAdminQR = document.getElementById('seccion-admin-qr');
    if (currentRole === 'admin') {
        seccionAdminQR.style.display = 'block';
    } else {
        seccionAdminQR.style.display = 'none';
    }
}

function cerrarModalQR() {
    const modalQR = document.getElementById('modal-qr-dinamico');
    if (modalQR) {
        modalQR.style.display = 'none';
    }
}
// ==========================================
// MÓDULO CATÁLOGO Y MEDIDAS DE PIEZAS (FIXED)
// ==========================================

let piezaSeleccionadaNombre = null;
let modoSeleccionMedidasActivo = false;
let piezasMedidasLista = [];
let zoomActualPlano = 1;

// 1. Activar el modo de selección al hacer clic en el botón inicial
function activarSeleccionMedidas() {
    modoSeleccionMedidasActivo = true;
    alert("📌 Haz clic en una pieza del 3D o en la lista 'Desglose de Partes' para abrir sus medidas.");
}

// 2. Abrir Modal filtrando por el Nombre de la Pieza (TEXT)
async function abrirModalMedidasPorPieza(nombrePieza) {
    if (!nombrePieza) {
        alert("Por favor selecciona una pieza válida.");
        return;
    }

    piezaSeleccionadaNombre = nombrePieza;
    modoSeleccionMedidasActivo = false;

    const modal = document.getElementById('modal-medidas-piezas');
    const adminToolbar = document.getElementById('admin-medidas-toolbar');
    
    if (!modal) return;

    if (currentRole === 'admin') {
        if (adminToolbar) adminToolbar.style.display = 'flex';
        document.querySelectorAll('.col-admin-medidas').forEach(el => el.style.display = 'table-cell');
    } else {
        if (adminToolbar) adminToolbar.style.display = 'none';
        document.querySelectorAll('.col-admin-medidas').forEach(el => el.style.display = 'none');
    }

    modal.style.display = 'flex';

    // Buscar en la tabla 'piezas' por 'nombre' (soporta texto como "SEPARADORES2")
    let { data: pieza, error } = await dbSupabase
        .from('piezas')
        .select('*')
        .eq('maquina_id', currentMachineId)
        .eq('nombre', nombrePieza)
        .maybeSingle();

    // Si la pieza aún no existe en el registro, la creamos automáticamente
    if (!pieza && !error) {
        const { data: nuevaPieza, error: errInsert } = await dbSupabase
            .from('piezas')
            .insert([{ maquina_id: currentMachineId, nombre: nombrePieza, tabla_medidas: [] }])
            .select()
            .single();
        
        if (!errInsert) pieza = nuevaPieza;
    }

    // Actualizar Encabezado del Modal
    const tituloModal = document.querySelector('#modal-medidas-piezas h3');
    if (tituloModal) {
        tituloModal.textContent = `📐 Medidas de Pieza: ${nombrePieza}`;
    }

    // Cargar Plano
    const imgElement = document.getElementById('img-plano-despiece');
    if (imgElement) {
        if (pieza && pieza.plano_despiece_url) {
            imgElement.src = pieza.plano_despiece_url;
        } else {
            imgElement.src = 'https://via.placeholder.com/600x400?text=Sin+Plano/Medidas+Cargadas';
        }
    }

    // Cargar Tabla de Piezas
    piezasMedidasLista = (pieza && pieza.tabla_medidas) ? pieza.tabla_medidas : [];
    renderizarTablaMedidas();
}

function cerrarModalMedidas() {
    const modal = document.getElementById('modal-medidas-piezas');
    if (modal) modal.style.display = 'none';
    resetZoomPlano();
}

function renderizarTablaMedidas() {
    const tbody = document.getElementById('tbody-medidas-piezas');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (!piezasMedidasLista || piezasMedidasLista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">No hay registros de piezas/medidas agregados.</td></tr>`;
        return;
    }

    let isAdmin = (currentRole === 'admin');

    piezasMedidasLista.forEach((pieza, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'fila-pieza-item';
        tr.id = `fila-pieza-${idx}`;
        
        // Al hacer clic en la fila completa se activa la selección y zoom
        tr.onclick = (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                seleccionarPiezaInteractiva(idx);
            }
        };

        const tieneCoords = pieza.coords && pieza.coords.x;

        if (isAdmin) {
            tr.innerHTML = `
                <td style="padding:6px;">
                    <input type="text" value="${pieza.pos || (idx + 1)}" onchange="actualizarPiezaDato(${idx}, 'pos', this.value)" style="width:30px; border:1px solid #ccc; padding:2px; text-align:center;">
                </td>
                <td style="padding:6px;"><input type="text" value="${pieza.num_articulo || ''}" onchange="actualizarPiezaDato(${idx}, 'num_articulo', this.value)" style="width:100%; border:1px solid #ccc; padding:2px;"></td>
                <td style="padding:6px;"><input type="text" value="${pieza.nombre || ''}" onchange="actualizarPiezaDato(${idx}, 'nombre', this.value)" style="width:100%; border:1px solid #ccc; padding:2px;"></td>
                <td style="padding:6px;"><input type="text" value="${pieza.medida || ''}" onchange="actualizarPiezaDato(${idx}, 'medida', this.value)" style="width:100%; border:1px solid #ccc; padding:2px;"></td>
                <td style="padding:6px; display:flex; gap:4px; align-items:center;">
                    <button onclick="marcarPosicionEnImagen(${idx})" title="Vincular punto en imagen" style="background:${tieneCoords ? '#10b981' : '#0284c7'}; color:white; border:none; padding:4px 6px; border-radius:4px; cursor:pointer;">
                        ${tieneCoords ? '📍 OK' : '📍 Ubicar'}
                    </button>
                    <button onclick="eliminarFilaPieza(${idx})" style="background:#ef4444; color:white; border:none; padding:4px 6px; border-radius:4px; cursor:pointer;">🗑️</button>
                </td>
            `;
        } else {
            tr.innerHTML = `
                <td style="padding:10px; font-weight:bold; color:#0284c7; text-align:center;">${pieza.pos || (idx + 1)}</td>
                <td style="padding:10px; font-weight:600;">${pieza.num_articulo || '-'}</td>
                <td style="padding:10px;">${pieza.nombre || '-'}</td>
                <td style="padding:10px; font-style:italic;">${pieza.medida || '-'}</td>
            `;
        }
        tbody.appendChild(tr);
    });

    renderizarHotspotsPlano();
}

function seleccionarPiezaInteractiva(index) {
    // 1. Quitar la clase 'activo' de todos los hotspots
    document.querySelectorAll('.hotspot-item').forEach(hp => hp.classList.remove('activo'));

    // 2. Activar parpadeo en el hotspot seleccionado
    const hotspotActual = document.getElementById(`hotspot-pieza-${index}`);
    if (hotspotActual) {
        hotspotActual.classList.add('activo');
    }

    // 3. Aplicar Zoom enfocado a las coordenadas de la pieza
    const pieza = piezasMedidasLista[index];
    const wrapper = document.getElementById('wrapper-plano-img');

    if (pieza && pieza.coords && wrapper) {
        wrapper.style.transformOrigin = `${pieza.coords.x}% ${pieza.coords.y}%`;
        wrapper.style.transform = 'scale(2.2)';
    }

    // 4. RESALTAR Y HACER SCROLL EN LA TABLA (Paso nuevo)
    document.querySelectorAll('#tbody-medidas-piezas tr').forEach(tr => {
        tr.style.backgroundColor = ''; // Limpia el color previo
    });

    const filaSeleccionada = document.getElementById(`fila-pieza-${index}`);
    if (filaSeleccionada) {
        // Colorea la fila (azul claro de selección)
        filaSeleccionada.style.backgroundColor = '#e0f2fe';
        
        // Desplaza la tabla automáticamente para mostrar la fila activa
        filaSeleccionada.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function zoomPlano(factor) {
    zoomActualPlano += factor;
    if (zoomActualPlano < 0.5) zoomActualPlano = 0.5;
    if (zoomActualPlano > 4) zoomActualPlano = 4;
    const wrapper = document.getElementById('wrapper-plano-img');
    if (wrapper) wrapper.style.transform = `scale(${zoomActualPlano})`;
}

function resetZoomPlano() {
    const wrapper = document.getElementById('wrapper-plano-img');
    if (wrapper) {
        wrapper.style.transformOrigin = 'center center';
        wrapper.style.transform = 'scale(1)';
    }
    // Opcional: quitar parpadeo activo
    document.querySelectorAll('.hotspot-item').forEach(hp => hp.classList.remove('activo'));
}

async function subirPlanoDespiece(event) {
    const file = event.target.files[0];
    if (!file || !piezaSeleccionadaNombre) return;

    // Nombre de archivo seguro sin caracteres especiales
    const safeName = piezaSeleccionadaNombre.replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = `pieza_${safeName}_${Date.now()}`;
    
    const { data, error } = await dbSupabase.storage
        .from('modelos-glb')
        .upload(fileName, file);

    if (error) {
        alert("Error al subir archivo: " + error.message);
        return;
    }

    const { data: publicData } = dbSupabase.storage
        .from('modelos-glb')
        .getPublicUrl(fileName);

    const publicUrl = publicData.publicUrl;

    // Actualizar en Supabase mediante 'nombre' y 'maquina_id'
    await dbSupabase
        .from('piezas')
        .update({ plano_despiece_url: publicUrl })
        .eq('maquina_id', currentMachineId)
        .eq('nombre', piezaSeleccionadaNombre);

    document.getElementById('img-plano-despiece').src = publicUrl;
    alert("¡Plano cargado exitosamente!");
}

function agregarFilaPiezaMedida() {
    if (!Array.isArray(piezasMedidasLista)) piezasMedidasLista = [];
    piezasMedidasLista.push({
        pos: piezasMedidasLista.length + 1,
        num_articulo: '',
        nombre: '',
        medida: ''
    });
    renderizarTablaMedidas();
}

function actualizarPiezaDato(idx, campo, valor) {
    if (piezasMedidasLista[idx]) {
        piezasMedidasLista[idx][campo] = valor;
    }
}

function eliminarFilaPieza(idx) {
    piezasMedidasLista.splice(idx, 1);
    renderizarTablaMedidas();
}

async function guardarCambiosTablaMedidas() {
    if (!piezaSeleccionadaNombre) return;

    const { error } = await dbSupabase
        .from('piezas')
        .update({ tabla_medidas: piezasMedidasLista })
        .eq('maquina_id', currentMachineId)
        .eq('nombre', piezaSeleccionadaNombre);

    if (error) {
        alert("Error al guardar tabla: " + error.message);
    } else {
        alert("¡Datos guardados correctamente!");
    }
}
let marcandoCoordenadaIndex = null;

// 1. Activar el modo de asignación de punto sobre la imagen
function marcarPosicionEnImagen(idx) {
    if (currentRole !== 'admin') return;
    marcandoCoordenadaIndex = idx;
    alert(`📍 Haz clic en el plano (sobre el número ${piezasMedidasLista[idx].pos || (idx + 1)}) para vincular su posición.`);
}

// 2. Capturar clic en la imagen y guardar las coordenadas (X%, Y%)
function capturarCoordenadaPlano(event) {
    if (marcandoCoordenadaIndex === null || currentRole !== 'admin') return;

    const img = document.getElementById('img-plano-despiece');
    const rect = img.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) return;

    // Obtener porcentaje exacto dentro del bounding box de la imagen
    let xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    let yPercent = ((event.clientY - rect.top) / rect.height) * 100;

    // Asegurar valores dentro del rango 0% - 100%
    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    piezasMedidasLista[marcandoCoordenadaIndex].coords = {
        x: xPercent.toFixed(2),
        y: yPercent.toFixed(2)
    };

    marcandoCoordenadaIndex = null;
    
    renderizarHotspotsPlano();
    renderizarTablaMedidas();
}

// 3. Renderizar los círculos numéricos (Hotspots) flotantes sobre la imagen
function renderizarHotspotsPlano() {
    const capa = document.getElementById('capa-hotspots-plano');
    if (!capa) return;
    capa.innerHTML = '';

    piezasMedidasLista.forEach((pieza, idx) => {
        if (pieza.coords && pieza.coords.x !== undefined && pieza.coords.y !== undefined) {
            const hotspot = document.createElement('div');
            hotspot.id = `hotspot-pieza-${idx}`;
            hotspot.className = 'hotspot-item';
            hotspot.textContent = pieza.pos || (idx + 1);
            
            hotspot.style.cssText = `
                position: absolute;
                top: ${pieza.coords.y}%;
                left: ${pieza.coords.x}%;
                transform: translate(-50%, -50%);
                width: 24px;
                height: 24px;
                background-color: #0284c7;
                color: #ffffff;
                border: 2px solid #ffffff;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0,0,0,0.5);
                pointer-events: auto;
                z-index: 100;
            `;

            // Asignación directa del clic
            hotspot.onclick = (e) => {
                e.stopPropagation();
                seleccionarPiezaInteractiva(idx);
            };

            capa.appendChild(hotspot);
        }
    });
}

// 4. Función de Selección + Zoom enfocado (Tabla -> Imagen & Imagen -> Tabla)
function seleccionarPiezaInteractiva(index) {
    // 1. Limpiar clase 'activo' de todos los hotspots
    document.querySelectorAll('.hotspot-item').forEach(hp => hp.classList.remove('activo'));

    // 2. Activar parpadeo en el hotspot seleccionado
    const hotspotActual = document.getElementById(`hotspot-pieza-${index}`);
    if (hotspotActual) {
        hotspotActual.classList.add('activo');
    }

    // 3. Aplicar Zoom enfocado en la imagen
    const pieza = piezasMedidasLista[index];
    const wrapper = document.getElementById('wrapper-plano-img');

    if (pieza && pieza.coords && wrapper) {
        wrapper.style.transformOrigin = `${pieza.coords.x}% ${pieza.coords.y}%`;
        wrapper.style.transform = 'scale(2.2)';
    }

    // 4. Limpiar resaltado previo de TODAS las filas e inputs de la tabla
    document.querySelectorAll('.fila-pieza-item').forEach(tr => {
        tr.style.backgroundColor = '';
        tr.querySelectorAll('td, input').forEach(el => el.style.backgroundColor = '');
    });

    // 5. Resaltar la fila e inputs seleccionados
    const filaSeleccionada = document.getElementById(`fila-pieza-${index}`);
    if (filaSeleccionada) {
        const colorHighlight = '#bae6fd'; // Azul celeste bien visible
        
        filaSeleccionada.style.backgroundColor = colorHighlight;
        filaSeleccionada.querySelectorAll('td, input').forEach(el => {
            el.style.backgroundColor = colorHighlight;
        });

        // Desplazar la tabla si la lista es grande
        filaSeleccionada.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Función principal para notificaciones y vibración
// Añade el argumento 'pieza'
async function enviarNotificacionEvento(titulo, cuerpo, machineId, pieza) {

    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
    }

    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }

    if ('Notification' in window && Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(titulo, {
            body: cuerpo,
            icon: 'logo.png',
            vibrate: [200, 100, 200],
            data: { 
                machineId: machineId,
                pieza: pieza // <-- Agregamos la pieza aquí
            },
            tag: `reporte-${machineId}`
        });
    }
}
// Escuchador en tiempo real mediante Supabase
function activarEscuchaNotificacionesRealtime() {
    if (typeof dbSupabase === 'undefined') return;

    dbSupabase
        .channel('cambios-reportes-maquinas')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'maquinas' },
            (payload) => {
                const maquinaActualizada = payload.new;
                const reportesNuevos = maquinaActualizada.reportes_piezas || {};
                
                const piezas = Object.keys(reportesNuevos);
                if (piezas.length === 0) return;

                const ultimaPieza = piezas[piezas.length - 1];
                const infoReporte = reportesNuevos[ultimaPieza];

                if (infoReporte) {
                    const esPreventivo = infoReporte.estado === 'preventivo';
                    const titulo = esPreventivo ? '⚠️ Alerta Preventiva' : '🔴 Reporte de Mantenimiento';
                    const mensaje = `Pieza "${ultimaPieza}": ${infoReporte.motivo || 'Sin detalles'}`;

                    // Cambia la línea 2662 por:
enviarNotificacionEvento(titulo, mensaje, maquinaActualizada.id, ultimaPieza);
                }
            }
        )
        .subscribe();
}
// Configuración de Firebase para el frontend
const firebaseConfig = {
  apiKey: "AIzaSyBNfhgBdIe05n3L0YfbsmZbNVYVlDxDXZk",
  authDomain: "data-control-activos.firebaseapp.com",
  projectId: "data-control-activos",
  storageBucket: "data-control-activos.firebasestorage.app",
  messagingSenderId: "290148330315",
  appId: "1:290148330315:web:0b53f07e03f72fefe9d6ce",
  measurementId: "G-ZE1NC3LB15"
};

// Inicializar Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Inicializar y obtener token FCM
async function inicializarPushNotifications() {
    try {
        if (typeof firebase === 'undefined' || !('Notification' in window)) return;

        // Registrar el Service Worker explícito
        const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
        
        const messaging = firebase.messaging();
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            // Solicitar token especificando vapidKey y la instancia del Service Worker
            const token = await messaging.getToken({ 
                vapidKey: 'BNwKAxWr9uZYTNvWHF9StP-EQJnUZxAd3buNyrJ89dFkKKFiy4N1bOFXXG7Wi6ocd40gt_1CT3qzVWQFHFP4494',
                serviceWorkerRegistration: registration
            });

            if (token) {
                console.log("FCM Token listo:", token);
                await guardarTokenEnSupabase(token);
            }
        }
    } catch (error) {
        console.error("Error al obtener token FCM:", error);
    }
}
// Guardar Token en la base de datos
async function guardarTokenEnSupabase(token) {
    if (typeof dbSupabase === 'undefined') return;
    
    const { error } = await dbSupabase
        .from('tokens_dispositivos')
        .upsert({ token_push: token, ultimo_acceso: new Date() }, { onConflict: 'token_push' });
    
    if (error) console.error("Error guardando token:", error);
}
// Exponer globalmente
window.activarSeleccionMedidas = activarSeleccionMedidas;
window.abrirModalMedidasPorPieza = abrirModalMedidasPorPieza;
window.cerrarModalMedidas = cerrarModalMedidas;
window.zoomPlano = zoomPlano;
window.resetZoomPlano = resetZoomPlano;
window.subirPlanoDespiece = subirPlanoDespiece;
window.agregarFilaPiezaMedida = agregarFilaPiezaMedida;
window.actualizarPiezaDato = actualizarPiezaDato;
window.eliminarFilaPieza = eliminarFilaPieza;
window.guardarCambiosTablaMedidas = guardarCambiosTablaMedidas;
// Exponer funciones globalmente
window.addNewMachine = addNewMachine;
window.subirManualPieza3D = subirManualPieza3D;
window.eliminarManualPieza = eliminarManualPieza;
window.subirManualPdf = subirManualPdf;
window.procesarYSubirKardexPdf = procesarYSubirKardexPdf;
window.deleteMachine = deleteMachine;
window.agregarNuevaInstruccion = agregarNuevaInstruccion;
window.abrirModalAgregarPaso = abrirModalAgregarPaso;
window.cerrarModalPaso = cerrarnodalPaso = cerrarModalPaso;
window.guardarNuevoPasoConImagen = guardarNuevoPasoConImagen;
window.eliminarPasoDeInstruccion = eliminarPasoDeInstruccion;
window.eliminarInstruccionCompleta = eliminarInstruccionCompleta;
window.abrirDetalleInstruccion = abrirDetalleInstruccion;
window.loadInstructionsData = loadInstructionsData;
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.descargarOImprimirQR = descargarOImprimirQR;
window.cerrarModalQR = cerrarModalQR;
