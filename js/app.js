/* ============================================================
   Crono — app principal (local-first, sin cuentas)
   Datos en localStorage: perfil, registros por día y alimentos
   personalizados. Nada sale del dispositivo salvo el correo de
   la lista Pro, si el usuario decide enviarlo.
   ============================================================ */
(function () {
  'use strict';
  var M = window.Metodo;

  var CLAVES = { perfil: 'crono_perfil', registros: 'crono_registros', propios: 'crono_propios', lista: 'crono_lista_pro' };
  var ETIQUETA_MOMENTO = { desayuno: 'el desayuno', almuerzo: 'el almuerzo', cena: 'la cena', snack: 'el snack' };

  var estado = {
    perfil: leer(CLAVES.perfil, null),
    registros: leer(CLAVES.registros, {}),
    propios: leer(CLAVES.propios, []),
    platos: [],
    momento: momentoPorHora(),
    unidades: 'usa',     // 'usa' (lb, pies/pulg) o 'metrico' (kg, cm); el cálculo interno va siempre en kg/cm
    hoja: null,          // { alimento, porciones }
    metasPendientes: null
  };

  function leer(clave, defecto) {
    try { var v = localStorage.getItem(clave); return v ? JSON.parse(v) : defecto; }
    catch (e) { return defecto; }
  }
  function guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* almacenamiento lleno o bloqueado */ }
  }
  function hoyClave(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dia;
  }
  function momentoPorHora() {
    var h = new Date().getHours();
    if (h < 11) return 'desayuno';
    if (h < 16) return 'almuerzo';
    if (h < 22) return 'cena';
    return 'snack';
  }
  function normalizar(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- Navegación ---------------- */
  function ir(vista) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('activa'); });
    $('vista-' + vista).classList.add('activa');
    document.querySelectorAll('nav.bottom button').forEach(function (b) {
      b.classList.toggle('activo', b.getAttribute('data-ir') === vista);
    });
    if (vista === 'hoy') renderHoy();
    if (vista === 'metodo') renderMetodo();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-ir]').forEach(function (b) {
    b.addEventListener('click', function () { ir(b.getAttribute('data-ir')); });
  });

  /* ---------------- Unidades (USA ⇄ métrico) ---------------- */
  var LB_POR_KG = 2.20462, CM_POR_PULGADA = 2.54;
  function aplicarUnidades(u) {
    estado.unidades = u;
    document.querySelectorAll('#seg-unidades button').forEach(function (b) {
      b.classList.toggle('activo', b.getAttribute('data-unidades') === u);
    });
    var usa = u === 'usa';
    $('lbl-peso').textContent = usa ? 'Tu peso (lb)' : 'Tu peso (kg)';
    var inp = $('f-peso');
    inp.min = usa ? '77' : '35'; inp.max = usa ? '660' : '300';
    inp.placeholder = usa ? 'Ej. 176' : 'Ej. 80';
    $('campo-est-usa').style.display = usa ? '' : 'none';
    $('campo-est-cm').style.display = usa ? 'none' : '';
  }
  document.querySelectorAll('#seg-unidades button').forEach(function (b) {
    b.addEventListener('click', function () { aplicarUnidades(b.getAttribute('data-unidades')); });
  });

  /* ---------------- Onboarding ---------------- */
  function mostrarOnboarding(prefill) {
    var ob = $('onboarding');
    ob.classList.add('abierto');
    if (prefill && estado.perfil) {
      var p = estado.perfil;
      aplicarUnidades(p.unidades || 'metrico');
      if (estado.unidades === 'usa') {
        $('f-peso').value = Math.round(p.pesoKg * LB_POR_KG * 10) / 10;
        var pulg = p.estaturaCm / CM_POR_PULGADA, pies = Math.floor(pulg / 12), resto = Math.round((pulg - pies * 12) * 10) / 10;
        if (resto >= 12) { pies += 1; resto = 0; }
        $('f-pies').value = pies; $('f-pulgadas').value = resto;
      } else {
        $('f-peso').value = p.pesoKg; $('f-estatura').value = p.estaturaCm;
      }
      $('f-edad').value = p.edad; $('f-sexo').value = p.sexo;
      $('f-actividad').value = p.actividad; $('f-objetivo').value = p.objetivo;
    } else {
      aplicarUnidades(estado.unidades || 'usa');
    }
    window.scrollTo(0, 0);
  }
  function ocultarOnboarding() { $('onboarding').classList.remove('abierto'); }

  $('form-perfil').addEventListener('submit', function (e) {
    e.preventDefault();
    var pesoKg, estaturaCm;
    if (estado.unidades === 'usa') {
      pesoKg = parseFloat($('f-peso').value) / LB_POR_KG;
      estaturaCm = ((parseFloat($('f-pies').value) || 0) * 12 + (parseFloat($('f-pulgadas').value) || 0)) * CM_POR_PULGADA;
    } else {
      pesoKg = parseFloat($('f-peso').value);
      estaturaCm = parseFloat($('f-estatura').value);
    }
    var p = {
      pesoKg: Math.round(pesoKg * 10) / 10,
      estaturaCm: Math.round(estaturaCm),
      edad: parseInt($('f-edad').value, 10),
      sexo: $('f-sexo').value,
      actividad: $('f-actividad').value,
      objetivo: $('f-objetivo').value,
      unidades: estado.unidades
    };
    if (!(p.pesoKg > 0 && p.estaturaCm > 0 && p.edad > 0)) return;
    var metas = M.calcularMetas(p);
    estado.metasPendientes = { perfil: p, metas: metas };
    $('metas-preview').innerHTML =
      '<div class="resultado-metas">' +
      '<div><b>' + metas.kcal + '</b><small>kcal al día</small></div>' +
      '<div><b>' + metas.proteinaG + ' g</b><small>proteína (2.0 g/kg)</small></div>' +
      '<div><b>' + metas.carbosG + ' g</b><small>carbos (tope 2.0 g/kg)</small></div>' +
      '</div>' +
      '<p class="mini" style="margin-top:10px">Tu mantenimiento estimado es ~' + metas.mantenimientoEstimado + ' kcal' +
      (metas.ajusteKcal !== 0 ? ' y tu objetivo aplica ' + (metas.ajusteKcal < 0 ? 'un déficit suave de ' + Math.abs(metas.ajusteKcal) : 'un superávit de ' + metas.ajusteKcal) + ' kcal' : ' y tu objetivo es mantener') +
      '. La grasa cierra el resto: ' + metas.grasaG + ' g. Carbos por momento: desayuno ' + metas.carbosPorMomento.desayuno + ' g · almuerzo ' + metas.carbosPorMomento.almuerzo + ' g · cena ' + metas.carbosPorMomento.cena + ' g.</p>' +
      '<p style="margin-top:14px"><button type="button" class="btn" id="btn-empezar">Empezar con estas metas</button></p>';
    $('btn-empezar').addEventListener('click', function () {
      estado.perfil = estado.metasPendientes.perfil;
      estado.perfil.metas = estado.metasPendientes.metas;
      guardar(CLAVES.perfil, estado.perfil);
      ocultarOnboarding();
      $('app').hidden = false;
      ir('hoy');
    });
    $('metas-preview').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('btn-editar-perfil').addEventListener('click', function () { mostrarOnboarding(true); });
  $('btn-borrar').addEventListener('click', function () {
    if (confirm('¿Borrar tu perfil, tus registros y tus alimentos guardados? Esto no se puede deshacer.')) {
      Object.keys(CLAVES).forEach(function (k) { localStorage.removeItem(CLAVES[k]); });
      location.reload();
    }
  });

  /* ---------------- Vista HOY ---------------- */
  function registrosDeHoy() { return estado.registros[hoyClave()] || []; }

  function calcularRacha() {
    var racha = 0;
    var d = new Date();
    if (!estado.registros[hoyClave(d)] || !estado.registros[hoyClave(d)].length) d.setDate(d.getDate() - 1);
    while (true) {
      var lista = estado.registros[hoyClave(d)];
      if (lista && lista.length) { racha++; d.setDate(d.getDate() - 1); } else break;
    }
    return racha;
  }

  function renderHoy() {
    if (!estado.perfil) return;
    var metas = estado.perfil.metas;
    var regs = registrosDeHoy();
    var suma = M.sumarRegistros(regs);
    var t = suma.totales;

    var fecha = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    $('fecha-hoy').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    $('racha-num').textContent = calcularRacha();

    var pct = metas.proteinaG ? Math.min(100, Math.round(t.proteina / metas.proteinaG * 100)) : 0;
    $('anillo-prog').style.strokeDashoffset = String(314 - 314 * pct / 100);
    $('anillo-pct').textContent = pct + '%';
    $('prot-gramos').textContent = t.proteina + ' g';
    $('prot-meta').textContent = metas.proteinaG + ' g';
    $('prot-resta').textContent = t.proteina >= metas.proteinaG
      ? 'Meta de proteína cumplida. Así se hace.'
      : 'Te faltan ' + (metas.proteinaG - t.proteina) + ' g para cerrar el día.';

    $('kcal-num').textContent = t.kcal;
    $('kcal-meta').textContent = metas.kcal;
    $('barra-kcal').style.width = Math.min(100, metas.kcal ? t.kcal / metas.kcal * 100 : 0) + '%';
    $('carb-num').textContent = t.carbos + ' g';
    $('carb-meta').textContent = metas.carbosG + ' g';
    $('barra-carb').style.width = Math.min(100, metas.carbosG ? t.carbos / metas.carbosG * 100 : 0) + '%';
    $('grasa-num').textContent = t.grasa + ' g';
    $('grasa-meta').textContent = metas.grasaG + ' g';
    $('barra-grasa').style.width = Math.min(100, metas.grasaG ? t.grasa / metas.grasaG * 100 : 0) + '%';

    /* Línea de crono */
    var html = '';
    ['desayuno', 'almuerzo', 'cena'].forEach(function (m) {
      var datos = suma.porMomento[m];
      var sugerido = metas.carbosPorMomento[m];
      var ancho = sugerido > 0 ? Math.min(100, datos.carbos / sugerido * 100) : (datos.carbos > 0 ? 100 : 0);
      var piso = datos.proteina >= metas.pisoProteinaComidaG
        ? '<span class="piso-ok">Proteína de la comida: ' + datos.proteina + ' g · piso de 30 g cumplido</span>'
        : '<span class="piso-no">Proteína de la comida: ' + datos.proteina + ' g · piso: 30 g</span>';
      html += '<div class="momento-bloque"><div class="cab"><b style="text-transform:capitalize">' + m + '</b>' +
        '<span class="g">carbos <b>' + datos.carbos + ' g</b>' + (sugerido > 0 ? ' de ~' + sugerido + ' g' : ' · el método pide 0 g aquí') + '</span></div>' +
        '<div class="barra"><i style="width:' + ancho + '%"></i></div>' + piso + '</div>';
    });
    if (suma.porMomento.snack.items) {
      html += '<div class="momento-bloque"><div class="cab"><b>Snacks</b><span class="g">carbos <b>' + suma.porMomento.snack.carbos + ' g</b> · proteína ' + suma.porMomento.snack.proteina + ' g</span></div></div>';
    }
    $('linea-crono').innerHTML = html;

    /* Registros */
    var cont = $('registros-hoy');
    if (!regs.length) {
      cont.innerHTML = '<p class="vacio">Todavía no registras nada hoy. Tu primera comida marca el ritmo del día.</p>';
      return;
    }
    var porMomento = { desayuno: [], almuerzo: [], cena: [], snack: [] };
    regs.forEach(function (r) { (porMomento[r.momento] || porMomento.snack).push(r); });
    var salida = '';
    M.MOMENTOS.forEach(function (m) {
      porMomento[m].forEach(function (r) {
        salida += '<div class="registro"><div class="info"><b>' + esc(r.nombre) + '</b>' +
          '<small>' + esc(r.detalle) + ' · ' + m + '</small></div>' +
          '<div class="kcal"><b>' + r.kcal + '</b><small>kcal · P ' + r.proteina + ' g</small></div>' +
          '<button class="borrar" data-borrar="' + r.id + '" aria-label="Borrar registro"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0l-.8 12.2a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8L6 7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>';
      });
    });
    cont.innerHTML = salida;
    cont.querySelectorAll('[data-borrar]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-borrar');
        var lista = registrosDeHoy().filter(function (r) { return String(r.id) !== id; });
        estado.registros[hoyClave()] = lista;
        guardar(CLAVES.registros, estado.registros);
        renderHoy();
      });
    });
  }

  /* ---------------- Vista MÉTODO ---------------- */
  function renderMetodo() {
    if (!estado.perfil) return;
    var p = estado.perfil, m = p.metas;
    $('metas-resumen').innerHTML =
      '<div class="fila-meta" style="margin-top:0"><span>Energía</span><b>' + m.kcal + ' kcal</b></div>' +
      '<div class="fila-meta"><span>Proteína (2.0 g/kg)</span><b>' + m.proteinaG + ' g</b></div>' +
      '<div class="fila-meta"><span>Carbos (tope 2.0 g/kg)</span><b>' + m.carbosG + ' g</b></div>' +
      '<div class="fila-meta"><span>Grasa</span><b>' + m.grasaG + ' g</b></div>' +
      '<div class="fila-meta"><span>Tu peso base</span><b>' + (p.unidades === 'usa' ? (Math.round(p.pesoKg * LB_POR_KG * 10) / 10) + ' lb' : p.pesoKg + ' kg') + '</b></div>' +
      '<p class="mini" style="margin-top:10px">Estimaciones con Mifflin-St Jeor (mantenimiento ~' + m.mantenimientoEstimado + ' kcal). Si tu peso cambia de forma sostenida, edita tu perfil para recalcular.</p>';
  }

  /* ---------------- Vista AÑADIR ---------------- */
  function marcarMomento() {
    document.querySelectorAll('#seg-momento button').forEach(function (b) {
      b.classList.toggle('activo', b.getAttribute('data-momento') === estado.momento);
    });
    renderResultados();
  }
  document.querySelectorAll('#seg-momento button').forEach(function (b) {
    b.addEventListener('click', function () { estado.momento = b.getAttribute('data-momento'); marcarMomento(); });
  });

  function todosLosAlimentos() {
    return estado.propios.concat(estado.platos);
  }

  function tarjetaResultado(a) {
    var encaja = a.momento && a.momento !== 'cualquiera'
      ? ' · Encaja en: ' + a.momento : '';
    return '<button class="resultado" data-alimento="' + esc(a.nombre) + '"><span class="info"><b>' + esc(a.nombre) +
      (a.categoria === 'mio' ? '<span class="etiqueta mio">Mío</span>' : '') + '</b>' +
      '<small>' + esc(a.porcion) + encaja + '</small></span>' +
      '<span class="der"><b>' + a.kcal + '</b><small>kcal · P ' + a.proteina + ' g</small></span></button>';
  }

  function renderResultados() {
    var q = normalizar($('buscar').value.trim());
    var todos = todosLosAlimentos();
    var lista;
    if (!q) {
      lista = todos.filter(function (a) { return a.momento === estado.momento || a.momento === 'cualquiera'; })
        .sort(function (x, y) {
          var ex = x.momento === estado.momento ? 0 : 1, ey = y.momento === estado.momento ? 0 : 1;
          return (ex - ey) || (y.proteina - x.proteina);
        }).slice(0, 20);
    } else {
      lista = todos.filter(function (a) { return normalizar(a.nombre).indexOf(q) !== -1; }).slice(0, 30);
    }
    var cont = $('resultados');
    if (!lista.length) {
      cont.innerHTML = '<p class="vacio">Sin resultados para «' + esc($('buscar').value.trim()) + '». Prueba con otra palabra o añádelo a mano, abajo.</p>';
      return;
    }
    cont.innerHTML = (q ? '' : '<p class="mini" style="margin-top:14px">Sugeridos para ' + ETIQUETA_MOMENTO[estado.momento] + ' según el método:</p>') +
      lista.map(tarjetaResultado).join('');
    cont.querySelectorAll('[data-alimento]').forEach(function (b) {
      b.addEventListener('click', function () {
        var nombre = b.getAttribute('data-alimento');
        var a = todosLosAlimentos().filter(function (x) { return x.nombre === nombre; })[0];
        if (a) abrirHoja(a);
      });
    });
  }
  $('buscar').addEventListener('input', renderResultados);

  function renderChips() {
    var basicos = estado.platos.filter(function (a) { return a.categoria === 'basico'; });
    $('chips-basicos').innerHTML = basicos.map(function (a) {
      return '<button class="chip" data-chip="' + esc(a.nombre) + '">' + esc(a.nombre) + '<small>' + a.kcal + '</small></button>';
    }).join('');
    $('chips-basicos').querySelectorAll('[data-chip]').forEach(function (c) {
      c.addEventListener('click', function () {
        var a = estado.platos.filter(function (x) { return x.nombre === c.getAttribute('data-chip'); })[0];
        if (a) abrirHoja(a);
      });
    });
  }

  /* ---------------- Hoja de detalle / porciones ---------------- */
  function abrirHoja(alimento) {
    estado.hoja = { alimento: alimento, porciones: 1 };
    $('hoja-nombre').textContent = alimento.nombre;
    $('hoja-porcion').textContent = '1 porción = ' + alimento.porcion + ' · Valores estimados';
    $('hoja-momento').textContent = ETIQUETA_MOMENTO[estado.momento];
    actualizarHoja();
    $('hoja-fondo').classList.add('abierta');
  }
  function actualizarHoja() {
    var h = estado.hoja; if (!h) return;
    var v = M.escalar(h.alimento, h.porciones);
    $('step-valor').textContent = h.porciones;
    $('hoja-kcal').textContent = v.kcal;
    $('hoja-p').textContent = v.proteina + ' g';
    $('hoja-c').textContent = v.carbos + ' g';
    $('hoja-g').textContent = v.grasa + ' g';
  }
  function cerrarHoja() { $('hoja-fondo').classList.remove('abierta'); estado.hoja = null; }
  $('step-mas').addEventListener('click', function () {
    if (estado.hoja && estado.hoja.porciones < 6) { estado.hoja.porciones += 0.5; actualizarHoja(); }
  });
  $('step-menos').addEventListener('click', function () {
    if (estado.hoja && estado.hoja.porciones > 0.5) { estado.hoja.porciones -= 0.5; actualizarHoja(); }
  });
  $('hoja-cerrar').addEventListener('click', cerrarHoja);
  $('hoja-fondo').addEventListener('click', function (e) { if (e.target === $('hoja-fondo')) cerrarHoja(); });
  $('hoja-anadir').addEventListener('click', function () {
    var h = estado.hoja; if (!h) return;
    var v = M.escalar(h.alimento, h.porciones);
    var clave = hoyClave();
    if (!estado.registros[clave]) estado.registros[clave] = [];
    estado.registros[clave].push({
      id: Date.now(),
      nombre: h.alimento.nombre,
      detalle: h.porciones + ' × ' + h.alimento.porcion,
      momento: estado.momento,
      kcal: v.kcal, proteina: v.proteina, carbos: v.carbos, grasa: v.grasa
    });
    guardar(CLAVES.registros, estado.registros);
    cerrarHoja();
    ir('hoy');
  });

  /* ---------------- Registro manual ---------------- */
  $('form-manual').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = {
      nombre: $('m-nombre').value.trim(),
      porcion: $('m-porcion').value.trim() || '1 porción',
      kcal: parseFloat($('m-kcal').value) || 0,
      proteina: parseFloat($('m-p').value) || 0,
      carbos: parseFloat($('m-c').value) || 0,
      grasa: parseFloat($('m-g').value) || 0,
      momento: 'cualquiera',
      categoria: 'mio'
    };
    if (!a.nombre) return;
    estado.propios.push(a);
    guardar(CLAVES.propios, estado.propios);
    e.target.reset();
    abrirHoja(a);
  });

  /* ---------------- Lista Pro (FormSubmit) ---------------- */
  $('form-lista').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('pro-email').value.trim();
    if (!email) return;
    var cuerpo = {
      email: email,
      _subject: 'Crono Pro — lista de apertura',
      _template: 'table',
      _captcha: 'false',
      origen: 'tracker-crono-pwa'
    };
    fetch('https://formsubmit.co/ajax/mompehouse@gmail.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      if (!r.ok) throw new Error('envio');
      guardar(CLAVES.lista, { email: email, enviado: true, fecha: hoyClave() });
      $('lista-ok').classList.add('visible');
      e.target.reset();
    }).catch(function () {
      guardar(CLAVES.lista, { email: email, enviado: false, pendiente: true, fecha: hoyClave() });
      var aviso = $('lista-ok');
      aviso.textContent = 'Sin conexión en este momento: guardamos tu correo en tu teléfono y lo enviaremos en cuanto vuelvas a tener internet.';
      aviso.classList.add('visible');
    });
  });
  function reintentarLista() {
    var l = leer(CLAVES.lista, null);
    if (l && l.pendiente && navigator.onLine) {
      fetch('https://formsubmit.co/ajax/mompehouse@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: l.email, _subject: 'Crono Pro — lista de apertura', _template: 'table', _captcha: 'false', origen: 'tracker-crono-pwa-reintento' })
      }).then(function (r) {
        if (r.ok) guardar(CLAVES.lista, { email: l.email, enviado: true, fecha: l.fecha });
      }).catch(function () { /* se reintenta en la próxima apertura */ });
    }
  }

  /* ---------------- Arranque ---------------- */
  function arrancar() {
    if (estado.perfil) {
      $('app').hidden = false;
      ir('hoy');
    } else {
      mostrarOnboarding(false);
    }
    renderChips();
    marcarMomento();
    reintentarLista();
  }

  fetch('data/platos.json')
    .then(function (r) { return r.json(); })
    .then(function (d) { estado.platos = d.platos || []; arrancar(); })
    .catch(function () { estado.platos = []; arrancar(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* la app funciona igual sin SW */ });
    });
  }
})();
