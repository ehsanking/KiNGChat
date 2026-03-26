import crypto from 'crypto';
import { spawn } from 'child_process';

const EICAR = 'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=';

const sniffMime = (buffer: Buffer) => {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'PK') return 'application/zip';
  if (/^[\t\n\r -~]*$/.test(buffer.subarray(0, Math.min(buffer.length, 256)).toString('latin1'))) return 'text/plain';
  return 'application/octet-stream';
};

const suspiciousMarkers = [
  '<script',
  'javascript:',
  'powershell',
  'wscript.shell',
  'cmd.exe',
  'macro',
  'vba',
  '#!/bin/bash',
  '#!/usr/bin/env node',
];

const runClamAv = async (buffer: Buffer): Promise<{ infected: boolean; reason?: string }> => {
  const command = process.env.CLAMSCAN_COMMAND || 'clamscan';
  if (process.env.ENABLE_CLAMAV_SCAN !== 'true') {
    return { infected: false };
  }

  return new Promise((resolve) => {
    const child = spawn(command, ['--no-summary', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', () => resolve({ infected: false, reason: 'clamav_unavailable' }));
    child.on('close', (code) => {
      const output = `${stdout}\n${stderr}`.trim();
      if (code === 1 || /FOUND/i.test(output)) {
        resolve({ infected: true, reason: output || 'clamav_detected_malware' });
        return;
      }
      resolve({ infected: false, reason: output || undefined });
    });

    child.stdin.end(buffer);
  });
};

export type AntivirusScanResult = {
  clean: boolean;
  detectedMime: string;
  sha256: string;
  reason?: string;
  engine?: 'heuristic' | 'clamav';
};

export const scanBufferForMalware = async (
  buffer: Buffer,
  declaredMime: string | undefined,
): Promise<AntivirusScanResult> => {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const detectedMime = sniffMime(buffer);
  const latinSample = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1').toLowerCase();

  if (buffer.toString('base64').includes(EICAR)) {
    return { clean: false, detectedMime, sha256, reason: 'EICAR test signature detected', engine: 'heuristic' };
  }

  if (
    declaredMime &&
    declaredMime !== 'application/octet-stream' &&
    detectedMime !== 'application/octet-stream' &&
    declaredMime !== detectedMime
  ) {
    return {
      clean: false,
      detectedMime,
      sha256,
      reason: `Declared MIME ${declaredMime} does not match detected MIME ${detectedMime}`,
      engine: 'heuristic',
    };
  }

  if (detectedMime === 'application/zip' && /vba|macro|powershell|javascript/i.test(latinSample)) {
    return { clean: false, detectedMime, sha256, reason: 'Archive contains suspicious script or macro markers', engine: 'heuristic' };
  }

  if (detectedMime === 'text/plain' && suspiciousMarkers.some((marker) => latinSample.includes(marker))) {
    return { clean: false, detectedMime, sha256, reason: 'Suspicious script content detected in uploaded file', engine: 'heuristic' };
  }

  const clam = await runClamAv(buffer);
  if (clam.infected) {
    return { clean: false, detectedMime, sha256, reason: clam.reason, engine: 'clamav' };
  }

  return { clean: true, detectedMime, sha256, engine: clam.reason === 'clamav_unavailable' ? 'heuristic' : 'clamav' };
};
