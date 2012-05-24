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


  function Context(data) {
    this.data = data || {};
    // TODO: parse context data (curie refs, coercions, containers)
  }
  Context.prototype = {

    toJSON: function () {
      return this.data;
    },

    resolve: function (termOrCURIEorIRI) {
      var def = this.data[termOrCURIEorIRI];
      if (def == undefined) {
        var parts = termOrCURIEorIRI.split(':');
        var ns = this.data[parts[0]];
        if (ns !== undefined) {
          return ns + parts[1];
        }
        return termOrCURIEorIRI;
      }
      return (typeof def === 'string')? def : def[keys.ID];
    }

  };


  function Graph(ctx) {
    this.context = new Context(ctx);
    this.data = {};
  }
  Graph.prototype = {

    toJSON: function () {
      var o = {},
        l = [];
      for (p in this.data)
        if (this.hasOwnProperty(p))
          l.push(this.data[p]);
      o[keys.CONTEXT] = this.context;
      o[keys.GRAPH] = l;
      return o;
    },

    toNode: function (id) {
      var node = this.data[id];
      if (node === undefined) {
        node = this.data[id] = new Node(id, this);
      }
      return node;
    },

    get: function (termOrCURIEorIRI) {
      return this.data[this.context.resolve(termOrCURIEorIRI)];
    }

  };


  function Volatile() {}
  Volatile.prototype = { toJSON: function () {} };


  function Node(id, graph) {
    this[keys.ID] = id;
    this.referrersVia = new Volatile();
    this._properties = new Volatile();
    this._graph = graph;
  }
  Node.name = 'Node';
  Node.prototype = {
    _ctor: Node,

    toString: function () { return this[keys.ID]; },

    toJSON: function () {
      var o = {};
      for (p in this)
        if (p !== '_graph' && this.hasOwnProperty(p))
          o[p] = this[p];
      return o;
    },

    /*
    TODO: Called if one item, if container is not @set and not adding set of
    items, don't use all (only if user-defined context is provided?)

    setLink: function (rel, id) {
    },

    setLiteral: function (rel, value, lang, datatype) {
    },
    */

    addLink: function (rel, id) {
      var object = this._graph.toNode(id);
      var relIRI = this.addToAllAndResolved(rel, object.toRef());
      var rev = object.referrersVia[rel];
      if (rev === undefined) {
        rev = [];
        object.referrersVia[rel] = rev;
        object.referrersVia[relIRI] = rev;
      }
      if (rev[this[keys.ID]] === undefined) {
        var ref = this.toRef();
        rev.push(ref);
        rev[this[keys.ID]] = ref;
      }
    },

    addValue: function (rel, value, lang, datatype) {
      // TODO: check if really literal or coerced...
      var literal = new Literal(value, lang, datatype);
      this.addToAllAndResolved(rel, literal);
    },

    addToAllAndResolved: function (rel, item) {
      var all = this[rel];
      if (all === undefined) {
        all = this[rel] = [];
      }
      all.push(item);
      var relIRI = this._graph.context.resolve(rel);
      this._properties[relIRI] = all;
      return relIRI;
    },

    find: function (path, idx) {
      // IMP: CURIEorIRIorSPARQLPropertyPath, LangOrSPARQLFilter?
      //cls.$(ns.label, 'lang(en)')[0]
      var result;
      if (path[0] === '^') {
        var iri = this._graph.context.resolve(path.substring(1));
        result = this.referrersVia[iri];
      } else {
        var iri = this._graph.context.resolve(path);
        result = this._properties[iri];
      }
      if (result === undefined)
        return [];
      else if (idx !== undefined)
        return result[idx];
      else
        return result;
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
    this[keys.VALUE] = value;
    this[keys.TYPE] = datatype;
    this[keys.LANG] = lang;
    this._graph = graph;
  }
  Literal.name = 'Literal';
  Literal.prototype = {
    _ctor: Literal,

    toString: function () { return this[keys.VALUE]; },

    toNumber: function () {},

    toBoolean: function () {},

    toDate: function () {},

    toObject: function () {
      return this.toDate() ||
        this.toBoolean() ||
          this.toNumber() ||
            this.toString();
    }

  };


  function List(graph) {
    this[keys.LIST] = [];
    this._graph = graph;
  }
  List.name = 'List';
  List.prototype = { _ctor: List };


  function graphify(source, context) {
    var graph = new Graph(context);
    // TODO: vary for set, object or graph..
    for (var it=null, i=0; it=source[i++];) {
      importItem(graph, it);
    }
    return graph;
  }

  function importItem(graph, item) {
    var node = graph.toNode(item[keys.ID]);
    for (var p in item) {
      if (p === keys.ID) {
        continue;
      }
      var o = item[p];
      if (o instanceof Array) {
        for (var i=0, it=null; it=o[i++];) {
          addItem(graph, node, p, it);
        }
      } else {
        addItem(graph, node, p, o);
      }
    }
  }

  function addItem(graph, node, p, o) {
    // TODO: list, coercion...
    if (o[keys.ID]) {
      node.addLink(p, o[keys.ID]);
      importItem(graph, o);
    } else {
      node.addValue(p, o[keys.VALUE], o[keys.LANG], o[keys.TYPE]);
    }
  }


  exports.graphify = graphify;
  exports.Graph = Graph;
  exports.Context = Context;
  exports.Node = Node;
  exports.Literal = Literal;

})(typeof exports !== 'undefined'? exports : LD = {});
