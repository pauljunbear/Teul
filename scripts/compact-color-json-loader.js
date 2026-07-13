const path = require('path');

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

/**
 * Preserve the reviewed JSON files as the readable source of truth while
 * encoding their repeated object keys only once in the production bundle.
 * The exported runtime objects have the same keys, values, and ordering as
 * a normal JSON import.
 */
module.exports = function compactColorJsonLoader(source) {
  const fileName = path.basename(this.resourcePath);
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

  const rows = records.map(record => keys.map(key => record[key]));
  const parameters = keys.join(',');
  const properties = keys.join(',');

  return `const rows=${JSON.stringify(rows)};export default rows.map(([${parameters}])=>({${properties}}));`;
};
