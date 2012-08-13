fs = require 'fs'
jsdom = require 'jsdom'
RDFaJSON = require "../js/rdfa-json"

run = (window, base) ->
  data = RDFaJSON.extract(window.document, base)

  s = JSON.stringify(data, null, 2).replace(
      /{\s+(\S+: "[^"]+")\s+}/gm, '{$1}').replace(
      /\[\s+(.+)\s+\]/gm, '[$1]')

  console.log(s)

path = process.argv[2]

if path.match(/^https?:/)
  jsdom.env path, [], (errors, window) -> run(window, path)
else
  fs.readFile path, "utf-8", (err, content) ->
    window = jsdom.jsdom(null, null).createWindow()
    window.document.innerHTML = content
    run(window, path)

