function box(type,data){const b=Buffer.alloc(8);b.writeUInt32BE(data.length+8);b.write(type,4);return Buffer.concat([b,data]);}
function fixture(duration=2.75,version=0){
 const h=Buffer.alloc(24),t=Buffer.alloc(84),d=Buffer.alloc(version?36:24);h.write('vide',8);t.writeUInt32BE(1920*65536,76);t.writeUInt32BE(1080*65536,80);d[0]=version;const offset=version?20:12;d.writeUInt32BE(1000,offset);if(version)d.writeBigUInt64BE(BigInt(duration*1000),offset+4);else d.writeUInt32BE(duration*1000,offset+4);
 return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',box('trak',Buffer.concat([box('tkhd',t),box('mdia',Buffer.concat([box('mdhd',d),box('hdlr',h)]))])))]);
}
module.exports={fixture};
