var RDF = require('../js/rdf')

var source = [
  {
    "@id": "http://example.org/vocab#Thing",
    "@type": "http://www.w3.org/2000/01/rdf-schema#Class",
    "http://www.w3.org/2000/01/rdf-schema#label": [{"@value": "Thing", "@language": "en"}]
  },
  {
    "@id": "http://example.org/vocab#Item",
    "@type": "http://www.w3.org/2000/01/rdf-schema#Class",
    "http://www.w3.org/2000/01/rdf-schema#label": [{"@value": "Item", "@language": "en"}],
    "http://www.w3.org/2000/01/rdf-schema#subClassOf": [{"@id": "http://example.org/vocab#Thing"}]
  }
]

var prefixes = {
  'rdf': "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  'rdfs': "http://www.w3.org/2000/01/rdf-schema#",
  'foaf': "http://xmlns.com/foaf/0.1/",
}

var graph = RDF.toGraph(source, prefixes)

console.log("\n## API usage ##")
//graph.get('rdfs:Class').getAll('^rdf:type').forEach(function (cls) {
graph.allByType('rdfs:Class').forEach(function (cls) {
  console.log("class: " + cls)
  console.log("  label: " + cls.get('http://www.w3.org/2000/01/rdf-schema#label'))
  cls.getAll('rdfs:subClassOf').forEach(function (sup) {
    console.log("  subClassOf: " + sup.get('rdfs:label'))
  })
  var subclasses = cls.getAll('^rdfs:subClassOf').map(
    function (it) { return it.get('rdfs:label') })
  if (subclasses.length)
    console.log("  subclasses: " + subclasses.join(", "))
})

console.log("\n## Find uses of a property ##")
graph.all().forEach(function (node) {
  if (node.get('rdfs:label'))
    console.log('<'+ node.id +'> has a label')
})

// walk triples...

