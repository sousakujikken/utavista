import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { resolveFFmpegBinary } from './ffmpegPath';

export interface AlphaExportStartOptions {
  sessionId: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  outputPath: string;
  audioPath?: string;
  /** 書き出し範囲の開始時刻。音声もこの位置から切り出す。 */
  audioStartMs?: number;
}

interface AlphaSession {
  process: ChildProcess;
  outputPath: string;
  frameBytes: number;
  stderrTail: string;
  exit: Promise<number | null>;
}

/**
 * 透過動画（ProRes 4444 / .mov）の書き出し。
 * レンダラーから受け取ったRGBA（非プリマルチプライ）フレームをFFmpegの標準入力へ順に流し、
 * その場でエンコードする。生フレームを一時ファイルへ溜めないため、長尺でもディスクを圧迫しない。
 */
export class AlphaVideoExporter {
  private sessions = new Map<string, AlphaSession>();

  start(options: AlphaExportStartOptions): void {
    if (this.sessions.has(options.sessionId)) {
      throw new Error(`透過書き出しセッションが既に存在します: ${options.sessionId}`);
    }

    const audioArgs = options.audioPath
      ? [
        ...(options.audioStartMs ? ['-ss', (options.audioStartMs / 1000).toFixed(3)] : []),
        '-i', options.audioPath
      ]
      : [];
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${options.width}x${options.height}`,
      '-framerate', String(options.fps),
      '-i', 'pipe:0',
      ...audioArgs,
      '-map', '0:v',
      ...(options.audioPath ? ['-map', '1:a?'] : []),
      '-frames:v', String(options.totalFrames),
      '-t', (options.totalFrames / options.fps).toFixed(3),
      // ProRes 4444: 編集ソフトで扱える透過付き中間形式。アルファは16bit精度で保持する。
      '-c:v', 'prores_ks',
      '-profile:v', '4444',
      '-pix_fmt', 'yuva444p10le',
      '-alpha_bits', '16',
      '-vendor', 'apl0',
      // 編集用の中間素材なので音声は非圧縮PCMで格納する。
      ...(options.audioPath ? ['-c:a', 'pcm_s24le', '-ar', '48000', '-ac', '2'] : []),
      options.outputPath
    ];

    const child = spawn(resolveFFmpegBinary('ffmpeg'), args, { stdio: ['pipe', 'ignore', 'pipe'] });
    const session: AlphaSession = {
      process: child,
      outputPath: options.outputPath,
      frameBytes: options.width * options.height * 4,
      stderrTail: '',
      exit: new Promise(resolve => {
        child.on('close', code => resolve(code));
        child.on('error', error => {
          session.stderrTail += `\n${error.message}`;
          resolve(-1);
        });
      })
    };
    child.stderr?.on('data', data => {
      session.stderrTail = (session.stderrTail + data.toString()).slice(-4000);
    });
    // FFmpegが先に終了した場合の書き込みエラーは writeFrame / finalize で報告する。
    child.stdin?.on('error', () => undefined);
    this.sessions.set(options.sessionId, session);
  }

  async writeFrame(sessionId: string, data: Uint8Array): Promise<void> {
    const session = this.getSession(sessionId);
    if (data.byteLength !== session.frameBytes) {
      throw new Error(`フレームサイズが一致しません（${data.byteLength} / ${session.frameBytes} bytes）`);
    }
    const stdin = session.process.stdin;
    if (!stdin || stdin.destroyed || session.process.exitCode !== null) {
      throw new Error(this.failureMessage(session));
    }
    const ok = stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    if (!ok) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => { cleanup(); resolve(); };
        const onClose = () => { cleanup(); reject(new Error(this.failureMessage(session))); };
        const cleanup = () => {
          stdin.off('drain', onDrain);
          session.process.off('close', onClose);
        };
        stdin.once('drain', onDrain);
        session.process.once('close', onClose);
      });
    }
  }

  async finalize(sessionId: string): Promise<string> {
    const session = this.getSession(sessionId);
    session.process.stdin?.end();
    const code = await session.exit;
    this.sessions.delete(sessionId);
    if (code !== 0) {
      await fs.rm(session.outputPath, { force: true }).catch(() => undefined);
      throw new Error(this.failureMessage(session));
    }
    return session.outputPath;
  }

  async cancel(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    session.process.stdin?.destroy();
    session.process.kill();
    await session.exit;
    await fs.rm(session.outputPath, { force: true }).catch(() => undefined);
  }

  private getSession(sessionId: string): AlphaSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`透過書き出しセッションが見つかりません: ${sessionId}`);
    return session;
  }

  private failureMessage(session: AlphaSession): string {
    const detail = session.stderrTail.trim().split('\n').slice(-3).join(' / ');
    return `ProRes 4444 のエンコードに失敗しました${detail ? `: ${detail}` : ''}`;
  }
}
