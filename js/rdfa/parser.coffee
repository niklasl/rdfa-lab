((exports) ->

  RDF_IRI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  RDF_XMLLiteral = RDF_IRI + 'XMLLiteral'


  extract = (doc, base) ->
    resolver = doc.createElement('a')
    resolveURI = (ref) ->
      resolver.href = ref
      return resolver.href
    state = new State(base, resolveURI)
    builder.init(state)
    walk(doc.documentElement, state)
    return builder.complete(state)

  walk = (el, state) ->
    if el.attributes.length
      subState = builder.visit(el, state)
    for child in el.childNodes
      if child.nodeType is 1
        walk(child, subState or state)


  builder =

    init: (state) ->
      state.result = []
      #top = {}
      #result.current = top
      #result.graph = [top]
      #result.context = {}

    visit: (el, state) ->
      desc = new Description(el, state)
      state.result.push(desc)
      subState = desc.getChildState()
      subState.result = desc.items = []
      delete desc.state
      return subState

    complete: (state) ->
      state.result
      #result = state.result
      #{'@context': result.context, '@graph': result.graph}


  class State
    constructor: (base=null, @resolveURI) ->
      @mappings = {base: base, lang: null, vocab: null, prefixes: {}}
      @lists = {}
      @hanging = {rels: [], revs: [], lists: []}
      @result = null

    newLocal: (base, lang, vocab, prefixes) ->
      # TODO: new State with updated members
      ctor = () ->
      ctor.prototype = this
      return new ctor


  ##
  # A representation of the interpreted description formed by the logical
  # attributes of an element. Use this to produce triples.
  class Description
    constructor: (el, parentState=null) ->
      parentState = @computeParentState(el, parentState)
      #@data =
      data = new ElementData(el, parentState)
      @state = data.state
      @tagName = data.tagName
      #@mappings = data.mappings
      @about = data.getAbout()
      @resource = data.getResource()
      @types = data.getTypes()
      @properties = data.getProperties()
      @rels = data.getRels()
      @revs = data.getRevs()
      if @properties
        @datatype = data.getDatatype()
        if @datatype is RDF_XMLLiteral
          @xml = data.getXML()
        else
          @content = data.getContent()
      if data.isInlist()
        @inlist = true

    computeParentState: (el, parentState) ->
      if typeof parentState is 'string'
        base = parentState
        parentState = null
      if parentState
        return parentState
      if not el.parentNode or el.parentNode is el
        throw "NotImplemented: computeParentState for non-root not supported"
      return new State(base)

    getChildState: ->
      @state
      #nextSubject
      #nextListMap
      #nextHangSubject, nextHangRel, nextHangRev

    getErrors: ->
      @data.errors

    getSubject: ->

    getReference: ->
      #resource else if typeof then bnode

    getValue: ->

    getLinks: ->

    getValueProperties: ->

    getListLinks: ->

    getListValueProperties: ->

    getRevLinks: ->


  ##
  # A representation of the logical data expressed by an element. This takes
  # context mappings into account, but does not interpret the # attribute
  # interplay and generation of triples.
  class ElementData
    constructor: (@el, parentState) ->
      @attrs = @el.attributes
      @tagName = @el.nodeName.toLowerCase()
      @errors = []
      @state = parentState.newLocal(
        @getBase(), @getLang(), @getVocab(), @getPrefixes())

    getBase: ->
      null # xml:base if XML-based profile

    getLang: ->
      @attrs.lang?.value

    getVocab: ->
      @attrs.vocab?.value

    getPrefixes: ->
      val = @attrs.prefix?.value
      return null unless val
      pfxs = val.replace(/^\s+|\s+$/g, "").split(/:?\s+/)
      prefixes = {}
      for i in [0...pfxs.length] by 2
        pfx = pfxs[i]
        ns = pfxs[i+1]
        prefixes[pfx] = ns
      prefixes

    getAbout: ->
      if @attrs.about? #and not parent
        next = {'@id': @state.resolveURI(@attrs.about.value)}

    getResource: ->
      if @attrs.resource?
        next = {'@id': @state.resolveURI(@attrs.resource.value)}
      else if @attrs.href?
        next = {'@id': @el.href}
      else if @attrs.src?
        next = {'@id': @state.resolveURI(@attrs.src.value)}

    getTypes: ->
      @attrs.typeof?.value.split(/\s+/)

    getProperties: ->
      predicate = @attrs.property?.value.split(/\s+/)

    getRels: ->
      @attrs.rel?.value.split(/\s+/)

    getRevs: ->
      @attrs.rev?.value.split(/\s+/)

    getContent: ->
      if @attrs.content?
        return @attrs.content.value
      else if @profile is 'html' and @tagName is 'time'
        if @attrs.datetime?
          return @attrs.datetime.value
      return @el.textContent

    getXML: ->
      @el.innerHTML

    getDatatype: ->
      if @attrs.datatype?
        return @attrs.datatype.value
      else if @profile is 'html' and @tagName is 'time'
        if value.indexOf('T') > -1
          return 'xsd:dateTime'
        else
          return 'xsd:date'
      return null

    isInlist: ->
      @attrs.inlist isnt undefined


  contexts =
    html: {
      "grddl": "http://www.w3.org/2003/g/data-view#",
      "ma": "http://www.w3.org/ns/ma-ont#",
      "owl": "http://www.w3.org/2002/07/owl#",
      "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "rdfa": "http://www.w3.org/ns/rdfa#",
      "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
      "rif": "http://www.w3.org/2007/rif#",
      "skos": "http://www.w3.org/2004/02/skos/core#",
      "skosxl": "http://www.w3.org/2008/05/skos-xl#",
      "wdr": "http://www.w3.org/2007/05/powder#",
      "void": "http://rdfs.org/ns/void#",
      "wdrs": "http://www.w3.org/2007/05/powder-s#",
      "xhv": "http://www.w3.org/1999/xhtml/vocab#",
      "xml": "http://www.w3.org/XML/1998/namespace",
      "xsd": "http://www.w3.org/2001/XMLSchema#",
      "cc": "http://creativecommons.org/ns#",
      "ctag": "http://commontag.org/ns#",
      "dc": "http://purl.org/dc/terms/",
      "dcterms": "http://purl.org/dc/terms/",
      "foaf": "http://xmlns.com/foaf/0.1/",
      "gr": "http://purl.org/goodrelations/v1#",
      "ical": "http://www.w3.org/2002/12/cal/icaltzd#",
      "og": "http://ogp.me/ns#",
      "rev": "http://purl.org/stuff/rev#",
      "sioc": "http://rdfs.org/sioc/ns#",
      "v": "http://rdf.data-vocabulary.org/#",
      "vcard": "http://www.w3.org/2006/vcard/ns#",
      "schema": "http://schema.org/",
      "describedby": "http://www.w3.org/2007/05/powder-s#describedby",
      "license": "http://www.w3.org/1999/xhtml/vocab#license",
      "role": "http://www.w3.org/1999/xhtml/vocab#role"
    }


  exports.extract = extract
  exports.Description = Description
  exports.State = State
  exports.contexts = contexts

)(exports ? RDFaParser = {})
