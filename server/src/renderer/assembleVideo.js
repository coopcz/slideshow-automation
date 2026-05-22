import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export function assembleVideo({ frames, outputPath, duration = 4, transition = 'none' }) {
  return new Promise((resolve, reject) => {
    const listPath = path.join(path.dirname(outputPath), 'frames.txt');
    const lines = [];
    frames.forEach((frame) => {
      lines.push(`file '${frame.path.replaceAll("'", "'\\''")}'`);
      lines.push(`duration ${frame.duration || duration}`);
    });
    if (frames.at(-1)) lines.push(`file '${frames.at(-1).path.replaceAll("'", "'\\''")}'`);
    fs.writeFileSync(listPath, lines.join('\n'));

    const command = ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-pix_fmt yuv420p',
        '-c:v libx264',
        '-movflags +faststart',
        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2'
      ])
      .output(outputPath)
      .on('end', () => {
        fs.rmSync(listPath, { force: true });
        resolve(outputPath);
      })
      .on('error', reject);

    if (transition === 'fade') {
      command.videoFilters('fade=t=in:st=0:d=0.2,fade=t=out:st=3.8:d=0.2');
    }
    command.run();
  });
}
