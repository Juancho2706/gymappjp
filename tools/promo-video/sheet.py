import sys,glob
from PIL import Image,ImageDraw
fs=sorted(glob.glob('stills/*.png'),key=lambda f:float(f.split('/t')[1][:-4]))
W,H=960,540;cols=2
rows=(len(fs)+cols-1)//cols
for part in range(0,len(fs),6):
    sub=fs[part:part+6]; r=(len(sub)+1)//2
    im=Image.new('RGB',(W*cols,H*r),'black')
    for i,f in enumerate(sub):
        a=Image.open(f).convert('RGB').resize((W,H))
        ImageDraw.Draw(a).text((10,10),f,fill='yellow')
        im.paste(a,((i%cols)*W,(i//cols)*H))
    im.save(f'sheet{part//6}.png')
print('ok')
