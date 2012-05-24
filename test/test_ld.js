var LD = require('../js/ld')


var source = [
  {
    "@id": "http://example.org/vocab#Thing",
    "type": {"@id": "http://www.w3.org/2000/01/rdf-schema#Class"},
    "label": [{"@value": "Thing", "@language": "en"}]
  },
  {
    "@id": "http://example.org/vocab#Item",
    "type": {"@id": "http://www.w3.org/2000/01/rdf-schema#Class"},
    "label": [{"@value": "Item", "@language": "en"}],
    "subClassOf": [{"@id": "http://example.org/vocab#Thing"}]
  }
];

var ctxt = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  Class: "http://www.w3.org/2000/01/rdf-schema#Class",
  subClassOf: "http://www.w3.org/2000/01/rdf-schema#subClassOf",
  label: "http://www.w3.org/2000/01/rdf-schema#label",
  foaf: "http://xmlns.com/foaf/0.1/",
  name: "foaf:name"
};

var nodeMap = LD.parse(source, ctxt);

console.log("\n## Compact usage ##")
nodeMap[ctxt.Class].referrersVia.type.forEach(function (cls) {
  console.log("class: " + cls)
  console.log("  label: " + cls.label[0])
  if (cls.subClassOf) {
    cls.subClassOf.forEach(function (sup) {
      console.log("  subClassOf: " + sup.label[0])
    })
  }
  if (cls.referrersVia.subClassOf) {
    console.log("  subclasses: " + cls.referrersVia.subClassOf.map(
      function (it) { return it.label[0] }).join(", "))
  }
})

console.log("\n## RDF API usage ##")
nodeMap.get('rdfs:Class').find('^rdf:type').forEach(function (cls) {
  console.log("class: " + cls)
  console.log("  label: " + cls.find('http://www.w3.org/2000/01/rdf-schema#label',0))
  //sup.$(ns.label, "en", 0)
  cls.find('rdfs:subClassOf').forEach(function (sup) {
    console.log("  subClassOf: " + sup.find('rdfs:label',0))
  })
  var subclasses = cls.find('^rdfs:subClassOf').map(
    function (it) { return it.find('rdfs:label',0) })
  if (subclasses.length)
    console.log("  subclasses: " + subclasses.join(", "))
})


console.log("\n## Serializing ##")
console.log(JSON.stringify(nodeMap/*, null, 2*/))


/** Specs... **/
// given:
var node = new LD.Node("_:123");
var ref = node.toRef();
node.prop = "avalue";
// expect:
ref.prop == "avalue"
ref.toJSON() == {"@id": "_:123"}
