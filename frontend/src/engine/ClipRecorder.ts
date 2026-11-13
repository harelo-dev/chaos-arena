"use client";

export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: { blob: Blob; ts: number }[] = [];
  private isRecording: boolean = false;

  public startBuffering(canvas: HTMLCanvasElement) {
    if (this.isRecording || typeof window === "undefined") return;
    try {
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      this.recorder = new MediaRecorder(stream, { mimeType });
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          const now = performance.now();
          this.chunks.push({ blob: e.data, ts: now });
          // Keep last ~12 seconds of chunks
          const cutoff = now - 12000;
          while (this.chunks.length > 2 && this.chunks[0].ts < cutoff) {
            this.chunks.shift();
          }
        }
      };
      this.recorder.start(1000); // 1s timeslice
      this.isRecording = true;
    } catch {
      // Ignore if browser blocks captureStream
    }
  }

  public saveLast10Seconds(roomCode: string = "CHAOS"): boolean {
    if (!this.chunks.length) return false;
    const blobs = this.chunks.map((c) => c.blob);
    const fullBlob = new Blob(blobs, { type: "video/webm" });
    const url = URL.createObjectURL(fullBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ChaosArena_${roomCode}_${Date.now().toString().slice(-5)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  public stop() {
    if (this.recorder && this.isRecording) {
      try {
        this.recorder.stop();
      } catch {}
    }
    this.isRecording = false;
    this.chunks = [];
  }
}
