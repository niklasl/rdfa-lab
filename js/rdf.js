(function (exports) {

  var keys = {
    CONTEXT: '@context',
    ID: '@id',
    TYPE: '@type',
    VALUE: '@value',
    LANG: '@language',
    LIST: "@list",
    GRAPH: "@graph"
  };

  var RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";


  function Graph(mappings) {
    this.resolver = new Resolver(mappings);
    this.idMap = {};
  }
  Graph.prototype = {

    get: function (termOrCURIEorIRI) {
      return this.idMap[this.resolver.resolve(termOrCURIEorIRI)];
    },

    all: function () {
      var result = [], map = this.idMap;
      for (var id in map) {
        result.push(map[id]);
      }
      return result;
    },

    allByType: function (/*types...*/) {
      var result = [];
      for (var cls=null, i=0; cls=arguments[i++];) {
        result = result.concat(this.get(cls).revMap[RDF_TYPE])
      }
      return result;
    },

    importItem: function (item) {
      var node = this.toNode(item[keys.ID]); // TODO: item.getSource()
      for (var p in item) {
        if (p === keys.ID) {
          continue;
        }
        var o = item[p];
        if (o instanceof Array) {
          for (var i=0, it=null; it=o[i++];) {
            this.addObject(node, p, it);
          }
        } else {
          this.addObject(node, p, o);
        }
      }
    },

    toNode: function (id) {
      var node = this.idMap[id];
      if (node === undefined) {
        node = this.idMap[id] = new Node(id, this);
      }
      return node;
    },

    addObject: function (node, p, o) {
      if (p === keys.TYPE) {
        p = RDF_TYPE;
        if (typeof o === 'string') {
          o = {"@id": o};
        }
      }
      if (o[keys.ID]) {
        node.addLink(p, o[keys.ID]);
        this.importItem(o);
      } else if (o[keys.LIST]) {
        // TODO: List
        node.add(p, toList(o[keys.LIST]));
      } else {
        node.addValue(p, o[keys.VALUE], o[keys.LANG], o[keys.TYPE]);
      }
    },

    toJSON: function () {
      var l = [];
      for (var p in this.idMap)
        if (this.hasOwnProperty(p))
          l.push(this.idMap[p]);
      return l;
    }

  };

  function Resolver(mappings) {
    var map = this.map = {};
    for (key in mappings) {
      var val = mappings[key];
      if (typeof val === 'string') {
        map[key] = val;
      } else if (val[keys.ID]) {
        map[key] = val[keys.ID];
      }
    }
  }
  Resolver.prototype.resolve = function (termOrCURIEorIRI) {
    var def = this.map[termOrCURIEorIRI];
    if (def == undefined) {
      var parts = termOrCURIEorIRI.split(':');
      var ns = this.map[parts[0]];
      if (ns !== undefined) {
        return ns + parts[1];
      }
      return termOrCURIEorIRI;
    }
    return (typeof def === 'string')? def : def[keys.ID];
  };


  function Node(id, graph) {
    this.id = id;
    this.graph = graph;
    this.properties = {};
    this.revMap = {};
  }
  Node.prototype = {
    constructor: Node,

    toString: function () { return this.id; },

    toJSON: function () {
      var o = {}, props = this.properties;
      o[keys.ID] = this.id;
      for (var p in props) {
        o[p] = props[p];
      }
      return o;
    },

    get: function (path) {
      return this.getAll(path)[0];
    },

    getAll: function (path) {
      var result;
      if (path[0] === '^') {
        var iri = this.graph.resolver.resolve(path.substring(1));
        result = this.revMap[iri];
      } else {
        var iri = this.graph.resolver.resolve(path);
        result = this.properties[iri];
      }
      if (result === undefined)
        return [];
      else
        return result;
    },

    addLink: function (rel, id) {
      var object = this.graph.toNode(id);
      var rel = this.graph.resolver.resolve(rel);
      this.add(rel, object.toRef());
      var rev = object.revMap[rel];
      if (rev === undefined) {
        rev = [];
        object.revMap[rel] = rev;
      }
      if (rev[this.id] === undefined) {
        var ref = this.toRef();
        rev.push(ref);
        rev[this.id] = ref;
      }
    },

    addValue: function (rel, value, lang, datatype) {
      // TODO: check if really literal or coerced...
      var literal = new Literal(value, lang, datatype);
      this.add(rel, literal);
    },

    /*
    TODO: ...
    setLink: function (rel, id) { },
    setLiteral: function (rel, value, lang, datatype) { },
    remove...
    */

    add: function (rel, item) {
      var all = this.properties[rel];
      if (all === undefined) {
        all = this.properties[rel] = [];
      }
      all.push(item);
    },

    toRef: function () {
      function Ref() {}
      Ref.prototype = this;
      var ref = new Ref();
      ref.toJSON = function () { return {"@id": this[keys.ID]}; };
      return ref;
    }

  };


  function Literal(value, lang, datatype, graph) {
    this.value = value;
    this.datatype = datatype;
    this.lang = lang;
    this.graph = graph;
  }
  Literal.prototype = {
    constructor: Literal,

    toString: function () { return this.value; },

    toJSON: function () {
      var o = {};
      o[keys.VALUE] = this.value;
      if (this.type) o[keys.TYPE] = this.datatype;
      if (this.lang) o[keys.LANG] = this.lang;
      return o;
    },

    asNumber: function () {}, // TODO

    asBoolean: function () {}, // TODO

    asDate: function () {}, // TODO

    asNative: function () {
      return this.toDate() ||
        this.toBoolean() ||
          this.toNumber() ||
            this.toString();
    }

  };


  //function List(array) {
  //  this.items = array;
  //}
  function toList(array) {
    var copy = array.slice();
    // TODO: change use of constructor to an attribute for type?
    copy.type = 'list';
    copy.toJSON = function () {
      var o = {}; o[keys.LIST] = array; return o;
    }
    return copy;
  }


  function toGraph(source, mappings) {
    var graph = new Graph(mappings);
    for (var it=null, i=0; it=source[i++];) {
      graph.importItem(it);
    }
    return graph;
  }


  exports.toGraph = toGraph;
  exports.Graph = Graph;
  exports.Node = Node;
  exports.Literal = Literal;

})(typeof exports !== 'undefined'? exports : RDF = {});
