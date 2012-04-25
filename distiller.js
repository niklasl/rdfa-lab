// RDFa to JSON-LD Distiller in CoffeeScript.
// Accepts requests with 'url' query parameter and returns results as JSON-LD.
var http = require('http');
var jsdom = require('jsdom');
var rdfaJson = require('./js/rdfa-json');
http.createServer(function (req, res) {
  var urlElements = require('url').parse(req.url, true);
  console.log(urlElements.query);
  if (urlElements.query && urlElements.query["url"]) {
    var url = urlElements.query.url;
    console.log('process ' + url);
    jsdom.env(url, [], function(errors, window) {
      res.writeHead(200, {'Content-Type': 'application/ld+json'});
      var result = rdfaJson.extract(window.document, url).data;
      res.end(JSON.stringify(result));
    });
  } else {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end("RDFa Distiller, call with url parameter");
  }
}).listen(3000, '127.0.0.1');
console.log('Server running at http://127.0.0.1:3000/');
