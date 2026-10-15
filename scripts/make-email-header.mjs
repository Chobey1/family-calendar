// A small original, code-drawn illustration, embedded in emails without remote requests.
import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
const width=960,height=250,pixels=Buffer.alloc(width*height*4);
const colors={sky:[49,94,78],hill:[80,127,100],front:[111,149,112],sun:[232,192,105],cream:[249,247,229],ink:[49,94,78]};
const set=(x,y,c)=>{if(x<0||y<0||x>=width||y>=height)return;const i=(y*width+x)*4;pixels.set([...c,255],i);};
function rect(x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)set(xx,yy,c);}
function circle(cx,cy,r,c){for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++)if((x-cx)**2+(y-cy)**2<=r*r)set(x,y,c);}
rect(0,0,width,height,colors.sky);circle(735,72,43,colors.sun);
for(let x=0;x<width;x++){const top=Math.round(178+35*Math.sin(x/190));rect(x,top,1,height-top,colors.hill);const front=Math.round(226+22*Math.cos(x/130));rect(x,front,1,height-front,colors.front);}
rect(91,48,175,143,colors.cream);rect(91,48,175,37,colors.sun);rect(116,34,12,30,colors.cream);rect(230,34,12,30,colors.cream);
for(let y=0;y<3;y++)for(let x=0;x<4;x++)circle(120+x*38,107+y*29,5,(x===2&&y===1)?colors.sun:colors.ink);
// Stars and cloud shapes give the banner a gentle shared-family feel.
circle(409,72,17,colors.hill);circle(431,65,24,colors.hill);circle(455,75,15,colors.hill);rect(407,73,49,16,colors.hill);
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(buffer){let n=0xffffffff;for(const b of buffer)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),size=Buffer.alloc(4),check=Buffer.alloc(4);size.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,check]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
await writeFile(new URL('../public/email-header.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
