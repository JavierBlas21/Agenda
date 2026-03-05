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
