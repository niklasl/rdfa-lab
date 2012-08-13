(function (exports) {

  if (typeof require === 'function') {
    LD = require("./ld");
    RDFaJSON = require("./rdfa-json");
    RDF = require("./rdf");
  }

  exports.extract = RDFaJSON.extract;
  exports.expand = LD.expand;
  exports.compact = LD.compact;
  exports.connect = LD.connect;
  exports.toGraph = RDF.toGraph;

  exports.extractExpanded = function (document) {
    return LD.expand(RDFaJSON.extract(document).data);
  };

  exports.extractCompact = function (document, context) {
    return LD.compact(RDFaJSON.extract(document).data, context);
  };

  exports.extractConnected = function (document, context) {
    return LD.connect(RDFaJSON.extract(document).data, context);
  };

  exports.extractGraph = function (document, mappings) {
    return RDF.toGraph(exports.extractExpanded(document), mappings);
  };

  exports.expandToGraph = function () {
    var args = Array.prototype.slice.call(arguments),
      last = args.length - 1;
    return RDF.toGraph(exports.expand.apply(args.slice(0, last)),
                       args[last]);
  };

})(typeof exports !== 'undefined'? exports : Lore = {});
