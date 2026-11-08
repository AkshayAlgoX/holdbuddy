"""Generate new public speech with locally downloaded Apache-licensed Kokoro-82M v1.0.
Usage: python scripts/generate-neural-audio.py --models /path/to/model-files
Requires kokoro-onnx, numpy, onnxruntime and ffmpeg. No provider API is used.
"""
import argparse,json,tempfile,subprocess,wave,re
from pathlib import Path
import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro
parser=argparse.ArgumentParser();parser.add_argument('--models',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
session=ort.InferenceSession(str(args.models/'kokoro-v1.0.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
model=Kokoro.from_session(session,str(args.models/'voices-v1.0.bin'))
entries=json.loads((root/'assets/scripts.json').read_text())
for entry in entries:
 voice='hf_alpha' if entry['language']=='hi' else 'af_sarah'
 # The phonemizer takes the ISO language code; the selected Hindi voice styles the output.
 parts = re.split(r'(?<=[।.!?])\s+',entry['script'])
 pieces=[]
 for part in parts:
  if not part.strip(): continue
  segment,rate=model.create(part.replace('।','.'),voice=voice,speed=0.92,lang='hi' if entry['language']=='hi' else 'en-us')
  pieces.extend([segment,np.zeros(int(rate*0.15),dtype=np.float32)])
 audio=np.concatenate(pieces)
 with tempfile.TemporaryDirectory() as d:
  raw=Path(d)/'new.wav'
  with wave.open(str(raw),'wb') as w:
   w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-ar','16000','-ac','1','-af','apad=pad_dur=0.45','-c:a','pcm_s16le','-map_metadata','-1',str(root/'assets'/entry['file'])],check=True)
 entry.update(generator='Kokoro-82M v1.0 (local ONNX)',voice=voice,speed=0.92,origin='new_public_synthetic')
 entry.pop('speechRate',None)
 print('Generated',entry['file'],flush=True)
(root/'assets/scripts.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
