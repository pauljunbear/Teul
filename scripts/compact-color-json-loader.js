const path = require('path');

const WERNER_AUDIT_KEYS = [
  'schemaVersion',
  'source',
  'policy',
  'sourceCorrections',
  'normalizationRules',
  'normalizationOverrides',
];
const WERNER_RULE_KEYS = ['ids', 'fields', 'find', 'replace', 'reason', 'evidence'];
const WERNER_OVERRIDE_KEYS = ['id', 'field', 'source', 'normalized', 'reason', 'evidence'];

const DATASETS = {
  'colors.json': ['name', 'combinations', 'swatch', 'cmyk', 'lab', 'rgb', 'hex'],
  'wernerColors.json': [
    'id',
    'name',
    'group',
    'groupId',
    'hex',
    'characteristic',
    'animal',
    'vegetable',
    'mineral',
    'description',
  ],
};

function portableBase64Bytes(encoded) {
  return `const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',Z=[];let V=0,N=0;for(const C of ${encoded}){if(C==='=')break;V=V<<6|A.indexOf(C);N+=6;if(N>=8){N-=8;Z.push(V>>N&255);V&=(1<<N)-1}}const b=Uint8Array.from(Z),`;
}

function assertWadaBinaryShape(record, index) {
  const fail = detail => {
    throw new Error(`colors.json record ${index} cannot be losslessly packed: ${detail}`);
  };
  const integers = (value, length, maximum) =>
    Array.isArray(value) &&
    value.length === length &&
    value.every(entry => Number.isInteger(entry) && entry >= 0 && entry <= maximum);

  if (!Number.isInteger(record.swatch) || record.swatch < 0 || record.swatch > 255) {
    fail('swatch must be an unsigned byte');
  }
  if (!integers(record.cmyk, 4, 255)) fail('CMYK must contain four unsigned bytes');
  if (!Array.isArray(record.lab) || record.lab.length !== 3 || !record.lab.every(Number.isFinite)) {
    fail('Lab must contain three finite float64 values');
  }
  if (!integers(record.rgb, 3, 255)) fail('RGB must contain three unsigned bytes');
  if (
    !Array.isArray(record.combinations) ||
    record.combinations.length > 255 ||
    !record.combinations.every(entry => Number.isInteger(entry) && entry >= 0 && entry <= 65_535)
  ) {
    fail('combinations must fit the uint8-length and uint16-value encoding');
  }
  const derivedHex = `#${record.rgb
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`;
  if (record.hex !== derivedHex) fail('hex must be the exact lowercase encoding of RGB');
}

function packWadaRows(records) {
  records.forEach(assertWadaBinaryShape);
  const byteLength = records.reduce(
    (total, record) => total + 33 + record.combinations.length * 2,
    0
  );
  const bytes = Buffer.allocUnsafe(byteLength);
  let offset = 0;

  for (const record of records) {
    bytes.writeUInt8(record.swatch, offset++);
    for (const channel of record.cmyk) bytes.writeUInt8(channel, offset++);
    for (const channel of record.lab) {
      bytes.writeDoubleLE(channel, offset);
      offset += 8;
    }
    for (const channel of record.rgb) bytes.writeUInt8(channel, offset++);
    bytes.writeUInt8(record.combinations.length, offset++);
    for (const combination of record.combinations) {
      bytes.writeUInt16LE(combination, offset);
      offset += 2;
    }
  }

  const encoded = JSON.stringify(bytes.toString('base64'));
  const names = JSON.stringify(records.map(record => record.name));
  return `${portableBase64Bytes(encoded)}v=new DataView(b.buffer);let o=0;export default ${names}.map(name=>{const swatch=b[o++],cmyk=[b[o++],b[o++],b[o++],b[o++]],lab=[v.getFloat64(o,true),v.getFloat64(o+8,true),v.getFloat64(o+16,true)];o+=24;const rgb=[b[o++],b[o++],b[o++]],n=b[o++],combinations=[];for(let i=0;i<n;i++,o+=2)combinations.push(v.getUint16(o,true));const hex='#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');return{name,combinations,swatch,cmyk,lab,rgb,hex}});`;
}

function packWernerRows(records) {
  const input = Buffer.from(JSON.stringify(records), 'utf8');
  const output = [];
  const positions = new Map();
  const remember = index => {
    if (index + 3 >= input.length) return;
    const key = input.readUInt32LE(index);
    const matches = positions.get(key) ?? [];
    matches.push(index);
    while (matches.length > 0 && index - matches[0] > 65_535) matches.shift();
    positions.set(key, matches);
  };

  let index = 0;
  while (index < input.length) {
    const controlIndex = output.length;
    output.push(0);
    let control = 0;
    for (let bit = 0; bit < 8 && index < input.length; bit += 1) {
      let matchLength = 0;
      let matchDistance = 0;
      if (index + 3 < input.length) {
        const matches = positions.get(input.readUInt32LE(index)) ?? [];
        for (let candidateIndex = matches.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
          const candidate = matches[candidateIndex];
          const distance = index - candidate;
          if (distance > 65_535) break;
          let length = 4;
          while (
            length < 259 &&
            index + length < input.length &&
            input[candidate + length] === input[index + length]
          ) {
            length += 1;
          }
          if (length > matchLength) {
            matchLength = length;
            matchDistance = distance;
            if (length === 259) break;
          }
        }
      }

      if (matchLength >= 4) {
        control |= 1 << bit;
        output.push(matchDistance & 0xff, matchDistance >> 8, matchLength - 4);
        for (let offset = 0; offset < matchLength; offset += 1) remember(index + offset);
        index += matchLength;
      } else {
        output.push(input[index]);
        remember(index);
        index += 1;
      }
    }
    output[controlIndex] = control;
  }

  const encoded = JSON.stringify(Buffer.from(output).toString('base64'));
  return `${portableBase64Bytes(encoded)}o=[];for(let i=0;i<b.length;){const f=b[i++];for(let k=0;k<8&&i<b.length;k++){if(f>>k&1){const d=b[i]|b[i+1]<<8,n=b[i+2]+4;i+=3;for(let j=0;j<n;j++)o.push(o[o.length-d])}else o.push(b[i++])}}let s='',p=0;while(p<o.length){const c=o[p++];let u;if(c<128)u=c;else if(c<224)u=(c&31)<<6|o[p++]&63;else if(c<240)u=(c&15)<<12|(o[p++]&63)<<6|o[p++]&63;else{u=((c&7)<<18|(o[p++]&63)<<12|(o[p++]&63)<<6|o[p++]&63)-65536;s+=String.fromCharCode(55296+(u>>10),56320+(u&1023));continue}s+=String.fromCharCode(u)}export default JSON.parse(s);`;
}

function compactWernerAudit(source) {
  const audit = JSON.parse(source);
  const auditKeys = audit && typeof audit === 'object' ? Object.keys(audit) : [];
  if (
    audit.schemaVersion !== 1 ||
    auditKeys.length !== WERNER_AUDIT_KEYS.length ||
    !auditKeys.every((key, index) => key === WERNER_AUDIT_KEYS[index])
  ) {
    throw new Error('transcription-audit.json root schema changed');
  }

  const collections = [
    ['normalizationRules', audit.normalizationRules, WERNER_RULE_KEYS],
    ['normalizationOverrides', audit.normalizationOverrides, WERNER_OVERRIDE_KEYS],
  ];
  for (const [name, entries, keys] of collections) {
    if (!Array.isArray(entries)) {
      throw new Error(`transcription-audit.json ${name} must be an array`);
    }
    entries.forEach((entry, index) => {
      const entryKeys = entry && typeof entry === 'object' ? Object.keys(entry) : [];
      if (
        entryKeys.length !== keys.length ||
        !entryKeys.every((key, keyIndex) => key === keys[keyIndex])
      ) {
        throw new Error(`transcription-audit.json ${name}[${index}] schema changed`);
      }
    });
  }

  return `export default ${JSON.stringify({
    normalizationRules: audit.normalizationRules,
    normalizationOverrides: audit.normalizationOverrides,
  })};`;
}

/**
 * Preserve the reviewed JSON files as the readable source of truth while
 * encoding repeated keys only once. Wada numeric fields are packed losslessly
 * into fixed-width bytes and reconstructed with sandbox-safe JavaScript;
 * build-time checks reject any value that cannot round-trip exactly.
 */
module.exports = function compactColorJsonLoader(source) {
  const fileName = path.basename(this.resourcePath);
  if (fileName === 'transcription-audit.json') {
    return compactWernerAudit(source);
  }
  const keys = DATASETS[fileName];

  if (!keys) {
    throw new Error(`Unsupported compact color dataset: ${fileName}`);
  }

  const records = JSON.parse(source);
  if (!Array.isArray(records)) {
    throw new Error(`${fileName} must contain an array of records`);
  }

  records.forEach((record, index) => {
    const recordKeys = record && typeof record === 'object' ? Object.keys(record) : [];
    const hasExactSchema =
      recordKeys.length === keys.length &&
      recordKeys.every((key, keyIndex) => key === keys[keyIndex]);

    if (!hasExactSchema) {
      throw new Error(
        `${fileName} record ${index} schema changed: expected ${keys.join(',')}; received ${recordKeys.join(',')}`
      );
    }
  });

  if (fileName === 'colors.json') {
    return packWadaRows(records);
  }
  if (fileName === 'wernerColors.json') {
    return packWernerRows(records);
  }

  const rows = records.map(record => keys.map(key => record[key]));
  const parameters = keys.join(',');
  const properties = keys.join(',');

  return `const rows=${JSON.stringify(rows)};export default rows.map(([${parameters}])=>({${properties}}));`;
};
