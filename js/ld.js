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


  function NodeMap(data) {
    this.context = new Context(data);
  }
  NodeMap.prototype = {

    toJSON: function () {
      var o = {},
        l = [];
      for (p in this)
        if (this.hasOwnProperty(p) && p !== 'context')
          l.push(this[p]);
      o[keys.CONTEXT] = this.context;
      o[keys.GRAPH] = l;
      return o;
    },

    toNode: function (id) {
      var node = this[id];
      if (node === undefined) {
        node = this[id] = new Node(id, this);
      }
      return node;
    },

    get: function (termOrCURIEorIRI) {
      return this[this.context.resolve(termOrCURIEorIRI)];
    }

  };


  function Volatile() {}
  Volatile.prototype = { toJSON: function () {} };


  function Node(id, nodeMap) {
    this[keys.ID] = id;
    this.referrersVia = new Volatile();
    this._properties = new Volatile();
    this._nodeMap = nodeMap;
  }
  Node.name = 'Node';
  Node.prototype = {
    _ctor: Node,

    toString: function () { return this[keys.ID]; },

    toJSON: function () {
      var o = {};
      for (p in this)
        if (p !== '_nodeMap' && this.hasOwnProperty(p))
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
      var object = this._nodeMap.toNode(id);
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
      var relIRI = this._nodeMap.context.resolve(rel);
      this._properties[relIRI] = all;
      return relIRI;
    },

    find: function (path, idx) {
      // IMP: CURIEorIRIorSPARQLPropertyPath, LangOrSPARQLFilter?
      //cls.$(ns.label, 'lang(en)')[0]
      var result;
      if (path[0] === '^') {
        var iri = this._nodeMap.context.resolve(path.substring(1));
        result = this.referrersVia[iri];
      } else {
        var iri = this._nodeMap.context.resolve(path);
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


  function Literal(value, lang, datatype, nodeMap) {
    this[keys.VALUE] = value;
    this[keys.TYPE] = datatype;
    this[keys.LANG] = lang;
    this._nodeMap = nodeMap;
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


  function List(nodeMap) {
    this[keys.LIST] = [];
    this._nodeMap = nodeMap;
  }
  List.name = 'List';
  List.prototype = { _ctor: List };


  var parse = function (source, context) {
    var nodeMap = new NodeMap(context);
    // TODO: vary for set, object or graph..
    for (var it=null, i=0; it=source[i++];) {
      importItem(nodeMap, it);
    }
    return nodeMap;
  };

  function importItem(nodeMap, item) {
    var node = nodeMap.toNode(item[keys.ID]);
    for (var p in item) {
      if (p === keys.ID) {
        continue;
      }
      var o = item[p];
      if (o instanceof Array) {
        for (var i=0, it=null; it=o[i++];) {
          addItem(nodeMap, node, p, it);
        }
      } else {
        addItem(nodeMap, node, p, o);
      }
    }
  }

  function addItem(nodeMap, node, p, o) {
    // TODO: list, coercion...
    if (o[keys.ID]) {
      node.addLink(p, o[keys.ID]);
      importItem(nodeMap, o);
    } else {
      node.addValue(p, o[keys.VALUE], o[keys.LANG], o[keys.TYPE]);
    }
  }


  exports.parse = parse;
  exports.NodeMap = NodeMap;
  exports.Context = Context;
  exports.Node = Node;
  exports.Literal = Literal;

})(typeof exports !== 'undefined'? exports : LD = {});
