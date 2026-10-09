# Lønn eller utbytte?

En enkel nettside som regner ut optimal fordeling mellom lønn og utbytte for en eier av et AS med seg selv som eneste ansatt, basert på skattereglene for inntektsåret 2026.

## Funksjoner

- **Anbefalt lønn**: finner lønnen som gir mest igjen til eieren etter arbeidsgiveravgift, OTP, selskapsskatt, utbytteskatt, trygdeavgift, trinnskatt og skatt på alminnelig inntekt.
- **Skjæringspunkt-diagram**: viser samlet marginalskatt for neste krone tatt ut som lønn eller som utbytte, og markerer lønnsnivået der utbytte blir billigere.
- **Total skatt ved ulike lønnsnivåer**: stablet diagram over skattene og netto til eier.
- **Egen fordeling**: juster lønn, utbytte og beløp som blir igjen i selskapet med glidebrytere.
- **Scenarier**: faste scenarier (anbefalt, kun utbytte, lønn 6 G, alt som lønn) og egne lagrede scenarier, med differanse i kroner mot et valgt sammenligningsgrunnlag.
- **Pensjon og trygd**: opptjening i folketrygden, OTP, sykepenger, foreldrepenger og dagpenger.
- **Kostnader og fradrag**: driftskostnader, arbeidsgiveravgiftssone, andre fradrag, skjermingsfradrag.
- **Formue**: formuesskatt med 80 % verdsettelse av aksjer, og valgfri fremtidig utbytteskatt på penger som blir igjen i selskapet.

## Bruk

Åpne `index.html` i en nettleser, eller server mappen statisk (f.eks. GitHub Pages):

```sh
python3 -m http.server 8000
```

## Tester

Beregningsmotoren ligger i `js/skatt.js` og kan testes uten nettleser:

```sh
node test/skatt.test.js
```

## Satser (2026)

| Sats | Verdi |
| --- | --- |
| Selskapsskatt / alminnelig inntekt | 22 % |
| Oppjusteringsfaktor utbytte | 1,72 (effektivt 37,84 %) |
| Trygdeavgift lønn | 7,6 % (nedre grense 99 650 kr) |
| Trinnskatt | 1,7 % / 4,0 % / 13,7 % / 16,7 % / 17,7 % fra 226 100 / 318 300 / 725 050 / 980 100 / 1 467 200 kr |
| Personfradrag | 114 540 kr |
| Minstefradrag | 46 %, maks 95 700 kr |
| Grunnbeløpet (G) | 136 549 kr |
| Formuesskatt | 1,0 % over 1,9 mill., 1,1 % over 21,5 mill. Aksjer verdsettes til 80 % |
| Arbeidsgiveravgift | Sone I 14,1 %, II 10,6 %, III 6,4 %, IV 5,1 %, IVa 7,9 %, V 0 % |

Kalkulatoren gir et anslag og erstatter ikke rådgivning fra regnskapsfører.

## Lisens

[MIT](LICENSE). Du kan fritt bruke, endre og videreformidle koden, også kommersielt.
