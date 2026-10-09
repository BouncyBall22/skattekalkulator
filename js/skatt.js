/*
 * Skattemotor for AS med eier som eneste ansatt – inntektsåret 2026.
 * Ren beregningslogikk uten DOM, slik at den kan testes med Node.
 */
(function (root) {
  'use strict';

  var SATSER = {
    aar: 2026,
    G: 136549, // grunnbeløpet fra 1. mai 2026
    selskapsskatt: 0.22,
    alminnelig: 0.22,
    oppjustering: 1.72, // utbytte × 1,72 × 22 % = 37,84 %
    trygdeavgift: 0.076,
    trygdeNedre: 99650,
    trygdeOpptrapping: 0.25,
    trinn: [
      [226100, 0.017],
      [318300, 0.04],
      [725050, 0.137],
      [980100, 0.167],
      [1467200, 0.177]
    ],
    personfradrag: 114540,
    minstefradragSats: 0.46,
    minstefradragMaks: 95700,
    formue: {
      bunnfradrag: 1900000,
      sats1: 0.01, // kommune 0,35 % + stat 0,65 %
      trinn2: 21500000,
      sats2: 0.011,
      aksjeverdi: 0.8 // aksjer verdsettes til 80 %
    },
    pensjonsopptjening: 0.181, // av inntekt opp til 7,1 G
    opptjeningTakG: 7.1,
    otpTakG: 12,
    trygdTakG: 6 // sykepenger/foreldrepenger/dagpenger
  };

  var AGA_SONER = [
    { id: 'I', navn: 'Sone I', sats: 0.141 },
    { id: 'II', navn: 'Sone II', sats: 0.106 },
    { id: 'III', navn: 'Sone III', sats: 0.064 },
    { id: 'IV', navn: 'Sone IV', sats: 0.051 },
    { id: 'IVa', navn: 'Sone IVa', sats: 0.079 },
    { id: 'V', navn: 'Sone V', sats: 0 }
  ];

  function trinnskatt(personinntekt) {
    var skatt = 0;
    var t = SATSER.trinn;
    for (var i = 0; i < t.length; i++) {
      var fra = t[i][0];
      var til = i + 1 < t.length ? t[i + 1][0] : Infinity;
      if (personinntekt > fra) skatt += (Math.min(personinntekt, til) - fra) * t[i][1];
    }
    return skatt;
  }

  function trinnsats(personinntekt) {
    var sats = 0;
    SATSER.trinn.forEach(function (t) { if (personinntekt > t[0]) sats = t[1]; });
    return sats;
  }

  function trygdeavgift(personinntekt) {
    if (personinntekt <= SATSER.trygdeNedre) return 0;
    return Math.min(
      personinntekt * SATSER.trygdeavgift,
      (personinntekt - SATSER.trygdeNedre) * SATSER.trygdeOpptrapping
    );
  }

  function minstefradrag(lonn) {
    return Math.min(lonn * SATSER.minstefradragSats, SATSER.minstefradragMaks);
  }

  function formuesskatt(grunnlag) {
    var f = SATSER.formue;
    if (grunnlag <= f.bunnfradrag) return 0;
    var skatt = (grunnlag - f.bunnfradrag) * f.sats1;
    if (grunnlag > f.trinn2) skatt += (grunnlag - f.trinn2) * (f.sats2 - f.sats1);
    return skatt;
  }

  function otpInnskudd(lonn, sats) {
    var G = SATSER.G;
    return Math.max(0, Math.min(lonn, SATSER.otpTakG * G) - G) * sats;
  }

  function lonnskostnad(lonn, p) {
    var otp = otpInnskudd(lonn, p.otpSats);
    return lonn + otp + (lonn + otp) * p.agaSats;
  }

  /* Finner lønnen som gir en gitt total lønnskostnad (inkl. AGA og OTP). */
  function lonnForKostnad(kostnad, p) {
    if (kostnad <= 0) return 0;
    var lo = 0, hi = kostnad;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (lonnskostnad(mid, p) > kostnad) hi = mid; else lo = mid;
    }
    return lo;
  }

  /*
   * p: forutsetninger (omsetning, kostnader, agaSats, otpSats, fradrag,
   *    inngangsverdi, skjermingsrente, privatFormue, asFormue, friEK,
   *    medLatent, medFormue, otpVekt)
   * lonn, beholdt: valg. beholdt = endring i egenkapital i året
   *    (negativ betyr at utbytte også tas fra tidligere opptjent fri egenkapital).
   */
  function beregn(p, lonn, beholdt) {
    var S = SATSER;
    lonn = Math.max(0, lonn);
    var overskuddForLonn = p.omsetning - p.kostnader;

    var otp = otpInnskudd(lonn, p.otpSats);
    var aga = (lonn + otp) * p.agaSats;
    var lonnskost = lonn + otp + aga;

    var resultatForSkatt = overskuddForLonn - lonnskost;
    var selskapsskatt = Math.max(0, resultatForSkatt) * S.selskapsskatt;
    var resultatEtterSkatt = resultatForSkatt - selskapsskatt;

    var minBeholdt = -Math.max(0, p.friEK);
    beholdt = Math.max(minBeholdt, Math.min(beholdt, resultatEtterSkatt));
    var utbytte = Math.max(0, resultatEtterSkatt - beholdt);
    // Er resultatet negativt og ingen fri egenkapital, blir beholdt negativt (tap i selskapet).
    beholdt = resultatEtterSkatt - utbytte;

    var skjerming = Math.max(0, p.inngangsverdi) * p.skjermingsrente;
    var skattepliktigUtbytte = Math.max(0, utbytte - skjerming);

    var trygd = trygdeavgift(lonn);
    var trinn = trinnskatt(lonn);
    var minste = minstefradrag(lonn);

    function almSkatt(medUtbytte) {
      var ai = lonn - minste - p.fradrag + (medUtbytte ? skattepliktigUtbytte * S.oppjustering : 0);
      return Math.max(0, ai - S.personfradrag) * S.alminnelig;
    }
    var almTotal = almSkatt(true);
    var almLonn = almSkatt(false);
    var utbytteskatt = almTotal - almLonn;

    var latent = p.medLatent ? Math.max(0, beholdt) * S.oppjustering * S.alminnelig : 0;

    var asVerdi = Math.max(0, p.asFormue + beholdt);
    var formuesgrunnlag = Math.max(0, p.privatFormue) + asVerdi * S.formue.aksjeverdi;
    var formue = formuesskatt(formuesgrunnlag);

    var personskattLonn = trygd + trinn + almLonn;
    var nettoLonn = lonn - personskattLonn;
    var nettoUtbytte = utbytte - utbytteskatt;
    var netto = nettoLonn + nettoUtbytte;

    var totalSkatt = aga + selskapsskatt + trygd + trinn + almTotal + latent + (p.medFormue ? formue : 0);
    var mal = netto + otp * p.otpVekt; // det som optimaliseres

    var G = S.G;
    return {
      lonn: lonn,
      utbytte: utbytte,
      beholdt: beholdt,
      otp: otp,
      aga: aga,
      lonnskost: lonnskost,
      overskuddForLonn: overskuddForLonn,
      resultatForSkatt: resultatForSkatt,
      selskapsskatt: selskapsskatt,
      resultatEtterSkatt: resultatEtterSkatt,
      maksUtbytte: Math.max(0, resultatEtterSkatt - minBeholdt),
      skjerming: skjerming,
      skattepliktigUtbytte: skattepliktigUtbytte,
      trygdeavgift: trygd,
      trinnskatt: trinn,
      minstefradrag: minste,
      almLonn: almLonn,
      utbytteskatt: utbytteskatt,
      personskattLonn: personskattLonn,
      latent: latent,
      formuesgrunnlag: formuesgrunnlag,
      formuesskatt: formue,
      nettoLonn: nettoLonn,
      nettoUtbytte: nettoUtbytte,
      netto: netto,
      totalSkatt: totalSkatt,
      mal: mal,
      rettigheter: {
        pensjonsopptjening: Math.min(lonn, S.opptjeningTakG * G) * S.pensjonsopptjening,
        sykepengegrunnlag: lonn >= 0.5 * G ? Math.min(lonn, S.trygdTakG * G) : 0,
        dagpengerKrav: lonn >= 1.5 * G,
        aapMinste: lonn >= 2 * G,
        otp: otp
      }
    };
  }

  /* Høyeste lønn som er mulig når et gitt beløp skal bli igjen i selskapet. */
  function maksLonn(p, beholdt) {
    var behovForSkatt = Math.max(0, beholdt) / (1 - SATSER.selskapsskatt) + Math.min(0, beholdt);
    var kost = p.omsetning - p.kostnader - behovForSkatt;
    return lonnForKostnad(kost, p);
  }

  /* Lønnen som gir mest igjen til eieren, gitt hvor mye som skal bli igjen i selskapet. */
  function optimer(p, beholdt) {
    var hi = maksLonn(p, beholdt);
    if (hi <= 0) return beregn(p, 0, beholdt);
    var steg = Math.max(500, hi / 1500);
    var best = beregn(p, 0, beholdt), bestL = 0;
    function prov(L) {
      var r = beregn(p, L, beholdt);
      if (r.mal > best.mal + 0.01) { best = r; bestL = L; }
    }
    for (var L = 0; L <= hi; L += steg) prov(L);
    prov(hi);
    // Kandidater ved knekkpunkter (trinn, grenser) gir eksakte svar for stykkevis lineære funksjoner.
    var knekk = [SATSER.trygdeNedre, SATSER.G, SATSER.minstefradragMaks / SATSER.minstefradragSats];
    SATSER.trinn.forEach(function (t) { knekk.push(t[0]); });
    knekk.forEach(function (k) { if (k <= hi) prov(k); });
    var lo = Math.max(0, bestL - steg), top = Math.min(hi, bestL + steg);
    for (L = lo; L <= top; L += 50) prov(L);
    // Rund ned til nærmeste hundrelapp så tallet er praktisk.
    var rundet = beregn(p, Math.floor(bestL / 100) * 100, beholdt);
    return rundet.mal >= best.mal - 50 ? rundet : best;
  }

  /*
   * Marginal total skatt (inkl. AGA og selskapsskatt) for å ta ut én krone ekstra
   * av selskapets overskudd som lønn vs. som utbytte, ved et gitt lønnsnivå.
   */
  function marginal(p, lonn, utbytte) {
    var d = 10;
    function nettoPerson(L, U) {
      var q = Object.assign({}, p, { omsetning: 1e12, kostnader: 0, friEK: 0 });
      // Bruk et fiktivt stort selskap og regn kun personskatt og pensjon.
      var r = beregn(q, L, 0);
      var skjerming = Math.max(0, p.inngangsverdi) * p.skjermingsrente;
      var skattUtb = Math.max(0, U - skjerming);
      var ai = L - r.minstefradrag - p.fradrag + skattUtb * SATSER.oppjustering;
      var alm = Math.max(0, ai - SATSER.personfradrag) * SATSER.alminnelig;
      return L + U - r.trygdeavgift - r.trinnskatt - alm + r.otp * p.otpVekt;
    }
    var base = nettoPerson(lonn, utbytte);
    var kostL = lonnskostnad(lonn + d, p) - lonnskostnad(lonn, p);
    var mL = 1 - (nettoPerson(lonn + d, utbytte) - base) / kostL;
    var dU = d * (1 - SATSER.selskapsskatt);
    var mU = 1 - (nettoPerson(lonn, utbytte + dU) - base) / d;
    return { lonn: mL, utbytte: mU };
  }

  var api = {
    SATSER: SATSER,
    AGA_SONER: AGA_SONER,
    trinnskatt: trinnskatt,
    trinnsats: trinnsats,
    trygdeavgift: trygdeavgift,
    minstefradrag: minstefradrag,
    formuesskatt: formuesskatt,
    otpInnskudd: otpInnskudd,
    lonnskostnad: lonnskostnad,
    lonnForKostnad: lonnForKostnad,
    beregn: beregn,
    maksLonn: maksLonn,
    optimer: optimer,
    marginal: marginal
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Skatt = api;
})(this);
