/* Brukergrensesnitt for skattekalkulatoren. Beregningene ligger i skatt.js. */
(function () {
  'use strict';

  var S = window.Skatt;
  var G = S.SATSER.G;
  var LAGRING = 'skattekalkulator-2026';

  var $ = function (id) { return document.getElementById(id); };
  var tallFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

  function kr(n) { return tallFormat.format(Math.round(n)) + ' kr'; }
  function krKort(n) {
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: 2 }) + ' mill.';
    if (a >= 1e3) return Math.round(n / 1e3) + ' k';
    return String(Math.round(n));
  }
  function medFortegn(n) {
    var r = Math.round(n);
    if (r === 0) return '0 kr';
    return (r > 0 ? '+' : '−') + tallFormat.format(Math.abs(r)) + ' kr';
  }
  function pst(x, d) { return (x * 100).toLocaleString('nb-NO', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) + ' %'; }
  function tolk(s) {
    var t = String(s).replace(/−/g, '-').replace(/kr/gi, '').replace(/\s/g, '').replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function lesLagret() {
    try { return JSON.parse(localStorage.getItem(LAGRING)) || null; } catch (e) { return null; }
  }
  function lagre() {
    try {
      var felt = {};
      FELT.forEach(function (id) {
        var el = $(id);
        felt[id] = el.type === 'checkbox' ? el.checked : el.value;
      });
      localStorage.setItem(LAGRING, JSON.stringify({ felt: felt, valg: valg, scenarier: egne, base: $('baseScenario').value }));
    } catch (e) { /* lagring er bare en bekvemmelighet */ }
  }

  var FELT = ['omsetning', 'kostnader', 'agaSone', 'otpSats', 'friEK', 'fradrag', 'inngangsverdi',
    'skjermingsrente', 'privatFormue', 'asFormue', 'medLatent', 'medFormue', 'otpVekt'];
  var STANDARD = {};

  // Valgt fordeling: lønn og ønsket beløp igjen i selskapet. null = bruk anbefalingen.
  var valg = { lonn: null, beholdt: 0 };
  var egne = [];

  /* ---------- Oppsett ---------- */

  S.AGA_SONER.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.navn + ' – ' + pst(s.sats);
    $('agaSone').appendChild(o);
  });

  FELT.forEach(function (id) {
    var el = $(id);
    STANDARD[id] = el.type === 'checkbox' ? el.checked : el.value;
  });

  var lagret = lesLagret();
  if (lagret && lagret.felt) {
    FELT.forEach(function (id) {
      if (!(id in lagret.felt)) return;
      var el = $(id);
      if (el.type === 'checkbox') el.checked = !!lagret.felt[id]; else el.value = lagret.felt[id];
    });
    if (lagret.valg) valg = lagret.valg;
    if (Array.isArray(lagret.scenarier)) egne = lagret.scenarier;
  }

  function forutsetninger() {
    var sone = S.AGA_SONER.filter(function (s) { return s.id === $('agaSone').value; })[0] || S.AGA_SONER[0];
    return {
      omsetning: tolk($('omsetning').value),
      kostnader: tolk($('kostnader').value),
      agaSats: sone.sats,
      otpSats: Math.max(0, tolk($('otpSats').value)) / 100,
      friEK: Math.max(0, tolk($('friEK').value)),
      fradrag: Math.max(0, tolk($('fradrag').value)),
      inngangsverdi: Math.max(0, tolk($('inngangsverdi').value)),
      skjermingsrente: Math.max(0, tolk($('skjermingsrente').value)) / 100,
      privatFormue: tolk($('privatFormue').value),
      asFormue: tolk($('asFormue').value),
      medLatent: $('medLatent').checked,
      medFormue: $('medFormue').checked,
      otpVekt: tolk($('otpVekt').value)
    };
  }

  /* ---------- Diagramfarger fra temaet ---------- */

  function farge(navn) { return getComputedStyle(document.documentElement).getPropertyValue(navn).trim(); }
  function farger() {
    return {
      blekk: farge('--blekk'), dempet: farge('--dempet'), linje: farge('--linje'), flate: farge('--flate'),
      aksent: farge('--aksent'), lonn: farge('--c-lonn'), utbytte: farge('--c-utbytte'),
      beholdt: farge('--c-beholdt'), aga: farge('--c-aga'), selskap: farge('--c-selskap'),
      utbytteskatt: farge('--c-utbytteskatt'), personskatt: farge('--c-personskatt'),
      latent: farge('--c-latent'), formue: farge('--c-formue'), god: farge('--god')
    };
  }
  function medAlfa(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* Tegner loddrette markører (optimum, skjæringspunkt, ditt valg) i et diagram. */
  var markorPlugin = {
    id: 'markorer',
    afterDatasetsDraw: function (chart, args, opts) {
      var liste = opts && opts.liste;
      if (!liste || !liste.length) return;
      var ctx = chart.ctx, area = chart.chartArea, x = chart.scales.x;
      ctx.save();
      liste.forEach(function (m, i) {
        var px = x.getPixelForValue(m.x);
        if (px < area.left - 1 || px > area.right + 1) return;
        ctx.strokeStyle = m.farge;
        ctx.lineWidth = m.bredde || 1.5;
        ctx.setLineDash(m.stiplet ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(px, area.top);
        ctx.lineTo(px, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily;
        var tekst = m.tekst;
        var w = ctx.measureText(tekst).width;
        var tx = px + 6;
        if (tx + w > area.right) tx = px - 6 - w;
        var ty = area.top + 12 + (i % 3) * 15;
        ctx.fillStyle = m.farge;
        ctx.fillText(tekst, tx, ty);
      });
      ctx.restore();
    }
  };

  var diagrammer = {};
  function lagDiagrammer() {
    Object.keys(diagrammer).forEach(function (k) { diagrammer[k].destroy(); });
    var f = farger();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = f.dempet;
    Chart.defaults.borderColor = f.linje;

    var krAkse = {
      type: 'linear',
      grid: { color: medAlfa(f.linje, 0.6) || f.linje },
      ticks: { callback: function (v) { return krKort(v); }, maxTicksLimit: 8 }
    };
    var tooltipBase = {
      backgroundColor: f.flate, titleColor: f.blekk, bodyColor: f.blekk,
      borderColor: f.linje, borderWidth: 1, padding: 10
    };

    diagrammer.marginal = new Chart($('marginalDiagram'), {
      type: 'line',
      data: { datasets: [
        { label: 'Lønn (inkl. AGA)', data: [], borderColor: f.lonn, backgroundColor: f.lonn, borderWidth: 2.5, pointRadius: 0, stepped: false, tension: 0 },
        { label: 'Utbytte (inkl. selskapsskatt)', data: [], borderColor: f.utbytte, backgroundColor: f.utbytte, borderWidth: 2.5, pointRadius: 0, tension: 0 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: Object.assign({}, krAkse, { title: { display: true, text: 'Lønnsnivå' } }),
          y: { min: 0, suggestedMax: 0.6, grid: { color: medAlfa(f.linje, 0.6) }, ticks: { callback: function (v) { return Math.round(v * 100) + ' %'; } }, title: { display: true, text: 'Marginalskatt totalt' } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: false } },
          tooltip: Object.assign({}, tooltipBase, { callbacks: {
            title: function (it) { return 'Lønn ' + kr(it[0].parsed.x); },
            label: function (it) { return it.dataset.label + ': ' + pst(it.parsed.y); }
          } }),
          markorer: { liste: [] }
        }
      },
      plugins: [markorPlugin]
    });

    var lag = function (label, farge, felt) {
      return { label: label, data: [], borderColor: farge, backgroundColor: medAlfa(farge, 0.75), fill: true, borderWidth: 1, pointRadius: 0, stack: 'skatt', felt: felt };
    };
    diagrammer.total = new Chart($('totalDiagram'), {
      type: 'line',
      data: { datasets: [
        lag('Arbeidsgiveravgift', f.aga, 'aga'),
        lag('Selskapsskatt', f.selskap, 'selskapsskatt'),
        lag('Skatt på lønn', f.personskatt, 'personskattLonn'),
        lag('Utbytteskatt', f.utbytteskatt, 'utbytteskatt'),
        lag('Fremtidig utbytteskatt', f.latent, 'latent'),
        lag('Formuesskatt', f.formue, 'formue'),
        { label: 'Netto til deg', data: [], borderColor: f.aksent, backgroundColor: f.aksent, borderWidth: 2.5, pointRadius: 0, fill: false, stack: 'netto', felt: 'netto' }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: Object.assign({}, krAkse, { title: { display: true, text: 'Lønn' } }),
          y: Object.assign({}, krAkse, { stacked: true, min: 0, title: { display: true, text: 'Kroner' } })
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, filter: function (it, data) { return !data.datasets[it.datasetIndex].hidden; } } },
          tooltip: Object.assign({}, tooltipBase, { callbacks: {
            title: function (it) { return 'Lønn ' + kr(it[0].parsed.x); },
            label: function (it) { return it.dataset.label + ': ' + kr(it.raw.v); },
            footer: function (it) {
              var sum = 0;
              it.forEach(function (i) { if (i.dataset.stack === 'skatt') sum += i.raw.v; });
              return 'Sum skatt: ' + kr(sum);
            }
          } }),
          markorer: { liste: [] }
        }
      },
      plugins: [markorPlugin]
    });
    // "Netto" skal ikke stables oppå skatten.
    diagrammer.total.options.scales.y.stacked = false;

    diagrammer.scenario = new Chart($('scenarioDiagram'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: Object.assign({}, krAkse, { stacked: true }),
          y: { stacked: true, grid: { display: false }, ticks: { color: f.blekk } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: Object.assign({}, tooltipBase, { callbacks: { label: function (it) { return it.dataset.label + ': ' + kr(it.raw); } } })
        }
      }
    });
  }

  /* ---------- Hovedberegning og visning ---------- */

  function scenarioListe(p, anbefalt, valgt) {
    var sekG = 6 * G;
    var maksL = S.maksLonn(p, 0);
    var liste = [
      { id: 'anbefalt', navn: 'Anbefalt', fast: true, lonn: anbefalt.lonn, beholdt: valg.beholdt },
      { id: 'valgt', navn: 'Din fordeling', fast: true, lonn: valgt.lonn, beholdt: valg.beholdt },
      { id: 'utbytte', navn: 'Kun utbytte', fast: true, lonn: 0, beholdt: 0 },
      { id: '6g', navn: 'Lønn 6 G + utbytte', fast: true, lonn: Math.min(sekG, maksL), beholdt: 0 },
      { id: 'lonn', navn: 'Alt som lønn', fast: true, lonn: maksL, beholdt: 0 }
    ];
    egne.forEach(function (e, i) { liste.push({ id: 'egen-' + i, navn: e.navn, fast: false, indeks: i, lonn: e.lonn, beholdt: e.beholdt }); });
    liste.forEach(function (s) { s.r = S.beregn(p, s.lonn, s.beholdt); });
    return liste;
  }

  function oppdater() {
    var p = forutsetninger();
    var anbefalt = S.optimer(p, valg.beholdt);
    var lonn = valg.lonn == null ? anbefalt.lonn : valg.lonn;
    var maksL = S.lonnForKostnad(Math.max(0, p.omsetning - p.kostnader + p.friEK), p);
    lonn = Math.min(lonn, maksL);
    var r = S.beregn(p, lonn, valg.beholdt);

    visAnbefaling(p, anbefalt);
    visGlidere(p, r, maksL);
    visFordeling(r, anbefalt);
    visMarginal(p, r, anbefalt);
    visTotal(p, r, anbefalt);
    visOppstilling(r);
    visRettigheter(r);
    visScenarier(p, anbefalt, r);
    lagre();
  }

  function visAnbefaling(p, a) {
    $('anbLonn').textContent = kr(a.lonn);
    var overskudd = a.overskuddForLonn;
    var tekst;
    if (overskudd <= 0) {
      tekst = 'Selskapet har ikke overskudd før lønn. Juster omsetning eller kostnader.';
    } else {
      var trinn = S.trinnsats(a.lonn);
      tekst = 'Resten av overskuddet tas ut som utbytte' +
        (valg.beholdt > 0 ? ', og ' + kr(valg.beholdt) + ' blir igjen i selskapet' : '') +
        '. Lønnen ligger ' + (trinn > 0 ? 'i trinnskatt med ' + pst(trinn) + ' sats.' : 'under innslagspunktet for trinnskatt.');
    }
    $('anbTekst').textContent = tekst;
    $('anbUtbytte').textContent = kr(a.utbytte);
    $('anbNetto').textContent = kr(a.netto);
    $('anbSkatt').textContent = kr(a.totalSkatt);
    var grunnlag = a.overskuddForLonn + Math.max(0, -a.beholdt);
    $('anbSats').textContent = grunnlag > 0 ? pst(a.totalSkatt / grunnlag) : '–';
  }

  var aktivtFelt = null;
  function settVerdi(id, verdi) {
    if (aktivtFelt === id) return;
    $(id).value = tallFormat.format(Math.round(verdi));
  }

  function visGlidere(p, r, maksL) {
    var lr = $('lonnRange'), ur = $('utbytteRange'), br = $('beholdtRange');
    lr.max = Math.max(1000, Math.ceil(maksL / 1000) * 1000);
    lr.value = r.lonn;
    ur.max = Math.max(1000, Math.ceil(r.maksUtbytte / 1000) * 1000);
    ur.value = r.utbytte;
    br.min = -Math.floor(p.friEK / 1000) * 1000;
    br.max = Math.max(1000, Math.ceil(Math.max(0, r.resultatEtterSkatt) / 1000) * 1000);
    br.value = r.beholdt;
    settVerdi('lonnInput', r.lonn);
    settVerdi('utbytteInput', r.utbytte);
    settVerdi('beholdtInput', r.beholdt);
  }

  function visFordeling(r, a) {
    var f = farger();
    var deler = [
      { navn: 'Netto lønn', v: r.nettoLonn, c: f.lonn },
      { navn: 'Netto utbytte', v: r.nettoUtbytte, c: f.utbytte },
      { navn: 'Igjen i selskapet', v: Math.max(0, r.beholdt) - r.latent, c: f.beholdt },
      { navn: 'OTP', v: r.otp, c: f.aksent },
      { navn: 'Arbeidsgiveravgift', v: r.aga, c: f.aga },
      { navn: 'Selskapsskatt', v: r.selskapsskatt, c: f.selskap },
      { navn: 'Skatt på lønn', v: r.personskattLonn, c: f.personskatt },
      { navn: 'Utbytteskatt', v: r.utbytteskatt, c: f.utbytteskatt },
      { navn: 'Fremtidig utbytteskatt', v: r.latent, c: f.latent }
    ].filter(function (d) { return d.v > 0.5; });
    var sum = deler.reduce(function (s, d) { return s + d.v; }, 0) || 1;
    $('fordelingsbar').innerHTML = deler.map(function (d) {
      return '<span style="flex-basis:' + (d.v / sum * 100).toFixed(3) + '%;background:' + d.c + '" title="' + esc(d.navn) + ': ' + kr(d.v) + '"></span>';
    }).join('');
    $('fordelingsforklaring').innerHTML = deler.map(function (d) {
      return '<li><i style="background:' + d.c + '"></i>' + esc(d.navn) + ' <b>' + kr(d.v) + '</b></li>';
    }).join('');

    var diffSkatt = r.totalSkatt - a.totalSkatt;
    var diffNetto = r.netto - a.netto;
    var grunnlag = r.overskuddForLonn + Math.max(0, -r.beholdt);
    $('sammendrag').innerHTML = [
      ['Total skatt', kr(r.totalSkatt), diffSkatt, true],
      ['Netto til deg', kr(r.netto), diffNetto, false],
      ['Effektiv skattesats', grunnlag > 0 ? pst(r.totalSkatt / grunnlag) : '–', null],
      ['Formuesskatt neste år', kr(r.formuesskatt), null]
    ].map(function (k) {
      var diff = '';
      if (k[2] != null) {
        var d = Math.round(k[2]);
        var klasse = d === 0 ? '' : ((d > 0) !== k[3] ? 'pluss' : 'minus');
        diff = '<em class="' + klasse + '">' + (d === 0 ? 'Som anbefalt' : medFortegn(d) + ' mot anbefalt') + '</em>';
      }
      return '<div><span>' + k[0] + '</span><strong>' + k[1] + '</strong>' + diff + '</div>';
    }).join('');
  }

  function visMarginal(p, r, a) {
    var f = farger();
    var xmax = Math.max(1600000, Math.min(2600000, r.lonn * 1.3), S.SATSER.trinn[4][0] * 1.1);
    var n = 260, punkterL = [], punkterU = [];
    var forrige = null, kryss = [];
    for (var i = 0; i <= n; i++) {
      var L = xmax * i / n;
      var m = S.marginal(p, L, r.utbytte);
      punkterL.push({ x: L, y: m.lonn });
      punkterU.push({ x: L, y: m.utbytte });
      var diff = m.lonn - m.utbytte;
      if (forrige != null && Math.sign(diff) !== Math.sign(forrige.diff) && Math.abs(diff - forrige.diff) > 1e-6) {
        // Finn knekkpunktet presist med halveringssøk.
        var lo = forrige.L, hi = L;
        for (var k = 0; k < 30; k++) {
          var mid = (lo + hi) / 2, mm = S.marginal(p, mid, r.utbytte);
          if (Math.sign(mm.lonn - mm.utbytte) === Math.sign(forrige.diff)) lo = mid; else hi = mid;
        }
        kryss.push({ x: hi, tilDyrere: diff > 0 });
      }
      forrige = { L: L, diff: diff };
    }
    var ch = diagrammer.marginal;
    ch.data.datasets[0].data = punkterL;
    ch.data.datasets[1].data = punkterU;
    ch.options.scales.x.max = xmax;
    var markorer = kryss.filter(function (k) { return k.tilDyrere; }).map(function (k) {
      return { x: k.x, farge: f.blekk, tekst: 'Skjæringspunkt ' + krKort(k.x), stiplet: true };
    });
    markorer.push({ x: r.lonn, farge: f.lonn, tekst: 'Din lønn', bredde: 2 });
    ch.options.plugins.markorer.liste = markorer;
    ch.update('none');

    var forste = kryss.filter(function (k) { return k.tilDyrere; })[0];
    var mNaa = S.marginal(p, r.lonn, r.utbytte);
    var tekst;
    if (forste) {
      tekst = 'Med dine tall er lønn billigere enn utbytte opp til <strong>' + kr(Math.round(forste.x / 100) * 100) +
        '</strong>. Over dette koster neste krone i lønn ' + pst(S.marginal(p, forste.x + 5000, r.utbytte).lonn) +
        ' i samlet skatt, mot ' + pst(mNaa.utbytte) + ' for utbytte.';
    } else {
      tekst = 'Med dine tall er lønn billigere enn utbytte i hele intervallet som vises.';
    }
    $('skjaeringTekst').innerHTML = tekst;
  }

  function visTotal(p, r, a) {
    var f = farger();
    var maksL = S.maksLonn(p, valg.beholdt);
    var n = 160;
    var serier = diagrammer.total.data.datasets;
    serier.forEach(function (d) { d.data = []; });
    for (var i = 0; i <= n; i++) {
      var L = maksL * i / n;
      var x = S.beregn(p, L, valg.beholdt);
      var verdier = {
        aga: x.aga, selskapsskatt: x.selskapsskatt, personskattLonn: x.personskattLonn,
        utbytteskatt: x.utbytteskatt, latent: x.latent, formue: p.medFormue ? x.formuesskatt : 0, netto: x.netto
      };
      var akk = 0;
      serier.forEach(function (d) {
        var v = verdier[d.felt];
        if (d.stack === 'skatt') { akk += v; d.data.push({ x: L, y: akk, v: v }); }
        else d.data.push({ x: L, y: v, v: v });
      });
    }
    serier.forEach(function (d) {
      if (d.felt === 'latent') d.hidden = !p.medLatent || valg.beholdt <= 0;
      if (d.felt === 'formue') d.hidden = !p.medFormue;
      if (d.stack === 'skatt') d.fill = d === serier[0] ? 'origin' : '-1';
    });
    // Skjulte lag skal ikke brukes som fyllgrense.
    var synlige = serier.filter(function (d) { return d.stack === 'skatt' && !d.hidden; });
    synlige.forEach(function (d, i) { d.fill = i === 0 ? 'origin' : serier.indexOf(synlige[i - 1]); });

    var ch = diagrammer.total;
    ch.options.scales.x.max = maksL || 1;
    ch.options.plugins.markorer.liste = [
      { x: a.lonn, farge: f.aksent, tekst: 'Anbefalt', stiplet: true },
      { x: r.lonn, farge: f.lonn, tekst: 'Din lønn', bredde: 2 }
    ];
    ch.update('none');
  }

  function visOppstilling(r) {
    var rad = function (navn, v, klasse) {
      return '<tr' + (klasse ? ' class="' + klasse + '"' : '') + '><td>' + navn + '</td><td class="tall">' + kr(v) + '</td></tr>';
    };
    var html = '<tbody>' +
      '<tr><th colspan="2">Selskapet</th></tr>' +
      rad('Overskudd før lønn', r.overskuddForLonn) +
      rad('Lønn', -r.lonn) +
      (r.otp ? rad('OTP-innskudd', -r.otp) : '') +
      rad('Arbeidsgiveravgift', -r.aga, 'skatt') +
      rad('Resultat før skatt', r.resultatForSkatt, 'sum') +
      rad('Selskapsskatt 22 %', -r.selskapsskatt, 'skatt') +
      rad('Resultat etter skatt', r.resultatEtterSkatt, 'sum') +
      rad('Utbytte', -r.utbytte) +
      rad('Igjen i selskapet', r.beholdt, 'sum') +
      '<tr><th colspan="2">Deg personlig</th></tr>' +
      rad('Lønn', r.lonn) +
      rad('Trygdeavgift 7,6 %', -r.trygdeavgift, 'skatt') +
      rad('Trinnskatt', -r.trinnskatt, 'skatt') +
      rad('Skatt på alminnelig inntekt (lønn)', -r.almLonn, 'skatt') +
      rad('Utbytte', r.utbytte) +
      rad('Skjermingsfradrag', Math.min(r.skjerming, r.utbytte)) +
      rad('Utbytteskatt (× 1,72 × 22 %)', -r.utbytteskatt, 'skatt') +
      rad('Netto til deg', r.netto, 'sum') +
      '<tr><th colspan="2">Andre skatter</th></tr>' +
      rad('Fremtidig utbytteskatt på det som blir igjen', r.latent) +
      rad('Formuesskatt (betales året etter)', r.formuesskatt) +
      '<tr class="total"><td>Total skatt' + (forutsetninger().medFormue ? ' inkl. formuesskatt' : '') + '</td><td class="tall">' + kr(r.totalSkatt) + '</td></tr>' +
      '</tbody>';
    $('oppstilling').innerHTML = html;
  }

  function visRettigheter(r) {
    var R = r.rettigheter;
    var L = r.lonn;
    var status = function (ok, delvis) {
      return ok ? '<span class="status ja">Full</span>' : delvis ? '<span class="status delvis">Delvis</span>' : '<span class="status nei">Ingen</span>';
    };
    var poster = [
      {
        navn: 'Alderspensjon (folketrygd)', st: status(L >= 7.1 * G, L > 0),
        verdi: kr(R.pensjonsopptjening) + ' / år',
        tekst: '18,1 % av lønn opp til 7,1 G (' + kr(7.1 * G) + ') legges til pensjonsbeholdningen.'
      },
      {
        navn: 'Sykepenger', st: status(L >= 6 * G, L >= 0.5 * G),
        verdi: kr(R.sykepengegrunnlag),
        tekst: 'Grunnlaget er lønn opp til 6 G (' + kr(6 * G) + '). Krever minst ½ G i inntekt.'
      },
      {
        navn: 'Foreldrepenger', st: status(L >= 6 * G, L >= 0.5 * G),
        verdi: kr(R.sykepengegrunnlag),
        tekst: 'Beregnes av samme grunnlag som sykepenger, opp til 6 G.'
      },
      {
        navn: 'Dagpenger', st: status(L >= 6 * G, R.dagpengerKrav),
        verdi: R.dagpengerKrav ? 'Oppfyller inntektskrav' : 'Under 1,5 G',
        tekst: 'Krever minst 1,5 G siste 12 måneder. Eiere med stor eierandel kan likevel få avslag.'
      },
      {
        navn: 'OTP-innskudd', st: status(R.otp > 0 && L >= 12 * G, R.otp > 0),
        verdi: kr(R.otp) + ' / år',
        tekst: 'Innskudd på lønn mellom 1 G og 12 G. Fradragsberettiget for selskapet, skattlegges ved utbetaling.'
      }
    ];
    $('rettigheter').innerHTML = poster.map(function (x) {
      return '<li><div class="navn"><span>' + x.navn + '</span>' + x.st + '</div><div class="verdi-tekst">' + x.verdi + '</div><p>' + x.tekst + '</p></li>';
    }).join('');
  }

  function visScenarier(p, anbefalt, valgt) {
    var liste = scenarioListe(p, anbefalt, valgt);
    var velger = $('baseScenario');
    var forrigeBase = velger.value || (lagret && lagret.base) || 'utbytte';
    velger.innerHTML = liste.map(function (s) { return '<option value="' + s.id + '">' + esc(s.navn) + '</option>'; }).join('');
    velger.value = liste.some(function (s) { return s.id === forrigeBase; }) ? forrigeBase : 'utbytte';
    var base = liste.filter(function (s) { return s.id === velger.value; })[0];

    var hode = '<thead><tr><th>Scenario</th><th class="tall">Lønn</th><th class="tall">Utbytte</th><th class="tall">Igjen i AS</th>' +
      '<th class="tall">Total skatt</th><th class="tall">Netto til deg</th><th class="tall">Skatt mot «' + esc(base.navn) + '»</th><th></th></tr></thead>';
    var rader = liste.map(function (s) {
      var d = s.r.totalSkatt - base.r.totalSkatt;
      var dKlasse = Math.round(d) === 0 ? '' : (d < 0 ? 'pluss' : 'minus');
      return '<tr' + (s === base ? ' class="er-base"' : '') + '>' +
        '<td>' + esc(s.navn) + (s.fast ? '' : '<span class="merke">Lagret</span>') + '</td>' +
        '<td class="tall">' + kr(s.r.lonn) + '</td>' +
        '<td class="tall">' + kr(s.r.utbytte) + '</td>' +
        '<td class="tall">' + kr(s.r.beholdt) + '</td>' +
        '<td class="tall">' + kr(s.r.totalSkatt) + '</td>' +
        '<td class="tall">' + kr(s.r.netto) + '</td>' +
        '<td class="tall ' + dKlasse + '">' + (s === base ? '–' : medFortegn(d)) + '</td>' +
        '<td>' + (s.fast ? '' : '<button type="button" class="slett" data-indeks="' + s.indeks + '">Slett</button>') + '</td>' +
        '</tr>';
    }).join('');
    $('scenarioTabell').innerHTML = hode + '<tbody>' + rader + '</tbody>';

    var f = farger();
    var ch = diagrammer.scenario;
    ch.data.labels = liste.map(function (s) { return s.navn; });
    var lag = [
      ['Arbeidsgiveravgift', 'aga', f.aga],
      ['Selskapsskatt', 'selskapsskatt', f.selskap],
      ['Skatt på lønn', 'personskattLonn', f.personskatt],
      ['Utbytteskatt', 'utbytteskatt', f.utbytteskatt],
      ['Fremtidig utbytteskatt', 'latent', f.latent]
    ];
    if (p.medFormue) lag.push(['Formuesskatt', 'formuesskatt', f.formue]);
    ch.data.datasets = lag.map(function (l) {
      return { label: l[0], backgroundColor: l[2], data: liste.map(function (s) { return Math.round(s.r[l[1]]); }), borderRadius: 2, barThickness: 22 };
    }).filter(function (d) { return d.data.some(function (v) { return v > 0; }); });
    $('scenarioDiagram').parentNode.style.height = Math.max(220, liste.length * 40 + 80) + 'px';
    ch.update('none');
  }

  /* ---------- Hendelser ---------- */

  function hentFordeling() {
    var p = forutsetninger();
    var lonn = valg.lonn == null ? S.optimer(p, valg.beholdt).lonn : valg.lonn;
    return { p: p, r: S.beregn(p, lonn, valg.beholdt) };
  }

  $('skjema').addEventListener('input', function () { oppdater(); });
  $('skjema').addEventListener('change', function () { oppdater(); });

  document.querySelectorAll('input.kr').forEach(function (el) {
    el.addEventListener('focus', function () { aktivtFelt = el.id; });
    el.addEventListener('blur', function () {
      aktivtFelt = null;
      el.value = tallFormat.format(Math.round(tolk(el.value)));
      if (el.closest('.glider')) oppdater();
    });
  });

  function settLonn(v) { valg.lonn = Math.max(0, v); oppdater(); }
  function settUtbytte(v) {
    var x = hentFordeling();
    valg.lonn = x.r.lonn;
    valg.beholdt = x.r.resultatEtterSkatt - Math.max(0, v);
    oppdater();
  }
  function settBeholdt(v) {
    var x = hentFordeling();
    valg.lonn = x.r.lonn;
    valg.beholdt = v;
    oppdater();
  }

  $('lonnRange').addEventListener('input', function (e) { settLonn(+e.target.value); });
  $('utbytteRange').addEventListener('input', function (e) { settUtbytte(+e.target.value); });
  $('beholdtRange').addEventListener('input', function (e) { settBeholdt(+e.target.value); });
  $('lonnInput').addEventListener('input', function (e) { settLonn(tolk(e.target.value)); });
  $('utbytteInput').addEventListener('input', function (e) { settUtbytte(tolk(e.target.value)); });
  $('beholdtInput').addEventListener('input', function (e) { settBeholdt(tolk(e.target.value)); });
  ['lonnInput', 'utbytteInput', 'beholdtInput'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });
  });

  $('brukAnbefaling').addEventListener('click', function () { valg.lonn = null; oppdater(); });

  $('lagreScenario').addEventListener('click', function () {
    var x = hentFordeling();
    var navn = $('scenarioNavn').value.trim() || ('Lønn ' + tallFormat.format(Math.round(x.r.lonn)));
    egne.push({ navn: navn, lonn: x.r.lonn, beholdt: x.r.beholdt });
    $('scenarioNavn').value = '';
    oppdater();
  });
  $('scenarioNavn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('lagreScenario').click(); } });

  $('scenarioTabell').addEventListener('click', function (e) {
    var knapp = e.target.closest('.slett');
    if (!knapp) return;
    egne.splice(+knapp.getAttribute('data-indeks'), 1);
    oppdater();
  });
  $('baseScenario').addEventListener('change', function () { oppdater(); });

  $('nullstill').addEventListener('click', function () {
    FELT.forEach(function (id) {
      var el = $(id);
      if (el.type === 'checkbox') el.checked = STANDARD[id]; else el.value = STANDARD[id];
    });
    valg = { lonn: null, beholdt: 0 };
    oppdater();
  });

  $('skjema').addEventListener('submit', function (e) { e.preventDefault(); });

  // Bygg diagrammene på nytt når temaet endres, så fargene følger med.
  function nyttTema() { lagDiagrammer(); oppdater(); }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', nyttTema);
  }
  new MutationObserver(nyttTema).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  lagDiagrammer();
  oppdater();
})();
