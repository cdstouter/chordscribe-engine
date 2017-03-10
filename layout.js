var fs = require('fs');
var path = require('path');
var PDFDocument = require('pdfkit-cachekerning');
var fontkit = require('fontkit-cachekerning');
var _ = require('underscore');
var $ = require('jquery');
var async = require('async');
var blobStream = require('blob-stream');

// load the default header & footer decorations
var defaultheader = require('./decorations/defaultheader.js');
var defaultfooter = require('./decorations/defaultfooter.js');

// load the default layout settings
var defaults = require('./layoutDefaults.js');

// Creates a new Layout object and initializes it
var Layout = function(inputData) {
  this.data = _.defaults(inputData, defaults);
  
  // expand the margin values if need be
  if (typeof this.data.margin == 'number') {
    var margin = this.data.margin;
    this.data.margin = [margin, margin, margin, margin];
  }
  
  this.decorations = [];
  this.decorationInstances = [];
};

Layout.prototype.loadFonts = function(callback) {
  var self = this;
  this.font = {};
  this.fontBuffer = {};
  if (process.browser) {
    // we're running in a browser, try to load the fonts with AJAX
    async.each(_.keys(this.data.fontFiles), function(font, callback) {
      var xhr = new XMLHttpRequest;
      xhr.onload = function() {
        // set the font using the arraybuffer returned from the xhr
        if (xhr.status != 200) {
          callback('Font loading failed with HTTP error code ' + String(xhr.status) + ' for file ' + font);
          return;
        }
        console.log('response', xhr.response);
        var buffer = Buffer.from(xhr.response)
        self.fontBuffer[font] = buffer;
        self.font[font] = fontkit.create(buffer);
        callback();
      };
      xhr.onabort = function() {callback('Font loading aborted for file ' + font)};
      xhr.onerror = function() {callback('Font loading encountered error for file ' + font)};
      xhr.open('GET', self.data.fontFiles[font], true);
      xhr.responseType = 'arraybuffer';
      xhr.send();
    }, callback);
  } else {
    // load the fonts
    _.each(_.keys(this.data.fontFiles), function(font) {
      try {
        self.font[font] = fontkit.openSync(self.data.fontFiles[font]);
      } catch(e) {
        // if loading the font from the local directory failed, try loading it from the script directory
        // if this fails, we let the error propogate and stop execution
        try {
          var fontPath = path.join(__dirname, self.data.fontFiles[font]);
          self.font[font] = fontkit.openSync(fontPath);
          self.data.fontFiles[font] = fontPath;
        } catch(e) {
          callback('Error loading font ' + self.data.fontFiles[font]);
          return;
        }
      }
    });
    callback();
  }
};

Layout.prototype.loadDecoration = function(name, object) {
  this.decorations.push({'name': name, 'object': object});
};

Layout.prototype.loadDefaultDecorations = function() {
  // load the default decorations
  this.loadDecoration('defaultheader', defaultheader);
  this.loadDecoration('defaultfooter', defaultfooter);
  
  // use them if they haven't been overridden
  if (!this.data.decorations.length) {
    this.data.decorations = ["defaultheader", "defaultfooter"];
  }
};

Layout.prototype.splitLine = function(lineText) {
  var lineArray = new Array();
  var sofar = "";
  var inbracket = false;
  for (var i=0;i<lineText.length;i++) {
    var c = lineText.charAt(i);
    if (c == "[") {
      if (sofar.length > 0) lineArray.push({'bracket': false, 'text': sofar});
      sofar = "";
      inbracket = true;
    }  else if (c == "]") {
      if (sofar.length > 0) lineArray.push({'bracket': true, 'text': sofar});
      sofar = "";
      inbracket = false;
    } else if (c == " " && !inbracket) {
      if (sofar.length > 0) lineArray.push({'bracket': false, 'text': sofar});
      lineArray.push({'bracket': false, 'text': ' '});
      sofar = "";
    } else {
      sofar += c;
    }
  } 
  if (sofar.length > 0) lineArray.push({'bracket': false, 'text': sofar});
  return lineArray;
};

Layout.prototype.measureTextWidth = function(text, font, size) {
  var layout = font.layout(text);
  var totalWidth = 0; // width of text in internal font units
  for (var i=0; i<layout.positions.length; i++) {
    totalWidth += layout.positions[i].xAdvance;
  }
  var emWidth = totalWidth / font.unitsPerEm; // width of text in ems
  var inWidth = emWidth * (size / 72); // width of text in inches
  return inWidth;
};

Layout.prototype.parseChord = function(lineItem) {
  if (!lineItem.bracket) return lineItem;
  var newLineItem = {
    'bracket': true,
    'text': lineItem.text,
    'originalText': lineItem.text
  };
  var newstring = lineItem.text;
  var result = "";
  if (newstring.charAt(0) == "!") {
    return {
      'bracket': true,
      'text': newstring.substring(1, newstring.length),
      'originalText': newstring
    };
  }
  if (this.data.effectiveTranspose == 0) return lineItem;
  for (var i=0;i<newstring.length;i++) {
    var thischar = newstring.charAt(i);
    var nextchar = "";
    var notenum = -1;
    var skiptwo = false;
    if (i < newstring.length - 1) nextchar = newstring.charAt(i + 1);
    switch(thischar) {
      case "C": notenum = 0; break;
      case "D": notenum = 2; break;
      case "E": notenum = 4; break;
      case "F": notenum = 5; break;
      case "G": notenum = 7; break;
      case "A": notenum = 9; break;
      case "B": notenum = 11; break;
      default:
        result += thischar;
    }
    if (notenum >= 0) {
      //console.log("notenum " + notenum);
      if (nextchar == "#" || nextchar == "♯") {
        notenum += 1;
        //notenum = (notenum + 1) % 12;
        //console.log("sharp");
        skiptwo = true;
      }
      if (nextchar == "b" || nextchar == "♭") {
        notenum -= 1;
        //notenum = (notenum - 1) % 12;
        //console.log("flat");
        skiptwo = true;
      }
      notenum = (((notenum + this.data.effectiveTranspose) % 12) + 12) % 12;
      //console.log(thischar + " " + notenum);
      switch(notenum) {
        case 0: result += "C"; break;
        case 1: if (this.data.flats) result += "Db"; else result += "C#"; break;
        case 2: result += "D"; break;
        case 3: if (this.data.flats) result += "Eb"; else result += "D#"; break;
        case 4: result += "E"; break;
        case 5: result += "F"; break;
        case 6: if (this.data.flats) result += "Gb"; else result += "F#"; break;
        case 7: result += "G"; break;
        case 8: if (this.data.flats) result += "Ab"; else result += "G#"; break;
        case 9: result += "A"; break;
        case 10: if (this.data.flats) result += "Bb"; else result += "A#"; break;
        case 11: result += "B"; break;
      }
    }
    if (skiptwo) i++;
  }
  newLineItem.text = result;
  return newLineItem;
};

Layout.prototype.layout = function() {
  this.data.effectiveTranspose = this.data.transpose - this.data.capo;
  // load the decorations we're using
  this.decorationInstances.length = 0;
  for (var i=0; i<this.data.decorations.length; i++) {
    var deco = _.findWhere(this.decorations, {'name': this.data.decorations[i]});
    if (deco) {
      this.decorationInstances.push(new deco.object(this));
    } else {
      throw "Page decoration '" + this.data.decorations[i] + "' not found.";
    }
  };
  // init the decorations
  for (var i=0; i<this.decorationInstances.length; i++) {
    this.decorationInstances[i].init();
  }
  //set up the layout variables
  this.pages = new Array();
  this.layoutPage = null;
  this.newPage();
  this.indent = 0;
  this.layoutY = this.pageMargin[0];
  //go through it line by line
  var lines = this.data.markup.split(/\r?\n/);
  for (var i=0;i<lines.length;i++) {
    this.layoutLine(lines[i]);
  }
  this.pages.push(this.layoutPage);
};

//Layout.prototype.renderPageToDOM = function(container, )

Layout.prototype.makePDF = function(outputFilename) {
  var doc = new PDFDocument({
    'autoFirstPage': false
  });
  doc.pipe(fs.createWriteStream(outputFilename));
  // register fonts
  var self = this;
  _.each(_.keys(this.data.fontFiles), function(font) {
    doc.registerFont(font, self.data.fontFiles[font]);
  });
  console.log('Saving PDF, ' + String(this.pages.length) + ' page(s)...');
  for (var currentPage=0;currentPage<this.pages.length;currentPage++) {
    // create a new page
    doc.addPage({
      'size': [this.data.pageWidth * 72, this.data.pageHeight * 72],
      'margin': 0
    });
    console.log('Page ' + String(currentPage) + ', ' + String(this.pages[currentPage].length) + ' text items');
    // let the decorations add to the page
    for (var i=0; i<this.decorationInstances.length; i++) {
      this.pageMargin = this.data.margin.slice(0);
      this.decorationInstances[i].drawPage(currentPage, doc);
    }
    for (var i=0;i<this.pages[currentPage].length;i++) {
      var t = this.pages[currentPage][i];
      doc.font(t.weight).fontSize(t.size);
      if (t.align == 'left') {
        doc.text(t.text, t.x * 72, t.y * 72);
      } else {
        var textWidth = this.measureTextWidth(t.text, this.font[t.weight], t.size);
        if (t.align == 'center') {
          doc.text(t.text, (t.x - (textWidth / 2)) * 72, t.y * 72);
        } else if (t.align == 'right') {
          doc.text(t.text, (t.x - textWidth) * 72, t.y * 72);
        }
      }
    }
  }
  doc.end();
};

Layout.prototype.downloadPDF = function() {
  var doc = new PDFDocument({
    'autoFirstPage': false
  });
  var stream = doc.pipe(blobStream());
  // register fonts
  var self = this;
  _.each(_.keys(this.data.fontFiles), function(font) {
    doc.registerFont(font, self.fontBuffer[font]);
    //doc.registerFont(font, self.data.fontFiles[font]);
  });
  console.log('Saving PDF, ' + String(this.pages.length) + ' page(s)...');
  for (var currentPage=0;currentPage<this.pages.length;currentPage++) {
    // create a new page
    doc.addPage({
      'size': [this.data.pageWidth * 72, this.data.pageHeight * 72],
      'margin': 0
    });
    console.log('Page ' + String(currentPage) + ', ' + String(this.pages[currentPage].length) + ' text items');
    // let the decorations add to the page
    for (var i=0; i<this.decorationInstances.length; i++) {
      this.pageMargin = this.data.margin.slice(0);
      this.decorationInstances[i].drawPage(currentPage, doc);
    }
    for (var i=0;i<this.pages[currentPage].length;i++) {
      var t = this.pages[currentPage][i];
      doc.font(t.weight).fontSize(t.size);
      if (t.align == 'left') {
        doc.text(t.text, t.x * 72, t.y * 72);
      } else {
        var textWidth = this.measureTextWidth(t.text, this.font[t.weight], t.size);
        if (t.align == 'center') {
          doc.text(t.text, (t.x - (textWidth / 2)) * 72, t.y * 72);
        } else if (t.align == 'right') {
          doc.text(t.text, (t.x - textWidth) * 72, t.y * 72);
        }
      }
    }
  }
  doc.end();
  stream.on('finish', function() {
    //var data = stream.toBlob("application/pdf");
    //saveFile("test.pdf", "application/pdf", data);
    //window.open(url);
    var a = $("<a style='display: none;'/>");
    var url = stream.toBlobURL("application/pdf");
    a.attr("href", url);
    a.attr("download", "test.pdf");
    $("body").append(a);
    a[0].click();
    window.URL.revokeObjectURL(url);
    a.remove();
});
  /*
  function saveFile (name, type, data) {
    if (data != null && navigator.msSaveBlob)
      return navigator.msSaveBlob(data, name);
    var a = $("<a style='display: none;'/>");
    var url = window.URL.createObjectURL(data);
    a.attr("href", url);
    a.attr("download", name);
    $("body").append(a);
    a[0].click();
    window.URL.revokeObjectURL(url);
    a.remove();
  }
  */
};

Layout.prototype.createPDFBlob = function(callback) {
  var doc = new PDFDocument({
    'autoFirstPage': false
  });
  var stream = doc.pipe(blobStream());
  // register fonts
  var self = this;
  _.each(_.keys(this.data.fontFiles), function(font) {
    doc.registerFont(font, self.fontBuffer[font]);
  });
  for (var currentPage=0;currentPage<this.pages.length;currentPage++) {
    // create a new page
    doc.addPage({
      'size': [this.data.pageWidth * 72, this.data.pageHeight * 72],
      'margin': 0
    });
    // let the decorations add to the page
    for (var i=0; i<this.decorationInstances.length; i++) {
      this.pageMargin = this.data.margin.slice(0);
      this.decorationInstances[i].drawPage(currentPage, doc);
    }
    for (var i=0;i<this.pages[currentPage].length;i++) {
      var t = this.pages[currentPage][i];
      doc.font(t.weight).fontSize(t.size);
      if (t.align == 'left') {
        doc.text(t.text, t.x * 72, t.y * 72);
      } else {
        var textWidth = this.measureTextWidth(t.text, this.font[t.weight], t.size);
        if (t.align == 'center') {
          doc.text(t.text, (t.x - (textWidth / 2)) * 72, t.y * 72);
        } else if (t.align == 'right') {
          doc.text(t.text, (t.x - textWidth) * 72, t.y * 72);
        }
      }
    }
  }
  doc.end();
  stream.on('finish', function() {
    var data = stream.toBlob("application/pdf");
    callback(null, data);
  });
};

Layout.prototype.saveText = function(text, x, y, size, weight, align) {
  var t = new Object();
  t.text = text;
  t.x = x; t.y = y;
  t.size = size;
  t.weight = weight;
  t.align = align;
  this.layoutPage.push(t);
};

// takes a line of text as input, parses the chords, and returns it back as flat text
Layout.prototype.chordsToText = function(chords) {
  var lineArray = this.splitLine(chords);
  var text = "";
  for (var i=0;i<lineArray.length;i++) {
    if (lineArray[i].bracket) {
      lineArray[i] = this.parseChord(lineArray[i]);
    }
    text += lineArray[i].text;
  }
  return text;
};

Layout.prototype.newPage = function() {
  if (this.layoutPage) this.pages.push(this.layoutPage);
  this.layoutPage = new Array();
  this.pageMargin = this.data.margin.slice(0);
  // let the decorations affect the layout
  for (var i=0; i<this.decorationInstances.length; i++) {
    this.decorationInstances[i].drawPage(this.pages.length, null);
  }
};

Layout.prototype.layoutLine = function(line) {
  var maxY = (this.data.pageHeight - this.pageMargin[2]);
  //new page?
  var bottom = this.layoutY + ((this.data.fontSize * this.data.lineHeight) / 72);
  if (bottom > maxY) {
    //time for a new page!
    this.newPage();
    this.layoutY = this.pageMargin[0];
  }
  //trim whitespace
  var newline = line.trim();
  //0 = just text, 1 = title, 2 = instruction
  var lineType = 0;
  //first, determine line type
  if (newline.length == 0) {
    //it's a blank line, move down the layout and quit
    this.layoutY += ((this.data.fontSize * this.data.lineHeight) / 72);
    var bottom = this.layoutY + ((this.data.fontSize * this.data.lineHeight) / 72);
    if (bottom > maxY) {
      //time for a new page!
      this.newPage();
      this.layoutY = this.pageMargin[0];
    }
    return;
  }
  if (newline.charAt(0) == "#") {
    if (newline.length >= 2 && newline.charAt(1) == "*") {
      //it's an indentation marker
      var stars = 0;
      for (var i=0; i<newline.length; i++) {
        if (newline.charAt(i) == "*") stars++;
      }
      this.indent = (stars - 1) * .5;
    }
    //it's a comment
    return;
  }
  var lineArray = this.splitLine(newline);
  lineArray.push({'bracket': false, 'text': ' '}); // a hack, but we need it right now
  // check for special lines
  if (lineArray.length && lineArray[0].bracket) {
    switch(lineArray[0].text.toLowerCase()) {
      case 'title':
        lineType = 1;
        break;
      case 'instruct':
        lineType = 2;
        break;
      case 'pagebreak':
        if (this.layoutY != this.pageMargin[0]) {
          this.newPage();
          this.layoutY = this.pageMargin[0];
        }
        return;
    }
    if (lineType != 0) {
      lineArray.splice(0, 1);
    }
  }
  //if line type is 1 or 2, just parse the chords back into it and lay it out, splitting if neccesary
  //for lines that are too long
  var dashWidth = this.measureTextWidth("-", this.font.bold, this.data.fontSize);
  // check if we have chords & transpose them if we do
  var hasChords = false;
  for (var i=0;i<lineArray.length;i++) {
    if (lineArray[i].bracket) {
      hasChords = true;
      lineArray[i] = this.parseChord(lineArray[i]);
    }
  }
  if (lineType == 1 || lineType == 2 || (lineType == 0 && !hasChords)) {
    if (lineType == 0) {
      var weight = "regular";
    } else {
      var weight = "bold";
    }
    var startX = (this.pageMargin[3] + this.indent);
    var lineX = startX;
    var maxX = (this.data.pageWidth - this.pageMargin[1]);
    var lastSplit = -1;
    var thisLine = "";
    var checkText = "";
    for (var i=0;i<lineArray.length;i++) {
      if (lineArray[i].bracket) {
        //it's a chord, convert
        checkText += lineArray[i].text;
      } else if (lineArray[i].text == " ") {
        //it's a space, mark it as a split point
        if (lastSplit >= 0) {
          //does it go over?
          lineX = startX + this.measureTextWidth(thisLine + " " + checkText, this.font[weight], this.data.fontSize);
          if (lineX < maxX) {
            thisLine += " " + checkText;
            checkText = "";
            lastSplit = i;
          } else {
            //it went over
            if (lineType == 1) {
              this.saveText(thisLine, (this.data.pageWidth - this.pageMargin[1] - this.pageMargin[3]) / 2 + this.pageMargin[3], this.layoutY, this.data.fontSize, "bold", "center");
            } else {
              this.saveText(thisLine, startX, this.layoutY, this.data.fontSize, weight, "left");
            }
            this.layoutY += ((this.data.fontSize * this.data.lineHeight) / 72);
            var bottom = this.layoutY + ((this.data.fontSize * this.data.lineHeight) / 72);
            if (bottom > maxY) {
              //time for a new page!
              this.newPage();
              this.layoutY = this.pageMargin[0];
            }
            thisLine = "";
            checkText = "";
            lineX = startX;
            i = lastSplit;
            lastSplit = -1;
          }
        } else {
          thisLine += checkText;
          checkText = "";
          lastSplit = i;
        }
      } else {
        //it's not, just add it
        checkText += lineArray[i].text;
      }
    } 
    if (thisLine.length > 0) {
      if (lineType == 1) {
        this.saveText(thisLine, (this.data.pageWidth - this.pageMargin[1] - this.pageMargin[3]) / 2 + this.pageMargin[3], this.layoutY, this.data.fontSize, "bold", "center");
      } else {
        this.saveText(thisLine, startX, this.layoutY, this.data.fontSize, weight, "left");
      }
    }
  } else {
    //it's a chord line. we have to move down one line
    this.layoutY += ((this.data.fontSize * this.data.lineHeight) / 72);
    var bottom = this.layoutY + ((this.data.fontSize * this.data.lineHeight) / 72);
    if (bottom > maxY) {
      //time for a new page!
      this.newPage();
      this.layoutY = this.pageMargin[0] + ((this.data.fontSize * this.data.lineHeight) / 72);
    }
    var startX = this.pageMargin[3] + this.indent;
    var lineX = startX;
    var lastChordX = 0;
    var maxX = this.data.pageWidth - this.pageMargin[1];
    var lastSplit = -1;
    var thisLine = "";
    var checkText = "";
    var chords = new Array();
    var wordPadding = 0;
    var firstPart = true;
    for (var i=0;i<lineArray.length;i++) {
      if (lineArray[i].bracket) {
        //it's a chord, convert
        var offsetX = this.measureTextWidth(checkText, this.font.regular, this.data.fontSize) + wordPadding;
        var thisChord = new Object();
        thisChord.string = lineArray[i].text;
        thisChord.x = lineX + offsetX;
        thisChord.y = (this.layoutY - (this.data.fontSize * this.data.lineHeight) / 72);
        thisChord.lastTextX = lineX + offsetX;
        //calculate padding needed
        var padding = (lastChordX + dashWidth) - thisChord.x;
        if (padding < 0) padding = 0;
        thisChord.x += padding;
        thisChord.padding = padding;
        wordPadding += padding;
        chords.push(thisChord);    
        lastChordX = thisChord.x + this.measureTextWidth(thisChord.string, this.font.bold, this.data.fontSize);
      } else if (lineArray[i].text == " ") {
        //are we over?
        var nextX = lineX + this.measureTextWidth(checkText, this.font.regular, this.data.fontSize) + wordPadding;
        if (nextX < maxX || firstPart) {
          //we're not over, draw it
          //padding for the first chord is moved to before the word
          if (chords.length > 0) {
            if (chords[0].padding > 0) {
              lineX += chords[0].padding;
              chords[0].padding = 0;
            }
          }
          var chordcount = 0;
          for (var j=lastSplit+1;j<i;j++) {
            if (!lineArray[j].bracket) {
              this.saveText(lineArray[j].text, lineX, this.layoutY, this.data.fontSize, "regular", "left");
              lineX = lineX + this.measureTextWidth(lineArray[j].text, this.font.regular, this.data.fontSize);
            } else {
              var padding = chords[chordcount].padding;
              if (padding > dashWidth) {
                this.saveText("-", lineX + (padding - dashWidth) / 2, this.layoutY, this.data.fontSize, "regular", "left");
              }
              lineX += chords[chordcount].padding;
              this.saveText(chords[chordcount].string, lineX, chords[chordcount].y, this.data.fontSize, "bold", "left");
              chordcount += 1;                            
            }
          }
          chords.length = 0;
          wordPadding = 0;
          lineX = lineX + this.measureTextWidth(" ", this.font.regular, this.data.fontSize);
          checkText = "";
          lastSplit = i;
          firstPart = false;
        } else {
          //we're over, start a new line
          i = lastSplit;
          firstPart = true;
          this.layoutY += ((this.data.fontSize * this.data.lineHeight) / 72) * 2;
          var bottom = this.layoutY + ((this.data.fontSize * this.data.lineHeight) / 72);
          if (bottom > maxY) {
            //time for a new page!
            this.newPage();
            this.layoutY = this.pageMargin[0] + ((this.data.fontSize * this.data.lineHeight) / 72);
          }
          lineX = startX;
          checkText = "";
          chords.length = 0;
          wordPadding = 0;
          lastChordX = 0;
        }
      } else {
        //it's not, just add it
        checkText += lineArray[i].text;
      }
    } 
  }
  this.layoutY += ((this.data.fontSize * this.data.lineHeight) / 72);
};

module.exports = Layout;