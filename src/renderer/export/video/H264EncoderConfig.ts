// H.264 VideoEncoder config candidates shared by the export pre-check and the exporter.
// Hardware encoders often reject some sizes (e.g. portrait 1080x1920) or are unavailable,
// so software encoding is tried as a fallback after hardware.

export function buildH264ConfigCandidates(width: number, height: number, fps: number): any[] {
  const base: any = {
    width,
    height,
    framerate: fps,
    latencyMode: 'quality',
    avc: { format: 'annexb' },
  };
  const candidates: any[] = [];
  for (const hardwareAcceleration of ['prefer-hardware', 'prefer-software']) {
    candidates.push(
      { ...base, hardwareAcceleration, codec: 'avc1.640028' }, // High, Level 4.0
      { ...base, hardwareAcceleration, codec: 'avc1.640032' }, // High, Level 5.0
    );
  }
  return candidates;
}

export async function findSupportedH264Config(width: number, height: number, fps: number): Promise<any | null> {
  const VE: any = (window as any).VideoEncoder;
  if (!VE || typeof VE.isConfigSupported !== 'function') return null;
  for (const cfg of buildH264ConfigCandidates(width, height, fps)) {
    try {
      const support = await VE.isConfigSupported(cfg);
      if (support?.supported) return cfg;
    } catch (_) {
      // try next config
    }
  }
  return null;
}
