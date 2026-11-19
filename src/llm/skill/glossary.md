# Slovník zkratek a značení směn

Platí jen tehdy, když legenda v podkladu neříká nic jiného. Legenda má vždy přednost.

## Běžné značky a časy

| Značka                               | Význam                                       | Čas                               |
| ------------------------------------ | -------------------------------------------- | --------------------------------- |
| R, Ran, ranní                        | ranní směna                                  | 06:00–14:00                       |
| O, Odp, odpolední                    | odpolední směna                              | 14:00–22:00                       |
| N, Noc, noční                        | noční směna přes půlnoc                      | 22:00–06:00                       |
| D, Den, denní                        | denní dvanáctihodinová směna                 | 06:00–18:00                       |
| N (ve dvanáctihodinovém systému D/N) | noční dvanáctihodinová směna                 | 18:00–06:00                       |
| 12h                                  | dvanáctihodinová směna, začátek nutno vyčíst | podle kontextu, jinak `uncertain` |

Dvanáctihodinový systém poznáš podle toho, že se střídají jen značky D a N. Když se v jednom rozpisu vyskytují R, O a N, je to třísměnný provoz a N je 22:00–06:00.

## Volno a nepřítomnost (nejsou směny)

V, volno, vol, -, –, prázdná buňka, DOV / dovolená, NEM / nemoc, OČR, SV / svátek, NV / náhradní volno.

## Zápis časů

„6–14“, „6-14“, „6:00-14:00“, „06.00–14.00“, „6h–14h“ jsou vždy 06:00–14:00. Čas bez minut je celá hodina. Konec menší než začátek (například „22–6“) je noční směna a končí další den.

## Další pravidla

- Zápis jako „R/O“ nebo „R+O“ v jednom dni jsou dvě směny. Pozor, v některých rozpisech znamená „R/O“ střídání podle týdne. Když to z podkladu nepoznáš, označ `uncertain`.
- Barvy buněk často nahrazují značky (například modrá = noční). Význam barev bere vždy z legendy, nikdy nehádej podle odstínu.
- Hodnoty jako „X“, „✓“ nebo vybarvená buňka bez textu a bez legendy neznamenají pole směny jednoznačně. Označ je `uncertain` a popiš ve `warnings`.
- Tabulka s řádky pro více lidí je týmový rozpis. Nepoznáš z něj, čí směny hledáš, proto ho nečti, viz pravidlo o více lidech v instrukcích.
