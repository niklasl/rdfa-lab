jsdom = require 'jsdom'
RDFaJSON = require "../js/rdfa-json"

path = "http://www.w3.org/2011/rdfa-context/rdfa-1.1.html"
#"http://www.w3.org/2011/rdfa-context/xhtml-rdfa-1.1"
#"http://www.w3.org/2011/rdfa-context/html-rdfa-1.1"

jsdom.env path, [], (errs, window) ->
  data = RDFaJSON.extract(window.document).data
  return unless data['@context'].rdfa is "http://www.w3.org/ns/rdfa#"
  result = {}
  for o in data['@graph']
    key = (o['rdfa:prefix'] or o['rdfa:term'])?[0]
    if key
      result[key] = o['rdfa:uri'][0]
  console.log(JSON.stringify(result, null, 2))

