"""Independently transcribe only the new public clips using a local Whisper model.
Usage: python scripts/validate-audio.py --model /local/whisper-small --report new-audio-check.json
This is an asset check, not the demo recognizer or a provider integration.
"""
import argparse,json,wave
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel
parser=argparse.ArgumentParser();parser.add_argument('--model',type=Path,required=True);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
if not args.model.is_dir():raise SystemExit('Supply an already downloaded local Whisper small model directory.')
root=Path(__file__).resolve().parents[1]
model=WhisperModel(str(args.model),device='cpu',compute_type='int8',cpu_threads=4,num_workers=1,local_files_only=True)
results=[]
for entry in json.loads((root/'assets/scripts.json').read_text()):
 with wave.open(str(root/'assets'/entry['file']),'rb') as w:
  if (w.getnchannels(),w.getsampwidth(),w.getframerate())!=(1,2,16000):raise ValueError('Unexpected audio format')
  audio=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768.0
 segments,_=model.transcribe(audio,language=entry['language'],beam_size=3,vad_filter=False,condition_on_previous_text=False)
 results.append({'file':entry['file'],'authoredScript':entry['script'],'independentTranscript':''.join(s.text for s in segments).strip()})
args.report.write_text(json.dumps({'recognizer':'faster-whisper small CPU int8; no text hints','results':results},ensure_ascii=False,indent=2)+'\n')
