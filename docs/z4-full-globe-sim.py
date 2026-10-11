import math
FOV=36;DEG=math.pi/180
def fit(w,h):
  a=w/h;v=FOV/2*DEG;hh=math.atan(math.tan(v)*a);half=min(v,hh);fill=1.1 if a<1 else 0.66
  return 1/math.sin(math.atan(fill*math.tan(half)))
def norm(v):l=math.sqrt(sum(x*x for x in v));return [x/l for x in v]
def sim(w,h,d,lat0):
  a=w/h;t=math.tan(FOV/2*DEG)
  cam=[0,0,d]
  def pt(nx,ny):
    dr=norm([nx*t*a,ny*t,-1])
    b=sum(c*e for c,e in zip(cam,dr));c=d*d-1;disc=b*b-c
    if disc>=0: s=-b-math.sqrt(disc);p=[cam[i]+s*dr[i] for i in range(3)];hit=True
    else: s=-b;p=[cam[i]+s*dr[i] for i in range(3)];hit=False
    p=norm(p)
    # rotate so screen centre is lat0: rotate about x by lat0
    c0,s0=math.cos(lat0),math.sin(lat0)
    x,y,z=p; y2=y*c0+z*s0; z2=-y*s0+z*c0
    lat=math.asin(max(-1,min(1,y2)));lon=math.atan2(x,z2)
    return lat,lon
  M=85.05112878*DEG
  def merc(lat,lon):
    lat=max(-M,min(M,lat));return (lon/(2*math.pi)+0.5),0.5-math.log(math.tan(math.pi/4+lat/2))/(2*math.pi)
  lat,lon=pt(0,0);cx,cy=merc(lat,lon)
  rx0=rx1=0;y0=1;y1=0
  for j in range(9):
    for i in range(9):
      la,lo=pt(i/8*2-1,j/8*2-1);mx,my=merc(la,lo);rx=mx-cx;rx-=round(rx)
      rx0=min(rx0,rx);rx1=max(rx1,rx);y0=min(y0,my);y1=max(y1,my)
  out=[]
  for z in range(4,9):
    n=1<<z;vx0=math.floor((cx+rx0)*n);vx1=math.floor((cx+rx1)*n)
    vy0=max(0,min(n-1,math.floor(y0*n)));vy1=max(0,min(n-1,math.floor(y1*n)))
    cols=vx1-vx0+3;rows=min(n-1,vy1+1)-max(0,vy0-1)+1
    vis=(vx1-vx0+1)*(vy1-vy0+1)
    out.append((z,cols,rows,vis))
  mpp=((d-1)*6371000*2*t)/h
  zw=math.ceil(math.log2(156543.03*math.cos(lat)/mpp))
  return zw,out
for (w,h) in [(390,844),(1440,900)]:
  f=fit(w,h)
  for d,label in [(f,'fitDist'),(f*1.55,'maxDist'),(f*0.7,'0.7fit'),(f*0.5,'0.5fit')]:
    for lat0 in [0,30,50]:
      print(w,h,label,round(d,2),'lat',lat0,sim(w,h,d,lat0*DEG))
