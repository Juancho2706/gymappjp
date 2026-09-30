#!/usr/bin/env bash
# Render the 8 carousel slides (3 in parallel) and add a silent audio track.
cd "$(dirname "$0")"; mkdir -p out
export FFMPEG=${FFMPEG:-ffmpeg}
one() { s=$1
  PAGE="carousel.html?s=$s" W=1080 H=1350 DUR=6 node render.mjs video out/raw_$s.mp4 60 2 > out/log_$s.txt 2>&1
  "$FFMPEG" -y -v error -i out/raw_$s.mp4 -f lavfi -i anullsrc=r=48000:cl=stereo -map 0:v -map 1:a -c:v copy -c:a aac -b:a 64k -shortest -movflags +faststart out/eva_carrusel_0$s.mp4 && rm out/raw_$s.mp4
  echo "slide $s done"; }
export -f one
printf "%s\n" 1 2 3 4 5 6 7 8 | xargs -P 3 -I{} bash -c 'one {}'
echo ALLDONE
