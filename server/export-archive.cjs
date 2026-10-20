const fs=require('node:fs');
const path=require('node:path');
const {crc32}=require('./zip.cjs');
// Stored ZIP with data descriptors: large video packs never collect media in RAM.
async function writeExportArchive(target,files){
 const temp=target+'.partial',central=[];let offset=0;
 await fs.promises.mkdir(path.dirname(target),{recursive:true});
 const sizes=files.map(f=>f.sourcePath?fs.statSync(f.sourcePath).size:f.data.length);
 if(files.length>65535||sizes.reduce((a,b)=>a+b,0)>0xf0000000)throw Error('导出超过 3.75GB，请按项目拆分后导出');
 let fd;
 try{
  fd=await fs.promises.open(temp,'wx',0o600);
  const write=async bytes=>{await fd.writeFile(bytes);offset+=bytes.length;};
  for(const [index,file] of files.entries()){
   const name=Buffer.from(file.name,'utf8'),start=offset,local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x808,6);local.writeUInt16LE(name.length,26);
   await write(local);await write(name);let crc=0,size=0;
   const chunks=file.sourcePath?fs.createReadStream(file.sourcePath):[file.data];
   for await(const chunk of chunks){crc=crc32(chunk,crc^0xffffffff);size+=chunk.length;await write(chunk);}
   if(size!==sizes[index])throw Error('视频文件在导出过程中发生变化，请重新导出');
   const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc,4);descriptor.writeUInt32LE(size,8);descriptor.writeUInt32LE(size,12);await write(descriptor);
   const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(0x314,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x808,8);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(size,20);entry.writeUInt32LE(size,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE((file.name.endsWith('.command')?0o100755:0o100644)*65536,38);entry.writeUInt32LE(start,42);central.push(entry,name);
  }
  const start=offset,directory=Buffer.concat(central);await write(directory);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(start,16);await write(end);
  await fd.close();fd=null;await fs.promises.rename(temp,target);
 }catch(error){if(fd){await fd.close();await fs.promises.rm(temp,{force:true});}throw error;}
}
module.exports={writeExportArchive};
