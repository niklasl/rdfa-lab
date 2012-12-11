(function (exports) {

  if (typeof jsonld === 'undefined' && typeof require === 'function') {
    jsonld = require('./jsonld/core');
  }

  var CONTEXT = '@context';
  var ID = '@id';
  var TYPE = '@type';
  var CONTAINER = '@container';
  var GRAPH = "@graph";
  var REV = "@rev";

  var compact = exports.compact = addSyncSupport(jsonld.compact);
  var expand = exports.expand = addSyncSupport(jsonld.expand);

  function addSyncSupport(jsonldFunc) {
    return function () {
      var useCallback = arguments.length > 3 || arguments.length > 2 &&
                        typeof arguments[2] === 'function';
      if (useCallback) {
        jsonldFunc.apply(arguments);
      } else {
        // TODO: brute hack pending resolution of json-ld issue #147
        // (Add synchronous methods to the API)
        var input = arguments[0], context = arguments[1];
        jsonldFunc(input, context, function (err, out) {
          result = out, error = err;
        });
        while (result === undefined && error === undefined) { ; }
        if (error) { throw error; }
        return result;
      }
    };
  }

  var connect = exports.connect = function (source, context) {
    // TODO: if (context === undefined) ...
    return new Connector(context).connect(source);
  }

  function Connector(context) {
    this.regularCtx = {};
    //this.revKey = '@rev'; // TODO: reenable
    this.revs = {};
    this.idKey = ID;
    this.typeKey = TYPE;
    this.idMapKey = 'all';
    this.idMap = new Volatile();
    this.typeMapKey = 'byType';
    this.typeMap = null;

    for (var key in context) {
      var value = context[key],
        isObj = typeof value === 'object';
      if (value === '@id') {
        this.idKey = key;
      } else if (value === '@type') {
        this.typeKey = key;
      }
      if (isObj && REV in value) {
        this.revs[value[REV]] = key;
      } else if (isObj && value[ID] === GRAPH) {
        if (value[CONTAINER] === ID) {
          this.idMapKey = key;
        } else if (value[CONTAINER] === TYPE) {
          this.typeMapKey = key;
        }
      } else {
        this.regularCtx[key] = value;
      }
    }
  }

  Connector.prototype = {

    connect: function (source) {
      var result = compact(source, this.regularCtx);

      var resources = result[GRAPH] || [result];
      if (this.idMapKey) {
        result[this.idMapKey] = this.idMap;
      }
      if (this.typeMapKey) {
        result[this.typeMapKey] = this.typeMap = new Volatile();
      }
      // TODO: don't mutate; copy keys if hasOwnProperty (even funcs though)
      // .. loop over object or array..
      for (var i in resources) {
        if (resources.hasOwnProperty && resources.hasOwnProperty(i)) {
          this.connectNode(resources[i]);
        }
      }
      // TODO: too complex to add?
      //var self = this;
      //result.add = function (s, p, o) { self.add(s, p, o) };
      //result.remove = function (s, p, o) { self.remove(s, p, o); };
      return result;
    },

    connectNode: function (node) {
      for (var p in node) {
        var o = node[p];
        if (p === this.idKey) {
          this.mergeNode(node);
        } else if (o instanceof Array) {
          var items = node[p] = [];
          for (var i=0, it=null; it=o[i++];) {
            var ref = this.importNode(it);
            items.push(ref);
            this.addRev(node, p, it);
            if (p === TYPE) {
              this.mapType(o, node);
            }
          }
        } else {
          var ref = node[p] = this.importNode(o);
          this.addRev(node, p, o);
          if (p === this.typeKey) {
            this.mapType(o, node);
          }
        }
      }
    },

    mergeNode: function (node) {
      var id = node[this.idKey];
      var nodeCopy = this.idMap[id];
      if (nodeCopy) {
        for (var key in node) {
          nodeCopy[key] = node[key];
        }
      } else {
        nodeCopy = this.idMap[id] = node;
      }
      return nodeCopy;
    },

    importNode: function (node) {
      if (node[this.idKey]) {
        // TODO: always copy nodes...
        var indexed = this.mergeNode(node);
        return toRef(indexed, this.idKey);
      } else {
        if (node instanceof Object) {
          this.connectNode(node);
        }
        return node;
      }
    },

    mapType: function (type, node) {
      var types = this.typeMap[type];
      if (types === undefined) {
        types = this.typeMap[type] = [];
      }
      types.push(node);
    },

    addRev: function (subj, p, obj) {
      var revProp = this.revs[p];
      if (revProp) {
        var realObj = this.idMap[obj[this.idKey]];
        var revSet = realObj[revProp];
        if (revSet === undefined) {
          revSet = [];
          revSet.toJSON = function () {};
          realObj[revProp] = revSet;
        }
        if (subj instanceof Object/* && revSet[subj[this.idKey]] === undefined*/) {
          revSet.push(subj);
          //revSet[subj[this.idKey]] = subj;
        }
      }
    }

    /* TODO: too complex to add?
    , add: function (s, p, o) {
      if (typeof s === 'string') {
        this.idMap[s];
      } else if (this.idMap[s[this.idKey] === undefined]) {
        s = importNode(s);
      }
      s[p] = o;
      var oId = o[this.idKey];
      if (oId) {
        if (this.idMap[oId] === undefined) {
          o = this.importNode(o);
        }
        this.addRev(s, p, o);
      }
      if (p === this.typeKey) {
        this.mapType(o, s);
      }
    },

    remove: function (s, p, o) {
      // ...
    }
    */

  };

  function Volatile() {}
  Volatile.prototype = { toJSON: function () {} };

  function toRef(obj, idKey) {
    function Ref() {}
    Ref.prototype = obj;
    var ref = new Ref();
    ref.toJSON = function () { return {"@id": this[idKey]}; };
    return ref;
  }

  //bnodeCounter
  //(new Date().getTime()).toString(16) + bnodeCount

})(typeof exports !== 'undefined'? exports : LD = {});
