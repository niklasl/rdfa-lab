
var RDFaDOM = {

  init: function (doc) {
    doc = doc || window.document;
    var ctx = this.initialContext();
    this.walk(doc.documentElement, ctx);
    this.observer = this.setupObserver(doc);
    return new this.DocumentAccessor(doc);
  },

  walk: function (el, ctx) {
    ctx = this.subContext(el, ctx);
    if (el.attributes.length)
      this.expandInElement(ctx, el);
    for (var l=el.childNodes, it=null, i=0; it=l[i++];) {
      if (it.nodeType === 1)
        this.walk(it, ctx);
    }
  },

  initialContext: function () {
    return new RDFaParser.Mapper(null, RDFaParser.contexts.html);
  },

  subContext: function (el, ctx) {
    function ElData() { this.attrs = el.attributes; };
    ElData.prototype = RDFaParser.ElementData.prototype;
    var data = new ElData();
    return ctx.createSubMap(data.getVocab(), data.getPrefixes());
  },

  attrs: ['property', 'typeof', 'rel', 'rev'],
  refs: ['about', 'resource'],

  expandInElement: function (ctx, el) {
    for (var l=this.attrs, it=null, i=0; it=l[i++];) {
      this.expandTermOrCURIE(ctx, el, it);
    }
    for (var l=this.refs, it=null, i=0; it=l[i++];) {
      this.expandCURIE(ctx, el, it);
    }
    // TODO:
    //this.resolveRef(ctx, el, 'href');
    //this.resolveRef(ctx, el, 'src');
  },

  expandTermOrCURIE: function (ctx, el, attr) {
    var expand = function (v) { return ctx.expandTermOrCurieOrIRI(v); };
    return this.runExpand(expand, el, attr);
  },

  expandCURIE: function (ctx, el, attr) {
    var expand = function (v) { return ctx.expandCurieOrIRI(v); };
    return this.runExpand(expand, el, attr, 'resource');
  },

  runExpand: function (expand, el, attr, destAttr) {
    var v = el.getAttribute(attr);
    if (!v) { return; }
    var iris = v.split(/\s+/).map(function (v) { return expand(v) || v; });
    destAttr = 'data-rdfa-' + (destAttr || attr);
    el.setAttribute(destAttr, iris.join(' '));
  },

  //getElementsBySubjectAndProperty...

  setupObserver: function (doc) {
    if (typeof MutationObserver === 'undefined')
      return;
    // TODO: all attrs; re-compute context where needed and getInheritedContext...
    var self = this;
    var opts = {attributes: true, subtree: true, characterData: false};
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type !== 'attributes')
          return
        // avoid listening to own change
        observer.disconnect();
        var attr = mutation.attributeName,
          target = mutation.target,
          ctx = null;
        // TODO: if typeof or prefix: set context and recompute subtree
        if (self.attrs.indexOf(attr) > -1) {
          var ctx = RDFaDOM.initialContext();
          RDFaDOM.expandTermOrCURIE(ctx, target, attr);
        } else if (self.refs.indexOf(attr) > -1) {
          ctx = ctx || RDFaDOM.initialContext();
          RDFaDOM.expandCURIE(ctx, target, attr);
        }
        // re-observe after disconnect
        observer.observe(doc, opts);
      });
    });
    observer.observe(doc, opts);
    return observer;
  }

};

RDFaDOM.DocumentAccessor = function (doc) {
  this.doc = doc;
};
RDFaDOM.DocumentAccessor.prototype = {

  getElementsByProperty: function (p, o) {
    if (o !== undefined)
      return this.getElementsByLink(p, o);
    return this.doc.querySelectorAll(
      "[data-rdfa-property~='"+ p +"'], " +
        "[data-rdfa-rel~='"+ p +"']");
  },

  getElementsByType: function (p) {
    return this.doc.querySelectorAll("[data-rdfa-typeof~='"+ p +"']");
  },

  getElementsBySubject: function (p) {
    return this.doc.querySelectorAll(
      "[data-rdfa-about~='"+ p +"'], " +
        "[data-rdfa-resource~='"+ p +"'][typeof], " +
          "[data-rdfa-resource~='"+ p +"']:not([property])");
  },

  getElementsByLink: function (p, o) {
    return this.doc.querySelectorAll(
      "[data-rdfa-property~='"+ p +"'][data-rdfa-resource~='"+ o +"']," +
        "[data-rdfa-rel~='"+ p +"'][data-rdfa-resource~='"+ o +"']");
  }

};

if (typeof module !== 'undefined') {
  module.exports = RDFaDOM;
}
