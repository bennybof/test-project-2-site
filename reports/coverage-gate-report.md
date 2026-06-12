# Test Project 2 - Coverage Gate Report

Generated: 2026-06-12T01:01:53.161Z

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
| Unique audio scheduled in scheduling sims | 247 |
| Unique MIDI selected in build plans | 39 |
| Unique MIDI scheduled in scheduling sims | 31 |
| Audio with no observed inclusion path | 432 |
| Audio selected but not scheduled in scheduling sims, excluding dependent-only | 52 |
| Dependent-only audio selected but not scheduled in scheduling sims | 2 |
| Audio selected but not scheduled total in scheduling sims | 54 |
| MIDI selected but not scheduled in scheduling sims | 3 |
| MIDI never selected | 13 |
| General samples selected | 240 |
| General samples scheduled | 157 |
| General samples with no observed inclusion | 65 |
| Lyrix audio selected | 228 |
| Lyrix audio scheduled | 90 |
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
| samples/synth_downsampled_odd_xtra (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #2 (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #3 (consolidated).wav | 16 |
| samples/synth_downsampled_odd_xtra #4 (consolidated).wav | 16 |
| samples/accbreath_4_odd.wav | 10 |
| samples/vlins_1_even_x2 (consolidated).wav | 9 |
| samples/accbreath_3_~_even.wav | 8 |
| samples/synth_bass_1_hook #2 (consolidated).wav | 8 |
| samples/synth_bass_1_hook #3 (consolidated).wav | 8 |
| samples/synth_bass_1_hook_odd_x4 (consolidated).wav | 8 |
| samples/synth_bass_2_hook_x4_even (consolidated).wav | 8 |
| lyrix/crashout_lyrix_even_dry (consolidated).wav | 6 |
| samples/synth_elephant_odd_~_xtra.wav | 6 |
| samples/high_bassish_hook_odd_x2 (consolidated) #2.wav | 4 |
| samples/high_bassish_hook_odd_x2 (consolidated).wav | 4 |
| samples/hippy_synth_odd (consolidated).wav | 4 |
| samples/trumpet_hook_odd_x4 (consolidated) #2.wav | 4 |
| samples/trumpet_hook_odd_x4 (consolidated).wav | 4 |
| lyrix/grounded_lyrix_xtra_v2 (consolidated) #3.wav | 3 |
| samples/trumpet_even_x4.wav | 3 |
| samples/typewriter_even_xtra.wav | 3 |
| lyrix/fast_hook_blessnow_lyrix_odd_wet (consolidated).wav | 2 |
| samples/bassish_glitchy_hook_odd_x4 (consolidated).wav | 2 |
| samples/bassish_glitchy_hook_odd_x4 #2 (consolidated).wav | 2 |
| samples/high_bassish_2_hook #2 (consolidated).wav | 2 |

## Top dependent-only audio selected but not scheduled

| File | Selected count |
|---|---:|
| samples/rev_crash_metal_even_dlay_xtra.wav | 33 |
| samples/glock_ext_even (consolidated).wav | 13 |

## Top selected MIDI not scheduled

| MIDI file | Selected count |
|---|---:|
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
