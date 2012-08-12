// Generated by CoffeeScript 1.3.1
var RDFaParser;

(function(exports) {
  var Description, ElementData, Mapper, RDFA_USES_VOCAB, RDF_IRI, RDF_XML_LITERAL, State, addPropToObj, addToPropListToObj, bnodeCounter, builder, contexts, extract, getOrCreate, inherit, nextBNode, walk;
  RDF_IRI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  RDF_XML_LITERAL = RDF_IRI + 'XMLLiteral';
  RDFA_USES_VOCAB = "http://www.w3.org/ns/rdfa#usesVocabulary";
  extract = function(doc, base, profile) {
    var state;
    if (profile == null) {
      profile = 'html';
    }
    state = builder.init(doc, base, profile);
    walk(doc.documentElement, state);
    return builder.complete(state);
  };
  walk = function(el, state) {
    var child, subState, _i, _len, _ref, _results;
    if (el.attributes.length) {
      subState = builder.visit(el, state);
    }
    _ref = el.childNodes;
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      child = _ref[_i];
      if (child.nodeType === 1) {
        _results.push(walk(child, subState || state));
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };
  nextBNode = null;
  builder = {
    init: function(doc, base, profile) {
      var all, docObj, resolveURI, resolver, state;
      nextBNode = bnodeCounter();
      resolver = doc.createElement('a');
      resolveURI = function(ref) {
        resolver.href = ref;
        return resolver.href;
      };
      if (doc.getElementsByTagName('base').length) {
        base = resolveURI('');
      }
      state = new State(base, profile, resolveURI);
      docObj = {
        "@id": base
      };
      all = {};
      all[base] = docObj;
      state.current = docObj;
      state.result = {
        all: all
      };
      return state;
    },
    visit: function(el, state) {
      var addToObj, baseObj, current, desc, hanging, inlist, link, nextObj, o, present, prop, rels, res, rev, revs, s, subState, subjRef, type, typed, types, value, _i, _j, _k, _l, _len, _len1, _len2, _len3, _ref;
      desc = new Description(el, state);
      res = state.result;
      current = state.current;
      nextObj = null;
      if (desc.usesVocab) {
        baseObj = getOrCreate(res, state.base);
        addPropToObj(baseObj, RDFA_USES_VOCAB, desc.usesVocab);
      }
      types = desc.types;
      s = desc.getSubject();
      if (s) {
        current = getOrCreate(res, s);
      }
      o = desc.getReference();
      if (o) {
        if (!(desc.propertiesAsLinks && !types)) {
          nextObj = getOrCreate(res, o);
        }
      }
      if (types) {
        typed = desc.about || !nextObj ? current : nextObj;
        for (_i = 0, _len = types.length; _i < _len; _i++) {
          type = types[_i];
          addPropToObj(typed, "@type", type);
        }
      }
      rels = desc.getLinks();
      revs = desc.getRevLinks();
      inlist = desc.inlist;
      hanging = state.hanging;
      if (hanging.present) {
        if (o) {
          s = null;
          current = state.current;
          rels = hanging.rels;
          revs = hanging.revs;
          inlist = hanging.inlist;
          hanging = {
            present: false
          };
        }
      }
      if (inlist) {
        addToObj = addToPropListToObj;
      } else {
        addToObj = addPropToObj;
      }
      if (o) {
        for (_j = 0, _len1 = rels.length; _j < _len1; _j++) {
          link = rels[_j];
          addToObj(current, link, {
            "@id": o
          });
        }
        if (revs.length) {
          subjRef = {
            "@id": s || current["@id"]
          };
          for (_k = 0, _len2 = revs.length; _k < _len2; _k++) {
            rev = revs[_k];
            addToObj(nextObj || getOrCreate(res, o), rev, subjRef);
          }
        }
      } else {
        present = !!(rels.length || revs.length);
        hanging = {
          present: present,
          rels: rels,
          revs: revs,
          inlist: inlist
        };
      }
      value = desc.getLiteral();
      if (value) {
        _ref = desc.getValueProperties();
        for (_l = 0, _len3 = _ref.length; _l < _len3; _l++) {
          prop = _ref[_l];
          addToObj(current, prop, value);
        }
      }
      subState = desc.state;
      subState.hanging = hanging;
      subState.current = nextObj || current;
      return subState;
    },
    complete: function(state) {
      var add, items, key, obj, s, _ref;
      items = [];
      _ref = state.result.all;
      for (s in _ref) {
        obj = _ref[s];
        add = true;
        if (obj["@id"]) {
          add = false;
          for (key in obj) {
            if (key !== "@id") {
              add = true;
              break;
            }
          }
        }
        if (add) {
          items.push(obj);
        }
      }
      return items;
    }
  };
  getOrCreate = function(res, id) {
    var obj;
    obj = res.all[id];
    if (!obj) {
      obj = res.all[id] = {
        "@id": id
      };
    }
    return obj;
  };
  addPropToObj = function(obj, prop, value) {
    var values;
    values = obj[prop];
    if (!values) {
      values = obj[prop] = [];
    } else if (!values.push) {
      values = obj[prop] = [values];
    }
    return values.push(value);
  };
  addToPropListToObj = function(obj, prop, value) {
    var l, values;
    values = obj[prop];
    if (values instanceof Array) {
      if (values[0]['@list']) {
        values = values[0]['@list'];
      } else {
        l = [];
        values.unshift({
          '@list': l
        });
        values = l;
      }
    } else if (values) {
      values = values['@list'];
    } else {
      values = [];
      obj[prop] = {
        "@list": values
      };
    }
    return values.push(value);
  };
  State = (function() {

    State.name = 'State';

    function State(base, profile, resolveURI) {
      this.base = base;
      this.profile = profile;
      this.resolveURI = resolveURI;
      this.mapper = new Mapper(null, contexts[this.profile]);
      this.lang = null;
      this.lists = {};
      this.hanging = {
        present: false,
        rels: null,
        revs: null,
        lists: null
      };
      this.result = null;
      this.current = null;
    }

    State.prototype.createSubState = function(base, lang, vocab, prefixes) {
      var subState;
      subState = inherit(this);
      subState.lang = lang != null ? lang : this.lang;
      subState.mapper = this.mapper.createSubMap(vocab, prefixes);
      return subState;
    };

    State.prototype.expandTermOrCurieOrIRI = function(expr) {
      return this.mapper.expandTermOrCurieOrIRI(expr);
    };

    State.prototype.expandCurieOrIRI = function(expr) {
      return this.mapper.expandCurieOrIRI(expr);
    };

    State.prototype.expandAndResolve = function(curieOrIri) {
      return this.resolveURI(this.expandCurieOrIRI(curieOrIri));
    };

    return State;

  })();
  Mapper = (function() {

    Mapper.name = 'Mapper';

    function Mapper(vocab, map) {
      this.vocab = vocab != null ? vocab : null;
      this.map = map != null ? map : {};
    }

    Mapper.prototype.createSubMap = function(vocab, prefixes) {
      var iri, pfx, subMap;
      if (vocab == null) {
        vocab = this.vocab;
      }
      subMap = inherit(this.map);
      for (pfx in prefixes) {
        iri = prefixes[pfx];
        subMap[pfx] = iri;
      }
      return new Mapper(vocab, subMap);
    };

    Mapper.prototype.expandTermOrCurieOrIRI = function(expr) {
      var iri;
      iri = this.map[expr];
      if (iri) {
        return iri;
      } else if (expr.indexOf(":") === -1) {
        if (this.vocab) {
          return this.vocab + expr;
        } else {
          return null;
        }
      } else {
        return this.expandCurieOrIRI(expr);
      }
    };

    Mapper.prototype.expandCurieOrIRI = function(expr) {
      var i, ns, pfx, term;
      i = expr.indexOf(':');
      if (i === -1) {
        return expr;
      }
      pfx = expr.substring(0, i);
      term = expr.substring(i + 1);
      if (pfx === '_') {
        return expr;
      }
      if (term.slice(0, 2) === "//") {
        return expr;
      }
      ns = this.map[pfx];
      if (ns) {
        return ns + term;
      }
      return expr;
    };

    return Mapper;

  })();
  Description = (function() {

    Description.name = 'Description';

    function Description(el, parentState) {
      var data;
      data = new ElementData(el, parentState);
      this.usesVocab = data.getVocab();
      this.state = data.state;
      this.tagName = data.tagName;
      this.about = data.getAbout();
      this.resource = data.getResource();
      this.types = data.getTypes();
      this.properties = data.getProperties();
      this.rels = data.getRels();
      this.revs = data.getRevs();
      this.propertiesAsLinks = !!(this.properties && (!(this.rels || this.revs)) && (this.resource || this.types));
      if (this.properties && !this.propertiesAsLinks) {
        this.literal = data.getLiteral();
      }
      this.inlist = data.isInlist();
    }

    Description.prototype.getErrors = function() {
      return this.data.errors;
    };

    Description.prototype.getSubject = function() {
      if (this.about) {
        return this.about;
      } else if (this.resource && !((this.rels || this.revs) || this.propertiesAsLinks)) {
        return this.resource;
      } else if (this.types && !(this.properties || this.rels || this.revs)) {
        return this.newBNode();
      }
    };

    Description.prototype.getReference = function() {
      if (this.resource) {
        return this.resource;
      } else if (this.types && (this.rels || this.properties)) {
        return this.newBNode();
      }
    };

    Description.prototype.getLiteral = function() {
      var lit;
      lit = this.literal;
      if (!lit) {
        return null;
      }
      if (!(lit.lang || lit.datatype)) {
        return lit.value;
      } else {
        return {
          "@value": lit.value,
          "@language": lit.lang,
          "@type": lit.datatype
        };
      }
    };

    Description.prototype.getLinks = function() {
      if (this.rels) {
        return this.rels;
      } else if (this.propertiesAsLinks) {
        return this.properties;
      } else {
        return [];
      }
    };

    Description.prototype.getValueProperties = function() {
      if (this.properties && !this.propertiesAsLinks) {
        return this.properties;
      } else {
        return [];
      }
    };

    Description.prototype.getRevLinks = function() {
      if (this.revs) {
        return this.revs;
      } else {
        return [];
      }
    };

    Description.prototype.newBNode = function() {
      return nextBNode();
    };

    return Description;

  })();
  ElementData = (function() {

    ElementData.name = 'ElementData';

    function ElementData(el, parentState) {
      this.el = el;
      this.attrs = this.el.attributes;
      this.tagName = this.el.nodeName.toLowerCase();
      this.errors = [];
      this.state = parentState.createSubState(this.getBase(), this.getLang(), this.getVocab(), this.getPrefixes());
    }

    ElementData.prototype.getBase = function() {
      return null;
    };

    ElementData.prototype.getLang = function() {
      var _ref, _ref1;
      return ((_ref = this.attrs['xml:lang']) != null ? _ref.value : void 0) || ((_ref1 = this.attrs.lang) != null ? _ref1.value : void 0);
    };

    ElementData.prototype.getVocab = function() {
      var _ref;
      return (_ref = this.attrs.vocab) != null ? _ref.value : void 0;
    };

    ElementData.prototype.getPrefixes = function() {
      var i, ns, pfx, pfxs, prefixes, val, _i, _ref, _ref1;
      prefixes = this.getNamespaces();
      val = (_ref = this.attrs.prefix) != null ? _ref.value : void 0;
      if (!val) {
        return prefixes;
      }
      pfxs = val.replace(/^\s+|\s+$/g, "").split(/:?\s+/);
      for (i = _i = 0, _ref1 = pfxs.length; _i < _ref1; i = _i += 2) {
        pfx = pfxs[i];
        ns = pfxs[i + 1];
        prefixes[pfx] = ns;
      }
      return prefixes;
    };

    ElementData.prototype.getNamespaces = function() {
      var attr, prefixes, _i, _len, _ref;
      prefixes = {};
      _ref = this.attrs;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        attr = _ref[_i];
        if (attr.name.match(/^xmlns:/)) {
          prefixes[attr.name.substring(6)] = attr.value;
        }
      }
      return prefixes;
    };

    ElementData.prototype.getAbout = function() {
      var next;
      if (this.attrs.about != null) {
        return next = this.state.expandAndResolve(this.attrs.about.value);
      }
    };

    ElementData.prototype.getResource = function() {
      if (this.attrs.resource != null) {
        return this.state.expandAndResolve(this.attrs.resource.value);
      } else if (this.attrs.href != null) {
        return this.state.resolveURI(this.attrs.href.value);
      } else if (this.attrs.src != null) {
        return this.state.resolveURI(this.attrs.src.value);
      }
    };

    ElementData.prototype.getTypes = function() {
      var v, values, _ref;
      values = (_ref = this.attrs["typeof"]) != null ? _ref.value.split(/\s+/) : void 0;
      if (values) {
        values = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = values.length; _i < _len; _i++) {
            v = values[_i];
            if (v !== 'typeof') {
              _results.push(v);
            }
          }
          return _results;
        })();
      }
      return this.expandAll(values);
    };

    ElementData.prototype.getProperties = function() {
      var _ref;
      return this.expandAll((_ref = this.attrs.property) != null ? _ref.value.split(/\s+/) : void 0);
    };

    ElementData.prototype.getRels = function() {
      var _ref;
      return this.expandAll((_ref = this.attrs.rel) != null ? _ref.value.split(/\s+/) : void 0);
    };

    ElementData.prototype.getRevs = function() {
      var _ref;
      return this.expandAll((_ref = this.attrs.rev) != null ? _ref.value.split(/\s+/) : void 0);
    };

    ElementData.prototype.expandAll = function(expressions) {
      var expr, iri, result, _i, _len;
      if (!expressions) {
        return null;
      }
      result = [];
      for (_i = 0, _len = expressions.length; _i < _len; _i++) {
        expr = expressions[_i];
        iri = this.state.expandTermOrCurieOrIRI(expr);
        if (iri) {
          result.push(iri);
        }
      }
      return result;
    };

    ElementData.prototype.getLiteral = function() {
      var content, datatype, lang, xml;
      datatype = this.getDatatype();
      lang = this.state.lang;
      if (datatype === RDF_XML_LITERAL) {
        xml = this.getXML();
      } else {
        content = this.getContent();
      }
      if (content) {
        if (datatype) {
          return {
            value: content,
            datatype: datatype
          };
        } else if (lang) {
          return {
            value: content,
            lang: lang
          };
        } else {
          return {
            value: content
          };
        }
      } else {
        return {
          value: xml,
          datatype: datatype
        };
      }
    };

    ElementData.prototype.getContent = function() {
      if (this.attrs.content != null) {
        return this.attrs.content.value;
      } else if (this.state.profile === 'html' && this.tagName === 'time') {
        if (this.attrs.datetime != null) {
          return this.attrs.datetime.value;
        }
      }
      return this.el.textContent;
    };

    ElementData.prototype.getXML = function() {
      return this.el.innerHTML;
    };

    ElementData.prototype.getDatatype = function() {
      var value;
      if (this.attrs.datatype != null) {
        return this.state.expandTermOrCurieOrIRI(this.attrs.datatype.value);
      } else if (this.state.profile === 'html' && this.tagName === 'time') {
        value = this.getContent();
        if (value[0] === 'P') {
          return this.state.expandTermOrCurieOrIRI('xsd:duration');
        }
        if (value.indexOf('T') > -1) {
          return this.state.expandTermOrCurieOrIRI('xsd:dateTime');
        } else if (value.indexOf(':') > -1) {
          return this.state.expandTermOrCurieOrIRI('xsd:time');
        } else {
          return this.state.expandTermOrCurieOrIRI('xsd:date');
        }
      }
      return null;
    };

    ElementData.prototype.isInlist = function() {
      return this.attrs.inlist !== void 0;
    };

    return ElementData;

  })();
  contexts = {
    html: {
      "grddl": "http://www.w3.org/2003/g/data-view#",
      "ma": "http://www.w3.org/ns/ma-ont#",
      "owl": "http://www.w3.org/2002/07/owl#",
      "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "rdfa": "http://www.w3.org/ns/rdfa#",
      "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
      "rif": "http://www.w3.org/2007/rif#",
      "skos": "http://www.w3.org/2004/02/skos/core#",
      "skosxl": "http://www.w3.org/2008/05/skos-xl#",
      "wdr": "http://www.w3.org/2007/05/powder#",
      "void": "http://rdfs.org/ns/void#",
      "wdrs": "http://www.w3.org/2007/05/powder-s#",
      "xhv": "http://www.w3.org/1999/xhtml/vocab#",
      "xml": "http://www.w3.org/XML/1998/namespace",
      "xsd": "http://www.w3.org/2001/XMLSchema#",
      "cc": "http://creativecommons.org/ns#",
      "ctag": "http://commontag.org/ns#",
      "dc": "http://purl.org/dc/terms/",
      "dcterms": "http://purl.org/dc/terms/",
      "foaf": "http://xmlns.com/foaf/0.1/",
      "gr": "http://purl.org/goodrelations/v1#",
      "ical": "http://www.w3.org/2002/12/cal/icaltzd#",
      "og": "http://ogp.me/ns#",
      "rev": "http://purl.org/stuff/rev#",
      "sioc": "http://rdfs.org/sioc/ns#",
      "v": "http://rdf.data-vocabulary.org/#",
      "vcard": "http://www.w3.org/2006/vcard/ns#",
      "schema": "http://schema.org/",
      "describedby": "http://www.w3.org/2007/05/powder-s#describedby",
      "license": "http://www.w3.org/1999/xhtml/vocab#license",
      "role": "http://www.w3.org/1999/xhtml/vocab#role"
    }
  };
  bnodeCounter = function() {
    var count, prefix;
    prefix = "_:gen-" + ((new Date().getTime()).toString(16)) + "-";
    count = 0;
    return function() {
      return prefix + count++;
    };
  };
  inherit = function(obj) {
    var ctor;
    ctor = function() {};
    ctor.prototype = obj;
    return new ctor;
  };
  exports.extract = extract;
  exports.Description = Description;
  exports.State = State;
  exports.Mapper = Mapper;
  exports.ElementData = ElementData;
  return exports.contexts = contexts;
})(typeof exports !== "undefined" && exports !== null ? exports : RDFaParser = {});
