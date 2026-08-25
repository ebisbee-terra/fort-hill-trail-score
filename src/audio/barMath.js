export function secondsPerBar(tempo, beatsPerBar) {
  return (60 / tempo) * beatsPerBar;
}

export function barsToSeconds(bars, tempo, beatsPerBar) {
  return bars * secondsPerBar(tempo, beatsPerBar);
}
