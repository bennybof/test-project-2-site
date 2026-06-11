# Test Project 2 - Coverage Gate Report

Generated: 2026-06-11T20:46:33.550Z

Report-only helper. No planner, renderer, catalog, registry, or rules files were edited by this script.

## Simulation settings

| Check | Value |
|---|---:|
| Build-plan simulations | 400 |
| Scheduling simulations | 40 |
| Scheduling errors | 0 |
| midi-patterns.json missing | no |



## Source coverage

| Source | Count |
|---|---:|
| R2 manifest files | 953 |
| Folder-tree files | not checked |
| Stem registry entries | 953 |
| Registry audio entries | 901 |
| Registry MIDI entries | 52 |
| Catalog allKeys | 952 |
| Lyrix rule file refs | 576 |
| Lyrix sections | 57 |
| MIDI patterns | 52 |

## Reachability summary

| Check | Count |
|---|---:|
| Unique audio selected in build plans | 468 |
| Unique audio scheduled in scheduling sims | 192 |
| Unique MIDI selected in build plans | 39 |
| Unique MIDI scheduled in scheduling sims | 28 |
| Audio with no observed inclusion path | 432 |
| Audio selected but not scheduled in scheduling sims, excluding dependent-only | 102 |
| Dependent-only audio selected but not scheduled in scheduling sims | 7 |
| Audio selected but not scheduled total in scheduling sims | 109 |
| MIDI selected but not scheduled in scheduling sims | 6 |
| MIDI never selected | 13 |
| General samples selected | 240 |
| General samples scheduled | 143 |
| General samples with no observed inclusion | 65 |
| Lyrix audio selected | 228 |
| Lyrix audio scheduled | 49 |
| Lyrix sections seen | 21 / 57 |

## Timeline / duration variation

| Metric | Seconds | Clock |
|---|---:|---:|
| min | 180.00 | 3:00.0 |
| p05 | 184.29 | 3:04.3 |
| p25 | 188.57 | 3:08.6 |
| median | 205.71 | 3:25.7 |
| p75 | 205.71 | 3:25.7 |
| p95 | 222.86 | 3:42.9 |
| max | 224.57 | 3:44.6 |
| mean | 199.50 | 3:19.5 |

Section count median: 6

## Top unselected families

| Family | Unselected files |
|---|---:|
| weed | 57 |
| buf | 36 |
| clockout | 30 |
| gtar | 26 |
| scooby | 25 |
| angry | 20 |
| intrusive | 19 |
| holdit | 18 |
| nosound | 18 |
| bollocks | 16 |
| fall | 14 |
| shade | 14 |
| hook_nextmove | 13 |
| kachow | 12 |
| space | 12 |
| ah | 11 |
| drop | 9 |
| slow | 9 |
| swoosh | 8 |
| phones | 7 |
| tits | 5 |
| pno | 3 |
| rhodes | 3 |
| sax | 3 |
| breathe_rev_vox | 2 |

## Top selected audio not scheduled, excluding dependent-only

| File | Selected count |
|---|---:|
| samples/hippy_synth_wiv-bass_odd (consolidated).wav | 18 |
| samples/synth_downsampled_odd_xtra (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #2 (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #3 (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #4 (consolidated).wav | 16 |
| lyrix/outburst_lyrix_intro wet #2.wav | 13 |
| lyrix/outburst_lyrix_intro_dry #2.wav | 13 |
| lyrix/outburst_lyrix_intro_odd_dry.wav | 13 |
| lyrix/outburst_lyrix_intro_odd_wet.wav | 13 |
| lyrix/outburst_lyrix_main_dry.wav | 13 |
| lyrix/outburst_lyrix_main_wet.wav | 13 |
| samples/accbreath_1_~_even.wav | 13 |
| samples/glock_odd (consolidated).wav | 13 |
| samples/vlins_long_suspense_odd_x2 (consolidated).wav | 12 |
| samples/accbreath_long_x4.wav | 9 |
| samples/grm_ah_lyrix.wav | 9 |
| samples/grm_dk_lyrix_handmedowns_x7.wav | 9 |
| samples/grm_dk_tsandcs_lyrix_x4 (consolidated).wav | 9 |
| samples/grm_dunah_rhymeschemes_lyrix_x6_~ (consolidated).wav | 9 |
| samples/accbreath_3_~_even.wav | 8 |
| samples/synth_bass_1_hook #2 (consolidated).wav | 8 |
| samples/synth_bass_1_hook #3 (consolidated).wav | 8 |
| samples/synth_bass_1_hook_odd_x4 (consolidated).wav | 8 |
| samples/synth_bass_2_hook_x4_even (consolidated).wav | 8 |
| samples/clarinet_even_x2 (consolidated).wav | 7 |

## Top dependent-only audio selected but not scheduled

| File | Selected count |
|---|---:|
| samples/big_crash_layer_odd_dlay_metal (consolidated).wav | 38 |
| samples/crash_dlay_odd (consolidated).wav | 38 |
| samples/jazz_crash_metal_dlay_odd_xtra (consolidated).wav | 34 |
| samples/rev_crash_metal_even_dlay_xtra.wav | 33 |
| samples/bagoo_ext_even (consolidated).wav | 17 |
| samples/glock_ext_even (consolidated).wav | 13 |
| samples/crash_washes_metal_dlay_even (consolidated).wav | 12 |

## Top selected MIDI not scheduled

| MIDI file | Selected count |
|---|---:|
| midi files/beepipes_ghosts_drums_beepipe.mid | 11 |
| midi files/snare_xtra_drums_even_snare.mid | 11 |
| midi files/rims_xtra_2_drums_rim.mid | 5 |
| midi files/beepipes_2_drums_odd_beepipe.mid | 1 |
| midi files/jazz_hats_metal_hook_even_~_ride04.mid | 1 |
| midi files/jazz_hats_metal_hook_even_~_ridehard.mid | 1 |

## Lyrix sections never seen

- `angry`
- `bollocks`
- `buf`
- `buf_cardtalk`
- `clockout`
- `clockout_part2`
- `crashout`
- `fall`
- `fast_hook_bababuda`
- `fast_hook_blessnow`
- `fast_hook_hums`
- `fast_hook_timeout`
- `holdit`
- `hook_nextmove`
- `intrusive`
- `kachow`
- `nosound`
- `outburst_lyrix`
- `phones`
- `scooby`
- `shade`
- `slow_hook_bababuda`
- `slow_hook_blessnow`
- `slow_hook_chillout`
- `slow_hook_findout`
- `slow_hook_hindsight`
- `slow_hook_lessismore`
- `slow_hook_talk`
- `slow_hook_timeout`
- `slow_hook_worstcase`
- `space`
- `swoosh`
- `swoosh_part2`
- `tits`
- `weed_1`
- `weed_2`
