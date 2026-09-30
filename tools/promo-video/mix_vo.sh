#!/usr/bin/env bash
# Mezcla voces ElevenLabs (vo_01..vo_07.mp3) sobre el video con ducking de la música.
# Uso: ./mix_vo.sh [musica] [video_mudo] [salida]
set -euo pipefail
cd "$(dirname "$0")"
FF=${FFMPEG:-ffmpeg}
VIDEO=${2:-out/eva_silent.mp4}
MUSIC=${1:-out/music_sfx.wav}
OUT=${3:-out/eva_rutina_30s_vo.mp4}
# inicio (ms) de cada línea, alineado con las escenas de anim.js
OFF=(300 4200 8700 12700 18700 23200 27850)
inputs=(-i "$VIDEO" -i "$MUSIC"); fc=""; labels=""
for i in "${!OFF[@]}"; do
  n=$(printf "%02d" $((i+1))); f=$(ls vo_$n.* | head -1)
  inputs+=(-i "$f"); k=$((i+2))
  fc+="[$k:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${OFF[$i]}|${OFF[$i]}[v$i];"
  labels+="[v$i]"
done
fc+="${labels}amix=inputs=${#OFF[@]}:normalize=0,volume=1.6,highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120[vo];"
fc+="[vo]asplit=2[vo1][vo2];"
fc+="[1:a]volume=0.8[mus];[mus][vo1]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[duck];"
fc+="[duck][vo2]amix=inputs=2:normalize=0,alimiter=limit=0.89,loudnorm=I=-14:TP=-1:LRA=9[a]"
"$FF" -y "${inputs[@]}" -filter_complex "$fc" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -t 30 -movflags +faststart "$OUT"
echo "OK -> $OUT"
