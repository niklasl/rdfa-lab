http = require('http')
jsdom = require('jsdom')
RDFaJSON = require "../js/rdfa/json"

http.createServer((req, res) ->
  urlElements = require('url').parse(req.url, true)
  console.log(urlElements.query)
  if (urlElements.query && urlElements.query["url"])
    url = urlElements.query.url
    console.log('load ' + url)
    jsdom.env url, [], #["../build/rdfa-all.js"],
      (errors, window) ->
        console.log('loaded ' + window)
        res.writeHead(200, {'Content-Type': 'application/ld+json'})
        data = RDFaJSON.extract(window.document, url)
        res.end(JSON.stringify(data, null, 2))
  else
    res.writeHead(200, {'Content-Type': 'text/plain'})
    res.end("RDFa-JSON Extraction, call with url parameter")
).listen(7000, '127.0.0.1')

console.log('Server running at http://127.0.0.1:7000/')
