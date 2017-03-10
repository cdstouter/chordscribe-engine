var lineHeight = 1.2;
var copyrightFontSize = 9;

var DefaultFooter = function(parent) {
  this.parent = parent;
};

DefaultFooter.prototype.init = function() {
  // do we have copyright text?
  this.copyrightText = this.parent.data.metadata.copyrightText || '';
  if (!this.copyrightText) return;
  // split it into pieces
  var sofar = "";
  var pieces = [];
  for (var i=0; i<this.copyrightText.length; i++) {
    var c = this.copyrightText.charAt(i);
    var nextc = this.copyrightText.charAt(i + 1);
    if ((c == ' ' || c == '\n') && sofar.length) {
      pieces.push({'text': sofar});
      sofar = "";
    }
    sofar += c;
    if (c == '-' || c == '/' || c == ' ' || c == '\n') {
      if (!nextc || (nextc != '-' && nextc != '/')) {
        pieces.push({'text': sofar});
        sofar = "";
      }
    }
  }
  if (sofar) pieces.push({'text': sofar});
  // measure the width of each piece
  var spaceWidth = this.parent.measureTextWidth(' ', this.parent.font['regular'], copyrightFontSize);
  for (var i=0; i<pieces.length; i++) {
    var piece = pieces[i];
    if (piece.text == ' ') {
      piece.width = spaceWidth;
    } else if (piece.text == '\n') {
      piece.width = 0;
    } else {
      piece.width = this.parent.measureTextWidth(piece.text, this.parent.font['regular'], copyrightFontSize);
    }
  }
  this.copyrightPieces = pieces;
};

DefaultFooter.prototype.drawPage = function(currentPage, pdf) {
  if (!this.copyrightText) return;
  
  // wrap the copyright text lines
  var maxLineWidth = this.parent.data.pageWidth - this.parent.pageMargin[1] - this.parent.pageMargin[3];

  var textLines = [];
  var textLine = {
    'pieces': [],
    'textWidth': 0,
    'justify': true
  };
  
  for (var i=0; i<this.copyrightPieces.length; i++) {
    var piece = this.copyrightPieces[i];
    if (textLine.textWidth + piece.width > maxLineWidth) {
      // new line
      textLines.push(textLine);
      textLine = {
        'pieces': [],
        'textWidth': 0,
        'justify': true
      };
      thisLineWidth = 0;
    }
    if (piece.text == '\n') {
      // new line
      textLine.justify = false;
      textLines.push(textLine);
      textLine = {
        'pieces': [],
        'textWidth': 0,
        'justify': true
      };
      thisLineWidth = 0;
    } else {
      textLine.textWidth += piece.width;
      textLine.pieces.push(piece);
    }
  }
  if (textLine.pieces.length) textLines.push(textLine);
  // don't justify the last line of the text
  if (textLines.length) textLines[textLines.length - 1].justify = false;
  // trim whitespace
  for (var i=0; i<textLines.length; i++) {
    var textLine = textLines[i];
    if (textLine.pieces.length > 0 && textLine.pieces[0].text == ' ') {
      textLine.textWidth -= textLine.pieces[0].width;
      textLine.pieces.splice(0, 1);
    }
    if (textLine.pieces.length > 0 && textLine.pieces[textLine.pieces.length - 1].text == ' ') {
      textLine.textWidth -= textLine.pieces[textLine.pieces.length - 1].width;
      textLine.pieces.splice(textLine.pieces.length - 1, 1);
    }
  }
  
  var footerHeight = textLines.length * (copyrightFontSize * lineHeight / 72);

  this.parent.pageMargin[2] = this.parent.pageMargin[2] + footerHeight;
  
  if (pdf) {
    var drawCopyright = true;
    var currentY = this.parent.data.pageHeight - this.parent.pageMargin[2];
    // draw the text
    if (drawCopyright) {
      pdf.font('regular').fontSize(copyrightFontSize);
      for (var i=0; i<textLines.length; i++) {
        var textLine = textLines[i];
        var currentX = this.parent.pageMargin[3];
        var extraSpace = maxLineWidth - textLine.textWidth;
        var extraSpacePerSpace = 0;
        // justify lines
        if (textLine.justify) {
          var spaces = 0;
          for (var j=0; j<textLine.pieces.length; j++) {
            var piece = textLine.pieces[j];
            if (piece.text == ' ') spaces++;
          }
          if (spaces > 0) extraSpacePerSpace = extraSpace / spaces;
          // don't justify if the gaps would be too large
          if (extraSpacePerSpace > (.02 * copyrightFontSize)) extraSpacePerSpace = 0;
        }
        for (var j=0; j<textLine.pieces.length; j++) {
          var piece = textLine.pieces[j];
          if (piece.text != ' ') pdf.text(piece.text, currentX * 72, currentY * 72);
          if (piece.text == ' ') currentX += extraSpacePerSpace;
          currentX += piece.width;
        }
        currentY += (copyrightFontSize * lineHeight / 72);
      }
    } else {
      for (var i=0; i<textLines.length; i++) {
        currentY += (copyrightFontSize * lineHeight / 72);
      }
    }
  }

  // add an extra line of space
  this.parent.pageMargin[2] = this.parent.pageMargin[2] + (this.parent.data.fontSize * lineHeight / 72);
};

module.exports = DefaultFooter;
