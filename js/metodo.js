/* ============================================================
   MÉTODO DE HENRY — crono-nutrición (spec aprobada 21-oct-2026)
   ------------------------------------------------------------
   - Proteína: 2.0 g/kg de peso corporal, con piso de 30 g por comida.
   - Carbohidratos: graduales durante el día, tope 2.0 g/kg,
     desayuno sin carbos y la carga principal en la última comida.
   - Energía: déficit suave de 250–350 kcal (objetivo perder peso);
     mantenimiento sin ajuste; ganancia con superávit moderado.
   La energía de mantenimiento se ESTIMA con Mifflin-St Jeor
   (fórmula estándar) × factor de actividad. Todo son estimaciones.
   Este archivo es lógica pura: lo usa la app y la QA (Node).
   ============================================================ */
(function (global) {
  'use strict';

  var PROTEINA_G_KG = 2.0;
  var CARBOS_G_KG = 2.0;
  var PISO_PROTEINA_COMIDA_G = 30;
  var DEFICIT_SUAVE_KCAL = 300;        // centro del rango 250–350 de la spec
  var SUPERAVIT_KCAL = 250;
  var GRASA_MIN_G_KG = 0.4;             // piso de grasa para que las cuentas cierren
  var KCAL_MIN_SEGURAS = 1200;          // nunca recomendar por debajo

  var FACTOR_ACTIVIDAD = {
    sedentario: 1.2,
    ligero: 1.375,
    moderado: 1.55,
    alto: 1.725
  };

  /* Distribución de carbos por momento según el método:
     desayuno sin carbos, la carga principal en la última comida. */
  var DISTRIBUCION_CARBOS = { desayuno: 0.0, almuerzo: 0.40, cena: 0.60 };

  var MOMENTOS = ['desayuno', 'almuerzo', 'cena', 'snack'];

  function redondear(n) { return Math.round(n); }

  /* Mifflin-St Jeor: estimación estándar de metabolismo basal. */
  function metabolismoBasal(p) {
    var base = 10 * p.pesoKg + 6.25 * p.estaturaCm - 5 * p.edad;
    return p.sexo === 'mujer' ? base - 161 : base + 5;
  }

  /*
   * calcularMetas(perfil) — perfil: { pesoKg, estaturaCm, edad, sexo,
   * actividad, objetivo: 'perder' | 'mantener' | 'ganar' }
   * Devuelve las metas diarias y la explicación de cada número.
   */
  function calcularMetas(p) {
    var tmb = metabolismoBasal(p);
    var mantenimiento = tmb * (FACTOR_ACTIVIDAD[p.actividad] || 1.2);
    var ajuste = p.objetivo === 'perder' ? -DEFICIT_SUAVE_KCAL
               : p.objetivo === 'ganar' ? SUPERAVIT_KCAL : 0;
    var kcal = Math.max(KCAL_MIN_SEGURAS, redondear(mantenimiento + ajuste));

    var proteina = redondear(PROTEINA_G_KG * p.pesoKg);
    var carbos = redondear(CARBOS_G_KG * p.pesoKg);

    /* La grasa cierra las calorías. Si no llega al piso, los carbos
       (el macro flexible del método) ceden espacio. */
    var grasa = (kcal - proteina * 4 - carbos * 4) / 9;
    if (grasa < GRASA_MIN_G_KG * p.pesoKg) {
      grasa = GRASA_MIN_G_KG * p.pesoKg;
      carbos = Math.max(0, redondear((kcal - proteina * 4 - grasa * 9) / 4));
    }
    grasa = redondear(grasa);

    return {
      kcal: kcal,
      proteinaG: proteina,
      carbosG: carbos,
      grasaG: grasa,
      mantenimientoEstimado: redondear(mantenimiento),
      ajusteKcal: ajuste,
      pisoProteinaComidaG: PISO_PROTEINA_COMIDA_G,
      carbosPorMomento: {
        desayuno: redondear(carbos * DISTRIBUCION_CARBOS.desayuno),
        almuerzo: redondear(carbos * DISTRIBUCION_CARBOS.almuerzo),
        cena: redondear(carbos * DISTRIBUCION_CARBOS.cena)
      },
      proteinaGKg: PROTEINA_G_KG,
      carbosGKg: CARBOS_G_KG
    };
  }

  /* Suma los totales de una lista de registros del día.
     Cada registro ya trae sus valores escalados por porciones. */
  function sumarRegistros(registros) {
    var t = { kcal: 0, proteina: 0, carbos: 0, grasa: 0 };
    var porMomento = {};
    MOMENTOS.forEach(function (m) { porMomento[m] = { kcal: 0, proteina: 0, carbos: 0, grasa: 0, items: 0 }; });
    (registros || []).forEach(function (r) {
      t.kcal += r.kcal; t.proteina += r.proteina; t.carbos += r.carbos; t.grasa += r.grasa;
      var mm = porMomento[r.momento] || porMomento.snack;
      mm.kcal += r.kcal; mm.proteina += r.proteina; mm.carbos += r.carbos; mm.grasa += r.grasa; mm.items += 1;
    });
    ['kcal', 'proteina', 'carbos', 'grasa'].forEach(function (k) { t[k] = redondear(t[k]); });
    MOMENTOS.forEach(function (m) {
      ['kcal', 'proteina', 'carbos', 'grasa'].forEach(function (k) { porMomento[m][k] = redondear(porMomento[m][k]); });
    });
    return { totales: t, porMomento: porMomento };
  }

  /* Escala los valores base de un alimento por número de porciones. */
  function escalar(alimento, porciones) {
    return {
      kcal: redondear(alimento.kcal * porciones),
      proteina: redondear(alimento.proteina * porciones),
      carbos: redondear(alimento.carbos * porciones),
      grasa: redondear(alimento.grasa * porciones)
    };
  }

  var api = {
    calcularMetas: calcularMetas,
    metabolismoBasal: metabolismoBasal,
    sumarRegistros: sumarRegistros,
    escalar: escalar,
    DISTRIBUCION_CARBOS: DISTRIBUCION_CARBOS,
    MOMENTOS: MOMENTOS,
    PISO_PROTEINA_COMIDA_G: PISO_PROTEINA_COMIDA_G
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Metodo = api;
})(typeof window !== 'undefined' ? window : globalThis);
