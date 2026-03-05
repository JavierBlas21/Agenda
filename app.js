import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- CONFIGURACIÓN ---
const SUPABASE_URL = 'https://zmvxfulnlhlunzjropwv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_lMMPid76_7wXStQeyzWPkw_PvTwQ5lu'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let perfilActual = null;

// --- 1. INICIO DE SESIÓN ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('pass-input').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        alert("Error: " + error.message);
    } else {
        checkUser(); // Verificar perfil tras login exitoso
    }
});

// Función para verificar quién es el usuario y qué permisos tiene
async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
        const { data: perfil, error } = await supabase
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (perfil) {
            perfilActual = perfil;
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('user-display').innerText = `${perfil.usuario} (${perfil.rol})`;
            
            // Mostrar vistas según rol
            document.getElementById('agenda-view').classList.remove('hidden');
            if (perfil.rol === 'ADMIN') {
                document.getElementById('admin-view').classList.remove('hidden');
                cargarCatalogosAdmin();
            }
            actualizarTablaAgenda(); // Esta función la definiremos en la Parte 2
        } else {
            alert("Usuario sin perfil asignado en la base de datos.");
        }
    }
}

// --- 2. GESTIÓN DE CATÁLOGOS (SOLO ADMIN) ---

window.guardarBodega = async () => {
    const nombre = document.getElementById('new-bodega').value;
    if (!nombre) return alert("Escribe el nombre de la bodega");

    const { error } = await supabase.from('bodegas').insert([{ nombre }]);
    if (error) alert("Error: " + error.message);
    else {
        document.getElementById('new-bodega').value = '';
        cargarCatalogosAdmin();
        alert("Bodega guardada correctamente");
    }
};

window.guardarFletera = async () => {
    const nombre = document.getElementById('new-fletera').value;
    if (!nombre) return alert("Escribe el nombre de la fletera");

    const { error } = await supabase.from('empresas_fleteras').insert([{ nombre }]);
    if (error) alert("Error: " + error.message);
    else {
        document.getElementById('new-fletera').value = '';
        cargarCatalogosAdmin();
        alert("Fletera guardada correctamente");
    }
};

async function cargarCatalogosAdmin() {
    // 1. Cargar Fleteras en el select para crear usuarios
    const { data: fleteras } = await supabase.from('empresas_fleteras').select('*').order('nombre');
    const selectF = document.getElementById('select-fletera-user');
    selectF.innerHTML = fleteras.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');

    // 2. Cargar Bodegas en la lista de checkboxes
    const { data: bodegas } = await supabase.from('bodegas').select('*').order('nombre');
    const listB = document.getElementById('bodegas-check-list');
    listB.innerHTML = '<strong>Asignar Bodegas:</strong><br>' + 
        bodegas.map(b => `
            <label><input type="checkbox" name="bodega-check" value="${b.id}"> ${b.nombre}</label><br>
        `).join('');
}

// --- 3. LOGOUT ---
document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
});

// Ejecutar al cargar la página por si hay sesión activa
checkUser();

// --- 4. REGISTRO DE USUARIOS COORDINADORES (ADMIN) ---

window.registrarUsuario = async () => {
    const email = document.getElementById('user-email').value;
    const nombre = document.getElementById('user-fullname').value;
    const idFletera = document.getElementById('select-fletera-user').value;
    
    // Contraseña al azar de 8 caracteres
    const passwordTemporal = Math.random().toString(36).slice(-8);

    // Obtener las bodegas seleccionadas en los checkboxes
    const bodegasSeleccionadas = Array.from(document.querySelectorAll('input[name="bodega-check"]:checked'))
        .map(cb => cb.value);

    if (!email || !nombre || bodegasSeleccionadas.length === 0) {
        return alert("Por favor llena el nombre, correo y selecciona al menos una bodega.");
    }

    // 1. Crear el usuario en la Autenticación de Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: passwordTemporal,
    });

    if (authError) return alert("Error al crear acceso: " + authError.message);

    // 2. Crear el perfil con sus permisos en la tabla 'perfiles'
    const { error: perfilError } = await supabase.from('perfiles').insert([{
        id: authData.user.id,
        usuario: nombre,
        rol: 'COORDINADOR',
        id_fletera: idFletera,
        bodegas_asignadas: bodegasSeleccionadas
    }]);

    if (perfilError) {
        alert("Usuario creado en Auth, pero error en perfil: " + perfilError.message);
    } else {
        alert(`¡ÉXITO!\nUsuario: ${nombre}\nCorreo: ${email}\nPASS TEMPORAL: ${passwordTemporal}\n\n(Anota la contraseña, no se volverá a mostrar)`);
        // Limpiar campos
        document.getElementById('user-email').value = '';
        document.getElementById('user-fullname').value = '';
    }
};

// --- 5. MOTOR DE LA AGENDA (VISUALIZACIÓN) ---

async function actualizarTablaAgenda() {
    const fechaInput = document.getElementById('filtro-fecha');
    // Si no hay fecha elegida, usar hoy
    if (!fechaInput.value) {
        fechaInput.value = new Date().toISOString().split('T')[0];
    }
    const fechaSel = fechaInput.value;
    const tbody = document.getElementById('agenda-body');
    tbody.innerHTML = '<tr><td colspan="3">Cargando agenda...</td></tr>';

    // 1. Traer todas las bodegas
    const { data: todasLasBodegas } = await supabase.from('bodegas').select('*').order('nombre');
    
    // 2. Traer reservaciones del día
    const { data: reservas } = await supabase.from('reservaciones')
        .select('*')
        .eq('fecha', fechaSel)
        .eq('estatus', 'ACTIVA');

    tbody.innerHTML = '';

    // Bucle de 24 horas (00:00 a 23:00)
    for (let h = 0; h < 24; h++) {
        const horaStr = `${h.toString().padStart(2, '0')}:00:00`;
        const horaLegible = `${h.toString().padStart(2, '0')}:00`;

        let fila = `<tr><td><strong>${horaLegible}</strong></td>`;

        // COLUMNA ENVÍO (Universal para todos)
        const cuposEnvioMax = 5; // Puedes hacerlo dinámico después
        const ocupadosEnvio = reservas.filter(r => r.hora === horaStr && r.tipo === 'ENVIO').length;
        const dispEnvio = cuposEnvioMax - ocupadosEnvio;
        
        fila += `
            <td>
                <span class="badge ${dispEnvio > 0 ? 'green' : 'red'}">${dispEnvio} libres</span><br>
                <button onclick="prepararCita('${horaStr}', 'ENVIO')" ${dispEnvio <= 0 ? 'disabled' : ''}>Reservar</button>
            </td>`;

        // COLUMNA ABASTO (Solo bodegas permitidas al usuario)
        let htmlAbasto = '<div class="abasto-grid">';
        
        // Filtramos qué bodegas mostrar
        const bodegasVisibles = perfilActual.rol === 'ADMIN' 
            ? todasLasBodegas 
            : todasLasBodegas.filter(b => perfilActual.bodegas_asignadas.includes(b.id));

        bodegasVisibles.forEach(bod => {
            const ocupadosBod = reservas.filter(r => r.hora === horaStr && r.id_bodega === bod.id).length;
            const cuposBodMax = 2; // Por defecto
            const dispBod = cuposBodMax - ocupadosBod;

            htmlAbasto += `
                <div class="bodega-slot">
                    <small>${bod.nombre}</small><br>
                    <span class="badge ${dispBod > 0 ? 'green' : 'red'}">${dispBod}</span>
                    <button class="btn-sm" onclick="prepararCita('${horaStr}', 'ABASTO', '${bod.id}', '${bod.nombre}')" ${dispBod <= 0 ? 'disabled' : ''}>Citar</button>
                </div>`;
        });
        
        htmlAbasto += '</div>';
        fila += `<td>${htmlAbasto}</td></tr>`;
        tbody.innerHTML += fila;
    }
}

// Escuchar cambio de fecha para recargar
document.getElementById('filtro-fecha').addEventListener('change', actualizarTablaAgenda);

// --- 6. GESTIÓN DE RESERVACIONES (MODAL Y GUARDADO) ---

let datosCitaTemporal = {};

window.prepararCita = (hora, tipo, idBodega = null, nombreBodega = '') => {
    // Verificar si la hora ya pasó (Solo si es para el día de hoy)
    const fechaSeleccionada = document.getElementById('filtro-fecha').value;
    const ahora = new Date();
    const hoy = ahora.toISOString().split('T')[0];
    
    if (fechaSeleccionada === hoy) {
        const horaCita = parseInt(hora.split(':')[0]);
        if (ahora.getHours() >= horaCita) {
            return alert("No puedes agendar en un horario que ya pasó.");
        }
    }

    datosCitaTemporal = { hora, tipo, idBodega, nombreBodega };
    
    document.getElementById('modal-titulo').innerText = `Reservar: ${tipo} ${nombreBodega ? '- ' + nombreBodega : ''}`;
    document.getElementById('modal-detalles').innerText = `Horario: ${hora.substring(0,5)} hrs`;
    document.getElementById('modal-cita').classList.remove('hidden');
};

window.cerrarModal = () => {
    document.getElementById('modal-cita').classList.add('hidden');
    document.getElementById('in-operador').value = '';
    document.getElementById('in-placa').value = '';
    document.getElementById('in-tarjeta').value = '';
};

window.confirmarCita = async () => {
    const operador = document.getElementById('in-operador').value.toUpperCase();
    const placa = document.getElementById('in-placa').value.toUpperCase();
    const tarjeta = document.getElementById('in-tarjeta').value.toUpperCase();
    const fecha = document.getElementById('filtro-fecha').value;

    if (!operador || !placa || !tarjeta) return alert("Todos los campos son obligatorios.");

    // Generar Folio Único: TIPO-HORA-RANDOM
    const randomID = Math.random().toString(36).substring(2, 6).toUpperCase();
    const folio = `${datosCitaTemporal.tipo[0]}-${datosCitaTemporal.hora.replace(/:/g,'').substring(0,4)}-${randomID}`;

    const { error } = await supabase.from('reservaciones').insert([{
        folio: folio,
        id_usuario: (await supabase.auth.getUser()).data.user.id,
        id_fletera: perfilActual.id_fletera, // El Admin deberá tener una fletera asignada para agendar
        id_bodega: datosCitaTemporal.idBodega,
        fecha: fecha,
        hora: datosCitaTemporal.hora,
        placa_vehiculo: placa,
        nombre_operador: operador,
        num_tarjeta: tarjeta,
        tipo: datosCitaTemporal.tipo
    }]);

    if (error) {
        if (error.code === '23505') alert("Error: La placa o el operador ya tienen una cita asignada para este día.");
        else alert("Error al reservar: " + error.message);
    } else {
        alert("Cita confirmada con éxito.");
        imprimirTicket(folio, operador, placa, tarjeta, fecha, datosCitaTemporal.hora, datosCitaTemporal.tipo, datosCitaTemporal.nombreBodega);
        cerrarModal();
        actualizarTablaAgenda();
    }
};

function imprimirTicket(folio, op, pl, tar, fec, hor, tipo, bod) {
    const vent = window.open('', '_blank');
    vent.document.write(`
        <html>
        <head>
            <title>Ticket ${folio}</title>
            <style>
                body { font-family: 'Courier New', monospace; text-align: center; padding: 20px; }
                .box { border: 2px solid #000; padding: 15px; display: inline-block; }
                .folio { font-size: 28px; font-weight: bold; margin: 10px 0; background: #eee; }
                p { text-align: left; margin: 5px 0; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="box">
                <h2>CONFIRMACIÓN DE ARRIBO</h2>
                <div class="folio">${folio}</div>
                <p><strong>OPERACIÓN:</strong> ${tipo} ${bod}</p>
                <p><strong>FECHA:</strong> ${fec}</p>
                <p><strong>HORA:</strong> ${hor.substring(0,5)} hrs</p>
                <hr>
                <p><strong>OPERADOR:</strong> ${op}</p>
                <p><strong>PLACA:</strong> ${pl}</p>
                <p><strong>TARJETA:</strong> ${tar}</p>
                <br>
                <small>Presente este folio al llegar a caseta.</small>
            </div>
        </body>
        </html>
    `);
    vent.document.close();
}