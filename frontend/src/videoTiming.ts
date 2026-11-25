// Source frame indices are zero-based presentation order, never decoded-frame
// counters or time multiplied by a nominal/average FPS.
export function frameAtTime(times: number[], time: number) {
  if (!times.length || !Number.isFinite(time)) return -1;
  let lo = 0,
    hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] <= time + 0.000001) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

export async function readVideoTimes(file: Blob, signal: AbortSignal) {
  const { Input, BlobSource, MP4, QTFF, WEBM, OGG, EncodedPacketSink } =
    await import("mediabunny");
  signal.throwIfAborted();
  const input = new Input({
    source: new BlobSource(file),
    formats: [MP4, QTFF, WEBM, OGG],
  });
  const cancel = () => input.dispose();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("视频帧索引不可用");
    const times: number[] = [];
    let count = 0;
    for await (const packet of new EncodedPacketSink(track).packets(
      undefined,
      undefined,
      { metadataOnly: true },
    )) {
      signal.throwIfAborted();
      if (!Number.isFinite(packet.timestamp) || ++count > 500000)
        throw new Error("视频帧索引不可用");
      // Negative edit-list preroll is not shown on the player's timeline.
      if (packet.timestamp >= 0) times.push(packet.timestamp);
      if (count % 4096 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    times.sort((a, b) => a - b);
    if (!times.length || times.some((time, i) => i > 0 && time <= times[i - 1]))
      throw new Error("视频帧索引不可用");
    return times;
  } finally {
    signal.removeEventListener("abort", cancel);
    input.dispose();
  }
}
