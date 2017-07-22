// layout defaults
var LayoutDefaults = {
  'lineHeight': 1.2,
  'margin': .5,
  'pageWidth': 8.5,
  'pageHeight': 11,
  'transpose': 0,
  'capo': 0,
  'flats': false,
  'fontSize': 14,
  'fontFiles': {
    'regular': 'fonts/OpenSans/OpenSans-Regular.ttf',
    'bold': 'fonts/OpenSans/OpenSans-Bold.ttf'
  },
  // song information
  'metadata': {},
  // decorations
  'decorations': [],
  // auto flats feature
  'autoFlats': {
    'enabled': false,
    'favorFlats': true // only applies to F#/Gb
  },
  // transform all chords - even if transposition is 0, chords are processed
  'transformAllChords': false,
  // use ♯ and ♭ instead of # and b
  'useFancySymbols': false
};

module.exports = LayoutDefaults;