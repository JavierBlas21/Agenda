import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- CONFIGURACIÓN ---
const SUPABASE_URL = 'https://zmvxfulnlhlunzjropwv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_lMMPid76_7wXStQeyzWPkw_PvTwQ5lu'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let perfilActual = null;
let datosCitaTemp = {};

// --- INICIO ---
const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
        if (perfil) {
            perfilActual = perfil;
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('user-display').innerText = `${perfil.usuario} (${perfil.rol})`;
            document.getElementById('agenda-view').classList.remove('hidden');
            
            if (perfil.rol === 'ADMIN') {
                document.getElementById('admin-view').classList.remove('hidden');
                document.getElementById('admin-controls-agenda').classList.remove('hidden');
                cargarCatalogosAdmin();
            }
            // Fecha de hoy por defecto
            const fechaInput = document.getElementById('filtro-fecha');
            if(!fechaInput.value) fechaInput.value = new Date().toISOString().split('T')[0];
            actualizarTablaAgenda();
        }
    }
};

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('pass-input').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) alert("Error: " + error.message); else checkUser();
});

// --- ADMIN ---
window.guardarBodega = async () => {
    const n = document.getElementById('new-bodega').value;
    if(!n) return;
    await supabase.from('bodegas').insert([{ nombre: n }]);
    document.getElementById('new-bodega').value = '';
    cargarCatalogosAdmin();
};

window.guardarFletera = async () => {
    const n = document.getElementById('new-fletera').value;
    if(!n) return;
    await supabase.from('empresas_fleteras').insert([{ nombre: n }]);
    document.getElementById('new-fletera').value = '';
    cargarCatalogosAdmin();
};

window.registrarUsuario = async () => {
    const email = document.getElementById('user-email').value;
    const nombre = document.getElementById('user-fullname').value;
    const idFletera = document.getElementById('select-fletera-user').value;
    const pass = Math.random().toString(36).slice(-8);
    const bods = Array.from(document.querySelectorAll('input[name="bodega-check"]:checked')).map(c => c.value);
    
    if(!email || !nombre || bods.length === 0) return alert("Completa todos los datos y asigna bodegas.");

    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    if (error) return alert("Error Auth: " + error.message);

    await supabase.from('perfiles').insert([{ 
        id: data.user.id, usuario: nombre, rol: 'COORDINADOR', 
        id_fletera: idFletera, bodegas_asignadas: bods 
    }]);
    
    window.prompt("COORDINADOR CREADO. Copia la contraseña temporal:", pass);
    document.getElementById('user-email').value = '';
    document.getElementById('user-fullname').value = '';
};

async function cargarCatalogosAdmin() {
    const { data: f } = await supabase.from('empresas_fleteras').select('*').order('nombre');
    document.getElementById('select-fletera-user').innerHTML = f.map(x => `<option value="${x.id}">${x.nombre}</option>`).join('');
    
    const { data: b } = await supabase.from('bodegas').select('*').order('nombre');
    document.getElementById('bodegas-check-list').innerHTML = b.map(x => `
        <label>
            <input type="checkbox" name="bodega-check" value="${x.id}"> ${x.nombre}
        </label>`).join('');
}

// --- AGENDA (EL MOTOR) ---
window.habilitarDiaCompleto = async () => {
    const f = document.getElementById('filtro-fecha').value;
    if(!f) return alert("Selecciona una fecha");

    const { data: b } = await supabase.from('bodegas').select('*');
    const regs = [];
    for(let h=0; h<24; h++) {
        const hr = `${h.toString().padStart(2,'0')}:00:00`;
        regs.push({ fecha: f, hora: hr, id_bodega: null, cupos_totales: 5 }); // Envío
        b.forEach(x => regs.push({ fecha: f, hora: hr, id_bodega: x.id, cupos_totales: 2 })); // Abasto
    }

    const { error } = await supabase.from('disponibilidad').upsert(regs, { onConflict: 'id_bodega,fecha,hora' });
    if (error) alert("Error: " + error.message); 
    else { alert("Día habilitado correctamente."); actualizarTablaAgenda(); }
};

window.cambiarCupo = async (idB, fec, hor, val) => {
    const nuevoValor = parseInt(val);
    if (isNaN(nuevoValor)) return;

    // Usamos console.log para monitorear en la consola del navegador (F12)
    console.log(`Actualizando: Bodega ${idB}, Fecha ${fec}, Hora ${hor} a ${nuevoValor} cupos`);

    const { error } = await supabase
        .from('disponibilidad')
        .upsert({ 
            id_bodega: idB || null, 
            fecha: fec, 
            hora: hor, 
            cupos_totales: nuevoValor 
        }, { onConflict: 'id_bodega,fecha,hora' });

    if (error) {
        console.error("Error al guardar cupo:", error.message);
        alert("No se pudo guardar el cambio: " + error.message);
    } else {
        // Opcional: Mostrar una pequeña notificación visual de "Guardado"
        console.log("Cupo guardado exitosamente");
    }
};

async function actualizarTablaAgenda() {
    const f = document.getElementById('filtro-fecha').value;
    if(!f) return;

    const tbody = document.getElementById('agenda-body');
    tbody.innerHTML = '<tr><td colspan="3">Cargando datos...</td></tr>';

    const { data: bods } = await supabase.from('bodegas').select('*').order('nombre');
    const { data: res } = await supabase.from('reservaciones').select('*').eq('fecha', f).eq('estatus', 'ACTIVA');
    const { data: disp } = await supabase.from('disponibilidad').select('*').eq('fecha', f);

    if(!disp || disp.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:#856404; background:#fff3cd; padding:20px;">⚠️ Este día no tiene cupos configurados. Presione "Habilitar este Día".</td></tr>';
        return;
    }

    let html = '';
    for(let h=0; h<24; h++) {
        const hr = `${h.toString().padStart(2,'0')}:00:00`;
        const hrL = hr.substring(0,5);
        
        // ENVÍO
        const dE = disp.find(d => d.id_bodega === null && d.hora === hr);
        const cE = dE ? dE.cupos_totales : 0;
        const oE = res.filter(r => r.hora === hr && r.tipo === 'ENVIO').length;
        const lE = cE - oE;

        let tdEnvio = (perfilActual.rol === 'ADMIN') ? 
            `<div class="admin-edit-cupo">Cap: <input type="number" value="${cE}" onchange="cambiarCupo(null,'${f}','${hr}',this.value)"><br><small>Libres: ${lE}</small></div>` : 
            `<span class="badge ${lE>0?'green':'red'}">${lE} Libres</span><br><button class="btn-sm" onclick="prepararCita('${hr}','ENVIO')" ${lE<=0?'disabled':''}>Reservar</button>`;

        // ABASTO
        let hA = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">';
        const bVis = perfilActual.rol==='ADMIN' ? bods : bods.filter(x => perfilActual.bodegas_asignadas.includes(x.id));
        
        bVis.forEach(xb => {
            const dA = disp.find(d => d.id_bodega === xb.id && d.hora === hr);
            const cA = dA ? dA.cupos_totales : 0;
            const oA = res.filter(r => r.hora === hr && r.id_bodega === xb.id).length;
            const lA = cA - oA;

            hA += `<div class="admin-edit-cupo">
                <strong>${xb.nombre}</strong><br>
                ${perfilActual.rol==='ADMIN' ? 
                    `Cap: <input type="number" value="${cA}" onchange="cambiarCupo('${xb.id}','${f}','${hr}',this.value)"><br><small>Libres: ${lA}</small>` : 
                    `<span class="badge ${lA>0?'green':'red'}" style="font-size:10px">${lA} Libres</span><button class="btn-sm" onclick="prepararCita('${hr}','ABASTO','${xb.id}','${xb.nombre}')" ${lA<=0?'disabled':''}>Citar</button>`
                }</div>`;
        });
        hA += '</div>';

        html += `<tr><td style="font-weight:bold;">${hrL}</td><td>${tdEnvio}</td><td>${hA}</td></tr>`;
    }
    tbody.innerHTML = html;
}

// --- MODAL Y RESERVAS ---
window.prepararCita = (h, t, idB=null, nB='') => {
    datosCitaTemp = { h, t, idB, nB };
    document.getElementById('modal-titulo').innerText = `${t} ${nB}`;
    document.getElementById('modal-detalles').innerText = `Horario: ${h.substring(0,5)} hrs`;
    document.getElementById('modal-cita').classList.remove('hidden');
};

window.cerrarModal = () => {
    document.getElementById('modal-cita').classList.add('hidden');
};

window.confirmarCita = async () => {
    const f = document.getElementById('filtro-fecha').value;
    const p = document.getElementById('in-placa').value.toUpperCase();
    const t = document.getElementById('in-tarjeta').value.toUpperCase();
    const o = document.getElementById('in-operador').value.toUpperCase();

    if(!p || !t || !o) return alert("Llena todos los campos.");

    const fol = `${datosCitaTemp.t[0]}-${p.slice(-4)}-${Math.random().toString(36).slice(-4).toUpperCase()}`;

    const { error } = await supabase.from('reservaciones').insert([{ 
        folio: fol, id_usuario: (await supabase.auth.getUser()).data.user.id, 
        id_fletera: perfilActual.id_fletera, id_bodega: datosCitaTemp.idB, 
        fecha: f, hora: datosCitaTemp.h, placa_vehiculo: p, nombre_operador: o, num_tarjeta: t, tipo: datosCitaTemp.t 
    }]);

    if(error) alert("Error: La placa u operador ya tienen cita hoy.");
    else { alert("Cita agendada."); cerrarModal(); actualizarTablaAgenda(); }
};

document.getElementById('logout-btn').onclick = () => { supabase.auth.signOut(); location.reload(); };
document.getElementById('filtro-fecha').onchange = actualizarTablaAgenda;

checkUser();