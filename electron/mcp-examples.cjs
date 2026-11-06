// Static authored references only. No renderer, project or live mesh access.
const fs = require('node:fs');
const path = require('node:path');
const IDS = Object.freeze(['cherry', 'curved-ears', 'curved-tail']);
const directory = path.join(__dirname, '..', 'examples');

function getExample(id) {
  if (id === undefined) {
    return {content: [{type: 'text', text: JSON.stringify({
      kind: 'synthetic-authored-reference-index',
      examples: IDS.map(id => ({id, title: JSON.parse(fs.readFileSync(path.join(directory, `${id}.json`), 'utf8')).title})),
    })}]};
  }
  // Whitelist before constructing paths, including for non-string input.
  if (!IDS.includes(id)) throw new RangeError('Unknown example id; use cherry, curved-ears or curved-tail');
  return {content: [
    {type: 'text', text: fs.readFileSync(path.join(directory, `${id}.json`), 'utf8')},
    {type: 'image', mimeType: 'image/png', data: fs.readFileSync(path.join(directory, `${id}.png`)).toString('base64')},
  ]};
}

module.exports = {getExample};
