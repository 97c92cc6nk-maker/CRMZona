'use strict';

const { execFileSync } = require('node:child_process');
const binary = require('ffmpeg-static');

if (!binary) throw new Error('FFmpeg is unavailable on this platform.');
execFileSync(binary, ['-version'], { stdio: 'ignore', timeout: 15000, windowsHide: true });
console.log('Bundled FFmpeg verified.');
