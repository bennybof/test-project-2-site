# Test Project 2 - Coverage Gate Report

Generated: 2026-06-12T11:37:03.485Z

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
| Catalog allKeys | 953 |
| Lyrix rule file refs | 576 |
| Lyrix sections | 57 |
| MIDI patterns | 52 |

## Reachability summary

| Check | Count |
|---|---:|
| Unique audio selected in build plans | 481 |
| Unique audio scheduled in scheduling sims | 240 |
| Unique MIDI selected in build plans | 39 |
| Unique MIDI scheduled in scheduling sims | 33 |
| Audio with no observed inclusion path | 420 |
| Audio selected but not scheduled in scheduling sims, excluding dependent-only | 38 |
| Dependent-only audio selected but not scheduled in scheduling sims | 0 |
| Audio selected but not scheduled total in scheduling sims | 38 |
| MIDI selected but not scheduled in scheduling sims | 1 |
| MIDI never selected | 13 |
| General samples selected | 246 |
| General samples scheduled | 160 |
| General samples with no observed inclusion | 59 |
| Lyrix audio selected | 235 |
| Lyrix audio scheduled | 80 |
| Lyrix sections seen | 22 / 57 |

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
| scooby | 25 |
| intrusive | 21 |
| angry | 20 |
| holdit | 18 |
| nosound | 18 |
| bollocks | 16 |
| fall | 14 |
| shade | 14 |
| hook_nextmove | 13 |
| kachow | 12 |
| space | 12 |
| ah | 11 |
| swoosh | 8 |
| drop | 7 |
| phones | 7 |
| accbreath | 6 |
| tits | 5 |
| rhodes | 4 |
| beeps | 3 |
| oh | 3 |
| pno | 3 |
| typewriter | 3 |

## Top selected audio not scheduled, excluding dependent-only

| File | Selected count |
|---|---:|
| samples/synth_downsampled_odd_xtra (consolidated).wav | 20 |
| samples/synth_downsampled_odd_xtra #2 (consolidated).wav | 20 |
| samples/synth_downsampled_odd_xtra #3 (consolidated).wav | 20 |
| samples/synth_downsampled_odd_xtra #4 (consolidated).wav | 20 |
| samples/gtar_5 (consolidated) #2.wav | 14 |
| samples/gtar_5 (consolidated) #3.wav | 14 |
| samples/gtar_5 (consolidated) #4.wav | 14 |
| samples/gtar_5_odd (consolidated).wav | 14 |
| samples/gtar_8 (consolidated) #2.wav | 14 |
| samples/gtar_8_odd (consolidated).wav | 14 |
| samples/synth_bass_1_hook #2 (consolidated).wav | 8 |
| samples/synth_bass_1_hook #3 (consolidated).wav | 8 |
| samples/synth_bass_1_hook_odd_x4 (consolidated).wav | 8 |
| samples/synth_bass_2_hook_x4_even (consolidated).wav | 8 |
| lyrix/grounded_lyrix_xtra_odd_dry (consolidated) #3.wav | 3 |
| lyrix/slow_hook_worstcase_lyrix_dry (consolidated) #2.wav | 2 |
| samples/crash_washes_metal_even (consolidated).wav | 2 |
| lyrix/fast_hook_bababuda_lyrix_odd_wet (consolidated).wav | 1 |
| lyrix/fast_hook_blessnow_lyrix_odd_wet (consolidated).wav | 1 |
| lyrix/fast_hook_timeout_lyrix_leadin_odd_dry.wav | 1 |
| lyrix/gromit_1_lyrix_leadin_dry.wav | 1 |
| lyrix/gromit_1_lyrix_leadin_wet.wav | 1 |
| lyrix/hook_nextmove_obligadaboo_lyrix_v3.wav | 1 |
| lyrix/slow_hook_chillout_lyrix_odd_dry (consolidated) #2.wav | 1 |
| lyrix/slow_hook_chillout_lyrix_odd_dry (consolidated) #3.wav | 1 |

## Top dependent-only audio selected but not scheduled

| File | Selected count |
|---|---:|


## Top selected MIDI not scheduled

| MIDI file | Selected count |
|---|---:|
| midi files/jazz_ride_wiv-jazz_hats_wiv-jazz_crash_metal_odd_ridehard.mid | 4 |

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
