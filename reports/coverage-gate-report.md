# Test Project 2 - Coverage Gate Report

Generated: 2026-06-11T18:28:56.479Z

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
| Unique audio selected in build plans | 450 |
| Unique audio scheduled in scheduling sims | 167 |
| Unique MIDI selected in build plans | 39 |
| Unique MIDI scheduled in scheduling sims | 25 |
| Audio with no observed inclusion path | 450 |
| Audio selected but not scheduled in scheduling sims, excluding dependent-only | 94 |
| Dependent-only audio selected but not scheduled in scheduling sims | 5 |
| Audio selected but not scheduled total in scheduling sims | 99 |
| MIDI selected but not scheduled in scheduling sims | 4 |
| MIDI never selected | 13 |
| General samples selected | 242 |
| General samples scheduled | 160 |
| General samples with no observed inclusion | 63 |
| Lyrix audio selected | 208 |
| Lyrix audio scheduled | 7 |
| Lyrix sections seen | 17 / 57 |

## Timeline / duration variation

| Metric | Seconds | Clock |
|---|---:|---:|
| min | 180.00 | 3:00.0 |
| p05 | 188.57 | 3:08.6 |
| p25 | 188.57 | 3:08.6 |
| median | 205.71 | 3:25.7 |
| p75 | 205.71 | 3:25.7 |
| p95 | 222.86 | 3:42.9 |
| max | 224.57 | 3:44.6 |
| mean | 201.81 | 3:21.8 |

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
| hook_nextmove | 15 |
| fall | 14 |
| shade | 14 |
| kachow | 12 |
| space | 12 |
| ah | 11 |
| slow | 10 |
| drop | 9 |
| swoosh | 8 |
| phones | 7 |
| greentea | 6 |
| jigsaw | 6 |
| tits | 5 |
| pno | 3 |
| rhodes | 3 |

## Top selected audio not scheduled, excluding dependent-only

| File | Selected count |
|---|---:|
| samples/synth_downsampled_odd_xtra (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #2 (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #3 (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #4 (consolidated).wav | 16 |
| samples/vlins_long_suspense_odd_x2 (consolidated).wav | 13 |
| lyrix/outburst_lyrix_intro wet #2.wav | 12 |
| lyrix/outburst_lyrix_intro_dry #2.wav | 12 |
| lyrix/outburst_lyrix_intro_odd_dry.wav | 12 |
| lyrix/outburst_lyrix_intro_odd_wet.wav | 12 |
| lyrix/outburst_lyrix_main_dry.wav | 12 |
| lyrix/outburst_lyrix_main_wet.wav | 12 |
| samples/grm_ah_lyrix.wav | 11 |
| samples/grm_dk_lyrix_handmedowns_x7.wav | 11 |
| samples/grm_dk_tsandcs_lyrix_x4 (consolidated).wav | 11 |
| samples/grm_dunah_rhymeschemes_lyrix_x6_~ (consolidated).wav | 11 |
| samples/vlins_1_even_x2 (consolidated).wav | 11 |
| samples/synth_bass_1_hook #2 (consolidated).wav | 8 |
| samples/synth_bass_1_hook #3 (consolidated).wav | 8 |
| samples/synth_bass_1_hook_odd_x4 (consolidated).wav | 8 |
| samples/synth_bass_2_hook_x4_even (consolidated).wav | 8 |
| samples/synth_elephant_odd_~_xtra.wav | 8 |
| lyrix/crashout_lyrix_even_dry (consolidated) #2.wav | 7 |
| lyrix/crashout_lyrix_even_dry (consolidated) #3.wav | 7 |
| lyrix/crashout_lyrix_even_dry (consolidated) #4.wav | 7 |
| lyrix/crashout_lyrix_even_dry (consolidated).wav | 7 |

## Top dependent-only audio selected but not scheduled

| File | Selected count |
|---|---:|
| samples/big_crash_layer_odd_dlay_metal (consolidated).wav | 38 |
| samples/crash_dlay_odd (consolidated).wav | 37 |
| samples/rev_crash_metal_even_dlay_xtra.wav | 35 |
| samples/jazz_crash_metal_dlay_odd_xtra (consolidated).wav | 31 |
| samples/crash_washes_metal_dlay_even (consolidated).wav | 10 |

## Top selected MIDI not scheduled

| MIDI file | Selected count |
|---|---:|
| midi files/snare_xtra_drums_even_snare.mid | 12 |
| midi files/rims_xtra_2_drums_rim.mid | 5 |
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
- `greentea`
- `holdit`
- `hook_nextmove`
- `ininout_bridge`
- `intrusive`
- `jigsaw`
- `kachow`
- `nochoice`
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
