/**
 * A reduced version of jsonld.js <https://github.com/digitalbazaar/jsonld.js>
 * See prelude and license for jsonld.js below this block.
 */
jsonld = {};

/**
 * A JavaScript implementation of the JSON-LD API.
 *
 * @author Dave Longley
 *
 * BSD 3-Clause License
 * Copyright (c) 2011-2012 Digital Bazaar, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 *
 * Neither the name of the Digital Bazaar, Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
(function() {

// define jsonld API
//var jsonld = {};

/* Core API */

/**
 * Performs JSON-LD compaction.
 *
 * @param input the JSON-LD input to compact.
 * @param ctx the context to compact with.
 * @param [options] options to use:
 *          [base] the base IRI to use.
 *          [strict] use strict mode (default: true).
 *          [optimize] true to optimize the compaction (default: false).
 *          [graph] true to always output a top-level graph (default: false).
 *          [resolver(url, callback(err, jsonCtx))] the URL resolver to use.
 * @param callback(err, compacted, ctx) called once the operation completes.
 */
jsonld.compact = function(input, ctx) {
  // get arguments
  var options = {};
  var callbackArg = 2;
  if(arguments.length > 3) {
    options = arguments[2] || {};
    callbackArg += 1;
  }
  var callback = arguments[callbackArg];

  // nothing to compact
  if(input === null) {
    return callback(null, null);
  }

  // set default options
  if(!('base' in options)) {
    options.base = '';
  }
  if(!('strict' in options)) {
    options.strict = true;
  }
  if(!('optimize' in options)) {
    options.optimize = false;
  }
  if(!('graph' in options)) {
    options.graph = false;
  }
  if(!('resolver' in options)) {
    options.resolver = jsonld.urlResolver;
  }

  // expand input then do compaction
  jsonld.expand(input, options, function(err, expanded) {
    if(err) {
      return callback(new JsonLdError(
        'Could not expand input before compaction.',
        'jsonld.CompactError', {cause: err}));
    }

    // process context
    var activeCtx = _getInitialContext();
    jsonld.processContext(activeCtx, ctx, options, function(err, activeCtx) {
      if(err) {
        return callback(new JsonLdError(
          'Could not process context before compaction.',
          'jsonld.CompactError', {cause: err}));
      }

      try {
        // create optimize context
        if(options.optimize) {
          options.optimizeCtx = {};
        }

        // do compaction
        input = expanded;
        var compacted = new Processor().compact(
          activeCtx, null, input, options);
        cleanup(null, compacted, activeCtx, options);
      }
      catch(ex) {
        callback(ex);
      }
    });
  });

  // performs clean up after compaction
  function cleanup(err, compacted, activeCtx, options) {
    if(err) {
      return callback(err);
    }

    // if compacted is an array with 1 entry, remove array unless
    // graph option is set
    if(!options.graph && _isArray(compacted) && compacted.length === 1) {
      compacted = compacted[0];
    }
    // always use array if graph option is on
    else if(options.graph && _isObject(compacted)) {
      compacted = [compacted];
    }

    // follow @context key
    if(_isObject(ctx) && '@context' in ctx) {
      ctx = ctx['@context'];
    }

    // build output context
    ctx = _clone(ctx);
    if(!_isArray(ctx)) {
      ctx = [ctx];
    }
    // add optimize context
    if(options.optimizeCtx) {
      ctx.push(options.optimizeCtx);
    }
    // remove empty contexts
    var tmp = ctx;
    ctx = [];
    for(var i in tmp) {
      if(!_isObject(tmp[i]) || Object.keys(tmp[i]).length > 0) {
        ctx.push(tmp[i]);
      }
    }

    // remove array if only one context
    var hasContext = (ctx.length > 0);
    if(ctx.length === 1) {
      ctx = ctx[0];
    }

    // add context
    if(hasContext || options.graph) {
      if(_isArray(compacted)) {
        // use '@graph' keyword
        var kwgraph = _compactIri(activeCtx, '@graph');
        var graph = compacted;
        compacted = {};
        if(hasContext) {
          compacted['@context'] = ctx;
        }
        compacted[kwgraph] = graph;
      }
      else if(_isObject(compacted)) {
        // reorder keys so @context is first
        var graph = compacted;
        compacted = {'@context': ctx};
        for(var key in graph) {
          compacted[key] = graph[key];
        }
      }
    }

    callback(null, compacted, activeCtx);
  }
};

/**
 * Performs JSON-LD expansion.
 *
 * @param input the JSON-LD input to expand.
 * @param [options] the options to use:
 *          [base] the base IRI to use.
 *          [resolver(url, callback(err, jsonCtx))] the URL resolver to use.
 * @param callback(err, expanded) called once the operation completes.
 */
jsonld.expand = function(input) {
  // get arguments
  var options = {};
  var callback;
  var callbackArg = 1;
  if(arguments.length > 2) {
    options = arguments[1] || {};
    callbackArg += 1;
  }
  callback = arguments[callbackArg];

  // set default options
  if(!('base' in options)) {
    options.base = '';
  }
  if(!('resolver' in options)) {
    options.resolver = jsonld.urlResolver;
  }

  // resolve all @context URLs in the input
  input = _clone(input);
  _resolveContextUrls(input, options.resolver, function(err, input) {
    if(err) {
      return callback(err);
    }
    try {
      // do expansion
      var ctx = _getInitialContext();
      var expanded = new Processor().expand(ctx, null, input, options, false);

      // optimize away @graph with no other properties
      if(_isObject(expanded) && ('@graph' in expanded) &&
        Object.keys(expanded).length === 1) {
        expanded = expanded['@graph'];
      }
      // normalize to an array
      if(!_isArray(expanded)) {
        expanded = [expanded];
      }
      callback(null, expanded);
    }
    catch(ex) {
      callback(ex);
    }
  });
};

/**
 * The default URL resolver for external @context URLs.
 *
 * @param resolver(url, callback(err, ctx)) the resolver to use.
 */
jsonld.urlResolver = function(url, callback) {
  return callback(new JsonLdError(
    'Could not resolve @context URL. URL resolution not implemented.',
    'jsonld.ContextUrlError'));
};

/* Utility API */

/**
 * Creates a simple context cache.
 *
 * @param size the maximum size of the cache.
 */
jsonld.ContextCache = function(size) {
  this.order = [];
  this.cache = {};
  this.size = size || 50;
  this.expires = 30*60*1000;
};
jsonld.ContextCache.prototype.get = function(url) {
  if(url in this.cache) {
    var entry = this.cache[url];
    if(entry.expires >= +new Date()) {
      return entry.ctx;
    }
    delete this.cache[url];
    this.order.splice(this.order.indexOf(url), 1);
  }
  return null;
};
jsonld.ContextCache.prototype.set = function(url, ctx) {
  if(this.order.length === this.size) {
    delete this.cache[this.order.shift()];
  }
  this.order.push(url);
  this.cache[url] = {ctx: ctx, expires: (+new Date() + this.expires)};
};

/**
 * URL resolvers.
 */
jsonld.urlResolvers = {};

/**
 * The built-in jquery URL resolver.
 */
jsonld.urlResolvers['jquery'] = function($) {
  var cache = new jsonld.ContextCache();
  return function(url, callback) {
    var ctx = cache.get(url);
    if(ctx !== null) {
      return callback(null, ctx);
    }
    $.ajax({
      url: url,
      dataType: 'json',
      crossDomain: true,
      success: function(data, textStatus, jqXHR) {
        cache.set(url, data);
        callback(null, data);
      },
      error: function(jqXHR, textStatus, errorThrown) {
        callback(errorThrown);
      }
    });
  };
};

/**
 * The built-in node URL resolver.
 */
jsonld.urlResolvers['node'] = function() {
  var request = require('request');
  var cache = new jsonld.ContextCache();
  return function(url, callback) {
    var ctx = cache.get(url);
    if(ctx !== null) {
      return callback(null, ctx);
    }
    request(url, function(err, res, body) {
      if(!err) {
        cache.set(url, body);
      }
      callback(err, body);
    });
  };
};

/**
 * Assigns the default URL resolver for external @context URLs to a built-in
 * default. Supported types currently include: 'jquery'.
 *
 * To use the jquery URL resolver, the 'data' parameter must be a reference
 * to the main jquery object.
 *
 * @param type the type to set.
 * @param [params] the parameters required to use the resolver.
 */
jsonld.useUrlResolver = function(type) {
  if(!(type in jsonld.urlResolvers)) {
    throw new JsonLdError(
      'Unknown @context URL resolver type: "' + type + '"',
      'jsonld.UnknownUrlResolver',
      {type: type});
  }

  // set URL resolver
  jsonld.urlResolver = jsonld.urlResolvers[type].apply(
    jsonld, Array.prototype.slice.call(arguments, 1));
};


/**
 * Processes a local context, resolving any URLs as necessary, and returns a
 * new active context in its callback.
 *
 * @param activeCtx the current active context.
 * @param localCtx the local context to process.
 * @param [options] the options to use:
 *          [resolver(url, callback(err, jsonCtx))] the URL resolver to use.
 * @param callback(err, ctx) called once the operation completes.
 */
jsonld.processContext = function(activeCtx, localCtx) {
  // return initial context early for null context
  if(localCtx === null) {
    return callback(null, _getInitialContext());
  }

  // get arguments
  var options = {};
  var callbackArg = 2;
  if(arguments.length > 3) {
    options = arguments[2] || {};
    callbackArg += 1;
  }
  var callback = arguments[callbackArg];

  // set default options
  if(!('base' in options)) {
    options.base = '';
  }
  if(!('resolver' in options)) {
    options.resolver = jsonld.urlResolver;
  }

  // resolve URLs in localCtx
  localCtx = _clone(localCtx);
  if(_isObject(localCtx) && !('@context' in localCtx)) {
    localCtx = {'@context': localCtx};
  }
  _resolveContextUrls(localCtx, options.resolver, function(err, ctx) {
    if(err) {
      return callback(err);
    }
    try {
      // process context
      ctx = new Processor().processContext(activeCtx, ctx, options);
      callback(null, ctx);
    }
    catch(ex) {
      callback(ex);
    }
  });
};

/**
 * Returns true if the given subject has the given property.
 *
 * @param subject the subject to check.
 * @param property the property to look for.
 *
 * @return true if the subject has the given property, false if not.
 */
jsonld.hasProperty = function(subject, property) {
  var rval = false;
  if(property in subject) {
    var value = subject[property];
    rval = (!_isArray(value) || value.length > 0);
  }
  return rval;
};

/**
 * Determines if the given value is a property of the given subject.
 *
 * @param subject the subject to check.
 * @param property the property to check.
 * @param value the value to check.
 *
 * @return true if the value exists, false if not.
 */
jsonld.hasValue = function(subject, property, value) {
  var rval = false;
  if(jsonld.hasProperty(subject, property)) {
    var val = subject[property];
    var isList = _isList(val);
    if(_isArray(val) || isList) {
      if(isList) {
        val = val['@list'];
      }
      for(var i in val) {
        if(jsonld.compareValues(value, val[i])) {
          rval = true;
          break;
        }
      }
    }
    // avoid matching the set of values with an array value parameter
    else if(!_isArray(value)) {
      rval = jsonld.compareValues(value, val);
    }
  }
  return rval;
};

/**
 * Adds a value to a subject. If the value is an array, all values in the
 * array will be added.
 *
 * @param subject the subject to add the value to.
 * @param property the property that relates the value to the subject.
 * @param value the value to add.
 * @param [options] the options to use:
 *        [propertyIsArray] true if the property is always an array, false
 *          if not (default: false).
 *        [allowDuplicate] true to allow duplicates, false not to (uses a
 *          simple shallow comparison of subject ID or value) (default: true).
 */
jsonld.addValue = function(subject, property, value, options) {
  options = options || {};
  if(!('propertyIsArray' in options)) {
    options.propertyIsArray = false;
  }
  if(!('allowDuplicate' in options)) {
    options.allowDuplicate = true;
  }

  if(_isArray(value)) {
    if(value.length === 0 && options.propertyIsArray &&
      !(property in subject)) {
      subject[property] = [];
    }
    for(var i in value) {
      jsonld.addValue(subject, property, value[i], options);
    }
  }
  else if(property in subject) {
    // check if subject already has value if duplicates not allowed
    var hasValue = (!options.allowDuplicate &&
      jsonld.hasValue(subject, property, value));

    // make property an array if value not present or always an array
    if(!_isArray(subject[property]) &&
      (!hasValue || options.propertyIsArray)) {
      subject[property] = [subject[property]];
    }

    // add new value
    if(!hasValue) {
      subject[property].push(value);
    }
  }
  else {
    // add new value as set or single value
    subject[property] = options.propertyIsArray ? [value] : value;
  }
};

/**
 * Gets all of the values for a subject's property as an array.
 *
 * @param subject the subject.
 * @param property the property.
 *
 * @return all of the values for a subject's property as an array.
 */
jsonld.getValues = function(subject, property) {
  var rval = subject[property] || [];
  if(!_isArray(rval)) {
    rval = [rval];
  }
  return rval;
};

/**
 * Removes a property from a subject.
 *
 * @param subject the subject.
 * @param property the property.
 */
jsonld.removeProperty = function(subject, property) {
  delete subject[property];
};

/**
 * Removes a value from a subject.
 *
 * @param subject the subject.
 * @param property the property that relates the value to the subject.
 * @param value the value to remove.
 * @param [options] the options to use:
 *          [propertyIsArray] true if the property is always an array, false
 *            if not (default: false).
 */
jsonld.removeValue = function(subject, property, value, options) {
  options = options || {};
  if(!('propertyIsArray' in options)) {
    options.propertyIsArray = false;
  }

  // filter out value
  var values = jsonld.getValues(subject, property).filter(function(e) {
    return !jsonld.compareValues(e, value);
  });

  if(values.length === 0) {
    jsonld.removeProperty(subject, property);
  }
  else if(values.length === 1 && !options.propertyIsArray) {
    subject[property] = values[0];
  }
  else {
    subject[property] = values;
  }
};

/**
 * Compares two JSON-LD values for equality. Two JSON-LD values will be
 * considered equal if:
 *
 * 1. They are both primitives of the same type and value.
 * 2. They are both @values with the same @value, @type, and @language, OR
 * 3. They both have @ids they are the same.
 *
 * @param v1 the first value.
 * @param v2 the second value.
 *
 * @return true if v1 and v2 are considered equal, false if not.
 */
jsonld.compareValues = function(v1, v2) {
  // 1. equal primitives
  if(v1 === v2) {
    return true;
  }

  // 2. equal @values
  if(_isValue(v1) && _isValue(v2) &&
    v1['@value'] === v2['@value'] &&
    v1['@type'] === v2['@type'] &&
    v2['@language'] === v2['@language']) {
    return true;
  }

  // 3. equal @ids
  if(_isObject(v1) && ('@id' in v1) && _isObject(v2) && ('@id' in v2)) {
    return v1['@id'] === v2['@id'];
  }

  return false;
};

/**
 * Gets the value for the given active context key and type, null if none is
 * set.
 *
 * @param ctx the active context.
 * @param key the context key.
 * @param [type] the type of value to get (eg: '@id', '@type'), if not
 *          specified gets the entire entry for a key, null if not found.
 *
 * @return the value.
 */
jsonld.getContextValue = function(ctx, key, type) {
  var rval = null;

  // return null for invalid key
  if(key === null) {
    return rval;
  }

  // get default language
  if(type === '@language' && (type in ctx)) {
    rval = ctx[type];
  }

  // get specific entry information
  if(key in ctx.mappings) {
    var entry = ctx.mappings[key];

    // return whole entry
    if(_isUndefined(type)) {
      rval = entry;
    }
    // return entry value for type
    else if(type in entry) {
      rval = entry[type];
    }
  }

  return rval;
};

// determine if in-browser or using node.js
var _nodejs = (typeof module !== 'undefined');
var _browser = !_nodejs;

// export nodejs API
if(_nodejs) {
  module.exports = jsonld;
  // use node URL resolver by default
  jsonld.useUrlResolver('node');

  // needed for serialization of XML literals
  if(typeof XMLSerializer === 'undefined') {
    var XMLSerializer = null;
  }
  if(typeof Node === 'undefined') {
    var Node = {
      ELEMENT_NODE: 1,
      ATTRIBUTE_NODE: 2,
      TEXT_NODE: 3,
      CDATA_SECTION_NODE: 4,
      ENTITY_REFERENCE_NODE: 5,
      ENTITY_NODE: 6,
      PROCESSING_INSTRUCTION_NODE: 7,
      COMMENT_NODE: 8,
      DOCUMENT_NODE: 9,
      DOCUMENT_TYPE_NODE: 10,
      DOCUMENT_FRAGMENT_NODE: 11,
      NOTATION_NODE:12
    };
  }
}

// export AMD API
if(typeof define === 'function' && define.amd) {
  define('jsonld', [], function() {
    return jsonld;
  });
}
// export simple browser API
else if(_browser) {
  window.jsonld = window.jsonld || jsonld;
}

// constants
var XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';
var XSD_DOUBLE = 'http://www.w3.org/2001/XMLSchema#double';
var XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
var XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

var RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
var RDF_FIRST = RDF + 'first';
var RDF_REST = RDF + 'rest';
var RDF_NIL = RDF + 'nil';
var RDF_TYPE = RDF + 'type';
var RDF_PLAIN_LITERAL = RDF + 'PlainLiteral';
var RDF_XML_LITERAL = RDF + 'XMLLiteral';
var RDF_OBJECT = RDF + 'object';

var MAX_CONTEXT_URLS = 10;

/**
 * A JSON-LD Error.
 *
 * @param msg the error message.
 * @param type the error type.
 * @param details the error details.
 */
var JsonLdError = function(msg, type, details) {
  if(_nodejs) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);
  }
  this.name = type || 'jsonld.Error';
  this.message = msg || 'An unspecified JSON-LD error occurred.';
  this.details = details || {};
};
if(_nodejs) {
  require('util').inherits(JsonLdError, Error);
}

/**
 * Constructs a new JSON-LD Processor.
 */
var Processor = function() {};

/**
 * Recursively compacts an element using the given active context. All values
 * must be in expanded form before this method is called.
 *
 * @param ctx the active context to use.
 * @param property the property that points to the element, null for none.
 * @param element the element to compact.
 * @param options the compaction options.
 *
 * @return the compacted value.
 */
Processor.prototype.compact = function(ctx, property, element, options) {
  // recursively compact array
  if(_isArray(element)) {
    var rval = [];
    for(var i in element) {
      var e = this.compact(ctx, property, element[i], options);
      // drop null values
      if(e !== null) {
        rval.push(e);
      }
    }
    if(rval.length === 1) {
      // use single element if no container is specified
      var container = jsonld.getContextValue(ctx, property, '@container');
      if(container !== '@list' && container !== '@set') {
        rval = rval[0];
      }
    }
    return rval;
  }

  // recursively compact object
  if(_isObject(element)) {
    // element is a @value
    if(_isValue(element)) {
      // if @value is the only key
      if(Object.keys(element).length === 1) {
        // if there is no default language or @value is not a string,
        // return value of @value
        if(!('@language' in ctx) || !_isString(element['@value'])) {
          return element['@value'];
        }
        // return full element, alias @value
        var rval = {};
        rval[_compactIri(ctx, '@value')] = element['@value'];
        return rval;
      }

      // get type and language context rules
      var type = jsonld.getContextValue(ctx, property, '@type');
      var language = jsonld.getContextValue(ctx, property, '@language');

      // matching @type specified in context, compact element
      if(type !== null &&
        ('@type' in element) && element['@type'] === type) {
        return element['@value'];
      }
      // matching @language specified in context, compact element
      else if(language !== null &&
        ('@language' in element) && element['@language'] === language) {
        return element['@value'];
      }
      else {
        var rval = {};
        // compact @type IRI
        if('@type' in element) {
          rval[_compactIri(ctx, '@type')] =
            _compactIri(ctx, element['@type']);
        }
        // alias @language
        else if('@language' in element) {
          rval[_compactIri(ctx, '@language')] = element['@language'];
        }
        rval[_compactIri(ctx, '@value')] = element['@value'];
        return rval;
      }
    }

    // compact subject references
    if(_isSubjectReference(element)) {
      var type = jsonld.getContextValue(ctx, property, '@type');
      if(type === '@id' || property === '@graph') {
        return _compactIri(ctx, element['@id']);
      }
    }

    // recursively process element keys
    var rval = {};
    for(var key in element) {
      var value = element[key];

      // compact @id and @type(s)
      if(key === '@id' || key === '@type') {
        // compact single @id
        if(_isString(value)) {
          value = _compactIri(ctx, value);
        }
        // value must be a @type array
        else {
          var types = [];
          for(var i in value) {
            types.push(_compactIri(ctx, value[i]));
          }
          value = types;
        }

        // compact property and add value
        var prop = _compactIri(ctx, key);
        var isArray = (_isArray(value) && value.length === 0);
        jsonld.addValue(rval, prop, value, {propertyIsArray: isArray});
        continue;
      }

      // Note: value must be an array due to expansion algorithm.

      // preserve empty arrays
      if(value.length === 0) {
        var prop = _compactIri(ctx, key);
        jsonld.addValue(rval, prop, [], {propertyIsArray: true});
      }

      // recusively process array values
      for(var i in value) {
        var v = value[i];
        var isList = _isList(v);

        // compact property
        var prop = _compactIri(ctx, key, v);

        // remove @list for recursion (will be re-added if necessary)
        if(isList) {
          v = v['@list'];
        }

        // recursively compact value
        v = this.compact(ctx, prop, v, options);

        // get container type for property
        var container = jsonld.getContextValue(ctx, prop, '@container');

        // handle @list
        if(isList && container !== '@list') {
          // handle messy @list compaction
          if(prop in rval && options.strict) {
            throw new JsonLdError(
              'JSON-LD compact error; property has a "@list" @container ' +
              'rule but there is more than a single @list that matches ' +
              'the compacted term in the document. Compaction might mix ' +
              'unwanted items into the list.',
              'jsonld.SyntaxError');
          }
          // reintroduce @list keyword
          var kwlist = _compactIri(ctx, '@list');
          var val = {};
          val[kwlist] = v;
          v = val;
        }

        // if @container is @set or @list or value is an empty array, use
        // an array when adding value
        var isArray = (container === '@set' || container === '@list' ||
          (_isArray(v) && v.length === 0));

        // add compact value
        jsonld.addValue(rval, prop, v, {propertyIsArray: isArray});
      }
    }
    return rval;
  }

  // only primitives remain which are already compact
  return element;
};

/**
 * Recursively expands an element using the given context. Any context in
 * the element will be removed. All context URLs must have been resolved
 * before calling this method.
 *
 * @param ctx the context to use.
 * @param property the property for the element, null for none.
 * @param element the element to expand.
 * @param options the expansion options.
 * @param propertyIsList true if the property is a list, false if not.
 *
 * @return the expanded value.
 */
Processor.prototype.expand = function(
  ctx, property, element, options, propertyIsList) {
  if(typeof element === 'undefined') {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; undefined element.',
      'jsonld.SyntaxError');
  }

  // recursively expand array
  if(_isArray(element)) {
    var rval = [];
    for(var i in element) {
      // expand element
      var e = this.expand(ctx, property, element[i], options, propertyIsList);
      if(_isArray(e) && propertyIsList) {
        // lists of lists are illegal
        throw new JsonLdError(
          'Invalid JSON-LD syntax; lists of lists are not permitted.',
          'jsonld.SyntaxError');
      }
      // drop null values
      else if(e !== null) {
        rval.push(e);
      }
    }
    return rval;
  }

  // recursively expand object
  if(_isObject(element)) {
    // if element has a context, process it
    if('@context' in element) {
      ctx = this.processContext(ctx, element['@context'], options);
      delete element['@context'];
    }

    var rval = {};
    for(var key in element) {
      // expand property
      var prop = _expandTerm(ctx, key);

      // drop non-absolute IRI keys that aren't keywords
      if(!_isAbsoluteIri(prop) && !_isKeyword(prop, ctx)) {
        continue;
      }

      // if value is null and property is not @value, continue
      var value = element[key];
      if(value === null && prop !== '@value') {
        continue;
      }

      // syntax error if @id is not a string
      if(prop === '@id' && !_isString(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@id" value must a string.',
          'jsonld.SyntaxError', {value: value});
      }

      // validate @type value
      if(prop === '@type') {
        _validateTypeValue(value);
      }

      // @graph must be an array or an object
      if(prop === '@graph' && !(_isObject(value) || _isArray(value))) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@value" value must not be an ' +
          'object or an array.',
          'jsonld.SyntaxError', {value: value});
      }

      // @value must not be an object or an array
      if(prop === '@value' && (_isObject(value) || _isArray(value))) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@value" value must not be an ' +
          'object or an array.',
          'jsonld.SyntaxError', {value: value});
      }

      // @language must be a string
      if(prop === '@language' && !_isString(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; "@language" value must not be a string.',
          'jsonld.SyntaxError', {value: value});
      }

      // recurse into @list or @set keeping the active property
      var isList = (prop === '@list');
      if(isList || prop === '@set') {
        value = this.expand(ctx, property, value, options, isList);
        if(isList && _isList(value)) {
          throw new JsonLdError(
            'Invalid JSON-LD syntax; lists of lists are not permitted.',
            'jsonld.SyntaxError');
        }
      }
      else {
        // update active property and recursively expand value
        property = key;
        value = this.expand(ctx, property, value, options, false);
      }

      // drop null values if property is not @value (dropped below)
      if(value !== null || prop === '@value') {
        // convert value to @list if container specifies it
        if(prop !== '@list' && !_isList(value)) {
          var container = jsonld.getContextValue(ctx, property, '@container');
          if(container === '@list') {
            // ensure value is an array
            value = _isArray(value) ? value : [value];
            value = {'@list': value};
          }
        }

        // optimize away @id for @type
        if(prop === '@type') {
          if(_isSubjectReference(value)) {
            value = value['@id'];
          }
          else if(_isArray(value)) {
            var val = [];
            for(var i in value) {
              var v = value[i];
              if(_isSubjectReference(v)) {
                val.push(v['@id']);
              }
              else {
                val.push(v);
              }
            }
            value = val;
          }
        }

        // add value, use an array if not @id, @type, @value, or @language
        var useArray = !(prop === '@id' || prop === '@type' ||
          prop === '@value' || prop === '@language');
        jsonld.addValue(rval, prop, value, {propertyIsArray: useArray});
      }
    }

    // get property count on expanded output
    var count = Object.keys(rval).length;

    // @value must only have @language or @type
    if('@value' in rval) {
      if((count === 2 && !('@type' in rval) && !('@language' in rval)) ||
        count > 2) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; an element containing "@value" must have ' +
          'at most one other property which can be "@type" or "@language".',
          'jsonld.SyntaxError', {element: rval});
      }
      // value @type must be a string
      if('@type' in rval && !_isString(rval['@type'])) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the "@type" value of an element ' +
          'containing "@value" must be a string.',
          'jsonld.SyntaxError', {element: rval});
      }
      // drop null @values
      else if(rval['@value'] === null) {
        rval = null;
      }
    }
    // convert @type to an array
    else if('@type' in rval && !_isArray(rval['@type'])) {
      rval['@type'] = [rval['@type']];
    }
    // handle @set and @list
    else if('@set' in rval || '@list' in rval) {
      if(count !== 1) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; if an element has the property "@set" ' +
          'or "@list", then it must be its only property.',
          'jsonld.SyntaxError', {element: rval});
      }
      // optimize away @set
      if('@set' in rval) {
        rval = rval['@set'];
      }
    }
    // drop objects with only @language
    else if('@language' in rval && count === 1) {
      rval = null;
    }

    return rval;
  }

  // expand element according to value expansion rules
  return _expandValue(ctx, property, element, options.base);
};

/**
 * Processes a local context and returns a new active context.
 *
 * @param activeCtx the current active context.
 * @param localCtx the local context to process.
 * @param options the context processing options.
 *
 * @return the new active context.
 */
Processor.prototype.processContext = function(
  activeCtx, localCtx, options) {
  // initialize the resulting context
  var rval = _clone(activeCtx);

  // normalize local context to an array of @context objects
  if(_isObject(localCtx) && '@context' in localCtx &&
    _isArray(localCtx['@context'])) {
    localCtx = localCtx['@context'];
  }
  var ctxs = _isArray(localCtx) ? localCtx : [localCtx];

  // process each context in order
  for(var i in ctxs) {
    var ctx = ctxs[i];

    // reset to initial context
    if(ctx === null) {
      rval = _getInitialContext();
      continue;
    }

    // dereference @context key if present
    if(_isObject(ctx) && '@context' in ctx) {
      ctx = ctx['@context'];
    }

    // context must be an object by now, all URLs resolved before this call
    if(!_isObject(ctx)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context must be an object.',
        'jsonld.SyntaxError', {context: ctx});
    }

    // define context mappings for keys in local context
    var defined = {};
    for(var key in ctx) {
      _defineContextMapping(rval, ctx, key, options.base, defined);
    }
  }

  return rval;
};

/**
 * Expands the given value by using the coercion and keyword rules in the
 * given context.
 *
 * @param ctx the active context to use.
 * @param property the property the value is associated with.
 * @param value the value to expand.
 * @param base the base IRI to use.
 *
 * @return the expanded value.
 */
function _expandValue(ctx, property, value, base) {
  // nothing to expand
  if(value === null) {
    return null;
  }

  // default to simple string return value
  var rval = value;

  // special-case expand @id and @type (skips '@id' expansion)
  var prop = _expandTerm(ctx, property);
  if(prop === '@id' || prop === '@type') {
    rval = _expandTerm(ctx, value, base);
  }
  else {
    // get type definition from context
    var type = jsonld.getContextValue(ctx, property, '@type');

    // do @id expansion (automatic for @graph)
    if(type === '@id' || prop === '@graph') {
      rval = {'@id': _expandTerm(ctx, value, base)};
    }
    else if(!_isKeyword(prop)) {
      rval = {'@value': value};

      // other type
      if(type !== null) {
        rval['@type'] = type;
      }
      // check for language tagging
      else {
        var language = jsonld.getContextValue(ctx, property, '@language');
        if(language !== null) {
          rval['@language'] = language;
        }
      }
    }
  }

  return rval;
}

/**
 * Compares two strings first based on length and then lexicographically.
 *
 * @param a the first string.
 * @param b the second string.
 *
 * @return -1 if a < b, 1 if a > b, 0 if a == b.
 */
function _compareShortestLeast(a, b) {
  if(a.length < b.length) {
    return -1;
  }
  else if(b.length < a.length) {
    return 1;
  }
  return (a < b) ? -1 : ((a > b) ? 1 : 0);
}

/**
 * Ranks a term that is possible choice for compacting an IRI associated with
 * the given value.
 *
 * @param ctx the active context.
 * @param term the term to rank.
 * @param value the associated value.
 *
 * @return the term rank.
 */
function _rankTerm(ctx, term, value) {
  // no term restrictions for a null value
  if(value === null) {
    return 3;
  }

  // get context entry for term
  var entry = ctx.mappings[term];
  var hasType = ('@type' in entry);
  var hasLanguage = ('@language' in entry);
  var hasDefaultLanguage = ('@language' in ctx);

  // @list rank is the sum of its values' ranks
  if(_isList(value)) {
    var list = value['@list'];
    if(list.length === 0) {
      return (entry['@container'] === '@list') ? 1 : 0;
    }
    // sum term ranks for each list value
    var sum = 0;
    for(var i in list) {
      sum += _rankTerm(ctx, term, list[i]);
    }
    return sum;
  }

  // Note: Value must be an object that is a @value or subject/reference.

  if(_isValue(value)) {
    // value has a @type
    if('@type' in value) {
      // @types match
      if(value['@type'] === entry['@type']) {
        return 3;
      }
      return (!hasType && !hasLanguage) ? 1 : 0;
    }

    // rank non-string value
    if(!_isString(value['@value'])) {
      return (!hasType && !hasLanguage) ? 2 : 1;
    }

    // value has no @type or @language
    if(!('@language' in value)) {
      // entry @language is specifically null or no @type, @language, or
      // default
      if(entry['@language'] === null ||
        (!hasType && !hasLanguage && !hasDefaultLanguage)) {
        return 3;
      }
      return 0;
    }

    // @languages match or entry has no @type or @language but default
    // @language matches
    if((value['@language'] === entry['@language']) ||
      (!hasType && !hasLanguage && value['@language'] === ctx['@language'])) {
      return 3;
    }
    return (!hasType && !hasLanguage) ? 1 : 0;
  }

  // value must be a subject/reference
  if(entry['@type'] === '@id') {
    return 3;
  }
  return (!hasType && !hasLanguage) ? 1 : 0;
}

/**
 * Compacts an IRI or keyword into a term or prefix if it can be. If the
 * IRI has an associated value it may be passed.
 *
 * @param ctx the active context to use.
 * @param iri the IRI to compact.
 * @param value the value to check or null.
 *
 * @return the compacted term, prefix, keyword alias, or the original IRI.
 */
function _compactIri(ctx, iri, value) {
  // can't compact null
  if(iri === null) {
    return iri;
  }

  // term is a keyword
  if(_isKeyword(iri)) {
    // return alias if available
    var aliases = ctx.keywords[iri];
    if(aliases.length > 0) {
      return aliases[0];
    }
    else {
      // no alias, keep original keyword
      return iri;
    }
  }

  // default value to null
  if(_isUndefined(value)) {
    value = null;
  }

  // find all possible term matches
  var terms = [];
  var highest = 0;
  var listContainer = false;
  var isList = _isList(value);
  for(var term in ctx.mappings) {
    // skip terms with non-matching iris
    var entry = ctx.mappings[term];
    if(entry['@id'] !== iri) {
      continue;
    }
    // skip @set containers for @lists
    if(isList && entry['@container'] === '@set') {
      continue;
    }
    // skip @list containers for non-@lists
    if(!isList && entry['@container'] === '@list' && value !== null) {
      continue;
    }
    // for @lists, if listContainer is set, skip non-list containers
    if(isList && listContainer && entry['@container'] !== '@list') {
      continue;
    }

    // rank term
    var rank = _rankTerm(ctx, term, value);
    if(rank > 0) {
      // add 1 to rank if container is a @set
      if(entry['@container'] === '@set') {
        rank += 1;
      }

      // for @lists, give preference to @list containers
      if(isList && !listContainer && entry['@container'] === '@list') {
        listContainer = true;
        terms.length = 0;
        highest = rank;
        terms.push(term);
      }
      // only push match if rank meets current threshold
      else if(rank >= highest) {
        if(rank > highest) {
          terms.length = 0;
          highest = rank;
        }
        terms.push(term);
      }
    }
  }

  // no matching terms, use @vocab if available
  if(terms.length === 0 && ctx['@vocab']) {
    // determine if vocab is a prefix of the iri
    var vocab = ctx['@vocab'];
    if(iri.indexOf(vocab) === 0) {
      // use suffix as relative iri if it is not a term in the active context
      var suffix = iri.substr(vocab.length);
      if(!(suffix in ctx.mappings)) {
        return suffix;
      }
    }
  }

  // no term matches, add possible CURIEs
  if(terms.length === 0) {
    for(var term in ctx.mappings) {
      // skip terms with colons, they can't be prefixes
      if(term.indexOf(':') !== -1) {
        continue;
      }
      // skip entries with @ids that are not partial matches
      var entry = ctx.mappings[term];
      if(entry['@id'] === iri || iri.indexOf(entry['@id']) !== 0) {
        continue;
      }

      // add CURIE as term if it has no mapping
      var curie = term + ':' + iri.substr(entry['@id'].length);
      if(!(curie in ctx.mappings)) {
        terms.push(curie);
      }
    }
  }

  // no matching terms, use iri
  if(terms.length === 0) {
    return iri;
  }

  // return shortest and lexicographically-least term
  terms.sort(_compareShortestLeast);
  return terms[0];
}

/**
 * Defines a context mapping during context processing.
 *
 * @param activeCtx the current active context.
 * @param ctx the local context being processed.
 * @param key the key in the local context to define the mapping for.
 * @param base the base IRI.
 * @param defined a map of defining/defined keys to detect cycles and prevent
 *          double definitions.
 */
function _defineContextMapping(activeCtx, ctx, key, base, defined) {
  if(key in defined) {
    // key already defined
    if(defined[key]) {
      return;
    }
    // cycle detected
    throw new JsonLdError(
      'Cyclical context definition detected.',
      'jsonld.CyclicalContext', {context: ctx, key: key});
  }

  // now defining key
  defined[key] = false;

  // if key has a prefix, define it first
  var colon = key.indexOf(':');
  var prefix = null;
  if(colon !== -1) {
    prefix = key.substr(0, colon);
    if(prefix in ctx) {
      // define parent prefix
      _defineContextMapping(activeCtx, ctx, prefix, base, defined);
    }
  }

  // get context key value
  var value = ctx[key];

  if(_isKeyword(key)) {
    // support @vocab
    if(key === '@vocab') {
      if(value !== null && !_isString(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the value of "@vocab" in a ' +
          '@context must be a string or null.',
          'jsonld.SyntaxError', {context: ctx});
      }
      if(!_isAbsoluteIri(value)) {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; the value of "@vocab" in a ' +
          '@context must be an absolute IRI.',
          'jsonld.SyntaxError', {context: ctx});
      }
      if(value === null) {
        delete activeCtx['@vocab'];
      }
      else {
        activeCtx['@vocab'] = value;
      }
      defined[key] = true;
      return;
    }

    // only @language is permitted
    if(key !== '@language') {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; keywords cannot be overridden.',
        'jsonld.SyntaxError', {context: ctx});
    }

    if(value !== null && !_isString(value)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; the value of "@language" in a ' +
        '@context must be a string or null.',
        'jsonld.SyntaxError', {context: ctx});
    }

    if(value === null) {
      delete activeCtx['@language'];
    }
    else {
      activeCtx['@language'] = value;
    }
    defined[key] = true;
    return;
  }

  // clear context entry
  if(value === null || (_isObject(value) && value['@id'] === null)) {
    if(key in activeCtx.mappings) {
      // if key is a keyword alias, remove it
      var kw = activeCtx.mappings[key]['@id'];
      if(_isKeyword(kw)) {
        var aliases = activeCtx.keywords[kw];
        aliases.splice(aliases.indexOf(key), 1);
      }
      delete activeCtx.mappings[key];
    }
    defined[key] = true;
    return;
  }

  if(_isString(value)) {
    if(_isKeyword(value)) {
      // disallow aliasing @context and @preserve
      if(value === '@context' || value === '@preserve') {
        throw new JsonLdError(
          'Invalid JSON-LD syntax; @context and @preserve cannot be aliased.',
          'jsonld.SyntaxError');
      }

      // uniquely add key as a keyword alias and resort
      var aliases = activeCtx.keywords[value];
      if(aliases.indexOf(key) === -1) {
        aliases.push(key);
        aliases.sort(_compareShortestLeast);
      }
    }
    else {
      // expand value to a full IRI
      value = _expandContextIri(activeCtx, ctx, value, base, defined);
    }

    // define/redefine key to expanded IRI/keyword
    activeCtx.mappings[key] = {'@id': value};
    defined[key] = true;
    return;
  }

  if(!_isObject(value)) {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; @context property values must be ' +
      'strings or objects.',
      'jsonld.SyntaxError', {context: ctx});
  }

  // create new mapping
  var mapping = {};

  if('@id' in value) {
    var id = value['@id'];
    if(!_isString(id)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context @id values must be strings.',
        'jsonld.SyntaxError', {context: ctx});
    }

    // expand @id if it is not @type
    if(id !== '@type') {
      // expand @id to full IRI
      id = _expandContextIri(activeCtx, ctx, id, base, defined);
    }

    // add @id to mapping
    mapping['@id'] = id;
  }
  else {
    // non-IRIs *must* define @ids
    if(prefix === null) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context terms must define an @id.',
        'jsonld.SyntaxError', {context: ctx, key: key});
    }

    // set @id based on prefix parent
    if(prefix in activeCtx.mappings) {
      var suffix = key.substr(colon + 1);
      mapping['@id'] = activeCtx.mappings[prefix]['@id'] + suffix;
    }
    // key is an absolute IRI
    else {
      mapping['@id'] = key;
    }
  }

  if('@type' in value) {
    var type = value['@type'];
    if(!_isString(type)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context @type values must be strings.',
        'jsonld.SyntaxError', {context: ctx});
    }

    if(type !== '@id') {
      // expand @type to full IRI
      type = _expandContextIri(activeCtx, ctx, type, '', defined);
    }

    // add @type to mapping
    mapping['@type'] = type;
  }

  if('@container' in value) {
    var container = value['@container'];
    if(container !== '@list' && container !== '@set') {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context @container value must be ' +
        '"@list" or "@set".',
        'jsonld.SyntaxError', {context: ctx});
    }

    // add @container to mapping
    mapping['@container'] = container;
  }

  if('@language' in value && !('@type' in value)) {
    var language = value['@language'];
    if(language !== null && !_isString(language)) {
      throw new JsonLdError(
        'Invalid JSON-LD syntax; @context @language value must be ' +
        'a string or null.',
        'jsonld.SyntaxError', {context: ctx});
    }

    // add @language to mapping
    mapping['@language'] = language;
  }

  // merge onto parent mapping if one exists for a prefix
  if(prefix !== null && prefix in activeCtx.mappings) {
    var child = mapping;
    mapping = _clone(activeCtx.mappings[prefix]);
    for(var k in child) {
      mapping[k] = child[k];
    }
  }

  // define key mapping
  activeCtx.mappings[key] = mapping;
  defined[key] = true;
}

/**
 * Expands a string value to a full IRI during context processing. It can
 * be assumed that the value is not a keyword.
 *
 * @param activeCtx the current active context.
 * @param ctx the local context being processed.
 * @param value the string value to expand.
 * @param base the base IRI.
 * @param defined a map for tracking cycles in context definitions.
 *
 * @return the expanded value.
 */
function _expandContextIri(activeCtx, ctx, value, base, defined) {
  // dependency not defined, define it
  if(value in ctx && defined[value] !== true) {
    _defineContextMapping(activeCtx, ctx, value, base, defined);
  }

  // recurse if value is a term
  if(value in activeCtx.mappings) {
    var id = activeCtx.mappings[value]['@id'];
    // value is already an absolute IRI
    if(value === id) {
      return value;
    }
    return _expandContextIri(activeCtx, ctx, id, base, defined);
  }

  // split value into prefix:suffix
  var colon = value.indexOf(':');
  if(colon !== -1) {
    var prefix = value.substr(0, colon);
    var suffix = value.substr(colon + 1);

    // a prefix of '_' indicates a blank node
    if(prefix === '_') {
      return value;
    }

    // a suffix of '//' indicates value is an absolute IRI
    if(suffix.indexOf('//') === 0) {
      return value;
    }

    // dependency not defined, define it
    if(prefix in ctx && defined[prefix] !== true) {
      _defineContextMapping(activeCtx, ctx, prefix, base, defined);
    }

    // recurse if prefix is defined
    if(prefix in activeCtx.mappings) {
      var id = activeCtx.mappings[prefix]['@id'];
      return _expandContextIri(activeCtx, ctx, id, base, defined) + suffix;
    }

    // consider value an absolute IRI
    return value;
  }

  // prepend vocab
  if(ctx['@vocab']) {
    value = _prependBase(ctx['@vocab'], value);
  }
  // prepend base
  else {
    value = _prependBase(base, value);
  }

  // value must now be an absolute IRI
  if(!_isAbsoluteIri(value)) {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; a @context value does not expand to ' +
      'an absolute IRI.',
      'jsonld.SyntaxError', {context: ctx, value: value});
  }

  return value;
}

/**
 * Expands a term into an absolute IRI. The term may be a regular term, a
 * prefix, a relative IRI, or an absolute IRI. In any case, the associated
 * absolute IRI will be returned.
 *
 * @param ctx the active context to use.
 * @param term the term to expand.
 * @param base the base IRI to use if a relative IRI is detected.
 *
 * @return the expanded term as an absolute IRI.
 */
function _expandTerm(ctx, term, base) {
  // nothing to expand
  if(term === null) {
    return null;
  }

  // the term has a mapping, so it is a plain term
  if(term in ctx.mappings) {
    var id = ctx.mappings[term]['@id'];
    // term is already an absolute IRI
    if(term === id) {
      return term;
    }
    return _expandTerm(ctx, id, base);
  }

  // split term into prefix:suffix
  var colon = term.indexOf(':');
  if(colon !== -1) {
    var prefix = term.substr(0, colon);
    var suffix = term.substr(colon + 1);

    // a prefix of '_' indicates a blank node
    if(prefix === '_') {
      return term;
    }

    // a suffix of '//' indicates value is an absolute IRI
    if(suffix.indexOf('//') === 0) {
      return term;
    }

    // the term's prefix has a mapping, so it is a CURIE
    if(prefix in ctx.mappings) {
      return _expandTerm(ctx, ctx.mappings[prefix]['@id'], base) + suffix;
    }

    // consider term an absolute IRI
    return term;
  }

  // use vocab
  if(ctx['@vocab']) {
    term = _prependBase(ctx['@vocab'], term);
  }
  // prepend base to term
  else if(!_isUndefined(base)) {
    term = _prependBase(base, term);
  }

  return term;
}

/**
 * Prepends a base IRI to the given relative IRI.
 *
 * @param base the base IRI.
 * @param iri the relative IRI.
 *
 * @return the absolute IRI.
 */
function _prependBase(base, iri) {
  if(iri === '' || iri.indexOf('#') === 0) {
    return base + iri;
  }
  else {
    // prepend last directory for base
    return base.substr(0, base.lastIndexOf('/') + 1) + iri;
  }
}

/**
 * Gets the initial context.
 *
 * @return the initial context.
 */
function _getInitialContext() {
  return {
    mappings: {},
    keywords: {
      '@context': [],
      '@container': [],
      '@default': [],
      '@embed': [],
      '@explicit': [],
      '@graph': [],
      '@id': [],
      '@language': [],
      '@list': [],
      '@omitDefault': [],
      '@preserve': [],
      '@set': [],
      '@type': [],
      '@value': [],
      '@vocab': []
    }
  };
}

/**
 * Returns whether or not the given value is a keyword (or a keyword alias).
 *
 * @param v the value to check.
 * @param [ctx] the active context to check against.
 *
 * @return true if the value is a keyword, false if not.
 */
function _isKeyword(v, ctx) {
  if(ctx) {
    if(v in ctx.keywords) {
      return true;
    }
    for(var key in ctx.keywords) {
      var aliases = ctx.keywords[key];
      if(aliases.indexOf(v) !== -1) {
        return true;
      }
    }
  }
  else {
    switch(v) {
    case '@context':
    case '@container':
    case '@default':
    case '@embed':
    case '@explicit':
    case '@graph':
    case '@id':
    case '@language':
    case '@list':
    case '@omitDefault':
    case '@preserve':
    case '@set':
    case '@type':
    case '@value':
    case '@vocab':
      return true;
    }
  }
  return false;
}

/**
 * Returns true if the given value is an Object.
 *
 * @param v the value to check.
 *
 * @return true if the value is an Object, false if not.
 */
function _isObject(v) {
  return (Object.prototype.toString.call(v) === '[object Object]');
}

/**
 * Returns true if the given value is an empty Object.
 *
 * @param v the value to check.
 *
 * @return true if the value is an empty Object, false if not.
 */
function _isEmptyObject(v) {
  return _isObject(v) && Object.keys(v).length === 0;
}

/**
 * Returns true if the given value is an Array.
 *
 * @param v the value to check.
 *
 * @return true if the value is an Array, false if not.
 */
function _isArray(v) {
  return Array.isArray(v);
}

/**
 * Throws an exception if the given value is not a valid @type value.
 *
 * @param v the value to check.
 */
function _validateTypeValue(v) {
  // must be a string, subject reference, or empty object
  if(_isString(v) || _isSubjectReference(v) || _isEmptyObject(v)) {
    return;
  }

  // must be an array
  var isValid = false;
  if(_isArray(v)) {
    // must contain only strings or subject references
    isValid = true;
    for(var i in v) {
      if(!(_isString(v[i]) || _isSubjectReference(v[i]))) {
        isValid = false;
        break;
      }
    }
  }

  if(!isValid) {
    throw new JsonLdError(
      'Invalid JSON-LD syntax; "@type" value must a string, a subject ' +
      'reference, an array of strings or subject references, or an ' +
      'empty object.', 'jsonld.SyntaxError', {value: v});
  }
}

/**
 * Returns true if the given value is a String.
 *
 * @param v the value to check.
 *
 * @return true if the value is a String, false if not.
 */
function _isString(v) {
  return (typeof v === 'string' ||
    Object.prototype.toString.call(v) === '[object String]');
}

/**
 * Returns true if the given value is a Number.
 *
 * @param v the value to check.
 *
 * @return true if the value is a Number, false if not.
 */
function _isNumber(v) {
  return (typeof v === 'number' ||
    Object.prototype.toString.call(v) === '[object Number]');
}

/**
 * Returns true if the given value is a double.
 *
 * @param v the value to check.
 *
 * @return true if the value is a double, false if not.
 */
function _isDouble(v) {
  return _isNumber(v) && String(v).indexOf('.') !== -1;
}

/**
 * Returns true if the given value is numeric.
 *
 * @param v the value to check.
 *
 * @return true if the value is numeric, false if not.
 */
function _isNumeric(v) {
  return !isNaN(parseFloat(v)) && isFinite(v);
}

/**
 * Returns true if the given value is a Boolean.
 *
 * @param v the value to check.
 *
 * @return true if the value is a Boolean, false if not.
 */
function _isBoolean(v) {
  return (typeof v === 'boolean' ||
    Object.prototype.toString.call(v) === '[object Boolean]');
}

/**
 * Returns true if the given value is undefined.
 *
 * @param v the value to check.
 *
 * @return true if the value is undefined, false if not.
 */
function _isUndefined(v) {
  return (typeof v === 'undefined');
}

/**
 * Returns true if the given value is a subject with properties.
 *
 * @param v the value to check.
 *
 * @return true if the value is a subject with properties, false if not.
 */
function _isSubject(v) {
  // Note: A value is a subject if all of these hold true:
  // 1. It is an Object.
  // 2. It is not a @value, @set, or @list.
  // 3. It has more than 1 key OR any existing key is not @id.
  var rval = false;
  if(_isObject(v) &&
    !(('@value' in v) || ('@set' in v) || ('@list' in v))) {
    var keyCount = Object.keys(v).length;
    rval = (keyCount > 1 || !('@id' in v));
  }
  return rval;
}

/**
 * Returns true if the given value is a subject reference.
 *
 * @param v the value to check.
 *
 * @return true if the value is a subject reference, false if not.
 */
function _isSubjectReference(v) {
  // Note: A value is a subject reference if all of these hold true:
  // 1. It is an Object.
  // 2. It has a single key: @id.
  return (_isObject(v) && Object.keys(v).length === 1 && ('@id' in v));
}

/**
 * Returns true if the given value is a @value.
 *
 * @param v the value to check.
 *
 * @return true if the value is a @value, false if not.
 */
function _isValue(v) {
  // Note: A value is a @value if all of these hold true:
  // 1. It is an Object.
  // 2. It has the @value property.
  return _isObject(v) && ('@value' in v);
}

/**
 * Returns true if the given value is a @list.
 *
 * @param v the value to check.
 *
 * @return true if the value is a @list, false if not.
 */
function _isList(v) {
  // Note: A value is a @list if all of these hold true:
  // 1. It is an Object.
  // 2. It has the @list property.
  return _isObject(v) && ('@list' in v);
}

/**
 * Returns true if the given value is a blank node.
 *
 * @param v the value to check.
 *
 * @return true if the value is a blank node, false if not.
 */
function _isBlankNode(v) {
  // Note: A value is a blank node if all of these hold true:
  // 1. It is an Object.
  // 2. If it has an @id key its value begins with '_:'.
  // 3. It has no keys OR is not a @value, @set, or @list.
  var rval = false;
  if(_isObject(v)) {
    if('@id' in v) {
      rval = (v['@id'].indexOf('_:') === 0);
    }
    else {
      rval = (Object.keys(v).length === 0 ||
        !(('@value' in v) || ('@set' in v) || ('@list' in v)));
    }
  }
  return rval;
}

/**
 * Returns true if the given value is an absolute IRI, false if not.
 *
 * @param v the value to check.
 *
 * @return true if the value is an absolute IRI, false if not.
 */
function _isAbsoluteIri(v) {
  return v.indexOf(':') !== -1;
}

/**
 * Clones an object, array, or string/number.
 *
 * @param value the value to clone.
 *
 * @return the cloned value.
 */
function _clone(value) {
  var rval;

  if(_isObject(value)) {
    rval = {};
    for(var key in value) {
      rval[key] = _clone(value[key]);
    }
  }
  else if(_isArray(value)) {
    rval = [];
    for(var i in value) {
      rval[i] = _clone(value[i]);
    }
  }
  else {
    rval = value;
  }

  return rval;
}

/**
 * Finds all @context URLs in the given JSON-LD input.
 *
 * @param input the JSON-LD input.
 * @param urls a map of URLs (url => false/@contexts).
 * @param replace true to replace the URLs in the given input with the
 *           @contexts from the urls map, false not to.
 *
 * @return true if new URLs to resolve were found, false if not.
 */
function _findContextUrls(input, urls, replace) {
  var count = Object.keys(urls).length;
  if(_isArray(input)) {
    for(var i in input) {
      _findContextUrls(input[i], urls, replace);
    }
    return (count < Object.keys(urls).length);
  }
  else if(_isObject(input)) {
    for(var key in input) {
      if(key !== '@context') {
        _findContextUrls(input[key], urls, replace);
        continue;
      }

      // get @context
      var ctx = input[key];

      // array @context
      if(_isArray(ctx)) {
        var length = ctx.length;
        for(var i = 0; i < length; ++i) {
          var _ctx = ctx[i];
          if(_isString(_ctx)) {
            // replace w/@context if requested
            if(replace) {
              _ctx = urls[_ctx];
              if(_isArray(_ctx)) {
                // add flattened context
                Array.prototype.splice.apply(ctx, [i, 1].concat(_ctx));
                i += _ctx.length;
                length += _ctx.length;
              }
              else {
                ctx[i] = _ctx;
              }
            }
            // @context URL found
            else if(!(_ctx in urls)) {
              urls[_ctx] = false;
            }
          }
        }
      }
      // string @context
      else if(_isString(ctx)) {
        // replace w/@context if requested
        if(replace) {
          input[key] = urls[ctx];
        }
        // @context URL found
        else if(!(ctx in urls)) {
          urls[ctx] = false;
        }
      }
    }
    return (count < Object.keys(urls).length);
  }
  return false;
}

/**
 * Resolves external @context URLs using the given URL resolver. Each
 * instance of @context in the input that refers to a URL will be replaced
 * with the JSON @context found at that URL.
 *
 * @param input the JSON-LD input with possible contexts.
 * @param resolver(url, callback(err, jsonCtx)) the URL resolver to use.
 * @param callback(err, input) called once the operation completes.
 */
function _resolveContextUrls(input, resolver, callback) {
  // if any error occurs during URL resolution, quit
  var error = null;
  var regex = /(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;

  // recursive resolver
  var resolve = function(input, cycles, resolver, callback) {
    if(Object.keys(cycles).length > MAX_CONTEXT_URLS) {
      error = new JsonLdError(
        'Maximum number of @context URLs exceeded.',
        'jsonld.ContextUrlError', {max: MAX_CONTEXT_URLS});
      return callback(error);
    }

    // for tracking the URLs to resolve
    var urls = {};

    // finished will be called once the URL queue is empty
    var finished = function() {
      // replace all URLs in the input
      _findContextUrls(input, urls, true);
      callback(null, input);
    };

    // find all URLs in the given input
    if(!_findContextUrls(input, urls, false)) {
      // no new URLs in input
      finished();
    }

    // queue all unresolved URLs
    var queue = [];
    for(var url in urls) {
      if(urls[url] === false) {
        // validate URL
        if(!regex.test(url)) {
          error = new JsonLdError(
            'Malformed URL.', 'jsonld.InvalidUrl', {url: url});
          return callback(error);
        }
        queue.push(url);
      }
    }

    // resolve URLs in queue
    var count = queue.length;
    for(var i in queue) {
      (function(url) {
        // check for context URL cycle
        if(url in cycles) {
          error = new JsonLdError(
            'Cyclical @context URLs detected.',
            'jsonld.ContextUrlError', {url: url});
          return callback(error);
        }
        var _cycles = _clone(cycles);
        _cycles[url] = true;

        resolver(url, function(err, ctx) {
          // short-circuit if there was an error with another URL
          if(error) {
            return;
          }

          // parse string context as JSON
          if(!err && _isString(ctx)) {
            try {
              ctx = JSON.parse(ctx);
            }
            catch(ex) {
              err = ex;
            }
          }

          // ensure ctx is an object
          if(err || !_isObject(ctx)) {
            err = new JsonLdError(
              'URL does not resolve to a valid JSON-LD object.',
              'jsonld.InvalidUrl', {url: url});
          }
          if(err) {
            error = err;
            return callback(error);
          }

          // use empty context if no @context key is present
          if(!('@context' in ctx)) {
            ctx = {'@context': {}};
          }

          // recurse
          resolve(ctx, _cycles, resolver, function(err, ctx) {
            if(err) {
              return callback(err);
            }
            urls[url] = ctx['@context'];
            count -= 1;
            if(count === 0) {
              finished();
            }
          });
        });
      }(queue[i]));
    }
  };
  resolve(input, {}, resolver, callback);
}

// define js 1.8.5 Object.keys method if not present
if(!Object.keys) {
  Object.keys = function(o) {
    if(o !== Object(o)) {
      throw new TypeError('Object.keys called on non-object');
    }
    var rval = [];
    for(var p in o) {
      if(Object.prototype.hasOwnProperty.call(o, p)) {
        rval.push(p);
      }
    }
    return rval;
  };
}

})();
