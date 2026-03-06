import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://zmvxfulnlhlunzjropwv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_lMMPid76_7wXStQeyzWPkw_PvTwQ5lu'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let perfilActual = null;
let datosCitaTemp = {};

// --- 1. SESIÓN Y ROLES ---
const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
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
        
        const fInput = document.getElementById('filtro-fecha');
        if(!fInput.value) fInput.value = new Date().toISOString().split('T')[0];
        actualizarTodo();
    }
};

window.toggleCamposUsuario = () => {
    const rol = document.getElementById('select-rol-user').value;
    document.getElementById('campos-coordinador').style.display = (rol === 'COORDINADOR') ? 'block' : 'none';
};

// --- 2. MOTOR DE DATOS ---
window.actualizarTodo = () => {
    actualizarTablaAgenda();
    cargarListadoCitas();
};

async function actualizarTablaAgenda() {
    const f = document.getElementById('filtro-fecha').value;
    const tbody = document.getElementById('agenda-body');
    tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

    const { data: bods } = await supabase.from('bodegas').select('*').order('nombre');
    const { data: res } = await supabase.from('reservaciones').select('*').eq('fecha', f).eq('estatus', 'ACTIVA');
    const { data: disp } = await supabase.from('disponibilidad').select('*').eq('fecha', f);

    if(!disp || disp.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:red; background:#fff3cd; padding:15px;">Día no habilitado.</td></tr>';
        return;
    }

    let html = '';
    for(let h=0; h<24; h++) {
        const hr = `${h.toString().padStart(2,'0')}:00:00`;
        const hrL = hr.substring(0,5);
        
        // ENVÍO
        const dE = disp.find(d => !d.id_bodega && d.hora === hr);
        const cE = dE ? dE.cupos_totales : 0;
        const oE = res.filter(r => r.hora === hr && r.tipo === 'ENVIO').length;
        const lE = cE - oE;

        let tdEnvio = (perfilActual.rol === 'ADMIN') ? 
            `<div class="admin-edit-cupo">Cap: <input type="number" value="${cE}" onchange="cambiarCupo(null,'${f}','${hr}',this.value)"><br><small>Libres: ${lE}</small></div>` : 
            `<span class="badge ${lE>0?'green':'red'}">${lE} Libres</span><br><button class="btn-sm" onclick="prepararCita('${hr}','ENVIO')" ${lE<=0?'disabled':''}>Reservar</button>`;

        // ABASTO
        let hA = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">';
        const bVis = (perfilActual.rol === 'ADMIN' || perfilActual.rol === 'BASCULA') ? bods : bods.filter(x => (perfilActual.bodegas_asignadas || []).includes(x.id));
        
        bVis.forEach(xb => {
            const dA = disp.find(d => d.id_bodega === xb.id && d.hora === hr);
            const cA = dA ? dA.cupos_totales : 0;
            const oA = res.filter(r => r.hora === hr && r.id_bodega === xb.id).length;
            const lA = cA - oA;

            hA += `<div class="admin-edit-cupo">
                <strong>${xb.nombre}</strong><br>
                ${perfilActual.rol === 'ADMIN' ? 
                    `Cap: <input type="number" value="${cA}" onchange="cambiarCupo('${xb.id}','${f}','${hr}',this.value)">` : 
                    `<span class="badge ${lA>0?'green':'red'}" style="font-size:10px">${lA} Libres</span><button class="btn-sm" onclick="prepararCita('${hr}','ABASTO','${xb.id}','${xb.nombre}')" ${lA<=0?'disabled':''}>Citar</button>`
                }</div>`;
        });
        hA += '</div>';
        html += `<tr><td><strong>${hrL}</strong></td><td>${tdEnvio}</td><td>${hA}</td></tr>`;
    }
    tbody.innerHTML = html;
}

// --- 3. LISTADO DE ARRIBOS Y TICKET ---
async function cargarListadoCitas() {
    const f = document.getElementById('filtro-fecha').value;
    const { data: citas } = await supabase.from('reservaciones').select(`*, empresas_fleteras(nombre)`).eq('fecha', f).eq('estatus', 'ACTIVA').order('hora');
    
    actualizarMonitorCarga(citas);

    const container = document.getElementById('listado-citas-container');
    let totalTon = 0;
    let html = '';

    citas.forEach(c => {
        if(c.asistio) totalTon += (c.toneladas || 0);
        const ahora = new Date();
        const horaCita = parseInt(c.hora.split(':')[0]);
        // Validación 1 hora antes para cancelar
        const puedeCancelar = (perfilActual.rol === 'ADMIN' || (horaCita - ahora.getHours() >= 1));

        html += `
            <div class="card-cita ${c.asistio ? 'asistio' : ''}">
                <strong>${c.hora.substring(0,5)} | ${c.folio}</strong><br>
                <small>${c.empresas_fleteras?.nombre || 'INTERNO'} | ${c.toneladas} TON</small><br>
                <div style="margin-top:5px; display:flex; gap:5px;">
                    <button class="btn-sm" onclick='imprimirTicket(${JSON.stringify(c)})'>🎫 Ticket</button>
                    ${(perfilActual.rol==='BASCULA' || perfilActual.rol==='ADMIN') && !c.asistio ? `<button class="btn-sm btn-success" onclick="confirmarArribo('${c.id}')">OK</button>` : ''}
                    ${puedeCancelar ? `<button class="btn-sm btn-danger" onclick="cancelarCita('${c.id}')">X</button>` : ''}
                </div>
            </div>`;
    });
    container.innerHTML = html || 'Sin citas.';
    document.getElementById('resumen-tonelaje').innerText = `Total Realizado: ${totalTon} TON`;
}

window.imprimirTicket = (c) => {
    const v = window.open('', '_blank');
    v.document.write(`
        <html>
        <head>
            <style>
                @page { size: 80mm 150mm; margin: 0; }
                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #000; width: 260px; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
                .logo-name { font-size: 18px; font-weight: 900; letter-spacing: -1px; }
                .sub { font-size: 10px; text-transform: uppercase; margin-top: 5px; }
                .folio-box { background: #000; color: #fff; padding: 10px; margin: 15px 0; text-align: center; font-size: 22px; font-weight: bold; border-radius: 4px; }
                .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
                .label { font-weight: bold; text-transform: uppercase; color: #444; }
                .footer { text-align: center; font-size: 10px; margin-top: 20px; border-top: 1px solid #000; padding-top: 10px; }
                .qr-placeholder { border: 1px solid #000; width: 60px; height: 60px; margin: 10px auto; display: flex; align-items: center; justify-content: center; font-size: 8px; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="header">
                <div class="logo-name">SISTEMA DE CITAS</div>
                <div class="sub">Logistics Pro - Comprobante de Arribo</div>
            </div>

            <div class="folio-box">${c.folio}</div>

            <div class="info-row"><span class="label">Operación:</span> <span>${c.tipo} ${c.bodegas?.nombre || ''}</span></div>
            <div class="info-row"><span class="label">Fecha:</span> <span>${c.fecha}</span></div>
            <div class="info-row"><span class="label">Horario:</span> <span>${c.hora.substring(0,5)} hrs</span></div>
            
            <div style="margin: 15px 0;">
                <div class="info-row"><span class="label">Unidad:</span> <span>${c.placa_vehiculo}</span></div>
                <div class="info-row"><span class="label">Operador:</span> <span>${c.nombre_operador}</span></div>
                <div class="info-row"><span class="label">Carga:</span> <span>${c.toneladas} TONELADAS</span></div>
                <div class="info-row"><span class="label">ID/Tarjeta:</span> <span>${c.num_tarjeta}</span></div>
            </div>

            <div class="qr-placeholder">FOLIO SEGURO<br>${c.folio.split('-')[2]}</div>

            <div class="footer">
                ESTE DOCUMENTO ES SU COMPROBANTE DE CITA.<br>
                FAVOR DE PRESENTARSE PRESENTARLO.<br>
                <strong>¡BUEN VIAJE!</strong>
            </div>
        </body>
        </html>
    `);
    v.document.close();
};

// --- 4. ACCIONES ---
window.confirmarArribo = async (id) => {
    await supabase.from('reservaciones').update({ asistio: true }).eq('id', id);
    actualizarTodo();
};

window.cancelarCita = async (id) => {
    if(confirm("¿Cancelar cita?")) {
        await supabase.from('reservaciones').update({ estatus: 'CANCELADA' }).eq('id', id);
        actualizarTodo();
    }
};

window.prepararCita = (h, t, idB=null, nB='') => {
    const f = document.getElementById('filtro-fecha').value;
    const ahora = new Date();
    const horaCita = parseInt(h.split(':')[0]);
    
    // MODIFICACIÓN: Si es ADMIN, no le bloqueamos la hora aunque ya haya pasado
    if(f === ahora.toISOString().split('T')[0] && horaCita <= ahora.getHours()) {
        if(perfilActual.rol === 'COORDINADOR') {
            return alert("Vencido. Contacte a Báscula para emergencia.");
        }
        // Si es ADMIN o BASCULA, dejamos que pase (aparecerá como emergencia)
    }

    datosCitaTemp = { h, t, idB, nB };
    document.getElementById('modal-titulo').innerText = `${t} ${nB} ${perfilActual.rol!=='COORDINADOR'?'(INTERNO/ADMIN)':''}`;
    document.getElementById('modal-detalles').innerText = `${h.substring(0,5)} hrs`;
    document.getElementById('modal-cita').classList.remove('hidden');
};

window.confirmarCita = async () => {
    const p = document.getElementById('in-placa').value.toUpperCase();
    const t = document.getElementById('in-tarjeta').value.toUpperCase();
    const o = document.getElementById('in-operador').value.toUpperCase();
    const ton = parseInt(document.getElementById('in-toneladas').value);
    const f = document.getElementById('filtro-fecha').value;

    // Folio dinámico: Si es Admin, le ponemos una "A" de prefijo
    const prefijo = perfilActual.rol === 'ADMIN' ? 'A' : datosCitaTemp.t[0];
    const fol = `${prefijo}-${p.slice(-4)}-${Math.random().toString(36).slice(-3).toUpperCase()}`;

    // Obtenemos el ID del usuario actual
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('reservaciones').insert([{ 
        folio: fol, 
        id_usuario: user.id, 
        // Si es Coordinador usa su fletera, si es Admin usa NULL
        id_fletera: perfilActual.rol === 'COORDINADOR' ? perfilActual.id_fletera : null, 
        id_bodega: datosCitaTemp.idB, 
        fecha: f, 
        hora: datosCitaTemp.h, 
        placa_vehiculo: p, 
        nombre_operador: o, 
        num_tarjeta: t, 
        toneladas: ton, 
        tipo: datosCitaTemp.t 
    }]);

    if(error) {
        console.error(error);
        alert("Error al agendar. Verifica que no existan duplicados.");
    } else { 
        alert("Agendada con éxito: " + fol); 
        cerrarModal(); 
        actualizarTodo(); 
    }
};

// --- OTROS MÉTODOS ---
window.registrarUsuario = async () => {
    const email = document.getElementById('user-email').value;
    const nombre = document.getElementById('user-fullname').value;
    const rol = document.getElementById('select-rol-user').value;
    const idF = document.getElementById('select-fletera-user').value;
    const bods = Array.from(document.querySelectorAll('input[name="bodega-check"]:checked')).map(c => c.value);
    const pass = Math.random().toString(36).slice(-8);

    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    if (error) return alert(error.message);

    await supabase.from('perfiles').insert([{ 
        id: data.user.id, usuario: nombre, rol: rol, 
        id_fletera: (rol==='COORDINADOR'?idF:null), 
        bodegas_asignadas: (rol==='COORDINADOR'?bods:[]) 
    }]);
    window.prompt("Creado. Pass:", pass);
};

window.guardarBodega = async () => {
    const n = document.getElementById('new-bodega').value;
    await supabase.from('bodegas').insert([{ nombre: n }]);
    cargarCatalogosAdmin();
};

window.guardarFletera = async () => {
    const n = document.getElementById('new-fletera').value;
    await supabase.from('empresas_fleteras').insert([{ nombre: n }]);
    cargarCatalogosAdmin();
};

async function cargarCatalogosAdmin() {
    const { data: f } = await supabase.from('empresas_fleteras').select('*').order('nombre');
    document.getElementById('select-fletera-user').innerHTML = f.map(x => `<option value="${x.id}">${x.nombre}</option>`).join('');
    const { data: b } = await supabase.from('bodegas').select('*').order('nombre');
    document.getElementById('bodegas-check-list').innerHTML = b.map(x => `<label><input type="checkbox" name="bodega-check" value="${x.id}"> ${x.nombre}</label>`).join('');
}

window.habilitarDiaCompleto = async () => {
    const f = document.getElementById('filtro-fecha').value;
    const { data: b } = await supabase.from('bodegas').select('*');
    const regs = [];
    for(let h=0; h<24; h++) {
        const hr = `${h.toString().padStart(2,'0')}:00:00`;
        regs.push({ fecha: f, hora: hr, id_bodega: null, cupos_totales: 5 });
        b.forEach(x => regs.push({ fecha: f, hora: hr, id_bodega: x.id, cupos_totales: 2 }));
    }
    await supabase.from('disponibilidad').upsert(regs, { onConflict: 'id_bodega,fecha,hora' });
    actualizarTodo();
};

window.cambiarCupo = async (idB, fec, hor, val) => {
    await supabase.from('disponibilidad').upsert({ id_bodega: idB, fecha: fec, hora: hor, cupos_totales: parseInt(val) }, { onConflict: 'id_bodega,fecha,hora' });
};

window.cerrarModal = () => document.getElementById('modal-cita').classList.add('hidden');
document.getElementById('login-btn').onclick = async () => {
    const e = document.getElementById('email-input').value;
    const p = document.getElementById('pass-input').value;
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    if(error) alert(error.message); else checkUser();
};
document.getElementById('logout-btn').onclick = () => { supabase.auth.signOut(); location.reload(); };
document.getElementById('filtro-fecha').onchange = actualizarTodo;

checkUser();

// --- NUEVO MONITOR DE CARGA ---
async function actualizarMonitorCarga(citas) {
    const monitor = document.getElementById('monitor-carga-horas');
    if (!monitor) return;

    const resumenHoras = {};
    for (let i = 0; i < 24; i++) {
        resumenHoras[`${i.toString().padStart(2, '0')}:00:00`] = 0;
    }

    // Aquí sumamos TODO lo agendado (esté confirmado o no)
    citas.forEach(cita => {
        if (resumenHoras[cita.hora] !== undefined) {
            resumenHoras[cita.hora] += (cita.toneladas || 0);
        }
    });

    let html = '';
    Object.keys(resumenHoras).forEach(hora => {
        const tons = resumenHoras[hora];
        if (tons > 0) {
            html += `
                <div class="hora-ton-card">
                    <strong>${hora.substring(0, 5)}</strong>
                    <span>${tons}</span>
                    <small>TON</small>
                </div>`;
        }
    });

    monitor.innerHTML = html || '<p style="font-size:0.8rem; color:#94a3b8">No hay carga agendada aún.</p>';
}