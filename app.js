const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let perfilActual = null;
let datosCitaTemp = {};

// --- INICIO Y LOGIN ---
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
            actualizarTablaAgenda();
        }
    }
};

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('pass-input').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) alert(error.message); else checkUser();
});

// --- ADMIN: CATALOGOS Y USUARIOS ---
window.guardarBodega = async () => {
    const n = document.getElementById('new-bodega').value;
    await supabase.from('bodegas').insert([{ nombre: n }]);
    cargarCatalogosAdmin();
};

window.registrarUsuario = async () => {
    const email = document.getElementById('user-email').value;
    const pass = Math.random().toString(36).slice(-8);
    const bods = Array.from(document.querySelectorAll('input[name="bodega-check"]:checked')).map(c => c.value);
    
    const { data } = await supabase.auth.signUp({ email, password: pass });
    await supabase.from('perfiles').insert([{ 
        id: data.user.id, usuario: document.getElementById('user-fullname').value, 
        rol: 'COORDINADOR', id_fletera: document.getElementById('select-fletera-user').value, 
        bodegas_asignadas: bods 
    }]);
    window.prompt("COPIA LA CONTRASEÑA:", pass);
};

async function cargarCatalogosAdmin() {
    const { data: f } = await supabase.from('empresas_fleteras').select('*');
    document.getElementById('select-fletera-user').innerHTML = f.map(x => `<option value="${x.id}">${x.nombre}</option>`).join('');
    const { data: b } = await supabase.from('bodegas').select('*');
    document.getElementById('bodegas-check-list').innerHTML = b.map(x => `<label><input type="checkbox" name="bodega-check" value="${x.id}"> ${x.nombre}</label><br>`).join('');
}

// --- AGENDA Y CUPOS ---
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
    actualizarTablaAgenda();
};

window.cambiarCupo = async (idB, fec, hor, val) => {
    await supabase.from('disponibilidad').upsert({ id_bodega: idB || null, fecha: fec, hora: hor, cupos_totales: val }, { onConflict: 'id_bodega,fecha,hora' });
};

async function actualizarTablaAgenda() {
    const f = document.getElementById('filtro-fecha').value || new Date().toISOString().split('T')[0];
    document.getElementById('filtro-fecha').value = f;
    const { data: bods } = await supabase.from('bodegas').select('*');
    const { data: res } = await supabase.from('reservaciones').select('*').eq('fecha', f).eq('estatus', 'ACTIVA');
    const { data: disp } = await supabase.from('disponibilidad').select('*').eq('fecha', f);

    let html = '';
    for(let h=0; h<24; h++) {
        const hr = `${h.toString().padStart(2,'0')}:00:00`;
        const hrL = hr.substring(0,5);
        
        // ENVIO
        const dE = disp.find(d => !d.id_bodega && d.hora === hr);
        const cE = dE ? dE.cupos_totales : 0;
        const oE = res.filter(r => r.hora === hr && r.tipo === 'ENVIO').length;
        const lE = cE - oE;

        html += `<tr><td>${hrL}</td><td>${perfilActual.rol==='ADMIN' ? `<div class="admin-edit-cupo">Cap: <input type="number" value="${cE}" onchange="cambiarCupo(null,'${f}','${hr}',this.value)"><br>Libres: ${lE}</div>` : `<span class="badge ${lE>0?'green':'red'}">${lE} Libres</span><br><button onclick="prepararCita('${hr}','ENVIO')">Reservar</button>`}</td>`;
        
        // ABASTO
        let hA = '<div style="display:grid; gap:5px;">';
        const bVis = perfilActual.rol==='ADMIN' ? bods : bods.filter(x => perfilActual.bodegas_asignadas.includes(x.id));
        bVis.forEach(xb => {
            const dA = disp.find(d => d.id_bodega === xb.id && d.hora === hr);
            const cA = dA ? dA.cupos_totales : 0;
            const oA = res.filter(r => r.hora === hr && r.id_bodega === xb.id).length;
            const lA = cA - oA;
            hA += `<div class="admin-edit-cupo"><strong>${xb.nombre}</strong><br>${perfilActual.rol==='ADMIN' ? `Cap: <input type="number" value="${cA}" onchange="cambiarCupo('${xb.id}','${f}','${hr}',this.value)">` : `<span class="badge ${lA>0?'green':'red'}">${lA} Libres</span> <button onclick="prepararCita('${hr}','ABASTO','${xb.id}','${xb.nombre}')">Citar</button>`}</div>`;
        });
        html += `<td>${hA}</div></td></tr>`;
    }
    document.getElementById('agenda-body').innerHTML = html;
}

// --- RESERVACIONES Y TICKET ---
window.prepararCita = (h, t, idB=null, nB='') => {
    datosCitaTemp = { h, t, idB, nB };
    document.getElementById('modal-titulo').innerText = `${t} ${nB}`;
    document.getElementById('modal-detalles').innerText = `Hora: ${h.substring(0,5)}`;
    document.getElementById('modal-cita').classList.remove('hidden');
};

window.confirmarCita = async () => {
    const f = document.getElementById('filtro-fecha').value;
    const p = document.getElementById('in-placa').value.toUpperCase();
    const t = document.getElementById('in-tarjeta').value;
    const o = document.getElementById('in-operador').value;
    const fol = `${datosCitaTemp.t[0]}-${p.slice(-4)}-${Math.random().toString(36).slice(-4).toUpperCase()}`;

    const { error } = await supabase.from('reservaciones').insert([{ 
        folio: fol, id_usuario: (await supabase.auth.getUser()).data.user.id, 
        id_fletera: perfilActual.id_fletera, id_bodega: datosCitaTemp.idB, 
        fecha: f, hora: datosCitaTemp.h, placa_vehiculo: p, nombre_operador: o, num_tarjeta: t, tipo: datosCitaTemp.t 
    }]);

    if(error) alert("Error: Placa duplicada hoy");
    else { alert("Éxito"); location.reload(); }
};

document.getElementById('logout-btn').onclick = () => { supabase.auth.signOut(); location.reload(); };
document.getElementById('filtro-fecha').onchange = actualizarTablaAgenda;
checkUser();