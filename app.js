import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'



// --- CONFIGURACIÓN DE TU BASE DE DATOS ---

const SUPABASE_URL = 'https://aglfusprpmplggmodiik.supabase.co'

const SUPABASE_KEY = 'sb_publishable_WY-tRHDCwgdcsgg1UfCC5A_2uq7sfhb'               



const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// -----------------------------------------


let usuarioLogueado = null;


// FUNCIÓN DE LOGIN

document.getElementById('login-btn').addEventListener('click', async () => {

    const user = document.getElementById('user-input').value;

    const pass = document.getElementById('pass-input').value;



    const { data, error } = await supabase

        .from('usuarios_sistema')

        .select('*')

        .eq('usuario', user)

        .eq('password', pass)

        .single();



    if (data) {

        usuarioLogueado = data;

        document.getElementById('login-overlay').classList.add('hidden');

        configurarInterfaz();

    } else {

        alert("Usuario o contraseña incorrectos");

    }

});



// CONFIGURAR QUÉ VE CADA QUIÉN

function configurarInterfaz() {

    if (usuarioLogueado.rol === 'ADMIN') {

        document.getElementById('admin-section').classList.remove('hidden');

        document.getElementById('gestion-accesos').classList.remove('hidden');

    } else {

        document.getElementById('user-section').classList.remove('hidden');

        document.getElementById('fletera-name').value = usuarioLogueado.nombre_asociado;

        document.getElementById('fletera-name').disabled = true;

    }

    cargarHorarios();

}



// FUNCIÓN PARA QUE EL ADMIN CREE NUEVOS ACCESOS

window.crearUsuario = async () => {

    const user = document.getElementById('new-user').value;

    const pass = document.getElementById('new-pass').value;

    const role = document.getElementById('new-role').value;



    const { error } = await supabase

        .from('usuarios_sistema')

        .insert([{ usuario: user, password: pass, rol: role }]);



    if (error) alert("Error al crear usuario");

    else alert("Usuario creado correctamente");

};


// TIEMPO REAL

const canalReservas = supabase

  .channel('cambios-reservas')

  .on('postgres_changes',

      { event: '*', schema: 'public', table: 'reservaciones' },

      (payload) => {

        console.log('Cambio detectado, actualizando tabla...');

        cargarHorarios(); // Refresh a la tabla para todos los usuarios conectados

      })

  .subscribe();



  window.intentarReservar = async (hora, tipo) => {

    const fletera = document.getElementById('fletera-name').value;

    const fechaActual = new Date().toISOString().split('T')[0];



    // Generar Folio: TIPO-AAAAMMDD-HORA-RANDOM

    const idRandom = Math.random().toString(36).substring(2, 6).toUpperCase();

    const folio = `${tipo[0]}-${fechaActual.replace(/-/g,'')}-${hora.replace(':','')}-${idRandom}`;



    const { error } = await supabase.from('reservaciones').insert([

        { folio, hora, tipo, nombre_fletera: fletera, fecha: fechaActual }

    ]);



    if (error) {

        alert("Error al reservar: " + error.message);

    } else {

        imprimirTicket(folio, fletera, tipo, fechaActual, hora);

    }

}



// function imprimirTicket(folio, fletera, tipo, fecha, hora) {

//     // Llenar datos en el área de impresión

//     document.getElementById('p-folio').innerText = folio;

//     document.getElementById('p-fletera').innerText = fletera;

//     document.getElementById('p-tipo').innerText = tipo;

//     document.getElementById('p-fecha').innerText = fecha;

//     document.getElementById('p-hora').innerText = hora;



//     // Crear una ventana temporal para impresión

//     const contenido = document.getElementById('print-area').innerHTML;

//     const ventanaPrivada = window.open('', '', 'height=600,width=800');

   

//     ventanaPrivada.document.write('<html><head><title>Imprimir Folio</title></head><body>');

//     ventanaPrivada.document.write(contenido);

//     ventanaPrivada.document.write('</body></html>');

   

//     ventanaPrivada.document.close();

//     ventanaPrivada.print();

//     ventanaPrivada.close();

// }



window.intentarReservar = async (hora, tipo) => {

    const fletera = document.getElementById('fletera-name').value;

    const fechaActual = new Date().toLocaleDateString('es-MX'); // Fecha legible

    const fechaISO = new Date().toISOString().split('T')[0]; // Para la BD



    if (!fletera) return alert("Por favor, ingresa el nombre de la fletera.");



    // Generar Folio: TIPO-HORA-RANDOM (Ej: ABASTO-0800-X7R2)

    const idRandom = Math.random().toString(36).substring(2, 6).toUpperCase();

    const folio = `${tipo}-${hora.replace(':', '')}-${idRandom}`;



    const { error } = await supabase.from('reservaciones').insert([

        {

            folio: folio,

            hora: hora,

            tipo: tipo,

            nombre_fletera: fletera,

            fecha: fechaISO

        }

    ]);



    if (error) {

        alert("Error al reservar: " + error.message);

    } else {

        imprimirTicket({

            folio,

            fletera,

            tipo,

            fecha: fechaActual,

            hora

        });

    }

}



function imprimirTicket(datos) {

    const ventana = window.open('', '_blank');

    ventana.document.write(`

        <html>

        <head>

            <title>Ticket de Confirmación - ${datos.folio}</title>

            <style>

                body { font-family: 'Courier New', Courier, monospace; padding: 20px; text-align: center; }

                .ticket { border: 1px dashed #000; padding: 15px; display: inline-block; }

                h2 { margin-bottom: 5px; }

                .folio { font-size: 24px; font-weight: bold; margin: 15px 0; border: 2px solid #000; padding: 5px; }

                p { margin: 5px 0; text-align: left; }

                .footer { font-size: 12px; margin-top: 20px; font-style: italic; }

            </style>

        </head>

        <body onload="window.print(); window.close();">

            <div class="ticket">

                <h2>CONFIRMACIÓN DE CITA</h2>

                <div class="folio">${datos.folio}</div>

                <p><strong>FLETERA:</strong> ${datos.fletera}</p>

                <p><strong>OPERACIÓN:</strong> ${datos.tipo}</p>

                <p><strong>FECHA:</strong> ${datos.fecha}</p>

                <p><strong>HORA DE ARRIBO:</strong> ${datos.hora} hrs</p>

                <div class="footer">

                    Presente este folio digital o impreso al llegar a caseta.

                </div>

            </div>

        </body>

        </html>

    `);

    ventana.document.close();

}


// Función para que el Admin elimine una reserva

window.cancelarCita = async (idReserva) => {

    const confirmar = confirm("¿Estás seguro de cancelar esta reservación? El espacio se liberará.");

   

    if (confirmar) {

        const { error } = await supabase

            .from('reservaciones')

            .delete()

            .eq('id', idReserva);



        if (error) alert("Error al cancelar");

        else alert("Cita cancelada y espacio liberado");

    }

}



async function cargarLogAdmin() {

    const { data: citas } = await supabase

        .from('reservaciones')

        .select('*')

        .order('creado_en', { ascending: false });



    const logContainer = document.getElementById('admin-log');

    logContainer.innerHTML = '<h4>Historial de Folios</h4>';

    citas.forEach(cita => {

        logContainer.innerHTML += `

            <div class="log-item" style="border-bottom: 1px solid #eee; padding: 10px;">

                <strong>${cita.folio}</strong> - ${cita.nombre_fletera}<br>

                <small>${cita.hora} | ${cita.tipo}</small>

                <button onclick="cancelarCita(${cita.id})"

                        style="background:var(--danger); padding: 2px 8px; font-size: 10px; float: right;">

                    Eliminar

                </button>

            </div>

        `;

    });

}

async function cargarHorarios() {
    const slotsBody = document.getElementById('slots-body');
    if (!slotsBody) return;

    // 1. Obtener cupos
    const { data: maestros } = await supabase.from('disponibilidad_maestra').select('*').order('hora');
    
    // 2. Obtener reservas de hoy
    const hoy = new Date().toISOString().split('T')[0];
    const { data: reservas } = await supabase.from('reservaciones').select('*').eq('fecha', hoy);

    slotsBody.innerHTML = '';

    maestros.forEach(slot => {
        const ocupadosEnv = reservas.filter(r => r.hora === slot.hora && r.tipo === 'ENVIADO').length;
        const ocupadosAbs = reservas.filter(r => r.hora === slot.hora && r.tipo === 'ABASTO').length;

        const dispEnv = slot.cupos_enviado - ocupadosEnv;
        const dispAbs = slot.cupos_abasto - ocupadosAbs;

        const row = `
            <tr>
                <td><strong>${slot.hora.substring(0,5)}</strong></td>
                <td>
                    <span class="badge ${dispEnv > 0 ? 'green' : 'red'}">${dispEnv}</span>
                    <button onclick="intentarReservar('${slot.hora}', 'ENVIADO')" ${dispEnv <= 0 ? 'disabled' : ''}>Reservar</button>
                </td>
                <td>
                    <span class="badge ${dispAbs > 0 ? 'green' : 'red'}">${dispAbs}</span>
                    <button onclick="intentarReservar('${slot.hora}', 'ABASTO')" ${dispAbs <= 0 ? 'disabled' : ''}>Reservar</button>
                </td>
            </tr>
        `;
        slotsBody.innerHTML += row;
    });

    if (usuarioLogueado && usuarioLogueado.rol === 'ADMIN') {
        cargarLogAdmin();
    }
}