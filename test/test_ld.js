var LD = require('../js/ld')

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

var ctx = {
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  iri: "@id",
  type: "@type",
  Class: "rdfs:Class",
  subClassOf: {"@id": "rdfs:subClassOf", "@container": "@set"},
  label: "rdfs:label",
  "@language": "en",
  //all: {"@id": "@graph", "@container": "@id"},
  byType: {"@id": "@graph", "@container": "@type"},
  //rev: "@rev",
  //instances: {"@rev": "type"},
  subclasses: {"@rev": "subClassOf"}
}

var data = LD.connect(source, ctx)

console.log("\n## Compact usage ##")
//data.all.Class.instances.forEach(function (cls) {
//data.all.Class.via.type.forEach(function (cls) {
data.byType.Class.forEach(function (cls) {
  console.log("class: " + cls.iri)
  console.log("  label: " + cls.label)
  if (cls.subClassOf) {
    cls.subClassOf.forEach(function (sup) {
      console.log("  subClassOf: " + sup.label)
    })
  }
  if (cls.subclasses) {
    console.log("  subclasses: " + cls.subclasses.map(
      function (it) { return it.label }).join(", "))
  }
})

//data.add(cls, 'subClassOf', sup)
//data.remove(cls, 'subClassOf', sup)
//data.add(cls, '@type', 'owl:Class')

console.log("\n## Serializing ##")
console.log(JSON.stringify(data, null, 2))

