var RDFa = RDFaParser;

var RDFaDOM = {

  init: function (doc) {
    this.doc = doc || window.document;
    var ctx = new RDFa.Mapper(null, RDFa.contexts.html);
    this.walk(this.doc.documentElement, ctx);
  },

  walk: function (el, ctx) {
    ctx = this.createContext(el, ctx);
    if (el.attributes.length)
      this.expandInElement(ctx, el);
    for (var l=el.childNodes, it=null, i=0; it=l[i++];) {
      if (it.nodeType === 1)
        this.walk(it, ctx);
    }
  },

  createContext: function (el, ctx) {
    function ElData() { this.attrs = el.attributes; };
    ElData.prototype = RDFa.ElementData.prototype;
    var data = new ElData();
    return ctx.createSubMap(data.getVocab(), data.getPrefixes());
  },

  expandInElement: function (ctx, el) {
    //el.rdfaContext = ctx; // (or for mutations, backtrack up?)
    var attrs = el.attributes;
    var expand = function (v) { return ctx.expandTermOrCurieOrIRI(v); };
    var expandRef = function (v) { return ctx.expandCurieOrIRI(v); };
    this.expandAttr(expand, el, 'property');
    this.expandAttr(expand, el, 'typeof');
    //this.expandAttr(expand, el, 'about');
    this.expandAttr(expand, el, 'resource');
    this.expandAttr(expand, el, 'rel');
    this.expandAttr(expandRef, el, 'resource');
    this.expandAttr(expandRef, el, 'href', 'resource');
    this.expandAttr(expandRef, el, 'src', 'resource');
  },

  expandAttr: function (expand, el, attr, destAttr) {
    var v = el.getAttribute(attr);
    if (!v) { return; }
    var iris = v.split(/\s+/).map(expand);
    el.setAttribute(destAttr || attr, iris.join(' '));
  },

  getElementsByProperty: function (p) {
    return this.doc.querySelectorAll("[property~='"+ p +"']");
  },

  getElementsByType: function (p) {
    return this.doc.querySelectorAll("[typeof~='"+ p +"']");
  },

  //getElementsBySubject
  getElementsByResource: function (p) {
    return this.doc.querySelectorAll("[resource~='"+ p +"']");
  },

  getElementsByLink: function (p, o) {
    return this.doc.querySelectorAll(
        //"[property~='"+ p +"'][src~='"+ o +"']," +
        //"[property~='"+ p +"'][href~='"+ o +"']," +
        "[property~='"+ p +"'][resource~='"+ o +"']," +
        //"[rel~='"+ p +"'][src~='"+ o +"']," +
        //"[rel~='"+ p +"'][href~='"+ o +"']," +
        "[rel~='"+ p +"'][resource~='"+ o +"']"
      );
  },

};
