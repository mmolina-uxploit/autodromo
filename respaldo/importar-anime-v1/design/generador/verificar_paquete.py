"""Verifica el contrato y la correspondencia exacta hojas/recortes del ZIP."""
from pathlib import Path
from PIL import Image, ImageChops
import json,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else 'sprites-autodromo')
atlas=json.loads((root/'1-hojas/atlas.json').read_text())
original=json.loads(Path(__file__).with_name('atlas-compatible.json').read_text())
assert atlas==original, 'Atlas alterado'
sizes=json.loads(Path(__file__).with_name('hojas-compatible.json').read_text())
total=0
for model,h in atlas['hojas'].items():
 sheet=Image.open(root/'1-hojas'/h['archivo']).convert('RGBA')
 assert list(sheet.size)==sizes[model]
 for key,r in h['cuadros'].items():
  m,color,inc,layer,gi=key.split('_')
  ang=atlas['giros_grados'][int(gi[1:])]
  p=root/'3-recortes'/m/color/inc/f'{layer}_giro{ang:+d}.png'
  im=Image.open(p).convert('RGBA'); assert im.size==(448,308)
  expect=Image.new('RGBA',im.size)
  expect.paste(sheet.crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h'])),(r['ox'],r['oy']))
  assert im.tobytes()==expect.tobytes(),key
  total+=1
assert total==613
assert len(list((root/'2-retratos').glob('*.png')))==11
print('OK: atlas, 4 hojas, 613 recortes y 11 retratos. No sustituye la prueba en el juego.')
