jsdom = require 'jsdom'
RDFaJSON = require "../js/rdfa-json"
path = "http://www.w3.org/2011/rdfa-context/rdfa-1.1.html"
#"http://www.w3.org/2011/rdfa-context/xhtml-rdfa-1.1"
#"http://www.w3.org/2011/rdfa-context/html-rdfa-1.1"
jsdom.env path, [], (errs, window) ->
  data = RDFaJSON.extract(window.document).data
  ctxt = {}
  for o in data['@graph']
    t = o['@type']?[0]
    if t == 'rdfa:PrefixMapping'
      ctxt[o['rdfa:prefix'][0]] = o['rdfa:uri'][0]
    else if t == 'rdfa:TermMapping'
      ctxt[o['rdfa:term'][0]] = o['rdfa:uri'][0]
  console.log(JSON.stringify(ctxt, null, 2))
