var lineHeight = 1.3;

var DefaultHeader = function(parent) {
  this.parent = parent;
};

DefaultHeader.prototype.init = function() {
};

DefaultHeader.prototype.drawPage = function(currentPage, pdf) {
  if (pdf) {
    // title
    pdf.font('bold').fontSize(20);
    pdf.text(this.parent.data.metadata.title || '', this.parent.pageMargin[3] * 72, this.parent.pageMargin[0] * 72);
    // pages
    if (this.parent.pages.length > 1) {
      pdf.font('regular').fontSize(12);
      var text = 'Page ' + String(currentPage + 1) + '/' + String(this.parent.pages.length);
      var textWidth = this.parent.measureTextWidth(text, this.parent.font['regular'], 12);
      pdf.text(text, (this.parent.data.pageWidth - this.parent.pageMargin[3] - textWidth) * 72, this.parent.pageMargin[0] * 72);
    }
  }
  this.parent.pageMargin[0] = this.parent.pageMargin[0] + (24 * lineHeight / 72);
  if (pdf) {
    // author
    pdf.font('regular').fontSize(14);
    if (this.parent.data.metadata.author) {
      pdf.text(this.parent.data.metadata.author, this.parent.pageMargin[3] * 72, this.parent.pageMargin[0] * 72);
    }
    // key & capo
    var text = [];
    if (this.parent.data.capo) text.push('Capo ' + String(this.parent.data.capo));
    if (this.parent.data.metadata.key) text.push(this.parent.chordsToText(this.parent.data.metadata.key));
    text = text.join('   ');
    if (text.length) {
      var textWidth = this.parent.measureTextWidth(text, this.parent.font['regular'], 14);
      pdf.text(text, (this.parent.data.pageWidth - this.parent.pageMargin[3] - textWidth) * 72, this.parent.pageMargin[0] * 72);
    }
  }
  this.parent.pageMargin[0] = this.parent.pageMargin[0] + (14 * lineHeight / 72);
  // leave an extra line of space
  this.parent.pageMargin[0] = this.parent.pageMargin[0] + (this.parent.data.fontSize * lineHeight / 72);
};

module.exports = DefaultHeader;
