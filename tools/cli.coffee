fs = require 'fs'
jsdom = require 'jsdom'
RDFaJSON = require "../js/rdfa-json"

path = process.argv[2]
content = fs.readFileSync(path, "utf-8")
window = jsdom.jsdom(null, null).createWindow()
window.document.innerHTML = content

data = RDFaJSON.extract(window.document, path)

s = JSON.stringify(data, null, 2).replace(
    /{\s+(\S+: "[^"]+")\s+}/gm, '{$1}').replace(
    /\[\s+(.+)\s+\]/gm, '[$1]')

console.log(s)
